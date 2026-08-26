import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type NotificationType =
  | 'PAYMENT_VALIDATE'
  | 'PAYMENT_PAY'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_PAID'
  | 'CLOSING_CREATED'
  | 'CASH_WITHDRAWAL_PICKED'
  | 'PRODUCTION_HOURS_LOGGED'
  | 'STOCK_BELOW_MINIMUM'
  | 'STOCK_SHARED'
  | 'BEVERAGE_STOCK_BELOW_MINIMUM'
  | 'BEVERAGE_STOCK_SHARED'
  | 'SHORTAGE_CREATED'
  | 'SHORTAGE_LEVEL_LOW'
  | 'SHORTAGE_RESOLVED'
  | 'RESERVATION_REQUEST'
  | 'MOVEMENT_CREATED'
  | 'MOVEMENT_UPDATED'
  | 'MOVEMENT_DELETED'
  | 'PAYMENT_UPDATED'
  | 'PAYMENT_DELETED'
  | 'REIMBURSEMENT_CREATED';

export interface AppNotification {
  id: string;
  userId: string;
  shopId: string | null;
  shopName?: string | null;
  shopLogoUrl?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  paymentId: string | null;
  closingId?: string | null;
  targetId?: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export function notificationIcon(type: NotificationType | string): string {
  switch (type) {
    case 'PAYMENT_VALIDATE':
      return 'fact_check';
    case 'PAYMENT_PAY':
      return 'payments';
    case 'PAYMENT_REJECTED':
      return 'cancel';
    case 'PAYMENT_PAID':
      return 'check_circle';
    case 'PAYMENT_UPDATED':
      return 'edit';
    case 'PAYMENT_DELETED':
      return 'delete';
    case 'CLOSING_CREATED':
      return 'point_of_sale';
    case 'CASH_WITHDRAWAL_PICKED':
      return 'payments';
    case 'PRODUCTION_HOURS_LOGGED':
      return 'restaurant';
    case 'STOCK_BELOW_MINIMUM':
    case 'BEVERAGE_STOCK_BELOW_MINIMUM':
      return 'inventory';
    case 'STOCK_SHARED':
    case 'BEVERAGE_STOCK_SHARED':
      return 'share';
    case 'SHORTAGE_CREATED':
    case 'SHORTAGE_LEVEL_LOW':
      return 'report';
    case 'SHORTAGE_RESOLVED':
      return 'check_circle';
    case 'RESERVATION_REQUEST':
      return 'table_restaurant';
    case 'MOVEMENT_CREATED':
      return 'swap_horiz';
    case 'MOVEMENT_UPDATED':
      return 'edit';
    case 'MOVEMENT_DELETED':
      return 'delete';
    case 'REIMBURSEMENT_CREATED':
      return 'receipt_long';
    default:
      return 'notifications';
  }
}

/** Clase CSS de color por tipo (toolbar / lista). */
export function notificationToneClass(type: NotificationType | string): string {
  switch (type) {
    case 'PAYMENT_VALIDATE':
      return 'notif-tone--amber';
    case 'PAYMENT_PAY':
      return 'notif-tone--blue';
    case 'PAYMENT_REJECTED':
      return 'notif-tone--red';
    case 'PAYMENT_PAID':
      return 'notif-tone--green';
    case 'PAYMENT_UPDATED':
      return 'notif-tone--blue';
    case 'PAYMENT_DELETED':
      return 'notif-tone--red';
    case 'CLOSING_CREATED':
      return 'notif-tone--navy';
    case 'CASH_WITHDRAWAL_PICKED':
      return 'notif-tone--green';
    case 'PRODUCTION_HOURS_LOGGED':
      return 'notif-tone--green';
    case 'STOCK_BELOW_MINIMUM':
    case 'BEVERAGE_STOCK_BELOW_MINIMUM':
      return 'notif-tone--red';
    case 'STOCK_SHARED':
    case 'BEVERAGE_STOCK_SHARED':
      return 'notif-tone--green';
    case 'SHORTAGE_CREATED':
    case 'SHORTAGE_LEVEL_LOW':
      return 'notif-tone--red';
    case 'SHORTAGE_RESOLVED':
      return 'notif-tone--green';
    case 'RESERVATION_REQUEST':
      return 'notif-tone--amber';
    case 'MOVEMENT_CREATED':
      return 'notif-tone--navy';
    case 'MOVEMENT_UPDATED':
      return 'notif-tone--navy';
    case 'MOVEMENT_DELETED':
      return 'notif-tone--red';
    case 'REIMBURSEMENT_CREATED':
      return 'notif-tone--amber';
    default:
      return 'notif-tone--muted';
  }
}

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(shopId?: string | null, unreadOnly = false) {
    const params: Record<string, string> = {};
    if (shopId) params['shopId'] = shopId;
    if (unreadOnly) params['unreadOnly'] = '1';
    return this.http.get<AppNotification[]>(`${this.base}/notifications`, { params });
  }

  unreadCount(shopId?: string | null) {
    const params: Record<string, string> = {};
    if (shopId) params['shopId'] = shopId;
    return this.http.get<{ count: number }>(`${this.base}/notifications/unread-count`, { params });
  }

  unreadCountsByShop() {
    return this.http.get<{ counts: Record<string, number> }>(
      `${this.base}/notifications/unread-counts-by-shop`,
    );
  }

  markRead(id: string) {
    return this.http.patch<{ ok: boolean }>(`${this.base}/notifications/${id}/read`, {});
  }

  markAllRead(shopId?: string | null) {
    const params: Record<string, string> = {};
    if (shopId) params['shopId'] = shopId;
    return this.http.post<{ ok: boolean }>(`${this.base}/notifications/read-all`, {}, { params });
  }
}
