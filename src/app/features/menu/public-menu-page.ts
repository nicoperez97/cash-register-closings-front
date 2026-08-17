import { Component, OnInit, afterNextRender, computed, inject, signal, DestroyRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toDataURL } from 'qrcode';
import { environment } from '../../../environments/environment';
import { normalizeLogoUrl, resolveShopLogoSrc } from '../../core/utils/drive-url';

type PublicShop = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  phone?: string | null;
  instagramHandle?: string | null;
};

type MenuItem = {
  name: string;
  description?: string | null;
  price?: number | null;
  priceLabel?: string | null;
};

type MenuSection = {
  name: string;
  items: MenuItem[];
};

type ShopMenu = {
  id?: string;
  slug?: string;
  title?: string | null;
  note?: string | null;
  sections: MenuSection[];
};

type MenuSummary = {
  slug: string;
  title: string;
};

type FilterId = 'all' | 'veggie' | 'dessert' | 'combo' | 'drinks';

type FilterOpt = { id: FilterId; label: string };

@Component({
  selector: 'app-public-menu-page',
  imports: [RouterLink, FormsModule],
  template: `
    @if (error()) {
      <div class="menu menu--error" [style.--accent]="accent()">
        <p>{{ error() }}</p>
        <button type="button" class="menu__btn" (click)="load()">Reintentar</button>
      </div>
    } @else if (shop(); as s) {
      <div class="menu" [style.--accent]="accent()">
        <header class="menu__hero">
          <div class="menu__glow" aria-hidden="true"></div>
          @if (logoUrl()) {
            <img class="menu__logo" [src]="logoUrl()!" [alt]="s.name" />
          }
          <p class="menu__eyebrow">Carta</p>
          <h1>{{ s.name }}</h1>
          @if (s.instagramHandle || s.phone) {
            <p class="menu__contact">
              @if (s.instagramHandle) {
                <a
                  [href]="'https://instagram.com/' + s.instagramHandle"
                  target="_blank"
                  rel="noopener"
                >@{{ s.instagramHandle }}</a>
              }
              @if (s.phone) {
                <a [href]="'tel:' + s.phone">{{ s.phone }}</a>
              }
            </p>
          }
          <div class="menu__hero-actions">
            <button type="button" class="menu__btn menu__btn--ghost" (click)="openQr()">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm12-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v6h-2v-2h-2v-2h2v-2zm-4 4h2v2h-2v-2z"
                />
              </svg>
              Ver QR
            </button>
          </div>
        </header>

        @if (qrOpen()) {
          <div class="menu__qr-mask" (click)="closeQr()">
            <div class="menu__qr-card" (click)="$event.stopPropagation()" role="dialog" aria-label="QR de la carta">
              <p class="menu__qr-title">Escaneá para abrir la carta</p>
              <p class="menu__qr-shop">{{ s.name }}</p>
              @if (qrSrc(); as src) {
                <img class="menu__qr-img" [src]="src" alt="Código QR de la carta" />
              } @else {
                <p class="menu__qr-wait">Armando el código…</p>
              }
              <div class="menu__qr-actions">
                <button type="button" class="menu__btn menu__btn--light" (click)="downloadQr()">Descargar</button>
                <button type="button" class="menu__btn menu__btn--light" (click)="closeQr()">Cerrar</button>
              </div>
            </div>
          </div>
        }

        @if (menus().length > 1) {
          <nav class="menu__books" aria-label="Cartas">
            @for (m of menus(); track m.slug) {
              <a
                class="menu__book"
                [class.menu__book--on]="m.slug === currentSlug()"
                [routerLink]="['/m', s.slug, m.slug]"
              >
                {{ m.title }}
              </a>
            }
          </nav>
        }

        <div class="menu__dock">
          <label class="menu__search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14"
              />
            </svg>
            <input
              type="search"
              placeholder="Buscar un plato, vino, ingrediente…"
              [ngModel]="query()"
              (ngModelChange)="onQuery($event)"
              autocomplete="off"
            />
            @if (query()) {
              <button type="button" class="menu__search-clear" (click)="onQuery('')" aria-label="Limpiar búsqueda">
                ×
              </button>
            }
          </label>

          @if (filterOpts().length > 1) {
            <div class="menu__filters" role="tablist" aria-label="Filtros">
              @for (opt of filterOpts(); track opt.id) {
                <button
                  type="button"
                  class="menu__chip"
                  [class.menu__chip--on]="filter() === opt.id"
                  (click)="setFilter(opt.id)"
                >
                  {{ opt.label }}
                </button>
              }
            </div>
          }

          @if (visibleSections().length > 1 && !query()) {
            <nav class="menu__cats" aria-label="Categorías">
              @for (sec of visibleSections(); track sec.id) {
                <button
                  type="button"
                  class="menu__cat"
                  [class.menu__cat--on]="activeSection() === sec.id"
                  (click)="scrollTo(sec.id)"
                >
                  {{ sec.label }}
                </button>
              }
            </nav>
          }
        </div>

        @if (query() || filter() !== 'all') {
          <p class="menu__count">
            {{ resultCount() }} resultado{{ resultCount() === 1 ? '' : 's' }}
            @if (query()) {
              <span> para “{{ query() }}”</span>
            }
          </p>
        }

        @for (section of visibleSections(); track section.id) {
          <section class="menu__section" [id]="section.id" [attr.data-sec]="section.id">
            <div class="menu__section-head">
              <h2>{{ section.label }}</h2>
              <span>{{ section.items.length }}</span>
            </div>
            <ul>
              @for (item of section.items; track $index) {
                <li class="menu__item">
                  <div class="menu__row">
                    <span class="menu__name">{{ item.name }}</span>
                    @if (priceOf(item); as price) {
                      <span class="menu__price">{{ price }}</span>
                    }
                  </div>
                  @if (item.description) {
                    <p class="menu__desc">{{ item.description }}</p>
                  }
                </li>
              }
            </ul>
          </section>
        } @empty {
          <p class="menu__empty">No encontramos eso en la carta. Probá con otra palabra.</p>
        }

        @if (data()?.menu?.note) {
          <p class="menu__note">{{ data()?.menu?.note }}</p>
        }
      </div>
    } @else {
      <div class="menu menu--error">
        <p>Cargando carta…</p>
      </div>
    }
  `,
  styles: [
    `
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650;9..144,700&family=Outfit:wght@400;500;600;700&display=swap');

      :host {
        display: block;
        min-height: 100dvh;
        font-family: Outfit, 'Segoe UI', sans-serif;
      }
      .menu {
        --accent: #2e7d32;
        --paper: #f4efe6;
        --muted: #b8aea2;
        min-height: 100dvh;
        padding: calc(1.1rem + env(safe-area-inset-top, 0px)) 1.1rem
          calc(2rem + env(safe-area-inset-bottom, 0px));
        color: var(--paper);
        background:
          radial-gradient(
            ellipse 90% 42% at 50% -8%,
            color-mix(in srgb, var(--accent) 28%, transparent),
            transparent 68%
          ),
          linear-gradient(168deg, #171310 0%, #0c0a09 48%, #14110f 100%);
      }
      .menu--error {
        display: grid;
        place-items: center;
        gap: 1rem;
        text-align: center;
        color: var(--muted);
      }
      .menu__hero {
        position: relative;
        text-align: center;
        max-width: 40rem;
        margin: 0 auto 1.15rem;
      }
      .menu__glow {
        position: absolute;
        inset: -1.2rem 8% auto;
        height: 7rem;
        background: radial-gradient(circle, color-mix(in srgb, var(--accent) 38%, transparent), transparent 70%);
        pointer-events: none;
      }
      .menu__logo {
        position: relative;
        width: 5.1rem;
        height: 5.1rem;
        object-fit: contain;
        border-radius: 1.15rem;
        background: #fff;
        padding: 0.28rem;
        margin-bottom: 0.7rem;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
      }
      .menu__eyebrow {
        margin: 0;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        font-size: 0.68rem;
        font-weight: 650;
        color: color-mix(in srgb, var(--accent) 78%, #f6e7c8);
      }
      .menu h1 {
        margin: 0.2rem 0 0;
        font-family: Fraunces, Georgia, serif;
        font-size: clamp(1.85rem, 6vw, 2.45rem);
        font-weight: 650;
        letter-spacing: -0.02em;
      }
      .menu__contact {
        margin: 0.45rem 0 0;
        display: flex;
        justify-content: center;
        gap: 0.9rem;
        font-size: 0.88rem;
      }
      .menu__contact a {
        color: var(--muted);
        text-decoration: none;
      }
      .menu__hero-actions {
        margin-top: 0.9rem;
      }
      .menu__btn {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        border: 1px solid color-mix(in srgb, var(--accent) 45%, #3a332c);
        background: color-mix(in srgb, var(--accent) 18%, #1c1815);
        color: var(--paper);
        border-radius: 999px;
        padding: 0.5rem 1rem;
        font: inherit;
        font-weight: 650;
        font-size: 0.88rem;
        cursor: pointer;
      }
      .menu__btn svg {
        width: 1.12rem;
        height: 1.12rem;
      }
      .menu__btn--ghost {
        background: color-mix(in srgb, #fff 6%, transparent);
      }
      .menu__btn--light {
        color: #1a1512;
        background: #fff;
        border-color: #d7cfc4;
      }
      .menu__books {
        display: flex;
        justify-content: center;
        gap: 0.4rem;
        max-width: 40rem;
        margin: 0 auto 0.85rem;
      }
      .menu__book {
        text-decoration: none;
        color: var(--paper);
        border: 1px solid color-mix(in srgb, var(--accent) 35%, #3a332c);
        background: color-mix(in srgb, #fff 5%, transparent);
        border-radius: 999px;
        padding: 0.48rem 1.05rem;
        font-weight: 650;
        font-size: 0.9rem;
      }
      .menu__book--on {
        background: color-mix(in srgb, var(--accent) 72%, #1c1815);
        border-color: color-mix(in srgb, var(--accent) 85%, #fff);
      }
      .menu__dock {
        position: sticky;
        top: 0;
        z-index: 8;
        max-width: 40rem;
        margin: 0 auto 1rem;
        padding: 0.55rem 0 0.65rem;
        background: linear-gradient(180deg, #0c0a09 70%, color-mix(in srgb, #0c0a09 0%, transparent));
      }
      .menu__search {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.55rem 0.8rem;
        border-radius: 14px;
        background: color-mix(in srgb, #fff 7%, #161310);
        border: 1px solid color-mix(in srgb, var(--accent) 22%, #3a332c);
      }
      .menu__search svg {
        width: 1.2rem;
        height: 1.2rem;
        flex-shrink: 0;
        color: var(--muted);
      }
      .menu__search input {
        flex: 1;
        min-width: 0;
        border: 0;
        background: transparent;
        color: var(--paper);
        font: inherit;
        font-size: 0.95rem;
        outline: none;
      }
      .menu__search input::placeholder {
        color: #8d8478;
      }
      .menu__search-clear {
        border: 0;
        background: transparent;
        color: var(--muted);
        font-size: 1.3rem;
        line-height: 1;
        cursor: pointer;
      }
      .menu__filters,
      .menu__cats {
        display: flex;
        gap: 0.4rem;
        overflow-x: auto;
        scrollbar-width: none;
        padding: 0.55rem 0 0.1rem;
        -webkit-overflow-scrolling: touch;
      }
      .menu__filters::-webkit-scrollbar,
      .menu__cats::-webkit-scrollbar {
        display: none;
      }
      .menu__chip,
      .menu__cat {
        flex-shrink: 0;
        border: 1px solid color-mix(in srgb, #fff 12%, #3a332c);
        background: color-mix(in srgb, #fff 5%, transparent);
        color: var(--paper);
        border-radius: 999px;
        padding: 0.38rem 0.8rem;
        font: inherit;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
      }
      .menu__chip--on,
      .menu__cat--on {
        background: color-mix(in srgb, var(--accent) 70%, #1c1815);
        border-color: color-mix(in srgb, var(--accent) 80%, #fff);
      }
      .menu__count,
      .menu__empty {
        max-width: 40rem;
        margin: 0 auto 0.9rem;
        text-align: center;
        color: var(--muted);
        font-size: 0.86rem;
      }
      .menu__section {
        max-width: 40rem;
        margin: 0 auto 1.55rem;
        scroll-margin-top: 8.5rem;
      }
      .menu__section-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.75rem;
        padding-bottom: 0.45rem;
        border-bottom: 1px solid color-mix(in srgb, var(--accent) 32%, #3a332c);
      }
      .menu__section-head h2 {
        margin: 0;
        font-family: Fraunces, Georgia, serif;
        font-size: 1.35rem;
        font-weight: 650;
        letter-spacing: -0.01em;
        text-transform: none;
        color: #f6e7c8;
      }
      .menu__section-head span {
        font-size: 0.75rem;
        color: var(--muted);
      }
      .menu__section ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.55rem;
      }
      .menu__item {
        padding: 0.7rem 0.85rem 0.75rem;
        border-radius: 14px;
        background: color-mix(in srgb, #fff 5.5%, transparent);
        border: 1px solid color-mix(in srgb, #fff 8%, #2a2420);
      }
      .menu__row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .menu__name {
        font-weight: 650;
        font-size: 0.98rem;
        line-height: 1.3;
      }
      .menu__price {
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        font-size: 0.86rem;
        color: #f6e7c8;
        background: color-mix(in srgb, var(--accent) 22%, transparent);
        border-radius: 999px;
        padding: 0.18rem 0.55rem;
        white-space: nowrap;
      }
      .menu__desc {
        margin: 0.28rem 0 0;
        font-size: 0.82rem;
        line-height: 1.4;
        color: var(--muted);
      }
      .menu__note {
        max-width: 40rem;
        margin: 1.5rem auto 0;
        text-align: center;
        font-size: 0.8rem;
        line-height: 1.45;
        color: #9d9488;
      }
      .menu__qr-mask {
        position: fixed;
        inset: 0;
        z-index: 40;
        display: grid;
        place-items: center;
        padding: 1.25rem;
        background: rgba(8, 6, 5, 0.72);
        backdrop-filter: blur(8px);
      }
      .menu__qr-card {
        width: min(100%, 22rem);
        display: grid;
        justify-items: center;
        gap: 0.45rem;
        padding: 1.25rem 1.1rem 1.15rem;
        border-radius: 1.25rem;
        background: #f7f1e8;
        color: #1a1512;
        box-shadow: 0 24px 50px rgba(0, 0, 0, 0.45);
      }
      .menu__qr-title {
        margin: 0;
        font-family: Fraunces, Georgia, serif;
        font-weight: 650;
        font-size: 1.15rem;
        text-align: center;
      }
      .menu__qr-shop {
        margin: 0 0 0.35rem;
        color: #5c534a;
        font-size: 0.88rem;
      }
      .menu__qr-img {
        width: min(100%, 16rem);
        height: auto;
        background: #fff;
        border-radius: 12px;
      }
      .menu__qr-wait {
        margin: 1rem 0;
        color: #5c534a;
      }
      .menu__qr-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.5rem;
        margin-top: 0.55rem;
      }
    `,
  ],
})
export class PublicMenuPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private shopSlug = '';
  private menuSlug = '';
  private observer: IntersectionObserver | null = null;
  private jumping = false;

  readonly data = signal<{ shop: PublicShop; menus: MenuSummary[]; menu: ShopMenu } | null>(null);
  readonly error = signal('');
  readonly query = signal('');
  readonly filter = signal<FilterId>('all');
  readonly activeSection = signal('');
  readonly shop = computed(() => this.data()?.shop ?? null);
  readonly menus = computed(() => this.data()?.menus ?? []);
  readonly currentSlug = computed(() => this.data()?.menu?.slug || this.menuSlug || this.menus()[0]?.slug || '');
  readonly accent = computed(() => this.shop()?.accentColor || '#2e7d32');
  readonly logoUrl = computed(() => {
    const raw = this.shop()?.logoUrl;
    const shopId = this.shop()?.id;
    return resolveShopLogoSrc(raw, shopId) || normalizeLogoUrl(raw) || raw?.trim() || null;
  });
  readonly sections = computed(() =>
    (this.data()?.menu?.sections ?? []).filter((s) => (s.items ?? []).some((it) => it.name)),
  );
  readonly filterOpts = computed((): FilterOpt[] => {
    const secs = this.sections();
    const opts: FilterOpt[] = [{ id: 'all', label: 'Todos' }];
    const has = (fn: (it: MenuItem, s: MenuSection) => boolean) =>
      secs.some((s) => s.items.some((it) => fn(it, s)));
    if (has(isVeggie)) opts.push({ id: 'veggie', label: 'Veggie' });
    if (has(isDessert)) opts.push({ id: 'dessert', label: 'Postres' });
    if (has(hasCombo)) opts.push({ id: 'combo', label: 'Combo' });
    if (has(isDrink)) opts.push({ id: 'drinks', label: 'Bebidas' });
    return opts;
  });
  readonly visibleSections = computed(() => {
    const q = normalizeText(this.query());
    const filter = this.filter();
    return this.sections()
      .map((s, i) => ({
        id: `sec-${slugify(s.name) || i}`,
        label: prettySection(s.name),
        items: s.items.filter((it) => matchesItem(it, s, q, filter)),
      }))
      .filter((s) => s.items.length);
  });
  readonly resultCount = computed(() =>
    this.visibleSections().reduce((n, s) => n + s.items.length, 0),
  );
  readonly qrOpen = signal(false);
  readonly qrSrc = signal<string | null>(null);

  constructor() {
    afterNextRender(() => this.watchSections());
  }

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.shopSlug = params.get('slug') ?? '';
      this.menuSlug = params.get('menuSlug') ?? '';
      this.query.set('');
      this.filter.set('all');
      this.activeSection.set('');
      if (!this.shopSlug) {
        this.error.set('Local no encontrado');
        return;
      }
      this.load();
    });
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') this.closeQr();
    };
    window.addEventListener('keydown', onKey);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('keydown', onKey);
      this.observer?.disconnect();
    });
  }

  onQuery(value: string): void {
    this.query.set(value);
    queueMicrotask(() => this.watchSections());
  }

  setFilter(id: FilterId): void {
    this.filter.set(id);
    queueMicrotask(() => this.watchSections());
  }

  scrollTo(id: string): void {
    this.jumping = true;
    this.activeSection.set(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      this.jumping = false;
    }, 500);
  }

  load(): void {
    this.error.set('');
    const base = `${environment.apiUrl}/public/shops/${encodeURIComponent(this.shopSlug)}/menu`;
    const url = this.menuSlug ? `${base}/${encodeURIComponent(this.menuSlug)}` : base;
    this.http.get<{ shop: PublicShop; menus: MenuSummary[]; menu: ShopMenu }>(url).subscribe({
      next: (res) => {
        this.data.set(res);
        void this.renderQr();
        queueMicrotask(() => this.watchSections());
      },
      error: () => this.error.set('Carta no disponible en este local'),
    });
  }

  menuLink(): string {
    const slug = this.shop()?.slug || this.shopSlug;
    if (!slug || typeof window === 'undefined') return '';
    return `${window.location.origin}/m/${encodeURIComponent(slug)}`;
  }

  openQr(): void {
    this.qrOpen.set(true);
    if (!this.qrSrc()) void this.renderQr();
  }

  closeQr(): void {
    this.qrOpen.set(false);
  }

  downloadQr(): void {
    const src = this.qrSrc();
    const slug = this.shop()?.slug || 'carta';
    if (!src) return;
    const a = document.createElement('a');
    a.href = src;
    a.download = `carta-${slug}.png`;
    a.click();
  }

  private watchSections(): void {
    this.observer?.disconnect();
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-sec]'));
    if (!nodes.length) return;
    if (!this.activeSection()) this.activeSection.set(nodes[0].dataset['sec'] || '');
    this.observer = new IntersectionObserver(
      (entries) => {
        if (this.jumping) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = (visible[0]?.target as HTMLElement | undefined)?.dataset['sec'];
        if (id) this.activeSection.set(id);
      },
      { rootMargin: '-28% 0px -58% 0px', threshold: [0.1, 0.4] },
    );
    for (const node of nodes) this.observer.observe(node);
  }

  private async renderQr(): Promise<void> {
    const link = this.menuLink();
    if (!link) return;
    try {
      const url = await toDataURL(link, {
        width: 640,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: qrDarkColor(this.accent()), light: '#ffffff' },
      });
      this.qrSrc.set(url);
    } catch {
      this.qrSrc.set(null);
    }
  }

  priceOf(item: MenuItem): string {
    const label = String(item.priceLabel ?? '').trim();
    if (label) return label;
    if (item.price == null || !Number.isFinite(Number(item.price))) return '';
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(Number(item.price));
  }
}

