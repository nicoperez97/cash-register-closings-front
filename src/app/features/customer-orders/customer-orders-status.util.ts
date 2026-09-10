import {
  CustomerOrderFulfillment,
  CustomerOrderStatus,
  StaffCustomerOrder,
} from './customer-orders-api.service';
import { paymentLabel } from './ordering-ui.util';
import { formatMoney } from '../../shared/utils/money';

export const STATUS_LABEL: Record<CustomerOrderStatus, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptado',
  PREPARING: 'En preparación',
  READY: 'Listo',
  OUT_FOR_DELIVERY: 'En camino',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

export const NEXT_ACTIONS: Partial<
  Record<CustomerOrderStatus, Array<{ status: CustomerOrderStatus; label: string }>>
> = {
  PENDING: [
    { status: 'ACCEPTED', label: 'Aceptar' },
    { status: 'CANCELLED', label: 'Cancelar' },
  ],
  ACCEPTED: [
    { status: 'PREPARING', label: 'Preparar' },
    { status: 'CANCELLED', label: 'Cancelar' },
  ],
  PREPARING: [
    { status: 'READY', label: 'Listo' },
    { status: 'CANCELLED', label: 'Cancelar' },
  ],
  READY: [
    { status: 'OUT_FOR_DELIVERY', label: 'En camino' },
    { status: 'COMPLETED', label: 'Completar' },
  ],
  OUT_FOR_DELIVERY: [{ status: 'COMPLETED', label: 'Completar' }],
};

/** Estado inmediato anterior para “volver atrás”. */
export const PREV_STATUS: Partial<
  Record<CustomerOrderStatus, { status: CustomerOrderStatus; label: string }>
> = {
  ACCEPTED: { status: 'PENDING', label: 'Volver a pendientes' },
  PREPARING: { status: 'ACCEPTED', label: 'Volver a aceptado' },
  READY: { status: 'PREPARING', label: 'Volver a cocina' },
  OUT_FOR_DELIVERY: { status: 'READY', label: 'Volver a listos' },
  COMPLETED: { status: 'READY', label: 'Reabrir a listos' },
};

export function fulfillmentLabelFull(f: CustomerOrderFulfillment | string): string {
  if (f === 'DELIVERY') return 'Delivery';
  if (f === 'COUNTER') return 'Mostrador';
  if (f === 'TABLE') return 'Mesa';
  return 'Take away';
}

export function orderPhoneHref(phone: string | null | undefined): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits || /^1+$/.test(digits) || digits === '0000000000') return '';
  return `tel:+${digits}`;
}

export function isOrderAccredited(order: StaffCustomerOrder): boolean {
  return !!order.paymentAccreditedAt;
}

export function canAcreditOrder(order: StaffCustomerOrder): boolean {
  return order.status !== 'CANCELLED' && !isOrderAccredited(order);
}

/** Desacreditar: solo si está acreditado y el pedido no está cerrado. */
export function canDesacreditOrder(order: StaffCustomerOrder): boolean {
  return (
    isOrderAccredited(order) &&
    order.status !== 'CANCELLED' &&
    order.status !== 'COMPLETED'
  );
}

export function canCompleteOrder(order: StaffCustomerOrder): boolean {
  return isOrderAccredited(order);
}

export function orderPaymentText(order: StaffCustomerOrder): string {
  const base = paymentLabel(order.paymentMethod);
  if (order.paymentMethod === 'CASH' && order.cashAmount != null && order.cashAmount > 0) {
    return `${base} (${formatMoney(order.cashAmount)})`;
  }
  return base;
}

export function nextActionsFor(order: StaffCustomerOrder) {
  const actions = [...(NEXT_ACTIONS[order.status] ?? [])];
  if (
    order.status === 'READY' &&
    (order.fulfillment === 'TAKEAWAY' || order.fulfillment === 'COUNTER')
  ) {
    return actions.filter((a) => a.status !== 'OUT_FOR_DELIVERY');
  }
  return actions;
}

export function primaryForwardAction(order: StaffCustomerOrder) {
  return nextActionsFor(order).find((a) => a.status !== 'CANCELLED') ?? null;
}

export function cancelActionFor(order: StaffCustomerOrder) {
  return nextActionsFor(order).find((a) => a.status === 'CANCELLED') ?? null;
}

export function previousStatusAction(order: StaffCustomerOrder) {
  if (order.status === 'COMPLETED' && order.fulfillment === 'DELIVERY') {
    return { status: 'OUT_FOR_DELIVERY' as const, label: 'Reabrir a en camino' };
  }
  return PREV_STATUS[order.status] ?? null;
}
