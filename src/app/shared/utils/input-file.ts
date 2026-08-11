/**
 * Toma el primer archivo de un input type=file y clona el File
 * antes de vaciar el input. En Safari/iOS, resetear el input invalida
 * el File original y el upload multipart llega truncado
 * ("Multipart: Unexpected end of form").
 */
function cloneInputFile(raw: File): File {
  const name = String(raw.name || 'archivo').trim() || 'archivo';
  return new File([raw], name, {
    type: raw.type || 'application/octet-stream',
    lastModified: raw.lastModified,
  });
}

export function takeInputFile(input: HTMLInputElement | null | undefined): File | null {
  const raw = input?.files?.[0] ?? null;
  if (!raw) return null;
  const copy = cloneInputFile(raw);
  try {
    if (input) input.value = '';
  } catch {
    // ignore
  }
  return copy;
}

/** Varios archivos: clona antes de vaciar el input (Safari/iOS). */
export function takeInputFiles(input: HTMLInputElement | null | undefined): File[] {
  const raw = Array.from(input?.files ?? []);
  const copies = raw.map(cloneInputFile);
  try {
    if (input) input.value = '';
  } catch {
    // ignore
  }
  return copies;
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
