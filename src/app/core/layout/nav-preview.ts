import {
  AuthUser,
  canAccessShopAdmin,
  canAccessShopConfig,
  canManageOrderingCatalog,
  canManageShopUsers,
  canSeeShopConfigSection,
  canViewClosingsList,
  expandModulePermissions,
  hasShopPermission,
  isShopAdministrator,
  migrateModuleLevels,
  type GlobalRole,
  type ModuleKey,
  type Permission,
} from '../auth/auth.models';
import { canAccessAnyPublicPage, PUBLIC_PAGE_ACCESS } from '../shop/public-page-access';
import { navLeaf, NAV_GROUP_DEFS } from './nav-config';

export type NavPreviewLeaf = {
  id: string;
  label: string;
  icon: string;
  route: string;
};

export type NavPreviewGroup = {
  id: string;
  label: string;
  icon: string;
  children: NavPreviewLeaf[];
};

export type NavPreviewFeatures = {
  reservationsEnabled?: boolean;
  waitingListEnabled?: boolean;
  tipsEnabled?: boolean;
  settlementsEnabled?: boolean;
  onlineOrderingEnabled?: boolean;
  waiterOrderingEnabled?: boolean;
};

const DEFAULT_FEATURES: Required<NavPreviewFeatures> = {
  reservationsEnabled: true,
  waitingListEnabled: true,
  tipsEnabled: true,
  settlementsEnabled: true,
  onlineOrderingEnabled: true,
  waiterOrderingEnabled: true,
};

function leaf(id: string): NavPreviewLeaf | null {
  const n = navLeaf(id);
  if (!n) return null;
  return { id, label: n.label, icon: n.icon ?? 'circle', route: n.route };
}

function pushLeaf(arr: NavPreviewLeaf[], id: string): void {
  const n = leaf(id);
  if (n) arr.push(n);
}

/**
 * Arma un AuthUser sintético para previsualizar el menú según módulos/secciones
 * elegidos en el editor de permisos (sin tocar la sesión actual).
 */
export function buildSyntheticAuthUser(opts: {
  userId: string;
  email: string;
  fullName?: string;
  shopId: string;
  shopName?: string;
  globalRole: GlobalRole;
  modules: Partial<Record<ModuleKey, string>> | Record<string, string>;
  shopConfigVisibility?: Record<string, string> | null;
  isSuperAdminPreview?: boolean;
}): AuthUser {
  const levels = migrateModuleLevels(opts.modules as Record<string, string>);
  const perms = expandModulePermissions(levels) as Permission[];
  const role = opts.isSuperAdminPreview ? 'OWNER' : opts.globalRole;
  return {
    id: opts.userId,
    email: opts.email,
    fullName: opts.fullName,
    role: role === 'OWNER' || role === 'ADMIN' ? 'admin' : 'user',
    globalRole: role,
    permissions: perms,
    shopIds: [opts.shopId],
    shopRoles: { [opts.shopId]: role },
    shopPermissions: { [opts.shopId]: perms },
    shopModulePermissions: { [opts.shopId]: levels },
    shopAccountIds: { [opts.shopId]: [] },
    shops: [
      {
        id: opts.shopId,
        name: opts.shopName ?? 'Local',
        slug: 'preview',
        coversEnabled: false,
        defaultChangeAmount: 0,
        currency: 'ARS',
        shopConfigVisibility: opts.shopConfigVisibility ?? null,
      },
    ],
  };
}

