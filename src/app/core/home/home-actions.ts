import {
  AuthUser,
  isSuperAdminUser,
} from '../auth/auth.models';
import {
  canAccessAppRoute,
  canAccessToolbarAction,
  type ShopRouteFeatures,
} from '../auth/route-access';
import {
  APP_SHORTCUT_DEFS,
  navItemById,
  navItemIdForRoute,
} from '../layout/nav-config';

export type HomeShortcut =
  | {
      id: string;
      kind: 'route';
      label: string;
      icon: string;
      route: string;
      primary?: boolean;
    }
  | {
      id: string;
      kind: 'action';
      label: string;
      icon: string;
      action: 'quick-expense';
      primary?: boolean;
    };

type HomeShortcutDef = {
  id: string;
  label: string;
  icon: string;
  route?: string;
  action?: 'quick-expense';
  primary?: boolean;
  /** Rutas que no requieren local seleccionado. */
  global?: boolean;
};

function catalogUi(routeOrId: string): { label: string; icon: string } | null {
  const byId = navItemById(routeOrId);
  if (byId) return { label: byId.label, icon: byId.icon };
  const short = APP_SHORTCUT_DEFS.find((d) => d.id === routeOrId);
  if (short) return { label: short.label, icon: short.icon };
  const navId = navItemIdForRoute(routeOrId);
  if (navId) {
    const d = navItemById(navId);
    if (d) return { label: d.label, icon: d.icon };
  }
  return null;
}

function homeDef(
  id: string,
  opts: {
    route?: string;
    action?: 'quick-expense';
    primary?: boolean;
    global?: boolean;
    label?: string;
    icon?: string;
  },
): HomeShortcutDef {
  const fromCatalog =
    (opts.route ? catalogUi(opts.route) : null) ??
    catalogUi(id) ??
    (opts.action === 'quick-expense' ? catalogUi('quick-expense') : null);
  return {
    id,
    label: opts.label ?? fromCatalog?.label ?? id,
    icon: opts.icon ?? fromCatalog?.icon ?? 'apps',
    route: opts.route,
    action: opts.action,
    primary: opts.primary,
    global: opts.global,
  };
}

/** Orden de prioridad en la grilla de atajos del inicio (labels desde el catálogo). */
const HOME_SHORTCUT_DEFS: HomeShortcutDef[] = [
  homeDef('new-closing', { route: '/closings/new', primary: true }),
  homeDef('closings', { route: '/closings' }),
  homeDef('quick-expense', { action: 'quick-expense', primary: true }),
  homeDef('reservations', { route: '/reservations' }),
  homeDef('waiting-list', { route: '/waiting-list' }),
  homeDef('tips', { route: '/tips' }),
  homeDef('payments', { route: '/g/pagos' }),
  homeDef('reports', { route: '/reports' }),
  homeDef('cash-withdrawals', { route: '/cash-withdrawals' }),
  homeDef('settlements', { route: '/settlements' }),
  homeDef('expenses', { route: '/expenses' }),
  homeDef('incomes', { route: '/incomes' }),
  homeDef('transactions', { route: '/transactions' }),
  homeDef('stock', { route: '/stock' }),
  homeDef('beverage-stock', { route: '/beverage-stock' }),
  homeDef('shortages', { route: '/shortages' }),
  homeDef('orders', { route: '/orders' }),
  homeDef('attendance', { route: '/attendance' }),
  homeDef('my-production', { route: '/my-production' }),
  homeDef('reimbursements', { route: '/reimbursements' }),
  homeDef('employees', { route: '/employees' }),
  homeDef('admin-shop', { route: '/admin/shop' }),
  homeDef('admin-shops', {
    route: '/admin/shops',
    global: true,
    label: 'Crear local',
    icon: 'add_business',
  }),
];

function routeOpts(features?: ShopRouteFeatures | null) {
  return { features: features ?? {} };
}

function canUseShortcut(
  def: HomeShortcutDef,
  user: AuthUser,
  shopId: string | null,
  features?: ShopRouteFeatures | null,
): boolean {
  if (def.action === 'quick-expense') {
    return !!shopId && canAccessToolbarAction('quick-expense', user, shopId, routeOpts(features));
  }
  if (!def.route) return false;
  if (def.route.startsWith('/g/')) {
    const groupId = def.route.slice(3).split('/')[0];
    const probes: Record<string, string[]> = {
      pagos: [
        '/payments/suppliers',
        '/payments/services',
        '/payments/employees',
        '/payments/partners',
        '/suppliers',
        '/services',
      ],
    };
    const routes = probes[groupId] ?? [];
    if (!shopId || !routes.length) return false;
    return routes.some((r) => canAccessAppRoute(r, user, shopId, routeOpts(features)));
  }
  if (def.global) {
    return isSuperAdminUser(user);
  }
  if (!shopId) return false;
  return canAccessAppRoute(def.route, user, shopId, routeOpts(features));
}

export type HomeShortcutLayout = {
  all: HomeShortcut[];
  primary: HomeShortcut[];
  /** Layout compacto en grilla cuando hay muchos módulos visibles. */
  useCompactGrid: boolean;
};

const HOME_COMPACT_THRESHOLD = 7;

export function homeShortcutLayout(
  user: AuthUser | null,
  shopId: string | null,
  features?: ShopRouteFeatures | null,
  excludeIds?: string[],
): HomeShortcutLayout {
  const excluded = new Set(excludeIds ?? []);
  const all = homeShortcutsFor(user, shopId, features).filter((s) => !excluded.has(s.id));
  const primary = all.filter((s) => s.primary);
  const useCompactGrid = all.length >= HOME_COMPACT_THRESHOLD;
  return { all, primary, useCompactGrid };
}

export function homeShortcutsFor(
  user: AuthUser | null,
  shopId: string | null,
  features?: ShopRouteFeatures | null,
): HomeShortcut[] {
  if (!user) return [];
  const out: HomeShortcut[] = [];
  for (const def of HOME_SHORTCUT_DEFS) {
    if (!canUseShortcut(def, user, shopId, features)) continue;
    if (def.action === 'quick-expense') {
      out.push({
        id: def.id,
        kind: 'action',
        label: def.label,
        icon: def.icon,
        action: def.action,
        primary: def.primary,
      });
    } else if (def.route) {
      out.push({
        id: def.id,
        kind: 'route',
        label: def.label,
        icon: def.icon,
        route: def.route,
        primary: def.primary,
      });
    }
  }
  return out;
}

export function homePrimaryShortcutId(
  user: AuthUser | null,
  shopId: string | null,
): string | null {
  if (!user) return null;
  if (!shopId && isSuperAdminUser(user)) return 'admin-shops';
  if (shopId && canAccessAppRoute('/closings/new', user, shopId, routeOpts())) {
    return 'new-closing';
  }
  return null;
}
