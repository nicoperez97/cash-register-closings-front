import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface SalaryEmployee {
  id: string;
  shopId: string;
  fullName: string;
  active: boolean;
  baseSalary: number;
  overtimeHourRate: number;
  overtimeHourRateEffective: number;
  holidayPayMultiplier: number | null;
  holidayPayMultiplierEffective: number;
  hireDate: string | null;
  serviceCheckIn?: string | null;
  serviceCheckOut?: string | null;
}

export interface SalariesListResponse {
  shopId: string;
  holidayPayMultiplier: number;
  employees: SalaryEmployee[];
}

export interface SalaryHistoryRow {
  id: string;
  shopId: string;
  employeeId: string;
  employeeName: string | null;
  employeeActive: boolean | null;
  baseSalary: number;
  overtimeHourRate: number;
  holidayPayMultiplier: number | null;
  previousBaseSalary: number | null;
  previousOvertimeHourRate: number | null;
  previousHolidayPayMultiplier: number | null;
  note: string | null;
  source: 'CREATE' | 'UPDATE' | 'MIGRATE_DAILY';
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class SalariesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(shopId: string, includeInactive = true) {
    return this.http.get<SalariesListResponse>(`${this.base}/shops/${shopId}/salaries`, {
      params: { includeInactive: includeInactive ? 'true' : 'false' },
    });
  }

  update(
    shopId: string,
    employeeId: string,
    body: {
      baseSalary?: number;
      overtimeHourRate?: number;
      holidayPayMultiplier?: number | null;
      note?: string | null;
    },
  ) {
    return this.http.patch<SalaryEmployee>(
      `${this.base}/shops/${shopId}/salaries/${employeeId}`,
      body,
    );
  }

  history(
    shopId: string,
    opts: { employeeId?: string; from?: string; to?: string } = {},
  ) {
    const params: Record<string, string> = {};
    if (opts.employeeId) params['employeeId'] = opts.employeeId;
    if (opts.from) params['from'] = opts.from;
    if (opts.to) params['to'] = opts.to;
    return this.http.get<SalaryHistoryRow[]>(`${this.base}/shops/${shopId}/salaries/history`, {
      params,
    });
  }

  exportXlsx(shopId: string, includeInactive = true) {
    return this.http.get(`${this.base}/shops/${shopId}/salaries/export.xlsx`, {
      params: { includeInactive: includeInactive ? 'true' : 'false' },
      responseType: 'blob',
    });
  }

  exportPayrollXlsx(shopId: string, from: string, to: string) {
    return this.http.get(`${this.base}/shops/${shopId}/payroll/export.xlsx`, {
      params: { from, to },
      responseType: 'blob',
    });
  }
}
