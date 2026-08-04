import { Movement } from '../../features/movements/movements-api.service';
import { ShopPayment } from '../../features/payments/payments-api.service';
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

  const shareText = [
    `Pago realizado — ${shopName}`,
    `Concepto: ${title}`,
    `${targetLabel}: ${target}`,
    `Cuenta: ${account}`,
    `Fecha: ${paidAt}`,
    `Monto: ${amount}`,
    payment.movementId ? 'Movimiento contable: creado' : '',
  ]
    .filter(Boolean)
    .join('\n');

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

export function paymentSharePayload(payment: ShopPayment, shopName: string): {
  title: string;
  text: string;
} {
  const data = paymentPaidDialogData(payment, shopName);
  return { title: data.shareTitle, text: data.shareText || data.shareTitle };
}

export function movementSharePayload(movement: Movement, shopName: string): {
  title: string;
  text: string;
} {
  const data = movementSavedDialogData(movement, shopName);
  return { title: data.shareTitle, text: data.shareText || data.shareTitle };
}
