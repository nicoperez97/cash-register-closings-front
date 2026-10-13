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
  icon: string;
}> = [
  {
    key: 'cashWithdraw',
    label: 'Quién se lo lleva',
    hint: 'Cierre, retiros de efectivo e iPad',
    icon: 'payments',
  },
  {
    key: 'closingsFilters',
    label: 'Filtros de cierres',
    hint: '«Quién se lo lleva» y «Creado por»',
    icon: 'filter_list',
  },
  {
    key: 'payments',
    label: 'Pagos',
    hint: 'Quién paga / quién valida',
    icon: 'account_balance_wallet',
  },
  {
    key: 'movements',
    label: 'Gastos / movimientos',
    hint: 'Usuario origen / destino',
    icon: 'swap_horiz',
  },
  {
    key: 'employeeLink',
    label: 'Vínculo a empleado',
    hint: 'Selector al crear/editar empleados',
    icon: 'badge',
  },
  {
    key: 'usersList',
    label: 'Lista de usuarios',
    hint: 'Listado de administración',
    icon: 'group',
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
