import { FormArray, FormBuilder, FormGroup } from '@angular/forms';
import type { TipsEditorState } from '../tips/tips-editor';
import type { ClosingSourceAmount } from './closings-api.service';
import { closingNum } from './closings-form.utils';
import { buildExpenseGroup, populateOtherCobros } from './closings-form-load';
import { buildDniTransferGroup } from './closings-form-payment-lines';

const DRAFT_KEY = 'crc.closing-draft.v1';
const RETURN_URL_KEY = 'crc.return-url';
const MAX_AGE_MS = 48 * 60 * 60 * 1000;

export type ClosingFormDraft = {
  v: 1;
  shopId: string;
  userId: string;
  savedAt: number;
  form: Record<string, unknown>;
  tipDraft: TipsEditorState | null;
};

export function persistReturnUrl(url: string): void {
  try {
    const path = String(url || '').trim();
    if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/login')) return;
    sessionStorage.setItem(RETURN_URL_KEY, path);
  } catch {
    /* ignore */
  }
}

export function consumeReturnUrl(): string | null {
  try {
    const raw = sessionStorage.getItem(RETURN_URL_KEY);
    if (raw) sessionStorage.removeItem(RETURN_URL_KEY);
    if (!raw?.startsWith('/') || raw.startsWith('//') || raw.startsWith('/login')) return null;
    return raw;
  } catch {
    return null;
  }
}

export function persistClosingDraft(draft: ClosingFormDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota */
  }
}

export function readClosingDraft(shopId: string, userId: string): ClosingFormDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClosingFormDraft;
    if (parsed?.v !== 1) return null;
    if (parsed.shopId !== shopId || parsed.userId !== userId) return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearClosingDraft();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearClosingDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function closingDraftFromForm(
  shopId: string,
  userId: string,
  form: FormGroup,
  tipDraft: TipsEditorState | null,
): ClosingFormDraft {
  return {
    v: 1,
    shopId,
    userId,
    savedAt: Date.now(),
    form: serializeForm(form.getRawValue()),
    tipDraft: tipDraft ? structuredClone(tipDraft) : null,
  };
}

function serializeForm(raw: Record<string, unknown>): Record<string, unknown> {
  const date = raw['businessDate'];
  return {
    ...raw,
    businessDate:
      date instanceof Date
        ? date.toISOString()
        : date
          ? String(date)
          : null,
  };
}

export function sourceAmountsFromDraft(draft: ClosingFormDraft): ClosingSourceAmount[] {
  const rows = Array.isArray(draft.form['sourceAmounts'])
    ? (draft.form['sourceAmounts'] as Array<Record<string, unknown>>)
    : [];
  return rows
    .map((row) => {
      const lines = Array.isArray(row['lines'])
        ? (row['lines'] as Array<{ amount?: unknown }>)
            .map((l) => closingNum(l?.amount))
            .filter((n) => n > 0)
        : [];
      const amount = lines.length ? lines.reduce((s, n) => s + n, 0) : closingNum(row['amount']);
      return {
        sourceId: String(row['sourceId'] ?? ''),
        name: String(row['name'] ?? ''),
        includeInDeclared: !!row['includeInDeclared'],
        kind: (row['kind'] as ClosingSourceAmount['kind']) || 'OTHER',
        amount,
        lines: lines.length ? lines : null,
      };
    })
    .filter((row) => row.sourceId);
}

export function applyClosingFormDraft(
  form: FormGroup,
  fb: FormBuilder,
  draft: ClosingFormDraft,
  emptyNum: (v: unknown) => number | null,
  toDateInput: (value?: string | null) => Date,
): void {
  const raw = draft.form;
  const dateRaw = raw['businessDate'];
  const dateStr =
    typeof dateRaw === 'string'
      ? dateRaw.slice(0, 10)
      : dateRaw instanceof Date
        ? dateRaw.toISOString().slice(0, 10)
        : null;

  form.patchValue(
    {
      businessDate: dateStr ? toDateInput(dateStr) : form.controls['businessDate'].value,
      posSystemAmount: emptyNum(raw['posSystemAmount']),
      cardAmount: emptyNum(raw['cardAmount']),
      cashAmount: emptyNum(raw['cashAmount']),
      mercadoPagoAmount: emptyNum(raw['mercadoPagoAmount']),
      deliveryAppsAmount: emptyNum(raw['deliveryAppsAmount']),
      transferAmount: emptyNum(raw['transferAmount']),
      accountDniAmount: emptyNum(raw['accountDniAmount']),
      unitsSold: emptyNum(raw['unitsSold']),
      coversCount: emptyNum(raw['coversCount']),
      cashLeftInRegister: emptyNum(raw['cashLeftInRegister']),
      cashWithdrawn: emptyNum(raw['cashWithdrawn']),
      cashWithdrawnByUserId: String(raw['cashWithdrawnByUserId'] ?? ''),
      cashWithdrawnToAccountId: String(raw['cashWithdrawnToAccountId'] ?? ''),
      tipsAmount: emptyNum(raw['tipsAmount']),
      notes: String(raw['notes'] ?? ''),
    },
    { emitEvent: false },
  );

  const expenses = form.get('expenses') as FormArray;
  expenses.clear({ emitEvent: false });
  for (const row of (raw['expenses'] as Array<Record<string, unknown>>) ?? []) {
    expenses.push(
      buildExpenseGroup(
        fb,
        {
          label: String(row['label'] ?? ''),
          amount: emptyNum(row['amount']),
          category: String(row['category'] ?? 'OTHER'),
          conceptId: (row['conceptId'] as string | null) ?? '',
          notes: (row['notes'] as string | null) ?? '',
        },
        emptyNum,
      ),
      { emitEvent: false },
    );
  }

  const posnets = form.get('posnetAmounts') as FormArray;
  const savedPosnets = Array.isArray(raw['posnetAmounts'])
    ? (raw['posnetAmounts'] as Array<Record<string, unknown>>)
    : [];
  const byId = new Map(savedPosnets.map((p) => [String(p['posnetId'] ?? ''), p]));
  for (let i = 0; i < posnets.length; i++) {
    const id = String(posnets.at(i)?.get('posnetId')?.value ?? '');
    const prev = byId.get(id);
    if (prev) posnets.at(i)?.patchValue({ amount: emptyNum(prev['amount']) }, { emitEvent: false });
  }

  const dni = form.get('dniTransfers') as FormArray;
  dni.clear({ emitEvent: false });
  for (const row of (raw['dniTransfers'] as Array<Record<string, unknown>>) ?? []) {
    dni.push(
      buildDniTransferGroup(fb, {
        id: String(row['id'] ?? ''),
        label: String(row['label'] ?? ''),
        amount: emptyNum(row['amount']),
      }),
      { emitEvent: false },
    );
  }

  populateOtherCobros(
    fb,
    form.get('otherCobros') as FormArray,
    ((raw['otherCobros'] as Array<Record<string, unknown>>) ?? []).map((row) => ({
      label: String(row['label'] ?? ''),
      amount: emptyNum(row['amount']),
    })),
    emptyNum,
  );
}
