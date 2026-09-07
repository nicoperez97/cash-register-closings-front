/** Parsea montos en formato AR (coma decimal) o EN (punto). Soporta sufijo M (1,5M → 1500000). */
export function parseLocaleNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let raw = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/\$/g, '');
  if (!raw) return 0;
  const millionSuffix = /m$/i.test(raw);
  if (millionSuffix) raw = raw.replace(/m$/i, '');
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  let normalized = raw;
  if (hasComma && hasDot) {
    if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = raw.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = raw.replace(',', '.');
  }
  let num = Number(normalized);
  if (!Number.isFinite(num)) return 0;
  if (millionSuffix) num *= 1_000_000;
  return num;
}

const MILLION = 1_000_000;

export type FormatNumberOptions = {
  /**
   * Si abs(valor) >= 1.000.000 → compacto con M (1M, 1,5M, 12,3M).
   * Default true.
   */
  compact?: boolean;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

/**
 * Número con miles en "." (es-AR).
 * Millones: 1.000.000 → 1M · 1.500.000 → 1,5M.
 */
export function formatNumber(
  value: number | string | null | undefined,
  opts: FormatNumberOptions = {},
): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';

  const compact = opts.compact !== false;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';

  if (compact && abs >= MILLION) {
    const millions = abs / MILLION;
    const rounded = Math.round(millions * 100) / 100;
    const isInt = Math.abs(rounded - Math.round(rounded)) < 0.001;
    const body = rounded.toLocaleString('es-AR', {
      minimumFractionDigits: isInt ? 0 : 1,
      maximumFractionDigits: isInt ? 0 : 2,
    });
    return `${sign}${body}M`;
  }

  const min = opts.minimumFractionDigits ?? 0;
  const max = opts.maximumFractionDigits ?? 2;
  return `${sign}${abs.toLocaleString('es-AR', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })}`;
}

export type FormatMoneyOptions = FormatNumberOptions & {
  /** Prefijo $. Default true. */
  currency?: boolean;
  /** Espacio tras $. Default false → $10.000 / $1M */
  spaced?: boolean;
};

/**
 * Monto para UI: miles con "." y millones con M.
 * Ej: 10000 → $10.000,00 · 1000000 → $1M · 1500000 → $1,5M
 */
export function formatMoney(
  value: number | string | null | undefined,
  opts: FormatMoneyOptions = {},
): string {
  const currency = opts.currency !== false;
  const spaced = !!opts.spaced;
  const body = formatNumber(value, {
    compact: opts.compact,
    minimumFractionDigits: opts.minimumFractionDigits ?? 2,
    maximumFractionDigits: opts.maximumFractionDigits ?? 2,
  });
  if (!currency) return body;
  if (body === '—') return spaced ? '$ —' : '$—';
  const mark = spaced ? '$ ' : '$';
  if (body.startsWith('-')) return `-${mark}${body.slice(1)}`;
  return `${mark}${body}`;
}
