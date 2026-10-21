import {
  AuthUser,
  canAccessShopAdmin,
  canAccessShopConfig,
  canConfigureShopOpeningBalances,
  canManageOrderingCatalog,
  canManageShopUsers,
  canSeeShopConfigSection,
  canViewClosingsList,
  canViewOrderingCatalog,
  canViewShopUsers,
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

  if (path.startsWith('/admin/closings/new')) {
    return hasShopPermission(user, shopId, 'closings.create');
  }
  if (path === '/admin/closings' || path === '/admin/closings/') {
    return canViewClosingsList(user, shopId);
  }
  if (path.startsWith('/admin/closings/')) {
    return (
      hasShopPermission(user, shopId, 'closings.update') ||
      (!isClosingsCreateOnly(user, shopId) &&
        hasShopPermission(user, shopId, 'closings.read'))
    );
  }
  if (path.startsWith('/admin/cash-withdrawals')) {
    return hasShopPermission(user, shopId, 'cashWithdrawals.read');
  }
  if (path.startsWith('/admin/settlements')) {
    return (
      hasShopPermission(user, shopId, 'settlements.read') &&
      featureOn(features, 'settlementsEnabled')
    );
  }
  if (path.startsWith('/admin/reports/concepts')) {
    return hasShopPermission(user, shopId, 'reportsConcepts.read');
  }
  if (path.startsWith('/admin/reports/sales')) {
    return hasShopPermission(user, shopId, 'reportsSales.read');
  }
  if (path.startsWith('/admin/reports/products')) {
    return hasShopPermission(user, shopId, 'reportsProducts.read');
  }
  if (path.startsWith('/admin/reports/stats')) {
    return hasShopPermission(user, shopId, 'reportsStats.read');
  }
  if (path.startsWith('/admin/reports')) {
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
      (canAccessShopConfig(user, shopId) || canViewOrderingCatalog(user, shopId))
    );
  }
  if (path.startsWith('/admin/promos')) {
    return (
      canSeeShopConfigSection(user, shopId, 'carta') &&
      (canAccessShopConfig(user, shopId) ||
        hasShopPermission(user, shopId, 'promos.read') ||
        hasShopPermission(user, shopId, 'promos.manage') ||
        canViewOrderingCatalog(user, shopId))
    );
  }
  if (path.startsWith('/admin/qr')) {
    return canAccessShopAdmin(user, shopId);
  }
  if (path.startsWith('/admin/instrucciones')) {
    return canAccessShopAdmin(user, shopId);
  }
  if (path.startsWith('/admin/users') || path.startsWith('/admin/user-activity')) {
    if (path.includes('/permisos')) return canManageShopUsers(user, shopId);
    return canViewShopUsers(user, shopId);
  }
  if (path.startsWith('/admin/accounts')) {
    return (
      hasShopPermission(user, shopId, 'accounts.read') ||
      hasShopPermission(user, shopId, 'accounts.manage')
    );
  }
  if (path.startsWith('/admin/concepts')) {
    return (
      hasShopPermission(user, shopId, 'concepts.read') ||
      hasShopPermission(user, shopId, 'concepts.manage')
    );
  }
  if (path.startsWith('/admin/sales-systems') || path.startsWith('/admin/pos-products')) {
    return canAccessShopAdmin(user, shopId);
  }
  if (path.startsWith('/admin/employees')) {
    return hasShopPermission(user, shopId, 'employees.read');
  }
  if (path.startsWith('/admin/vacations')) {
    return hasShopPermission(user, shopId, 'vacations.read');
  }
  if (path.startsWith('/admin/candidates')) {
    return hasShopPermission(user, shopId, 'candidates.read');
  }
  if (path.startsWith('/admin/expenses') || path.startsWith('/admin/movements')) {
    return hasShopPermission(user, shopId, 'expenses.read');
  }
  if (path.startsWith('/admin/incomes')) {
    return hasShopPermission(user, shopId, 'incomes.read');
  }
  if (path.startsWith('/admin/account-transfers')) {
    return hasShopPermission(user, shopId, 'accountTransfers.read');
  }
  if (path.startsWith('/admin/account-balances')) {
    return hasShopPermission(user, shopId, 'accountBalances.read');
  }
  if (path.startsWith('/admin/transactions')) {
    return hasShopPermission(user, shopId, 'transactions.read');
  }
  if (path.startsWith('/admin/partner-splits')) {
    return hasShopPermission(user, shopId, 'partnerSplits.read');
  }
  if (path.startsWith('/admin/splits')) {
    return hasShopPermission(user, shopId, 'splits.read');
  }
  if (path.startsWith('/admin/my-production')) {
    return hasShopPermission(user, shopId, 'attendance.self');
  }
  if (path.startsWith('/admin/production-attendance')) {
    return hasShopPermission(user, shopId, 'productionAttendance.read');
  }
  if (path.startsWith('/admin/attendance/fichar')) {
    return hasShopPermission(user, shopId, 'attendance.checkIn');
  }
  if (path.startsWith('/admin/attendance')) {
    return hasShopPermission(user, shopId, 'attendance.read');
  }
  if (path.startsWith('/admin/reservations')) {
    return (
      hasShopPermission(user, shopId, 'reservations.read') &&
      featureOn(features, 'reservationsEnabled')
    );
  }
  if (path.startsWith('/admin/waiting-list')) {
    return (
      hasShopPermission(user, shopId, 'waitingList.read') &&
      featureOn(features, 'waitingListEnabled')
    );
  }
  if (path.startsWith('/admin/salon/mesas')) {
    return (
      hasShopPermission(user, shopId, 'salonTables.read') &&
      featureOn(features, 'reservationsEnabled')
    );
  }
  if (path.startsWith('/admin/salon/diagrama')) {
    return (
      hasShopPermission(user, shopId, 'diagrama.read') &&
      featureOn(features, 'reservationsEnabled')
    );
  }
  if (path.startsWith('/admin/salon/reglas')) {
    return (
      hasShopPermission(user, shopId, 'salonRules.read') &&
      featureOn(features, 'reservationsEnabled')
    );
  }
  if (path.startsWith('/admin/salon/horarios')) {
    return (
      hasShopPermission(user, shopId, 'salonHours.read') &&
      featureOn(features, 'reservationsEnabled')
    );
  }
  if (path === '/admin/salon' || path.startsWith('/admin/salon/')) {
    return (
      featureOn(features, 'reservationsEnabled') &&
      (hasShopPermission(user, shopId, 'salonTables.read') ||
        hasShopPermission(user, shopId, 'diagrama.read') ||
        hasShopPermission(user, shopId, 'salonRules.read') ||
        hasShopPermission(user, shopId, 'salonHours.read'))
    );
  }
  if (path.startsWith('/admin/tips')) {
    return hasShopPermission(user, shopId, 'tips.read') && featureOn(features, 'tipsEnabled');
  }
  if (path.startsWith('/admin/payments/suppliers')) {
    return hasShopPermission(user, shopId, 'paymentsSuppliers.read');
  }
  if (path.startsWith('/admin/payments/services')) {
    return hasShopPermission(user, shopId, 'paymentsServices.read');
  }
  if (path.startsWith('/admin/payments/employees')) {
    return hasShopPermission(user, shopId, 'paymentsEmployees.read');
  }
  if (path.startsWith('/admin/payments/partners')) {
    return hasShopPermission(user, shopId, 'paymentsPartners.read');
  }
  if (path.startsWith('/admin/payments')) {
    return (
      hasShopPermission(user, shopId, 'paymentsSuppliers.read') ||
      hasShopPermission(user, shopId, 'paymentsServices.read') ||
      hasShopPermission(user, shopId, 'paymentsEmployees.read') ||
      hasShopPermission(user, shopId, 'paymentsPartners.read') ||
      hasShopPermission(user, shopId, 'payments.read')
    );
  }
  if (path.startsWith('/admin/suppliers')) {
    return hasShopPermission(user, shopId, 'suppliers.read');
  }
  if (path.startsWith('/admin/services')) {
    return hasShopPermission(user, shopId, 'services.read');
  }
  if (path === '/admin/stock' || path.startsWith('/admin/stock/')) {
    return hasShopPermission(user, shopId, 'stock.read');
  }
  if (path === '/admin/beverage-stock' || path.startsWith('/admin/beverage-stock/')) {
    return hasShopPermission(user, shopId, 'beverageStock.read');
  }
  if (path.startsWith('/admin/shortages')) {
    return hasShopPermission(user, shopId, 'shortages.read');
  }
  if (path.startsWith('/admin/orders')) {
    return hasShopPermission(user, shopId, 'orders.read');
  }
  if (path.startsWith('/admin/customer-orders')) {
    if (!featureOn(features, 'onlineOrderingEnabled')) return false;
    if (path.startsWith('/admin/customer-orders/historial')) {
      return (
        hasShopPermission(user, shopId, 'customerOrdersHistory.read') ||
        hasShopPermission(user, shopId, 'customerOrdersHistory.manage')
      );
    }
    if (path.startsWith('/admin/customer-orders/monitor')) {
      return hasShopPermission(user, shopId, 'customerOrdersMonitor.read');
    }
    return (
      hasShopPermission(user, shopId, 'customerOrders.read') ||
      hasShopPermission(user, shopId, 'customerOrders.manage') ||
      hasShopPermission(user, shopId, 'orderingCatalog.read') ||
      hasShopPermission(user, shopId, 'orderingCatalog.manage')
    );
  }
  if (path.startsWith('/admin/integrations')) {
    return (
      hasShopPermission(user, shopId, 'integrations.read') ||
      hasShopPermission(user, shopId, 'integrations.manage')
    );
  }
  if (path.startsWith('/admin/comanda')) {
    if (!featureOn(features, 'waiterOrderingEnabled')) return false;
    if (hasShopPermission(user, shopId, 'shops.manage')) return true;
    if (path.startsWith('/admin/comanda/historial')) {
      return (
        hasShopPermission(user, shopId, 'comandaReceiptsHistory.read') ||
        hasShopPermission(user, shopId, 'comandaReceiptsHistory.manage')
      );
    }
    if (path.startsWith('/admin/comanda/monitor')) {
      return hasShopPermission(user, shopId, 'comandaMonitor.read');
    }
    return (
      hasShopPermission(user, shopId, 'comanda.read') ||
      hasShopPermission(user, shopId, 'comanda.manage')
    );
  }
  if (path.startsWith('/admin/salaries') || path.startsWith('/admin/payroll')) {
    return hasShopPermission(user, shopId, 'payroll.read');
  }
  if (path.startsWith('/admin/commissions')) {
    return hasShopPermission(user, shopId, 'commissions.read');
  }
  if (path.startsWith('/admin/reimbursements')) {
    return (
      hasShopPermission(user, shopId, 'reimbursements.read') ||
      hasShopPermission(user, shopId, 'reimbursements.manage') ||
      hasShopPermission(user, shopId, 'reimbursements.self')
    );
  }
  if (path.startsWith('/admin/service-rules')) {
    return hasShopPermission(user, shopId, 'serviceRules.read');
  }
  if (path === '/' || path === '' || path === '/admin/inicio') {
    return true;
  }
  if (path === '/admin/profile') {
    return true;
  }
  if (path === '/admin/g' || path.startsWith('/admin/g/')) {
    return true;
  }
  if (path === '/admin/forbidden' || path.startsWith('/admin/forbidden')) {
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
  closings: '/admin/closings',
  shortages: '/admin/shortages',
  payments: '/admin/payments/suppliers',
  reservations: '/admin/reservations',
  'waiting-list': '/admin/waiting-list',
  tips: '/admin/tips',
  'new-closing': '/admin/closings/new',
  'my-hours': '/admin/my-production',
  'my-reimbursements': '/admin/reimbursements',
  stock: '/admin/stock',
  'beverage-stock': '/admin/beverage-stock',
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
