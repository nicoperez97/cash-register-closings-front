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
  | 'candidates.manage'
  | 'candidates.read'
  | 'attendance.manage'
  | 'attendance.read'
  | 'attendance.self'
  | 'payroll.manage'
  | 'payroll.read'
  | 'commissions.manage'
  | 'commissions.read'
  | 'movements.manage'
  | 'movements.read'
  | 'accounts.manage'
  | 'concepts.manage'
  | 'reservations.read'
  | 'reservations.manage'
  | 'waitingList.read'
  | 'waitingList.manage'
  | 'payments.read'
  | 'payments.manage'
  | 'suppliers.read'
  | 'suppliers.manage';

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
  'candidates.manage',
  'candidates.read',
  'attendance.manage',
  'attendance.read',
  'attendance.self',
  'payroll.manage',
  'payroll.read',
  'commissions.manage',
  'commissions.read',
  'movements.manage',
  'movements.read',
  'accounts.manage',
  'concepts.manage',
  'reservations.read',
  'reservations.manage',
  'waitingList.read',
  'waitingList.manage',
  'payments.read',
  'payments.manage',
  'suppliers.read',
  'suppliers.manage',
];

/** Fallback si el API aún no envía shopPermissions. */
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
    'candidates.manage',
    'candidates.read',
    'attendance.manage',
    'attendance.read',
    'payroll.manage',
    'payroll.read',
    'commissions.manage',
    'commissions.read',
    'movements.manage',
    'movements.read',
    'accounts.manage',
    'concepts.manage',
    'reservations.read',
    'reservations.manage',
    'waitingList.read',
    'waitingList.manage',
    'payments.read',
    'payments.manage',
    'suppliers.read',
    'suppliers.manage',
  ],
  CASHIER: ['closings.create', 'closings.read'],
  VIEWER: [
    'closings.read',
    'reports.view',
    'reports.export',
    'employees.read',
    'candidates.read',
    'attendance.read',
    'payroll.read',
    'commissions.read',
    'movements.read',
    'reservations.read',
    'payments.read',
    'suppliers.read',
  ],
  PARTNER: [
    'closings.read',
    'reports.view',
    'reports.export',
    'movements.read',
    'payments.read',
    'suppliers.read',
  ],
};

export type ModuleKey =
  | 'closings'
  | 'reports'
  | 'movements'
  | 'attendance'
  | 'employees'
  | 'candidates'
  | 'payroll'
  | 'commissions'
  | 'accounts'
  | 'concepts'
  | 'reservations'
  | 'waitingList'
  | 'payments'
  | 'suppliers'
  | 'shop'
  | 'users';

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  icon: string;
  /** Agrupa la UI: daily | people | config */
  group: 'daily' | 'people' | 'config';
  hint?: string;
  levels: Array<{ value: string; label: string; short?: string }>;
}

