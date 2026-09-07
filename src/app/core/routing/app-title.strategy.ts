import { Injectable, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { ShopContextService } from '../shop/shop-context.service';

/** Fallback si aún no hay local seleccionado. */
export const APP_TITLE_BRAND = 'Cierres de caja';
export const APP_TITLE_FALLBACK = APP_TITLE_BRAND;

/** Formatea el título de pestaña: `{page} | {local}`. */
export function formatAppTitle(page: string, brand = APP_TITLE_BRAND): string {
  const trimmed = page.trim();
  const suffix = brand.trim() || APP_TITLE_BRAND;
  return trimmed ? `${trimmed} | ${suffix}` : suffix;
}

@Injectable()
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly shops = inject(ShopContextService);
  private lastPage = '';

  constructor() {
    super();
    // Si cambia el local, refrescar el sufijo sin esperar otra navegación.
    effect(() => {
      const shopName = this.shops.selectedShop()?.name?.trim() || '';
      if (!shopName || !this.lastPage) return;
      this.title.setTitle(formatAppTitle(this.lastPage, shopName));
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.lastPage = this.buildTitle(snapshot) ?? '';
    const brand = this.shops.selectedShop()?.name?.trim() || APP_TITLE_BRAND;
    this.title.setTitle(this.lastPage ? formatAppTitle(this.lastPage, brand) : brand);
  }
}
