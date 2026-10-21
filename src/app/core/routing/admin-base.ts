/** Prefijo del panel autenticado (scope de la PWA admin). */
export const ADMIN_BASE = '/admin';

function stripPath(url: string): string {
  const raw = String(url || '').split('?')[0].split('#')[0].trim() || '/';
  if (!raw.startsWith('/')) return `/${raw}`;
  if (raw.length > 1 && raw.endsWith('/')) return raw.slice(0, -1);
  return raw;
}

/**
 * URL absoluta del panel: `adminUrl('closings', id)` → `/admin/closings/{id}`.
 * Sin segmentos → `/admin`. Segmentos vacíos se omiten.
 */
export function adminUrl(...segments: Array<string | number | null | undefined>): string {
  const parts = segments
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .map((s) => s.replace(/^\/+|\/+$/g, ''));
  if (!parts.length) return ADMIN_BASE;
  return `${ADMIN_BASE}/${parts.join('/')}`;
}

/** True si el path del SPA está bajo el panel (`/admin` o `/admin/...`), incluido login. */
export function isAdminAppPath(url: string): boolean {
  const path = stripPath(url);
  return path === ADMIN_BASE || path.startsWith(`${ADMIN_BASE}/`);
}

/**
 * Si el path es una ruta operativa vieja (sin `/admin`), la reescribe.
 * Deja iguales públicos, landing y paths que ya van bajo `/admin`.
 */
export function ensureAdminPath(url: string): string {
  const raw = String(url || '').trim() || '/';
  let path = raw;
  let search = '';
  let hash = '';
  const hashIdx = path.indexOf('#');
  if (hashIdx >= 0) {
    hash = path.slice(hashIdx);
    path = path.slice(0, hashIdx);
  }
  const qIdx = path.indexOf('?');
  if (qIdx >= 0) {
    search = path.slice(qIdx);
    path = path.slice(0, qIdx);
  }
  const norm = stripPath(path);
  if (norm === '/' || isAdminAppPath(norm)) {
    return `${norm === '/' ? path || '/' : norm}${search}${hash}`;
  }
  // Públicos / login legacy: no prefijar acá (login se redirige por router).
  if (
    norm === '/login' ||
    norm.startsWith('/r/') ||
    norm === '/r' ||
    norm.startsWith('/w/') ||
    norm === '/w' ||
    norm.startsWith('/m/') ||
    norm === '/m' ||
    norm.startsWith('/p/') ||
    norm === '/p' ||
    norm.startsWith('/n/') ||
    norm === '/n' ||
    norm.startsWith('/pedir/') ||
    norm === '/pedir' ||
    norm.startsWith('/mi-pedido/') ||
    norm === '/mi-pedido' ||
    norm.startsWith('/mozo/') ||
    norm === '/mozo' ||
    norm.startsWith('/reservar/') ||
    norm === '/reservar' ||
    norm.startsWith('/mi-reserva/') ||
    norm === '/mi-reserva' ||
    norm.startsWith('/fichar/') ||
    norm === '/fichar' ||
    norm.startsWith('/legacy/') ||
    norm.startsWith('/ipad/')
  ) {
    return `${path}${search}${hash}`;
  }
  return `${ADMIN_BASE}${norm === '/' ? '' : norm}${search}${hash}`;
}
