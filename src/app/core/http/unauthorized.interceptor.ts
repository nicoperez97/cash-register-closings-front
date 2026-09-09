import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { isPublicApiUrl, isPublicAppPath } from '../routing/public-paths';
import { persistReturnUrl } from '../../features/closings/closing-form-draft';

/** Evita logout en cascada si varias requests fallan 401 a la vez (PWA / wake). */
let lastUnauthorizedLogoutAt = 0;

/**
 * Si el token venció (401), manda a login y guarda a dónde volver
 * para no perder pantallas largas como el cierre.
 * No trata status 0 / 5xx / timeout como sesión inválida.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !isPublicApiUrl(req.url)) {
        const here = router.url || '/';
        if (!isPublicAppPath(here)) {
          const now = Date.now();
          if (now - lastUnauthorizedLogoutAt > 2_000) {
            lastUnauthorizedLogoutAt = now;
            persistReturnUrl(here);
            auth.logout();
            void router.navigate(['/login'], {
              queryParams: { returnUrl: here, reason: 'session' },
            });
          }
        }
      }
      return throwError(() => err);
    }),
  );
};
