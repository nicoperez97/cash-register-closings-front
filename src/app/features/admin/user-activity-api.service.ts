import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type UserActivityBreakdown = {
  closings: number;
  settlements: number;
  withdrawalsPicked: number;
  withdrawalsConfirmed: number;
  paymentsCreated: number;
  paymentsValidated: number;
  paymentsPaid: number;
  tipsLoaded: number;
  tipsDelivered: number;
  reimbursementsCreated: number;
  reimbursementsPaid: number;
  orders: number;
  posImports: number;
  partnerSplits: number;
};

export type UserActivityRow = {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  hasAvatar: boolean;
  rank: number;
  score: number;
  totalActions: number;
  lastActionAt: string | null;
  breakdown: UserActivityBreakdown;
};

export type UserActivityReport = {
  shopId: string;
  from: string;
  to: string;
  totals: {
    users: number;
    activeUsers: number;
    totalActions: number;
    totalScore: number;
  };
  ranking: UserActivityRow[];
};

@Injectable({ providedIn: 'root' })
export class UserActivityApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  ranking(shopId: string, from?: string, to?: string) {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<UserActivityReport>(
      `${this.base}/shops/${shopId}/reports/user-activity`,
      { params },
    );
  }
}
