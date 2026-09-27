/** Visibilidad granular dentro de Reportes · Ventas POS. */

export type ReportsProductsAmountMode = 'none' | 'amount' | 'qty' | 'both';

export type ReportsProductsVisibilityFlag =
  | 'kpis'
  | 'charts'
  | 'tabProducts'
  | 'tabCategories'
  | 'tabDays'
  | 'export'
  | 'import';

export type ReportsProductsVisibility = Record<ReportsProductsVisibilityFlag, boolean> & {
  amountMode: ReportsProductsAmountMode;
};

export const REPORTS_PRODUCTS_VISIBILITY_FLAGS: Array<{
  key: ReportsProductsVisibilityFlag;
  label: string;
}> = [
  { key: 'kpis', label: 'KPIs' },
  { key: 'charts', label: 'Gráficos' },
  { key: 'tabProducts', label: 'Por plato' },
  { key: 'tabCategories', label: 'Por rubro' },
  { key: 'tabDays', label: 'Por día' },
  { key: 'export', label: 'Descargar' },
  { key: 'import', label: 'Importar' },
];

export const REPORTS_PRODUCTS_AMOUNT_MODE_OPTIONS: Array<{
  value: ReportsProductsAmountMode;
  label: string;
}> = [
  { value: 'both', label: 'Ambos' },
  { value: 'amount', label: 'Importe' },
  { value: 'qty', label: 'Cantidad' },
  { value: 'none', label: 'Ninguno' },
];

export function defaultReportsProductsVisibility(): ReportsProductsVisibility {
  return {
    kpis: true,
    charts: true,
    tabProducts: true,
    tabCategories: true,
    tabDays: true,
    export: true,
    import: true,
    amountMode: 'both',
  };
}

function coerceBool(raw: unknown, fallback: boolean): boolean {
  if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
  return fallback;
}

function coerceAmountMode(raw: unknown): ReportsProductsAmountMode {
  if (raw === 'none' || raw === 'amount' || raw === 'qty' || raw === 'both') return raw;
  if (raw === 'price' || raw === 'importe') return 'amount';
  if (raw === 'units' || raw === 'cantidad') return 'qty';
  if (raw === 'all' || raw === 'ambos') return 'both';
  return 'both';
}

export function normalizeReportsProductsVisibility(
  raw?: Partial<ReportsProductsVisibility> | Record<string, unknown> | null,
): ReportsProductsVisibility {
  const base = defaultReportsProductsVisibility();
  if (!raw || typeof raw !== 'object') return base;
  for (const opt of REPORTS_PRODUCTS_VISIBILITY_FLAGS) {
    if (raw[opt.key] !== undefined) base[opt.key] = coerceBool(raw[opt.key], base[opt.key]);
  }
  if (raw.amountMode !== undefined) base.amountMode = coerceAmountMode(raw.amountMode);
  return base;
}

export function canSeeReportsProductsAmount(
  v: ReportsProductsVisibility | null | undefined,
): boolean {
  const mode = normalizeReportsProductsVisibility(v).amountMode;
  return mode === 'amount' || mode === 'both';
}

export function canSeeReportsProductsQty(
  v: ReportsProductsVisibility | null | undefined,
): boolean {
  const mode = normalizeReportsProductsVisibility(v).amountMode;
  return mode === 'qty' || mode === 'both';
}

export function hasAnyReportsProductsBlock(
  v: ReportsProductsVisibility | null | undefined,
): boolean {
  const n = normalizeReportsProductsVisibility(v);
  return (
    n.kpis ||
    n.charts ||
    n.tabProducts ||
    n.tabCategories ||
    n.tabDays ||
    n.export ||
    n.import
  );
}
