import { environment } from '../../../environments/environment';
import { normalizeLogoUrl, resolveShopLogoSrc } from '../../core/utils/drive-url';
import { formatMoney } from '../../shared/utils/money';
import {
  CustomerOrderFulfillment,
  CustomerOrderPaymentMethod,
  CustomerOrderStatus,
} from './customer-orders-api.service';

export function orderingLogoUrl(
  logoUrl?: string | null,
  shopId?: string | null,
): string | null {
  return resolveShopLogoSrc(logoUrl, shopId) || normalizeLogoUrl(logoUrl) || logoUrl?.trim() || null;
}

/** URL de foto de ítem del pedido online. */
export function orderingItemImageUrl(
  slug: string,
  item: { id?: string; imageUrl?: string | null },
): string | null {
  const id = String(item?.id ?? '').trim();
  const raw = String(item?.imageUrl ?? '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${environment.apiUrl}${raw}`;
  if (!slug || !id) return null;
  return `${environment.apiUrl}/public/shops/${encodeURIComponent(slug)}/menu-items/${encodeURIComponent(id)}/image`;
}

/** Hex #RGB / #RRGGBB → luminancia relativa 0–1 (sRGB). */
export function accentLuminance(raw: string | null | undefined): number {
  const hex = String(raw ?? '')
    .trim()
    .replace(/^#/, '');
  let r = 0;
  let g = 0;
  let b = 0;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    r = parseInt(hex.slice(0, 2), 16);
    g = parseInt(hex.slice(2, 4), 16);
    b = parseInt(hex.slice(4, 6), 16);
  } else {
    return 0.35;
  }
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Texto sobre el botón de accent (blanco si el brand es oscuro). */
export function onAccentColor(accent: string | null | undefined): string {
  return accentLuminance(accent) > 0.48 ? '#0b1c33' : '#ffffff';
}

export function orderingMoney(value: number | string | null | undefined): string {
  return formatMoney(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function statusLabel(status: CustomerOrderStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Pendiente';
    case 'ACCEPTED':
      return 'Aceptado';
    case 'PREPARING':
      return 'En preparación';
    case 'READY':
      return 'Listo';
    case 'OUT_FOR_DELIVERY':
      return 'En camino';
    case 'COMPLETED':
      return 'Completado';
    case 'CANCELLED':
      return 'Cancelado';
    default:
      return status;
  }
}

export function fulfillmentLabel(f: CustomerOrderFulfillment): string {
  if (f === 'DELIVERY') return 'Delivery';
  if (f === 'COUNTER') return 'Mostrador';
  if (f === 'TABLE') return 'Mesa';
  return 'Retiro';
}

export function paymentLabel(p: CustomerOrderPaymentMethod): string {
  return p === 'TRANSFER' ? 'Transferencia' : 'Efectivo';
}

/** Misma lógica que el API: clasifica un medio por id/nombre. */
export function classifyOrderingPayKind(
  id: string,
  name: string,
): 'CASH' | 'TRANSFER' | 'CARD' {
  const key = `${id} ${name}`.toLowerCase();
  if (/transf|transfer|alias|cbu|cvu|mercado\s*pago|\bmp\b/.test(key)) return 'TRANSFER';
  if (/tarjeta|card|d[eé]bito|cr[eé]dito|posnet|visa|master|amex|\bpvs\b/.test(key)) {
    return 'CARD';
  }
  if (/efectivo|cash|contado|tp_cash|op_cash/.test(key)) return 'CASH';
  return 'CASH';
}

export type OrderingPayChoice = {
  id: string;
  name: string;
  kind: 'CASH' | 'TRANSFER' | 'CARD';
};

/** Medios activos para elegir en checkout / mostrador. */
export function orderingPayChoices(
  payments:
    | {
        methods?: CustomerOrderPaymentMethod[] | null;
        items?: Array<{ id?: string; name?: string; active?: boolean }> | null;
      }
    | null
    | undefined,
): OrderingPayChoice[] {
  const items = (payments?.items ?? []).filter((i) => i && i.active !== false && String(i.name ?? '').trim());
  if (items.length) {
    return items.map((i) => {
      const id = String(i.id ?? '').trim() || `op_${String(i.name).trim().toLowerCase()}`;
      const name = String(i.name ?? '').trim();
      return { id, name, kind: classifyOrderingPayKind(id, name) };
    });
  }
  const methods = payments?.methods?.length ? payments.methods : (['CASH', 'TRANSFER'] as CustomerOrderPaymentMethod[]);
  return methods.map((m) => ({
    id: m === 'TRANSFER' ? 'op_transfer' : 'op_cash',
    name: paymentLabel(m),
    kind: m === 'TRANSFER' ? ('TRANSFER' as const) : ('CASH' as const),
  }));
}

/** Pedir “con cuánto abona” solo en efectivo real. */
export function orderingPayNeedsCashTender(choice: OrderingPayChoice | null | undefined): boolean {
  if (!choice || choice.kind !== 'CASH') return false;
  return /efectivo|cash|contado|op_cash|tp_cash/.test(`${choice.id} ${choice.name}`.toLowerCase());
}

/** Enum CASH|TRANSFER que acepta el API al crear el pedido. */
export function orderingPayToApiMethod(choice: OrderingPayChoice): CustomerOrderPaymentMethod {
  return choice.kind === 'TRANSFER' ? 'TRANSFER' : 'CASH';
}

/** Línea de pedido (ítem o extra) para agrupar en UI / texto. */
export type OrderLineLike = {
  menuItemId?: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  notes?: string | null;
  removedIngredients?: string[];
  kind?: string | null;
  extraId?: string | null;
  attachedToMenuItemId?: string | null;
};

export type OrderLineGroup = {
  item: OrderLineLike | null;
  extras: OrderLineLike[];
};

/** Agrupa extras debajo del ítem al que están adheridos. */
export function groupOrderLines(
  items: Array<Partial<OrderLineLike> & Pick<OrderLineLike, 'name' | 'qty'>> | null | undefined,
): OrderLineGroup[] {
  const lines: OrderLineLike[] = (items ?? []).map((l) => ({
    menuItemId: l.menuItemId ?? null,
    name: String(l.name ?? ''),
    qty: Number(l.qty) || 0,
    unitPrice: Number(l.unitPrice) || 0,
    notes: l.notes ?? null,
    removedIngredients: l.removedIngredients,
    kind: l.kind ?? null,
    extraId: l.extraId ?? null,
    attachedToMenuItemId: l.attachedToMenuItemId ?? null,
  }));
  const mains = lines.filter((l) => String(l.kind || 'ITEM').toUpperCase() !== 'EXTRA');
  const extras = lines.filter((l) => String(l.kind || '').toUpperCase() === 'EXTRA');
  const used = new Set<number>();
  const groups: OrderLineGroup[] = [];
  for (const item of mains) {
    const groupExtras: OrderLineLike[] = [];
    extras.forEach((ex, i) => {
      if (used.has(i)) return;
      const parent = String(ex.attachedToMenuItemId || '').trim();
      const id = String(item.menuItemId || '').trim();
      if (!parent || !id || parent !== id) return;
      used.add(i);
      groupExtras.push(ex);
    });
    groups.push({ item, extras: groupExtras });
  }
  extras.forEach((ex, i) => {
    if (used.has(i)) return;
    groups.push({ item: null, extras: [ex] });
  });
  return groups;
}

/** Texto compacto: `1× Plato (+ chips), 1× Otro`. */
export function formatOrderLinesInline(
  items: Array<Partial<OrderLineLike> & Pick<OrderLineLike, 'name' | 'qty'>> | null | undefined,
): string {
  return groupOrderLines(items)
    .map((g) => {
      if (!g.item) {
        return g.extras.map((e) => `${e.qty}× ${e.name}`).join(', ');
      }
      const base = `${g.item.qty}× ${g.item.name}`;
      if (!g.extras.length) return base;
      const ex = g.extras.map((e) => `+ ${e.name}`).join(', ');
      return `${base} (${ex})`;
    })
    .filter(Boolean)
    .join(', ');
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { error?: { message?: string | string[] }; message?: string };
  const msg = e?.error?.message ?? e?.message;
  if (Array.isArray(msg) && msg.length) return String(msg[0]);
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  return fallback;
}

/** Red caída, timeout o 5xx: se puede reintentar / encolar. */
export function isRetryableOrderError(err: unknown): boolean {
  const status = Number((err as { status?: number })?.status ?? 0);
  if (!Number.isFinite(status) || status === 0) return true;
  return status === 408 || status === 429 || status >= 500;
}
