import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

function shouldRefreshAuth(url: string, method: string): boolean {
  if (!url.startsWith(environment.apiUrl)) return false;
  if (method === 'OPTIONS' || method === 'HEAD') return false;
  // Evitar bucle / ruido con el propio /auth/me y login.
  if (url.includes('/auth/me')) return false;
  if (url.includes('/auth/login')) return false;
  if (url.includes('/auth/refresh')) return false;
  return true;
}

/**
 * Tras cualquier respuesta OK a la API, revalida roles/permisos del usuario
 * (debounce en AuthService para no spamear /auth/me).
 */
export const authRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);
  return next(req).pipe(
    tap({
      next: (event) => {
        if (!(event instanceof HttpResponse)) return;
        if (event.status < 200 || event.status >= 300) return;
        if (!shouldRefreshAuth(req.url, req.method)) return;
        queueMicrotask(() => {
          try {
            injector.get(AuthService).scheduleRefreshMe();
          } catch {
            /* ignore */
          }
        });
      },
    }),
  );
};
