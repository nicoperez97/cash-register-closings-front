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

export function buildSourcePosnetAmountGroup(
  fb: FormBuilder,
  value: { posnetId: string; name: string; amount?: number | null },
  emptyNum: (v: unknown) => number | null,
) {
  return fb.group({
    posnetId: [value.posnetId],
    name: [value.name],
    amount: [emptyNum(value.amount)],
  });
}

export function buildSourceAmountGroup(
  fb: FormBuilder,
  value: {
    sourceId: string;
    name: string;
    includeInDeclared: boolean;
    kind: string;
    role?: string;
    lines?: number[];
    posnets?: Array<{ id: string; name: string }>;
    posnetAmounts?: Array<{ posnetId: string; name: string; amount: number }>;
  },
  emptyNum: (v: unknown) => number | null,
) {
  const catalogPosnets = normalizeCatalogPosnets(value.posnets);
  const savedPosnets = value.posnetAmounts ?? [];
  const savedById = new Map(savedPosnets.map((p) => [p.posnetId, p]));

  const posnetDefs =
    catalogPosnets.length > 0
      ? catalogPosnets.map((p) => ({
          posnetId: p.id,
          name: p.name,
          amount: savedById.get(p.id)?.amount ?? null,
        }))
      : savedPosnets.map((p) => ({
          posnetId: p.posnetId,
          name: p.name,
          amount: p.amount,
        }));

  // Ad-hoc del snapshot que no están en el catálogo
  if (catalogPosnets.length) {
    for (const p of savedPosnets) {
      if (catalogPosnets.some((c) => c.id === p.posnetId)) continue;
      if (posnetDefs.some((d) => d.posnetId === p.posnetId)) continue;
      posnetDefs.push({ posnetId: p.posnetId, name: p.name, amount: p.amount });
    }
  }

  if (posnetDefs.length) {
    const posnetAmounts = fb.array(
      posnetDefs.map((p) =>
        buildSourcePosnetAmountGroup(
          fb,
          { posnetId: p.posnetId, name: p.name, amount: p.amount },
          emptyNum,
        ),
      ),
    );
    return fb.group({
      sourceId: [value.sourceId],
      name: [value.name],
      includeInDeclared: [!!value.includeInDeclared],
      kind: [value.kind],
      role: [value.role || 'STANDARD'],
      lines: fb.array([]),
      posnetAmounts,
    });
  }

  const lines = fb.array(
    (value.lines ?? []).map((amount) => buildSourceLineGroup(fb, amount, emptyNum)),
  );
  const group = fb.group({
    sourceId: [value.sourceId],
    name: [value.name],
    includeInDeclared: [!!value.includeInDeclared],
    kind: [value.kind],
    role: [value.role || 'STANDARD'],
    lines,
    posnetAmounts: fb.array([]),
  });
  ensureTrailingSourceLines(fb, group.get('lines') as FormArray, emptyNum);
  return group;
}

/** Normaliza posnets del catálogo (array, JSON string o vacío). */
export function normalizeCatalogPosnets(
  raw: unknown,
): Array<{ id: string; name: string }> {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const out: Array<{ id: string; name: string }> = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const name = String((row as { name?: string }).name ?? '').trim();
    const id = String((row as { id?: string }).id ?? '').trim();
    if (!name || !id) continue;
    out.push({ id, name });
  }
  return out;
}

/** Posnets legacy del shop (con type) que corresponden a una cuenta del local por nombre. */
export function legacyShopPosnetsForSource(
  sourceName: string,
  shopPosnets: Array<{ id: string; name: string; type?: string }> | null | undefined,
): Array<{ id: string; name: string }> {
  if (!shopPosnets?.length) return [];
  const n = sourceName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  let types: string[] = [];
  if (n === 'pvs' || n.includes('tarjeta') || n.includes('card')) types = ['PVS'];
  else if (n.includes('mercado') || n === 'mp') types = ['MERCADO_PAGO'];
  else if (n.includes('dni')) types = ['CUENTA_DNI'];
  if (!types.length) return [];
  return shopPosnets
    .filter((p) => types.includes(String(p.type ?? '')))
    .map((p) => ({
      id: String(p.id || ''),
      name: String(p.name ?? '').trim() || 'Posnet',
    }))
    .filter((p) => !!p.id);
}

