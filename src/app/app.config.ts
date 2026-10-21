import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  LOCALE_ID,
} from '@angular/core';
import { provideRouter, TitleStrategy } from '@angular/router';
import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker, SwPush, SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { MAT_DIALOG_DEFAULT_OPTIONS, MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS, MatSnackBarConfig } from '@angular/material/snack-bar';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MAT_BUTTON_TOGGLE_DEFAULT_OPTIONS } from '@angular/material/button-toggle';
import { ScrollStrategy } from '@angular/cdk/overlay';
import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { filter } from 'rxjs';

import { routes } from './app.routes';
import { AppTitleStrategy } from './core/routing/app-title.strategy';
import { authInterceptor } from './core/auth/auth.interceptor';
import { unauthorizedInterceptor } from './core/http/unauthorized.interceptor';
import { authRefreshInterceptor } from './core/http/auth-refresh.interceptor';
import { notificationsRefreshInterceptor } from './core/http/notifications-refresh.interceptor';
import { demoOverlayInterceptor } from './core/demo/demo-overlay.interceptor';
import { AuthService } from './core/auth/auth.service';
import { isPublicAppPath } from './core/routing/public-paths';
import { BodyScrollLockService } from './shared/services/body-scroll-lock.service';
import { AppUpdateDialogComponent } from './shared/components/app-update-dialog';
import { NotificationsInboxService } from './features/payments/notifications-inbox.service';
import { PushNotificationsService } from './features/payments/push-notifications.service';
import { AnalyticsService } from './core/analytics/analytics.service';
import { LazySentryErrorHandler } from './core/monitoring/sentry';

registerLocaleData(localeEsAr);

function isUnauthorizedError(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 401;
}

/** Evita que un /auth/me lento bloquee el primer paint de la PWA. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error('timeout'), { code: 'TIMEOUT' }));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function watchAppUpdates(): void {
  const updates = inject(SwUpdate);
  const dialog = inject(MatDialog);
  const push = inject(SwPush);
  if (!updates.isEnabled) return;

  const JUST_UPDATED_KEY = 'crc_sw_just_updated';
  const SEEN_VERSION_KEY = 'crc_sw_seen_version';
  /** Tras Actualizar, no volver a molestar unos minutos (evita el loop del diálogo). */
  const GRACE_MS = 3 * 60_000;

  let prompting = false;
  let pendingVersionHash: string | null = null;

  const recentlyUpdated = (): boolean => {
    try {
      const t = Number(sessionStorage.getItem(JUST_UPDATED_KEY) || 0);
      return Number.isFinite(t) && Date.now() - t < GRACE_MS;
    } catch {
      return false;
    }
  };

  const alreadySeenVersion = (hash: string | null | undefined): boolean => {
    if (!hash) return false;
    try {
      return sessionStorage.getItem(SEEN_VERSION_KEY) === hash;
    } catch {
      return false;
    }
  };

  const markSeenVersion = (hash: string | null | undefined): void => {
    if (!hash) return;
    try {
      sessionStorage.setItem(SEEN_VERSION_KEY, hash);
    } catch {
      // ignore
    }
  };

  const activateAndReload = async (): Promise<void> => {
    // Limpiar locks de dialog antes del reload (PWA iOS a veces conserva estilos).
    document.documentElement.classList.remove(
      'guy-body-scroll-lock',
      'guy-dialog-scroll-lock',
    );
    document.body.classList.remove('guy-body-scroll-lock', 'guy-dialog-scroll-lock');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.overflow = '';
    try {
      sessionStorage.setItem(JUST_UPDATED_KEY, String(Date.now()));
      markSeenVersion(pendingVersionHash);
    } catch {
      // ignore
    }
    await updates.activateUpdate();
    // Hard reload: evita viewport/fixed “pegados” del ciclo anterior en standalone.
    const url = new URL(window.location.href);
    url.searchParams.delete('_sw');
    url.searchParams.set('_sw', String(Date.now()));
    window.location.replace(url.pathname + url.search + url.hash);
  };

  const promptReload = (versionHash?: string | null): void => {
    if (prompting || recentlyUpdated()) return;
    if (versionHash && alreadySeenVersion(versionHash)) return;
    // Ya hay un diálogo de update abierto.
    if (dialog.openDialogs.some((d) => d.componentInstance instanceof AppUpdateDialogComponent)) {
      return;
    }
    prompting = true;
    if (versionHash) pendingVersionHash = versionHash;
    // Páginas públicas (/pedir, /m, reservas, etc.): sin aviso, recarga al toque.
    if (isPublicAppPath(location.pathname || '/')) {
      void activateAndReload().catch(() => {
        prompting = false;
      });
      return;
    }
    const ref = dialog.open(AppUpdateDialogComponent, {
      width: '440px',
      maxWidth: '94vw',
      disableClose: true,
      autoFocus: 'dialog',
      restoreFocus: false,
      hasBackdrop: true,
      closeOnNavigation: false,
      panelClass: ['guy-dialog', 'app-update-dialog-panel'],
      backdropClass: 'app-update-dialog-backdrop',
      data: {
        activate: activateAndReload,
      },
    });
    ref.afterClosed().subscribe(() => {
      prompting = false;
    });
  };

  updates.versionUpdates
    .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
    .subscribe((event) => promptReload(event.latestVersion?.hash ?? null));

  const check = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (prompting || recentlyUpdated()) return;
    void updates.checkForUpdate().catch(() => undefined);
    // No re-prompt solo por reg.waiting: tras Actualizar el worker viejo puede
    // seguir “waiting” un rato y reabría el diálogo en loop. VERSION_READY alcanza.
  };

  check();
  [5_000, 15_000, 35_000].forEach((ms) => setTimeout(check, ms));
  setInterval(check, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  if (push.isEnabled) {
    push.messages.subscribe(() => check());
  }
}

