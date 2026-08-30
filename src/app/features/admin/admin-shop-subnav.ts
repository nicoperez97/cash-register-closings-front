import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ADMIN_SHOP_SECTIONS, type AdminShopSectionId } from './admin-shop-sections';

@Component({
  selector: 'app-admin-shop-subnav',
  imports: [RouterLink, RouterLinkActive, MatIconModule],
  template: `
    <nav class="shop-subnav" aria-label="Secciones de configuración del local">
      <a routerLink="/admin/shop" class="shop-subnav__back">
        <mat-icon>arrow_back</mat-icon>
        Resumen
      </a>
      <div class="shop-subnav__chips" role="list">
        @for (s of sections; track s.id) {
          <a
            role="listitem"
            class="shop-subnav__chip"
            [routerLink]="['/admin/shop', s.path]"
            routerLinkActive="shop-subnav__chip--on"
            [attr.aria-current]="activeId() === s.id ? 'page' : null"
          >
            {{ s.label }}
          </a>
        }
      </div>
    </nav>
  `,
  styles: [
    `
      .shop-subnav {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.65rem 0.85rem;
        margin-bottom: 1rem;
      }
      .shop-subnav__back {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--guy-navy, #003366);
        text-decoration: none;
      }
      .shop-subnav__back mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .shop-subnav__back:hover {
        text-decoration: underline;
      }
      .shop-subnav__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .shop-subnav__chip {
        display: inline-flex;
        align-items: center;
        padding: 0.35rem 0.75rem;
        border-radius: 999px;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: var(--guy-card, #fff);
        color: var(--guy-muted, #5f6f76);
        font-size: 0.82rem;
        font-weight: 600;
        text-decoration: none;
      }
      .shop-subnav__chip--on,
      .shop-subnav__chip:hover {
        border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 45%, var(--guy-border, #ddd));
        color: var(--guy-navy, #003366);
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 8%, #fff);
      }
    `,
  ],
})
export class AdminShopSubnavComponent {
  readonly activeId = input<AdminShopSectionId | null>(null);
  readonly sections = ADMIN_SHOP_SECTIONS;
}
