export type GlobalRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'VIEWER' | 'PARTNER';

/** Compat: admin ≈ OWNER/ADMIN */
export type UserRole = 'admin' | 'user';

export type Permission =
  | 'closings.create'
  | 'closings.read'
  | 'closings.update'
  | 'closings.lock'
  | 'cashWithdrawals.read'
  | 'cashWithdrawals.manage'
  | 'settlements.read'
  | 'settlements.manage'
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
  | 'expenses.manage'
  | 'expenses.read'
  | 'accountTransfers.manage'
  | 'accountTransfers.read'
  | 'accounts.manage'
  | 'concepts.manage'
  | 'reservations.read'
  | 'reservations.manage'
  | 'waitingList.read'
  | 'waitingList.manage'
  | 'payments.read'
  | 'payments.manage'
  | 'suppliers.read'
  | 'suppliers.manage'
  | 'services.read'
  | 'services.manage'
  | 'stock.read'
  | 'stock.manage'
  | 'beverageStock.read'
  | 'beverageStock.manage'
  | 'shortages.read'
  | 'shortages.manage'
  | 'tips.read'
  | 'tips.create'
  | 'tips.manage'
  | 'reimbursements.self'
  | 'reimbursements.read'
  | 'reimbursements.manage'
  | 'serviceRules.read'
  | 'serviceRules.manage';

const ALL_PERMISSIONS: Permission[] = [
  'closings.create',
  'closings.read',
  'closings.update',
  'closings.lock',
  'cashWithdrawals.read',
  'cashWithdrawals.manage',
  'settlements.read',
  'settlements.manage',
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
  'expenses.manage',
  'expenses.read',
  'accountTransfers.manage',
  'accountTransfers.read',
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
  'services.read',
  'services.manage',
  'stock.read',
  'stock.manage',
  'beverageStock.read',
  'beverageStock.manage',
  'shortages.read',
  'shortages.manage',
  'tips.read',
  'tips.create',
  'tips.manage',
  'reimbursements.self',
  'reimbursements.read',
  'reimbursements.manage',
  'serviceRules.read',
  'serviceRules.manage',
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
    'cashWithdrawals.read',
    'cashWithdrawals.manage',
    'settlements.read',
    'settlements.manage',
    'reports.view',
    'reports.export',
    'shops.manage',
    'employees.manage',
    'employees.read',
    'candidates.manage',
    'candidates.read',
    'attendance.manage',
    'attendance.read',
    'serviceRules.read',
    'serviceRules.manage',
    'payroll.manage',
    'payroll.read',
    'commissions.manage',
    'commissions.read',
    'movements.manage',
    'movements.read',
    'expenses.manage',
    'expenses.read',
    'accountTransfers.manage',
    'accountTransfers.read',
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
    'services.read',
    'services.manage',
    'stock.read',
    'stock.manage',
    'beverageStock.read',
    'beverageStock.manage',
    'shortages.read',
    'shortages.manage',
    'tips.read',
    'tips.create',
    'tips.manage',
    'reimbursements.read',
    'reimbursements.manage',
  ],
  CASHIER: ['closings.create', 'closings.read', 'tips.create', 'tips.read'],
  VIEWER: [
    'closings.read',
    'cashWithdrawals.read',
    'settlements.read',
    'reports.view',
    'reports.export',
    'employees.read',
    'candidates.read',
    'attendance.read',
    'serviceRules.read',
    'payroll.read',
    'commissions.read',
    'movements.read',
    'expenses.read',
    'accountTransfers.read',
    'reservations.read',
    'payments.read',
    'suppliers.read',
    'services.read',
    'stock.read',
    'beverageStock.read',
    'shortages.read',
    'tips.read',
    'reimbursements.read',
  ],
  PARTNER: [
    'closings.read',
    'cashWithdrawals.read',
    'settlements.read',
    'reports.view',
    'reports.export',
    'movements.read',
    'expenses.read',
    'accountTransfers.read',
    'payments.read',
    'suppliers.read',
    'services.read',
  ],
};

