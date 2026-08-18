import { newId } from '../../core/utils/id';
import type { TipsEditorState } from '../tips/tips-editor';
import type {
  CashClosing,
  CashClosingInput,
  ClosingPosnetAmount,
  ClosingSourceAmount,
  ShopUserOption,
} from './closings-api.service';
import { closingSourceKindLabel } from './closings-api.service';
import { sourceLinesFromRaw, sourceRowTotal } from './closings-form-load';
import { POSNET_TYPE_LABEL, closingNum, toDateString } from './closings-form.utils';

export type ClosingFormExpenseRaw = {
  label: string;
  amount: number;
  category?: string;
};

export type ClosingFormDniTransferRaw = {
  id: string;
  label: string;
  amount: number;
};

/** Raw value shape from the closings form (getRawValue). */
export type ClosingFormRawValue = {
  businessDate: Date | string | null;
  posSystemAmount: unknown;
  cardAmount: unknown;
  cashAmount: unknown;
  mercadoPagoAmount: unknown;
  deliveryAppsAmount: unknown;
  transferAmount: unknown;
  accountDniAmount: unknown;
  unitsSold: number | null;
  coversCount: number | null;
  cashLeftInRegister: unknown;
  cashWithdrawn: unknown;
  tipsAmount: unknown;
  cashWithdrawnByUserId: string;
  cashWithdrawnToAccountId: string;
  notes: string;
  posnetAmounts: ClosingPosnetAmount[];
  dniTransfers: ClosingFormDniTransferRaw[];
  expenses: ClosingFormExpenseRaw[];
  sourceAmounts: Array<{
    sourceId: string;
    name: string;
    includeInDeclared: boolean;
    kind: string;
    amount?: unknown;
    lines?: Array<{ amount?: unknown }> | number[] | null;
  }>;
  otherCobros: Array<{
    label: string;
    amount: unknown;
  }>;
  [key: string]: unknown;
};

export type TipPayloadResult = {
  payload: Record<string, unknown>;
  invalid: boolean;
};

export function buildTipPayloadForClosing(input: {
  tipsEnabled: boolean;
  tipDraft: TipsEditorState | null;
}): TipPayloadResult {
  if (!input.tipsEnabled || !input.tipDraft) {
    return { payload: {}, invalid: false };
  }
  const d = input.tipDraft;
  const allocSum =
    Math.round(d.allocations.reduce((s, a) => s + Number(a.amount || 0), 0) * 100) / 100;
  const total =
    Math.round(
      (Number(d.cashAmount || 0) +
        Number(d.transferAmount || 0) +
        Number(d.ticketsAmount || 0)) *
        100,
    ) / 100;
  if (d.allocations.length && Math.abs(allocSum - total) > 0.02) {
    return { payload: {}, invalid: true };
  }
  return {
    payload: {
      tipCashAmount: Number(d.cashAmount || 0),
      tipTransferAmount: Number(d.transferAmount || 0),
      tipTicketsAmount: Number(d.ticketsAmount || 0),
      tipReceipts: d.receipts ?? [],
      tipNotes: d.notes?.trim() || null,
      tipAllocations: d.allocations.map((a) => ({
        employeeId: a.employeeId,
        amount: Number(a.amount || 0),
        delivered: !!a.delivered,
      })),
      tipsAmount: total,
    },
    invalid: false,
  };
}

export type PrepareClosingSaveBodyInput = {
  formRaw: ClosingFormRawValue;
  users: ShopUserOption[];
  declaredTotal: number;
  shopId: string | null;
  tipsEnabled: boolean;
  tipDraft: TipsEditorState | null;
};

export type PrepareClosingSaveBodyResult =
  | { ok: true; shopId: string; body: CashClosingInput }
  | { ok: false; reason: 'no_shop' | 'missing_account' | 'tips_invalid' };

