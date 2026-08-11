/**
 * Toma el primer archivo de un input type=file y clona el File
 * antes de vaciar el input. En Safari/iOS, resetear el input invalida
 * el File original y el upload multipart llega truncado
 * ("Multipart: Unexpected end of form").
 */
export function takeInputFile(input: HTMLInputElement | null | undefined): File | null {
  const raw = input?.files?.[0] ?? null;
  if (!raw) return null;
  const name = String(raw.name || 'archivo').trim() || 'archivo';
  const copy = new File([raw], name, {
    type: raw.type || 'application/octet-stream',
    lastModified: raw.lastModified,
  });
  try {
    if (input) input.value = '';
  } catch {
    // ignore
  }
  return copy;
}

/** Nombre seguro para Content-Disposition / multer. */
export function safeUploadFileName(name: string | null | undefined): string {
  const base = String(name || 'archivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.\-()+ ]+/g, '_')
    .trim()
    .slice(0, 180);
  return base || 'archivo';
}
