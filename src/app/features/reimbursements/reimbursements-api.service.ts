import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type ReimbursementStatus = 'PENDING' | 'PAID' | 'CANCELLED';

export interface ReimbursementRow {
  id: string;
  shopId: string;
  employeeId: string;
  employeeName: string | null;
  createdByUserId: string | null;
  description: string;
  amount: number;
  expenseDate: string;
  notes: string | null;
  bankAliasSnapshot: string | null;
  status: ReimbursementStatus;
  paidAt: string | null;
  paidByUserId: string | null;
  paidByName: string | null;
  hasReceiptFile: boolean;
  receiptFileName: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ReimbursementProfile {
  employeeId: string;
  fullName: string;
  bankAlias: string | null;
  pendingCount: number;
  pendingAmount: number;
}

export interface ReimbursementPendingCount {
  count: number;
  amount: number;
}

@Injectable({ providedIn: 'root' })
export class ReimbursementsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  me(shopId: string) {
    return this.http.get<ReimbursementProfile>(`${this.base}/shops/${shopId}/reimbursements/me`);
  }

  updateAlias(shopId: string, bankAlias: string | null) {
    return this.http.patch<ReimbursementProfile>(
      `${this.base}/shops/${shopId}/reimbursements/me/alias`,
      { bankAlias },
    );
  }

  listMine(shopId: string) {
    return this.http.get<ReimbursementRow[]>(
      `${this.base}/shops/${shopId}/reimbursements/me/expenses`,
    );
  }

  createMine(
    shopId: string,
    body: { description: string; amount: number; expenseDate: string; notes?: string | null },
  ) {
    return this.http.post<ReimbursementRow>(
      `${this.base}/shops/${shopId}/reimbursements/me/expenses`,
      body,
    );
  }

  updateMine(
    shopId: string,
    id: string,
    body: Partial<{ description: string; amount: number; expenseDate: string; notes: string | null }>,
  ) {
    return this.http.patch<ReimbursementRow>(
      `${this.base}/shops/${shopId}/reimbursements/me/expenses/${id}`,
      body,
    );
  }

  removeMine(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(
      `${this.base}/shops/${shopId}/reimbursements/me/expenses/${id}`,
    );
  }

  list(shopId: string, status?: ReimbursementStatus | '') {
    return this.http.get<ReimbursementRow[]>(`${this.base}/shops/${shopId}/reimbursements`, {
      params: status ? { status } : {},
    });
  }

  pendingCount(shopId: string) {
    return this.http.get<ReimbursementPendingCount>(
      `${this.base}/shops/${shopId}/reimbursements/pending-count`,
    );
  }

  pay(shopId: string, id: string, paidAt?: string | null) {
    return this.http.post<ReimbursementRow>(
      `${this.base}/shops/${shopId}/reimbursements/${id}/pay`,
      { paidAt: paidAt ?? null },
    );
  }

  cancel(shopId: string, id: string) {
    return this.http.post<ReimbursementRow>(
      `${this.base}/shops/${shopId}/reimbursements/${id}/cancel`,
      {},
    );
  }

  uploadReceiptFile(shopId: string, id: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ReimbursementRow>(
      `${this.base}/shops/${shopId}/reimbursements/${id}/receipt-file`,
      form,
    );
  }

  downloadReceiptFile(shopId: string, id: string) {
    return this.http.get(`${this.base}/shops/${shopId}/reimbursements/${id}/receipt-file`, {
      responseType: 'blob',
    });
  }
}