export function prepareClosingSaveBody(
  input: PrepareClosingSaveBodyInput,
): PrepareClosingSaveBodyResult {
  const { formRaw: raw, users, declaredTotal, shopId } = input;
  if (!shopId) return { ok: false, reason: 'no_shop' };

  const userId = raw.cashWithdrawnByUserId || null;
  const selected = users.find((u) => u.id === userId);
  const withdrawnAccounts = selected?.ledgerAccounts ?? [];
  let accountId = raw.cashWithdrawnToAccountId || null;
  if (closingNum(raw.cashAmount) > 0 && userId && withdrawnAccounts.length > 1 && !accountId) {
    return { ok: false, reason: 'missing_account' };
  }
  if (withdrawnAccounts.length === 1) {
    accountId = withdrawnAccounts[0].id;
  }
  if (!userId) accountId = null;

  const posnetAmounts: ClosingPosnetAmount[] = (raw.posnetAmounts as ClosingPosnetAmount[])
    .filter((p) => !!String(p.name ?? '').trim() || closingNum(p.amount) > 0)
    .map((p) => ({
      posnetId: p.posnetId || newId(),
      name: String(p.name ?? '').trim() || POSNET_TYPE_LABEL[p.type] || 'Posnet',
      type: p.type,
      amount: closingNum(p.amount),
    }));

  for (const t of raw.dniTransfers as ClosingFormDniTransferRaw[]) {
    if (!String(t.label ?? '').trim() && closingNum(t.amount) <= 0) continue;
    posnetAmounts.push({
      posnetId: t.id || newId(),
      name: String(t.label ?? '').trim() || 'Transferencia Cuenta DNI',
      type: 'CUENTA_DNI',
      amount: closingNum(t.amount),
    });
  }

  const tip = buildTipPayloadForClosing({
    tipsEnabled: input.tipsEnabled,
    tipDraft: input.tipDraft,
  });
  if (tip.invalid) return { ok: false, reason: 'tips_invalid' };

  const cobros = ((raw.otherCobros ?? []) as ClosingFormRawValue['otherCobros'])
    .map((s, i) => ({
      label: String(s.label ?? '').trim() || `Cobro ${i + 1}`,
      amount: closingNum(s.amount),
    }))
    .filter((s) => s.amount > 0);
  const cobrosSum = cobros.reduce((sum, s) => sum + s.amount, 0);

  const body: CashClosingInput & Record<string, unknown> = {
    ...raw,
    businessDate: toDateString(raw.businessDate as Date | string | null),
    posSystemAmount: closingNum(raw.posSystemAmount),
    cardAmount: closingNum(raw.cardAmount),
    cashAmount: closingNum(raw.cashAmount),
    mercadoPagoAmount: closingNum(raw.mercadoPagoAmount),
    deliveryAppsAmount: 0,
    transferAmount: 0,
    accountDniAmount: closingNum(raw.accountDniAmount),
    otherAmount: cobrosSum,
    cashLeftInRegister: closingNum(raw.cashLeftInRegister),
    cashWithdrawn: closingNum(raw.cashWithdrawn),
    tipsAmount: closingNum(raw.tipsAmount),
    unitsSold: raw.unitsSold || null,
    coversCount: raw.coversCount || null,
    cashWithdrawnByUserId: userId,
    cashWithdrawnByEmployeeId: null,
    cashWithdrawnByName: selected?.fullName ?? null,
    cashWithdrawnToAccountId: accountId,
    cashPendingPickup: userId
      ? 0
      : (() => {
          const explicit = closingNum(raw.cashWithdrawn);
          if (explicit > 0) return explicit;
          const expensesTotal = (raw.expenses as ClosingFormExpenseRaw[])
            .filter((e) => !!e.label && closingNum(e.amount) > 0)
            .reduce((s, e) => s + closingNum(e.amount), 0);
          return Math.max(
            0,
            closingNum(raw.cashAmount) - closingNum(raw.cashLeftInRegister) - expensesTotal,
          );
        })(),
    declaredTotal,
    posnetAmounts: posnetAmounts.length ? posnetAmounts : [],
    expenses: (raw.expenses as ClosingFormExpenseRaw[])
      .filter((e) => !!e.label && closingNum(e.amount) > 0)
      .map((e) => ({
        label: e.label,
        amount: closingNum(e.amount),
        category: e.category,
      })),
    extraLines: cobros.map((s) => ({
      type: 'OTHER',
      label: s.label,
      amount: s.amount,
    })),
    notes: String(raw.notes ?? '').trim() || null,
    sourceAmounts: ((raw.sourceAmounts ?? []) as ClosingFormRawValue['sourceAmounts'])
      .filter((s) => !!s.sourceId)
      .map((s) => {
        const lines = sourceLinesFromRaw(s);
        return {
          sourceId: s.sourceId,
          amount: sourceRowTotal(s),
          lines: lines.length ? lines : undefined,
        };
      }),
    ...tip.payload,
  };
  // dniTransfers / otherCobros son solo UI; no los mandamos al API
  delete (body as { dniTransfers?: unknown }).dniTransfers;
  delete (body as { otherCobros?: unknown }).otherCobros;
  return { ok: true, shopId, body };
}

export type BuildClosingShareSnapshotInput = {
  formRaw: ClosingFormRawValue;
  users: ShopUserOption[];
  declaredTotal: number;
  posSystemAmount: number;
  shopId: string | null;
  closingId: string | null;
  status: string | null;
};

