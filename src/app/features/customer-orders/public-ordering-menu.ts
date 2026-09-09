import { Component, HostBinding, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
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
import { apiErrorMessage, onAccentColor, orderingItemImageUrl, orderingLogoUrl, orderingMoney } from './ordering-ui.util';

type View = 'categories' | 'items' | 'detail';

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
  private readonly snack = inject(MatSnackBar);
  private readonly title = inject(Title);
  private readonly shops = inject(ShopContextService);

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
  readonly error = signal<string | null>(null);
  readonly config = signal<PublicOrderingConfig | null>(null);

  readonly view = signal<View>('categories');
  readonly section = signal<PublicOrderingSection | null>(null);
  readonly item = signal<PublicOrderingMenuItem | null>(null);
  readonly qty = signal(1);
  readonly notes = signal('');
  readonly selectedExtraIds = signal<string[]>([]);
  readonly removedIngredientIds = signal<string[]>([]);
  readonly addedFlash = signal(false);

  readonly shop = computed(() => this.config()?.shop ?? null);
  readonly accent = computed(() => this.shop()?.accentColor?.trim() || '#2e7d32');
  readonly onAccent = computed(() => onAccentColor(this.accent()));
  readonly logoUrl = computed(() => orderingLogoUrl(this.shop()?.logoUrl, this.shop()?.id));
  readonly canOrder = computed(() => {
    const c = this.config();
    if (!c) return false;
    if (this.staffMode()) return c.takeawayEnabled || c.deliveryEnabled;
    return !!c.anyChannelOpen;
  });

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

  itemPhoto(it: PublicOrderingMenuItem): string | null {
    return orderingItemImageUrl(this.slug(), it);
  }

  ngOnInit(): void {
    applyStatusBar('#eef1ee', 'light');
    this.cart.bindSlug(this.cartKey());
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
    for (const m of cfg.menus ?? []) {
      for (const sec of m.sections ?? []) {
        for (const it of sec.items ?? []) {
          if (it?.id) itemIds.add(String(it.id));
        }
      }
    }
    const extraIds = new Set((cfg.extras ?? []).map((e) => String(e.id)));
    const removedQty = this.cart.reconcileAvailable({ itemIds, extraIds });
    if (removedQty > 0) {
      this.snack.open(
        removedQty === 1
          ? 'Sacamos 1 ítem del pedido porque ya no está disponible'
          : `Sacamos ${removedQty} ítems del pedido porque ya no están disponibles`,
        'OK',
        { duration: 4000 },
      );
    }
  }

  priceOf(item: PublicOrderingMenuItem): string {
    const label = String(item.priceLabel ?? '').trim();
    if (label) return label;
    return orderingMoney(item.price);
  }

  sectionPreview(sec: PublicOrderingSection): string {
    const names = (sec.items ?? [])
      .map((it) => String(it?.name ?? '').trim())
      .filter(Boolean);
    if (!names.length) return 'Sin platos disponibles';
    const shown = names.slice(0, 3);
    const extra = names.length - shown.length;
    const list = shown.join(', ');
    return extra > 0 ? `${list} y ${extra} más` : list;
  }

  openSection(sec: PublicOrderingSection): void {
    this.section.set(sec);
    this.view.set('items');
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
      this.view.set('items');
      return;
    }
    if (v === 'items') {
      this.section.set(null);
      this.view.set('categories');
      return;
    }
    if (this.staffMode()) {
      this.cart.clear();
      void this.router.navigate(['/customer-orders']);
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
    this.view.set('items');
  }

  goCheckout(): void {
    if (!this.cartCount()) return;
    if (this.staffMode()) {
      void this.router.navigate(['/customer-orders/nuevo/checkout']);
      return;
    }
    void this.router.navigate(['/pedir', this.slug(), 'checkout']);
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