/** Misma definición que la API (module-permissions.ts). */
export const MODULE_DEFS: ModuleDef[] = [
  {
    key: 'closings',
    label: 'Cierres',
    icon: 'point_of_sale',
    group: 'daily',
    hint: 'Cargar y editar cierres de caja',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'create', label: 'Solo crear', short: 'Crear' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'update', label: 'Editar', short: 'Editar' },
      { value: 'lock', label: 'Bloquear', short: 'Bloquear' },
    ],
  },
  {
    key: 'movements',
    label: 'Movimientos',
    icon: 'swap_horiz',
    group: 'daily',
    hint: 'Ingresos y egresos',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'attendance',
    label: 'Asistencia',
    icon: 'event_available',
    group: 'daily',
    hint: 'Presentismo y horas de producción',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'self', label: 'Solo mis horas', short: 'Mías' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'reports',
    label: 'Reportes',
    icon: 'insights',
    group: 'daily',
    hint: 'Ver y exportar reportes',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'export', label: 'Exportar', short: 'Excel' },
    ],
  },
  {
    key: 'employees',
    label: 'Empleados',
    icon: 'badge',
    group: 'people',
    hint: 'Ficha de personal',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'candidates',
    label: 'CVs / Candidatos',
    icon: 'person_search',
    group: 'people',
    hint: 'Cargar CV por foto u OCR',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'payroll',
    label: 'Liquidaciones',
    icon: 'payments',
    group: 'people',
    hint: 'Sueldos y liquidaciones',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'commissions',
    label: 'Comisiones',
    icon: 'percent',
    group: 'people',
    hint: 'Reglas y cálculo de comisiones',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'accounts',
    label: 'Cuentas',
    icon: 'account_balance',
    group: 'config',
    hint: 'Cuentas contables del local',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'concepts',
    label: 'Conceptos',
    icon: 'category',
    group: 'config',
    hint: 'Conceptos de movimiento',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'reservations',
    label: 'Reservas',
    icon: 'table_restaurant',
    group: 'daily',
    hint: 'Reservas del día (adentro / afuera)',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'waitingList',
    label: 'Lista de espera',
    icon: 'queue',
    group: 'daily',
    hint: 'Cola de espera con WhatsApp',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'payments',
    label: 'Pagos',
    icon: 'payments',
    group: 'daily',
    hint: 'Pagos a validar y abonar',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'suppliers',
    label: 'Proveedores',
    icon: 'local_shipping',
    group: 'config',
    hint: 'Proveedores y su cuenta asociada',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'shop',
    label: 'Local / POS',
    icon: 'storefront',
    group: 'config',
    hint: 'Config del local, cuentas, platos y sistemas',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'users',
    label: 'Usuarios',
    icon: 'group',
    group: 'config',
    hint: 'Alta y permisos de usuarios',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
];

export const MODULE_GROUPS: Array<{ id: ModuleDef['group']; label: string }> = [
  { id: 'daily', label: 'Operación diaria' },
  { id: 'people', label: 'Personal' },
  { id: 'config', label: 'Configuración' },
];

export const MODULE_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  icon: string;
  modules: Partial<Record<ModuleKey, string>>;
}> = [
  {
    id: 'closings-only',
    label: 'Cajero',
    description: 'Solo carga el cierre del día',
    icon: 'point_of_sale',
    modules: { closings: 'create' },
  },
  {
    id: 'movements-only',
    label: 'Caja chica',
    description: 'Solo ingresos y egresos',
    icon: 'swap_horiz',
    modules: { movements: 'manage' },
  },
  {
    id: 'attendance-only',
    label: 'Presentismo',
    description: 'Solo marca asistencia',
    icon: 'event_available',
    modules: { attendance: 'manage' },
  },
  {
    id: 'producer-only',
    label: 'Productor',
    description: 'Carga sus horas de producción (día / semana / mes)',
    icon: 'restaurant',
    modules: { attendance: 'self' },
  },
  {
    id: 'receptionist',
    label: 'Recepcionista',
    description: 'Reservas y lista de espera',
    icon: 'support_agent',
    modules: {
      reservations: 'manage',
      waitingList: 'manage',
    },
  },
  {
    id: 'viewer',
    label: 'Solo lectura',
    description: 'Ve reportes y listados, sin editar',
    icon: 'visibility',
    modules: {
      closings: 'read',
      reports: 'export',
      movements: 'read',
      attendance: 'read',
      employees: 'read',
      candidates: 'read',
      payroll: 'read',
      commissions: 'read',
    },
  },
];

export function emptyModuleLevels(): Record<ModuleKey, string> {
  const out = {} as Record<ModuleKey, string>;
  for (const d of MODULE_DEFS) out[d.key] = 'none';
  return out;
}

export const ACCOUNT_TYPE_OPTIONS: Array<{
  value: string;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    value: 'SUPER_ADMIN',
    label: 'Super admin',
    description: 'Ve todos los locales, crea locales y asigna usuarios a cualquier local.',
    icon: 'shield_person',
  },
  {
    value: 'ADMIN',
    label: 'Administrador de local',
    description: 'Acceso total a los locales que le asignes. No hace falta configurar módulos.',
    icon: 'admin_panel_settings',
  },
  {
    value: 'EMPLOYEE',
    label: 'Empleado',
    description: 'Elegís qué puede hacer en cada módulo (o usá un acceso rápido).',
    icon: 'person',
  },
];

export interface ShopPosnet {
  id: string;
  name: string;
  type: 'PVS' | 'MERCADO_PAGO' | 'CUENTA_DNI';
}

