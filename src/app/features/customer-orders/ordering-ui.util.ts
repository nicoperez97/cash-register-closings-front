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

export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { error?: { message?: string | string[] }; message?: string };
  const msg = e?.error?.message ?? e?.message;
  if (Array.isArray(msg) && msg.length) return String(msg[0]);
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  return fallback;
}