export function resolveSourceCatalogPosnets(
  src: Pick<ShopClosingSource, 'name' | 'posnets'>,
  shopPosnets?: Array<{ id: string; name: string; type?: string }> | null,
): Array<{ id: string; name: string }> {
  const fromSource = normalizeCatalogPosnets(src.posnets);
  if (fromSource.length) return fromSource;
  return legacyShopPosnetsForSource(src.name, shopPosnets);
}

export function populateSourceAmounts(
  fb: FormBuilder,
  formArray: FormArray,
  catalog: ShopClosingSource[],
  saved: ClosingSourceAmount[] | null | undefined,
  emptyNum: (v: unknown) => number | null,
  legacyPosnets?: Array<{ posnetId: string; name: string; type?: string; amount: number }> | null,
  shopPosnets?: Array<{ id: string; name: string; type?: string }> | null,
): void {
  formArray.clear({ emitEvent: false });
  const savedById = new Map((saved ?? []).map((s) => [s.sourceId, s]));
  const seen = new Set<string>();
  const legacyByPosnetId = new Map((legacyPosnets ?? []).map((p) => [p.posnetId, p]));

  for (const src of catalog) {
    if (src.role === 'CASH') continue;
    // active ausente o true = visible; solo omitir si está explícitamente inactiva
    if (src.active === false && !savedById.has(src.id)) continue;
    seen.add(src.id);
    const prev = savedById.get(src.id);
    const catalogPosnets = resolveSourceCatalogPosnets(src, shopPosnets);

    let posnetAmounts = prev?.posnetAmounts ?? undefined;
    // Compat: montos top-level tipados → posnets de esta cuenta por id
    if ((!posnetAmounts || !posnetAmounts.length) && catalogPosnets.length > 0) {
      const fromLegacy = catalogPosnets
        .map((p) => {
          const hit = legacyByPosnetId.get(p.id);
          return hit
            ? { posnetId: p.id, name: p.name, amount: closingNum(hit.amount) }
            : { posnetId: p.id, name: p.name, amount: 0 };
        })
        .filter((p) => closingNum(p.amount) > 0);
      if (fromLegacy.length) posnetAmounts = fromLegacy;
    }
    formArray.push(
      buildSourceAmountGroup(
        fb,
        {
          sourceId: src.id,
          name: src.name,
          includeInDeclared: !!src.includeInDeclared,
          kind: src.kind,
          role: src.role,
          lines: catalogPosnets.length ? [] : sourceLineAmounts(prev),
          posnets: catalogPosnets,
          posnetAmounts,
        },
        emptyNum,
      ),
      { emitEvent: false },
    );
  }
  for (const s of saved ?? []) {
    if (!s.sourceId || seen.has(s.sourceId)) continue;
    if (s.role === 'CASH') continue;
    formArray.push(
      buildSourceAmountGroup(
        fb,
        {
          sourceId: s.sourceId,
          name: s.name || 'Cuenta',
          includeInDeclared: !!s.includeInDeclared,
          kind: s.kind || 'RECORD_ONLY',
          role: s.role,
          lines: sourceLineAmounts(s),
          posnetAmounts: s.posnetAmounts ?? undefined,
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
    const row = sourceAmounts.at(i);
    const posnets = row?.get('posnetAmounts') as FormArray | null;
    if (posnets && posnets.length > 0) continue;
    const lines = row?.get('lines') as FormArray | null;
    if (lines) ensureTrailingSourceLines(fb, lines, emptyNum);
  }
}

export function sourceLinesFromRaw(row: {
  amount?: unknown;
  lines?: Array<{ amount?: unknown }> | number[] | null;
  posnetAmounts?: Array<{ amount?: unknown }> | null;
}): number[] {
  const posnets = row.posnetAmounts;
  if (Array.isArray(posnets) && posnets.length) {
    return posnets.map((p) => closingNum(p?.amount)).filter((v) => v > 0);
  }
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
  posnetAmounts?: Array<{ amount?: unknown }> | null;
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

export type CobroPaymentMethod = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER';

export const COBRO_PAYMENT_METHOD_OPTIONS: Array<{ value: CobroPaymentMethod; label: string }> = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'CARD', label: 'Tarjeta / posnet' },
  { value: 'OTHER', label: 'Otro' },
];

export function normalizeCobroPaymentMethod(raw: unknown): CobroPaymentMethod {
  const v = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (v === 'CASH' || v === 'TRANSFER' || v === 'CARD' || v === 'OTHER') return v;
  return 'OTHER';
}

export function cobroPaymentMethodFromMeta(meta?: string | null): CobroPaymentMethod {
  const raw = String(meta ?? '').trim();
  if (!raw) return 'OTHER';
  try {
    const parsed = JSON.parse(raw) as { paymentMethod?: unknown };
    return normalizeCobroPaymentMethod(parsed?.paymentMethod);
  } catch {
    return normalizeCobroPaymentMethod(raw);
  }
}

export function cobroPaymentMethodToMeta(method: CobroPaymentMethod): string {
  return JSON.stringify({ paymentMethod: method });
}

export type OtherCobroRow = {
  label: string;
  amount?: number | null;
  paymentMethod?: CobroPaymentMethod | null;
};

export function buildOtherCobroGroup(
  fb: FormBuilder,
  value: OtherCobroRow,
  emptyNum: (v: unknown) => number | null,
) {
  return fb.group({
    label: [value.label || ''],
    amount: [emptyNum(value.amount)],
    paymentMethod: [normalizeCobroPaymentMethod(value.paymentMethod)],
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
      paymentMethod: cobroPaymentMethodFromMeta(e.meta),
    }));
  }
  const seeded: OtherCobroRow[] = [];
  if (closingNum(closing.deliveryAppsAmount) > 0) {
    seeded.push({
      label: 'PedidosYa / delivery',
      amount: closing.deliveryAppsAmount,
      paymentMethod: 'OTHER',
    });
  }
  if (closingNum(closing.transferAmount) > 0) {
    seeded.push({
      label: 'Transferencia',
      amount: closing.transferAmount,
      paymentMethod: 'TRANSFER',
    });
  }
  if (closingNum(closing.otherAmount) > 0) {
    seeded.push({ label: 'Otros', amount: closing.otherAmount, paymentMethod: 'OTHER' });
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
        {
          label: `Cobro ${formArray.length + 1}`,
          amount: null,
          paymentMethod: 'OTHER',
        },
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
    shiftId: closing.shiftId ?? '',
    kind: String(closing.kind ?? '') === 'EVENT' ? 'EVENT' : 'REGULAR',
    eventName: closing.eventName ?? '',
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
    differenceReason: closing.differenceReason ?? '',
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
    cashLeftInRegister: null,
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
  const opening = opts.emptyNum(opts.defaultChangeAmount);
  return {
    businessDate: opts.toDateInput(opts.currentBusinessDate),
    kind: 'REGULAR' as const,
    eventName: '',
    posSystemAmount: null,
    cardAmount: null,
    cashAmount: null,
    cashOpeningAmount: opening,
    mercadoPagoAmount: null,
    deliveryAppsAmount: null,
    transferAmount: null,
    accountDniAmount: null,
    unitsSold: null,
    coversCount: null,
    cashLeftInRegister: null,
    cashWithdrawn: null,
    cashWithdrawnByUserId: '',
    cashWithdrawnToAccountId: '',
    tipsAmount: null,
    notes: '',
    differenceReason: '',
    expenses: [] as unknown[],
    posnetAmounts: [] as unknown[],
    dniTransfers: [] as unknown[],
    sourceAmounts: [] as unknown[],
    otherCobros: [] as unknown[],
  };
}
