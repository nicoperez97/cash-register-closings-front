import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { safeUploadFileName } from '../../shared/utils/input-file';

export type ExpensePaymentMethod = 'cash' | 'transfer' | 'card';

export const EXPENSE_PAYMENT_METHOD_OPTIONS: Array<{
  value: ExpensePaymentMethod;
  label: string;
}> = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
];

export function expensePaymentMethodLabel(
  method: ExpensePaymentMethod | string | null | undefined,
): string {
  if (!method) return '—';
  return EXPENSE_PAYMENT_METHOD_OPTIONS.find((o) => o.value === method)?.label ?? method;
}

export function expenseReceiptRequired(
  method: ExpensePaymentMethod | string | null | undefined,
): boolean {
  return method === 'transfer' || method === 'card';
}

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
  hasReceiptFile?: boolean;
  receiptFileName?: string | null;
  paymentMethod?: ExpensePaymentMethod | null;
  /** closing | payment | manual */
  source?: 'closing' | 'payment' | 'manual' | null;
  paymentId?: string | null;
  paymentPartyType?: 'supplier' | 'service' | 'employee' | null;
  active: boolean;
}

export interface LedgerAccount {
  id: string;
  shopId: string;
  name: string;
  code: string;
  type: 'PARTNER' | 'CHANNEL' | 'SYSTEM' | 'SUPPLIER' | 'SERVICE';
  linkedPaymentMethod?: string | null;
  userIds?: string[];
  active: boolean;
  listInExpenses?: boolean;
  listInIncomes?: boolean;
  listInTransfers?: boolean;
}

export type AccountListSurface = 'expenses' | 'incomes' | 'transfers';

export function accountListedIn(
  account: Pick<LedgerAccount, 'listInExpenses' | 'listInIncomes' | 'listInTransfers'>,
  surface: AccountListSurface,
): boolean {
  const value =
    surface === 'expenses'
      ? account.listInExpenses
      : surface === 'incomes'
        ? account.listInIncomes
        : account.listInTransfers;
  return value !== false && Number(value ?? 1) !== 0;
}

export interface Concept {
  id: string;
  shopId: string;
  name: string;
  description?: string | null;
  kind: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  categories?: string[];
  validated?: boolean;
  active: boolean;
}

export type MovementKind = 'expense' | 'income' | 'transfer';

export type AccountImportMapping = {
  excelName: string;
  accountId?: string | null;
  create?: boolean;
};

export type ConceptImportMapping = {
  excelName: string;
  conceptId?: string | null;
  create?: boolean;
};

export interface MovementFilters {
  from?: string | null;
  to?: string | null;
  accountId?: string | null;
  conceptId?: string | null;
  q?: string | null;
  kind?: MovementKind | null;
  source?: 'closing' | 'payment' | 'manual' | null;
  partyType?: 'supplier' | 'service' | 'employee' | null;
  invoiced?: 'true' | 'false' | null;
  paymentId?: string | null;
}

