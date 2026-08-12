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
  return `$ ${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function closingNum(v: unknown): number {
  const num = Number(v ?? 0);
  return Number.isFinite(num) ? num : 0;
}

/** Vacío en el input si no hay monto (evita el 0 adelante en móvil). */
export function emptyNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const num = Number(v);
  if (!Number.isFinite(num) || num === 0) return null;
  return num;
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
