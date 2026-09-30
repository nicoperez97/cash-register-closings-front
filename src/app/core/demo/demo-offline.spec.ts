import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEMO_LOCAL_TOKEN,
  DEMO_REQUIRED_GET_PATHS,
  DEMO_STORAGE_KEYS,
  DemoPaymentStatus,
  DemoShortageLevel,
  demoShopRel,
} from './demo-constants';
import {
  assertDemoNeverHitsNetwork,
  isBackendApiUrl,
  isDemoSession,
  mustHandleDemoLocally,
} from './demo-offline';
import { resolveDemoGet } from './demo-mock.resolver';
import { DEMO_SHOP_ID, buildDemoAuthUser, buildDemoShop } from './demo-fixtures';
import { DemoOverlayStore } from './demo-overlay.store';

describe('demo-offline', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = String(v);
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detecta URLs de API relativas y absolutas', () => {
    expect(isBackendApiUrl('/api/v1/shops')).toBe(true);
    expect(isBackendApiUrl('/api/v1/auth/me')).toBe(true);
    expect(isBackendApiUrl('http://localhost:3000/api/v1/shops/x')).toBe(true);
    expect(isBackendApiUrl('/assets/logo.png')).toBe(false);
    expect(isBackendApiUrl('https://www.googletagmanager.com/gtag/js')).toBe(false);
  });

  it('isDemoSession solo con token/user demo', () => {
    expect(isDemoSession()).toBe(false);
    localStorage.setItem(DEMO_STORAGE_KEYS.token, DEMO_LOCAL_TOKEN);
    expect(isDemoSession()).toBe(true);
    localStorage.removeItem(DEMO_STORAGE_KEYS.token);
    localStorage.setItem(
      DEMO_STORAGE_KEYS.user,
      JSON.stringify({ isDemo: true, email: 'demo@cierres.example' }),
    );
    expect(isDemoSession()).toBe(true);
  });

  it('mustHandleDemoLocally exige demo + API', () => {
    expect(mustHandleDemoLocally('/api/v1/shops')).toBe(false);
    localStorage.setItem(DEMO_STORAGE_KEYS.token, DEMO_LOCAL_TOKEN);
    expect(mustHandleDemoLocally('/api/v1/shops')).toBe(true);
    expect(mustHandleDemoLocally('/assets/x.png')).toBe(false);
  });

  it('assertDemoNeverHitsNetwork lanza si demo intenta next a la API', () => {
    localStorage.setItem(DEMO_STORAGE_KEYS.token, DEMO_LOCAL_TOKEN);
    expect(() => assertDemoNeverHitsNetwork('/api/v1/shops', true)).toThrow(
      /no puede llamar a la red/i,
    );
    expect(() => assertDemoNeverHitsNetwork('/api/v1/shops', false)).not.toThrow();
    expect(() => assertDemoNeverHitsNetwork('/assets/x.png', true)).not.toThrow();
  });
});

describe('demo fixtures + resolver (sin red)', () => {
  it('buildDemoShop tiene módulos clave prendidos', () => {
    const shop = buildDemoShop();
    expect(shop.reservationsEnabled).toBe(true);
    expect(shop.waitingListEnabled).toBe(true);
    expect(shop.tipsEnabled).toBe(true);
    expect(shop.settlementsEnabled).toBe(true);
    expect(shop.onlineOrderingEnabled).toBe(true);
    expect(shop.waiterOrderingEnabled).toBe(true);
    expect(shop.menuEnabled).toBe(true);
    expect(shop.takeawayEnabled).toBe(true);
    expect(shop.deliveryEnabled).toBe(true);
  });

  it('buildDemoAuthUser es isDemo y no depende de JWT real', () => {
    const user = buildDemoAuthUser();
    expect(user.isDemo).toBe(true);
    expect(user.shops[0]?.id).toBe(DEMO_SHOP_ID);
  });

  it('pagos demo usan estados del front (no PENDING_PAYMENT inventado)', () => {
    const payments = buildDemoAuthUser(); // ensure fixtures load
    void payments;
    const store = new DemoOverlayStore();
    const body = resolveDemoGet(
      demoShopRel(DEMO_SHOP_ID, 'payments'),
      `/api/v1/shops/${DEMO_SHOP_ID}/payments`,
      store,
    ) as Array<{ status: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    for (const p of body) {
      expect(Object.values(DemoPaymentStatus)).toContain(p.status);
    }
  });

  it('faltantes usan niveles válidos del front', () => {
    const store = new DemoOverlayStore();
    const body = resolveDemoGet(
      demoShopRel(DEMO_SHOP_ID, 'shortages'),
      `/api/v1/shops/${DEMO_SHOP_ID}/shortages`,
      store,
    ) as Array<{ level: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    for (const row of body) {
      expect(Object.values(DemoShortageLevel)).toContain(row.level);
    }
  });

  it('ventas summary trae totals (evita loading infinito)', () => {
    const store = new DemoOverlayStore();
    const body = resolveDemoGet(
      demoShopRel(DEMO_SHOP_ID, 'sales-reports/menu/summary'),
      `/api/v1/shops/${DEMO_SHOP_ID}/sales-reports/menu/summary`,
      store,
    ) as { totals?: { amount?: number } };
    expect(body.totals).toBeTruthy();
    expect(typeof body.totals?.amount).toBe('number');
  });

  it('resuelve todas las rutas GET mínimas sin red', () => {
    const store = new DemoOverlayStore();
    for (const path of DEMO_REQUIRED_GET_PATHS) {
      const body = resolveDemoGet(path, `/api/v1${path}`, store);
      expect(body).not.toBeUndefined();
    }
    const shopPaths = [
      'accounts',
      'concepts',
      'menu',
      'promos',
      'shortages',
      'movements',
      'payments',
      'closings',
      'service-rules',
      'partner-splits',
      'sales-reports/products/summary',
      'reports/concepts',
      'stock/products',
      'suppliers',
      'users',
    ];
    for (const rest of shopPaths) {
      const rel = demoShopRel(DEMO_SHOP_ID, rest);
      const body = resolveDemoGet(rel, `/api/v1${rel}`, store);
      expect(body).not.toBeUndefined();
      // Nunca devolver {} suelto en listados críticos
      if (rest === 'shortages' || rest === 'accounts' || rest === 'payments') {
        expect(Array.isArray(body)).toBe(true);
      }
    }
  });
});
