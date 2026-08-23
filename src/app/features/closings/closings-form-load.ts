import { FormArray, FormBuilder, FormGroup } from '@angular/forms';
import type { TipsEditorState } from '../tips/tips-editor';
import { tipDayToEditorState } from '../tips/tips-editor';
import type { TipDay } from '../tips/tips-api.service';
import type {
  CashClosing,
  ClosingSourceAmount,
  ShopClosingSource,
} from './closings-api.service';
import { closingNum } from './closings-form.utils';

export function buildSourceLineGroup(
  fb: FormBuilder,
  amount: number | null | undefined,
  emptyNum: (v: unknown) => number | null,
) {
  return fb.group({
    amount: [emptyNum(amount)],
  });
}

export function sourceLineAmounts(saved?: ClosingSourceAmount | null): number[] {
  if (!saved) return [];
  if (Array.isArray(saved.lines) && saved.lines.length) {
    return saved.lines.map((v) => closingNum(v)).filter((v) => v > 0);
  }
  const amount = closingNum(saved.amount);
  return amount > 0 ? [amount] : [];
}

export function buildSourceAmountGroup(
  fb: FormBuilder,
  value: {
    sourceId: string;
    name: string;
    includeInDeclared: boolean;
    kind: string;
    lines?: number[];
  },
  emptyNum: (v: unknown) => number | null,
) {
  const lines = fb.array(
    (value.lines ?? []).map((amount) => buildSourceLineGroup(fb, amount, emptyNum)),
  );
  const group = fb.group({
    sourceId: [value.sourceId],
    name: [value.name],
    includeInDeclared: [!!value.includeInDeclared],
    kind: [value.kind],
    lines,
  });
  ensureTrailingSourceLines(fb, group.get('lines') as FormArray, emptyNum);
  return group;
}

export function populateSourceAmounts(
  fb: FormBuilder,
  formArray: FormArray,
  catalog: ShopClosingSource[],
  saved: ClosingSourceAmount[] | null | undefined,
  emptyNum: (v: unknown) => number | null,
): void {
  formArray.clear({ emitEvent: false });
  const savedById = new Map((saved ?? []).map((s) => [s.sourceId, s]));
  const seen = new Set<string>();
  for (const src of catalog) {
    if (!src.active && !savedById.has(src.id)) continue;
    seen.add(src.id);
    const prev = savedById.get(src.id);
    formArray.push(
      buildSourceAmountGroup(
        fb,
        {
          sourceId: src.id,
          name: src.name,
          includeInDeclared: !!src.includeInDeclared,
          kind: src.kind,
          lines: sourceLineAmounts(prev),
        },
        emptyNum,
      ),
      { emitEvent: false },
    );
  }
  for (const s of saved ?? []) {
    if (!s.sourceId || seen.has(s.sourceId)) continue;
    formArray.push(
      buildSourceAmountGroup(
        fb,
        {
          sourceId: s.sourceId,
          name: s.name || 'Fuente',
          includeInDeclared: !!s.includeInDeclared,
          kind: s.kind || 'RECORD_ONLY',
          lines: sourceLineAmounts(s),
        },
        emptyNum,
      ),
      { emitEvent: false },
    );
  }
}

export function ensureTrailingSourceLines(
  fb: FormBuilder,
  formArray: FormArray,
  emptyNum: (v: unknown) => number | null,
): void {
  const amountOf = (i: number) => closingNum(formArray.at(i)?.get('amount')?.value);
  while (formArray.length > 1 && amountOf(formArray.length - 1) <= 0 && amountOf(formArray.length - 2) <= 0) {
    formArray.removeAt(formArray.length - 1, { emitEvent: false });
  }
  if (formArray.length === 0 || amountOf(formArray.length - 1) > 0) {
    formArray.push(buildSourceLineGroup(fb, null, emptyNum), { emitEvent: false });
  }
}

export function ensureTrailingAllSourceLines(
  fb: FormBuilder,
  sourceAmounts: FormArray,
  emptyNum: (v: unknown) => number | null,
): void {
  for (let i = 0; i < sourceAmounts.length; i++) {
    const lines = sourceAmounts.at(i)?.get('lines') as FormArray | null;
    if (lines) ensureTrailingSourceLines(fb, lines, emptyNum);
  }
}

