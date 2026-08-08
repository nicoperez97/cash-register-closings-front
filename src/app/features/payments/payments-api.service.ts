import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type PaymentStatus =
  | 'PENDING_VALIDATION'
  | 'VALIDATED'
  | 'REJECTED'
  | 'PAID'
  | 'CANCELLED';

export interface ShopPayment {
  id: string;
  shopId: string;
  title: string;
  notes: string | null;
  amount: number;
  dueDate: string | null;
  payerUserId: string | null;
  payerName: string | null;
  validatorUserId: string | null;
  validatorName: string | null;
  accountId: string | null;
  accountName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierBankAlias: string | null;
  supplierLegalName?: string | null;
  supplierTaxId?: string | null;
  employeeId: string | null;
  employeeName: string | null;
  status: PaymentStatus;
  paidAt: string | null;
  validatedAt: string | null;
  validatedByUserId: string | null;
  createdByUserId: string | null;
  movementId: string | null;
  invoiceLegalName?: string | null;
  invoiceTaxId?: string | null;
  invoiceType?: string | null;
  invoiceNumber?: string | null;
  invoiceNetAmount?: number | null;
  invoiceIvaAmount?: number | null;
  invoicePerceptionsAmount?: number | null;
  invoiceOtherTaxesAmount?: number | null;
  hasInvoiceFile?: boolean;
  invoiceFileName?: string | null;
  hasReceiptFile?: boolean;
  receiptFileName?: string | null;
  createdAt: string;
}

export interface UpsertPaymentBody {
  title?: string | null;
  notes?: string | null;
  amount?: number | null;
  dueDate?: string | null;
  paidAt?: string | null;
  payerUserId?: string | null;
  validatorUserId?: string | null;
  accountId?: string | null;
  supplierId?: string | null;
  employeeId?: string | null;
  invoiceLegalName?: string | null;
  invoiceTaxId?: string | null;
  invoiceType?: string | null;
  invoiceNumber?: string | null;
  invoiceNetAmount?: number | null;
  invoiceIvaAmount?: number | null;
  invoicePerceptionsAmount?: number | null;
  invoiceOtherTaxesAmount?: number | null;
}

export interface ParsedInvoice {
  legalName: string | null;
  taxId: string | null;
  invoiceType: string | null;
  invoiceNumber: string | null;
  netAmount: number | null;
  ivaAmount: number | null;
  perceptionsAmount: number | null;
  otherTaxesAmount: number | null;
  totalAmount: number | null;
  rawText: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(
    shopId: string,
    opts?: {
      status?: string | string[];
      payerUserId?: string | string[] | null;
      validatorUserId?: string | string[] | null;
      mine?: boolean;
      dueFrom?: string | null;
      dueTo?: string | null;
      paidFrom?: string | null;
      paidTo?: string | null;
      supplierId?: string | string[] | null;
      employeeId?: string | string[] | null;
      amountMin?: number | null;
      amountMax?: number | null;
    },
  ) {
    const params: Record<string, string> = {};
    const join = (v?: string | string[] | null) =>
      Array.isArray(v) ? v.filter(Boolean).join(',') : (v || '').trim();
    const statusParam = join(opts?.status);
    if (statusParam) params['status'] = statusParam;
    if (opts?.mine) {
      params['mine'] = '1';
    } else {
      const payer = join(opts?.payerUserId);
      if (payer) params['payerUserId'] = payer;
      const validator = join(opts?.validatorUserId);
      if (validator) params['validatorUserId'] = validator;
    }
    if (opts?.dueFrom) params['dueFrom'] = opts.dueFrom;
    if (opts?.dueTo) params['dueTo'] = opts.dueTo;
    if (opts?.paidFrom) params['paidFrom'] = opts.paidFrom;
    if (opts?.paidTo) params['paidTo'] = opts.paidTo;
    const suppliers = join(opts?.supplierId);
    if (suppliers) params['supplierId'] = suppliers;
    const employees = join(opts?.employeeId);
    if (employees) params['employeeId'] = employees;
    if (opts?.amountMin != null && Number.isFinite(opts.amountMin)) {
      params['amountMin'] = String(opts.amountMin);
    }
    if (opts?.amountMax != null && Number.isFinite(opts.amountMax)) {
      params['amountMax'] = String(opts.amountMax);
    }
    return this.http.get<ShopPayment[]>(`${this.base}/shops/${shopId}/payments`, {
      params,
    });
  }

