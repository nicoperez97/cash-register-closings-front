/** Espejo del catálogo de dump/reset (API shop-backup-modules). */

export type BackupModuleGroup =
  | 'config'
  | 'operacion'
  | 'cuentas'
  | 'salon'
  | 'stock'
  | 'personal'
  | 'pagos'
  | 'pos';

export type BackupModuleId =
  | 'catalog'
  | 'concepts'
  | 'closings'
  | 'cashWithdrawals'
  | 'settlements'
  | 'movements'
  | 'expenses'
  | 'incomes'
  | 'partnerSplits'
  | 'paymentsSuppliers'
  | 'paymentsServices'
  | 'paymentsEmployees'
  | 'suppliers'
  | 'services'
  | 'posMenu'
  | 'posSales'
  | 'reservations'
  | 'waitingList'
  | 'salon'
  | 'stock'
  | 'beverageStock'
  | 'shortages'
  | 'orders'
  | 'staff'
  | 'candidates'
  | 'commissions'
  | 'attendance'
  | 'productionAttendance'
  | 'payroll'
  | 'tips'
  | 'reimbursements'
  | 'serviceRules';

export interface BackupModuleOption {
  id: BackupModuleId;
  label: string;
  group: BackupModuleGroup;
  alsoClears: BackupModuleId[];
}

export const BACKUP_MODULE_GROUPS: Array<{ id: BackupModuleGroup; label: string }> = [
  { id: 'operacion', label: 'Operación' },
  { id: 'cuentas', label: 'Cuentas y movimientos' },
  { id: 'pagos', label: 'Pagos' },
  { id: 'salon', label: 'Salón' },
  { id: 'stock', label: 'Stock' },
  { id: 'personal', label: 'Personal' },
  { id: 'pos', label: 'POS' },
  { id: 'config', label: 'Configuración' },
];

export const BACKUP_MODULE_OPTIONS: BackupModuleOption[] = [
  { id: 'closings', label: 'Cierres', group: 'operacion', alsoClears: ['cashWithdrawals', 'settlements'] },
  { id: 'cashWithdrawals', label: 'A Retirar', group: 'operacion', alsoClears: [] },
  { id: 'settlements', label: 'Rendiciones', group: 'operacion', alsoClears: [] },
  { id: 'tips', label: 'Propinas', group: 'operacion', alsoClears: [] },
  { id: 'serviceRules', label: 'Normas de servicio', group: 'operacion', alsoClears: [] },
  { id: 'expenses', label: 'Gastos', group: 'cuentas', alsoClears: [] },
  { id: 'incomes', label: 'Ingresos', group: 'cuentas', alsoClears: [] },
  { id: 'movements', label: 'Movimientos entre cuentas', group: 'cuentas', alsoClears: [] },
  { id: 'partnerSplits', label: 'División de socios', group: 'cuentas', alsoClears: [] },
  { id: 'paymentsSuppliers', label: 'Pagos a proveedores', group: 'pagos', alsoClears: [] },
  { id: 'paymentsServices', label: 'Pagos a servicios', group: 'pagos', alsoClears: [] },
  { id: 'paymentsEmployees', label: 'Pagos a empleados', group: 'pagos', alsoClears: [] },
  { id: 'suppliers', label: 'Proveedores', group: 'pagos', alsoClears: ['paymentsSuppliers'] },
  { id: 'services', label: 'Servicios', group: 'pagos', alsoClears: ['paymentsServices'] },
  { id: 'reservations', label: 'Reservas', group: 'salon', alsoClears: [] },
  { id: 'waitingList', label: 'Lista de espera', group: 'salon', alsoClears: [] },
  { id: 'salon', label: 'Salón', group: 'salon', alsoClears: [] },
  { id: 'stock', label: 'Stock alimentos', group: 'stock', alsoClears: [] },
  { id: 'beverageStock', label: 'Stock bebidas', group: 'stock', alsoClears: [] },
  { id: 'shortages', label: 'Faltantes', group: 'stock', alsoClears: [] },
  { id: 'orders', label: 'Pedidos', group: 'stock', alsoClears: [] },
  {
    id: 'staff',
    label: 'Empleados',
    group: 'personal',
    alsoClears: [
      'attendance',
      'productionAttendance',
      'payroll',
      'commissions',
      'reimbursements',
      'tips',
      'paymentsEmployees',
    ],
  },
  { id: 'candidates', label: 'CVs / Candidatos', group: 'personal', alsoClears: [] },
  { id: 'payroll', label: 'Liquidaciones', group: 'personal', alsoClears: [] },
  { id: 'commissions', label: 'Comisiones', group: 'personal', alsoClears: [] },
  { id: 'attendance', label: 'Asistencia servicio', group: 'personal', alsoClears: [] },
  { id: 'productionAttendance', label: 'Asistencia producción', group: 'personal', alsoClears: [] },
  { id: 'reimbursements', label: 'Reintegros', group: 'personal', alsoClears: [] },
  { id: 'posMenu', label: 'Carta POS', group: 'pos', alsoClears: ['posSales'] },
  { id: 'posSales', label: 'Ventas POS', group: 'pos', alsoClears: [] },
  {
    id: 'catalog',
    label: 'Cuentas',
    group: 'config',
    alsoClears: [
      'movements',
      'expenses',
      'incomes',
      'paymentsSuppliers',
      'paymentsServices',
      'paymentsEmployees',
      'suppliers',
      'services',
      'partnerSplits',
      'cashWithdrawals',
    ],
  },
  {
    id: 'concepts',
    label: 'Conceptos',
    group: 'config',
    alsoClears: [
      'movements',
      'expenses',
      'incomes',
      'paymentsSuppliers',
      'paymentsServices',
      'paymentsEmployees',
    ],
  },
];

const LABEL = new Map(BACKUP_MODULE_OPTIONS.map((m) => [m.id, m.label]));

export function expandBackupModulesClient(selected: BackupModuleId[]): BackupModuleId[] {
  const out = new Set<BackupModuleId>(selected);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...out]) {
      const def = BACKUP_MODULE_OPTIONS.find((m) => m.id === id);
      if (!def) continue;
      for (const dep of def.alsoClears) {
        if (!out.has(dep)) {
          out.add(dep);
          changed = true;
        }
      }
    }
  }
  return BACKUP_MODULE_OPTIONS.map((m) => m.id).filter((id) => out.has(id));
}

export function backupModuleLabel(id: BackupModuleId): string {
  return LABEL.get(id) ?? id;
}

export function alsoClearsHint(selected: BackupModuleId[]): string {
  const expanded = expandBackupModulesClient(selected);
  const extras = expanded.filter((id) => !selected.includes(id));
  if (!extras.length) return '';
  return extras.map(backupModuleLabel).join(', ');
}
