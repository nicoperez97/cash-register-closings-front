import { Injectable, signal } from '@angular/core';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'crc_main_pwa_dismiss';

/**
 * Instalación de la PWA principal (Cierres).
 * Los tableros /r y /w usan BoardPwaService (no mostrar este banner ahí).
 */
@Injectable({ providedIn: 'root' })
export class MainPwaInstallService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private bipHandler: ((e: Event) => void) | null = null;
  private started = false;

  readonly canNativeInstall = signal(false);
  readonly isStandalone = signal(detectStandalone());
  readonly isIos = signal(detectIos());
  readonly showBanner = signal(false);
  /** true en tableros públicos: el banner global no compite con el de reservas/espera */
  readonly boardContext = signal(false);

  start(): void {
    if (this.started) return;
    this.started = true;
    this.isStandalone.set(detectStandalone());
    this.refreshBanner();

    this.bipHandler = (e: Event) => {
      if (this.boardContext() || !isMobileViewport()) return;
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.canNativeInstall.set(true);
      this.refreshBanner();
    };
    window.addEventListener('beforeinstallprompt', this.bipHandler);

    window.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => {
      this.isStandalone.set(detectStandalone());
      this.refreshBanner();
    });

    // Mismo breakpoint que el layout (960px): solo mobile/tablet
    const mobileMq = window.matchMedia('(max-width: 960px)');
    const onViewport = () => this.refreshBanner();
    if (typeof mobileMq.addEventListener === 'function') {
      mobileMq.addEventListener('change', onViewport);
    } else {
      // Safari viejo
      mobileMq.addListener(onViewport);
    }
  }

  setBoardContext(active: boolean): void {
    this.boardContext.set(active);
    if (active) {
      this.showBanner.set(false);
      this.canNativeInstall.set(false);
      this.deferredPrompt = null;
    } else {
      this.refreshBanner();
    }
  }

  dismiss(): void {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
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
        try {
          localStorage.setItem(DISMISS_KEY, '1');
        } catch {
          // ignore
        }
      } else {
        this.refreshBanner();
      }
      return choice.outcome;
    } catch {
      return 'unavailable';
    }
  }

  private refreshBanner(): void {
    if (this.boardContext() || this.isStandalone() || isDismissed() || !isMobileViewport()) {
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

function isMobileViewport(): boolean {
  try {
    return window.matchMedia('(max-width: 960px)').matches;
  } catch {
    return false;
  }
}

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}
