import { environment } from '../../../environments/environment';
import { normalizeLogoUrl, resolveShopLogoSrc } from '../../core/utils/drive-url';
import { formatMoney } from '../../shared/utils/money';
import {
  CustomerOrderFulfillment,
  CustomerOrderPaymentMethod,
  CustomerOrderStatus,
} from './customer-orders-api.service';

export { apiErrorMessage } from '../../core/http/api-error-message';

export function orderingLogoUrl(
  logoUrl?: string | null,
  shopId?: string | null,
): string | null {
  return resolveShopLogoSrc(logoUrl, shopId) || normalizeLogoUrl(logoUrl) || logoUrl?.trim() || null;
}

/** URL de foto de ítem del pedido online. */
export function orderingItemImageUrl(
  slug: string,
  item: { id?: string; imageUrl?: string | null; images?: Array<{ id?: string; url?: string }> },
): string | null {
  const urls = orderingItemImageUrls(slug, item);
  return urls[0] ?? null;
}

/** URLs de todas las fotos del ítem (ordenadas). */
export function orderingItemImageUrls(
  slug: string,
  item: { id?: string; imageUrl?: string | null; images?: Array<{ id?: string; url?: string }> },
): string[] {
  const id = String(item?.id ?? '').trim();
  const out: string[] = [];
  const push = (raw: string, imageId?: string) => {
    const value = String(raw ?? '').trim();
    if (!value) return;
    let url = value;
    if (/^https?:\/\//i.test(value)) url = value;
    else if (value.startsWith('/')) url = `${environment.apiUrl}${value}`;
    else if (slug && id && imageId) {
      url = `${environment.apiUrl}/public/shops/${encodeURIComponent(slug)}/menu-items/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`;
    } else if (slug && id) {
      url = `${environment.apiUrl}/public/shops/${encodeURIComponent(slug)}/menu-items/${encodeURIComponent(id)}/image`;
    } else return;
    if (!out.includes(url)) out.push(url);
  };
  for (const img of item?.images ?? []) {
    push(String(img?.url ?? ''), String(img?.id ?? '').trim() || undefined);
  }
  push(String(item?.imageUrl ?? ''));
  return out;
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

/** Rango ETA en minutos (landing /pedir). */
export type OrderingEtaRange = { min: number; max: number };

/** Acepta `{ min, max }`, número o texto legacy (`"20 - 30 min"`, `"10"`). */
export function parseOrderingEtaRange(raw: unknown): OrderingEtaRange | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    const n = Math.min(999, Math.max(1, Math.round(raw)));
    return { min: n, max: n };
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as { min?: unknown; max?: unknown };
    const min = Number(o.min);
    if (!Number.isFinite(min) || min <= 0) return null;
    const maxRaw = Number(o.max);
    const lo = Math.min(999, Math.max(1, Math.round(min)));
    const hi =
      Number.isFinite(maxRaw) && maxRaw > 0
        ? Math.min(999, Math.max(1, Math.round(maxRaw)))
        : lo;
    return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
  }
  if (typeof raw === 'string') {
    const nums =
      raw
        .trim()
        .match(/\d+/g)
        ?.map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0) ?? [];
    if (!nums.length) return null;
    const lo = Math.min(999, Math.max(1, Math.round(nums[0])));
    const hi = nums.length >= 2 ? Math.min(999, Math.max(1, Math.round(nums[1]))) : lo;
    return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
  }
  return null;
}

export function formatOrderingEtaRange(r: OrderingEtaRange | null | undefined): string | null {
  if (!r) return null;
  if (r.min === r.max) return `${r.min} min`;
  return `${r.min} - ${r.max} min`;
}

/** Texto del chip en la landing (Take away / Delivery + rango). */
export function formatOrderingEtaChip(
  channel: 'takeaway' | 'delivery',
  raw: unknown,
): string | null {
  const range = parseOrderingEtaRange(raw);
  const mins = formatOrderingEtaRange(range);
  if (!mins) return null;
  return channel === 'delivery' ? `Delivery ${mins}` : `Take away ${mins}`;
}

export function paymentLabel(p: CustomerOrderPaymentMethod): string {
  if (p === 'TRANSFER') return 'Transferencia';
  if (p === 'CARD') return 'Tarjeta';
  return 'Efectivo';
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
  /** Cuenta ledger enlazada (precios por cuenta en mostrador / comanda). */
  accountId?: string | null;
  /** Canales donde aplica (solo web pública). Ausente = ambos. */
  fulfillments?: Array<'TAKEAWAY' | 'DELIVERY'>;
  /** Si true, pide “con cuánto abona”. Ausente = heurística legacy. */
  askCashTender?: boolean;
};

