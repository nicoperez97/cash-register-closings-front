export type EmailMessageTemplate = {
  subject?: string;
  body?: string;
};

export type EmailMessageTemplates = Record<string, EmailMessageTemplate>;

export const EMAIL_MESSAGE_TYPE_OPTIONS: Array<{
  value: string;
  label: string;
  group: 'staff' | 'guest';
  defaultSubject: string;
  defaultBody: string;
}> = [
  {
    value: 'PAYMENT_VALIDATE',
    label: 'Pagos · pendiente de validar',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'PAYMENT_PAY',
    label: 'Pagos · pendiente de abonar',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'PAYMENT_REJECTED',
    label: 'Pagos · rechazados',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'PAYMENT_PAID',
    label: 'Pagos · abonados',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'CLOSING_CREATED',
    label: 'Cierres creados',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'CASH_WITHDRAWAL_PICKED',
    label: 'Retiros de efectivo',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'PRODUCTION_HOURS_LOGGED',
    label: 'Horas de producción cargadas',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'STOCK_BELOW_MINIMUM',
    label: 'Stock alimentos · bajo el mínimo',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'STOCK_SHARED',
    label: 'Stock alimentos · compartido',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'BEVERAGE_STOCK_BELOW_MINIMUM',
    label: 'Stock bebidas · bajo el mínimo',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'BEVERAGE_STOCK_SHARED',
    label: 'Stock bebidas · compartido',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'SHORTAGE_CREATED',
    label: 'Faltantes · crítico cargado',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'SHORTAGE_LEVEL_LOW',
    label: 'Faltantes · bajó a crítico',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'SHORTAGE_RESOLVED',
    label: 'Faltantes · resuelto',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'RESERVATION_REQUEST',
    label: 'Reservas · solicitud nueva',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'MOVEMENT_CREATED',
    label: 'Movimientos y gastos rápidos',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'REIMBURSEMENT_CREATED',
    label: 'Reintegros · gasto de productor',
    group: 'staff',
    defaultSubject: '{title}',
    defaultBody: '{body}',
  },
  {
    value: 'RESERVATION_ACCEPTED',
    label: 'Comensal · reserva confirmada',
    group: 'guest',
    defaultSubject: 'Reserva confirmada en {shop}',
    defaultBody:
      'Hola {guest}, tu reserva quedó confirmada.\n\n{detail}\n\nTe esperamos en {shop}.',
  },
  {
    value: 'RESERVATION_REJECTED',
    label: 'Comensal · reserva no confirmada',
    group: 'guest',
    defaultSubject: 'No pudimos confirmar tu reserva en {shop}',
    defaultBody:
      'Hola {guest}, esta vez no pudimos confirmar tu reserva ({detail}).{body}\n\nSi querés, podés intentar otra fecha o escribirnos. Gracias por pensarnos.',
  },
  {
    value: 'RESERVATION_STAFF_MESSAGE',
    label: 'Comensal · mensaje del local',
    group: 'guest',
    defaultSubject: 'Mensaje de {shop}',
    defaultBody: 'Hola {guest},\n\n{body}\n\nTu reserva: {detail}\n\n{shop}',
  },
];
