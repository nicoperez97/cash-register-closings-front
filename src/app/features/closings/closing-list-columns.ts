import { DataTableColumn } from '../../shared/components/data-table';
import { closingStatusLabel } from '../../core/i18n/labels';
import { formatMoney } from '../../shared/utils/money';
import type { CashClosing, ClosingSourceAmount, ShopClosingSource } from './closings-api.service';

const money = (v: unknown) => formatMoney(Number(v ?? 0), { spaced: true });

export function sourceColumnKey(sourceId: string): string {
  return `source:${sourceId}`;
}

/** Aplana sourceAmounts en claves `source:{id}` para la tabla. */
export function flattenClosingSourceAmounts(
  row: CashClosing,
): CashClosing & Record<string, unknown> {
  const flat: Record<string, unknown> = { ...row };
  for (const s of row.sourceAmounts ?? []) {
    if (!s?.sourceId) continue;
    flat[sourceColumnKey(s.sourceId)] = Number(s.amount ?? 0);
  }
  return flat as CashClosing & Record<string, unknown>;
}

/**
 * Columnas de la lista: fijas + una por cada Cuenta del local (no Efectivo)
 * + unidades del local (ej. paninos) si hay etiqueta configurada.
 */
export function closingMoneyColumns(opts?: {
  sources?: Array<Pick<ShopClosingSource, 'id' | 'name' | 'role' | 'sortOrder' | 'active'>>;
  /** Fuentes que aparecen en los cierres cargados y no están en el catálogo activo. */
  extraSources?: Array<Pick<ClosingSourceAmount, 'sourceId' | 'name' | 'role'>>;
  unitsLabel?: string | null;
}): DataTableColumn[] {
  const catalog = [...(opts?.sources ?? [])]
    .filter((s) => s.active !== false && String(s.role ?? '') !== 'CASH')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));

  const seen = new Set(catalog.map((s) => s.id));
  const extras = (opts?.extraSources ?? [])
    .filter((s) => !!s.sourceId && !seen.has(s.sourceId) && String(s.role ?? '') !== 'CASH')
    .reduce<Array<{ id: string; name: string }>>((acc, s) => {
      if (seen.has(s.sourceId)) return acc;
      seen.add(s.sourceId);
      acc.push({ id: s.sourceId, name: String(s.name ?? '').trim() || 'Cuenta' });
      return acc;
    }, []);

  const sourceCols: DataTableColumn[] = [
    ...catalog.map((s) => ({ id: s.id, name: s.name })),
    ...extras,
  ].map((s) => {
    const key = sourceColumnKey(s.id);
    return {
      key,
      label: s.name,
      format: (r: Record<string, unknown>) => money(r[key]),
      totalize: true,
      totalFormat: (sum: number) => money(sum),
    };
  });

  const unitsLabel = String(opts?.unitsLabel ?? '').trim();
  const unitsCols: DataTableColumn[] = unitsLabel
    ? [
        {
          key: 'unitsSold',
          label: unitsLabel,
          format: (r) => {
            const v = r['unitsSold'];
            if (v == null || v === '') return '—';
            return String(v);
          },
          totalize: true,
          totalValue: (r) => Number(r['unitsSold'] ?? 0),
          totalFormat: (sum) => String(sum),
        },
      ]
    : [];

  return [
    { key: 'businessDate', label: 'Fecha' },
    {
      key: 'shiftName',
      label: 'Turno',
      format: (r) => {
        if (String(r['kind'] ?? '') === 'EVENT') {
          const name = String(r['eventName'] ?? '').trim();
          return name ? `Evento · ${name}` : 'Evento';
        }
        return String(r['shiftName'] ?? '');
      },
    },
    {
      key: 'posSystemAmount',
      label: 'Caja sistema',
      format: (r) => money(r['posSystemAmount'] ?? r['calculatedTotal']),
      totalize: true,
      totalFormat: (sum) => money(sum),
    },
    {
      key: 'declaredTotal',
      label: 'Total declarado',
      format: (r) => money(r['declaredTotal']),
      totalize: true,
      totalFormat: (sum) => money(sum),
    },
    {
      key: 'difference',
      label: 'Diferencia',
      format: (r) => money(r['difference']),
      cellClass: (r) => {
        const d = Number(r['difference'] ?? 0);
        if (d > 0) return 'data-table__diff--pos';
        if (d < 0) return 'data-table__diff--neg';
        return '';
      },
      totalize: true,
      totalFormat: (sum) => money(sum),
    },
    {
      key: 'cashAmount',
      label: 'Efectivo',
      format: (r) => money(r['cashAmount']),
      totalize: true,
      totalFormat: (sum) => money(sum),
    },
    ...sourceCols,
    ...unitsCols,
    {
      key: 'expensesTotal',
      label: 'Egresos',
      format: (r) =>
        money(
          r['expensesTotal'] ??
            (Array.isArray(r['expenses'])
              ? (r['expenses'] as Array<{ amount?: number }>).reduce(
                  (s, e) => s + Number(e?.amount ?? 0),
                  0,
                )
              : 0),
        ),
      totalize: true,
      totalValue: (r) =>
        Number(
          r['expensesTotal'] ??
            (Array.isArray(r['expenses'])
              ? (r['expenses'] as Array<{ amount?: number }>).reduce(
                  (s, e) => s + Number(e?.amount ?? 0),
                  0,
                )
              : 0),
        ),
      totalFormat: (sum) => money(sum),
    },
    { key: 'status', label: 'Estado', format: (r) => closingStatusLabel(String(r['status'] ?? '')) },
    { key: 'cashWithdrawnByName', label: 'Retiro' },
  ];
}
