import {
  AuthUser,
  canConfigureShopOpeningBalances,
  canManageShop,
  canManageShopUsers,
  hasShopPermission,
  isSuperAdminUser,
} from './auth.models';
import { navItemIdForRoute } from '../layout/nav-config';
import { isNavPathHidden, type ShopNavConfig } from '../layout/nav-config';

/** Flags del local que condicionan rutas de salón / propinas / rendiciones. */
export type ShopRouteFeatures = {
  reservationsEnabled?: boolean;
  waitingListEnabled?: boolean;
  tipsEnabled?: boolean;
  settlementsEnabled?: boolean;
};

export type RouteAccessOptions = {
  features?: ShopRouteFeatures | null;
  navConfig?: ShopNavConfig | null;
  /** Si false, no aplica ocultar por navConfig (p. ej. editor de perfil). */
  respectNavHidden?: boolean;
};

const DEFAULT_FEATURES: ShopRouteFeatures = {};

function featuresOf(
  opts?: RouteAccessOptions | null,
): ShopRouteFeatures {
  return opts?.features ?? DEFAULT_FEATURES;
}

function featureOn(
  features: ShopRouteFeatures,
  key: keyof ShopRouteFeatures,
): boolean {
  return !!features[key];
}

/** ¿Puede abrir esta ruta de la app en el local activo? */
export function canAccessAppRoute(
  route: string,
  user: AuthUser | null,
  shopId: string | null,
  opts?: RouteAccessOptions | null,
): boolean {
  if (!user || !shopId) return false;

  const path = route.split('?')[0] || route;
  const features = featuresOf(opts);

  if (
    opts?.respectNavHidden !== false &&
    !isSuperAdminUser(user) &&
    isNavPathHidden(path, opts?.navConfig)
  ) {
    return false;
  }

  if (path.startsWith('/closings/new')) {
    return hasShopPermission(user, shopId, 'closings.create');
  }
  if (path.startsWith('/closings/')) {
    return (
      hasShopPermission(user, shopId, 'closings.update') ||
      hasShopPermission(user, shopId, 'closings.read')
    );
  }
  if (path.startsWith('/closings')) {
    return (
      hasShopPermission(user, shopId, 'closings.read') ||
      hasShopPermission(user, shopId, 'closings.create')
    );
  }
  if (path.startsWith('/cash-withdrawals')) {
    return hasShopPermission(user, shopId, 'cashWithdrawals.read');
  }
  if (path.startsWith('/settlements')) {
    return (
      hasShopPermission(user, shopId, 'settlements.read') &&
      featureOn(features, 'settlementsEnabled')
    );
  }
  if (path.startsWith('/reports')) {
    return hasShopPermission(user, shopId, 'reports.view');
  }
  if (path.startsWith('/admin/shops')) {
    return isSuperAdminUser(user);
  }
  if (path.startsWith('/admin/shop')) {
    return canManageShop(user, shopId);
  }
  if (path.startsWith('/admin/messages')) {
    return canManageShop(user, shopId);
  }
  if (path.startsWith('/admin/menu')) {
    return canManageShop(user, shopId);
  }
  if (path.startsWith('/admin/qr')) {
    return canManageShop(user, shopId);
  }
  if (path.startsWith('/admin/instrucciones')) {
    return canManageShop(user, shopId);
  }
  if (path.startsWith('/admin/users') || path.startsWith('/admin/user-activity')) {
    return canManageShopUsers(user, shopId);
  }
  if (path.startsWith('/admin/accounts')) {
    return hasShopPermission(user, shopId, 'accounts.manage');
  }
  if (path.startsWith('/admin/concepts')) {
    return hasShopPermission(user, shopId, 'concepts.manage');
  }
  if (path.startsWith('/admin/sales-systems') || path.startsWith('/admin/pos-products')) {
    return canManageShop(user, shopId);
  }
  if (path.startsWith('/employees')) {
    return hasShopPermission(user, shopId, 'employees.read');
  }
  if (path.startsWith('/vacations')) {
    return hasShopPermission(user, shopId, 'vacations.read');
  }
  if (path.startsWith('/candidates')) {
    return hasShopPermission(user, shopId, 'candidates.read');
  }
  if (path.startsWith('/expenses') || path.startsWith('/movements')) {
    return hasShopPermission(user, shopId, 'expenses.read');
  }
  if (path.startsWith('/incomes')) {
    return hasShopPermission(user, shopId, 'incomes.read');
  }
  if (path.startsWith('/account-transfers')) {
    return hasShopPermission(user, shopId, 'accountTransfers.read');
  }
  if (path.startsWith('/transactions')) {
    return (
      hasShopPermission(user, shopId, 'expenses.read') ||
      hasShopPermission(user, shopId, 'incomes.read') ||
      hasShopPermission(user, shopId, 'accountTransfers.read')
    );
  }
  if (path.startsWith('/partner-splits') || path.startsWith('/splits')) {
    return hasShopPermission(user, shopId, 'partnerSplits.read');
  }
  if (path.startsWith('/my-production')) {
    return hasShopPermission(user, shopId, 'attendance.self');
  }
  if (path.startsWith('/attendance') || path.startsWith('/production-attendance')) {
    return hasShopPermission(user, shopId, 'attendance.read');
  }
  if (path.startsWith('/reservations')) {
    return (
      hasShopPermission(user, shopId, 'reservations.read') &&
      featureOn(features, 'reservationsEnabled')
    );
  }
  if (path.startsWith('/waiting-list')) {
    return (
      hasShopPermission(user, shopId, 'waitingList.read') &&
      featureOn(features, 'waitingListEnabled')
    );
  }
  if (path.startsWith('/salon')) {
    return (
      hasShopPermission(user, shopId, 'reservations.read') &&
      featureOn(features, 'reservationsEnabled')
    );
  }
  if (path.startsWith('/tips')) {
    return hasShopPermission(user, shopId, 'tips.read') && featureOn(features, 'tipsEnabled');
  }
  if (path.startsWith('/payments')) {
    return hasShopPermission(user, shopId, 'payments.read');
  }
  if (path.startsWith('/suppliers')) {
    return hasShopPermission(user, shopId, 'suppliers.read');
  }
  if (path.startsWith('/services')) {
    return hasShopPermission(user, shopId, 'services.read');
  }
  if (path === '/stock' || path.startsWith('/stock/')) {
    return hasShopPermission(user, shopId, 'stock.read');
  }
  if (path === '/beverage-stock' || path.startsWith('/beverage-stock/')) {
    return hasShopPermission(user, shopId, 'beverageStock.read');
  }
  if (path.startsWith('/shortages')) {
    return hasShopPermission(user, shopId, 'shortages.read');
  }
  if (path.startsWith('/orders')) {
    return hasShopPermission(user, shopId, 'orders.read');
  }
  if (path.startsWith('/salaries') || path.startsWith('/payroll')) {
    return hasShopPermission(user, shopId, 'payroll.read');
  }
  if (path.startsWith('/commissions')) {
    return hasShopPermission(user, shopId, 'commissions.read');
  }
  if (path.startsWith('/reimbursements')) {
    return (
      hasShopPermission(user, shopId, 'reimbursements.read') ||
      hasShopPermission(user, shopId, 'reimbursements.manage') ||
      hasShopPermission(user, shopId, 'reimbursements.self')
    );
  }
  if (path.startsWith('/service-rules')) {
    return hasShopPermission(user, shopId, 'serviceRules.read');
  }
  if (path === '/' || path === '') {
    return true;
  }
  if (path === '/profile') {
    return true;
  }
  if (path.startsWith('/admin/opening-balances')) {
    return canConfigureShopOpeningBalances(user);
  }

  // Rutas desconocidas: denegar (antes se permitía por defecto).
  return false;
}

