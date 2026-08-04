/**
 * Ajusta la barra de estado del sistema (móvil / PWA) al color de la pantalla.
 * - Android Chrome: meta theme-color
 * - iOS PWA: apple-mobile-web-app-status-bar-style + color-scheme
 */
export type StatusBarTone = 'light' | 'dark';

const APPLE_STATUS = 'apple-mobile-web-app-status-bar-style';
const DEFAULT_LIGHT = '#1D65A0';
const DARK_CLASS = 'guy-status-dark';

export function applyStatusBar(color: string, tone: StatusBarTone): void {
  if (typeof document === 'undefined') return;
  const c = String(color || '').trim() || (tone === 'dark' ? '#0e0c0b' : DEFAULT_LIGHT);

  setThemeColor(c);
  setMeta('color-scheme', tone);
  setMeta(APPLE_STATUS, tone === 'dark' ? 'black-translucent' : 'default');

  const root = document.documentElement;
  root.style.colorScheme = tone;
  root.style.backgroundColor = c;
  document.body.style.colorScheme = tone;
  document.body.classList.toggle(DARK_CLASS, tone === 'dark');
  if (tone === 'dark') {
    document.body.style.backgroundColor = c;
  } else {
    document.body.style.removeProperty('background-color');
  }
}

export function resetStatusBar(): void {
  if (typeof document === 'undefined') return;
  applyStatusBar(DEFAULT_LIGHT, 'light');
  document.documentElement.style.removeProperty('background-color');
  document.body.style.removeProperty('background-color');
  document.body.classList.remove(DARK_CLASS);
}

function setThemeColor(color: string): void {
  const nodes = document.querySelectorAll('meta[name="theme-color"]');
  if (!nodes.length) {
    const el = document.createElement('meta');
    el.setAttribute('name', 'theme-color');
    el.setAttribute('content', color);
    document.head.appendChild(el);
    return;
  }
  nodes.forEach((n) => {
    n.setAttribute('content', color);
    n.removeAttribute('media');
  });
}

function setMeta(name: string, content: string): void {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}
