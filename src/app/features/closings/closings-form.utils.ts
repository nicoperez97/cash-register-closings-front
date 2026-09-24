import { formatMoney } from '../../shared/utils/money';

export function toDateInput(value?: string | null): Date {
  if (!value) return new Date();
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function toDateString(value: Date | null | string | undefined): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function closingMoney(value: number): string {
  return formatMoney(value, { spaced: true });
}

export function closingNum(v: unknown): number {
  const raw = String(v ?? '')
    .trim()
    .replace(/\s/g, '');
  if (raw === '') return 0;
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  let normalized = raw;
  if (hasComma && hasDot) {
    normalized =
      raw.lastIndexOf(',') > raw.lastIndexOf('.')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/,/g, '');
  } else if (hasComma) {
    normalized = raw.replace(',', '.');
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

/** Centavos, sin basura de float. */
export function roundMoney(v: unknown): number {
  return Math.round(closingNum(v) * 100) / 100;
}

/** Efectivo total = a retirar + lo que se deja en caja. */
export function cashSplitBalances(
  total: unknown,
  withdrawn: unknown,
  leftInRegister: unknown,
): boolean {
  const cash = roundMoney(total);
  if (cash <= 0) return true;
  return roundMoney(roundMoney(withdrawn) + roundMoney(leftInRegister)) === cash;
}

/** Vacío en el input si no hay monto (evita el 0 adelante en móvil). */
export function emptyNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const num = Number(v);
  if (!Number.isFinite(num) || num === 0) return null;
  return num;
}

/**
 * Como emptyNum, pero el 0 cuenta (ej. lo dejado en caja / apertura sugerida).
 * null/vacío → null; 0 → 0.
 */
export function moneyOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const num = Number(v);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, num);
}

export const EXPENSE_CATEGORY_OPTIONS = [
  { value: 'VEGETABLES', label: 'Verdulería' },
  { value: 'CHEESE', label: 'Quesería' },
  { value: 'MEAT', label: 'Carnicería' },
  { value: 'FISH', label: 'Pescadería' },
  { value: 'BAKERY', label: 'Panadería' },
  { value: 'DELI', label: 'Fiambrería' },
  { value: 'GROCERY', label: 'Almacén / secos' },
  { value: 'DAIRY', label: 'Lácteos' },
  { value: 'BEVERAGES', label: 'Bebidas' },
  { value: 'BAR', label: 'Cerveza y bar' },
  { value: 'COFFEE', label: 'Café' },
  { value: 'RAW_MATERIALS', label: 'Materia prima' },
  { value: 'DRINKS', label: 'Bebidas (genérico)' },
  { value: 'DISPOSABLES', label: 'Descartables' },
  { value: 'CLEANING', label: 'Limpieza' },
  { value: 'SUPPLIES', label: 'Insumos cocina' },
  { value: 'SALARIES', label: 'Sueldos' },
  { value: 'COMMISSIONS', label: 'Comisiones' },
  { value: 'RENT', label: 'Alquiler' },
  { value: 'EQUIPMENT', label: 'Equipamiento' },
  { value: 'UTILITIES', label: 'Servicios (luz/gas)' },
  { value: 'SERVICES', label: 'Servicios' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'TRANSFER_SHOP', label: 'Transferencia locales' },
  { value: 'OTHER', label: 'Otros' },
];

export const POSNET_TYPE_OPTIONS = [
  { value: 'PVS', label: 'PVS' },
  { value: 'MERCADO_PAGO', label: 'Mercado Pago' },
  { value: 'CUENTA_DNI', label: 'Cuenta DNI' },
];

export const POSNET_TYPE_LABEL: Record<string, string> = {
  PVS: 'PVS',
  MERCADO_PAGO: 'Mercado Pago',
  CUENTA_DNI: 'Cuenta DNI',
};

export type PosnetType = 'PVS' | 'MERCADO_PAGO' | 'CUENTA_DNI';

/** Si el local pide motivo cuando |diferencia| llega al tope. 0 = no pedir. */
export function differenceReasonIsRequired(
  minAmount: number | null | undefined,
  difference: number | null | undefined,
): boolean {
  const min = Number(minAmount ?? 0);
  if (!(min > 0) || difference == null || !Number.isFinite(Number(difference))) return false;
  return Math.abs(Number(difference)) >= min;
}

export function formatSuggestedOpeningHint(s: {
  source?: 'previous' | 'default' | 'account' | string | null;
  accountName?: string | null;
  previousDate?: string | null;
  previousShiftName?: string | null;
}): string {
  if (s.source === 'account') {
    const name = String(s.accountName ?? '').trim();
    return name ? `Saldo de ${name}` : 'Saldo de efectivo en caja';
  }
  if (s.source !== 'previous') return 'Cambio por defecto del local';
  const raw = String(s.previousDate ?? '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const date = m ? `${Number(m[3])}/${Number(m[2])}` : raw || '—';
  const shift = String(s.previousShiftName ?? '').trim();
  return shift ? `Dejado en caja el ${date} · ${shift}` : `Dejado en caja el ${date}`;
}
