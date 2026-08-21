import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NotificationsInboxService } from '../../features/payments/notifications-inbox.service';

function shouldRefreshNotifications(url: string, method: string): boolean {
  if (!url.startsWith(environment.apiUrl)) return false;
  // Evitar bucle: las propias llamadas de notificaciones no re-disparan refresh.
  if (url.includes('/notifications')) return false;
  // Auth / health no aportan contexto de inbox.
  if (url.includes('/auth/login') || url.includes('/auth/google') || url.includes('/auth/refresh')) {
    return false;
  }
  if (method === 'OPTIONS' || method === 'HEAD') return false;
  return true;
}

/**
 * Tras cualquier respuesta OK a la API, pide actualizar el contador de notificaciones.
 */
export const notificationsRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);
  return next(req).pipe(
    tap({
      next: (event) => {
        if (!(event instanceof HttpResponse)) return;
        if (!shouldRefreshNotifications(req.url, req.method)) return;
        // Lazy + microtask: evita DI circular con HttpClient y no bloquea la respuesta.
        queueMicrotask(() => {
          try {
            injector.get(NotificationsInboxService).refresh();
          } catch {
            /* ignore */
          }
        });
      },
    }),
  );
};
