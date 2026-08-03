import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type PaymentStatus =
  | 'PENDING_VALIDATION'
  | 'VALIDATED'
  | 'REJECTED'
  | 'PAID'
  | 'CANCELLED';

export interface ShopPayment {
  id: string;
  shopId: string;
  title: string;
  notes: string | null;
  amount: number;
  dueDate: string | null;
  payerUserId: string | null;
  payerName: string | null;
  validatorUserId: string | null;
  validatorName: string | null;
  accountId: string | null;
  accountName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  status: PaymentStatus;
  paidAt: string | null;
  validatedAt: string | null;
  validatedByUserId: string | null;
  createdByUserId: string | null;
  movementId: string | null;
  createdAt: string;
}

export interface UpsertPaymentBody {
  title?: string | null;
  notes?: string | null;
  amount?: number | null;
  dueDate?: string | null;
  payerUserId?: string | null;
  validatorUserId?: string | null;
  accountId?: string | null;
  supplierId?: string | null;
  employeeId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PaymentsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(shopId: string, status?: string) {
    return this.http.get<ShopPayment[]>(`${this.base}/shops/${shopId}/payments`, {
      params: status ? { status } : {},
    });
  }

  exportExcel(shopId: string, status?: string, kind?: 'supplier' | 'employee') {
    const params: Record<string, string> = {};
    if (status) params['status'] = status;
    if (kind) params['kind'] = kind;
    return this.http.get(`${this.base}/shops/${shopId}/payments/export.xlsx`, {
      params,
      responseType: 'blob',
    });
  }

  create(shopId: string, body: UpsertPaymentBody) {
    return this.http.post<ShopPayment>(`${this.base}/shops/${shopId}/payments`, body);
  }

  update(shopId: string, id: string, body: Partial<UpsertPaymentBody>) {
    return this.http.patch<ShopPayment>(`${this.base}/shops/${shopId}/payments/${id}`, body);
  }

  validate(shopId: string, id: string) {
    return this.http.post<ShopPayment>(`${this.base}/shops/${shopId}/payments/${id}/validate`, {});
  }

  reject(shopId: string, id: string, reason?: string) {
    return this.http.post<ShopPayment>(`${this.base}/shops/${shopId}/payments/${id}/reject`, {
      reason,
    });
  }

  pay(shopId: string, id: string, body?: { paidAt?: string; accountId?: string }) {
    return this.http.post<ShopPayment>(`${this.base}/shops/${shopId}/payments/${id}/pay`, body ?? {});
  }

  cancel(shopId: string, id: string) {
    return this.http.post<ShopPayment>(`${this.base}/shops/${shopId}/payments/${id}/cancel`, {});
  }

  remove(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/payments/${id}`);
  }
}
