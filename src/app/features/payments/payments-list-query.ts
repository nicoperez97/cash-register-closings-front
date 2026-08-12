import { PaymentStatus } from './payments-api.service';

export function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10) || null;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function amountOrUndefined(v: number | null | undefined): number | undefined {
  if (v === null || v === undefined || (v as any) === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export type PaymentsListFilterInput = {
  statuses: PaymentStatus[];
  mineOnly: boolean;
  dueStart: Date | string | null | undefined;
  dueEnd: Date | string | null | undefined;
  paidStart: Date | string | null | undefined;
  paidEnd: Date | string | null | undefined;
  amountMin: number | null | undefined;
  amountMax: number | null | undefined;
  isSupplierKind: boolean;
  supplierIds: string[];
  employeeIds: string[];
  validatorIds: string[];
  payerIds: string[];
};

export function buildPaymentsListFilterOpts(input: PaymentsListFilterInput) {
  const dates = {
    dueFrom: toIsoDate(input.dueStart) || undefined,
    dueTo: toIsoDate(input.dueEnd) || undefined,
    paidFrom: toIsoDate(input.paidStart) || undefined,
    paidTo: toIsoDate(input.paidEnd) || undefined,
  };
  const amounts = {
    amountMin: amountOrUndefined(input.amountMin),
    amountMax: amountOrUndefined(input.amountMax),
  };
  const party = input.isSupplierKind
    ? {
        supplierId: input.supplierIds.length ? input.supplierIds : undefined,
      }
    : {
        employeeId: input.employeeIds.length ? input.employeeIds : undefined,
      };
  if (input.mineOnly) {
    return {
      status: input.statuses.length ? input.statuses : undefined,
      mine: true as const,
      ...dates,
      ...amounts,
      ...party,
    };
  }
  return {
    status: input.statuses.length ? input.statuses : undefined,
    validatorUserId: input.validatorIds.length ? input.validatorIds : undefined,
    payerUserId: input.payerIds.length ? input.payerIds : undefined,
    ...dates,
    ...amounts,
    ...party,
  };
}

export type ActivePaymentFiltersInput = {
  statusCount: number;
  mineOnly: boolean;
  validatorCount: number;
  payerCount: number;
  dueStart: Date | string | null | undefined;
  dueEnd: Date | string | null | undefined;
  paidStart: Date | string | null | undefined;
  paidEnd: Date | string | null | undefined;
  isSupplierKind: boolean;
  supplierCount: number;
  employeeCount: number;
  amountMin: number | null | undefined;
  amountMax: number | null | undefined;
};

export function countActivePaymentFilters(input: ActivePaymentFiltersInput): number {
  let n = input.statusCount;
  if (input.mineOnly) n += 1;
  else {
    n += input.validatorCount;
    n += input.payerCount;
  }
  if (input.dueStart || input.dueEnd) n += 1;
  if (input.paidStart || input.paidEnd) n += 1;
  if (input.isSupplierKind) n += input.supplierCount;
  else n += input.employeeCount;
  const min = input.amountMin;
  const max = input.amountMax;
  if (min != null && min !== ('' as any) && Number.isFinite(Number(min))) n += 1;
  if (max != null && max !== ('' as any) && Number.isFinite(Number(max))) n += 1;
  return n;
}
