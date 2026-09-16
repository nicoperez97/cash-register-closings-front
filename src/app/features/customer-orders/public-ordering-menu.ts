import {
  Component,
  DestroyRef,
  ElementRef,
  HostBinding,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { prettySection } from '../menu/menu-display';
import {
  CustomerOrdersApiService,
  PublicOrderingConfig,
  PublicOrderingExtra,
  PublicOrderingMenuItem,
  PublicOrderingSection,
} from './customer-orders-api.service';
import { OrderingCartService } from './ordering-cart.service';
import { DineInApiService } from './dine-in-api.service';
import { DineInSessionService } from './dine-in-session.service';
import { apiErrorMessage, onAccentColor, orderingItemImageUrl, orderingLogoUrl, orderingMoney } from './ordering-ui.util';

type View = 'menu' | 'detail';

@Component({
  selector: 'app-public-ordering-menu',
  imports: [FormsModule, RouterLink, MatSnackBarModule],
  templateUrl: './public-ordering-menu.html',
  styleUrl: './public-ordering-menu.scss',
})
export class PublicOrderingMenuComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CustomerOrdersApiService);
  private readonly cart = inject(OrderingCartService);
  private readonly dineInApi = inject(DineInApiService);
  private readonly dineIn = inject(DineInSessionService);
  private readonly snack = inject(MatSnackBar);
  private readonly title = inject(Title);
  private readonly shops = inject(ShopContextService);
  private readonly destroyRef = inject(DestroyRef);

  private observer: IntersectionObserver | null = null;
  private jumping = false;
  private readonly tabsTrack = viewChild<ElementRef<HTMLDivElement>>('tabsTrack');

  readonly canScrollLeft = signal(false);
  readonly canScrollRight = signal(false);
  readonly tabsOverflow = computed(() => this.canScrollLeft() || this.canScrollRight());

  readonly staffMode = computed(
    () => this.route.snapshot.data['staffOrdering'] === true,
  );

  readonly slug = computed(() => {
    if (this.staffMode()) {
      return String(this.shops.selectedShop()?.slug ?? '').trim();
    }
    return String(this.route.snapshot.paramMap.get('slug') ?? '').trim();
  });

  readonly cartKey = computed(() => {
    const slug = this.slug();
    return this.staffMode() ? `staff:${slug}` : slug;
  });

  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly config = signal<PublicOrderingConfig | null>(null);

  readonly view = signal<View>('menu');
  readonly item = signal<PublicOrderingMenuItem | null>(null);
  readonly qty = signal(1);
  readonly notes = signal('');
  readonly selectedExtraIds = signal<string[]>([]);
  readonly removedIngredientIds = signal<string[]>([]);
  readonly addedFlash = signal(false);
  readonly activeSectionId = signal('');

  readonly shop = computed(() => this.config()?.shop ?? null);
  readonly accent = computed(() => this.shop()?.accentColor?.trim() || '#2e7d32');
  readonly onAccent = computed(() => onAccentColor(this.accent()));
  readonly logoUrl = computed(() => orderingLogoUrl(this.shop()?.logoUrl, this.shop()?.id));
  readonly canOrder = computed(() => {
    const c = this.config();
    if (!c) return false;
    if (this.staffMode()) return c.takeawayEnabled || c.deliveryEnabled;
    return !!(c.takeawayOpen || c.deliveryOpen);
  });

  /** Pedido en mesa del cliente deshabilitado: /pedir es solo take away/delivery. */
  readonly dineInMode = computed(() => false);
  readonly dineInTableLabel = computed(() => null as string | null);
  readonly dineInCovers = computed(() => null as number | null);

  @HostBinding('style.--accent')
  get hostAccent(): string {
    return this.accent();
  }

  @HostBinding('style.--on-accent')
  get hostOnAccent(): string {
    return this.onAccent();
  }

  @HostBinding('class.staff-ordering')
  get hostStaff(): boolean {
    return this.staffMode();
  }

  readonly sections = computed(() => {
    const menus = this.config()?.menus ?? [];
    const out: PublicOrderingSection[] = [];
    for (const m of menus) {
      for (const sec of m.sections ?? []) {
        const items = (sec.items ?? []).filter((it) => it?.id && it.name && it.price != null);
        if (!items.length) continue;
        const name =
          menus.length > 1 && m.title
            ? `${prettySection(sec.name)} · ${m.title}`
            : prettySection(sec.name);
        out.push({ name, items });
      }
    }
    return out;
  });

  readonly cartCount = computed(() => this.cart.count());
  readonly cartSubtotal = computed(() => this.cart.subtotal());

  readonly itemExtras = computed((): PublicOrderingExtra[] => {
    const it = this.item();
    const extras = this.config()?.extras ?? [];
    if (!it) return [];
    return extras.filter((e) => {
      const ids = e.menuItemIds ?? [];
      return !ids.length || ids.includes(it.id);
    });
  });

  constructor() {
    effect(() => {
      const ready = !this.loading() && this.view() === 'menu' && this.sections().length > 0;
      if (!ready) {
        this.observer?.disconnect();
        return;
      }
      queueMicrotask(() => this.watchSections());
    });

    effect(() => {
      this.sections();
      this.view();
      this.loading();
      queueMicrotask(() => this.syncTabsOverflow());
    });

    const onResize = () => this.syncTabsOverflow();
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => {
      this.observer?.disconnect();
      window.removeEventListener('resize', onResize);
    });
  }

  itemPhoto(it: PublicOrderingMenuItem): string | null {
    return orderingItemImageUrl(this.slug(), it);
  }

  sectionDomId(index: number): string {
    return `ord-sec-${index}`;
  }

  ngOnInit(): void {
    applyStatusBar('#eef1ee', 'light');
    this.cart.bindSlug(this.cartKey());
    if (!this.staffMode()) {
      this.dineIn.bindSlug(this.slug());
      this.dineIn.clear();
    }
    if (this.staffMode()) this.cart.clear();
    this.load();
  }

  ngOnDestroy(): void {
    resetStatusBar();
  }

  load(): void {
    const slug = this.slug();
    if (!slug) {
      this.loading.set(false);
      this.error.set(this.staffMode() ? 'Seleccioná un local' : 'Local no encontrado');
      return;
    }
    this.cart.bindSlug(this.cartKey());
    this.loading.set(true);
    this.error.set(null);
    this.api.getPublicOrdering(slug).subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.loading.set(false);
        this.title.setTitle(
          this.staffMode()
            ? `Mostrador · ${cfg.shop?.name ?? slug}`
            : `Menú · ${cfg.shop?.name ?? slug}`,
        );
        this.syncCartWithCatalog(cfg);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'No pudimos cargar el menú.'));
      },
    });
  }

  private syncCartWithCatalog(cfg: PublicOrderingConfig): void {
    const itemIds = new Set<string>();
    const itemPrices: Record<string, { unitPrice: number; name?: string }> = {};
    for (const m of cfg.menus ?? []) {
      for (const sec of m.sections ?? []) {
        for (const it of sec.items ?? []) {
          if (it?.id) {
            itemIds.add(String(it.id));
            itemPrices[String(it.id)] = {
              unitPrice: Number(it.price) || 0,
              name: it.name,
            };
          }
        }
      }
    }
    const extraIds = new Set((cfg.extras ?? []).map((e) => String(e.id)));
    const extraPrices: Record<string, { unitPrice: number; name?: string }> = {};
    for (const e of cfg.extras ?? []) {
      if (e?.id) {
        extraPrices[String(e.id)] = { unitPrice: Number(e.price) || 0, name: e.name };
      }
    }
    const { removedQty, priceChanged } = this.cart.reconcileAvailable({
      itemIds,
      extraIds,
      itemPrices,
      extraPrices,
    });
    if (removedQty > 0) {
      this.snack.open(
        removedQty === 1
          ? 'Sacamos 1 ítem del pedido porque ya no está disponible'
          : `Sacamos ${removedQty} ítems del pedido porque ya no están disponibles`,
        'OK',
        { duration: 4000 },
      );
    } else if (priceChanged) {
      this.snack.open('Actualizamos los precios del pedido con la carta vigente', 'OK', {
        duration: 3500,
      });
    }
  }

  private watchSections(): void {
    this.observer?.disconnect();
    if (this.view() !== 'menu') return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-sec]'));
    if (!nodes.length) return;
    if (!this.activeSectionId()) {
      this.activeSectionId.set(nodes[0].dataset['sec'] || this.sectionDomId(0));
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (this.jumping) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = (visible[0]?.target as HTMLElement | undefined)?.dataset['sec'];
        if (id) {
          this.activeSectionId.set(id);
          this.scrollActiveTabIntoView(id);
        }
      },
      { rootMargin: '-22% 0px -62% 0px', threshold: [0.05, 0.25, 0.5] },
    );
    for (const node of nodes) this.observer.observe(node);
  }

  private scrollActiveTabIntoView(id: string): void {
    const btn = document.querySelector<HTMLElement>(`.sec-tabs__btn[data-sec="${id}"]`);
    btn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    window.setTimeout(() => this.syncTabsOverflow(), 320);
  }

  onTabsScroll(): void {
    this.syncTabsOverflow();
  }

  scrollTabs(dir: -1 | 1): void {
    const el = this.tabsTrack()?.nativeElement;
    if (!el) return;
    const step = Math.max(160, Math.round(el.clientWidth * 0.65));
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
    window.setTimeout(() => this.syncTabsOverflow(), 280);
  }

  private syncTabsOverflow(): void {
    const el = this.tabsTrack()?.nativeElement;
    if (!el) {
      this.canScrollLeft.set(false);
      this.canScrollRight.set(false);
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    const overflow = max > 4;
    this.canScrollLeft.set(overflow && el.scrollLeft > 2);
    this.canScrollRight.set(overflow && el.scrollLeft < max - 2);
  }

  scrollToSection(index: number): void {
    const id = this.sectionDomId(index);
    this.jumping = true;
    this.activeSectionId.set(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.scrollActiveTabIntoView(id);
    window.setTimeout(() => {
      this.jumping = false;
    }, 550);
  }

  priceOf(item: PublicOrderingMenuItem): string {
    const label = String(item.priceLabel ?? '').trim();
    if (label) return label;
    return orderingMoney(item.price);
  }

  openItem(item: PublicOrderingMenuItem): void {
    const stillThere = (this.config()?.menus ?? []).some((m) =>
      (m.sections ?? []).some((sec) => (sec.items ?? []).some((it) => it.id === item.id)),
    );
    if (!stillThere) {
      this.snack.open('Ese ítem ya no está disponible', 'OK', { duration: 2500 });
      this.load();
      return;
    }
    this.item.set(item);
    this.qty.set(1);
    this.notes.set('');
    this.selectedExtraIds.set([]);
    this.removedIngredientIds.set([]);
    this.view.set('detail');
  }

  toggleExtra(extraId: string): void {
    this.selectedExtraIds.update((ids) =>
      ids.includes(extraId) ? ids.filter((x) => x !== extraId) : [...ids, extraId],
    );
  }

  isExtraSelected(extraId: string): boolean {
    return this.selectedExtraIds().includes(extraId);
  }

  toggleRemovedIngredient(name: string): void {
    this.removedIngredientIds.update((list) =>
      list.includes(name) ? list.filter((x) => x !== name) : [...list, name],
    );
  }

  isIngredientRemoved(name: string): boolean {
    return this.removedIngredientIds().includes(name);
  }

  back(): void {
    const v = this.view();
    if (v === 'detail') {
      this.item.set(null);
      this.selectedExtraIds.set([]);
      this.removedIngredientIds.set([]);
      this.view.set('menu');
      return;
    }
    if (this.staffMode()) {
      this.cart.clear();
      void this.router.navigate(['/customer-orders']);
      return;
    }
    if (this.dineInMode()) {
      void this.router.navigate(['/pedir', this.slug(), 'mesa']);
      return;
    }
    void this.router.navigate(['/pedir', this.slug()]);
  }

  bumpQty(delta: number): void {
    this.qty.update((q) => Math.max(1, Math.min(99, q + delta)));
  }

  addToCart(): void {
    const it = this.item();
    if (!it || !this.canOrder()) return;
    const stillThere = (this.config()?.menus ?? []).some((m) =>
      (m.sections ?? []).some((sec) => (sec.items ?? []).some((x) => x.id === it.id)),
    );
    if (!stillThere) {
      this.snack.open('Ese ítem ya no está disponible', 'OK', { duration: 2500 });
      this.load();
      return;
    }
    const removed = this.removedIngredientIds().filter((name) =>
      (it.removableIngredients ?? []).includes(name),
    );
    this.cart.add({
      kind: 'ITEM',
      menuItemId: it.id,
      name: it.name,
      unitPrice: Number(it.price) || 0,
      qty: this.qty(),
      notes: this.notes().trim(),
      removedIngredients: removed,
    });
    const extras = this.itemExtras();
    for (const id of this.selectedExtraIds()) {
      const ex = extras.find((e) => e.id === id);
      if (!ex) continue;
      this.cart.add({
        kind: 'EXTRA',
        menuItemId: it.id,
        name: ex.name,
        unitPrice: Number(ex.price) || 0,
        qty: this.qty(),
        notes: '',
        extraId: ex.id,
        attachedToMenuItemId: it.id,
      });
    }
    this.addedFlash.set(true);
    setTimeout(() => this.addedFlash.set(false), 900);
    this.item.set(null);
    this.selectedExtraIds.set([]);
    this.removedIngredientIds.set([]);
    this.view.set('menu');
  }

  goCheckout(): void {
    if (!this.cartCount()) return;
    if (this.staffMode()) {
      void this.router.navigate(['/customer-orders/nuevo/checkout']);
      return;
    }
    if (this.dineInMode()) {
      this.sendDineInOrder();
      return;
    }
    void this.router.navigate(['/pedir', this.slug(), 'checkout']);
  }

  private sendDineInOrder(): void {
    const slug = this.slug();
    const token = this.dineIn.token();
    if (!slug || !token || this.sending()) return;
    const lines = this.cart.lines();
    const items = lines
      .filter((l) => l.kind !== 'EXTRA')
      .map((l) => ({
        menuItemId: l.menuItemId,
        qty: l.qty,
        notes: l.notes || null,
        removedIngredients: l.removedIngredients?.length ? l.removedIngredients : undefined,
      }));
    const extras = lines
      .filter((l) => l.kind === 'EXTRA' && l.extraId)
      .map((l) => ({
        extraId: String(l.extraId),
        qty: l.qty,
        attachedToMenuItemId: l.attachedToMenuItemId ?? null,
      }));
    if (!items.length) {
      this.snack.open('Agregá al menos un plato', 'OK', { duration: 2500 });
      return;
    }
    this.sending.set(true);
    this.dineInApi
      .createOrder(slug, token, {
        items,
        extras: extras.length ? extras : undefined,
        printKitchen: true,
      })
      .subscribe({
        next: () => {
          this.sending.set(false);
          this.cart.clear();
          this.snack.open('Pedido enviado a cocina', 'OK', { duration: 2800 });
          void this.router.navigate(['/pedir', slug, 'mesa']);
        },
        error: (err) => {
          this.sending.set(false);
          this.snack.open(apiErrorMessage(err, 'No se pudo enviar el pedido'), 'OK', {
            duration: 4000,
          });
        },
      });
  }

  money(n: number): string {
    return orderingMoney(n);
  }

  onLogoError(): void {
    const c = this.config();
    if (!c) return;
    this.config.set({ ...c, shop: { ...c.shop, logoUrl: null } });
  }
}
