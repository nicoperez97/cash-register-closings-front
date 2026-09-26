/**
 * Cuenta cuántos filtros están "activos" en el value de un FormGroup, para
 * mostrar un badge en el botón de colapso de filtros.
 * - string: cuenta si no está vacío.
 * - array: cuenta si tiene elementos.
 * - number: cuenta si es un número válido.
 * - boolean: cuenta si es true.
 * Los objetos anidados (p. ej. rangos de fecha) se ignoran salvo que se cuenten
 * aparte; pasá sus claves en `ignore` si no querés que sumen.
 */
export function countActiveFilters(
  value: Record<string, unknown> | null | undefined,
  opts?: { ignore?: string[] },
): number {
  if (!value) return 0;
  const ignore = new Set(opts?.ignore ?? []);
  let count = 0;
  for (const [key, v] of Object.entries(value)) {
    if (ignore.has(key)) continue;
    if (v == null) continue;
    if (typeof v === 'string') {
      if (v.trim()) count++;
    } else if (Array.isArray(v)) {
      if (v.length) count++;
    } else if (typeof v === 'number') {
      if (!Number.isNaN(v)) count++;
    } else if (typeof v === 'boolean') {
      if (v) count++;
    }
  }
  return count;
}
