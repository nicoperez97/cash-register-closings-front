import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { defaultHomeRoute } from '../auth/auth.models';
import { ShopContextService } from '../shop/shop-context.service';

/**
 * Evita montar la portada (`/`) si ya hay sesión: redirige al home del rol
 * antes de cargar MarketingLanding (si no, la URL ya dice /inicio y se ve la landing).
 */
export const redirectAuthedFromLandingGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  if (!auth.isAuthenticated()) return true;

  const router = inject(Router);
  const shops = inject(ShopContextService);
  const home = defaultHomeRoute(auth.currentUser(), shops.selectedShopId());
  return router.parseUrl(home.startsWith('/') ? home : `/${home}`);
};
