import { DataTableColumn } from '../../shared/components/data-table';
import { closingStatusLabel } from '../../core/i18n/labels';

const money = (v: unknown) => `$ ${Number(v ?? 0).toLocaleString('es-AR')}`;

export function closingMoneyColumns(): DataTableColumn[] {
  return [
    { key: 'businessDate', label: 'Fecha' },
    {
      key: 'posSystemAmount',
      label: 'Caja sistema',
      format: (r) => money(r['posSystemAmount'] ?? r['calculatedTotal']),
    },
    { key: 'declaredTotal', label: 'Total declarado', format: (r) => money(r['declaredTotal']) },
    {
      key: 'difference',
      label: 'Diferencia',
      format: (r) => money(r['difference']),
      cellClass: (r) => {
        // difference = caja sistema − total declarado
        // declarado mayor → a favor (verde); sistema mayor → en contra (rojo)
        const d = Number(r['difference'] ?? 0);
        if (d < 0) return 'data-table__diff--pos';
        if (d > 0) return 'data-table__diff--neg';
        return '';
      },
    },
    { key: 'cashAmount', label: 'Efectivo', format: (r) => money(r['cashAmount']) },
    { key: 'cardAmount', label: 'PVS', format: (r) => money(r['cardAmount']) },
    { key: 'mercadoPagoAmount', label: 'Mercado Pago', format: (r) => money(r['mercadoPagoAmount']) },
    { key: 'accountDniAmount', label: 'Cuenta DNI', format: (r) => money(r['accountDniAmount']) },
    { key: 'transferAmount', label: 'Transferencias', format: (r) => money(r['transferAmount']) },
    { key: 'deliveryAppsAmount', label: 'Delivery', format: (r) => money(r['deliveryAppsAmount']) },
    { key: 'otherAmount', label: 'Otros', format: (r) => money(r['otherAmount']) },
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
    },
    { key: 'status', label: 'Estado', format: (r) => closingStatusLabel(String(r['status'] ?? '')) },
    { key: 'cashWithdrawnByName', label: 'Retiro' },
  ];
}
