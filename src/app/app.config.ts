import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, TitleStrategy, withPreloading, PreloadAllModules } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker, SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { filter } from 'rxjs';

import { routes } from './app.routes';
import { AppTitleStrategy } from './core/routing/app-title.strategy';
import { createSpanishPaginatorIntl } from './shared/i18n/spanish-paginator-intl';
import { authInterceptor } from './core/auth/auth.interceptor';

function watchAppUpdates(): void {
  const updates = inject(SwUpdate);
  const snackBar = inject(MatSnackBar);
  if (!updates.isEnabled) return;

  const promptReload = (): void => {
    snackBar
      .open('Hay una nueva versión disponible', 'Actualizar', {
        duration: 0,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      })
      .onAction()
      .subscribe(() => {
        void updates.activateUpdate().then(() => document.location.reload());
      });
  };

  updates.versionUpdates
    .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
    .subscribe(() => promptReload());

  // Revisa periódicamente y al volver a la pestaña
  void updates.checkForUpdate();
  setInterval(() => void updates.checkForUpdate(), 6 * 60 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void updates.checkForUpdate();
    }
  });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAppInitializer(watchAppUpdates),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: MAT_DATE_LOCALE, useValue: 'es-UY' },
    provideNativeDateAdapter(),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    { provide: MatPaginatorIntl, useFactory: createSpanishPaginatorIntl },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