export interface ShopSummary {
  id: string;
  name: string;
  slug: string;
  unitsLabel?: string | null;
  coversEnabled: boolean;
  /** Si es false, reservas no están disponibles en este local. */
  reservationsEnabled?: boolean;
  /** Si es false, lista de espera no está disponible en este local. */
  waitingListEnabled?: boolean;
  defaultChangeAmount: number;
  currency: string;
  timezone?: string;
  /** Hora de apertura HH:mm; el día laboral dura hasta esa hora del día siguiente. */
  openingTime?: string;
  /** Horas por defecto al marcar asistencia en producción. */
  productionDefaultHours?: number;
  /** Días de franco (0=domingo … 6=sábado). */
  closedWeekdays?: number[];
  logoUrl?: string | null;
  accentColor?: string | null;
  /** Color de énfasis / secundario del local. */
  accentSecondary?: string | null;
  salesSystemId?: string | null;
  posnets?: ShopPosnet[];
  active?: boolean;
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
  shopPermissions?: Record<string, Permission[] | string[]>;
  shopModulePermissions?: Record<string, Record<string, string>>;
  shopAccountIds: Record<string, string[]>;
  shops: ShopSummary[];
  /** Local favorito al iniciar sesión. */
  favoriteShopId?: string | null;
}

export function userRoleLabel(role?: string): string {
  const map: Record<string, string> = {
    OWNER: 'Super admin',
    ADMIN: 'Administrador',
    MANAGER: 'Gerente',
    CASHIER: 'Cajero',
    VIEWER: 'Visor',
    PARTNER: 'Socio',
    admin: 'Administrador',
    user: 'Usuario',
    EMPLOYEE: 'Empleado',
    SUPER_ADMIN: 'Super admin',
  };
  return map[role ?? ''] ?? 'Usuario';
}

export const GLOBAL_ROLE_OPTIONS: Array<{ value: GlobalRole; label: string }> = [
  { value: 'OWNER', label: 'Super admin' },
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
  if (!user) return [];
  // Super admin: permisos globales aunque aún no tenga local seleccionado/asignado.
  if (user.globalRole === 'OWNER' || user.globalRole === 'ADMIN') {
    return [...ALL_PERMISSIONS];
  }
  if (!shopId) return [];
  const fromApi = user.shopPermissions?.[shopId];
  if (fromApi) return fromApi as Permission[];
  // Fallback legacy
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
  if (!user) return false;
  if (user.globalRole === 'OWNER' || user.globalRole === 'ADMIN') return true;
  if (!shopId) return false;
  if (hasShopPermission(user, shopId, 'users.manage')) return true;
  const role = effectiveRoleForShop(user, shopId);
  return role === 'OWNER' || role === 'ADMIN';
}

/** Solo carga cierres: nivel create y sin otros módulos relevantes. */
export function isCashierOnly(user: AuthUser | null, shopId: string | null): boolean {
  if (!user || !shopId) return false;
  if (user.globalRole === 'OWNER' || user.globalRole === 'ADMIN') return false;
  const perms = permissionsForShop(user, shopId);
  if (!perms.includes('closings.create')) return false;
  const extra = perms.filter(
    (p) =>
      p !== 'closings.create' &&
      p !== 'closings.read' &&
      p !== 'closings.update' &&
      p !== 'closings.lock',
  );
  // Si solo tiene create (+read opcional) y nada más → layout cajero
  if (extra.length) return false;
  return !perms.includes('closings.update') && !perms.includes('closings.lock');
}

/** Solo carga sus horas de producción. */
export function isProducerOnly(user: AuthUser | null, shopId: string | null): boolean {
  if (!user || !shopId) return false;
  if (user.globalRole === 'OWNER' || user.globalRole === 'ADMIN') return false;
  const perms = permissionsForShop(user, shopId);
  if (!perms.includes('attendance.self')) return false;
  if (perms.includes('attendance.read') || perms.includes('attendance.manage')) return false;
  const extra = perms.filter((p) => p !== 'attendance.self');
  return extra.length === 0;
}

export function defaultHomeRoute(user: AuthUser | null, shopId: string | null): string {
  if (isCashierOnly(user, shopId)) return '/closings/new';
  if (isProducerOnly(user, shopId)) return '/my-production';
  return '/';
}
