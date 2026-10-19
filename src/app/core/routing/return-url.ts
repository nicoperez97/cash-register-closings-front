import { isAppLoginPath } from './public-paths';

/**
 * URL a la que volver después del login (sessionStorage). Vive aparte de
 * closing-form-draft para que el interceptor 401 no arrastre el form de cierre
 * al bundle inicial.
 */
const RETURN_URL_KEY = 'crc.return-url';

export function persistReturnUrl(url: string): void {
  try {
    const path = String(url || '').trim();
    if (!path.startsWith('/') || path.startsWith('//') || isAppLoginPath(path)) return;
    sessionStorage.setItem(RETURN_URL_KEY, path);
  } catch {
    /* ignore */
  }
}

export function consumeReturnUrl(): string | null {
  try {
    const raw = sessionStorage.getItem(RETURN_URL_KEY);
    if (raw) sessionStorage.removeItem(RETURN_URL_KEY);
    if (!raw?.startsWith('/') || raw.startsWith('//') || isAppLoginPath(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}
