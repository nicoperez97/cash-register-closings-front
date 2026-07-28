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
    SUPPLIES: 'Insumos',
    SERVICES: 'Servicios',
    TRANSFER_SHOP: 'Transferencia entre locales',
    OTHER: 'Otros',
  };
  return map[category ?? ''] ?? category ?? '—';
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
