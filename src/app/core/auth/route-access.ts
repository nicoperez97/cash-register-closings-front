import {
  AuthUser,
  canAccessShopAdmin,
  canAccessShopConfig,
  canConfigureShopOpeningBalances,
  canManageOrderingCatalog,
  canManageShopUsers,
  canSeeShopConfigSection,
  canViewClosingsList,
  hasShopPermission,
  isClosingsCreateOnly,
  isShopAdministrator,
  isSuperAdminUser,
} from './auth.models';
import { navItemIdForRoute } from '../layout/nav-config';
import { isNavPathHidden, type ShopNavConfig } from '../layout/nav-config';
import {
  permissionForPublicPage,
} from '../shop/public-page-access';

/** Flags del local que condicionan rutas de salón / propinas / rendiciones. */
export type ShopRouteFeatures = {
  reservationsEnabled?: boolean;
  waitingListEnabled?: boolean;
  tipsEnabled?: boolean;
  settlementsEnabled?: boolean;
  onlineOrderingEnabled?: boolean;
  waiterOrderingEnabled?: boolean;
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

  // Páginas públicas: listado de enlaces solo admin; visor por permiso de página.
  if (path === '/admin/public-pages' || path === '/admin/public-pages/') {
    return isShopAdministrator(user, shopId);
  }
  if (path.startsWith('/admin/public-pages/')) {
    const pageId = path.slice('/admin/public-pages/'.length).split('/')[0] || '';
    const perm = permissionForPublicPage(pageId);
    return perm ? hasShopPermission(user, shopId, perm) : false;
  }

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
  if (path === '/closings' || path === '/closings/') {
    return canViewClosingsList(user, shopId);
  }
  if (path.startsWith('/closings/')) {
    return (
      hasShopPermission(user, shopId, 'closings.update') ||
      (!isClosingsCreateOnly(user, shopId) &&
        hasShopPermission(user, shopId, 'closings.read'))
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
  if (path.startsWith('/reports/concepts')) {
    return hasShopPermission(user, shopId, 'reportsConcepts.read');
  }
  if (path.startsWith('/reports/products')) {
    return hasShopPermission(user, shopId, 'reportsProducts.read');
  }
  if (path.startsWith('/reports/stats')) {
    return hasShopPermission(user, shopId, 'reportsStats.read');
  }
  if (path.startsWith('/reports')) {
    return hasShopPermission(user, shopId, 'reports.view');
  }
  if (path.startsWith('/admin/shops')) {
    return isSuperAdminUser(user);
  }
  if (path.startsWith('/admin/shop/')) {
    const section = path.split('/')[3]?.split('?')[0] ?? '';
    if (
      section === 'identidad' ||
      section === 'operacion' ||
      section === 'pedidos' ||
      section === 'comanda' ||
      section === 'comanderas' ||
      section === 'dispositivos' ||
      section === 'menu' ||
      section === 'avanzado'
    ) {
      return canSeeShopConfigSection(user, shopId, section);
    }
  }
  if (path.startsWith('/admin/shop')) {
    return (
      canSeeShopConfigSection(user, shopId, 'resumen') ||
      canSeeShopConfigSection(user, shopId, 'identidad') ||
      canSeeShopConfigSection(user, shopId, 'operacion') ||
      canSeeShopConfigSection(user, shopId, 'pedidos') ||
      canSeeShopConfigSection(user, shopId, 'comanda') ||
      canSeeShopConfigSection(user, shopId, 'comanderas') ||
      canSeeShopConfigSection(user, shopId, 'dispositivos') ||
      canSeeShopConfigSection(user, shopId, 'menu') ||
      canSeeShopConfigSection(user, shopId, 'carta') ||
      canSeeShopConfigSection(user, shopId, 'avanzado') ||
      canManageOrderingCatalog(user, shopId)
    );
  }
  if (path.startsWith('/admin/messages')) {
    return canAccessShopAdmin(user, shopId);
  }
  if (path.startsWith('/admin/menu')) {
    return (
      canSeeShopConfigSection(user, shopId, 'carta') &&
      (canAccessShopConfig(user, shopId) || canManageOrderingCatalog(user, shopId))
    );
  }
  if (path.startsWith('/admin/promos')) {
    return (
      canSeeShopConfigSection(user, shopId, 'carta') &&
      (canAccessShopConfig(user, shopId) ||
        hasShopPermission(user, shopId, 'promos.manage') ||
        canManageOrderingCatalog(user, shopId))
    );
  }
  if (path.startsWith('/admin/qr')) {
    return canAccessShopAdmin(user, shopId);
  }
  if (path.startsWith('/admin/instrucciones')) {
    return canAccessShopAdmin(user, shopId);
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
    return canAccessShopAdmin(user, shopId);
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
  if (path.startsWith('/account-balances')) {
    return hasShopPermission(user, shopId, 'accountBalances.read');
  }
  if (path.startsWith('/transactions')) {
    return hasShopPermission(user, shopId, 'transactions.read');
  }
  if (path.startsWith('/partner-splits')) {
    return hasShopPermission(user, shopId, 'partnerSplits.read');
  }
  if (path.startsWith('/splits')) {
    return hasShopPermission(user, shopId, 'splits.read');
  }
  if (path.startsWith('/my-production')) {
    return hasShopPermission(user, shopId, 'attendance.self');
  }
  if (path.startsWith('/production-attendance')) {
    return hasShopPermission(user, shopId, 'productionAttendance.read');
  }
  if (path.startsWith('/attendance')) {
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
  if (path.startsWith('/salon/mesas')) {
    return (
      hasShopPermission(user, shopId, 'salonTables.read') &&
      featureOn(features, 'reservationsEnabled')
    );
  }
  if (path.startsWith('/salon/diagrama')) {
    return (
      hasShopPermission(user, shopId, 'diagrama.read') &&
      featureOn(features, 'reservationsEnabled')
    );
  }
  if (path.startsWith('/salon/reglas')) {
    return (
      hasShopPermission(user, shopId, 'salonRules.read') &&
      featureOn(features, 'reservationsEnabled')
    );
  }
  if (path.startsWith('/salon/horarios')) {
    return (
      hasShopPermission(user, shopId, 'salonHours.read') &&
      featureOn(features, 'reservationsEnabled')
    );
  }
  if (path === '/salon' || path.startsWith('/salon/')) {
    return (
      featureOn(features, 'reservationsEnabled') &&
      (hasShopPermission(user, shopId, 'salonTables.read') ||
        hasShopPermission(user, shopId, 'diagrama.read') ||
        hasShopPermission(user, shopId, 'salonRules.read') ||
        hasShopPermission(user, shopId, 'salonHours.read'))
    );
  }
  if (path.startsWith('/tips')) {
    return hasShopPermission(user, shopId, 'tips.read') && featureOn(features, 'tipsEnabled');
  }
  if (path.startsWith('/payments/suppliers')) {
    return hasShopPermission(user, shopId, 'paymentsSuppliers.read');
  }
  if (path.startsWith('/payments/services')) {
    return hasShopPermission(user, shopId, 'paymentsServices.read');
  }
  if (path.startsWith('/payments/employees')) {
    return hasShopPermission(user, shopId, 'paymentsEmployees.read');
  }
  if (path.startsWith('/payments/partners')) {
    return hasShopPermission(user, shopId, 'paymentsPartners.read');
  }
  if (path.startsWith('/payments')) {
    return (
      hasShopPermission(user, shopId, 'paymentsSuppliers.read') ||
      hasShopPermission(user, shopId, 'paymentsServices.read') ||
      hasShopPermission(user, shopId, 'paymentsEmployees.read') ||
      hasShopPermission(user, shopId, 'paymentsPartners.read') ||
      hasShopPermission(user, shopId, 'payments.read')
    );
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
  if (path.startsWith('/customer-orders')) {
    return (
      featureOn(features, 'onlineOrderingEnabled') &&
      (hasShopPermission(user, shopId, 'customerOrders.read') ||
        hasShopPermission(user, shopId, 'orderingCatalog.manage'))
    );
  }
  if (path.startsWith('/integrations')) {
    return (
      hasShopPermission(user, shopId, 'integrations.read') ||
      hasShopPermission(user, shopId, 'integrations.manage')
    );
  }
  if (path.startsWith('/comanda')) {
    return (
      featureOn(features, 'waiterOrderingEnabled') &&
      (hasShopPermission(user, shopId, 'comanda.manage') ||
        hasShopPermission(user, shopId, 'shops.manage'))
    );
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
  if (path === '/g' || path.startsWith('/g/')) {
    return true;
  }
  if (path === '/forbidden' || path.startsWith('/forbidden')) {
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
