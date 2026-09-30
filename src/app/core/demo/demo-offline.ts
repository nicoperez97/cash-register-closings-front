import { environment } from '../../../environments/environment';
import { DEMO_LOCAL_TOKEN, DEMO_STORAGE_KEYS } from './demo-constants';

/**
 * ¿Sesión demo activa? (token local y/o user.isDemo).
 * No inyecta AuthService: sirve en interceptors y arranque temprano.
 */
export function isDemoSession(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    if (localStorage.getItem(DEMO_STORAGE_KEYS.token) === DEMO_LOCAL_TOKEN) return true;
    // Compat con token exportado histórico.
    if (localStorage.getItem(DEMO_STORAGE_KEYS.token) === 'crc-demo-local-token') return true;
    const raw = localStorage.getItem(DEMO_STORAGE_KEYS.user);
    if (!raw) return false;
    const user = JSON.parse(raw) as { isDemo?: boolean };
    return !!user?.isDemo;
  } catch {
    return false;
  }
}

/**
 * ¿La URL apunta al backend de la app (o a un proxy /api)?
 * En demo estas requests NUNCA deben salir a la red.
 */
export function isBackendApiUrl(url: string): boolean {
  if (!url) return false;
  const base = (environment.apiUrl || '').replace(/\/+$/, '');
  if (base && (url === base || url.startsWith(`${base}/`) || url.startsWith(base + '?'))) {
    return true;
  }
  if (/\/api\/v\d+(\/|$|\?)/i.test(url)) return true;
  if (url.includes('/api/v1') || url.includes('/api/v2')) return true;
  if (/^api\/v\d+/i.test(url)) return true;
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const u = new URL(url);
      if (/\/api(\/|$)/i.test(u.pathname)) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Validación intrínseca: en demo, una URL de backend no puede ir a `next()` / red.
 * Lanza si se viola el contrato offline.
 */
export function assertDemoNeverHitsNetwork(url: string, callingNext: boolean): void {
  if (!callingNext) return;
  if (!isDemoSession()) return;
  if (!isBackendApiUrl(url)) return;
  throw new Error(
    `[demo-offline] La demo no puede llamar a la red. URL bloqueada: ${url}`,
  );
}

/**
 * True si esta request debe resolverse 100% en el front (sin `next`).
 */
export function mustHandleDemoLocally(url: string): boolean {
  return isDemoSession() && isBackendApiUrl(url);
}
