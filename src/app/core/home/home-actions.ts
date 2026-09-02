import {
  AuthUser,
  isSuperAdminUser,
} from '../auth/auth.models';
import {
  canAccessAppRoute,
  canAccessToolbarAction,
  type ShopRouteFeatures,
} from '../auth/route-access';

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

/** Orden de prioridad en la grilla de atajos del inicio. */
const HOME_SHORTCUT_DEFS: HomeShortcutDef[] = [
  { id: 'new-closing', label: 'Nuevo cierre', icon: 'add', route: '/closings/new', primary: true },
  { id: 'closings', label: 'Cierres', icon: 'point_of_sale', route: '/closings' },
  { id: 'quick-expense', label: 'Gasto rápido', icon: 'payments', action: 'quick-expense', primary: true },
  { id: 'reservations', label: 'Reservas', icon: 'table_restaurant', route: '/reservations' },
  { id: 'waiting-list', label: 'Lista de espera', icon: 'hourglass_top', route: '/waiting-list' },
  { id: 'tips', label: 'Propinas', icon: 'volunteer_activism', route: '/tips' },
  { id: 'payments', label: 'Pagos', icon: 'local_shipping', route: '/payments/suppliers' },
  { id: 'reports', label: 'Reportes', icon: 'insights', route: '/reports' },
  { id: 'cash-withdrawals', label: 'A retirar', icon: 'payments', route: '/cash-withdrawals' },
  { id: 'settlements', label: 'Rendiciones', icon: 'account_balance_wallet', route: '/settlements' },
  { id: 'expenses', label: 'Gastos', icon: 'payments', route: '/expenses' },
  { id: 'incomes', label: 'Ingresos', icon: 'south_west', route: '/incomes' },
  { id: 'transactions', label: 'Transacciones', icon: 'receipt_long', route: '/transactions' },
  { id: 'stock', label: 'Alimentos', icon: 'inventory', route: '/stock' },
  { id: 'beverage-stock', label: 'Bebidas', icon: 'local_bar', route: '/beverage-stock' },
  { id: 'shortages', label: 'Faltantes', icon: 'error_outline', route: '/shortages' },
  { id: 'orders', label: 'Pedidos', icon: 'local_shipping', route: '/orders' },
  { id: 'attendance', label: 'Presentismo', icon: 'event_available', route: '/attendance' },
  { id: 'my-production', label: 'Mis horas', icon: 'restaurant', route: '/my-production' },
  { id: 'reimbursements', label: 'Reintegros', icon: 'receipt_long', route: '/reimbursements' },
  { id: 'employees', label: 'Empleados', icon: 'groups', route: '/employees' },
  { id: 'admin-shop', label: 'Configuración del local', icon: 'storefront', route: '/admin/shop' },
  { id: 'admin-shops', label: 'Crear local', icon: 'add_business', route: '/admin/shops', global: true },
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
