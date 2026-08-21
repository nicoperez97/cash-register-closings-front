/** Espejo del catálogo de dump/reset (API shop-backup-modules). */

export type BackupModuleId =
  | 'catalog'
  | 'closings'
  | 'movements'
  | 'posMenu'
  | 'posSales'
  | 'staff'
  | 'attendance'
  | 'payroll';

export interface BackupModuleOption {
  id: BackupModuleId;
  label: string;
  alsoClears: BackupModuleId[];
}

export const BACKUP_MODULE_OPTIONS: BackupModuleOption[] = [
  {
    id: 'catalog',
    label: 'Cuentas y conceptos',
    alsoClears: ['movements', 'closings'],
  },
  { id: 'closings', label: 'Cierres', alsoClears: [] },
  { id: 'movements', label: 'Movimientos / gastos', alsoClears: [] },
  { id: 'posMenu', label: 'Carta POS', alsoClears: ['posSales'] },
  { id: 'posSales', label: 'Ventas POS', alsoClears: [] },
  { id: 'staff', label: 'Empleados', alsoClears: ['attendance', 'payroll'] },
  { id: 'attendance', label: 'Presentismo', alsoClears: [] },
  { id: 'payroll', label: 'Nómina', alsoClears: [] },
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
