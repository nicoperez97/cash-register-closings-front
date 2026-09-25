/** Quita el marcador técnico `__DELETED__…` de etiquetas de catálogo. */
export function displaySoftDeletedLabel(value?: string | null): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/__DELETED__.*/i, '').replace(/\s+/g, ' ').trim();
  if (!cleaned || /__DELETED__/i.test(cleaned)) return null;
  return cleaned;
}

export function looksSoftDeletedLabel(value?: string | null): boolean {
  return /__DELETED__/i.test(String(value ?? ''));
}

/** Nombre legible para UI / PDF: sin DELETED; opcional sufijo “(eliminado)”. */
export function conceptLabelForUi(
  name?: string | null,
  opts?: { deleted?: boolean; empty?: string },
): string {
  const empty = opts?.empty ?? 'Sin concepto';
  const deleted = !!opts?.deleted || looksSoftDeletedLabel(name);
  const base = displaySoftDeletedLabel(name)?.trim() || '';
  if (!base && !deleted) return String(name ?? '').trim() || empty;
  if (deleted) return `${base || 'Concepto'} (eliminado)`;
  return base;
}
