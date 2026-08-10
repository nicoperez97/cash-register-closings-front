import { Movement } from '../../features/movements/movements-api.service';
import { ShopPayment } from '../../features/payments/payments-api.service';
import { CashClosing } from '../../features/closings/closings-api.service';
import { closingStatusLabel } from '../../core/i18n/labels';
import { formatDateAr, formatMoneyAr } from '../utils/share-text';
import { RecordSavedDialogData } from './record-saved-dialog';

export function movementSavedDialogData(
  movement: Movement,
  shopName: string,
): RecordSavedDialogData {
  const date = formatDateAr(movement.businessDate);
  const amount = formatMoneyAr(movement.amountUyu);
  const from = String(movement.fromAccountName || movement.fromUserName || '—');
  const to = String(movement.toAccountName || movement.toUserName || '—');
  const concept = String(movement.conceptName || '—');
  const description = String(movement.description || '—');

  const fields = [
    { label: 'Local', value: shopName },
    { label: 'Fecha', value: date },
    { label: 'Origen', value: from },
    { label: 'Destino', value: to },
    { label: 'Concepto', value: concept },
    { label: 'Descripción', value: description },
    { label: 'Monto', value: amount, emphasize: true },
  ];

  const shareText = [
    `Movimiento — ${shopName}`,
    `Fecha: ${date}`,
    `Origen: ${from}`,
    `Destino: ${to}`,
    `Concepto: ${concept}`,
    `Descripción: ${description}`,
    `Monto: ${amount}`,
  ].join('\n');

  return {
    title: 'Movimiento guardado',
    subtitle: 'Quedó registrado. Podés compartirlo o cerrar.',
    shareTitle: `Movimiento · ${shopName}`,
    fields,
    shareText,
  };
}

export function paymentPaidDialogData(
  payment: ShopPayment,
  shopName: string,
): RecordSavedDialogData {
  const amount = formatMoneyAr(payment.amount);
  const paidAt = formatDateAr(payment.paidAt);
  const target = payment.supplierName || payment.employeeName || '—';
  const targetLabel = payment.supplierId ? 'Proveedor' : 'Empleado';
  const account = payment.accountName || '—';
  const title = payment.title?.trim() || 'Sin concepto';

  const fields = [
    { label: 'Local', value: shopName },
    { label: 'Concepto', value: title },
    { label: targetLabel, value: target },
    { label: 'Cuenta', value: account },
    { label: 'Fecha de pago', value: paidAt },
    { label: 'Monto', value: amount, emphasize: true },
  ];

  if (payment.movementId) {
    fields.splice(5, 0, {
      label: 'Movimiento',
      value: 'Creado automáticamente',
    });
  }

  const shareText = buildPaymentShareLines(payment, shopName).join('\n');

  return {
    title: 'Pago registrado',
    subtitle: payment.movementId
      ? 'Se marcó como pagado y se creó el movimiento contable.'
      : 'Se marcó como pagado.',
    shareTitle: `Pago · ${shopName}`,
    fields,
    shareText,
  };
}

const PAYMENT_STATUS_SHARE_LABEL: Record<string, string> = {
  PENDING_VALIDATION: 'Pendiente de validar',
  VALIDATED: 'Validado · por pagar',
  REJECTED: 'Rechazado',
  PAID: 'Pagado',
  CANCELLED: 'Cancelado',
};

/** Texto completo para compartir un pago (datos + enlace opcional). */
export function buildPaymentShareLines(
  payment: ShopPayment,
  shopName: string,
  link?: string | null,
): string[] {
  const title = payment.title?.trim() || 'Sin concepto';
  const amount = formatMoneyAr(payment.amount);
  const target = payment.supplierName || payment.employeeName || '—';
  const targetLabel = payment.supplierId ? 'Proveedor' : 'Empleado';
  const lines = [
    `Pago — ${shopName}`,
    `Concepto: ${title}`,
    `Estado: ${PAYMENT_STATUS_SHARE_LABEL[payment.status] ?? payment.status}`,
    `Monto: ${amount}`,
    `${targetLabel}: ${target}`,
  ];

  if (payment.supplierBankAlias?.trim()) {
    lines.push(`Alias / CBU: ${payment.supplierBankAlias.trim()}`);
  }
  if (payment.payerName?.trim()) {
    lines.push(`Paga: ${payment.payerName.trim()}`);
  }
  if (payment.validatorName?.trim()) {
    lines.push(`Valida: ${payment.validatorName.trim()}`);
  }
  if (payment.accountName?.trim()) {
    lines.push(`Cuenta que paga: ${payment.accountName.trim()}`);
  }
  if (payment.dueDate) {
    lines.push(`Vencimiento: ${formatDateAr(payment.dueDate)}`);
  }
  if (payment.paidAt) {
    lines.push(`Pagado: ${formatDateAr(payment.paidAt)}`);
  }
  if (payment.notes?.trim()) {
    lines.push(`Notas: ${payment.notes.trim()}`);
  }
  if (payment.invoiceLegalName?.trim() || payment.invoiceNumber?.trim()) {
    const inv = [
      payment.invoiceType?.trim(),
      payment.invoiceNumber?.trim(),
      payment.invoiceLegalName?.trim(),
    ]
      .filter(Boolean)
      .join(' · ');
    if (inv) lines.push(`Factura: ${inv}`);
  }
  if (payment.supplierTaxId?.trim() || payment.invoiceTaxId?.trim()) {
    lines.push(`CUIT/CUIL: ${(payment.invoiceTaxId || payment.supplierTaxId || '').trim()}`);
  }

  const url = String(link || '').trim();
  if (url) {
    lines.push('', `Abrir pago: ${url}`);
  }

  return lines;
}

