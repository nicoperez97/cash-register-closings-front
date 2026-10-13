/** Flags de notificación / rol admin por módulo (UserShop). */
export type UserAdminFlagKey =
  | 'isStockAdmin'
  | 'isBeverageStockAdmin'
  | 'isShortageAdmin'
  | 'isReservationAdmin'
  | 'isCustomerOrdersAdmin'
  | 'isAttendanceCheckInAdmin';

export const USER_ADMIN_FLAG_OPTIONS: Array<{
  key: UserAdminFlagKey;
  label: string;
  hint: string;
  icon: string;
}> = [
  {
    key: 'isStockAdmin',
    label: 'Stock alimentos',
    hint: 'Avisa cuando un alimento baja del mínimo.',
    icon: 'kitchen',
  },
  {
    key: 'isBeverageStockAdmin',
    label: 'Stock bebidas',
    hint: 'Avisa cuando una bebida baja del mínimo.',
    icon: 'local_bar',
  },
  {
    key: 'isShortageAdmin',
    label: 'Faltantes',
    hint: 'Avisa faltantes críticos o resueltos.',
    icon: 'report',
  },
  {
    key: 'isReservationAdmin',
    label: 'Reservas',
    hint: 'Avisa solicitudes de reserva nuevas.',
    icon: 'table_restaurant',
  },
  {
    key: 'isCustomerOrdersAdmin',
    label: 'Pedidos online',
    hint: 'Avisa pedidos take away / delivery.',
    icon: 'shopping_bag',
  },
  {
    key: 'isAttendanceCheckInAdmin',
    label: 'Fichaje',
    hint: 'Avisa cuando alguien marca presente en /fichar.',
    icon: 'pin',
  },
];

export const USER_EDIT_FLAG_OPTIONS: Array<{
  key: 'canEditExpenses' | 'canEditPayments';
  label: string;
  hint: string;
  icon: string;
}> = [
  {
    key: 'canEditExpenses',
    label: 'Editar gastos',
    hint: 'Puede modificar o borrar gastos de este local.',
    icon: 'edit_note',
  },
  {
    key: 'canEditPayments',
    label: 'Editar pagos',
    hint: 'Puede modificar o borrar pagos y elegir estado al crear.',
    icon: 'payments',
  },
];
