import { ensureAdminPath } from '../routing/admin-base';

export type NotificationLinkInput = {
  type: string;
  shopId?: string | null;
  paymentId?: string | null;
  closingId?: string | null;
  targetId?: string | null;
};

export type NotificationRouterLink = {
  commands: string[];
  queryParams: Record<string, string>;
};

/** Ruta + query para abrir el local, el módulo y (si hay id) el registro. */
export function notificationRouterLink(n: NotificationLinkInput): NotificationRouterLink {
  const q: Record<string, string> = {};
  if (n.shopId) q['shop'] = n.shopId;

  if (n.closingId) {
    return { commands: ['/admin/closings', n.closingId], queryParams: q };
  }
  if (n.type === 'CLOSING_CREATED') {
    return { commands: ['/admin/closings'], queryParams: q };
  }
  if (n.type === 'CASH_WITHDRAWAL_PICKED') {
    return { commands: ['/admin/cash-withdrawals'], queryParams: q };
  }
  if (n.type === 'PRODUCTION_HOURS_LOGGED') {
    return { commands: ['/admin/production-attendance'], queryParams: q };
  }
  if (n.type === 'STOCK_BELOW_MINIMUM' || n.type === 'STOCK_SHARED') {
    return { commands: ['/admin/stock'], queryParams: q };
  }
  if (
    n.type === 'BEVERAGE_STOCK_BELOW_MINIMUM' ||
    n.type === 'BEVERAGE_STOCK_SHARED'
  ) {
    return { commands: ['/admin/beverage-stock'], queryParams: q };
  }
  if (
    n.type === 'SHORTAGE_CREATED' ||
    n.type === 'SHORTAGE_LEVEL_LOW' ||
    n.type === 'SHORTAGE_RESOLVED'
  ) {
    if (n.targetId) q['shortage'] = n.targetId;
    return { commands: ['/admin/shortages'], queryParams: q };
  }
  if (n.paymentId || n.type.startsWith('PAYMENT_')) {
    if (n.paymentId) q['payment'] = n.paymentId;
    return { commands: ['/admin/payments/suppliers'], queryParams: q };
  }
  if (n.type === 'RESERVATION_REQUEST') {
    if (n.targetId) q['request'] = n.targetId;
    return { commands: ['/admin/reservations'], queryParams: q };
  }
  if (n.type === 'CUSTOMER_ORDER_CREATED') {
    if (n.targetId) q['order'] = n.targetId;
    return { commands: ['/admin/customer-orders'], queryParams: q };
  }
  if (n.type.startsWith('MOVEMENT_')) {
    if (n.targetId && n.type !== 'MOVEMENT_DELETED') q['movement'] = n.targetId;
    return { commands: ['/admin/expenses'], queryParams: q };
  }
  if (n.type === 'REIMBURSEMENT_CREATED') {
    if (n.targetId) q['reimbursement'] = n.targetId;
    return { commands: ['/admin/reimbursements'], queryParams: q };
  }
  return { commands: ['/admin/inicio'], queryParams: q };
}

export function notificationUrl(n: NotificationLinkInput): string {
  const { commands, queryParams } = notificationRouterLink(n);
  const path = commands.join('/').replace(/\/{2,}/g, '/') || '/';
  const qs = new URLSearchParams(queryParams).toString();
  return qs ? `${path}?${qs}` : path;
}

/** Arma la ruta interna de una push (url o type + ids). */
export function pathFromPushData(data?: {
  url?: string | null;
  type?: string | null;
  shopId?: string | null;
  paymentId?: string | null;
  closingId?: string | null;
  targetId?: string | null;
} | null): string {
  if (!data) return '/admin/inicio';
  const raw = String(data.url || '').trim();
  if (raw && raw !== '/' && raw !== '/admin/inicio') {
    try {
      const u = new URL(raw, 'https://local.invalid');
      return ensureAdminPath(`${u.pathname}${u.search}${u.hash}`) || '/admin/inicio';
    } catch {
      const path = raw.startsWith('/') ? raw : `/${raw}`;
      return ensureAdminPath(path);
    }
  }
  if (data.type) {
    return notificationUrl({
      type: data.type,
      shopId: data.shopId,
      paymentId: data.paymentId,
      closingId: data.closingId,
      targetId: data.targetId,
    });
  }
  return '/admin/inicio';
}
