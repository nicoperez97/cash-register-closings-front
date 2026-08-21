import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

function shouldRefreshAuth(url: string, method: string): boolean {
  if (!url.startsWith(environment.apiUrl)) return false;
  // Solo tras cambios: un GET que dispare /auth/me re-ejecuta effects y genera loops.
  const m = method.toUpperCase();
  if (m !== 'POST' && m !== 'PUT' && m !== 'PATCH' && m !== 'DELETE') return false;
  if (url.includes('/auth/me')) return false;
  if (url.includes('/auth/login')) return false;
  if (url.includes('/auth/google')) return false;
  if (url.includes('/auth/refresh')) return false;
  if (url.includes('/auth/favorite-shop')) return false;
  return true;
}

/**
 * Tras mutaciones OK a la API, revalida roles/permisos del usuario
 * (debounce en AuthService).
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
