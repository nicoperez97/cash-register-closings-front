import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { ADMIN_SHOP_SECTIONS } from './admin-shop-sections';

@Component({
  selector: 'app-admin-shop-hub',
  imports: [RouterLink, MatButtonModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Configuración del local"
      [subtitle]="
        shops.selectedShop()?.name
          ? 'Elegí qué querés configurar en ' + shops.selectedShop()!.name
          : 'Elegí una sección para configurar el local activo'
      "
    />

    <p class="shop-hub__intro text-muted">
      Acá está todo lo del local: marca, horarios, dispositivos y menú. Cada tarjeta abre una
      pantalla aparte. Los cambios se guardan con el botón fijo al pie.
    </p>

    <div class="shop-hub__grid">
      @for (s of sections; track s.id) {
        <a class="shop-hub__card panel-card" [routerLink]="['/admin/shop', s.path]">
          <div class="shop-hub__card-icon" aria-hidden="true">
            <mat-icon>{{ s.icon }}</mat-icon>
          </div>
          <div class="shop-hub__card-body">
            <h2 class="shop-hub__card-title">{{ s.label }}</h2>
            <p class="shop-hub__card-blurb">{{ s.blurb }}</p>
            <span class="shop-hub__card-cta">
              Abrir
              <mat-icon>arrow_forward</mat-icon>
            </span>
          </div>
        </a>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        min-width: 0;
      }
      .shop-hub__intro {
        margin: 0 0 1.15rem;
        max-width: 40rem;
        line-height: 1.45;
        font-size: 0.95rem;
      }
      .shop-hub__grid {
        display: grid;
        gap: 0.85rem;
        grid-template-columns: repeat(auto-fill, minmax(16.5rem, 1fr));
      }
      .shop-hub__card {
        display: flex;
        gap: 0.9rem;
        align-items: flex-start;
        padding: 1.1rem 1.15rem;
        text-decoration: none;
        color: inherit;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease,
          transform 0.15s ease;
      }
      .shop-hub__card:hover {
        border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 40%, var(--guy-border, #ddd));
        box-shadow: 0 8px 22px color-mix(in srgb, var(--guy-navy, #003366) 8%, transparent);
        transform: translateY(-1px);
      }
      .shop-hub__card-icon {
        flex-shrink: 0;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 10px;
        display: grid;
        place-items: center;
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 12%, transparent);
        color: var(--guy-primary, #1d65a0);
      }
      .shop-hub__card-icon mat-icon {
        font-size: 22px;
        width: 22px;
        height: 22px;
      }
      .shop-hub__card-body {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .shop-hub__card-title {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
      }
      .shop-hub__card-blurb {
        margin: 0;
        font-size: 0.88rem;
        line-height: 1.4;
        color: var(--guy-muted, #5f6f76);
      }
      .shop-hub__card-cta {
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
        margin-top: 0.35rem;
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--guy-primary, #1d65a0);
      }
      .shop-hub__card-cta mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    `,
  ],
})
export class AdminShopHubPage {
  readonly shops = inject(ShopContextService);
  readonly sections = ADMIN_SHOP_SECTIONS;
}
