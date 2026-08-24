import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ClosingQueryFilters, closingFiltersToParams } from './closing-filters';
import type { UserVisibility } from '../../shared/user-visibility';

export interface ClosingPosnetAmount {
  posnetId: string;
  name: string;
  type: 'PVS' | 'MERCADO_PAGO' | 'CUENTA_DNI';
  amount: number;
}

export interface CashClosing {
  id: string;
  shopId: string;
  businessDate: string;
  posSystemAmount: number;
  cardAmount: number;
  cashAmount: number;
  mercadoPagoAmount: number;
  deliveryAppsAmount: number;
  transferAmount: number;
  accountDniAmount: number;
  otherAmount: number;
  posnetAmounts?: ClosingPosnetAmount[];
  unitsSold?: number | null;
  coversCount?: number | null;
  averageTicket?: number | null;
  cashOpeningAmount?: number;
  cashLeftInRegister: number;
  cashPendingPickup: number;
  cashWithdrawn: number;
  cashWithdrawnByUserId?: string | null;
  cashWithdrawnByEmployeeId?: string | null;
  cashWithdrawnByName?: string | null;
  cashWithdrawnToAccountId?: string | null;
  tipsAmount: number;
  declaredTotal: number;
  calculatedTotal: number;
  difference: number;
  differenceReason?: string | null;
  notes?: string | null;
  status: string;
  expenses?: Array<{
    id?: string;
    label: string;
    amount: number;
    category?: string;
    conceptId?: string | null;
    notes?: string | null;
  }>;
  expensesTotal?: number;
  extraLines?: Array<{ id?: string; type: string; label: string; amount: number; meta?: string }>;
  sourceAmounts?: ClosingSourceAmount[];
}

export type ClosingSourceKind = 'OWN_ACCOUNT' | 'SETTLE_CASH' | 'SETTLE_ACCOUNT' | 'RECORD_ONLY';

export const CLOSING_SOURCE_KIND_OPTIONS: Array<{ value: ClosingSourceKind; label: string }> = [
  { value: 'RECORD_ONLY', label: 'Solo registrar (cuenta aparte)' },
  { value: 'OWN_ACCOUNT', label: 'Va a una cuenta del local hoy' },
  { value: 'SETTLE_CASH', label: 'Rinde después en efectivo' },
  { value: 'SETTLE_ACCOUNT', label: 'Se deposita después en una cuenta' },
];

export function closingSourceKindNeedsAccount(kind: string | null | undefined): boolean {
  return kind === 'OWN_ACCOUNT' || kind === 'SETTLE_ACCOUNT';
}

/** Fuentes que dejan montos para el módulo Rendiciones. */
export function closingSourceKindEnablesSettlements(kind: string | null | undefined): boolean {
  return kind === 'SETTLE_CASH' || kind === 'SETTLE_ACCOUNT';
}

export function closingSourceKindLabel(kind: string | null | undefined): string {
  return CLOSING_SOURCE_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? 'Cuenta aparte';
}

export interface ShopClosingSource {
  id: string;
  shopId: string;
  name: string;
  includeInDeclared: boolean;
  kind: ClosingSourceKind;
  accountId: string | null;
  accountName?: string | null;
  sortOrder: number;
  active: boolean;
}

export interface ClosingSourceAmount {
  id?: string;
  sourceId: string;
  name: string;
  includeInDeclared: boolean;
  kind: ClosingSourceKind;
  accountId?: string | null;
  amount: number;
  lines?: number[] | null;
}

/** Payload al guardar: el API toma name/kind/includeInDeclared del catálogo del local. */
export type ClosingSourceAmountInput = {
  sourceId: string;
  amount: number;
  lines?: number[];
};

export type CashClosingInput = Omit<Partial<CashClosing>, 'sourceAmounts'> & {
  sourceAmounts?: ClosingSourceAmountInput[];
};

export interface ShopUserAccountOption {
  id: string;
  name: string;
  code: string;
}

