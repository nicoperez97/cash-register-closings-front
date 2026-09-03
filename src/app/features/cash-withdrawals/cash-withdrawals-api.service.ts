import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface PendingCashWithdrawal {
  id: string;
  shopId: string;
  closingId: string;
  businessDate: string;
  amount: number;
  originalAmount?: number;
  deductedAmount?: number;
  status: string;
  createdAt?: string;
}

export interface CoveredCashWithdrawal {
  id: string;
  closingId: string;
  businessDate: string;
  originalAmount: number;
  deductedAmount: number;
}

export interface CashWithdrawalExpense {
  id: string;
  businessDate: string;
  description: string | null;
  conceptName: string | null;
  amount: number;
}

export interface PendingCashWithdrawalsResponse {
  items: PendingCashWithdrawal[];
  covered: CoveredCashWithdrawal[];
  cashExpenses: CashWithdrawalExpense[];
  expensesTotal: number;
  availableTotal: number;
}

export interface CashWithdrawalHistoryItem {
  id: string;
  closingId: string;
  businessDate: string;
  amount: number;
}

export interface CashWithdrawalHistoryGroup {
  id: string;
  pickedAt: string;
  pickedByUserId: string | null;
  pickedByName: string;
  accountId: string | null;
  accountName: string | null;
  confirmedByUserId: string | null;
  confirmedByName: string | null;
  totalAmount: number;
  closingsCount: number;
  items: CashWithdrawalHistoryItem[];
}

@Injectable({ providedIn: 'root' })
export class CashWithdrawalsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listPending(shopId: string) {
    return this.http.get<PendingCashWithdrawalsResponse>(
      `${this.base}/shops/${shopId}/cash-withdrawals/pending`,
    );
  }

  pendingCount(shopId: string) {
    return this.http.get<{ count: number }>(
      `${this.base}/shops/${shopId}/cash-withdrawals/pending-count`,
    );
  }

  listHistory(shopId: string) {
    return this.http.get<CashWithdrawalHistoryGroup[]>(
      `${this.base}/shops/${shopId}/cash-withdrawals/history`,
    );
  }

  pick(shopId: string, body: { ids: string[]; userId: string; accountId?: string | null }) {
    return this.http.post<{ ok: boolean; picked: number }>(
      `${this.base}/shops/${shopId}/cash-withdrawals/pick`,
      body,
    );
  }
}