export type ModuleKey =
  | 'closings'
  | 'cashWithdrawals'
  | 'settlements'
  | 'reports'
  | 'expenses'
  | 'accountTransfers'
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
  | 'services'
  | 'stock'
  | 'beverageStock'
  | 'shortages'
  | 'tips'
  | 'reimbursements'
  | 'serviceRules'
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
    hint: 'Cargar y editar cierres de caja. No incluye A Retirar ni Rendiciones.',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'create', label: 'Solo crear', short: 'Crear' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'update', label: 'Editar', short: 'Editar' },
      { value: 'lock', label: 'Bloquear', short: 'Bloquear' },
    ],
  },
  {
    key: 'cashWithdrawals',
    label: 'A Retirar',
    icon: 'payments',
    group: 'daily',
    hint: 'Efectivo del cierre que hay que sacar y asignar',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'settlements',
    label: 'Rendiciones',
    icon: 'account_balance_wallet',
    group: 'daily',
    hint: 'Cuentas que se rinden después, no en el cierre del día',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'expenses',
    label: 'Gastos',
    icon: 'payments',
    group: 'daily',
    hint: 'Egresos del local (gasto rápido y listado)',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'accountTransfers',
    label: 'Movimientos entre cuentas',
    icon: 'swap_horiz',
    group: 'daily',
    hint: 'Transferencias entre cuentas del local',
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
    hint: 'Ficha de personal. En productores podés cargar alias/CBU para reintegros',
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
    hint: 'Catálogo de conceptos (nombre, descripción y validado). Solo los validados aparecen en gastos y pagos',
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
    hint: 'Reservas del día, solicitudes web y confirmar mesas',
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
    key: 'services',
    label: 'Servicios',
    icon: 'home_repair_service',
    group: 'config',
    hint: 'Servicios y su cuenta asociada',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'stock',
    label: 'Stock alimentos',
    icon: 'inventory',
    group: 'daily',
    hint: 'Administración de stock de alimentos',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'beverageStock',
    label: 'Stock bebidas',
    icon: 'local_bar',
    group: 'daily',
    hint: 'Administración de stock de bebidas',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'shortages',
    label: 'Stock faltantes',
    icon: 'report',
    group: 'daily',
    hint: 'Administración de faltantes del local (Nada / Poco / Normal / Mucho)',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'tips',
    label: 'Propinas',
    icon: 'volunteer_activism',
    group: 'daily',
    hint: 'Caja diaria de propinas y reparto por empleado',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'create', label: 'Cargar', short: 'Cargar' },
      { value: 'manage', label: 'Gestionar', short: 'Todo' },
    ],
  },
  {
    key: 'reimbursements',
    label: 'Reintegros',
    icon: 'receipt_long',
    group: 'people',
    hint: 'Gastos de productores a reintegrar. El productor carga alias e importe; un admin marca pagado y sube el comprobante',
    levels: [
      { value: 'none', label: 'Sin acceso', short: 'Off' },
      { value: 'self', label: 'Solo mis gastos', short: 'Míos' },
      { value: 'read', label: 'Ver', short: 'Ver' },
      { value: 'manage', label: 'Gestionar (pagar)', short: 'Todo' },
    ],
  },
  {
    key: 'serviceRules',
    label: 'Normas de servicio',
    icon: 'menu_book',
    group: 'daily',
    hint: 'Reglas pre y post servicio para imprimir en el local',
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
    description: 'Gastos y movimientos entre cuentas',
    icon: 'swap_horiz',
    modules: { expenses: 'manage', accountTransfers: 'manage' },
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
    description: 'Carga sus horas de producción y gastos a reintegrar',
    icon: 'restaurant',
    modules: { attendance: 'self', reimbursements: 'self' },
  },
  {
    id: 'reservations-only',
    label: 'Reservas',
    description: 'Solo toma y confirma reservas',
    icon: 'table_restaurant',
    modules: {
      reservations: 'manage',
    },
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
      cashWithdrawals: 'read',
      settlements: 'read',
      reports: 'export',
      expenses: 'read',
      accountTransfers: 'read',
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

/** Migra `movements` legacy a `expenses` + `accountTransfers` (mismo nivel). */
export function migrateModuleLevels(
  raw?: Record<string, string> | null,
): Record<ModuleKey, string> {
  const out = emptyModuleLevels();
  if (!raw || typeof raw !== 'object') return out;
  for (const d of MODULE_DEFS) {
    const v = raw[d.key];
    if (v && d.levels.some((l) => l.value === v)) out[d.key] = v;
  }
  const legacy = raw['movements'];
  if (legacy && legacy !== 'none') {
    const expensesDef = MODULE_DEFS.find((d) => d.key === 'expenses');
    const transfersDef = MODULE_DEFS.find((d) => d.key === 'accountTransfers');
    if (
      expensesDef?.levels.some((l) => l.value === legacy) &&
      (!out.expenses || out.expenses === 'none')
    ) {
      out.expenses = legacy;
    }
    if (
      transfersDef?.levels.some((l) => l.value === legacy) &&
      (!out.accountTransfers || out.accountTransfers === 'none')
    ) {
      out.accountTransfers = legacy;
    }
  }
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
  /** Si es false, el formulario público de reservas está cerrado. */
  reservationSignupEnabled?: boolean;
  /** Si es false, no se toman reservas adentro. */
  reservationInsideEnabled?: boolean;
  /** Si es false, no se toman reservas afuera. */
  reservationOutsideEnabled?: boolean;
  /** Máximo de personas adentro. null = sin tope. */
  reservationInsideMaxPartySize?: number | null;
  /** Máximo de personas afuera. null = ilimitado. */
  reservationOutsideMinPartySize?: number | null;
  reservationOutsideMaxPartySize?: number | null;
  emailMessageTemplates?: Record<string, { subject?: string; body?: string }> | null;
  /** Si es false, lista de espera no está disponible en este local. */
  waitingListEnabled?: boolean;
  /** Si es false, módulo de propinas no está disponible en este local. */
  tipsEnabled?: boolean;
  /** Si el local tiene cuentas aparte que rinden después (efectivo o depósito). */
  settlementsEnabled?: boolean;
  /** Pantalla pública de presentismo para el personal. */
  publicAttendanceEnabled?: boolean;
  /** Página pública de normas pre/post servicio. */
  publicServiceRulesEnabled?: boolean;
  /** Hora de entrada default en servicio (HH:mm). */
  serviceDefaultCheckIn?: string;
  /** Hora de retirada default en servicio (HH:mm). */
  serviceDefaultCheckOut?: string;
  /** Si es false, presentismo de servicio es solo presente/ausente/feriado. */
  serviceAttendanceWithHours?: boolean;
  /** Carta pública del local. */
  menuEnabled?: boolean;
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
  /** Email del local (remitente de notificaciones). */
  email?: string | null;
  /** Usuario de Instagram del local (sin @). */
  instagramHandle?: string | null;
  /** Teléfono del local (WhatsApp a futuro). */
  phone?: string | null;
  /** Si el local tiene contraseña SMTP / de aplicación configurada. */
  emailSmtpConfigured?: boolean;
  /** Si es false, no se envían mails de este local. */
  emailNotificationsEnabled?: boolean;
  /** Tipos de mail; null = todos. */
  emailNotificationTypes?: string[] | null;
  /** Usuarios que reciben mail; null = todos. */
  emailNotificationUserIds?: string[] | null;
  salesSystemId?: string | null;
  posnets?: ShopPosnet[];
  paymentConceptCategories?: {
    supplier?: string[];
    service?: string[];
    employee?: string[];
    movement?: string[];
  } | null;
  /** Orden / visibilidad / agrupación del menú lateral. null = defaults. */
  navConfig?: {
    groups?: Array<{ id: string; label?: string }>;
    itemGroup?: Record<string, string>;
    itemOrder?: Record<string, string[]>;
    hidden?: string[];
    itemLabels?: Record<string, string>;
  } | null;
  /** Override de menú del usuario en este local; null = usar navConfig del local. */
  myNavConfig?: ShopSummary['navConfig'];
  mutedNotificationTypes?: string[];
  isStockAdmin?: boolean;
  isBeverageStockAdmin?: boolean;
  isShortageAdmin?: boolean;
  isReservationAdmin?: boolean;
  canEditExpenses?: boolean;
  canEditPayments?: boolean;
  active?: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  phone?: string | null;
  bankAlias?: string | null;
  cbu?: string | null;
  avatarUrl?: string | null;
  hasAvatar?: boolean;
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
  const allowedExtra = new Set<Permission>([
    'tips.read',
    'tips.create',
    'tips.manage',
  ]);
  const extra = perms.filter(
    (p) =>
      p !== 'closings.create' &&
      p !== 'closings.read' &&
      p !== 'closings.update' &&
      p !== 'closings.lock' &&
      !allowedExtra.has(p),
  );
  // Si solo tiene create (+read opcional) y nada más → layout cajero
  if (extra.length) return false;
  return !perms.includes('closings.update') && !perms.includes('closings.lock');
}

/** Solo carga sus horas de producción (y opcionalmente stock / faltantes). */
export function isProducerOnly(user: AuthUser | null, shopId: string | null): boolean {
  if (!user || !shopId) return false;
  if (user.globalRole === 'OWNER' || user.globalRole === 'ADMIN') return false;
  const perms = permissionsForShop(user, shopId);
  if (!perms.includes('attendance.self')) return false;
  if (perms.includes('attendance.read') || perms.includes('attendance.manage')) return false;
  const allowedExtra = new Set<Permission>([
    'stock.read',
    'stock.manage',
    'beverageStock.read',
    'beverageStock.manage',
    'shortages.read',
    'shortages.manage',
    'reimbursements.self',
  ]);
  const extra = perms.filter(
    (p) => p !== 'attendance.self' && p !== 'reimbursements.self' && !allowedExtra.has(p),
  );
  return extra.length === 0;
}

export function defaultHomeRoute(user: AuthUser | null, shopId: string | null): string {
  if (isCashierOnly(user, shopId)) return '/closings/new';
  if (isProducerOnly(user, shopId)) return '/my-production';
  return '/';
}

export function canEditShopExpenses(user: AuthUser | null, shopId: string | null): boolean {
  if (!user || !shopId) return false;
  if (user.globalRole === 'OWNER') return true;
  return !!user.shops?.find((s) => s.id === shopId)?.canEditExpenses;
}

export function canEditShopPayments(user: AuthUser | null, shopId: string | null): boolean {
  if (!user || !shopId) return false;
  if (user.globalRole === 'OWNER') return true;
  return !!user.shops?.find((s) => s.id === shopId)?.canEditPayments;
}
