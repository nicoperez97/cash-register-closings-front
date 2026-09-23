import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { ShopContextService } from '../shop/shop-context.service';
import { Permission, canManageShopUsers, canSeeShopConfigSection, canViewClosingsList, defaultHomeRoute, hasShopPermission, isClosingsCreateOnly, isShopAdministrator } from '../auth/auth.models';
import {
  canAccessAnyPublicPage,
  canAccessPublicPage,
} from '../shop/public-page-access';
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
  feature: 'reservations' | 'waitingList' | 'tips' | 'settlements' | 'onlineOrdering' | 'waiterOrdering',
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
            : feature === 'onlineOrdering'
              ? !!shop?.onlineOrderingEnabled
              : feature === 'waiterOrdering'
                ? !!shop?.waiterOrderingEnabled
                : !!shop?.tipsEnabled;
    if (!shopId || !enabled) {
      return deniedTree(router);
    }
    return true;
  };
};

/** Sección concreta de Configuración del local (identidad, dispositivos, etc.). */
export const shopConfigSectionGuard = (
  section:
    | 'resumen'
    | 'identidad'
    | 'operacion'
    | 'pedidos'
    | 'comanda'
    | 'comanderas'
    | 'dispositivos'
    | 'menu'
    | 'carta'
    | 'avanzado',
): CanActivateFn => {
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
    if (!canSeeShopConfigSection(user, shopId, section)) {
      return deniedTree(router);
    }
    return true;
  };
};

/** Listado Enlaces y copiar: solo admin del local / super admin. */
export const publicPagesLinksGuard: CanActivateFn = () => {
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
  if (!isShopAdministrator(user, shopId)) {
    return deniedTree(router);
  }
  return true;
};

/** Al menos una página pública con Ver. */
export const anyPublicPageGuard: CanActivateFn = () => {
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
  if (!canAccessAnyPublicPage(user, shopId)) {
    return deniedTree(router);
  }
  return true;
};

/** Visor de una página pública concreta. */
export const publicPageViewerGuard: CanActivateFn = (route) => {
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
  const pageId = String(route.paramMap.get('pageId') ?? '').trim();
  if (!canAccessPublicPage(user, shopId, pageId)) {
    return deniedTree(router);
  }
  return true;
};
