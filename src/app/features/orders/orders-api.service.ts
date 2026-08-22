import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type OrderSource = 'food' | 'beverage' | 'shortage';

export interface OrderLine {
  id: string;
  source: OrderSource;
  productId: string | null;
  shortageId: string | null;
  name: string;
  quantity: number;
}

export interface Order {
  id: string;
  shopId: string;
  orderDate: string;
  notes: string | null;
  hasInvoiceFile: boolean;
  invoiceFileName: string | null;
  createdByUserId: string | null;
  stockApplied: boolean;
  createdAt: string;
  lines: OrderLine[];
}

export const ORDER_SOURCE_OPTIONS: Array<{ value: OrderSource; label: string }> = [
  { value: 'food', label: 'Alimento' },
  { value: 'beverage', label: 'Bebida' },
  { value: 'shortage', label: 'Faltante' },
];

export function orderSourceLabel(source: OrderSource | string): string {
  return ORDER_SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? String(source);
}

@Injectable({ providedIn: 'root' })
export class OrdersApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(shopId: string, filters: { from?: string; to?: string } = {}) {
    let params = new HttpParams();
    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);
    return this.http.get<Order[]>(`${this.base}/shops/${shopId}/orders`, { params });
  }

  one(shopId: string, id: string) {
    return this.http.get<Order>(`${this.base}/shops/${shopId}/orders/${id}`);
  }

  create(
    shopId: string,
    body: {
      orderDate: string;
      notes?: string | null;
      lines: Array<{
        source: OrderSource;
        productId?: string | null;
        shortageId?: string | null;
        quantity: number;
      }>;
    },
    file: File,
  ) {
    const data = new FormData();
    data.append('file', file);
    data.append('orderDate', body.orderDate);
    if (body.notes) data.append('notes', body.notes);
    data.append('lines', JSON.stringify(body.lines));
    return this.http.post<Order>(`${this.base}/shops/${shopId}/orders`, data);
  }

  remove(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/orders/${id}`);
  }

  downloadInvoice(shopId: string, id: string) {
    return this.http.get(`${this.base}/shops/${shopId}/orders/${id}/invoice-file`, {
      responseType: 'blob',
    });
  }
}