export function sourceLinesFromRaw(row: {
  amount?: unknown;
  lines?: Array<{ amount?: unknown }> | number[] | null;
}): number[] {
  const lines = row.lines;
  if (Array.isArray(lines) && lines.length) {
    return lines
      .map((item) => closingNum(typeof item === 'number' ? item : item?.amount))
      .filter((value) => value > 0);
  }
  const amount = closingNum(row.amount);
  return amount > 0 ? [amount] : [];
}

export function sourceRowTotal(row: {
  amount?: unknown;
  lines?: Array<{ amount?: unknown }> | number[] | null;
}): number {
  return sourceLinesFromRaw(row).reduce((sum, value) => sum + value, 0);
}

export function buildExpenseGroup(
  fb: FormBuilder,
  value: {
    label: string;
    amount?: number | null;
    category: string;
    conceptId?: string | null;
    notes?: string | null;
  },
  emptyNum: (v: unknown) => number | null,
) {
  return fb.group({
    conceptId: [value.conceptId || ''],
    label: [value.label || ''],
    notes: [value.notes || ''],
    amount: [emptyNum(value.amount)],
    category: [value.category || 'OTHER'],
  });
}

export type OtherCobroRow = { label: string; amount?: number | null };

export function buildOtherCobroGroup(
  fb: FormBuilder,
  value: OtherCobroRow,
  emptyNum: (v: unknown) => number | null,
) {
  return fb.group({
    label: [value.label || ''],
    amount: [emptyNum(value.amount)],
  });
}

export function cobrosFromClosing(closing: CashClosing): OtherCobroRow[] {
  const extras = (closing.extraLines ?? []).filter(
    (e) => e.type === 'OTHER' && closingNum(e.amount) > 0,
  );
  if (extras.length) {
    return extras.map((e, i) => ({
      label: String(e.label ?? '').trim() || `Cobro ${i + 1}`,
      amount: e.amount,
    }));
  }
  const seeded: OtherCobroRow[] = [];
  if (closingNum(closing.deliveryAppsAmount) > 0) {
    seeded.push({ label: 'PedidosYa / delivery', amount: closing.deliveryAppsAmount });
  }
  if (closingNum(closing.transferAmount) > 0) {
    seeded.push({ label: 'Transferencia', amount: closing.transferAmount });
  }
  if (closingNum(closing.otherAmount) > 0) {
    seeded.push({ label: 'Otros', amount: closing.otherAmount });
  }
  return seeded;
}

export function populateOtherCobros(
  fb: FormBuilder,
  formArray: FormArray,
  rows: OtherCobroRow[] | null | undefined,
  emptyNum: (v: unknown) => number | null,
): void {
  formArray.clear({ emitEvent: false });
  for (const row of rows ?? []) {
    formArray.push(buildOtherCobroGroup(fb, row, emptyNum), { emitEvent: false });
  }
  ensureTrailingOtherCobro(fb, formArray, emptyNum);
}

/** Deja siempre una fila vacía al final para cargar el siguiente cobro. */
export function ensureTrailingOtherCobro(
  fb: FormBuilder,
  formArray: FormArray,
  emptyNum: (v: unknown) => number | null,
): void {
  const amountOf = (i: number) => closingNum(formArray.at(i)?.get('amount')?.value);
  while (formArray.length > 1 && amountOf(formArray.length - 1) <= 0 && amountOf(formArray.length - 2) <= 0) {
    formArray.removeAt(formArray.length - 1, { emitEvent: false });
  }
  if (formArray.length === 0 || amountOf(formArray.length - 1) > 0) {
    formArray.push(
      buildOtherCobroGroup(
        fb,
        { label: `Cobro ${formArray.length + 1}`, amount: null },
        emptyNum,
      ),
      { emitEvent: false },
    );
  }
}

