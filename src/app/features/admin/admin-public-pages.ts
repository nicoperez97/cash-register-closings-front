import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { buildPublicPages } from '../../core/shop/public-pages';
import { canAccessPublicPage } from '../../core/shop/public-page-access';

@Component({
  selector: 'app-admin-public-pages',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatSnackBarModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Páginas públicas"
      [subtitle]="shops.selectedShop()?.name ?? 'Links del local'"
    />

    <p class="hint">
      Links públicos del local. Abrí dentro del admin las que tenés permiso (Ver en Usuarios). Copiá
      el link para el cliente o abrilo en pestaña.
    </p>

    @if (!shops.selectedShop()?.slug) {
      <p class="empty">Elegí un local con slug configurado.</p>
    } @else {
      <div class="pages">
        @for (p of pages(); track p.id) {
          <article class="page-card" [class.page-card--off]="!p.enabled">
            <div class="page-card__icon">
              <mat-icon>{{ p.icon }}</mat-icon>
            </div>
            <div class="page-card__body">
              <h3>{{ p.label }}</h3>
              <p>{{ p.description }}</p>
              <code>{{ p.path }}</code>
              <span class="page-card__status" [class.on]="p.enabled">{{ p.status }}</span>
            </div>
            <div class="page-card__actions">
              <button mat-stroked-button type="button" (click)="copy(p.url)">
                <mat-icon>content_copy</mat-icon>
                Copiar
              </button>
              <a mat-stroked-button [href]="p.url" target="_blank" rel="noopener">
                <mat-icon>open_in_new</mat-icon>
                Pestaña
              </a>
              @if (canOpen(p.id)) {
                <a mat-flat-button color="primary" [routerLink]="['/admin/public-pages', p.id]">
                  <mat-icon>visibility</mat-icon>
                  Abrir
                </a>
              }
            </div>
          </article>
        }
      </div>
    }
  `,
  styles: `
    .hint {
      margin: 0 0 1rem;
      color: var(--guy-muted, #5a6b7d);
      line-height: 1.45;
    }
    .empty {
      color: var(--guy-muted, #5a6b7d);
    }
    .pages {
      display: grid;
      gap: 0.75rem;
    }
    .page-card {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 0.85rem 1rem;
      align-items: center;
      padding: 0.9rem 1rem;
      border-radius: 14px;
      border: 1px solid var(--guy-border, #e6ebf0);
      background: #fff;
    }
    .page-card--off {
      opacity: 0.72;
    }
    .page-card__icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--guy-navy, #003366) 8%, #fff);
      color: var(--guy-navy, #003366);
    }
    .page-card__body h3 {
      margin: 0;
      font-size: 1.05rem;
    }
    .page-card__body p {
      margin: 0.2rem 0 0.35rem;
      color: var(--guy-muted, #5a6b7d);
      font-size: 0.92rem;
    }
    .page-card__body code {
      display: block;
      font-size: 0.82rem;
      color: var(--guy-navy, #003366);
      word-break: break-all;
    }
    .page-card__status {
      display: inline-block;
      margin-top: 0.35rem;
      font-size: 0.78rem;
      font-weight: 700;
      color: #8a5a00;
    }
    .page-card__status.on {
      color: #1b7a3d;
    }
    .page-card__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      justify-content: flex-end;
    }
    @media (max-width: 720px) {
      .page-card {
        grid-template-columns: auto 1fr;
      }
      .page-card__actions {
        grid-column: 1 / -1;
        justify-content: stretch;
      }
      .page-card__actions a,
      .page-card__actions button {
        flex: 1;
      }
    }
  `,
})
export class AdminPublicPagesPage {
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  readonly shops = inject(ShopContextService);

  readonly pages = computed(() => buildPublicPages(this.shops.selectedShop()));

  canOpen(pageId: string): boolean {
    return canAccessPublicPage(this.auth.currentUser(), this.shops.selectedShopId(), pageId);
  }

  async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.snack.open('Link copiado', 'OK', { duration: 2000 });
    } catch {
      this.snack.open('No se pudo copiar', 'OK', { duration: 2500 });
    }
  }
}
