import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { map } from 'rxjs';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { isShopAdministrator } from '../../core/auth/auth.models';
import { buildPublicPages } from '../../core/shop/public-pages';
import { NavMenuService } from '../../core/layout/nav-menu.service';

const TOOLBAR_KEY = 'admin_public_page_toolbar_v2';

@Component({
  selector: 'app-admin-public-page-viewer',
  imports: [RouterLink, MatIconModule, MatSnackBarModule, MatTooltipModule],
  template: `
    @if (!page()) {
      <p class="empty">No encontramos esa página.</p>
    } @else {
      <div class="viewer" [class.viewer--bar-off]="!barOpen()">
        @if (barOpen()) {
          <div class="viewer__bar">
            <button
              type="button"
              class="viewer__icon"
              matTooltip="Menú"
              aria-label="Menú"
              (click)="toggleMenu()"
            >
              <mat-icon>menu</mat-icon>
            </button>
            <span class="viewer__title">{{ page()!.label }}</span>
            <div class="viewer__actions">
              <button
                type="button"
                class="viewer__icon"
                matTooltip="Copiar link"
                aria-label="Copiar link"
                (click)="copy(page()!.url)"
              >
                <mat-icon>content_copy</mat-icon>
              </button>
              <a
                class="viewer__icon"
                [href]="page()!.url"
                target="_blank"
                rel="noopener"
                matTooltip="Abrir en pestaña"
                aria-label="Abrir en pestaña"
              >
                <mat-icon>open_in_new</mat-icon>
              </a>
              @if (canManageLinks()) {
                <a
                  class="viewer__icon"
                  routerLink="/admin/public-pages"
                  matTooltip="Enlaces"
                  aria-label="Enlaces"
                >
                  <mat-icon>link</mat-icon>
                </a>
              }
              <button
                type="button"
                class="viewer__icon"
                matTooltip="Ocultar barra"
                aria-label="Ocultar barra"
                (click)="setBarOpen(false)"
              >
                <mat-icon>unfold_less</mat-icon>
              </button>
            </div>
          </div>
        } @else {
          <button
            type="button"
            class="viewer__reveal viewer__reveal--menu"
            matTooltip="Menú"
            aria-label="Menú"
            (click)="toggleMenu()"
          >
            <mat-icon>menu</mat-icon>
          </button>
          <button
            type="button"
            class="viewer__reveal"
            matTooltip="Mostrar barra"
            aria-label="Mostrar barra"
            (click)="setBarOpen(true)"
          >
            <mat-icon>unfold_more</mat-icon>
          </button>
        }
        @if (frameUrl(); as src) {
          <iframe class="viewer__frame" [src]="src" [title]="page()!.label"></iframe>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      height: 100%;
      margin: 0;
    }
    .empty {
      margin: 1rem;
      color: var(--guy-muted, #5a6b7d);
    }
    .viewer {
      position: relative;
      display: flex;
      flex-direction: column;
      flex: 1;
      height: 100%;
      min-height: 0;
      background: #fff;
    }
    .viewer__bar {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.4rem 0.25rem 0.35rem;
      border-bottom: 1px solid var(--guy-border, #e6ebf0);
      background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 88%, #fff);
      flex-shrink: 0;
    }
    .viewer__title {
      flex: 1;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--guy-muted, #5a6b7d);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .viewer__actions {
      display: flex;
      align-items: center;
      gap: 0.05rem;
      flex-shrink: 0;
      margin-left: auto;
    }
    .viewer__icon {
      display: grid;
      place-items: center;
      width: 1.85rem;
      height: 1.85rem;
      padding: 0;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--guy-navy, #003366);
      text-decoration: none;
      cursor: pointer;
    }
    .viewer__icon:hover,
    .viewer__icon:focus-visible {
      background: color-mix(in srgb, var(--guy-navy, #003366) 8%, transparent);
      outline: none;
    }
    .viewer__icon mat-icon {
      font-size: 1.1rem;
      width: 1.1rem;
      height: 1.1rem;
    }
    .viewer__reveal {
      position: absolute;
      top: 0.35rem;
      right: 0.35rem;
      z-index: 2;
      display: grid;
      place-items: center;
      width: 1.85rem;
      height: 1.85rem;
      padding: 0;
      border: 1px solid var(--guy-border, #e6ebf0);
      border-radius: 8px;
      background: color-mix(in srgb, #fff 88%, transparent);
      color: var(--guy-navy, #003366);
      cursor: pointer;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    }
    .viewer__reveal--menu {
      right: auto;
      left: 0.35rem;
    }
    .viewer__reveal:hover,
    .viewer__reveal:focus-visible {
      background: #fff;
      outline: none;
    }
    .viewer__reveal mat-icon {
      font-size: 1.1rem;
      width: 1.1rem;
      height: 1.1rem;
    }
    .viewer__frame {
      flex: 1;
      width: 100%;
      min-height: 0;
      border: 0;
      background: #fff;
    }
  `,
})
export class AdminPublicPageViewerPage {
  private readonly route = inject(ActivatedRoute);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly snack = inject(MatSnackBar);
  private readonly navMenu = inject(NavMenuService);

  private readonly pageId = toSignal(
    this.route.paramMap.pipe(map((p) => (p.get('pageId') || '').trim())),
    { initialValue: (this.route.snapshot.paramMap.get('pageId') || '').trim() },
  );

  readonly barOpen = signal(this.readBarOpen());

  readonly canManageLinks = computed(() =>
    isShopAdministrator(this.auth.currentUser(), this.shops.selectedShopId()),
  );

  readonly page = computed(() => {
    const id = this.pageId();
    if (!id) return null;
    return buildPublicPages(this.shops.selectedShop()).find((p) => p.id === id) ?? null;
  });

  readonly frameUrl = computed(() => {
    const path = this.page()?.path;
    if (!path || typeof window === 'undefined') return null;
    const url = new URL(path, window.location.origin);
    url.searchParams.set('embed', '1');
    return this.sanitizer.bypassSecurityTrustResourceUrl(url.toString());
  });

  toggleMenu(): void {
    this.navMenu.requestSidenavToggle();
  }

  setBarOpen(open: boolean): void {
    this.barOpen.set(open);
    try {
      localStorage.setItem(TOOLBAR_KEY, open ? '1' : '0');
    } catch {
      // ignore
    }
  }

  private readBarOpen(): boolean {
    try {
      const v = localStorage.getItem(TOOLBAR_KEY);
      if (v === '0') return false;
      if (v === '1') return true;
    } catch {
      // ignore
    }
    return false;
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
