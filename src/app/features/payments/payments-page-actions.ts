import { isUserVisible } from '../../shared/user-visibility';
import type { UserVisibility } from '../../shared/user-visibility';
import type { PaymentStatus, ShopPayment } from './payments-api.service';

export type PaymentKind = 'supplier' | 'employee' | 'service';
export type PaymentsViewMode = 'cards' | 'list';

const PAYMENTS_VIEW_KEY = 'crc.payments.viewMode';

export function loadPaymentsViewMode(): PaymentsViewMode {
  try {
    const v = localStorage.getItem(PAYMENTS_VIEW_KEY);
    return v === 'list' || v === 'cards' ? v : 'list';
  } catch {
    return 'list';
  }
}

export function savePaymentsViewMode(mode: PaymentsViewMode): void {
  try {
    localStorage.setItem(PAYMENTS_VIEW_KEY, mode);
  } catch {
    // ignore
  }
}

/** Slug seguro para nombres de archivo de export (local). */
export function shopFileSlug(name?: string | null): string {
  const raw = (name ?? 'local')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return raw || 'local';
}

export type PaymentsShopUserRow = {
  id: string;
  fullName: string;
  visibility?: Partial<UserVisibility> | null;
  hideFromCashWithdraw?: boolean;
};

export function mapShopUsersForPayments(
  rows: Array<{
    id: string;
    fullName: string;
    visibility?: Partial<UserVisibility> | null;
    hideFromCashWithdraw?: boolean;
  }>,
): PaymentsShopUserRow[] {
  return rows.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    visibility: u.visibility,
    hideFromCashWithdraw: u.hideFromCashWithdraw,
  }));
}

export type PaymentAccountRow = {
  id: string;
  name: string;
  type?: string;
  active?: boolean;
};

export function filterActivePaymentAccounts(
  rows: PaymentAccountRow[],
): Array<{ id: string; name: string }> {
  return rows
    .filter(
      (a) =>
        a.active !== false &&
        a.type !== 'SUPPLIER' &&
        a.type !== 'SERVICE' &&
        a.type !== 'SYSTEM',
    )
    .map((a) => ({ id: a.id, name: a.name }));
}

export function downloadBlobFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function paymentsExportFilename(
  kind: PaymentKind,
  shopNameOrSlug: string | null | undefined,
  stamp: string,
): string {
  const kindSlug =
    kind === 'supplier' ? 'proveedores' : kind === 'service' ? 'servicios' : 'empleados';
  return `pagos-${kindSlug}-${shopFileSlug(shopNameOrSlug)}-${stamp}.xlsx`;
}

export function buildPaymentDialogAccounts(
  accounts: Array<{ id: string; name: string }>,
  payment?: Pick<ShopPayment, 'accountId' | 'accountName'> | null,
): Array<{ id: string; name: string }> {
  const next = [...accounts];
  if (
    payment?.accountId &&
    payment.accountName &&
    !next.some((a) => a.id === payment.accountId)
  ) {
    next.unshift({ id: payment.accountId, name: payment.accountName });
  }
  return next;
}

export function buildPaymentDialogUsers<
  T extends { id: string; visibility?: Partial<UserVisibility> | null },
>(
  users: T[],
  payment?: Pick<ShopPayment, 'payerUserId' | 'validatorUserId'> | null,
): T[] {
  return users.filter(
    (u) =>
      isUserVisible(u, 'payments') ||
      u.id === payment?.payerUserId ||
      u.id === payment?.validatorUserId,
  );
}

export function kindOfPayment(
  payment: Pick<ShopPayment, 'supplierId' | 'serviceId'>,
): PaymentKind {
  if (payment.serviceId) return 'service';
  if (payment.supplierId) return 'supplier';
  return 'employee';
}

export function paymentKindPath(kind: PaymentKind): string {
  if (kind === 'supplier') return '/payments/suppliers';
  if (kind === 'service') return '/payments/services';
  return '/payments/employees';
}

export function paymentMatchesKind(
  payment: Pick<ShopPayment, 'supplierId' | 'serviceId'>,
  kind: PaymentKind,
): boolean {
  return kindOfPayment(payment) === kind;
}

/** Si el pago del deep-link es de otra sección, ruta destino; si no, null. */
export function shouldRedirectPaymentKind(
  payment: Pick<ShopPayment, 'supplierId' | 'serviceId'>,
  currentKind: PaymentKind,
): string | null {
  const wanted = kindOfPayment(payment);
  if (wanted === currentKind) return null;
  return paymentKindPath(wanted);
}

export type ClearedFiltersForDeepLink = {
  mineOnly: false;
  validatorFilter: string[];
  payerFilter: string[];
  supplierFilter: string[];
  serviceFilter: string[];
  employeeFilter: string[];
  amountMin: null;
  amountMax: null;
  dueRange: { start: null; end: null };
  paidRange: { start: null; end: null };
  statusFilter: PaymentStatus[];
};

/** Valores para resetear filtros y mostrar el pago del enlace. */
export function clearedFiltersForDeepLink(
  payment: Pick<ShopPayment, 'status'>,
): ClearedFiltersForDeepLink {
  return {
    mineOnly: false,
    validatorFilter: [],
    payerFilter: [],
    supplierFilter: [],
    serviceFilter: [],
    employeeFilter: [],
    amountMin: null,
    amountMax: null,
    dueRange: { start: null, end: null },
    paidRange: { start: null, end: null },
    statusFilter: [payment.status],
  };
}
