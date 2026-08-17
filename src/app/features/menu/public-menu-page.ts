import { Component, OnInit, afterNextRender, computed, inject, signal, DestroyRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
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
  hasSourceFile?: boolean;
  sourceFileName?: string | null;
  sourceKind?: 'pdf' | 'image' | 'other' | null;
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
        <div class="menu__sheet">
          <header class="menu__hero">
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
                @if (s.instagramHandle && s.phone) {
                  <span aria-hidden="true">·</span>
                }
                @if (s.phone) {
                  <a [href]="'tel:' + s.phone">{{ s.phone }}</a>
                }
              </p>
            }
            <div class="menu__hero-actions">
              <button type="button" class="menu__link-btn" (click)="openQr()">Ver QR</button>
              @if (hasSourceFile()) {
                <span aria-hidden="true">·</span>
                <button type="button" class="menu__link-btn" (click)="openSource()">Carta física</button>
              }
            </div>
          </header>

          @if (qrOpen()) {
            <div class="menu__mask" (click)="closeQr()">
              <div class="menu__dialog" (click)="$event.stopPropagation()" role="dialog" aria-label="QR de la carta">
                <p class="menu__dialog-title">Escaneá para abrir la carta</p>
                <p class="menu__dialog-sub">{{ s.name }}</p>
                @if (qrSrc(); as src) {
                  <img class="menu__qr-img" [src]="src" alt="Código QR de la carta" />
                } @else {
                  <p class="menu__dialog-wait">Armando el código…</p>
                }
                <div class="menu__dialog-actions">
                  <button type="button" class="menu__btn" (click)="downloadQr()">Descargar</button>
                  <button type="button" class="menu__btn menu__btn--ghost" (click)="closeQr()">Cerrar</button>
                </div>
              </div>
            </div>
          }

          @if (sourceOpen()) {
            <div class="menu__mask" (click)="closeSource()">
              <div
                class="menu__dialog menu__dialog--wide"
                (click)="$event.stopPropagation()"
                role="dialog"
                aria-label="Carta física"
              >
                <div class="menu__dialog-head">
                  <div>
                    <p class="menu__dialog-title">Carta física</p>
                    <p class="menu__dialog-sub">{{ data()?.menu?.sourceFileName || s.name }}</p>
                  </div>
                  <button type="button" class="menu__btn menu__btn--ghost" (click)="closeSource()">Cerrar</button>
                </div>
                @if (sourceLoading()) {
                  <p class="menu__dialog-wait">Cargando el archivo…</p>
                } @else if (sourceError()) {
                  <p class="menu__dialog-wait">{{ sourceError() }}</p>
                } @else if (sourceKind() === 'image' && sourceBlobUrl()) {
                  <img class="menu__source-img" [src]="sourceBlobUrl()!" alt="Carta física" />
                } @else if (sourceSafeUrl(); as url) {
                  <iframe class="menu__source-frame" [src]="url" title="Carta física"></iframe>
                }
                <div class="menu__dialog-actions">
                  @if (sourceHref()) {
                    <a class="menu__btn" [href]="sourceHref()!" target="_blank" rel="noopener">Abrir</a>
                  }
                  <button type="button" class="menu__btn menu__btn--ghost" (click)="closeSource()">Cerrar</button>
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
                placeholder="Buscar plato o ingrediente…"
                [ngModel]="query()"
                (ngModelChange)="onQuery($event)"
                autocomplete="off"
              />
              @if (query()) {
                <button type="button" class="menu__search-clear" (click)="onQuery('')" aria-label="Limpiar">
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
              <h2 class="menu__section-title">{{ section.label }}</h2>
              <ul>
                @for (item of section.items; track $index) {
                  <li class="menu__item">
                    <div class="menu__row">
                      <span class="menu__name">{{ item.name }}</span>
                      @if (priceOf(item); as price) {
                        <span class="menu__dots" aria-hidden="true"></span>
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
      </div>
    } @else {
      <div class="menu menu--error">
        <p>Cargando carta…</p>
      </div>
    }
  `,
  styles: [
    `
      @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Figtree:wght@400;500;600;700&display=swap');

      :host {
        display: block;
        min-height: 100dvh;
        font-family: Figtree, 'Segoe UI', sans-serif;
      }
      .menu {
        --accent: #2f6b45;
        --ink: #1a221c;
        --muted: #6b756e;
        --line: color-mix(in srgb, var(--accent) 22%, #c8d0c6);
        --paper: #f5f6f2;
        --sheet: #fbfcf9;
        min-height: 100dvh;
        color: var(--ink);
        background:
          radial-gradient(ellipse 70% 40% at 50% -10%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%),
          linear-gradient(180deg, #e8ece6 0%, var(--paper) 28%, #eef1ec 100%);
        padding: calc(0.85rem + env(safe-area-inset-top, 0px)) 0.85rem
          calc(2rem + env(safe-area-inset-bottom, 0px));
      }
      .menu__sheet {
        max-width: 38rem;
        margin: 0 auto;
        background: var(--sheet);
        border: 1px solid color-mix(in srgb, var(--accent) 12%, #d5dcd2);
        border-radius: 1.35rem;
        padding: 1.35rem 1.15rem 1.75rem;
        box-shadow:
          0 1px 0 rgba(255, 255, 255, 0.7) inset,
          0 18px 40px rgba(28, 40, 30, 0.08);
      }
      .menu--error {
        display: grid;
        place-items: center;
        gap: 1rem;
        text-align: center;
        color: var(--muted);
        min-height: 100dvh;
      }
      .menu__hero {
        text-align: center;
        margin-bottom: 1.15rem;
        padding-bottom: 1.05rem;
        border-bottom: 1px solid var(--line);
      }
      .menu__logo {
        width: 4.4rem;
        height: 4.4rem;
        object-fit: contain;
        border-radius: 50%;
        background: #fff;
        padding: 0.2rem;
        margin-bottom: 0.55rem;
        border: 1px solid var(--line);
      }
      .menu__eyebrow {
        margin: 0;
        letter-spacing: 0.34em;
        text-transform: uppercase;
        font-size: 0.68rem;
        font-weight: 600;
        color: color-mix(in srgb, var(--accent) 82%, #1a221c);
      }
      .menu h1 {
        margin: 0.15rem 0 0;
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-size: clamp(2.15rem, 8vw, 2.85rem);
        font-weight: 600;
        letter-spacing: -0.02em;
        line-height: 1.05;
        color: var(--ink);
      }
      .menu__contact {
        margin: 0.4rem 0 0;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.45rem;
        font-size: 0.88rem;
        color: var(--muted);
      }
      .menu__contact a {
        color: var(--muted);
        text-decoration: none;
      }
      .menu__contact a:hover {
        color: var(--accent);
      }
      .menu__hero-actions {
        margin-top: 0.7rem;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.45rem;
        color: var(--muted);
        font-size: 0.86rem;
      }
      .menu__link-btn {
        border: 0;
        background: transparent;
        color: color-mix(in srgb, var(--accent) 75%, #1a221c);
        font: inherit;
        font-weight: 600;
        font-size: 0.86rem;
        text-decoration: underline;
        text-underline-offset: 0.18em;
        cursor: pointer;
        padding: 0;
      }
      .menu__btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.35rem;
        border: 1px solid color-mix(in srgb, var(--accent) 45%, #b7c2b6);
        background: var(--accent);
        color: #fff;
        border-radius: 999px;
        padding: 0.5rem 1rem;
        font: inherit;
        font-weight: 650;
        font-size: 0.88rem;
        cursor: pointer;
        text-decoration: none;
      }
      .menu__btn--ghost {
        background: transparent;
        color: var(--ink);
        border-color: #c9d1c7;
      }
      .menu__books {
        display: flex;
        justify-content: center;
        gap: 0;
        margin: 0 auto 0.95rem;
        border-bottom: 1px solid var(--line);
      }
      .menu__book {
        flex: 1;
        text-align: center;
        text-decoration: none;
        color: var(--muted);
        padding: 0.55rem 0.4rem 0.7rem;
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-size: 1.25rem;
        font-weight: 600;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
      }
      .menu__book--on {
        color: var(--ink);
        border-bottom-color: var(--accent);
      }
      .menu__dock {
        position: sticky;
        top: 0;
        z-index: 8;
        margin: 0 0 1.1rem;
        padding: 0.45rem 0 0.55rem;
        background: color-mix(in srgb, var(--sheet) 92%, transparent);
        backdrop-filter: blur(10px);
      }
      .menu__search {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.55rem 0.75rem;
        border-radius: 999px;
        background: #fff;
        border: 1px solid var(--line);
      }
      .menu__search svg {
        width: 1.1rem;
        height: 1.1rem;
        flex-shrink: 0;
        color: var(--muted);
      }
      .menu__search input {
        flex: 1;
        min-width: 0;
        border: 0;
        background: transparent;
        color: var(--ink);
        font: inherit;
        font-size: 0.92rem;
        outline: none;
      }
      .menu__search input::placeholder {
        color: #8a938b;
      }
      .menu__search-clear {
        border: 0;
        background: transparent;
        color: var(--muted);
        font-size: 1.25rem;
        line-height: 1;
        cursor: pointer;
      }
      .menu__filters,
      .menu__cats {
        display: flex;
        gap: 0.15rem 0.85rem;
        overflow-x: auto;
        scrollbar-width: none;
        padding: 0.65rem 0.1rem 0.1rem;
        -webkit-overflow-scrolling: touch;
      }
      .menu__filters::-webkit-scrollbar,
      .menu__cats::-webkit-scrollbar {
        display: none;
      }
      .menu__chip,
      .menu__cat {
        flex-shrink: 0;
        border: 0;
        background: transparent;
        color: var(--muted);
        padding: 0.15rem 0;
        font: inherit;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        border-bottom: 1.5px solid transparent;
      }
      .menu__chip--on,
      .menu__cat--on {
        color: var(--ink);
        border-bottom-color: var(--accent);
      }
      .menu__cats {
        border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
        margin-top: 0.35rem;
        padding-top: 0.55rem;
      }
      .menu__cat {
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-size: 1.05rem;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      .menu__count,
      .menu__empty {
        margin: 0 0 0.9rem;
        text-align: center;
        color: var(--muted);
        font-size: 0.86rem;
      }
      .menu__section {
        margin: 0 0 1.65rem;
        scroll-margin-top: 7.5rem;
      }
      .menu__section-title {
        margin: 0 0 0.85rem;
        text-align: center;
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-size: 1.55rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--accent) 55%, #1a221c);
      }
      .menu__section-title::after {
        content: '';
        display: block;
        width: 2.4rem;
        height: 1px;
        margin: 0.45rem auto 0;
        background: var(--line);
      }
      .menu__section ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.85rem;
      }
      .menu__item {
        padding: 0;
        background: transparent;
        border: 0;
      }
      .menu__row {
        display: flex;
        align-items: baseline;
        gap: 0.45rem;
      }
      .menu__name {
        font-weight: 650;
        font-size: 0.98rem;
        line-height: 1.25;
        color: var(--ink);
      }
      .menu__dots {
        flex: 1;
        min-width: 1rem;
        border-bottom: 1px dotted color-mix(in srgb, var(--accent) 28%, #b7c0b5);
        transform: translateY(-0.25em);
      }
      .menu__price {
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
        font-weight: 650;
        font-size: 0.92rem;
        color: var(--ink);
        white-space: nowrap;
      }
      .menu__desc {
        margin: 0.18rem 0 0;
        font-size: 0.84rem;
        line-height: 1.4;
        color: var(--muted);
        max-width: 92%;
      }
      .menu__note {
        margin: 1.25rem 0 0;
        text-align: center;
        font-size: 0.8rem;
        line-height: 1.45;
        color: var(--muted);
        font-style: italic;
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-size: 1rem;
      }
      .menu__mask {
        position: fixed;
        inset: 0;
        z-index: 40;
        display: grid;
        place-items: center;
        padding: 1.25rem;
        background: rgba(20, 28, 22, 0.55);
        backdrop-filter: blur(8px);
      }
      .menu__dialog {
        width: min(100%, 22rem);
        display: grid;
        justify-items: center;
        gap: 0.4rem;
        padding: 1.25rem 1.1rem 1.15rem;
        border-radius: 1.15rem;
        background: #fbfcf9;
        color: var(--ink);
        box-shadow: 0 24px 50px rgba(0, 0, 0, 0.28);
      }
      .menu__dialog--wide {
        width: min(100%, 42rem);
        max-height: min(92dvh, 56rem);
        grid-template-rows: auto 1fr auto;
        justify-items: stretch;
      }
      .menu__dialog-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .menu__dialog-title {
        margin: 0;
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-weight: 650;
        font-size: 1.35rem;
        text-align: center;
      }
      .menu__dialog-head .menu__dialog-title {
        text-align: left;
      }
      .menu__dialog-sub {
        margin: 0 0 0.35rem;
        color: var(--muted);
        font-size: 0.88rem;
        text-align: center;
      }
      .menu__dialog-head .menu__dialog-sub {
        text-align: left;
      }
      .menu__qr-img {
        width: min(100%, 16rem);
        height: auto;
        background: #fff;
        border-radius: 12px;
      }
      .menu__dialog-wait {
        margin: 1rem 0;
        color: var(--muted);
        text-align: center;
      }
      .menu__dialog-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.5rem;
        margin-top: 0.55rem;
      }
      .menu__source-frame {
        width: 100%;
        min-height: min(70dvh, 40rem);
        border: 0;
        border-radius: 12px;
        background: #fff;
      }
      .menu__source-img {
        width: 100%;
        max-height: min(70dvh, 40rem);
        object-fit: contain;
        border-radius: 12px;
        background: #fff;
      }
      @media (max-width: 420px) {
        .menu__sheet {
          padding-left: 0.95rem;
          padding-right: 0.95rem;
        }
      }
    `,
  ],
})
export class PublicMenuPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sanitizer = inject(DomSanitizer);
  private shopSlug = '';
  private menuSlug = '';
  private observer: IntersectionObserver | null = null;
  private jumping = false;
  private sourceObjectUrl: string | null = null;

  readonly data = signal<{ shop: PublicShop; menus: MenuSummary[]; menu: ShopMenu } | null>(null);
  readonly error = signal('');
  readonly query = signal('');
  readonly filter = signal<FilterId>('all');
  readonly activeSection = signal('');
  readonly shop = computed(() => this.data()?.shop ?? null);
  readonly menus = computed(() => this.data()?.menus ?? []);
  readonly currentSlug = computed(() => this.data()?.menu?.slug || this.menuSlug || this.menus()[0]?.slug || '');
  readonly hasSourceFile = computed(() => !!this.data()?.menu?.hasSourceFile);
  readonly accent = computed(() => this.shop()?.accentColor || '#2f6b45');
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
  readonly sourceOpen = signal(false);
  readonly sourceLoading = signal(false);
  readonly sourceError = signal('');
  readonly sourceKind = signal<'pdf' | 'image' | 'other' | null>(null);
  readonly sourceBlobUrl = signal<string | null>(null);
  readonly sourceSafeUrl = signal<SafeResourceUrl | null>(null);
  readonly sourceHref = signal<string | null>(null);

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
      if (ev.key === 'Escape') {
        this.closeQr();
        this.closeSource();
      }
    };
    window.addEventListener('keydown', onKey);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('keydown', onKey);
      this.observer?.disconnect();
      this.revokeSourceUrl();
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
    this.closeSource();
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

  sourceFileApiUrl(): string {
    const shop = this.shop()?.slug || this.shopSlug;
    const menu = this.currentSlug();
    if (!shop || !menu) return '';
    return `${environment.apiUrl}/public/shops/${encodeURIComponent(shop)}/menu/${encodeURIComponent(menu)}/file`;
  }

  openQr(): void {
    this.qrOpen.set(true);
    if (!this.qrSrc()) void this.renderQr();
  }

  closeQr(): void {
    this.qrOpen.set(false);
  }

  openSource(): void {
    const api = this.sourceFileApiUrl();
    if (!api) return;
    this.sourceOpen.set(true);
    this.sourceLoading.set(true);
    this.sourceError.set('');
    this.sourceKind.set(this.data()?.menu?.sourceKind ?? null);
    this.sourceHref.set(api);
    this.revokeSourceUrl();
    this.http.get(api, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.sourceLoading.set(false);
        const kind =
          this.data()?.menu?.sourceKind ||
          (blob.type.startsWith('image/') ? 'image' : blob.type.includes('pdf') ? 'pdf' : 'other');
        this.sourceKind.set(kind);
        const url = URL.createObjectURL(blob);
        this.sourceObjectUrl = url;
        this.sourceBlobUrl.set(url);
        this.sourceHref.set(url);
        this.sourceSafeUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
      },
      error: () => {
        this.sourceLoading.set(false);
        this.sourceError.set('No se pudo abrir el archivo. Probá Abrir en otra pestaña.');
        this.sourceHref.set(api);
      },
    });
  }

  closeSource(): void {
    this.sourceOpen.set(false);
    this.sourceLoading.set(false);
    this.sourceError.set('');
    this.revokeSourceUrl();
  }

  private revokeSourceUrl(): void {
    if (this.sourceObjectUrl) {
      URL.revokeObjectURL(this.sourceObjectUrl);
      this.sourceObjectUrl = null;
    }
    this.sourceBlobUrl.set(null);
    this.sourceSafeUrl.set(null);
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

const SECTION_SPLIT =
  /^(la\s*)?(pasta|pizze?|panini|panino|dolci|stuzzichini|aperitivi|birre|bibite|vini|entradas?|postres?|bebidas?|tragos?|ensaladas?|hamburguesas?|sandwiches?|platos?|principales?|minutas?|vinos?|cervezas?|cocktails?)\b/i;

function prettySection(name: string): string {
  let t = String(name ?? '').trim();
  if (!t) return 'Carta';
  const known: Record<string, string> = {
    lapasta: 'La pasta',
    aperitivilebirre: 'Aperitivi e birre',
    aperitivibirre: 'Aperitivi e birre',
    stuzzichini: 'Stuzzichini',
    dolci: 'Dolci',
    bibite: 'Bibite',
    carta: 'Carta',
    vini: 'Vini',
    panini: 'Panini',
  };
  const key = normalizeText(t).replace(/\s+/g, '');
  if (known[key]) return known[key];

  // "Aperitivilebirre" / "Lapasta" → insert spaces before known words
  if (!/\s/.test(t) && t.length > 8) {
    const lower = t.toLowerCase();
    const parts = [
      'aperitivi',
      'stuzzichini',
      'hamburguesas',
      'sandwiches',
      'principales',
      'entradas',
      'ensaladas',
      'cocktails',
      'cervezas',
      'bebidas',
      'postres',
      'panini',
      'panino',
      'pasta',
      'pizze',
      'pizza',
      'dolci',
      'birre',
      'bibite',
      'vini',
      'vinos',
      'tragos',
    ];
    for (const part of parts) {
      const idx = lower.indexOf(part);
      if (idx > 0) {
        const left = t.slice(0, idx).trim();
        const right = t.slice(idx);
        if (SECTION_SPLIT.test(right) || parts.includes(part)) {
          t = `${left} ${right}`.replace(/\s+/g, ' ').trim();
          if (/^la$/i.test(left) && /^pasta/i.test(right)) t = `La ${right}`;
          if (/aperitivi/i.test(left) && /^birre/i.test(right)) t = 'Aperitivi e birre';
          break;
        }
      }
    }
  }

  if (t === t.toUpperCase() && /[A-ZÁÉÍÓÚÜÑ]/.test(t)) {
    return t.charAt(0) + t.slice(1).toLowerCase();
  }
  return t.replace(/\s+/g, ' ');
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
