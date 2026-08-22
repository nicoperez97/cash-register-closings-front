import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { isPublicApiUrl, isPublicAppPath } from '../routing/public-paths';
import { persistReturnUrl } from '../../features/closings/closing-form-draft';

/**
 * Si el token venció (401), manda a login y guarda a dónde volver
 * para no perder pantallas largas como el cierre.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !isPublicApiUrl(req.url)) {
        const here = router.url || '/';
        if (!isPublicAppPath(here)) {
          persistReturnUrl(here);
          auth.logout();
          void router.navigate(['/login'], {
            queryParams: { returnUrl: here, reason: 'session' },
          });
        }
      }
      return throwError(() => err);
    }),
  );
};
