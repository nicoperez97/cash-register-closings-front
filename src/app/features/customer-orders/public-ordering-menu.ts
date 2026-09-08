import { Component, HostBinding, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
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
  imports: [FormsModule, RouterLink],
  templateUrl: './public-ordering-menu.html',
  styleUrl: './public-ordering-menu.scss',
})
export class PublicOrderingMenuComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CustomerOrdersApiService);
  private readonly cart = inject(OrderingCartService);
  private readonly title = inject(Title);

  readonly slug = computed(() => String(this.route.snapshot.paramMap.get('slug') ?? '').trim());
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly config = signal<PublicOrderingConfig | null>(null);

  readonly view = signal<View>('categories');
  readonly section = signal<PublicOrderingSection | null>(null);
  readonly item = signal<PublicOrderingMenuItem | null>(null);
  readonly qty = signal(1);
  readonly notes = signal('');
  readonly selectedExtraIds = signal<string[]>([]);
  readonly addedFlash = signal(false);

  readonly shop = computed(() => this.config()?.shop ?? null);
  readonly accent = computed(() => this.shop()?.accentColor?.trim() || '#2e7d32');
  readonly onAccent = computed(() => onAccentColor(this.accent()));
  readonly logoUrl = computed(() => orderingLogoUrl(this.shop()?.logoUrl, this.shop()?.id));
  readonly canOrder = computed(() => !!this.config()?.anyChannelOpen);

  @HostBinding('style.--accent')
  get hostAccent(): string {
    return this.accent();
  }

  @HostBinding('style.--on-accent')
  get hostOnAccent(): string {
    return this.onAccent();
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
    const slug = this.slug();
    this.cart.bindSlug(slug);
    this.load();
  }

  ngOnDestroy(): void {
    resetStatusBar();
  }

  load(): void {
    const slug = this.slug();
    if (!slug) {
      this.loading.set(false);
      this.error.set('Local no encontrado');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api.getPublicOrdering(slug).subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.loading.set(false);
        this.title.setTitle(`Menú · ${cfg.shop?.name ?? slug}`);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'No pudimos cargar el menú.'));
      },
    });
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
    this.item.set(item);
    this.qty.set(1);
    this.notes.set('');
    this.selectedExtraIds.set([]);
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

  back(): void {
    const v = this.view();
    if (v === 'detail') {
      this.item.set(null);
      this.selectedExtraIds.set([]);
      this.view.set('items');
      return;
    }
    if (v === 'items') {
      this.section.set(null);
      this.view.set('categories');
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
    this.cart.add({
      kind: 'ITEM',
      menuItemId: it.id,
      name: it.name,
      unitPrice: Number(it.price) || 0,
      qty: this.qty(),
      notes: this.notes().trim(),
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
    this.view.set('items');
  }

  goCheckout(): void {
    if (!this.cartCount()) return;
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
