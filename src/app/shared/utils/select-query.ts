/** Normaliza texto de búsqueda (sin acentos, minúsculas). Sin dependencias de Material. */
export function normalizeSelectQuery(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
