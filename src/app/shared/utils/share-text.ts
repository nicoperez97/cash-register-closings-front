import { downloadPdfBytes } from '../pdf/pdf-text';
import { formatMoney } from './money';

/** Comparte texto vía Web Share API o lo copia al portapapeles. */
export async function shareText(opts: {
  title: string;
  text: string;
}): Promise<'shared' | 'copied' | 'aborted' | 'failed'> {
  const title = opts.title;
  const text = opts.text;
  const payload = { title, text };

  const canUseShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    (typeof navigator.canShare !== 'function' || navigator.canShare(payload));

  if (canUseShare) {
    try {
      await navigator.share(payload);
      return 'shared';
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return 'aborted';
      // En desktop (Chrome/Edge) share a menudo existe pero falla: seguimos con clipboard.
    }
  }

  if (await copyText(text)) return 'copied';
  return 'failed';
}

export type SharePdfResult = 'shared' | 'copied' | 'downloaded' | 'aborted' | 'failed';

/** Comparte un PDF (WhatsApp, etc.) o lo descarga y copia el texto. */
export async function sharePdf(opts: {
  title: string;
  text: string;
  filename: string;
  bytes: Uint8Array;
}): Promise<SharePdfResult> {
  const copy = Uint8Array.from(opts.bytes);
  const file = new File([copy], opts.filename, { type: 'application/pdf' });
  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

  if (canShareFiles) {
    try {
      await navigator.share({ title: opts.title, text: opts.text, files: [file] });
      return 'shared';
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return 'aborted';
      try {
        await navigator.share({ title: opts.title, files: [file] });
        return 'shared';
      } catch (err2) {
        if ((err2 as { name?: string })?.name === 'AbortError') return 'aborted';
      }
    }
  }

  downloadPdfBytes(copy, opts.filename);
  if (await copyText(opts.text)) return 'downloaded';
  return 'failed';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback legacy abajo
  }
  return copyViaTextarea(text);
}

function copyViaTextarea(text: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    el.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export function formatMoneyAr(value: number | null | undefined): string {
  return formatMoney(value, { spaced: true });
}

export function formatDateAr(iso: string | null | undefined): string {
  const raw = String(iso || '').slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw || '—';
  return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;
}
