import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { isPublicAppPath } from '../routing/public-paths';

export const authGuard: CanActivateFn = (_route, state) => {
  if (isPublicAppPath(state.url)) {
    return true;
  }

  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};
