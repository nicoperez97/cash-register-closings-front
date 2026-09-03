import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  LOCALE_ID,
} from '@angular/core';
import { provideRouter, TitleStrategy } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker, SwPush, SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { MatPaginatorIntl } from '@angular/material/paginator';
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
import { createSpanishPaginatorIntl } from './shared/i18n/spanish-paginator-intl';
import { authInterceptor } from './core/auth/auth.interceptor';
import { unauthorizedInterceptor } from './core/http/unauthorized.interceptor';
import { authRefreshInterceptor } from './core/http/auth-refresh.interceptor';
import { notificationsRefreshInterceptor } from './core/http/notifications-refresh.interceptor';
import { AuthService } from './core/auth/auth.service';
import { isPublicAppPath } from './core/routing/public-paths';
import { BodyScrollLockService } from './shared/services/body-scroll-lock.service';
import { AppUpdateDialogComponent } from './shared/components/app-update-dialog';
import { NotificationsInboxService } from './features/payments/notifications-inbox.service';
import { PushNotificationsService } from './features/payments/push-notifications.service';

registerLocaleData(localeEsAr);

function watchAppUpdates(): void {
  const updates = inject(SwUpdate);
  const dialog = inject(MatDialog);
  const push = inject(SwPush);
  if (!updates.isEnabled) return;

  let prompting = false;

  const promptReload = (): void => {
    if (prompting) return;
    prompting = true;
    dialog.open(AppUpdateDialogComponent, {
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
        activate: async () => {
          // Limpiar locks de dialog antes del reload (PWA iOS a veces conserva estilos).
          document.documentElement.classList.remove(
            'guy-body-scroll-lock',
            'guy-dialog-scroll-lock',
          );
          document.body.classList.remove('guy-body-scroll-lock', 'guy-dialog-scroll-lock');
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.overflow = '';
          await updates.activateUpdate();
          // Hard reload: evita viewport/fixed “pegados” del ciclo anterior en standalone.
          const url = new URL(window.location.href);
          url.searchParams.set('_sw', String(Date.now()));
          window.location.replace(url.toString());
        },
      },
    });
  };

  updates.versionUpdates
    .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
    .subscribe(() => promptReload());

  const check = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void updates.checkForUpdate().catch(() => undefined);
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      void navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) promptReload();
      });
    }
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
  try {
    await auth.refreshMe();
    notifs.ensureStarted();
    notifs.refresh();
    void push.refreshStatus();
  } catch {
    auth.logout();
  }
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
    provideAppInitializer(watchAppUpdates),
    provideAppInitializer(refreshSession),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([
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
    { provide: MatPaginatorIntl, useFactory: createSpanishPaginatorIntl },
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
