/** Dónde se muestra un usuario del local (true = visible). */
export type UserVisibilityKey =
  | 'cashWithdraw'
  | 'closingsFilters'
  | 'payments'
  | 'movements'
  | 'employeeLink'
  | 'usersList';

export type UserVisibility = Record<UserVisibilityKey, boolean>;

export const USER_VISIBILITY_OPTIONS: Array<{
  key: UserVisibilityKey;
  label: string;
  hint: string;
}> = [
  {
    key: 'cashWithdraw',
    label: 'Quién se lo lleva',
    hint: 'Cierre, retiros de efectivo e iPad',
  },
  {
    key: 'closingsFilters',
    label: 'Filtros de cierres y reportes',
    hint: '«Quién se lo lleva» y «Creado por»',
  },
  {
    key: 'payments',
    label: 'Pagos',
    hint: 'Quién paga / quién valida (filtros y formularios)',
  },
  {
    key: 'movements',
    label: 'Gastos / movimientos',
    hint: 'Usuario origen / destino en gastos y transferencias',
  },
  {
    key: 'employeeLink',
    label: 'Usuario vinculado a empleado',
    hint: 'Selector al crear/editar empleados',
  },
  {
    key: 'usersList',
    label: 'Lista de usuarios',
    hint: 'Listado de administración (super admin siempre los ve)',
  },
];

export function defaultUserVisibility(): UserVisibility {
  return {
    cashWithdraw: true,
    closingsFilters: true,
    payments: true,
    movements: true,
    employeeLink: true,
    usersList: true,
  };
}

export function normalizeUserVisibility(
  raw?: Partial<UserVisibility> | null,
  opts?: { hideFromCashWithdraw?: boolean },
): UserVisibility {
  const base = defaultUserVisibility();
  if (opts?.hideFromCashWithdraw) base.cashWithdraw = false;
  if (!raw || typeof raw !== 'object') return base;
  for (const opt of USER_VISIBILITY_OPTIONS) {
    if (raw[opt.key] !== undefined) base[opt.key] = !!raw[opt.key];
  }
  return base;
}

export function isUserVisible(
  user: {
    visibility?: Partial<UserVisibility> | null;
    hideFromCashWithdraw?: boolean;
  } | null | undefined,
  key: UserVisibilityKey,
): boolean {
  if (!user) return true;
  return normalizeUserVisibility(user.visibility, {
    hideFromCashWithdraw: !!user.hideFromCashWithdraw,
  })[key] !== false;
}
