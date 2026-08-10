import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface TipAllocation {
  id: string;
  tipDayId: string;
  employeeId: string;
  employeeName: string | null;
  amount: number;
  delivered: boolean;
  deliveredAt: string | null;
  deliveredByUserId: string | null;
}

export interface TipDay {
  id: string | null;
  shopId: string;
  businessDate: string;
  cashAmount: number;
  transferAmount: number;
  ticketsAmount: number;
  totalAmount: number;
  notes: string | null;
  closingId: string | null;
  createdByUserId: string | null;
  pendingCount: number;
  allocations: TipAllocation[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TipAllocationInput {
  employeeId: string;
  amount: number;
  delivered?: boolean;
}

export interface UpsertTipDayBody {
  cashAmount?: number;
  transferAmount?: number;
  ticketsAmount?: number;
  notes?: string | null;
  closingId?: string | null;
  allocations?: TipAllocationInput[];
}

export interface TipsSummary {
  enabled: boolean;
  totals: {
    cash: number;
    transfer: number;
    tickets: number;
    total: number;
    pendingCount: number;
    allocationCount: number;
    avgPerEmployee: number;
  };
  byDay: Array<{
    businessDate: string;
    cashAmount: number;
    transferAmount: number;
    ticketsAmount: number;
    totalAmount: number;
    pendingCount: number;
    employeeCount: number;
  }>;
  byEmployee: Array<{
    employeeId: string;
    employeeName: string;
    amount: number;
    pendingAmount: number;
  }>;
}

@Injectable({ providedIn: 'root' })
export class TipsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(shopId: string, from?: string, to?: string) {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<TipDay[]>(`${this.base}/shops/${shopId}/tips`, { params });
  }

  getByDate(shopId: string, date: string) {
    return this.http.get<TipDay>(`${this.base}/shops/${shopId}/tips/${date}`);
  }

  upsert(shopId: string, date: string, body: UpsertTipDayBody) {
    return this.http.put<TipDay>(`${this.base}/shops/${shopId}/tips/${date}`, body);
  }

  setDelivered(
    shopId: string,
    date: string,
    allocationId: string,
    delivered: boolean,
  ) {
    return this.http.patch<TipAllocation>(
      `${this.base}/shops/${shopId}/tips/${date}/allocations/${allocationId}`,
      { delivered },
    );
  }

  summary(shopId: string, from: string, to: string) {
    return this.http.get<TipsSummary>(`${this.base}/shops/${shopId}/tips/summary`, {
      params: { from, to },
    });
  }

  pendingCount(shopId: string) {
    return this.http.get<{ count: number }>(
      `${this.base}/shops/${shopId}/tips/pending-count`,
    );
  }
}