export function patchClosingFormValues(
  form: FormGroup,
  closing: CashClosing,
  emptyNum: (v: unknown) => number | null,
  toDateInput: (value?: string | null) => Date,
): void {
  form.patchValue({
    businessDate: toDateInput(closing.businessDate),
    posSystemAmount: emptyNum(closing.posSystemAmount),
    cardAmount: emptyNum(closing.cardAmount),
    cashAmount: emptyNum(closing.cashAmount),
    cashOpeningAmount: emptyNum(closing.cashOpeningAmount),
    mercadoPagoAmount: emptyNum(closing.mercadoPagoAmount),
    deliveryAppsAmount: emptyNum(closing.deliveryAppsAmount),
    transferAmount: emptyNum(closing.transferAmount),
    accountDniAmount: emptyNum(closing.accountDniAmount),
    unitsSold: emptyNum(closing.unitsSold),
    coversCount: emptyNum(closing.coversCount),
    cashLeftInRegister: emptyNum(closing.cashLeftInRegister),
    cashWithdrawn: emptyNum(closing.cashWithdrawn),
    cashWithdrawnByUserId: closing.cashWithdrawnByUserId ?? '',
    cashWithdrawnToAccountId: closing.cashWithdrawnToAccountId ?? '',
    tipsAmount: emptyNum(closing.tipsAmount),
    notes: closing.notes ?? '',
  });
}

export function defaultNewClosingPatch(
  shop: { defaultChangeAmount?: number | null } | null | undefined,
  currentBusinessDate: string,
  emptyNum: (v: unknown) => number | null,
  toDateInput: (value?: string | null) => Date,
) {
  return {
    businessDate: toDateInput(currentBusinessDate),
    cashOpeningAmount: emptyNum(shop?.defaultChangeAmount),
    cashLeftInRegister: emptyNum(shop?.defaultChangeAmount),
  };
}

export type ApplyTipDayOpts = {
  /** Tip day from API; omit / null when the request failed. */
  day?: Pick<
    TipDay,
    'id' | 'cashAmount' | 'transferAmount' | 'ticketsAmount' | 'receipts' | 'notes' | 'allocations'
  > | null;
  currentTipsAmount: number;
  error?: boolean;
};

export type ApplyTipDayResult = {
  state: TipsEditorState;
  /** Amount to patch into tipsAmount; null means leave the control as-is. */
  tipsAmount: number | null;
};

/** Pure tip-day → editor state (+ optional tipsAmount) used by loadTipDay success/error. */
export function applyTipDayToForm(opts: ApplyTipDayOpts): ApplyTipDayResult {
  if (opts.error || !opts.day) {
    return {
      state: {
        cashAmount: closingNum(opts.currentTipsAmount),
        receipts: [],
        transferAmount: 0,
        ticketsAmount: 0,
        notes: '',
        allocations: [],
      },
      tipsAmount: null,
    };
  }

  const state = tipDayToEditorState(opts.day);
  if (!opts.day.id && closingNum(opts.currentTipsAmount) > 0 && !state.cashAmount) {
    state.cashAmount = closingNum(opts.currentTipsAmount);
  }
  const total =
    Math.round((state.cashAmount + state.transferAmount + state.ticketsAmount) * 100) / 100;
  return {
    state,
    tipsAmount: total > 0 ? total : null,
  };
}

/** Value object for form.reset after cashier saves a new closing. */
export function resetClosingFormForNext(opts: {
  currentBusinessDate: string;
  defaultChangeAmount?: number | null;
  emptyNum: (v: unknown) => number | null;
  toDateInput: (value?: string | null) => Date;
}) {
  return {
    businessDate: opts.toDateInput(opts.currentBusinessDate),
    posSystemAmount: null,
    cardAmount: null,
    cashAmount: null,
    mercadoPagoAmount: null,
    deliveryAppsAmount: null,
    transferAmount: null,
    accountDniAmount: null,
    unitsSold: null,
    coversCount: null,
    cashLeftInRegister: opts.emptyNum(opts.defaultChangeAmount),
    cashWithdrawn: null,
    cashWithdrawnByUserId: '',
    cashWithdrawnToAccountId: '',
    tipsAmount: null,
    notes: '',
    expenses: [] as unknown[],
    posnetAmounts: [] as unknown[],
    dniTransfers: [] as unknown[],
    sourceAmounts: [] as unknown[],
    otherCobros: [] as unknown[],
  };
}
