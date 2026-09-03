import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { ShopContextService } from '../shop/shop-context.service';
import { Permission, canManageShopUsers, canViewClosingsList, defaultHomeRoute, hasShopPermission, isClosingsCreateOnly } from '../auth/auth.models';
import { SettlementsInboxService } from '../../features/settlements/settlements-inbox.service';

/** Permisos que un super admin puede usar sin local seleccionado. */
const GLOBAL_ADMIN_WITHOUT_SHOP: Permission[] = ['shops.manage'];

function deniedTree(router: Router): UrlTree {
  const from = router.url?.split('?')[0] || '';
  return router.createUrlTree(['/forbidden'], from ? { queryParams: { from } } : {});
}

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
      return deniedTree(router);
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
    return deniedTree(router);
  };
};

/** Listado de cierres: no para usuarios con permiso solo de crear. */
export const closingsListGuard: CanActivateFn = () => {
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
  if (isClosingsCreateOnly(user, shopId)) {
    return router.createUrlTree(['/closings/new']);
  }
  if (!canViewClosingsList(user, shopId)) {
    return deniedTree(router);
  }
  return true;
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
    return deniedTree(router);
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
    return deniedTree(router);
  }
  // Admin de local necesita local; super admin puede entrar sin local (alcance "todos").
  if (!shopId && !auth.isAdmin()) {
    return router.createUrlTree([defaultHomeRoute(auth.currentUser(), shopId)]);
  }
  return true;
};

/** Feature flag del local (reservas / lista de espera / propinas / rendiciones). Combinar con permissionGuard. */
export const shopFeatureGuard = (
  feature: 'reservations' | 'waitingList' | 'tips' | 'settlements',
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
          : feature === 'settlements'
            ? !!shop?.settlementsEnabled || inject(SettlementsInboxService).enabled()
            : !!shop?.tipsEnabled;
    if (!shopId || !enabled) {
      return deniedTree(router);
    }
    return true;
  };
};
