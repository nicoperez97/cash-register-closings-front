import { Injectable, inject, signal } from '@angular/core';
import { MainPwaInstallService } from '../../core/pwa/main-pwa-install.service';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';

export type BoardPwaKind = 'reservations' | 'waiting';

export interface BoardPwaOptions {
  kind: BoardPwaKind;
  slug: string;
  shopName: string;
  accentColor?: string | null;
  /** Logo del local → ícono de instalación (manifest + apple-touch-icon). */
  logoUrl?: string | null;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * PWA de tableros públicos (/r, /w).
 * Manifest always via same-origin `/api/v1/...` (prod directo, dev vía proxy).
 */
@Injectable({ providedIn: 'root' })
export class BoardPwaService {
  private readonly mainPwa = inject(MainPwaInstallService);
  private previousManifestHref: string | null = null;
  private previousAppleTouchHref: string | null = null;
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private bipHandler: ((e: Event) => void) | null = null;
  private activeKey: string | null = null;

  readonly canNativeInstall = signal(false);
  readonly isStandalone = signal(detectStandalone());
  readonly isIos = signal(detectIos());
  readonly showBanner = signal(false);
  /** Nombre que verá el usuario al instalar (para el banner). */
  readonly installLabel = signal('Reservas');

  /**
   * Escucha `beforeinstallprompt` apenas entra el tablero (sin esperar al API).
   * Si se registra tarde, Chrome ya disparó el evento y no aparece Instalar en UI.
   */
  prime(kind: BoardPwaKind, slugRaw: string): void {
    const slug = String(slugRaw || '')
      .trim()
      .toLowerCase();
    if (!slug) return;

    this.mainPwa.setBoardContext(true);
    this.activeKey = `${kind}:${slug}`;
    this.isStandalone.set(detectStandalone());
    this.installLabel.set(kind === 'waiting' ? 'Espera' : 'Reservas');
    applyStatusBar(boardStatusColor(kind, null), 'dark');
    this.listenInstallPrompt();
    this.refreshBannerVisibility();
  }

  apply(opts: BoardPwaOptions): void {
    const slug = String(opts.slug || '')
      .trim()
      .toLowerCase();
    if (!slug) return;

    this.mainPwa.setBoardContext(true);

    const key = `${opts.kind}:${slug}`;
    this.activeKey = key;
    this.isStandalone.set(detectStandalone());

    const shortPrefix = opts.kind === 'waiting' ? 'Espera' : 'Reservas';
    // iOS trunca ~12–13 chars en el ícono
    const appleTitle = shortPrefix;
    const short = `${shortPrefix} · ${truncate(opts.shopName, 10)}`;
    const full =
      opts.kind === 'waiting'
        ? `Lista de espera · ${opts.shopName}`
        : `Reservas · ${opts.shopName}`;
    const accent =
      opts.accentColor?.trim() || (opts.kind === 'waiting' ? '#2e7d32' : '#c45c26');

    this.installLabel.set(short);

    document.title = full;
    setMeta('apple-mobile-web-app-title', appleTitle);
    setMeta('application-name', short);
    setMeta('description', full);
    applyStatusBar(boardStatusColor(opts.kind, accent), 'dark');
    this.applyInstallIcon(opts.logoUrl);

    const href = this.resolveManifestHref(opts.kind, slug);
    this.setManifestHref(href);
    void this.prefetchManifest(href);
    this.listenInstallPrompt();
    this.refreshBannerVisibility();
  }

  restore(): void {
    this.teardownInstallPrompt();
    this.canNativeInstall.set(false);
    this.showBanner.set(false);
    this.activeKey = null;
    this.mainPwa.setBoardContext(false);

    const href = this.previousManifestHref || 'manifest.webmanifest';
    this.previousManifestHref = null;
    this.setManifestHref(href, true);
    this.restoreInstallIcon();
    resetStatusBar();

    setMeta('apple-mobile-web-app-title', 'Cierres');
    setMeta('application-name', 'Cierres de caja');
    setMeta(
      'description',
      'Cierres de caja multi-local: roles, reportes y export Excel.',
    );
  }

  dismissBanner(): void {
    if (this.activeKey) {
      try {
        localStorage.setItem(dismissKey(this.activeKey), '1');
      } catch {
        // ignore
      }
    }
    this.showBanner.set(false);
  }

