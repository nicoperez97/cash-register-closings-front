/** Etiquetas en español para el cliente (valores de API siguen en inglés). */

export function closingStatusLabel(status?: string | null): string {
  const map: Record<string, string> = {
    DRAFT: 'Borrador',
    SUBMITTED: 'Enviado',
    LOCKED: 'Bloqueado',
  };
  return map[status ?? ''] ?? status ?? '—';
}

export function expenseCategoryLabel(category?: string | null): string {
  const map: Record<string, string> = {
    VEGETABLES: 'Verdulería',
    CHEESE: 'Quesería',
    MEAT: 'Carnicería',
    FISH: 'Pescadería',
    BAKERY: 'Panadería',
    DELI: 'Fiambrería',
    GROCERY: 'Almacén / secos',
    DAIRY: 'Lácteos',
    BEVERAGES: 'Bebidas',
    BAR: 'Cerveza y bar',
    COFFEE: 'Café',
    SUPPLIES: 'Insumos cocina',
    SERVICES: 'Servicios',
    TRANSFER_SHOP: 'Transferencia entre locales',
    OTHER: 'Otros',
    RAW_MATERIALS: 'Materia prima',
    DRINKS: 'Bebidas',
    SALARIES: 'Sueldos',
    RENT: 'Alquiler',
    EQUIPMENT: 'Equipamiento',
    CLEANING: 'Limpieza',
    DISPOSABLES: 'Descartables',
    UTILITIES: 'Servicios (luz/gas/Internet)',
    MARKETING: 'Marketing',
    COMMISSIONS: 'Comisiones',
  };
  return map[category ?? ''] ?? category ?? '—';
}

export function conceptKindLabel(kind?: string | null): string {
  const map: Record<string, string> = {
    INCOME: 'Ingreso',
    EXPENSE: 'Egreso',
    TRANSFER: 'Transferencia',
  };
  return map[kind ?? ''] ?? kind ?? '—';
}

export function accountTypeLabel(type?: string | null): string {
  const map: Record<string, string> = {
    PARTNER: 'Socio',
    CHANNEL: 'Canal',
    SYSTEM: 'Sistema',
    SERVICE: 'Servicio',
    SUPPLIER: 'Proveedor',
  };
  return map[type ?? ''] ?? type ?? '—';
}

export function payrollStatusLabel(status?: string | null): string {
  const map: Record<string, string> = {
    DRAFT: 'Borrador',
    LOCKED: 'Cerrada',
  };
  return map[status ?? ''] ?? status ?? '—';
}

export function extraLineTypeLabel(type?: string | null): string {
  const map: Record<string, string> = {
    STUDENT_CASH: 'Efectivo estudiantes',
    TIP_ALLOCATION: 'Reparto de propinas',
    PVS_BREAKDOWN: 'Desglose PVS',
    ADJUSTMENT: 'Ajuste',
    OTHER: 'Otros',
  };
  return map[type ?? ''] ?? type ?? '—';
}

export function activeLabel(active?: boolean | null): string {
  if (active == null) return '—';
  return active ? 'Activo' : 'Inactivo';
}
