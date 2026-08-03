import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Movement {
  id: string;
  shopId: string;
  businessDate: string;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  fromAccountName?: string | null;
  toAccountName?: string | null;
  fromUserId?: string | null;
  toUserId?: string | null;
  fromUserName?: string | null;
  toUserName?: string | null;
  description?: string | null;
  amountUyu: number;
  usdRate?: number | null;
  amountUsd?: number | null;
  conceptId?: string | null;
  conceptName?: string | null;
  conceptKind?: string | null;
  invoiced: boolean;
  invoiceNumber?: string | null;
  closingId?: string | null;
  employeeId?: string | null;
  active: boolean;
}

export interface LedgerAccount {
  id: string;
  shopId: string;
  name: string;
  code: string;
  type: 'PARTNER' | 'CHANNEL' | 'SYSTEM';
  linkedPaymentMethod?: string | null;
  userIds?: string[];
  active: boolean;
}

export interface Concept {
  id: string;
  shopId: string;
  name: string;
  kind: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  active: boolean;
}

export interface MovementFilters {
  from?: string | null;
  to?: string | null;
  conceptId?: string | null;
  q?: string | null;
}

function filtersToParams(filters: MovementFilters): HttpParams {
  let params = new HttpParams();
  const set = (key: string, value: string | null | undefined) => {
    if (!value) return;
    params = params.set(key, value);
  };
  set('from', filters.from);
  set('to', filters.to);
  set('conceptId', filters.conceptId);
  set('q', filters.q?.trim());
  return params;
}

@Injectable({ providedIn: 'root' })
export class MovementsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(shopId: string, filters: MovementFilters = {}) {
    return this.http.get<Movement[]>(`${this.base}/shops/${shopId}/movements`, {
      params: filtersToParams(filters),
    });
  }

  create(shopId: string, body: Partial<Movement>) {
    return this.http.post<Movement>(`${this.base}/shops/${shopId}/movements`, body);
  }

  update(shopId: string, id: string, body: Partial<Movement>) {
    return this.http.patch<Movement>(`${this.base}/shops/${shopId}/movements/${id}`, body);
  }

  remove(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/movements/${id}`);
  }

  accounts(shopId: string) {
    return this.http.get<LedgerAccount[]>(`${this.base}/shops/${shopId}/accounts`);
  }

  concepts(shopId: string) {
    return this.http.get<Concept[]>(`${this.base}/shops/${shopId}/concepts`);
  }

  balances(shopId: string, filters: Pick<MovementFilters, 'from' | 'to'> = {}) {
    return this.http.get<AccountBalancesResponse>(`${this.base}/shops/${shopId}/movements/balances`, {
      params: filtersToParams(filters),
    });
  }

  downloadImportTemplate(shopId: string) {
    return this.http.get(`${this.base}/shops/${shopId}/movements/import-template.xlsx`, {
      responseType: 'blob',
    });
  }

  previewExcelImport(shopId: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<MovementImportItem[]>(
      `${this.base}/shops/${shopId}/movements/import-excel`,
      body,
    );
  }

  commitExcelImport(shopId: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<MovementImportResult>(
      `${this.base}/shops/${shopId}/movements/import-excel`,
      body,
      { params: { commit: 'true' } },
    );
  }
}

export interface AccountBalanceRow {
  accountId: string;
  name: string;
  type?: string;
  income: number;
  expense: number;
  balance: number;
}

export interface AccountBalancesResponse {
  shopId: string;
  from: string | null;
  to: string | null;
  accounts: AccountBalanceRow[];
}

export interface MovementImportItem {
  rowNumber: number;
  businessDate: string;
  fromAccountName: string;
  toAccountName: string;
  description: string | null;
  amountUyu: number;
  usdRate: number | null;
  amountUsd: number | null;
  conceptName: string | null;
  invoiced: boolean;
  invoiceNumber: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  conceptId: string | null;
  willCreateFromAccount: boolean;
  willCreateToAccount: boolean;
  willCreateConcept: boolean;
  alreadyExists: boolean;
  valid: boolean;
  error?: string;
}

export interface MovementImportResult {
  createdCount: number;
  skippedCount?: number;
  createdIds: string[];
  createdAccounts: string[];
  createdConcepts: string[];
  preview: MovementImportItem[];
}