export function paymentSharePayload(
  payment: ShopPayment,
  shopName: string,
  opts?: { link?: string | null },
): {
  title: string;
  text: string;
} {
  return {
    title: `Pago · ${shopName}`,
    text: buildPaymentShareLines(payment, shopName, opts?.link).join('\n'),
  };
}

/** URL directa al pago en la app (mismo origen). */
export function paymentDeepLink(payment: ShopPayment): string {
  if (typeof window === 'undefined' || !window.location?.origin) {
    const kind = payment.supplierId ? 'suppliers' : 'employees';
    return `/payments/${kind}?payment=${encodeURIComponent(payment.id)}`;
  }
  const kind = payment.supplierId ? 'suppliers' : 'employees';
  const url = new URL(`/payments/${kind}`, window.location.origin);
  url.searchParams.set('payment', payment.id);
  if (payment.shopId) url.searchParams.set('shop', payment.shopId);
  return url.toString();
}

export function movementSharePayload(movement: Movement, shopName: string): {
  title: string;
  text: string;
} {
  const data = movementSavedDialogData(movement, shopName);
  return { title: data.shareTitle, text: data.shareText || data.shareTitle };
}

export function closingSharePayload(
  closing: CashClosing,
  shopName: string,
  opts?: { unitsLabel?: string | null },
): { title: string; text: string } {
  const date = formatDateAr(closing.businessDate);
  const lines = [`Cierre de caja — ${shopName}`, `Fecha: ${date}`];

  if (closing.status) {
    lines.push(`Estado: ${closingStatusLabel(closing.status)}`);
  }

  // Resumen principal: siempre. El resto solo si tiene valor.
  pushMoneyLine(lines, 'PVS', closing.cardAmount, true);
  pushMoneyLine(lines, 'Mercado Pago', closing.mercadoPagoAmount);
  pushMoneyLine(lines, 'Efectivo', closing.cashAmount, true);
  pushMoneyLine(lines, 'Cuenta DNI', closing.accountDniAmount, true);
  pushMoneyLine(lines, 'Delivery', closing.deliveryAppsAmount);
  pushMoneyLine(lines, 'Transferencia', closing.transferAmount);
  pushMoneyLine(lines, 'Otros', closing.otherAmount);
  pushMoneyLine(lines, 'Propinas', closing.tipsAmount);
  pushMoneyLine(lines, 'Caja sistema', closing.posSystemAmount, true);
  pushMoneyLine(lines, 'Total declarado', closing.declaredTotal, true);
  pushMoneyLine(lines, 'Diferencia', closing.difference, true);

  const posnets = (closing.posnetAmounts ?? []).filter((p) => Number(p.amount || 0) !== 0);
  if (posnets.length) {
    lines.push('Posnets:');
    for (const p of posnets) {
      const name = String(p.name || '').trim() || 'Posnet';
      lines.push(`· ${name}: ${formatMoneyAr(p.amount)}`);
    }
  }

  const expenses = (closing.expenses ?? []).filter((e) => Number(e.amount || 0) !== 0);
  if (expenses.length) {
    lines.push('Egresos:');
    for (const e of expenses) {
      const label = String(e.label || '').trim() || 'Egreso';
      lines.push(`· ${label}: ${formatMoneyAr(e.amount)}`);
    }
  }

  if (closing.coversCount != null && Number(closing.coversCount) > 0) {
    lines.push(`Cubiertos: ${Number(closing.coversCount)}`);
  }
  pushMoneyLine(lines, 'Cambio en caja', closing.cashLeftInRegister);
  pushMoneyLine(lines, 'Efectivo retirado', closing.cashWithdrawn);

  appendClosingUnitsAndCarrier(lines, {
    unitsLabel: opts?.unitsLabel,
    unitsSold: closing.unitsSold,
    cashWithdrawnByName: closing.cashWithdrawnByName,
  });

  if (closing.differenceReason?.trim()) {
    lines.push(`Motivo diferencia: ${closing.differenceReason.trim()}`);
  }
  if (closing.notes?.trim()) {
    lines.push(`Notas: ${closing.notes.trim()}`);
  }

  return {
    title: `Cierre · ${shopName}`,
    text: lines.join('\n'),
  };
}

/** Agrega una línea de monto solo si tiene valor (o si `always`). */
function pushMoneyLine(
  lines: string[],
  label: string,
  value: number | null | undefined,
  always = false,
): void {
  const amount = Number(value || 0);
  if (!always && amount === 0) return;
  lines.push(`${label}: ${formatMoneyAr(amount)}`);
}

/** Unidades del local (ej. paninos) y quién se lleva el efectivo. */
export function appendClosingUnitsAndCarrier(
  lines: string[],
  opts: {
    unitsLabel?: string | null;
    unitsSold?: number | null;
    cashWithdrawnByName?: string | null;
  },
): void {
  const label = opts.unitsLabel?.trim();
  if (label && opts.unitsSold != null) {
    const qty = Number(opts.unitsSold);
    if (!Number.isNaN(qty)) {
      lines.push(`${label}: ${qty}`);
    }
  }
  const who = opts.cashWithdrawnByName?.trim();
  if (who) {
    lines.push(`Quién se lo lleva: ${who}`);
  }
}