/** Menú lateral que vería el usuario con esos permisos (features del local en true por defecto). */
export function buildNavPreview(
  user: AuthUser | null,
  shopId: string | null,
  features?: NavPreviewFeatures | null,
  opts?: { isSuperAdmin?: boolean },
): NavPreviewGroup[] {
  if (!user || !shopId) return [];
  const f = { ...DEFAULT_FEATURES, ...(features ?? {}) };
  const groups: NavPreviewGroup[] = [];

  const operacion: NavPreviewLeaf[] = [];
  if (canViewClosingsList(user, shopId) || hasShopPermission(user, shopId, 'closings.create')) {
    pushLeaf(operacion, 'closings');
  }
  if (hasShopPermission(user, shopId, 'cashWithdrawals.read')) {
    pushLeaf(operacion, 'cashWithdrawals');
  }
  if (hasShopPermission(user, shopId, 'settlements.read') && f.settlementsEnabled) {
    pushLeaf(operacion, 'settlements');
  }
  if (hasShopPermission(user, shopId, 'tips.read') && f.tipsEnabled) {
    pushLeaf(operacion, 'tips');
  }
  if (hasShopPermission(user, shopId, 'serviceRules.read')) {
    pushLeaf(operacion, 'serviceRules');
  }
  if (
    f.onlineOrderingEnabled &&
    (hasShopPermission(user, shopId, 'customerOrders.read') ||
      hasShopPermission(user, shopId, 'orderingCatalog.manage'))
  ) {
    pushLeaf(operacion, 'customerOrders');
  }
  if (
    f.waiterOrderingEnabled &&
    (hasShopPermission(user, shopId, 'comanda.manage') ||
      hasShopPermission(user, shopId, 'shops.manage'))
  ) {
    pushLeaf(operacion, 'comanda');
  }
  if (operacion.length) {
    groups.push({ id: 'operacion', label: 'Operación', icon: 'today', children: operacion });
  }

  const cuentas: NavPreviewLeaf[] = [];
  if (hasShopPermission(user, shopId, 'expenses.read')) pushLeaf(cuentas, 'expenses');
  if (hasShopPermission(user, shopId, 'incomes.read')) pushLeaf(cuentas, 'incomes');
  if (hasShopPermission(user, shopId, 'accountTransfers.read')) {
    pushLeaf(cuentas, 'accountTransfers');
  }
  if (hasShopPermission(user, shopId, 'accountBalances.read')) pushLeaf(cuentas, 'accountBalances');
  if (hasShopPermission(user, shopId, 'transactions.read')) pushLeaf(cuentas, 'transactions');
  if (hasShopPermission(user, shopId, 'partnerSplits.read')) pushLeaf(cuentas, 'partnerSplits');
  if (hasShopPermission(user, shopId, 'splits.read')) pushLeaf(cuentas, 'splits');
  if (cuentas.length) {
    groups.push({ id: 'cuentas', label: 'Cuentas', icon: 'account_balance', children: cuentas });
  }

  const salon: NavPreviewLeaf[] = [];
  if (hasShopPermission(user, shopId, 'reservations.read') && f.reservationsEnabled) {
    pushLeaf(salon, 'reservations');
  }
  if (hasShopPermission(user, shopId, 'waitingList.read') && f.waitingListEnabled) {
    pushLeaf(salon, 'waitingList');
  }
  if (hasShopPermission(user, shopId, 'salonTables.read') && f.reservationsEnabled) {
    pushLeaf(salon, 'salonTables');
  }
  if (hasShopPermission(user, shopId, 'diagrama.read') && f.reservationsEnabled) {
    pushLeaf(salon, 'diagrama');
  }
  if (hasShopPermission(user, shopId, 'salonRules.read') && f.reservationsEnabled) {
    pushLeaf(salon, 'salonRules');
  }
  if (hasShopPermission(user, shopId, 'salonHours.read') && f.reservationsEnabled) {
    pushLeaf(salon, 'salonHours');
  }
  if (salon.length) {
    groups.push({ id: 'salon', label: 'Salón', icon: 'table_restaurant', children: salon });
  }

  const stock: NavPreviewLeaf[] = [];
  if (hasShopPermission(user, shopId, 'stock.read')) pushLeaf(stock, 'stockFood');
  if (hasShopPermission(user, shopId, 'beverageStock.read')) pushLeaf(stock, 'beverageStock');
  if (hasShopPermission(user, shopId, 'shortages.read')) pushLeaf(stock, 'shortages');
  if (hasShopPermission(user, shopId, 'orders.read')) pushLeaf(stock, 'orders');
  if (stock.length) {
    groups.push({ id: 'stock', label: 'Stock', icon: 'inventory_2', children: stock });
  }

  const asistencia: NavPreviewLeaf[] = [];
  if (hasShopPermission(user, shopId, 'attendance.read')) pushLeaf(asistencia, 'attendance');
  if (hasShopPermission(user, shopId, 'productionAttendance.read')) {
    pushLeaf(asistencia, 'productionAttendance');
  }
  if (asistencia.length) {
    groups.push({
      id: 'asistencia',
      label: 'Asistencia',
      icon: 'event_available',
      children: asistencia,
    });
  } else if (hasShopPermission(user, shopId, 'attendance.self')) {
    const my = leaf('myProduction');
    if (my) groups.push({ id: 'asistencia', label: 'Asistencia', icon: 'event_available', children: [my] });
  }

  const pagos: NavPreviewLeaf[] = [];
  if (hasShopPermission(user, shopId, 'paymentsSuppliers.read')) pushLeaf(pagos, 'paymentsSuppliers');
  if (hasShopPermission(user, shopId, 'paymentsServices.read')) pushLeaf(pagos, 'paymentsServices');
  if (hasShopPermission(user, shopId, 'paymentsEmployees.read')) pushLeaf(pagos, 'paymentsEmployees');
  if (hasShopPermission(user, shopId, 'paymentsPartners.read')) pushLeaf(pagos, 'paymentsPartners');
  if (hasShopPermission(user, shopId, 'suppliers.read')) pushLeaf(pagos, 'suppliers');
  if (hasShopPermission(user, shopId, 'services.read')) pushLeaf(pagos, 'services');
  if (pagos.length) {
    groups.push({ id: 'pagos', label: 'Pagos', icon: 'payments', children: pagos });
  }

  const reportes: NavPreviewLeaf[] = [];
  if (hasShopPermission(user, shopId, 'reports.view')) pushLeaf(reportes, 'reports');
  if (hasShopPermission(user, shopId, 'reportsConcepts.read')) pushLeaf(reportes, 'reportsConcepts');
  if (hasShopPermission(user, shopId, 'reportsProducts.read')) pushLeaf(reportes, 'reportsProducts');
  if (hasShopPermission(user, shopId, 'reportsStats.read')) pushLeaf(reportes, 'reportsStats');
  if (reportes.length) {
    groups.push({ id: 'reportes', label: 'Reportes', icon: 'insights', children: reportes });
  }

  const personal: NavPreviewLeaf[] = [];
  if (hasShopPermission(user, shopId, 'employees.read')) pushLeaf(personal, 'employees');
  if (hasShopPermission(user, shopId, 'vacations.read')) pushLeaf(personal, 'vacations');
  if (hasShopPermission(user, shopId, 'candidates.read')) pushLeaf(personal, 'candidates');
  if (hasShopPermission(user, shopId, 'payroll.read')) pushLeaf(personal, 'payroll');
  if (hasShopPermission(user, shopId, 'commissions.read')) pushLeaf(personal, 'commissions');
  if (
    hasShopPermission(user, shopId, 'reimbursements.read') ||
    hasShopPermission(user, shopId, 'reimbursements.manage')
  ) {
    pushLeaf(personal, 'reimbursements');
  }
  if (personal.length) {
    groups.push({ id: 'personal', label: 'Personal', icon: 'groups', children: personal });
  }

  const local: NavPreviewLeaf[] = [];
  if (canAccessShopConfig(user, shopId)) {
    if (canSeeShopConfigSection(user, shopId, 'resumen')) pushLeaf(local, 'adminShop');
    if (canSeeShopConfigSection(user, shopId, 'identidad')) pushLeaf(local, 'adminShopIdentidad');
    if (canSeeShopConfigSection(user, shopId, 'operacion')) pushLeaf(local, 'adminShopOperacion');
  }
  if (canSeeShopConfigSection(user, shopId, 'pedidos')) pushLeaf(local, 'adminOrdering');
  if (canSeeShopConfigSection(user, shopId, 'comanda')) pushLeaf(local, 'adminComanda');
  if (canAccessShopConfig(user, shopId)) {
    if (canSeeShopConfigSection(user, shopId, 'dispositivos')) {
      pushLeaf(local, 'adminShopDispositivos');
    }
    if (canSeeShopConfigSection(user, shopId, 'menu')) pushLeaf(local, 'adminShopMenu');
  }
  if (canSeeShopConfigSection(user, shopId, 'carta')) {
    if (canManageOrderingCatalog(user, shopId)) pushLeaf(local, 'adminMenu');
    if (hasShopPermission(user, shopId, 'promos.manage')) pushLeaf(local, 'adminPromos');
  }
  if (
    hasShopPermission(user, shopId, 'integrations.read') ||
    hasShopPermission(user, shopId, 'integrations.manage')
  ) {
    pushLeaf(local, 'integrations');
  }
  if (canSeeShopConfigSection(user, shopId, 'avanzado')) pushLeaf(local, 'adminShopAvanzado');
  if (local.length) {
    const g = NAV_GROUP_DEFS.find((x) => x.id === 'local');
    groups.push({
      id: 'local',
      label: g?.label ?? 'Configuración del local',
      icon: g?.icon ?? 'storefront',
      children: local,
    });
  }

  const admin: NavPreviewLeaf[] = [];
  if (opts?.isSuperAdmin || user.globalRole === 'OWNER') pushLeaf(admin, 'adminShops');
  if (canAccessShopAdmin(user, shopId)) {
    pushLeaf(admin, 'adminMessages');
    pushLeaf(admin, 'adminQr');
    pushLeaf(admin, 'adminInstrucciones');
  }
  if (canManageShopUsers(user, shopId)) {
    pushLeaf(admin, 'adminUsers');
    pushLeaf(admin, 'adminUserActivity');
  }
  if (hasShopPermission(user, shopId, 'accounts.manage')) pushLeaf(admin, 'adminAccounts');
  if (hasShopPermission(user, shopId, 'concepts.manage')) pushLeaf(admin, 'adminConcepts');
  if (canAccessShopAdmin(user, shopId)) {
    pushLeaf(admin, 'adminSalesSystems');
    pushLeaf(admin, 'adminPosProducts');
  }
  if (admin.length) {
    groups.push({ id: 'admin', label: 'Administración', icon: 'settings', children: admin });
  }

  if (canAccessAnyPublicPage(user, shopId)) {
    const publicChildren: NavPreviewLeaf[] = [];
    if (isShopAdministrator(user, shopId)) {
      pushLeaf(publicChildren, 'adminPublicPages');
    }
    for (const p of PUBLIC_PAGE_ACCESS) {
      if (!hasShopPermission(user, shopId, p.permission as Permission)) continue;
      publicChildren.push({
        id: `public-${p.pageId}`,
        label: p.label,
        icon: p.icon,
        route: `/admin/public-pages/${p.pageId}`,
      });
    }
    if (publicChildren.length) {
      groups.push({
        id: 'publicPages',
        label: 'Páginas públicas',
        icon: 'public',
        children: publicChildren,
      });
    }
  }

  return groups;
}
