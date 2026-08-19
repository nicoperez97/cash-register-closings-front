import { formatIsoDateDisplay } from '../../core/shop/business-date';
import {
  PaymentStatus,
  ShopPayment,
  paymentMethodLabel,
  paymentPriorityLabel,
  paymentPriorityRank,
} from './payments-api.service';

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING_VALIDATION: 'Pendiente de validar',
  VALIDATED: 'Validado · por pagar',
  REJECTED: 'Rechazado',
  PAID: 'Pagado',
  CANCELLED: 'Cancelado',
};

export function dueTime(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(`${String(iso).slice(0, 10)}T12:00:00`);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

export function compareDueDate(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return dueTime(a) - dueTime(b);
}

export type PaymentSortKey =
  | 'updated'
  | 'due'
  | 'amountDesc'
  | 'amountAsc'
  | 'priority'
  | 'created'
  | 'paid';

export const PAYMENT_SORT_OPTIONS: Array<{
  value: PaymentSortKey;
  label: string;
  paidOnly?: boolean;
}> = [
  { value: 'updated', label: 'Última modificación' },
  { value: 'due', label: 'Vencimiento' },
  { value: 'amountDesc', label: 'Importe (mayor)' },
  { value: 'amountAsc', label: 'Importe (menor)' },
  { value: 'priority', label: 'Prioridad' },
  { value: 'created', label: 'Fecha de creación' },
  { value: 'paid', label: 'Fecha de pago', paidOnly: true },
];

const PAYMENT_SORT_KEY = 'crc.payments.sort';

export function loadPaymentSort(): PaymentSortKey {
  try {
    const v = localStorage.getItem(PAYMENT_SORT_KEY);
    if (PAYMENT_SORT_OPTIONS.some((o) => o.value === v)) return v as PaymentSortKey;
  } catch {
    /* ignore */
  }
  return 'updated';
}

export function savePaymentSort(key: PaymentSortKey): void {
  try {
    localStorage.setItem(PAYMENT_SORT_KEY, key);
  } catch {
    /* ignore */
  }
}

function isoTime(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

function compareIsoDesc(a: string | null | undefined, b: string | null | undefined): number {
  const av = isoTime(a);
  const bv = isoTime(b);
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return bv - av;
}

export function comparePayments(a: ShopPayment, b: ShopPayment, sort: PaymentSortKey): number {
  switch (sort) {
    case 'due':
      return compareDueDate(a.dueDate, b.dueDate);
    case 'amountDesc':
      return Number(b.amount || 0) - Number(a.amount || 0);
    case 'amountAsc':
      return Number(a.amount || 0) - Number(b.amount || 0);
    case 'priority': {
      const byPrio = paymentPriorityRank(a.priority) - paymentPriorityRank(b.priority);
      if (byPrio !== 0) return byPrio;
      return compareDueDate(a.dueDate, b.dueDate);
    }
    case 'created':
      return compareIsoDesc(a.createdAt, b.createdAt);
    case 'paid':
      return compareIsoDesc(a.paidAt, b.paidAt);
    case 'updated':
    default:
      return compareIsoDesc(a.updatedAt || a.createdAt, b.updatedAt || b.createdAt);
  }
}

/** Días hasta el vencimiento (negativo = vencido). null si no hay fecha. */
export function daysUntilDue(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const due = Date.parse(`${String(iso).slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(due)) return null;
  const now = new Date();
  const today = Date.parse(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T12:00:00`,
  );
  return Math.round((due - today) / 86_400_000);
}

export type PaymentDueUrgency = 'overdue' | 'soon' | 'ok' | 'none';

/** overdue | soon (≤3 días) | ok | none — solo para pagos abiertos. */
export function paymentDueUrgency(p: ShopPayment): PaymentDueUrgency {
  if (!p.dueDate) return 'none';
  if (p.status !== 'PENDING_VALIDATION' && p.status !== 'VALIDATED') return 'none';
  const days = daysUntilDue(p.dueDate);
  if (days == null) return 'none';
  if (days < 0) return 'overdue';
  if (days <= 3) return 'soon';
  return 'ok';
}

export function paymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_STATUS_LABEL[status] ?? status;
}

export const PAYMENT_STATUS_OPTIONS: Array<{ value: PaymentStatus; label: string }> = (
  Object.entries(PAYMENT_STATUS_LABEL) as Array<[PaymentStatus, string]>
).map(([value, label]) => ({ value, label }));

export function paymentMethodDisplay(method: ShopPayment['paymentMethod']): string {
  return paymentMethodLabel(method);
}

export function paymentPriorityDisplay(priority: ShopPayment['priority']): string {
  return paymentPriorityLabel(priority);
}

export function formatPaymentDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatIsoDateDisplay(iso);
}

export function formatPaymentAmount(amount: number | null | undefined): string {
  return Number(amount || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function paymentHasInvoiceData(p: ShopPayment): boolean {
  return !!(
    p.hasInvoiceFile ||
    p.invoiceLegalName ||
    p.invoiceTaxId ||
    p.invoiceType ||
    p.invoiceNumber ||
    p.invoiceNetAmount != null ||
    p.invoiceIvaAmount != null ||
    p.invoicePerceptionsAmount != null ||
    p.invoiceOtherTaxesAmount != null
  );
}
