/**
 * Rutas del front que son públicas (sin sesión).
 * Usar en guards, interceptors e inicialización para no empujar a /login.
 */
const PUBLIC_PREFIXES = [
  '/login',
  '/r/',
  '/w/',
  '/p/',
  '/m/',
  '/n/',
  '/reservar/',
  '/mi-reserva/',
  '/legacy/',
  '/ipad/',
] as const;

const PUBLIC_EXACT = new Set(['/login', '/r', '/w', '/p', '/m', '/n', '/reservar', '/mi-reserva']);

export function normalizeAppPath(url: string): string {
  const raw = String(url || '').split('?')[0].split('#')[0].trim() || '/';
  if (!raw.startsWith('/')) return `/${raw}`;
  if (raw.length > 1 && raw.endsWith('/')) return raw.slice(0, -1);
  return raw;
}

/** True si la URL del SPA es (o debería ser) accesible sin login. */
export function isPublicAppPath(url: string): boolean {
  const path = normalizeAppPath(url);
  if (PUBLIC_EXACT.has(path)) return true;
  return PUBLIC_PREFIXES.some((p) => path === p.slice(0, -1) || path.startsWith(p));
}

/** Endpoints de API públicos: no adjuntar Bearer. */
export function isPublicApiUrl(url: string): boolean {
  const u = String(url || '');
  return u.includes('/public/') || u.includes('/auth/login');
}
