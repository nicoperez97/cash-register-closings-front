export type GlobalRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'VIEWER' | 'PARTNER';

/** Compat: admin ≈ OWNER/ADMIN */
export type UserRole = 'admin' | 'user';

export type Permission =
  | 'closings.create'
  | 'closings.read'
  | 'closings.update'
  | 'closings.lock'
  | 'reports.view'
  | 'reports.export'
  | 'shops.manage'
  | 'users.manage'
  | 'employees.manage'
  | 'employees.read'
  | 'attendance.manage'
  | 'attendance.read'
  | 'payroll.manage'
  | 'payroll.read'
  | 'movements.manage'
  | 'movements.read'
  | 'accounts.manage'
  | 'concepts.manage';

const ALL_PERMISSIONS: Permission[] = [
  'closings.create',
  'closings.read',
  'closings.update',
  'closings.lock',
  'reports.view',
  'reports.export',
  'shops.manage',
  'users.manage',
  'employees.manage',
  'employees.read',
  'attendance.manage',
  'attendance.read',
  'payroll.manage',
  'payroll.read',
  'movements.manage',
  'movements.read',
  'accounts.manage',
  'concepts.manage',
];

/** Misma matriz que la API, para filtrar UI por rol del local. */
export const ROLE_PERMISSIONS: Record<GlobalRole, Permission[]> = {
  OWNER: [...ALL_PERMISSIONS],
  ADMIN: [...ALL_PERMISSIONS],
  MANAGER: [
    'closings.create',
    'closings.read',
    'closings.update',
    'closings.lock',
    'reports.view',
    'reports.export',
    'shops.manage',
    'employees.manage',
    'employees.read',
    'attendance.manage',
    'attendance.read',
    'payroll.manage',
    'payroll.read',
    'movements.manage',
    'movements.read',
    'accounts.manage',
    'concepts.manage',
  ],
  CASHIER: ['closings.create'],
  VIEWER: [
    'closings.read',
    'reports.view',
    'reports.export',
    'employees.read',
    'attendance.read',
    'payroll.read',
    'movements.read',
  ],
  PARTNER: ['closings.read', 'reports.view', 'reports.export', 'movements.read'],
};

export interface ShopSummary {
  id: string;
  name: string;
  slug: string;
  unitsLabel?: string | null;
  coversEnabled: boolean;
  defaultChangeAmount: number;
  currency: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  salesSystemId?: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  role: UserRole;
  globalRole: GlobalRole;
  permissions: string[];
  shopIds: string[];
  shopRoles: Record<string, GlobalRole | string>;
  /** Cuentas contables asociadas por local (N:N). */
  shopAccountIds: Record<string, string[]>;
  shops: ShopSummary[];
}

export function userRoleLabel(role?: string): string {
  const map: Record<string, string> = {
    OWNER: 'Propietario',
    ADMIN: 'Administrador',
    MANAGER: 'Gerente',
    CASHIER: 'Cajero',
    VIEWER: 'Visor',
    PARTNER: 'Socio',
    admin: 'Administrador',
    user: 'Usuario',
  };
  return map[role ?? ''] ?? 'Usuario';
}

export const GLOBAL_ROLE_OPTIONS: Array<{ value: GlobalRole; label: string }> = [
  { value: 'OWNER', label: 'Propietario' },
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'MANAGER', label: 'Gerente' },
  { value: 'CASHIER', label: 'Cajero' },
  { value: 'VIEWER', label: 'Visor' },
  { value: 'PARTNER', label: 'Socio' },
];

export function toUiRole(globalRole: GlobalRole): UserRole {
  return globalRole === 'OWNER' || globalRole === 'ADMIN' ? 'admin' : 'user';
}

export function effectiveRoleForShop(
  user: AuthUser | null,
  shopId: string | null,
): GlobalRole | null {
  if (!user || !shopId) return null;
  if (user.globalRole === 'OWNER' || user.globalRole === 'ADMIN') {
    return user.globalRole;
  }
  if (!user.shopIds.includes(shopId)) return null;
  return (user.shopRoles?.[shopId] ?? user.globalRole) as GlobalRole;
}

export function permissionsForShop(
  user: AuthUser | null,
  shopId: string | null,
): Permission[] {
  const role = effectiveRoleForShop(user, shopId);
  if (!role) return [];
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasShopPermission(
  user: AuthUser | null,
  shopId: string | null,
  permission: Permission,
): boolean {
  return permissionsForShop(user, shopId).includes(permission);
}

export function canManageShop(user: AuthUser | null, shopId: string | null): boolean {
  return hasShopPermission(user, shopId, 'shops.manage');
}

/** Admin/owner del local (o admin global): puede gestionar usuarios de ese local. */
export function canManageShopUsers(user: AuthUser | null, shopId: string | null): boolean {
  if (!user || !shopId) return false;
  if (user.globalRole === 'OWNER' || user.globalRole === 'ADMIN') return true;
  const role = effectiveRoleForShop(user, shopId);
  return role === 'OWNER' || role === 'ADMIN';
}

/** Cajero del local: solo registra cierres nuevos. */
export function isCashierOnly(user: AuthUser | null, shopId: string | null): boolean {
  return effectiveRoleForShop(user, shopId) === 'CASHIER';
}

export function defaultHomeRoute(user: AuthUser | null, shopId: string | null): string {
  return isCashierOnly(user, shopId) ? '/closings/new' : '/';
}