async function refreshSession(): Promise<void> {
  // En links públicos no tocamos la sesión: un /auth/me fallido no debe
  // interferir ni empujar al usuario a login.
  if (typeof location !== 'undefined' && isPublicAppPath(location.pathname || '/')) {
    return;
  }
  const auth = inject(AuthService);
  const notifs = inject(NotificationsInboxService);
  const push = inject(PushNotificationsService);
  if (!auth.isAuthenticated()) return;

  // Demo offline: no /auth/me ni push contra API; solo inbox mock local.
  if (auth.isDemoMode()) {
    notifs.ensureStarted();
    notifs.refresh();
    return;
  }

  const startInbox = (): void => {
    notifs.ensureStarted();
    notifs.refresh();
    void push.refreshStatus();
  };

  try {
    // PWA / red lenta: no esperar infinito ni desloguear por timeout.
    await withTimeout(auth.refreshMe(), 4_000);
    startInbox();
  } catch (err) {
    // Solo token inválido → quitar esa cuenta. Errores de red/timeout mantienen sesión cacheada.
    if (isUnauthorizedError(err)) {
      const stillIn = auth.dropActiveAndSwitch();
      if (stillIn) startInbox();
      return;
    }
    if (!auth.isAuthenticated()) return;
    startInbox();
    void auth
      .refreshMe()
      .then(() => {
        notifs.refresh();
        void push.refreshStatus();
      })
      .catch((retryErr) => {
        if (isUnauthorizedError(retryErr)) {
          const stillIn = auth.dropActiveAndSwitch();
          if (stillIn) {
            notifs.refresh();
            void push.refreshStatus();
          }
        }
      });
  }
}

function startAnalytics(): void {
  inject(AnalyticsService).start();
}

/**
 * Reemplaza BlockScrollStrategy de CDK (deja scrollY en 0 → la página salta al tope)
 * por nuestro body lock, en el enable del overlay (antes del autoFocus).
 */
function createDialogBodyScrollStrategy(bodyLock: BodyScrollLockService): ScrollStrategy {
  let enabled = false;
  return {
    attach: () => undefined,
    enable: () => {
      if (enabled) return;
      enabled = true;
      bodyLock.lock('dialog');
    },
    disable: () => {
      if (!enabled) return;
      enabled = false;
      bodyLock.unlock('dialog');
    },
    detach: () => {
      if (!enabled) return;
      enabled = false;
      bodyLock.unlock('dialog');
    },
  };
}

function dialogDefaultOptions(): MatDialogConfig {
  const bodyLock = inject(BodyScrollLockService);
  // Getter: MatDialog hace `{ ...defaultOptions }` en cada open → strategy nueva.
  return {
    restoreFocus: false,
    autoFocus: 'first-tabbable',
    get scrollStrategy() {
      return createDialogBodyScrollStrategy(bodyLock);
    },
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: LazySentryErrorHandler },
    provideAppInitializer(watchAppUpdates),
    provideAppInitializer(refreshSession),
    provideAppInitializer(startAnalytics),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([
        // Primero: en demo corta la red antes que auth / refresh / notifs.
        demoOverlayInterceptor,
        authInterceptor,
        unauthorizedInterceptor,
        authRefreshInterceptor,
        notificationsRefreshInterceptor,
      ]),
    ),
    { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
    { provide: LOCALE_ID, useValue: 'es-AR' },
    provideNativeDateAdapter(),
    {
      provide: MAT_BUTTON_TOGGLE_DEFAULT_OPTIONS,
      useValue: {
        hideSingleSelectionIndicator: true,
        hideMultipleSelectionIndicator: true,
      },
    },
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    { provide: MAT_DIALOG_DEFAULT_OPTIONS, useFactory: dialogDefaultOptions },
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: {
        duration: 3000,
        horizontalPosition: 'end',
        verticalPosition: 'top',
        panelClass: 'guy-snackbar',
      } satisfies MatSnackBarConfig,
    },
    provideServiceWorker('custom-sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
