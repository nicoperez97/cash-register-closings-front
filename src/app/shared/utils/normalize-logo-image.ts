/**
 * Normaliza una imagen a JPEG (máx. maxPx) para logos usables en emails.
 * WebP/SVG suelen verse rotos en Gmail/Outlook.
 */
export async function normalizeLogoImageFile(
  file: File,
  opts?: { maxPx?: number; quality?: number },
): Promise<File> {
  const maxPx = opts?.maxPx ?? 512;
  const quality = opts?.quality ?? 0.88;
  const type = (file.type || '').toLowerCase();
  if (type === 'image/jpeg' || type === 'image/png' || type === 'image/gif') {
    if (file.size <= 400_000) return file;
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
    );
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'logo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
