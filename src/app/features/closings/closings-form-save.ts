import { newId } from '../../core/utils/id';
import type { TipsEditorState } from '../tips/tips-editor';
import type {
  CashClosing,
  ClosingPosnetAmount,
  ClosingSourceAmount,
  ShopUserOption,
} from './closings-api.service';
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
  | { ok: true; shopId: string; body: Partial<CashClosing> }
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

  const body: Partial<CashClosing> & Record<string, unknown> = {
    ...raw,
    businessDate: toDateString(raw.businessDate as Date | string | null),
    posSystemAmount: closingNum(raw.posSystemAmount),
    cardAmount: closingNum(raw.cardAmount),
    cashAmount: closingNum(raw.cashAmount),
    mercadoPagoAmount: closingNum(raw.mercadoPagoAmount),
    deliveryAppsAmount: closingNum(raw.deliveryAppsAmount),
    transferAmount: closingNum(raw.transferAmount),
    accountDniAmount: closingNum(raw.accountDniAmount),
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
    notes: String(raw.notes ?? '').trim() || null,
    sourceAmounts: ((raw.sourceAmounts ?? []) as ClosingFormRawValue['sourceAmounts'])
      .filter((s) => !!s.sourceId)
      .map((s) => ({
        sourceId: s.sourceId,
        name: String(s.name ?? '').trim() || 'Fuente',
        includeInDeclared: !!s.includeInDeclared,
        kind: (s.kind as ClosingSourceAmount['kind']) || 'RECORD_ONLY',
        amount: closingNum(s.amount),
      })),
    ...tip.payload,
  };
  // dniTransfers es solo UI; no lo mandamos al API
  delete (body as { dniTransfers?: unknown }).dniTransfers;
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

  return {
    id: input.closingId ?? '',
    shopId: input.shopId ?? '',
    businessDate: toDateString(raw.businessDate as Date | string | null),
    status: input.status ?? 'OPEN',
    posSystemAmount: pos,
    cardAmount: closingNum(raw.cardAmount),
    cashAmount: closingNum(raw.cashAmount),
    mercadoPagoAmount: closingNum(raw.mercadoPagoAmount),
    deliveryAppsAmount: closingNum(raw.deliveryAppsAmount),
    transferAmount: closingNum(raw.transferAmount),
    accountDniAmount: closingNum(raw.accountDniAmount),
    otherAmount: 0,
    tipsAmount: closingNum(raw.tipsAmount),
    cashLeftInRegister: closingNum(raw.cashLeftInRegister),
    cashPendingPickup: 0,
    cashWithdrawn: closingNum(raw.cashWithdrawn),
    cashWithdrawnByName: who,
    unitsSold: raw.unitsSold || null,
    coversCount: raw.coversCount || null,
    declaredTotal: declared,
    calculatedTotal: declared,
    difference: declared - pos,
    notes: String(raw.notes ?? '').trim() || null,
    posnetAmounts,
    expenses,
    sourceAmounts: ((raw.sourceAmounts ?? []) as ClosingFormRawValue['sourceAmounts'])
      .filter((s) => !!s.sourceId && closingNum(s.amount) > 0)
      .map(
        (s): ClosingSourceAmount => ({
          sourceId: s.sourceId,
          name: String(s.name ?? '').trim() || 'Fuente',
          includeInDeclared: !!s.includeInDeclared,
          kind: (s.kind as ClosingSourceAmount['kind']) || 'RECORD_ONLY',
          amount: closingNum(s.amount),
        }),
      ),
  };
}
