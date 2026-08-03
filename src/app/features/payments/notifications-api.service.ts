import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type NotificationType =
  | 'PAYMENT_VALIDATE'
  | 'PAYMENT_PAY'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_PAID';

export interface AppNotification {
  id: string;
  userId: string;
  shopId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  paymentId: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
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

  markRead(id: string) {
    return this.http.patch<{ ok: boolean }>(`${this.base}/notifications/${id}/read`, {});
  }

  markAllRead(shopId?: string | null) {
    const params: Record<string, string> = {};
    if (shopId) params['shopId'] = shopId;
    return this.http.post<{ ok: boolean }>(`${this.base}/notifications/read-all`, {}, { params });
  }
}