export interface ShopNotifyRecipient {
  id: string;
  fullName: string;
  email: string;
  isAdmin: boolean;
}

export interface ShopUserOption {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  hasAvatar?: boolean;
  hideFromCashWithdraw?: boolean;
  visibility?: Partial<UserVisibility> | null;
  ledgerAccounts?: ShopUserAccountOption[];
}

@Injectable({ providedIn: 'root' })
export class ClosingsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(shopId: string, filters: ClosingQueryFilters = {}) {
    return this.http.get<CashClosing[]>(`${this.base}/shops/${shopId}/closings`, {
      params: closingFiltersToParams(filters),
    });
  }

  get(shopId: string, id: string) {
    return this.http.get<CashClosing>(`${this.base}/shops/${shopId}/closings/${id}`);
  }

  create(shopId: string, body: CashClosingInput) {
    return this.http.post<CashClosing>(`${this.base}/shops/${shopId}/closings`, body);
  }

  update(shopId: string, id: string, body: CashClosingInput) {
    return this.http.patch<CashClosing>(`${this.base}/shops/${shopId}/closings/${id}`, body);
  }

  lock(shopId: string, id: string) {
    return this.http.post<CashClosing>(`${this.base}/shops/${shopId}/closings/${id}/lock`, {});
  }

  unlock(shopId: string, id: string) {
    return this.http.post<CashClosing>(`${this.base}/shops/${shopId}/closings/${id}/unlock`, {});
  }

  remove(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/closings/${id}`);
  }

  shopUsers(shopId: string) {
    return this.http.get<ShopUserOption[]>(`${this.base}/shops/${shopId}/users`);
  }

  shopNotificationRecipients(shopId: string) {
    return this.http.get<ShopNotifyRecipient[]>(
      `${this.base}/shops/${shopId}/notification-recipients`,
    );
  }

  listClosingSources(shopId: string, activeOnly = false) {
    return this.http.get<ShopClosingSource[]>(`${this.base}/shops/${shopId}/closing-sources`, {
      params: activeOnly ? { activeOnly: 'true' } : {},
    });
  }

  createClosingSource(shopId: string, body: Partial<ShopClosingSource>) {
    return this.http.post<ShopClosingSource>(`${this.base}/shops/${shopId}/closing-sources`, body);
  }

  updateClosingSource(shopId: string, id: string, body: Partial<ShopClosingSource>) {
    return this.http.patch<ShopClosingSource>(
      `${this.base}/shops/${shopId}/closing-sources/${id}`,
      body,
    );
  }

  removeClosingSource(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/closing-sources/${id}`);
  }

  summary(shopId: string, filters: ClosingQueryFilters) {
    return this.http.get<any>(`${this.base}/shops/${shopId}/reports/summary`, {
      params: closingFiltersToParams(filters),
    });
  }

  reportsDashboard(shopId: string, filters: { from: string; to: string }) {
    return this.http.get<ReportsDashboard>(`${this.base}/shops/${shopId}/reports/dashboard`, {
      params: { from: filters.from, to: filters.to },
    });
  }

  exportExcel(shopId: string, filters: ClosingQueryFilters) {
    return this.http.get(`${this.base}/shops/${shopId}/reports/export.xlsx`, {
      params: closingFiltersToParams(filters),
      responseType: 'blob',
    });
  }

  previewWhatsappImport(shopId: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<WhatsappImportPreview>(
      `${this.base}/shops/${shopId}/closings/import-whatsapp`,
      body,
    );
  }

  commitWhatsappImport(shopId: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    body.append('commit', 'true');
    return this.http.post<WhatsappImportResult>(
      `${this.base}/shops/${shopId}/closings/import-whatsapp?commit=true`,
      body,
    );
  }

  downloadImportTemplate(shopId: string) {
    return this.http.get(`${this.base}/shops/${shopId}/closings/import-template.xlsx`, {
      responseType: 'blob',
    });
  }

  previewExcelImport(shopId: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<ExcelImportPreview>(
      `${this.base}/shops/${shopId}/closings/import-excel`,
      body,
    );
  }

  previewReloadIncomes(shopId: string) {
    return this.http.post<ReloadIncomesPreview>(
      `${this.base}/shops/${shopId}/closings/reload-incomes`,
      {},
    );
  }

  commitReloadIncomes(
    shopId: string,
    selected?: Array<{
      closingId: string;
      toAccountId: string;
      amount: number;
      label: string;
    }>,
  ) {
    return this.http.post<ReloadIncomesPreview>(
      `${this.base}/shops/${shopId}/closings/reload-incomes?commit=true`,
      { selected: selected ?? [] },
    );
  }

  commitExcelImport(shopId: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    body.append('commit', 'true');
    return this.http.post<ExcelImportResult>(
      `${this.base}/shops/${shopId}/closings/import-excel?commit=true`,
      body,
    );
  }

  listSalesSystems() {
    return this.http.get<SalesSystemOption[]>(`${this.base}/sales-systems`);
  }

  previewPosSalesImport(shopId: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<PosSalesImportPreview>(
      `${this.base}/shops/${shopId}/sales-reports/import-excel`,
      body,
    );
  }

  commitPosSalesImport(shopId: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<PosSalesImportResult>(
      `${this.base}/shops/${shopId}/sales-reports/import-excel?commit=true`,
      body,
    );
  }

  salesProductsSummary(shopId: string, filters: SalesProductsFilters) {
    return this.http.get<SalesProductsSummary>(
      `${this.base}/shops/${shopId}/sales-reports/products/summary`,
      { params: salesProductsFiltersToParams(filters) },
    );
  }

  salesProductsExport(shopId: string, filters: SalesProductsFilters) {
    return this.http.get(`${this.base}/shops/${shopId}/sales-reports/products/export.xlsx`, {
      params: salesProductsFiltersToParams(filters),
      responseType: 'blob',
    });
  }

  conceptsReport(shopId: string, filters: ConceptsReportFilters) {
    return this.http.get<ConceptsReportSummary>(`${this.base}/shops/${shopId}/reports/concepts`, {
      params: conceptsReportFiltersToParams(filters),
    });
  }

  conceptsReportExport(shopId: string, filters: ConceptsReportFilters) {
    return this.http.get(`${this.base}/shops/${shopId}/reports/concepts/export.xlsx`, {
      params: conceptsReportFiltersToParams(filters),
      responseType: 'blob',
    });
  }
}

