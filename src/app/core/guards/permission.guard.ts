import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { ShopContextService } from '../shop/shop-context.service';
import { Permission, canManageShopUsers, defaultHomeRoute, hasShopPermission } from '../auth/auth.models';

/** Permisos que un super admin puede usar sin local seleccionado. */
const GLOBAL_ADMIN_WITHOUT_SHOP: Permission[] = ['shops.manage'];

export const permissionGuard = (permission: Permission): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const shops = inject(ShopContextService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }
    const user = auth.currentUser();
    const shopId = shops.selectedShopId();

    if (!shopId) {
      if (
        auth.isSuperAdmin() &&
        GLOBAL_ADMIN_WITHOUT_SHOP.includes(permission) &&
        hasShopPermission(user, null, permission)
      ) {
        return true;
      }
      return router.createUrlTree([defaultHomeRoute(user, null)]);
    }

    if (!hasShopPermission(user, shopId, permission)) {
      return router.createUrlTree([defaultHomeRoute(user, shopId)]);
    }
    return true;
  };
};

/** Requiere al menos uno de los permisos. */
export const anyPermissionGuard = (...permissions: Permission[]): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const shops = inject(ShopContextService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }
    const user = auth.currentUser();
    const shopId = shops.selectedShopId();
    if (!shopId) {
      return router.createUrlTree([defaultHomeRoute(user, null)]);
    }
    if (permissions.some((p) => hasShopPermission(user, shopId, p))) {
      return true;
    }
    return router.createUrlTree([defaultHomeRoute(user, shopId)]);
  };
};

/** Solo Super admin (OWNER). */
export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const shops = inject(ShopContextService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  if (!auth.isSuperAdmin()) {
    return router.createUrlTree([
      defaultHomeRoute(auth.currentUser(), shops.selectedShopId()),
    ]);
  }
  return true;
};

/** Admin/owner del local activo (o admin global) puede gestionar usuarios. */
export const shopUsersGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const shops = inject(ShopContextService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  const shopId = shops.selectedShopId();
  if (!canManageShopUsers(auth.currentUser(), shopId)) {
    return router.createUrlTree([defaultHomeRoute(auth.currentUser(), shopId)]);
  }
  // Admin de local necesita local; super admin puede entrar sin local (alcance "todos").
  if (!shopId && !auth.isAdmin()) {
    return router.createUrlTree([defaultHomeRoute(auth.currentUser(), shopId)]);
  }
  return true;
};

/** Feature flag del local (reservas / lista de espera / propinas). Combinar con permissionGuard. */
export const shopFeatureGuard = (
  feature: 'reservations' | 'waitingList' | 'tips',
): CanActivateFn => {
  return () => {
    const auth = inject(AuthService);
    const shops = inject(ShopContextService);
    const router = inject(Router);
    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }
    const shopId = shops.selectedShopId();
    const shop = shops.selectedShop();
    const enabled =
      feature === 'reservations'
        ? !!shop?.reservationsEnabled
        : feature === 'waitingList'
          ? !!shop?.waitingListEnabled
          : !!shop?.tipsEnabled;
    if (!shopId || !enabled) {
      return router.createUrlTree([defaultHomeRoute(auth.currentUser(), shopId)]);
    }
    return true;
  };
};