  exportExcel(
    shopId: string,
    opts?: {
      status?: string | string[];
      kind?: 'supplier' | 'employee';
      payerUserId?: string | string[] | null;
      validatorUserId?: string | string[] | null;
      mine?: boolean;
      dueFrom?: string | null;
      dueTo?: string | null;
      paidFrom?: string | null;
      paidTo?: string | null;
      supplierId?: string | string[] | null;
      employeeId?: string | string[] | null;
      amountMin?: number | null;
      amountMax?: number | null;
    },
  ) {
    const params: Record<string, string> = {};
    const join = (v?: string | string[] | null) =>
      Array.isArray(v) ? v.filter(Boolean).join(',') : (v || '').trim();
    const statusParam = join(opts?.status);
    if (statusParam) params['status'] = statusParam;
    if (opts?.kind) params['kind'] = opts.kind;
    if (opts?.mine) {
      params['mine'] = '1';
    } else {
      const payer = join(opts?.payerUserId);
      if (payer) params['payerUserId'] = payer;
      const validator = join(opts?.validatorUserId);
      if (validator) params['validatorUserId'] = validator;
    }
    if (opts?.dueFrom) params['dueFrom'] = opts.dueFrom;
    if (opts?.dueTo) params['dueTo'] = opts.dueTo;
    if (opts?.paidFrom) params['paidFrom'] = opts.paidFrom;
    if (opts?.paidTo) params['paidTo'] = opts.paidTo;
    const suppliers = join(opts?.supplierId);
    if (suppliers) params['supplierId'] = suppliers;
    const employees = join(opts?.employeeId);
    if (employees) params['employeeId'] = employees;
    if (opts?.amountMin != null && Number.isFinite(opts.amountMin)) {
      params['amountMin'] = String(opts.amountMin);
    }
    if (opts?.amountMax != null && Number.isFinite(opts.amountMax)) {
      params['amountMax'] = String(opts.amountMax);
    }
    return this.http.get(`${this.base}/shops/${shopId}/payments/export.xlsx`, {
      params,
      responseType: 'blob',
    });
  }

  create(shopId: string, body: UpsertPaymentBody) {
    return this.http.post<ShopPayment>(`${this.base}/shops/${shopId}/payments`, body);
  }

  update(shopId: string, id: string, body: Partial<UpsertPaymentBody>) {
    return this.http.patch<ShopPayment>(`${this.base}/shops/${shopId}/payments/${id}`, body);
  }

  parseInvoice(shopId: string, file: File) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ParsedInvoice>(
      `${this.base}/shops/${shopId}/payments/parse-invoice`,
      form,
    );
  }

  uploadInvoiceFile(shopId: string, id: string, file: File, applyParsed = true) {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('applyParsed', applyParsed ? '1' : '0');
    return this.http.post<ShopPayment>(
      `${this.base}/shops/${shopId}/payments/${id}/invoice-file`,
      form,
    );
  }

  uploadReceiptFile(shopId: string, id: string, file: File) {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ShopPayment>(
      `${this.base}/shops/${shopId}/payments/${id}/receipt-file`,
      form,
    );
  }

  downloadInvoiceFile(shopId: string, id: string) {
    return this.http.get(`${this.base}/shops/${shopId}/payments/${id}/invoice-file`, {
      responseType: 'blob',
    });
  }

  downloadReceiptFile(shopId: string, id: string) {
    return this.http.get(`${this.base}/shops/${shopId}/payments/${id}/receipt-file`, {
      responseType: 'blob',
    });
  }

  validate(shopId: string, id: string) {
    return this.http.post<ShopPayment>(`${this.base}/shops/${shopId}/payments/${id}/validate`, {});
  }

  reject(shopId: string, id: string, reason?: string) {
    return this.http.post<ShopPayment>(`${this.base}/shops/${shopId}/payments/${id}/reject`, {
      reason,
    });
  }

  pay(shopId: string, id: string, body?: { paidAt?: string; accountId?: string }) {
    return this.http.post<ShopPayment>(`${this.base}/shops/${shopId}/payments/${id}/pay`, body ?? {});
  }

  resendNotification(shopId: string, id: string, kind: 'VALIDATE' | 'PAY') {
    return this.http.post<{ ok: boolean; kind: 'VALIDATE' | 'PAY'; notifiedUserId: string }>(
      `${this.base}/shops/${shopId}/payments/${id}/resend-notification`,
      { kind },
    );
  }

  cancel(shopId: string, id: string) {
    return this.http.post<ShopPayment>(`${this.base}/shops/${shopId}/payments/${id}/cancel`, {});
  }

  remove(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/payments/${id}`);
  }
}