  async install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!this.deferredPrompt) return 'unavailable';
    const promptEvent = this.deferredPrompt;
    this.deferredPrompt = null;
    this.canNativeInstall.set(false);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        this.showBanner.set(false);
        this.isStandalone.set(true);
      }
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  }

  private resolveManifestHref(kind: BoardPwaKind, slug: string): string {
    const appOrigin = window.location.origin;
    const qs = `appOrigin=${encodeURIComponent(appOrigin)}`;
    const enc = encodeURIComponent(slug);
    const manifestKind = kind === 'waiting' ? 'waiting' : 'reservations';
    return `/api/v1/public/shops/${enc}/manifests/${manifestKind}?${qs}`;
  }

  private async prefetchManifest(href: string): Promise<void> {
    try {
      const res = await fetch(href, { credentials: 'omit', cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as {
        short_name?: string;
        name?: string;
        icons?: Array<{ src?: string }>;
      };
      if (json.short_name) this.installLabel.set(json.short_name);
      if (json.name) document.title = json.name;
      const iconSrc = json.icons?.find((i) => i.src)?.src;
      if (iconSrc) this.applyInstallIcon(iconSrc);
    } catch {
      // El link del manifest igual queda; iOS puede usar apple-mobile-web-app-title
    }
  }

  private applyInstallIcon(logoUrl?: string | null): void {
    const src = String(logoUrl || '').trim();
    if (!src) return;
    const apple = document.getElementById('apple-touch-icon') as HTMLLinkElement | null;
    if (apple) {
      if (this.previousAppleTouchHref === null) {
        this.previousAppleTouchHref = apple.getAttribute('href') || 'icons/icon-180x180.png';
      }
      apple.setAttribute('href', src);
    }
  }

  private restoreInstallIcon(): void {
    const apple = document.getElementById('apple-touch-icon') as HTMLLinkElement | null;
    if (apple && this.previousAppleTouchHref) {
      apple.setAttribute('href', this.previousAppleTouchHref);
    }
    this.previousAppleTouchHref = null;
  }

  private setManifestHref(href: string, restoring = false): void {
    const existing = document.querySelectorAll('link[rel="manifest"]');
    if (!restoring && !this.previousManifestHref && existing.length) {
      const current = (existing[0] as HTMLLinkElement).getAttribute('href') || '';
      this.previousManifestHref =
        current.includes('/manifests/') || current.includes('/pwa/')
          ? 'manifest.webmanifest'
          : current || 'manifest.webmanifest';
    }

    // Preferir actualizar el href in-place: recrear el <link> después del load
    // no hace que iOS vuelva a leer el manifest.
    const first = existing[0] as HTMLLinkElement | undefined;
    if (first && existing.length === 1) {
      first.id = 'app-manifest';
      if (first.getAttribute('href') !== href) {
        first.setAttribute('href', href);
      }
      return;
    }

    existing.forEach((n) => n.parentNode?.removeChild(n));
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.id = 'app-manifest';
    link.href = href;
    document.head.appendChild(link);
  }

  private listenInstallPrompt(): void {
    if (this.bipHandler) return;
    this.bipHandler = (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.canNativeInstall.set(true);
      this.refreshBannerVisibility();
    };
    window.addEventListener('beforeinstallprompt', this.bipHandler);
  }

  private teardownInstallPrompt(): void {
    if (this.bipHandler) {
      window.removeEventListener('beforeinstallprompt', this.bipHandler);
      this.bipHandler = null;
    }
    this.deferredPrompt = null;
  }

  private refreshBannerVisibility(): void {
    if (this.isStandalone()) {
      this.showBanner.set(false);
      return;
    }
    if (this.activeKey && isDismissed(this.activeKey)) {
      this.showBanner.set(false);
      return;
    }
    this.showBanner.set(true);
  }
}

function detectStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true;
  } catch {
    return false;
  }
}

function detectIos(): boolean {
  const ua = window.navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua);
  const iPadOs = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  return iOS || iPadOs;
}

function dismissKey(activeKey: string): string {
  return `crc_board_pwa_dismiss_${activeKey}`;
}

function isDismissed(activeKey: string): boolean {
  try {
    return localStorage.getItem(dismissKey(activeKey)) === '1';
  } catch {
    return false;
  }
}

function truncate(value: string, max: number): string {
  const t = String(value || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Color de la barra de estado: oscuro tintado con el accent del local (no el accent puro). */
function boardStatusColor(kind: BoardPwaKind, accent: string | null | undefined): string {
  const fallback = kind === 'waiting' ? '#2e7d32' : '#c45c26';
  const a = String(accent || fallback).trim() || fallback;
  // ~18% accent sobre fondo del tablero → se ve continuo con el hero
  return mixHex('#0e0c0b', a, 0.22);
}

function mixHex(base: string, tint: string, amount: number): string {
  const b = parseHex(base);
  const t = parseHex(tint);
  if (!b || !t) return base;
  const w = Math.min(1, Math.max(0, amount));
  const r = Math.round(b.r * (1 - w) + t.r * w);
  const g = Math.round(b.g * (1 - w) + t.g * w);
  const bl = Math.round(b.b * (1 - w) + t.b * w);
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(raw: string): { r: number; g: number; b: number } | null {
  const m = String(raw)
    .trim()
    .replace(/^#/, '')
    .match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function setMeta(name: string, content: string): void {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    if (name === 'apple-mobile-web-app-title') el.id = 'apple-app-title';
    if (name === 'application-name') el.id = 'app-name-meta';
    if (name === 'description') el.id = 'app-desc-meta';
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}
