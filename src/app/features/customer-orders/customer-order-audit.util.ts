import { formatMoney } from '../../shared/utils/money';
import type { CustomerOrderAudit } from './customer-orders-api.service';

/** Texto legible de un cambio de pedido (detalle y monitor). */
export function formatCustomerOrderAuditLabel(a: CustomerOrderAudit): string {
  const name = a.itemName ? String(a.itemName) : '';
  const money = (n: number) => formatMoney(n);
  switch (a.action) {
    case 'ADD':
      return `Agregó ${a.qtyAfter ?? 1}× ${name} (${money(a.unitPriceAfter ?? 0)})`;
    case 'REMOVE':
      return `Quitó ${a.qtyBefore ?? 1}× ${name}`;
    case 'QTY':
      return `${name}: cantidad ${a.qtyBefore ?? '—'} → ${a.qtyAfter ?? '—'}`;
    case 'PRICE':
      return `${name}: precio ${money(a.unitPriceBefore ?? 0)} → ${money(a.unitPriceAfter ?? 0)}`;
    case 'EDIT':
      return `${name}: ${a.qtyBefore ?? '—'}× ${money(a.unitPriceBefore ?? 0)} → ${a.qtyAfter ?? '—'}× ${money(a.unitPriceAfter ?? 0)}`;
    case 'DISCOUNT': {
      const before =
        (a.discountBefore ?? 0) > 0
          ? `${a.discountLabelBefore ? a.discountLabelBefore + ' ' : ''}−${money(a.discountBefore ?? 0)}`
          : 'sin descuento';
      const after =
        (a.discountAfter ?? 0) > 0
          ? `${a.discountLabelAfter ? a.discountLabelAfter + ' ' : ''}−${money(a.discountAfter ?? 0)}`
          : 'sin descuento';
      return `Descuento: ${before} → ${after}`;
    }
    default:
      return name || a.action;
  }
}