/** Atajos built-in de la toolbar (id → ruta o acción especial). */
const TOOLBAR_BUILTIN_ACCESS: Record<string, string> = {
  'quick-expense': '__action:quick-expense',
  closings: '/closings',
  shortages: '/shortages',
  payments: '/payments/suppliers',
  reservations: '/reservations',
  'waiting-list': '/waiting-list',
  tips: '/tips',
  'new-closing': '/closings/new',
  'my-hours': '/my-production',
  'my-reimbursements': '/reimbursements',
  stock: '/stock',
  'beverage-stock': '/beverage-stock',
};

export function canAccessToolbarAction(
  actionId: string,
  user: AuthUser | null,
  shopId: string | null,
  opts?: RouteAccessOptions | null,
): boolean {
  if (!user || !shopId) return false;
  const target = TOOLBAR_BUILTIN_ACCESS[actionId];
  if (target === '__action:quick-expense') {
    return hasShopPermission(user, shopId, 'expenses.manage');
  }
  if (target) {
    return canAccessAppRoute(target, user, shopId, opts);
  }
  return false;
}

export function canAccessNavItem(
  navItemId: string,
  route: string,
  user: AuthUser | null,
  shopId: string | null,
  opts?: RouteAccessOptions | null,
): boolean {
  if (navItemId === 'home') return true;
  if (!user || !shopId) return false;
  return canAccessAppRoute(route, user, shopId, opts);
}

/** Resuelve si una ruta custom del menú/atajos es accesible. */
export function canAccessCustomRoute(
  route: string,
  user: AuthUser | null,
  shopId: string | null,
  opts?: RouteAccessOptions | null,
): boolean {
  return canAccessAppRoute(route, user, shopId, opts);
}

/** Id de ítem de nav para una ruta (utilidad para editores). */
export { navItemIdForRoute };
