/** Parsea montos en formato AR (coma decimal) o EN (punto). */
export function parseLocaleNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/\$/g, '');
  if (!raw) return 0;
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
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}
