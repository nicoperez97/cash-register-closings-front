/**
 * Visibilidad granular de Cierres, Conceptos, Ventas (carta) y Estadísticas,
 * como la de Ventas POS (shared/reports-products-visibility). La API guarda todo
 * en user_shops.reportsVisibility y además borra en el servidor lo que no se ve.
 */

export type ReportAmountMode = 'none' | 'amount' | 'qty' | 'both';
export type ReportKey = 'closings' | 'concepts' | 'sales' | 'stats';

type FlagDef = { key: string; label: string };

export type ReportVisibilityUi = {
  report: ReportKey;
  hint: string;
  flags: FlagDef[];
  amountMode: boolean;
};

/** Por clave de módulo (Usuarios → permisos). */
export const REPORT_VISIBILITY_UI: Record<string, ReportVisibilityUi> = {
  reports: {
    report: 'closings',
    hint: 'Qué ve en Reportes · Cierres. La descarga la define el nivel Excel.',
    flags: [
      { key: 'kpis', label: 'KPIs' },
      { key: 'detail', label: 'Detalle del período' },
      { key: 'expenses', label: 'Egresos por concepto' },
    ],
    amountMode: false,
  },
  reportsConcepts: {
    report: 'concepts',
    hint: 'Qué ve en Reportes · Conceptos.',
    flags: [
      { key: 'kpis', label: 'KPIs' },
      { key: 'charts', label: 'Gráficos' },
      { key: 'tabConcepts', label: 'Detalle por concepto' },
      { key: 'tabDays', label: 'Por día' },
      { key: 'export', label: 'Descargar' },
    ],
    amountMode: false,
  },
  reportsSales: {
    report: 'sales',
    hint: 'Qué ve en Reportes · Ventas.',
    flags: [
      { key: 'kpis', label: 'KPIs' },
      { key: 'charts', label: 'Gráficos' },
      { key: 'tabProducts', label: 'Por plato' },
      { key: 'tabCategories', label: 'Por rubro' },
      { key: 'tabDays', label: 'Por día' },
      { key: 'export', label: 'Descargar' },
    ],
    amountMode: true,
  },
  reportsStats: {
    report: 'stats',
    hint: 'Qué ve en Reportes · Estadísticas.',
    flags: [
      { key: 'kpis', label: 'KPIs' },
      { key: 'charts', label: 'Gráficos' },
      { key: 'tips', label: 'Propinas por empleado' },
      { key: 'daily', label: 'Detalle diario' },
    ],
    amountMode: false,
  },
};

export const REPORT_AMOUNT_MODE_OPTIONS: Array<{ value: ReportAmountMode; label: string }> = [
  { value: 'both', label: 'Ambos' },
  { value: 'amount', label: 'Importe' },
  { value: 'qty', label: 'Cantidad' },
  { value: 'none', label: 'Ninguno' },
];

export type ReportVisibility = Record<string, boolean> & { amountMode?: ReportAmountMode };
export type ReportsVisibility = Record<ReportKey, ReportVisibility>;

const UI_BY_REPORT = Object.fromEntries(
  Object.values(REPORT_VISIBILITY_UI).map((u) => [u.report, u]),
) as Record<ReportKey, ReportVisibilityUi>;

function coerceBool(raw: unknown, fallback: boolean): boolean {
  if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
  return fallback;
}

export function defaultReportVisibility(report: ReportKey): ReportVisibility {
  const ui = UI_BY_REPORT[report];
  const out: ReportVisibility = {};
  for (const f of ui.flags) out[f.key] = true;
  if (ui.amountMode) out.amountMode = 'both';
  return out;
}

export function normalizeReportVisibility(
  report: ReportKey,
  raw?: Record<string, unknown> | null,
): ReportVisibility {
  const base = defaultReportVisibility(report);
  if (!raw || typeof raw !== 'object') return base;
  for (const f of UI_BY_REPORT[report].flags) {
    if (raw[f.key] !== undefined) base[f.key] = coerceBool(raw[f.key], true);
  }
  const mode = raw['amountMode'];
  if (UI_BY_REPORT[report].amountMode && (mode === 'none' || mode === 'amount' || mode === 'qty' || mode === 'both')) {
    base.amountMode = mode;
  }
  return base;
}

export function normalizeReportsVisibility(raw?: Record<string, unknown> | null): ReportsVisibility {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    closings: normalizeReportVisibility('closings', src['closings'] as Record<string, unknown>),
    concepts: normalizeReportVisibility('concepts', src['concepts'] as Record<string, unknown>),
    sales: normalizeReportVisibility('sales', src['sales'] as Record<string, unknown>),
    stats: normalizeReportVisibility('stats', src['stats'] as Record<string, unknown>),
  };
}

export function reportCanSeeAmount(v: ReportVisibility): boolean {
  const mode = v.amountMode ?? 'both';
  return mode === 'amount' || mode === 'both';
}

export function reportCanSeeQty(v: ReportVisibility): boolean {
  const mode = v.amountMode ?? 'both';
  return mode === 'qty' || mode === 'both';
}