export interface ReportsDashboard {
  shopId: string;
  from: string | null;
  to: string | null;
  closings: {
    count: number;
    totals: {
      declared: number;
      cash: number;
      withdrawn: number;
      covers: number;
      units: number;
      difference: number;
      avgTicket?: number | null;
      differenceDayCount?: number;
      differenceAbsSum?: number;
    };
    byDay: Array<{
      businessDate: string;
      declaredTotal: number;
      cashAmount: number;
      cashWithdrawn: number;
      status: string;
      tipsAmount?: number;
    }>;
  } | null;
  pos: {
    totals: {
      amount: number;
      qty: number;
      ticketCount: number;
      productCount: number;
      avgTicketAmount: number;
    };
    byDay: Array<{
      businessDate: string;
      amount: number;
      qty: number;
      ticketCount: number;
    }>;
  } | null;
  reservations: {
    enabled: boolean;
    from: string;
    to: string;
    totals: {
      parties: number;
      guests: number;
      inside: number;
      outside: number;
    };
    byDay: Array<{
      businessDate: string;
      parties: number;
      guests: number;
      inside: number;
      outside: number;
    }>;
  } | null;
  tips?: {
    enabled: boolean;
    totals: {
      cash: number;
      transfer: number;
      tickets: number;
      total: number;
      pendingCount: number;
      allocationCount: number;
      avgPerEmployee: number;
      tipsToBoxRatio?: number | null;
      tipsToPosRatio?: number | null;
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
  } | null;
  paymentMix?: {
    cash: number;
    card: number;
    mercadoPago: number;
    transfer: number;
    accountDni: number;
    deliveryApps: number;
    other: number;
  } | null;
  weekday?: Array<{
    day: number;
    label: string;
    amount: number;
    avgAmount: number;
    count: number;
  }> | null;
  comparison?: {
    previousFrom: string;
    previousTo: string;
    posAmountDeltaPct: number | null;
    boxDeclaredDeltaPct: number | null;
    coversDeltaPct: number | null;
    tipsDeltaPct: number | null;
    previous: {
      posAmount: number;
      boxDeclared: number;
      covers: number;
      tipsTotal: number;
    };
  } | null;
}

export interface SalesProductsFilters {
  from: string;
  to: string;
  q?: string | null;
  category?: string | null;
  subcategory?: string | null;
  paymentCode?: string | null;
  salesSystemId?: string | null;
}

export interface ConceptsReportFilters {
  from: string;
  to: string;
  kind?: string | null;
  conceptId?: string | null;
}

export interface ConceptsReportSummary {
  shopId: string;
  from: string | null;
  to: string | null;
  conceptOptions: Array<{ id: string | null; name: string; kind: string }>;
  comparison: {
    incomeDeltaPct: number | null;
    expenseDeltaPct: number | null;
    countDeltaPct: number | null;
  } | null;
  totals: {
    movementCount: number;
    income: number;
    expense: number;
    transfer: number;
    net: number;
    withoutConceptCount: number;
    withoutConceptAmount: number;
    avgAmount: number;
  };
  byKind: Array<{ kind: string; count: number; amount: number; share: number }>;
  byConcept: Array<{
    conceptId: string | null;
    name: string;
    kind: string;
    count: number;
    amount: number;
    avgAmount: number;
    share: number;
  }>;
  byDay: Array<{
    businessDate: string;
    count: number;
    income: number;
    expense: number;
    transfer: number;
  }>;
}

export interface SalesProductsSummary {
  shopId: string;
  from: string;
  to: string;
  totals: {
    qty: number;
    amount: number;
    lineCount: number;
    productCount: number;
    categoryCount: number;
    subcategoryCount?: number;
    ticketCount: number;
    avgTicketAmount: number;
    maxTicketAmount?: number;
    minTicketAmount?: number;
    dishesPerTicket?: number;
    top10Share?: number;
    amountDeltaPct?: number | null;
  };
  products: Array<{
    productCode: string | null;
    productName: string | null;
    category: string | null;
    subcategory?: string | null;
    qty: number;
    amount: number;
    ticketCount: number;
    share: number;
    avgTicketAmount: number;
    ticketContribution?: number;
    trendPct?: number | null;
  }>;
  categories: Array<{
    category: string;
    productCount: number;
    qty: number;
    amount: number;
    ticketCount: number;
    share: number;
  }>;
  subcategories?: Array<{
    category: string;
    subcategory: string;
    productCount: number;
    qty: number;
    amount: number;
    ticketCount: number;
    share: number;
  }>;
  byDay?: Array<{
    date: string;
    qty: number;
    amount: number;
    ticketCount: number;
  }>;
  byPayment?: Array<{
    paymentCode: string;
    qty: number;
    amount: number;
    ticketCount: number;
    share: number;
  }>;
  pareto?: Array<{ label: string; amount: number; cumulativeShare: number }>;
  categoryByDay?: Array<{ date: string; category: string; amount: number }>;
  sameWeekdayCompare?: Array<{
    date: string;
    amount: number;
    previousDate: string;
    previousAmount: number;
    deltaPct: number | null;
  }>;
  filterOptions: {
    categories: string[];
    subcategories?: string[];
    paymentCodes: string[];
  };
}

function salesProductsFiltersToParams(filters: SalesProductsFilters): Record<string, string> {
  const params: Record<string, string> = {
    from: filters.from,
    to: filters.to,
  };
  if (filters.q) params['q'] = filters.q;
  if (filters.category) params['category'] = filters.category;
  if (filters.subcategory) params['subcategory'] = filters.subcategory;
  if (filters.paymentCode) params['paymentCode'] = filters.paymentCode;
  if (filters.salesSystemId) params['salesSystemId'] = filters.salesSystemId;
  return params;
}

function conceptsReportFiltersToParams(filters: ConceptsReportFilters): Record<string, string> {
  const params: Record<string, string> = {
    from: filters.from,
    to: filters.to,
  };
  if (filters.kind) params['kind'] = filters.kind;
  if (filters.conceptId) params['conceptId'] = filters.conceptId;
  return params;
}

export interface SalesSystemOption {
  id: string;
  code: string;
  name: string;
  parserKey: string;
}

export interface PosSalesDayPreview {
  businessDate: string;
  ticketCount: number;
  coversCount: number;
  totalAmount: number;
  cashAmount: number;
  cardAmount: number;
  mercadoPagoAmount: number;
  deliveryAppsAmount: number;
  transferAmount: number;
  accountDniAmount: number;
  otherAmount: number;
  unknownPaymentCodes: string[];
}

export interface PosSalesImportPreview {
  salesSystemCode: string;
  salesSystemName: string;
  fileName: string | null;
  shopLabel: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  ticketCount: number;
  dayCount: number;
  days: PosSalesDayPreview[];
  unknownPaymentCodes: string[];
}

export interface PosSalesImportResult extends PosSalesImportPreview {
  importId: string;
  committedDays: number;
}

export interface WhatsappImportItem {
  businessDate: string;
  cardAmount: number;
  cashAmount: number;
  posSystemAmount: number;
  cashLeftInRegister: number;
  cashWithdrawn: number;
  cashWithdrawnByName: string | null;
  unitsSold: number | null;
  declaredTotal: number;
  confidence: 'high' | 'medium' | 'low';
  alreadyExists: boolean;
  rawSnippets: string[];
  willCreateUser?: boolean;
}

export type WhatsappImportPreview = WhatsappImportItem[];

export interface WhatsappImportResult {
  createdCount: number;
  skippedCount: number;
  skipped: Array<{ businessDate: string; reason: string }>;
  preview: WhatsappImportItem[];
  createdUsers?: string[];
}

export interface ExcelImportItem {
  businessDate: string;
  cardAmount: number;
  cashAmount: number;
  mercadoPagoAmount: number;
  deliveryAppsAmount: number;
  transferAmount: number;
  accountDniAmount: number;
  otherAmount: number;
  posSystemAmount: number;
  cashLeftInRegister: number;
  cashWithdrawn: number;
  cashWithdrawnByName: string | null;
  unitsSold: number | null;
  coversCount: number | null;
  declaredTotal: number;
  alreadyExists: boolean;
  willCreateUser?: boolean;
  rowNumber: number;
}

export type ExcelImportPreview = ExcelImportItem[];

export interface ExcelImportResult {
  createdCount: number;
  skippedCount: number;
  skipped: Array<{ businessDate: string; reason: string }>;
  preview: ExcelImportItem[];
  createdUsers?: string[];
}

export type ReloadIncomeStatus = 'new' | 'exists' | 'mismatch' | 'skipped';

export interface ReloadIncomeItem {
  closingId: string;
  businessDate: string;
  fromAccountId: string;
  toAccountId: string | null;
  toAccountName: string;
  amount: number;
  label: string;
  status: ReloadIncomeStatus;
  existingAmount: number;
  existingDescription: string | null;
  existingMovementId?: string | null;
}

export interface ReloadIncomeBalance {
  accountId: string;
  name: string;
  type: string;
  current: number;
  incoming: number;
  projected: number;
}

export interface ReloadIncomesPreview {
  closingsCount: number;
  createdCount: number;
  updatedCount?: number;
  items: ReloadIncomeItem[];
  counts: {
    new: number;
    exists: number;
    mismatch: number;
    skipped: number;
  };
  balances: ReloadIncomeBalance[];
}
