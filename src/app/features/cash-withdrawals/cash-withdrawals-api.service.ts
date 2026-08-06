import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface PendingCashWithdrawal {
  id: string;
  shopId: string;
  closingId: string;
  businessDate: string;
  amount: number;
  status: string;
  createdAt?: string;
}

@Injectable({ providedIn: 'root' })
export class CashWithdrawalsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listPending(shopId: string) {
    return this.http.get<PendingCashWithdrawal[]>(
      `${this.base}/shops/${shopId}/cash-withdrawals/pending`,
    );
  }

  pick(shopId: string, body: { ids: string[]; userId: string; accountId?: string | null }) {
    return this.http.post<{ ok: boolean; picked: number }>(
      `${this.base}/shops/${shopId}/cash-withdrawals/pick`,
      body,
    );
  }
}
