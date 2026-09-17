/** Atajo de descuento en ticket (comanda) y caja rápida (POS). */
export type DiscountPreset = {
  id: string;
  label: string;
  mode: 'percent' | 'fixed';
  value: number;
};

export const DEFAULT_DISCOUNT_PRESETS: DiscountPreset[] = [
  { id: 'dp_10pct', label: '10%', mode: 'percent', value: 10 },
];

/** Si la API no manda lista, usamos el default con 10%. */
export function resolveDiscountPresets(raw: unknown): DiscountPreset[] {
  if (raw === undefined || raw === null) {
    return DEFAULT_DISCOUNT_PRESETS.map((p) => ({ ...p }));
  }
  if (!Array.isArray(raw)) {
    return DEFAULT_DISCOUNT_PRESETS.map((p) => ({ ...p }));
  }
  if (raw.length === 0) return [];
  const out: DiscountPreset[] = [];
  for (const row of raw.slice(0, 12)) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Partial<DiscountPreset>;
    const mode = r.mode === 'fixed' ? 'fixed' : r.mode === 'percent' ? 'percent' : null;
    if (!mode) continue;
    let value = Number(r.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (mode === 'percent') value = Math.min(100, value);
    const label =
      String(r.label ?? '').trim().slice(0, 24) ||
      (mode === 'percent' ? `${value}%` : `$${value}`);
    const id = String(r.id ?? '').trim() || `dp_${out.length}`;
    out.push({ id, label, mode, value });
  }
  return out;
}
