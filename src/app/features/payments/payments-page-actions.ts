/** Slug seguro para nombres de archivo de export (local). */
export function shopFileSlug(name?: string | null): string {
  const raw = (name ?? 'local')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return raw || 'local';
}
