import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { ShopContextService } from '../shop/shop-context.service';
import { Permission, canManageShopUsers, defaultHomeRoute, hasShopPermission } from '../auth/auth.models';

export const permissionGuard = (permission: Permission): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const shops = inject(ShopContextService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }
    const shopId = shops.selectedShopId();
    if (!hasShopPermission(auth.currentUser(), shopId, permission)) {
      return router.createUrlTree([defaultHomeRoute(auth.currentUser(), shopId)]);
    }
    return true;
  };
};

/** Admin/owner del local activo puede gestionar usuarios. */
export const shopUsersGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const shops = inject(ShopContextService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  if (!canManageShopUsers(auth.currentUser(), shops.selectedShopId())) {
    return router.createUrlTree([
      defaultHomeRoute(auth.currentUser(), shops.selectedShopId()),
    ]);
  }
  return true;
};
