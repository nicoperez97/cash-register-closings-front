import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ClosingQueryFilters, closingFiltersToParams } from './closing-filters';

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
  unitsSold?: number | null;
  coversCount?: number | null;
  averageTicket?: number | null;
  cashLeftInRegister: number;
  cashPendingPickup: number;
  cashWithdrawn: number;
  cashWithdrawnByUserId?: string | null;
  cashWithdrawnByName?: string | null;
  tipsAmount: number;
  declaredTotal: number;
  calculatedTotal: number;
  difference: number;
  differenceReason?: string | null;
  notes?: string | null;
  status: string;
  expenses?: Array<{ id?: string; label: string; amount: number; category?: string }>;
  extraLines?: Array<{ id?: string; type: string; label: string; amount: number; meta?: string }>;
}

export interface ShopUserOption {
  id: string;
  fullName: string;
  email: string;
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

  create(shopId: string, body: Partial<CashClosing>) {
    return this.http.post<CashClosing>(`${this.base}/shops/${shopId}/closings`, body);
  }

  update(shopId: string, id: string, body: Partial<CashClosing>) {
    return this.http.patch<CashClosing>(`${this.base}/shops/${shopId}/closings/${id}`, body);
  }

  shopUsers(shopId: string) {
    return this.http.get<ShopUserOption[]>(`${this.base}/shops/${shopId}/users`);
  }

  summary(shopId: string, filters: ClosingQueryFilters) {
    return this.http.get<any>(`${this.base}/shops/${shopId}/reports/summary`, {
      params: closingFiltersToParams(filters),
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

  commitExcelImport(shopId: string, file: File) {
    const body = new FormData();
    body.append('file', file);
    body.append('commit', 'true');
    return this.http.post<ExcelImportResult>(
      `${this.base}/shops/${shopId}/closings/import-excel?commit=true`,
      body,
    );
  }
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
