import { Injectable, signal } from '@angular/core';

export type BoardPwaKind = 'reservations' | 'waiting';

export interface BoardPwaOptions {
  kind: BoardPwaKind;
  slug: string;
  shopName: string;
  accentColor?: string | null;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const LABELS: Record<BoardPwaKind, { short: string; fullPrefix: string; pathPrefix: string }> = {
  reservations: { short: 'Reservas', fullPrefix: 'Reservas', pathPrefix: 'r' },
  waiting: { short: 'Espera', fullPrefix: 'Lista de espera', pathPrefix: 'w' },
};

@Injectable({ providedIn: 'root' })
export class BoardPwaService {
  private manifestObjectUrl: string | null = null;
  private previousManifestHref: string | null = null;
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private bipHandler: ((e: Event) => void) | null = null;
  private activeKey: string | null = null;

  /** Chrome/Edge disparó beforeinstallprompt. */
  readonly canNativeInstall = signal(false);
  readonly isStandalone = signal(detectStandalone());
  readonly isIos = signal(detectIos());
  /** Banner visible (no instalado y no descartado). */
  readonly showBanner = signal(false);

  apply(opts: BoardPwaOptions): void {
    const labels = LABELS[opts.kind];
    const slug = String(opts.slug || '')
      .trim()
      .toLowerCase();
    if (!slug) return;

    const key = `${opts.kind}:${slug}`;
    this.activeKey = key;
    this.isStandalone.set(detectStandalone());

    const origin = window.location.origin;
    const startPath = `/${labels.pathPrefix}/${encodeURIComponent(slug)}`;
    const startUrl = `${origin}${startPath}`;
    const name = `${labels.fullPrefix} · ${opts.shopName}`;
    const shortName = `${labels.short} · ${truncate(opts.shopName, 12)}`;
    const theme = opts.accentColor?.trim() || (opts.kind === 'waiting' ? '#2e7d32' : '#c45c26');

    document.title = name;
    setMeta('apple-mobile-web-app-title', labels.short);
    setMeta('application-name', shortName);
    setThemeColor(theme);

    const manifest = {
      name,
      short_name: shortName,
      description: `${labels.fullPrefix} en vivo — ${opts.shopName}`,
      lang: 'es-AR',
      dir: 'ltr',
      display: 'standalone',
      orientation: 'any',
      theme_color: theme,
      background_color: '#0e0c0b',
      id: startUrl,
      scope: startUrl,
      start_url: startUrl,
      categories: ['business', 'food'],
      icons: [
        {
          src: `${origin}/icons/icon-192x192.png`,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: `${origin}/icons/icon-512x512.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: `${origin}/icons/icon-maskable-512x512.png`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    };

    this.setManifest(manifest);
    this.listenInstallPrompt();
    this.refreshBannerVisibility();
  }

  restore(): void {
    this.teardownInstallPrompt();
    this.canNativeInstall.set(false);
    this.showBanner.set(false);
    this.activeKey = null;

    if (this.manifestObjectUrl) {
      URL.revokeObjectURL(this.manifestObjectUrl);
      this.manifestObjectUrl = null;
    }

    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (link) {
      link.href = this.previousManifestHref || 'manifest.webmanifest';
    }
    this.previousManifestHref = null;

    setMeta('apple-mobile-web-app-title', 'Cierres');
    setMeta('application-name', 'Cierres de caja');
    setThemeColor('#1D65A0');
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

  private setManifest(manifest: Record<string, unknown>): void {
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (!link) return;

    if (!this.previousManifestHref) {
      this.previousManifestHref = link.getAttribute('href') || 'manifest.webmanifest';
    }
    if (this.manifestObjectUrl) {
      URL.revokeObjectURL(this.manifestObjectUrl);
      this.manifestObjectUrl = null;
    }

    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    this.manifestObjectUrl = URL.createObjectURL(blob);
    link.href = this.manifestObjectUrl;
  }

  private listenInstallPrompt(): void {
    this.teardownInstallPrompt();
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

function setMeta(name: string, content: string): void {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
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
  nodes.forEach((n) => n.setAttribute('content', color));
}
