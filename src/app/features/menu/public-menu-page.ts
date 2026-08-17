import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
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
  title?: string | null;
  note?: string | null;
  sections: MenuSection[];
};

@Component({
  selector: 'app-public-menu-page',
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
          <h1>{{ data()?.menu?.title || s.name }}</h1>
          @if (data()?.menu?.title && data()?.menu?.title !== s.name) {
            <p class="menu__shop">{{ s.name }}</p>
          }
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
        </header>

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
        margin: 0 auto 1.5rem;
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
      .menu__shop,
      .menu__contact {
        margin: 0.35rem 0 0;
        color: #cfc6ba;
        font-size: 0.9rem;
      }
      .menu__contact {
        display: flex;
        justify-content: center;
        gap: 0.85rem;
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
    `,
  ],
})
export class PublicMenuPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private slug = '';

  readonly data = signal<{ shop: PublicShop; menu: ShopMenu } | null>(null);
  readonly error = signal('');
  readonly shop = computed(() => this.data()?.shop ?? null);
  readonly accent = computed(() => this.shop()?.accentColor || '#2e7d32');
  readonly logoUrl = computed(() => {
    const raw = this.shop()?.logoUrl;
    const shopId = this.shop()?.id;
    return resolveShopLogoSrc(raw, shopId) || normalizeLogoUrl(raw) || raw?.trim() || null;
  });
  readonly sections = computed(() =>
    (this.data()?.menu.sections ?? []).filter((s) => (s.items ?? []).some((it) => it.name)),
  );

  ngOnInit(): void {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!this.slug) {
      this.error.set('Local no encontrado');
      return;
    }
    this.load();
  }

  load(): void {
    this.error.set('');
    this.http
      .get<{ shop: PublicShop; menu: ShopMenu }>(
        `${environment.apiUrl}/public/shops/${encodeURIComponent(this.slug)}/menu`,
      )
      .subscribe({
        next: (res) => this.data.set(res),
        error: () => this.error.set('Carta no disponible en este local'),
      });
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
