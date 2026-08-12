import { FormBuilder, FormGroup } from '@angular/forms';
import type { TipsEditorState } from '../tips/tips-editor';
import { tipDayToEditorState } from '../tips/tips-editor';
import type { TipDay } from '../tips/tips-api.service';
import type { CashClosing, ShopUserOption } from './closings-api.service';
import { closingNum } from './closings-form.utils';

export function buildExpenseGroup(
  fb: FormBuilder,
  value: { label: string; amount?: number | null; category: string },
  emptyNum: (v: unknown) => number | null,
) {
  return fb.group({
    label: [value.label || ''],
    amount: [emptyNum(value.amount)],
    category: [value.category || 'OTHER'],
  });
}

/** Resuelve la cuenta destino al cambiar el usuario de retiro de efectivo. */
export function resolveWithdrawnAccountId(
  users: ShopUserOption[],
  userId: string,
  currentAccountId: string,
): string {
  const user = users.find((u) => u.id === userId);
  const accounts = user?.ledgerAccounts ?? [];
  if (accounts.length === 1) return accounts[0].id;
  if (accounts.length === 0) return '';
  if (!accounts.some((a) => a.id === currentAccountId)) return '';
  return currentAccountId;
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
  };
}
