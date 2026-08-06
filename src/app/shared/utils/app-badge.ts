/** Sincroniza el número rojo del ícono (PWA / home screen) vía Badging API. */
export async function syncAppBadge(count: number): Promise<void> {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  const n = Math.max(0, Math.floor(Number(count) || 0));
  try {
    if (n > 0 && typeof nav.setAppBadge === 'function') {
      await nav.setAppBadge(n);
      return;
    }
    if (typeof nav.clearAppBadge === 'function') {
      await nav.clearAppBadge();
    }
  } catch {
    // Navegador sin soporte, sin permiso, o no instalada como PWA.
  }
}