/** Heurística legacy cuando el medio aún no tiene askCashTender guardado. */
export function inferAskCashTender(
  id: string,
  name: string,
  kind?: 'CASH' | 'TRANSFER' | 'CARD' | null,
): boolean {
  const resolved =
    kind === 'CASH' || kind === 'TRANSFER' || kind === 'CARD'
      ? kind
      : classifyOrderingPayKind(id, name);
  if (resolved !== 'CASH') return false;
  return /efectivo|cash|contado|op_cash|tp_cash|cp_cash/.test(`${id} ${name}`.toLowerCase());
}

export function resolveAskCashTender(opts: {
  id: string;
  name: string;
  kind?: 'CASH' | 'TRANSFER' | 'CARD' | null;
  askCashTender?: boolean | null;
}): boolean {
  if (typeof opts.askCashTender === 'boolean') return opts.askCashTender;
  return inferAskCashTender(opts.id, opts.name, opts.kind);
}

const DEFAULT_PAY_FULFILLMENTS: Array<'TAKEAWAY' | 'DELIVERY'> = ['TAKEAWAY', 'DELIVERY'];

function normalizePayFulfillments(raw: unknown): Array<'TAKEAWAY' | 'DELIVERY'> {
  if (!Array.isArray(raw)) return [...DEFAULT_PAY_FULFILLMENTS];
  const out: Array<'TAKEAWAY' | 'DELIVERY'> = [];
  for (const v of raw) {
    if (v === 'TAKEAWAY' || v === 'DELIVERY') out.push(v);
  }
  return out.length ? out : [...DEFAULT_PAY_FULFILLMENTS];
}

/** Medios activos para elegir en checkout / mostrador. */
export function orderingPayChoices(
  payments:
    | {
        methods?: CustomerOrderPaymentMethod[] | null;
        items?: Array<{
          id?: string;
          name?: string;
          accountId?: string | null;
          active?: boolean;
          kind?: 'CASH' | 'TRANSFER' | 'CARD' | null;
          fulfillments?: Array<'TAKEAWAY' | 'DELIVERY'> | null;
          askCashTender?: boolean | null;
        }> | null;
      }
    | null
    | undefined,
  opts?: { fulfillment?: 'TAKEAWAY' | 'DELIVERY' | '' | null },
): OrderingPayChoice[] {
  const fulfillment = opts?.fulfillment || null;
  const items = (payments?.items ?? []).filter(
    (i) => i && i.active !== false && String(i.name ?? '').trim(),
  );
  if (items.length) {
    const choices: OrderingPayChoice[] = items.map((i) => {
      const id = String(i.id ?? '').trim() || `op_${String(i.name).trim().toLowerCase()}`;
      const name = String(i.name ?? '').trim();
      const accountId = String(i.accountId ?? '').trim() || null;
      const kindRaw = String(i.kind ?? '').trim().toUpperCase();
      const kind: OrderingPayChoice['kind'] =
        kindRaw === 'CASH' || kindRaw === 'TRANSFER' || kindRaw === 'CARD'
          ? kindRaw
          : classifyOrderingPayKind(id, name);
      return {
        id,
        name,
        kind,
        accountId,
        fulfillments: normalizePayFulfillments(i.fulfillments),
        askCashTender: resolveAskCashTender({
          id,
          name,
          kind,
          askCashTender: i.askCashTender,
        }),
      };
    });
    if (!fulfillment) return choices;
    return choices.filter((c) =>
      (c.fulfillments ?? DEFAULT_PAY_FULFILLMENTS).includes(fulfillment),
    );
  }
  const methods = payments?.methods?.length
    ? payments.methods
    : (['CASH', 'TRANSFER'] as CustomerOrderPaymentMethod[]);
  return methods.map((m) => ({
    id: m === 'TRANSFER' ? 'op_transfer' : 'op_cash',
    name: paymentLabel(m),
    kind: (m === 'TRANSFER' ? 'TRANSFER' : 'CASH') as OrderingPayChoice['kind'],
    accountId: null,
    fulfillments: [...DEFAULT_PAY_FULFILLMENTS],
    askCashTender: m !== 'TRANSFER',
  }));
}

/** Pedir “con cuánto abona” según config del medio (o heurística legacy). */
export function orderingPayNeedsCashTender(choice: OrderingPayChoice | null | undefined): boolean {
  if (!choice) return false;
  return resolveAskCashTender(choice);
}

/** Enum CASH|TRANSFER|CARD que acepta el API al crear el pedido. */
export function orderingPayToApiMethod(choice: OrderingPayChoice): CustomerOrderPaymentMethod {
  if (choice.kind === 'TRANSFER') return 'TRANSFER';
  if (choice.kind === 'CARD') return 'CARD';
  return 'CASH';
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

/** Red caída, timeout o 5xx: se puede reintentar / encolar. */
export function isRetryableOrderError(err: unknown): boolean {
  const status = Number((err as { status?: number })?.status ?? 0);
  if (!Number.isFinite(status) || status === 0) return true;
  return status === 408 || status === 429 || status >= 500;
}