function filtersToParams(filters: MovementFilters): HttpParams {
  let params = new HttpParams();
  const set = (key: string, value: string | null | undefined) => {
    if (!value) return;
    params = params.set(key, value);
  };
  set('from', filters.from);
  set('to', filters.to);
  set('accountId', filters.accountId);
  set('conceptId', filters.conceptId);
  set('q', filters.q?.trim());
  set('kind', filters.kind);
  set('source', filters.source);
  set('partyType', filters.partyType);
  set('invoiced', filters.invoiced);
  set('paymentId', filters.paymentId);
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

  create(
    shopId: string,
    body: Partial<Movement> & { notifyAdmins?: boolean; kind?: MovementKind },
  ) {
    return this.http.post<Movement>(`${this.base}/shops/${shopId}/movements`, body);
  }

  update(
    shopId: string,
    id: string,
    body: Partial<Movement> & {
      kind?: MovementKind;
      notifyAdmins?: boolean;
      notifyUserIds?: string[];
    },
  ) {
    return this.http.patch<Movement>(`${this.base}/shops/${shopId}/movements/${id}`, body);
  }

  remove(
    shopId: string,
    id: string,
    body?: { notifyAdmins?: boolean; notifyUserIds?: string[] },
  ) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/movements/${id}`, {
      body: body ?? {},
    });
  }

  uploadReceiptFile(shopId: string, id: string, file: File) {
    const form = new FormData();
    form.append('file', file, safeUploadFileName(file.name));
    return this.http.post<Movement>(
      `${this.base}/shops/${shopId}/movements/${id}/receipt-file`,
      form,
    );
  }

  downloadReceiptFile(shopId: string, id: string) {
    return this.http.get(`${this.base}/shops/${shopId}/movements/${id}/receipt-file`, {
      responseType: 'blob',
    });
  }

  accounts(shopId: string) {
    return this.http.get<LedgerAccount[]>(`${this.base}/shops/${shopId}/accounts`);
  }

  concepts(
    shopId: string,
    opts?: {
      for?: 'supplier' | 'service' | 'employee' | 'movement';
      kind?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
    },
  ) {
    const params: Record<string, string> = {};
    if (opts?.for) params['for'] = opts.for;
    if (opts?.kind) params['kind'] = opts.kind;
    return this.http.get<Concept[]>(`${this.base}/shops/${shopId}/concepts`, {
      params,
    });
  }

  balances(shopId: string, filters: Pick<MovementFilters, 'from' | 'to'> = {}) {
    return this.http.get<AccountBalancesResponse>(`${this.base}/shops/${shopId}/movements/balances`, {
      params: filtersToParams(filters),
    });
  }

  exportBalancesExcel(shopId: string, filters: Pick<MovementFilters, 'from' | 'to'> = {}) {
    return this.http.get(`${this.base}/shops/${shopId}/movements/balances/export.xlsx`, {
      params: filtersToParams(filters),
      responseType: 'blob',
    });
  }

  downloadImportTemplate(shopId: string, kind?: MovementKind) {
    let params = new HttpParams();
    if (kind) params = params.set('kind', kind);
    return this.http.get(`${this.base}/shops/${shopId}/movements/import-template.xlsx`, {
      params,
      responseType: 'blob',
    });
  }

  exportExcel(shopId: string, filters: Pick<MovementFilters, 'from' | 'to' | 'kind'> = {}) {
    return this.http.get(`${this.base}/shops/${shopId}/movements/export.xlsx`, {
      params: filtersToParams(filters),
      responseType: 'blob',
    });
  }

  previewExcelImport(shopId: string, file: File, kind?: MovementKind) {
    const body = new FormData();
    body.append('file', file, safeUploadFileName(file.name));
    let params = new HttpParams();
    if (kind) params = params.set('kind', kind);
    return this.http.post<MovementImportPreview | MovementImportItem[]>(
      `${this.base}/shops/${shopId}/movements/import-excel`,
      body,
      { params },
    );
  }

  commitExcelImport(
    shopId: string,
    file: File,
    kind?: MovementKind,
    modules?: MovementKind[],
    accountMap?: AccountImportMapping[],
    conceptMap?: ConceptImportMapping[],
  ) {
    const body = new FormData();
    body.append('file', file, safeUploadFileName(file.name));
    if (accountMap?.length) body.append('accountMap', JSON.stringify(accountMap));
    if (conceptMap?.length) body.append('conceptMap', JSON.stringify(conceptMap));
    let params = new HttpParams().set('commit', 'true');
    if (kind) params = params.set('kind', kind);
    if (modules?.length) params = params.set('modules', modules.join(','));
    return this.http.post<MovementImportResult>(
      `${this.base}/shops/${shopId}/movements/import-excel`,
      body,
      { params },
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
  detectedKind?: MovementKind;
}

export interface MovementImportResult {
  createdCount: number;
  skippedCount?: number;
  createdIds: string[];
  createdAccounts: string[];
  createdConcepts: string[];
  preview: MovementImportItem[];
}

export interface LedgerImportGemini {
  ok: boolean;
  summary: string | null;
  findings: string[];
  accounts: Array<{ name: string; note: string }>;
  warnings: string[];
  message: string | null;
}

export interface MovementImportPreview {
  items: MovementImportItem[];
  gemini: LedgerImportGemini;
}