export function buildClosingShareSnapshot(input: BuildClosingShareSnapshotInput): CashClosing {
  const raw = input.formRaw;
  const userId = String(raw.cashWithdrawnByUserId ?? '');
  const who = input.users.find((u) => u.id === userId)?.fullName?.trim() || null;
  const declared = input.declaredTotal;
  const pos = input.posSystemAmount;

  const posnetAmounts: ClosingPosnetAmount[] = [
    ...((raw.posnetAmounts as ClosingPosnetAmount[]) ?? []),
    ...((raw.dniTransfers as ClosingFormDniTransferRaw[]) ?? []).map((t) => ({
      posnetId: t.id,
      name: String(t.label ?? '').trim() || 'Transferencia Cuenta DNI',
      type: 'CUENTA_DNI' as const,
      amount: closingNum(t.amount),
    })),
  ].filter((p) => closingNum(p.amount) > 0);

  const expenses = ((raw.expenses as ClosingFormExpenseRaw[]) ?? [])
    .filter((e) => !!e.label && closingNum(e.amount) > 0)
    .map((e) => ({
      label: e.label,
      amount: closingNum(e.amount),
      category: e.category,
    }));

  const cobros = ((raw.otherCobros ?? []) as ClosingFormRawValue['otherCobros'])
    .map((s, i) => ({
      type: 'OTHER',
      label: String(s.label ?? '').trim() || `Cobro ${i + 1}`,
      amount: closingNum(s.amount),
    }))
    .filter((s) => s.amount > 0);
  const cobrosSum = cobros.reduce((sum, s) => sum + s.amount, 0);

  return {
    id: input.closingId ?? '',
    shopId: input.shopId ?? '',
    businessDate: toDateString(raw.businessDate as Date | string | null),
    status: input.status ?? 'OPEN',
    posSystemAmount: pos,
    cardAmount: closingNum(raw.cardAmount),
    cashAmount: closingNum(raw.cashAmount),
    mercadoPagoAmount: closingNum(raw.mercadoPagoAmount),
    deliveryAppsAmount: 0,
    transferAmount: 0,
    accountDniAmount: closingNum(raw.accountDniAmount),
    otherAmount: cobrosSum,
    tipsAmount: closingNum(raw.tipsAmount),
    cashLeftInRegister: closingNum(raw.cashLeftInRegister),
    cashPendingPickup: 0,
    cashWithdrawn: closingNum(raw.cashWithdrawn),
    cashWithdrawnByName: who,
    unitsSold: raw.unitsSold || null,
    coversCount: raw.coversCount || null,
    declaredTotal: declared,
    calculatedTotal: declared,
    difference: pos - declared,
    notes: String(raw.notes ?? '').trim() || null,
    posnetAmounts,
    expenses,
    extraLines: cobros,
    sourceAmounts: ((raw.sourceAmounts ?? []) as ClosingFormRawValue['sourceAmounts'])
      .filter((s) => !!s.sourceId && sourceRowTotal(s) > 0)
      .map((s): ClosingSourceAmount => {
        const lines = sourceLinesFromRaw(s);
        return {
          sourceId: s.sourceId,
          name: String(s.name ?? '').trim() || 'Fuente',
          includeInDeclared: !!s.includeInDeclared,
          kind: (s.kind as ClosingSourceAmount['kind']) || 'RECORD_ONLY',
          amount: sourceRowTotal(s),
          lines: lines.length ? lines : undefined,
        };
      }),
  };
}

export type ClosingSaveDialogExtraRow = { label: string; value: string };

/** Filas extra del diálogo de guardar (cobros, cuentas aparte, diferencia). */
export function closingSaveDialogExtraRows(
  snapshot: CashClosing,
  money: (value: number) => string,
): ClosingSaveDialogExtraRow[] {
  const rows: ClosingSaveDialogExtraRow[] = [];
  if (Number(snapshot.mercadoPagoAmount || 0) !== 0) {
    rows.push({ label: 'Mercado Pago', value: money(Number(snapshot.mercadoPagoAmount)) });
  }
  for (const e of snapshot.extraLines ?? []) {
    if (Number(e.amount || 0) === 0) continue;
    rows.push({
      label: String(e.label || '').trim() || 'Cobro',
      value: money(Number(e.amount)),
    });
  }
  for (const s of snapshot.sourceAmounts ?? []) {
    if (Number(s.amount || 0) === 0) continue;
    const name = String(s.name || '').trim() || 'Fuente';
    const parts = (s.lines ?? []).map((v) => Number(v || 0)).filter((v) => v > 0);
    const kind = s.kind && s.kind !== 'RECORD_ONLY' ? ` · ${closingSourceKindLabel(s.kind)}` : '';
    const linesHint = parts.length > 1 ? ` (${parts.map((v) => money(v)).join(' + ')})` : '';
    rows.push({
      label: `${name}${kind}`,
      value: `${money(Number(s.amount))}${linesHint}`,
    });
  }
  if (Number(snapshot.difference || 0) !== 0) {
    rows.push({ label: 'Diferencia', value: money(Number(snapshot.difference)) });
  }
  for (const e of snapshot.expenses ?? []) {
    if (Number(e.amount || 0) === 0) continue;
    rows.push({
      label: String(e.label || '').trim() || 'Egreso',
      value: money(Number(e.amount)),
    });
  }
  return rows;
}
