/**
 * Toma archivos de un input type=file materializando los bytes
 * antes de vaciar el input. En Safari/iOS, `new File([raw])` es un
 * clone superficial: al resetear el input el blob queda inválido y
 * el multipart llega truncado ("Multipart: Unexpected end of form").
 */

async function materializeFile(raw: File): Promise<File | null> {
  const name = String(raw.name || 'archivo').trim() || 'archivo';
  const type = raw.type || 'application/octet-stream';
  try {
    const buffer = await raw.arrayBuffer();
    if (!buffer.byteLength) return null;
    return new File([buffer], name, {
      type,
      lastModified: raw.lastModified,
    });
  } catch {
    return null;
  }
}

export async function takeInputFile(
  input: HTMLInputElement | null | undefined,
): Promise<File | null> {
  const raw = input?.files?.[0] ?? null;
  if (!raw) return null;
  const copy = await materializeFile(raw);
  try {
    if (input) input.value = '';
  } catch {
    // ignore
  }
  return copy;
}

/** Varios archivos: materializa bytes antes de vaciar el input (Safari/iOS). */
export async function takeInputFiles(
  input: HTMLInputElement | null | undefined,
): Promise<File[]> {
  const raw = Array.from(input?.files ?? []);
  const copies: File[] = [];
  for (const file of raw) {
    const copy = await materializeFile(file);
    if (copy) copies.push(copy);
  }
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
