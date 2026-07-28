import { HttpParams } from '@angular/common/http';

export interface ClosingQueryFilters {
  from?: string | null;
  to?: string | null;
  status?: string | null;
  withdrawnByUserId?: string | null;
  createdByUserId?: string | null;
  minTotal?: number | null;
  maxTotal?: number | null;
  hasDifference?: string | null;
  paymentMethod?: string | null;
  source?: string | null;
  q?: string | null;
}

export const CLOSING_STATUS_FILTERS = [
  { value: '', label: 'Todos los estados' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'SUBMITTED', label: 'Enviado' },
  { value: 'LOCKED', label: 'Bloqueado' },
] as const;

export const CLOSING_PAYMENT_FILTERS = [
  { value: '', label: 'Todos los medios' },
  { value: 'card', label: 'PVS' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'mp', label: 'Mercado Pago' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'dni', label: 'Cuenta DNI' },
  { value: 'other', label: 'Otro' },
] as const;

export const CLOSING_DIFFERENCE_FILTERS = [
  { value: '', label: 'Cualquier diferencia' },
  { value: 'yes', label: 'Con diferencia' },
  { value: 'no', label: 'Sin diferencia' },
] as const;

export const CLOSING_SOURCE_FILTERS = [
  { value: '', label: 'Cualquier origen' },
  { value: 'manual', label: 'Manual' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'excel', label: 'Excel' },
] as const;

export function closingFiltersToParams(filters: ClosingQueryFilters): HttpParams {
  let params = new HttpParams();
  const set = (key: string, value: string | number | null | undefined) => {
    if (value == null || value === '') return;
    params = params.set(key, String(value));
  };
  set('from', filters.from);
  set('to', filters.to);
  set('status', filters.status);
  set('withdrawnByUserId', filters.withdrawnByUserId);
  set('createdByUserId', filters.createdByUserId);
  set('minTotal', filters.minTotal);
  set('maxTotal', filters.maxTotal);
  set('hasDifference', filters.hasDifference);
  set('paymentMethod', filters.paymentMethod);
  set('source', filters.source);
  set('q', filters.q?.trim());
  return params;
}
