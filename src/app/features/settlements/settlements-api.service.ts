import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import type { ClosingSourceKind } from '../closings/closings-api.service';

export interface PendingSettlement {
  id: string;
  closingId: string;
  businessDate: string;
  sourceId: string | null;
  name: string;
  kind: ClosingSourceKind;
  amount: number;
  lines: number[];
}

export interface SettlementHistoryItem {
  id: string;
  closingId: string;
  businessDate: string;
  name: string;
  kind: ClosingSourceKind;
  amount: number;
  lines: number[];
}

export interface SettlementHistoryGroup {
  id: string;
  settledAt: string;
  settledByUserId: string | null;
  settledByName: string;
  accountId: string | null;
  accountName: string | null;
  movementId: string | null;
  totalAmount: number;
  itemsCount: number;
  items: SettlementHistoryItem[];
}

@Injectable({ providedIn: 'root' })
export class SettlementsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listPending(shopId: string) {
    return this.http.get<PendingSettlement[]>(`${this.base}/shops/${shopId}/settlements/pending`);
  }

  pendingCount(shopId: string) {
    return this.http.get<{ count: number }>(`${this.base}/shops/${shopId}/settlements/pending-count`);
  }

  listHistory(shopId: string) {
    return this.http.get<SettlementHistoryGroup[]>(
      `${this.base}/shops/${shopId}/settlements/history`,
    );
  }

  settle(shopId: string, body: { ids: string[]; accountId: string }) {
    return this.http.post<{
      ok: boolean;
      settled: number;
      settleBatchId: string;
      movementId: string;
      totalAmount: number;
    }>(`${this.base}/shops/${shopId}/settlements/settle`, body);
  }
}
