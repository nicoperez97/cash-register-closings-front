import { FormArray, FormBuilder, FormGroup } from '@angular/forms';
import { newId } from '../../core/utils/id';
import { ClosingPosnetAmount } from './closings-api.service';
import { closingNum, emptyNum, type PosnetType } from './closings-form.utils';

export function buildPosnetAmountGroup(
  fb: FormBuilder,
  value: {
    posnetId: string;
    name: string;
    type: PosnetType | string;
    amount?: number | null;
  },
  opts?: { lockIdentity?: boolean },
) {
  const group = fb.group({
    posnetId: [value.posnetId || newId()],
    name: [value.name || ''],
    type: [value.type || 'PVS'],
    amount: [emptyNum(value.amount)],
  });
  if (opts?.lockIdentity) {
    group.controls.name.disable({ emitEvent: false });
    group.controls.type.disable({ emitEvent: false });
  }
  return group;
}

export function buildDniTransferGroup(
  fb: FormBuilder,
  value: { id: string; label: string; amount?: number | null },
) {
  return fb.group({
    id: [value.id || newId()],
    label: [value.label || ''],
    amount: [emptyNum(value.amount)],
  });
}

export function syncDerivedTotals(
  form: FormGroup,
  posnetAmounts: FormArray,
  dniTransfers: FormArray,
): void {
  const posnets = posnetAmounts.getRawValue() as ClosingPosnetAmount[];
  const transfers = dniTransfers.getRawValue() as Array<{
    id: string;
    label: string;
    amount: number;
  }>;

  let card = 0;
  let mp = 0;
  let dniFromPosnets = 0;
  let hasPvs = false;
  let hasMp = false;
  let hasDniPosnet = false;

  for (const row of posnets) {
    const amount = closingNum(row.amount);
    if (row.type === 'PVS') {
      hasPvs = true;
      card += amount;
    } else if (row.type === 'MERCADO_PAGO') {
      hasMp = true;
      mp += amount;
    } else if (row.type === 'CUENTA_DNI') {
      hasDniPosnet = true;
      dniFromPosnets += amount;
    }
  }

  const dniFromTransfers = transfers.reduce((acc, t) => acc + closingNum(t.amount), 0);
  const hasTransfers = transfers.length > 0;
  const patch: Record<string, number | null> = {};
  if (hasPvs) patch['cardAmount'] = emptyNum(card);
  if (hasMp) patch['mercadoPagoAmount'] = emptyNum(mp);
  if (hasDniPosnet || hasTransfers) {
    patch['accountDniAmount'] = emptyNum(dniFromPosnets + dniFromTransfers);
  }
  if (Object.keys(patch).length) {
    form.patchValue(patch, { emitEvent: true });
  }
}