function normalizeText(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function slugify(raw: string): string {
  return normalizeText(raw)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function prettySection(name: string): string {
  const t = String(name ?? '').trim();
  if (!t) return 'Carta';
  if (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÜÑ]/.test(t)) {
    return t.charAt(0) + t.slice(1).toLowerCase();
  }
  return t;
}

function blobOf(item: MenuItem, section: MenuSection): string {
  return normalizeText(`${section.name} ${item.name} ${item.description ?? ''}`);
}

function isVeggie(item: MenuItem, section: MenuSection): boolean {
  return /veggie|vegetari|vegano|sin carne|toscano verde/.test(blobOf(item, section));
}

function isDessert(item: MenuItem, section: MenuSection): boolean {
  return /dolci|postre|tiramisu|panna cotta|flan|helado|cannoli|chocolate/.test(blobOf(item, section));
}

function hasCombo(item: MenuItem): boolean {
  return /\/|\bcombo\b/i.test(String(item.priceLabel ?? ''));
}

function isDrink(item: MenuItem, section: MenuSection): boolean {
  return /bebida|vino|vini|birra|trago|cocktail|spritz|gin|coca|agua|limonada|aperitiv|bibite|cerveza|fernet|vermu/.test(
    blobOf(item, section),
  );
}

function matchesItem(item: MenuItem, section: MenuSection, query: string, filter: FilterId): boolean {
  if (filter === 'veggie' && !isVeggie(item, section)) return false;
  if (filter === 'dessert' && !isDessert(item, section)) return false;
  if (filter === 'combo' && !hasCombo(item)) return false;
  if (filter === 'drinks' && !isDrink(item, section)) return false;
  if (!query) return true;
  return blobOf(item, section).includes(query);
}

function qrDarkColor(raw?: string | null): string {
  const hex = String(raw ?? '').trim();
  const m = hex.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return '#111111';
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.42 ? '#111111' : `#${h}`;
}
