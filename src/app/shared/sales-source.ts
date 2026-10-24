/**
 * Origen de ventas para módulos que antes leían solo Ventas POS:
 * Ventas = pedidos online, mostrador y comanda; Ventas POS = import del POS.
 */
export type SalesSource = 'all' | 'sales' | 'pos';

export const SALES_SOURCE_OPTIONS: Array<{ value: SalesSource; label: string; hint: string }> = [
  {
    value: 'all',
    label: 'Ventas + POS',
    hint: 'Suma Ventas (pedidos y comanda) y Ventas POS. Si un período quedó cargado en los dos, elegí uno.',
  },
  { value: 'sales', label: 'Ventas', hint: 'Solo pedidos online, mostrador y comanda' },
  { value: 'pos', label: 'Ventas POS', hint: 'Solo lo importado del POS' },
];
