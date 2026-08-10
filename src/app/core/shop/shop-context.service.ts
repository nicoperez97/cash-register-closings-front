import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { ShopSummary } from '../auth/auth.models';
import { APP_BRAND } from '../config/app-brand';
import { ThemeService } from '../theme/theme.service';
import { normalizeLogoUrl, resolveShopLogoSrc } from '../utils/drive-url';

const SHOP_KEY = 'crc_selected_shop';

@Injectable({ providedIn: 'root' })
export class ShopContextService {
  private readonly theme = inject(ThemeService);
  private readonly shopsSignal = signal<ShopSummary[]>([]);
  private readonly selectedId = signal<string | null>(localStorage.getItem(SHOP_KEY));
  private readonly favoriteId = signal<string | null>(null);

  readonly shops = this.shopsSignal.asReadonly();
  readonly favoriteShopId = this.favoriteId.asReadonly();
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
    const url = resolveShopLogoSrc(shop?.logoUrl, shop?.id) || normalizeLogoUrl(shop?.logoUrl);
    return url || APP_BRAND.defaultLogoUrl;
  });

  readonly accentColor = computed(() => this.selectedShop()?.accentColor?.trim() || null);
  readonly accentSecondary = computed(
    () => this.selectedShop()?.accentSecondary?.trim() || null,
  );

  constructor() {
    effect(() => {
      this.theme.setShopAccent(this.accentColor());
      this.theme.setShopAccentSecondary(this.accentSecondary());
    });
  }

  /**
   * @param preferredId Local favorito del usuario: se usa si no hay selección válida en localStorage
   *   (p.ej. tras login).
   * @param forcePreferred Si true, selecciona el favorito aunque haya otro local en memoria.
   */
  setShops(
    shops: ShopSummary[],
    preferredId?: string | null,
    forcePreferred = false,
  ): void {
    const prev = this.shopsSignal();
    const sameList =
      prev.length === shops.length &&
      prev.every((s, i) => s.id === shops[i]?.id && JSON.stringify(s) === JSON.stringify(shops[i]));
    if (!sameList) {
      this.shopsSignal.set(shops);
    }
    if (preferredId !== undefined) {
      const nextFav =
        preferredId && shops.some((s) => s.id === preferredId) ? preferredId : null;
      if (this.favoriteId() !== nextFav) {
        this.favoriteId.set(nextFav);
      }
    }

    const preferred =
      preferredId && shops.some((s) => s.id === preferredId) ? preferredId : null;

    if (forcePreferred && preferred) {
      if (this.selectedId() !== preferred) {
        this.selectedId.set(preferred);
        localStorage.setItem(SHOP_KEY, preferred);
      }
      return;
    }

    const id = this.selectedId();
    const idOk = !!(id && shops.some((s) => s.id === id));
    if (idOk) return;

    const next = preferred ?? shops[0]?.id ?? null;
    this.selectedId.set(next);
    if (next) localStorage.setItem(SHOP_KEY, next);
    else localStorage.removeItem(SHOP_KEY);
  }

  setFavoriteShopId(shopId: string | null): void {
    const list = this.shopsSignal();
    this.favoriteId.set(shopId && list.some((s) => s.id === shopId) ? shopId : null);
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
    this.favoriteId.set(null);
    localStorage.removeItem(SHOP_KEY);
    this.theme.setShopAccent(null);
    this.theme.setShopAccentSecondary(null);
  }
}
