import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface CommissionRule {
  id: string;
  shopId: string;
  employeeId: string;
  employeeName: string | null;
  category: string;
  ratePercent: number;
  notes: string | null;
  active: boolean;
}

export interface CommissionCalcLine {
  ruleId: string;
  category: string;
  salesAmount: number;
  ratePercent: number;
  commissionAmount: number;
}

export interface CommissionEmployeeResult {
  employeeId: string;
  employeeName: string;
  lines: CommissionCalcLine[];
  total: number;
}

export interface CommissionCalculateResult {
  shopId: string;
  from: string;
  to: string;
  salesTotal: number;
  salesByCategory: Array<{ category: string; amount: number; qty: number }>;
  employees: CommissionEmployeeResult[];
  grandTotal: number;
  unmatchedRules: Array<{
    employeeName: string | null;
    category: string;
    ratePercent: number;
  }>;
}

@Injectable({ providedIn: 'root' })
export class CommissionsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listRules(shopId: string, employeeId?: string) {
    const params: Record<string, string> = {};
    if (employeeId) params['employeeId'] = employeeId;
    return this.http.get<CommissionRule[]>(`${this.base}/shops/${shopId}/commissions/rules`, {
      params,
    });
  }

  createRule(
    shopId: string,
    body: { employeeId: string; category: string; ratePercent: number; notes?: string | null },
  ) {
    return this.http.post<CommissionRule>(`${this.base}/shops/${shopId}/commissions/rules`, body);
  }

  updateRule(
    shopId: string,
    id: string,
    body: Partial<{ category: string; ratePercent: number; notes: string | null; active: boolean }>,
  ) {
    return this.http.patch<CommissionRule>(
      `${this.base}/shops/${shopId}/commissions/rules/${id}`,
      body,
    );
  }

  removeRule(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(
      `${this.base}/shops/${shopId}/commissions/rules/${id}`,
    );
  }

  calculate(shopId: string, from: string, to: string) {
    return this.http.get<CommissionCalculateResult>(
      `${this.base}/shops/${shopId}/commissions/calculate`,
      { params: { from, to } },
    );
  }

  exportExcel(shopId: string, from: string, to: string) {
    return this.http.get(`${this.base}/shops/${shopId}/commissions/export.xlsx`, {
      params: { from, to },
      responseType: 'blob',
    });
  }
}
