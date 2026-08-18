export type ConceptCategory =
  | 'EMPLOYEES'
  | 'SERVICES'
  | 'SUPPLIERS'
  | 'MOVEMENTS'
  | 'OTHERS';

export type PaymentConceptScope = 'supplier' | 'service' | 'employee' | 'movement';

export const CONCEPT_CATEGORY_OPTIONS: Array<{ value: ConceptCategory; label: string }> = [
  { value: 'EMPLOYEES', label: 'Empleados' },
  { value: 'SERVICES', label: 'Servicios' },
  { value: 'SUPPLIERS', label: 'Proveedores' },
  { value: 'MOVEMENTS', label: 'Movimientos' },
  { value: 'OTHERS', label: 'Otros' },
];

export const DEFAULT_PAYMENT_CONCEPT_CATEGORIES: Record<PaymentConceptScope, ConceptCategory[]> = {
  supplier: ['SUPPLIERS'],
  service: ['SERVICES', 'SUPPLIERS'],
  employee: ['EMPLOYEES'],
  movement: ['MOVEMENTS'],
};

export function conceptCategoryLabel(category?: string | null): string {
  return CONCEPT_CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category ?? '—';
}

export function formatConceptCategories(categories?: string[] | null): string {
  const list = (categories ?? []).map((c) => conceptCategoryLabel(c)).filter(Boolean);
  return list.length ? list.join(', ') : '—';
}

export function normalizePaymentConceptCategories(raw?: unknown): Record<
  PaymentConceptScope,
  ConceptCategory[]
> {
  const src =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const pick = (key: PaymentConceptScope): ConceptCategory[] => {
    const list = Array.isArray(src[key]) ? (src[key] as unknown[]) : [];
    const next = list
      .map((v) => String(v ?? '').trim().toUpperCase())
      .filter((v): v is ConceptCategory =>
        CONCEPT_CATEGORY_OPTIONS.some((o) => o.value === v),
      );
    return next.length ? next : [...DEFAULT_PAYMENT_CONCEPT_CATEGORIES[key]];
  };
  return {
    supplier: pick('supplier'),
    service: pick('service'),
    employee: pick('employee'),
    movement: pick('movement'),
  };
}
