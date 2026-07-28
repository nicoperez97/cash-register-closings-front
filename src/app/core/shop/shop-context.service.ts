import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ShopSummary } from '../auth/auth.models';
import { APP_BRAND } from '../config/app-brand';
import { ThemeService } from '../theme/theme.service';
import { normalizeLogoUrl } from '../utils/drive-url';

const SHOP_KEY = 'crc_selected_shop';

@Injectable({ providedIn: 'root' })
export class ShopContextService {
  private readonly theme = inject(ThemeService);
  private readonly shopsSignal = signal<ShopSummary[]>([]);
  private readonly selectedId = signal<string | null>(localStorage.getItem(SHOP_KEY));

  readonly shops = this.shopsSignal.asReadonly();
  readonly selectedShopId = computed(() => {
    const id = this.selectedId();
    const list = this.shopsSignal();
    if (!list.length) return null;
    if (id && list.some((s) => s.id === id)) return id;
    return list[0].id;
  });
  readonly selectedShop = computed(() => {
    const id = this.selectedShopId();
    return this.shopsSignal().find((s) => s.id === id) ?? null;
  });
  readonly hasMultipleShops = computed(() => this.shopsSignal().length > 1);

  /** Logo del local activo, o fallback de la app. */
  readonly logoUrl = computed(() => {
    const shop = this.selectedShop();
    const url = normalizeLogoUrl(shop?.logoUrl) || shop?.logoUrl?.trim();
    return url || APP_BRAND.defaultLogoUrl;
  });

  readonly accentColor = computed(() => this.selectedShop()?.accentColor?.trim() || null);

  constructor() {
    effect(() => {
      this.theme.setShopAccent(this.accentColor());
    });
  }

  setShops(shops: ShopSummary[]): void {
    this.shopsSignal.set(shops);
    const id = this.selectedId();
    if (!id || !shops.some((s) => s.id === id)) {
      const next = shops[0]?.id ?? null;
      this.selectedId.set(next);
      if (next) localStorage.setItem(SHOP_KEY, next);
      else localStorage.removeItem(SHOP_KEY);
    }
  }

  /** Actualiza un shop en memoria (p.ej. tras editar logo). */
  upsertShop(shop: ShopSummary): void {
    this.shopsSignal.update((list) => {
      const idx = list.findIndex((s) => s.id === shop.id);
      if (idx < 0) return [...list, shop];
      const next = [...list];
      next[idx] = { ...next[idx], ...shop };
      return next;
    });
  }

  selectShop(shopId: string): boolean {
    const current = this.selectedShopId();
    if (current === shopId) return false;
    this.selectedId.set(shopId);
    localStorage.setItem(SHOP_KEY, shopId);
    return true;
  }

  clear(): void {
    this.shopsSignal.set([]);
    this.selectedId.set(null);
    localStorage.removeItem(SHOP_KEY);
    this.theme.setShopAccent(null);
  }
}
