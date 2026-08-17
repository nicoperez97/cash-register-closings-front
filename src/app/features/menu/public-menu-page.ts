import { Component, OnInit, computed, inject, signal, DestroyRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

@Component({
  selector: 'app-public-menu-page',
  imports: [RouterLink],
  template: `
    @if (error()) {
      <div class="menu menu--error" [style.--accent]="accent()">
        <p>{{ error() }}</p>
        <button type="button" class="menu__retry" (click)="load()">Reintentar</button>
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
                <span>@{{ s.instagramHandle }}</span>
              }
              @if (s.phone) {
                <span>{{ s.phone }}</span>
              }
            </p>
          }
          <button type="button" class="menu__qr-btn" (click)="openQr()">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm12-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v6h-2v-2h-2v-2h2v-2zm-4 4h2v2h-2v-2z"
              />
            </svg>
            Ver QR
          </button>
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
                <button type="button" class="menu__retry" (click)="downloadQr()">Descargar</button>
                <button type="button" class="menu__retry" (click)="closeQr()">Cerrar</button>
              </div>
            </div>
          </div>
        }

        @if (menus().length > 1) {
          <nav class="menu__tabs" aria-label="Cartas">
            @for (m of menus(); track m.slug) {
              <a
                class="menu__tab"
                [class.menu__tab--on]="m.slug === currentSlug()"
                [routerLink]="['/m', s.slug, m.slug]"
              >
                {{ m.title }}
              </a>
            }
          </nav>
        }

        @if (data()?.menu?.title && data()?.menu?.title !== s.name) {
          <h2 class="menu__current">{{ data()?.menu?.title }}</h2>
        }

        @for (section of sections(); track $index) {
          <section class="menu__section">
            <h2>{{ section.name }}</h2>
            <ul>
              @for (item of section.items; track $index) {
                <li>
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
      :host {
        display: block;
        min-height: 100dvh;
        font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
      }
      .menu {
        --accent: #2e7d32;
        min-height: 100dvh;
        padding: calc(1.15rem + env(safe-area-inset-top, 0px)) 1.15rem
          calc(1.75rem + env(safe-area-inset-bottom, 0px));
        color: #f4efe6;
        background:
          radial-gradient(
            ellipse 80% 45% at 50% -8%,
            color-mix(in srgb, var(--accent) 32%, transparent),
            transparent 70%
          ),
          linear-gradient(165deg, #1a1512 0%, #0e0c0b 45%, #161210 100%);
      }
      .menu--error {
        display: grid;
        place-items: center;
        text-align: center;
        color: #cfc6ba;
        gap: 1rem;
      }
      .menu__hero {
        position: relative;
        text-align: center;
        max-width: 36rem;
        margin: 0 auto 1.15rem;
      }
      .menu__glow {
        position: absolute;
        inset: -1rem 12% auto;
        height: 6rem;
        background: radial-gradient(circle, color-mix(in srgb, var(--accent) 40%, transparent), transparent 70%);
        pointer-events: none;
      }
      .menu__logo {
        position: relative;
        width: 4.6rem;
        height: 4.6rem;
        object-fit: contain;
        border-radius: 1rem;
        background: #fff;
        padding: 0.25rem;
        margin-bottom: 0.65rem;
      }
      .menu__eyebrow {
        margin: 0;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        font-size: 0.72rem;
        font-weight: 700;
        color: color-mix(in srgb, var(--accent) 70%, #f4efe6);
      }
      .menu h1 {
        margin: 0.2rem 0 0;
        font-size: 1.7rem;
        font-weight: 750;
      }
      .menu__contact {
        margin: 0.35rem 0 0;
        color: #cfc6ba;
        font-size: 0.9rem;
        display: flex;
        justify-content: center;
        gap: 0.85rem;
      }
      .menu__tabs {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.45rem;
        max-width: 36rem;
        margin: 0 auto 1.15rem;
      }
      .menu__tab {
        text-decoration: none;
        color: #f4efe6;
        border: 1px solid color-mix(in srgb, var(--accent) 40%, #3a332c);
        background: color-mix(in srgb, var(--accent) 12%, #1c1815);
        border-radius: 999px;
        padding: 0.45rem 0.95rem;
        font-weight: 650;
        font-size: 0.88rem;
      }
      .menu__tab--on {
        background: color-mix(in srgb, var(--accent) 55%, #1c1815);
        border-color: color-mix(in srgb, var(--accent) 80%, #3a332c);
      }
      .menu__current {
        max-width: 36rem;
        margin: 0 auto 1rem;
        text-align: center;
        font-size: 1.05rem;
        font-weight: 700;
        color: #f6e7c8;
      }
      .menu__section {
        max-width: 36rem;
        margin: 0 auto 1.35rem;
      }
      .menu__section h2 {
        margin: 0 0 0.65rem;
        font-size: 0.82rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--accent) 75%, #f4efe6);
        border-bottom: 1px solid color-mix(in srgb, var(--accent) 35%, #3a332c);
        padding-bottom: 0.35rem;
      }
      .menu__section ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.7rem;
      }
      .menu__row {
        display: flex;
        align-items: baseline;
        gap: 0.45rem;
      }
      .menu__name {
        font-weight: 650;
      }
      .menu__dots {
        flex: 1;
        border-bottom: 1px dotted #5a5248;
        min-width: 1.5rem;
        transform: translateY(-0.2em);
      }
      .menu__price {
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        color: #f6e7c8;
        white-space: nowrap;
      }
      .menu__desc {
        margin: 0.2rem 0 0;
        font-size: 0.82rem;
        color: #b8aea2;
      }
      .menu__note {
        max-width: 36rem;
        margin: 1.25rem auto 0;
        text-align: center;
        font-size: 0.82rem;
        color: #9d9488;
      }
      .menu__retry {
        border: 1px solid color-mix(in srgb, var(--accent) 45%, #3a332c);
        background: color-mix(in srgb, var(--accent) 18%, #1c1815);
        color: #f4efe6;
        border-radius: 12px;
        padding: 0.65rem 1rem;
        font: inherit;
        font-weight: 650;
        cursor: pointer;
      }
      .menu__qr-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        margin-top: 0.85rem;
        border: 1px solid color-mix(in srgb, var(--accent) 45%, #3a332c);
        background: color-mix(in srgb, var(--accent) 18%, #1c1815);
        color: #f4efe6;
        border-radius: 999px;
        padding: 0.45rem 0.95rem;
        font: inherit;
        font-weight: 650;
        font-size: 0.88rem;
        cursor: pointer;
      }
      .menu__qr-btn svg {
        width: 1.15rem;
        height: 1.15rem;
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
        font-weight: 750;
        font-size: 1.02rem;
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
      .menu__qr-actions .menu__retry {
        color: #1a1512;
        background: #fff;
        border-color: #d7cfc4;
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

  readonly data = signal<{ shop: PublicShop; menus: MenuSummary[]; menu: ShopMenu } | null>(null);
  readonly error = signal('');
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
  readonly qrOpen = signal(false);
  readonly qrSrc = signal<string | null>(null);

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.shopSlug = params.get('slug') ?? '';
      this.menuSlug = params.get('menuSlug') ?? '';
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
    this.destroyRef.onDestroy(() => window.removeEventListener('keydown', onKey));
  }

  load(): void {
    this.error.set('');
    const base = `${environment.apiUrl}/public/shops/${encodeURIComponent(this.shopSlug)}/menu`;
    const url = this.menuSlug ? `${base}/${encodeURIComponent(this.menuSlug)}` : base;
    this.http.get<{ shop: PublicShop; menus: MenuSummary[]; menu: ShopMenu }>(url).subscribe({
      next: (res) => {
        this.data.set(res);
        void this.renderQr();
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
