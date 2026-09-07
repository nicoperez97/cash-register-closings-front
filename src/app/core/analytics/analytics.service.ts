import { Injectable, Injector, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { ShopContextService } from '../shop/shop-context.service';
import {
  AnalyticsEventName,
  AnalyticsEvents,
  AnalyticsParams,
  AnalyticsShopContext,
  AnalyticsUserContext,
} from './analytics.events';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private booted = false;
  private scriptLoading: Promise<void> | null = null;
  private shopCtx: AnalyticsShopContext = {};
  private userCtx: AnalyticsUserContext = {};
  private publicShopCtx: AnalyticsShopContext = {};

  private get measurementId(): string {
    return String(environment.gaMeasurementId ?? '').trim();
  }

  get enabled(): boolean {
    return !!this.measurementId;
  }

  /** Arranca gtag y page views. */
  start(): void {
    if (this.booted || !this.enabled || typeof window === 'undefined') return;
    this.booted = true;
    void this.ensureGtag().then(() => {
      this.syncFromApp();
      this.pageView(this.router.url);
    });

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.syncFromApp();
        this.pageView(e.urlAfterRedirects || e.url);
      });
  }

  setShopContext(shop: AnalyticsShopContext): void {
    this.shopCtx = {
      id: shop.id ?? null,
      name: shop.name ?? null,
      slug: shop.slug ?? null,
    };
    this.pushContext();
  }

  /** Contexto de local en páginas públicas (slug de la URL). */
  setPublicShopContext(shop: AnalyticsShopContext): void {
    this.publicShopCtx = {
      id: shop.id ?? null,
      name: shop.name ?? null,
      slug: shop.slug ?? null,
    };
    this.pushContext();
  }

  clearPublicShopContext(): void {
    this.publicShopCtx = {};
  }

  setUserContext(user: AnalyticsUserContext): void {
    this.userCtx = {
      id: user.id ?? null,
      name: user.name ?? null,
      email: user.email ?? null,
    };
    this.configUser();
    this.pushContext();
  }

  clearUserContext(): void {
    this.userCtx = {};
    this.configUser();
    this.pushContext();
  }

  pageView(path: string, title?: string): void {
    if (!this.enabled) return;
    void this.ensureGtag().then(() => {
      const params = this.withContext({
        page_path: path,
        page_title: title || (typeof document !== 'undefined' ? document.title : undefined),
        page_location: typeof location !== 'undefined' ? location.href : undefined,
      });
      window.gtag?.('event', 'page_view', params);
    });
  }

  event(name: AnalyticsEventName | string, params: AnalyticsParams = {}): void {
    if (!this.enabled) return;
    void this.ensureGtag().then(() => {
      this.syncFromApp();
      window.gtag?.('event', name, this.withContext(params));
    });
  }

  trackLoginSuccess(method: 'password' | 'google' = 'password'): void {
    this.syncFromApp();
    this.event(AnalyticsEvents.loginSuccess, { method });
  }

  trackLogout(): void {
    this.event(AnalyticsEvents.logout);
    this.clearUserContext();
  }

  trackShopSelected(shop: AnalyticsShopContext): void {
    this.setShopContext(shop);
    this.event(AnalyticsEvents.shopSelected);
  }

  private syncFromApp(): void {
    try {
      const shops = this.injector.get(ShopContextService);
      const shop = shops.selectedShop();
      if (shop) {
        this.shopCtx = { id: shop.id, name: shop.name, slug: shop.slug };
      }
      const auth = this.injector.get(AuthService);
      const user = auth.currentUser();
      if (user) {
        this.userCtx = {
          id: user.id,
          name: user.fullName || user.email,
          email: user.email,
        };
      } else if (!auth.getToken()) {
        this.userCtx = {};
      }
    } catch {
      // bootstrap temprano
    }
    this.configUser();
    this.pushContext();
  }

  private withContext(params: AnalyticsParams): Record<string, string | number | boolean> {
    const shop = this.shopCtx.id || this.shopCtx.slug ? this.shopCtx : this.publicShopCtx;
    const merged: AnalyticsParams = {
      shop_id: shop.id || undefined,
      shop_name: shop.name || undefined,
      shop_slug: shop.slug || undefined,
      user_name: this.userCtx.name || undefined,
      user_email: this.userCtx.email || undefined,
      ...params,
    };
    const out: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(merged)) {
      if (v === null || v === undefined || v === '') continue;
      out[k] = v;
    }
    return out;
  }

  private pushContext(): void {
    if (!this.enabled || !window.gtag) return;
    const ctx = this.withContext({});
    window.gtag('set', ctx);
  }

  private configUser(): void {
    if (!this.enabled || !window.gtag) return;
    const id = this.measurementId;
    const userId = this.userCtx.id || undefined;
    window.gtag('config', id, {
      send_page_view: false,
      user_id: userId,
    });
    if (this.userCtx.email || this.userCtx.name) {
      window.gtag('set', 'user_properties', {
        user_name: this.userCtx.name || undefined,
        user_email: this.userCtx.email || undefined,
      });
    }
  }

  private ensureGtag(): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    if (typeof window.gtag === 'function' && this.scriptLoading === null) {
      // puede existir stub sin script cargado
    }
    if (this.scriptLoading) return this.scriptLoading;

    this.scriptLoading = new Promise<void>((resolve) => {
      window.dataLayer = window.dataLayer || [];
      if (typeof window.gtag !== 'function') {
        window.gtag = function gtag(...args: unknown[]) {
          window.dataLayer!.push(args);
        };
      }
      window.gtag('js', new Date());
      window.gtag('config', this.measurementId, { send_page_view: false });

      const existing = document.querySelector<HTMLScriptElement>(
        `script[data-ga-id="${this.measurementId}"]`,
      );
      if (existing) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(this.measurementId)}`;
      script.dataset['gaId'] = this.measurementId;
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
    return this.scriptLoading;
  }
}
