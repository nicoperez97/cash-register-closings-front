/** Comparte texto vía Web Share API o lo copia al portapapeles. */
export async function shareText(opts: {
  title: string;
  text: string;
}): Promise<'shared' | 'copied' | 'aborted' | 'failed'> {
  const title = opts.title;
  const text = opts.text;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title, text });
      return 'shared';
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
    return 'failed';
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return 'aborted';
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return 'copied';
      }
    } catch {
      // ignore
    }
    return 'failed';
  }
}

export function formatMoneyAr(value: number | null | undefined): string {
  return `$ ${Number(value || 0).toLocaleString('es-AR')}`;
}

export function formatDateAr(iso: string | null | undefined): string {
  const raw = String(iso || '').slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw || '—';
  return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;
}
