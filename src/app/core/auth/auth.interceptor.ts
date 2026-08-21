import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { isPublicApiUrl } from '../routing/public-paths';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (isPublicApiUrl(req.url)) {
    return next(req);
  }
  const auth = inject(AuthService);
  const token = auth.getToken();
  if (!token) return next(req);
  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  );
};
