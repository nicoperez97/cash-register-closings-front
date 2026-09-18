import type { AuthUser, Permission } from '../auth/auth.models';
import { hasShopPermission } from '../auth/auth.models';

/** Acceso admin a cada URL pública (permiso Off/Ver por página). */
export const PUBLIC_PAGE_ACCESS = [
  {
    pageId: 'menu',
    moduleKey: 'publicMenu',
    permission: 'publicMenu.read',
    label: 'Carta pública',
    icon: 'restaurant_menu',
    hint: 'Ver /m de la carta en el admin',
  },
  {
    pageId: 'ordering',
    moduleKey: 'publicOrdering',
    permission: 'publicOrdering.read',
    label: 'Pedir (público)',
    icon: 'shopping_bag',
    hint: 'Ver /pedir en el admin',
  },
  {
    pageId: 'orderLookup',
    moduleKey: 'publicOrderLookup',
    permission: 'publicOrderLookup.read',
    label: 'Consultar pedido',
    icon: 'search',
    hint: 'Ver /mi-pedido en el admin',
  },
  {
    pageId: 'waiter',
    moduleKey: 'publicWaiter',
    permission: 'publicWaiter.read',
    label: 'Comanda mozos (link)',
    icon: 'room_service',
    hint: 'Ver /mozo en el admin',
  },
  {
    pageId: 'reservationsBoard',
    moduleKey: 'publicReservationsBoard',
    permission: 'publicReservationsBoard.read',
    label: 'Tablero de reservas',
    icon: 'table_restaurant',
    hint: 'Ver /r en el admin',
  },
  {
    pageId: 'reservationSignup',
    moduleKey: 'publicReservationSignup',
    permission: 'publicReservationSignup.read',
    label: 'Reservar (público)',
    icon: 'event',
    hint: 'Ver /reservar en el admin',
  },
  {
    pageId: 'reservationLookup',
    moduleKey: 'publicReservationLookup',
    permission: 'publicReservationLookup.read',
    label: 'Consultar reserva',
    icon: 'find_in_page',
    hint: 'Ver /mi-reserva en el admin',
  },
  {
    pageId: 'waiting',
    moduleKey: 'publicWaiting',
    permission: 'publicWaiting.read',
    label: 'Lista de espera (pública)',
    icon: 'hourglass_top',
    hint: 'Ver /w en el admin',
  },
  {
    pageId: 'attendance',
    moduleKey: 'publicAttendance',
    permission: 'publicAttendance.read',
    label: 'Presentismo público',
    icon: 'event_available',
    hint: 'Ver /p en el admin',
  },
  {
    pageId: 'serviceRules',
    moduleKey: 'publicNormas',
    permission: 'publicNormas.read',
    label: 'Normas públicas',
    icon: 'menu_book',
    hint: 'Ver /n en el admin',
  },
] as const;

export type PublicPageId = (typeof PUBLIC_PAGE_ACCESS)[number]['pageId'];
export type PublicPageModuleKey = (typeof PUBLIC_PAGE_ACCESS)[number]['moduleKey'];
export type PublicPagePermission = (typeof PUBLIC_PAGE_ACCESS)[number]['permission'];

export const PUBLIC_PAGE_PERMISSIONS: Permission[] = PUBLIC_PAGE_ACCESS.map(
  (p) => p.permission as Permission,
);

export function publicPageAccessById(pageId: string) {
  return PUBLIC_PAGE_ACCESS.find((p) => p.pageId === pageId) ?? null;
}

export function permissionForPublicPage(pageId: string): Permission | null {
  return (publicPageAccessById(pageId)?.permission as Permission | undefined) ?? null;
}

export function canAccessPublicPage(
  user: AuthUser | null,
  shopId: string | null,
  pageId: string,
): boolean {
  const perm = permissionForPublicPage(pageId);
  if (!perm) return false;
  return hasShopPermission(user, shopId, perm);
}

export function canAccessAnyPublicPage(user: AuthUser | null, shopId: string | null): boolean {
  return PUBLIC_PAGE_PERMISSIONS.some((p) => hasShopPermission(user, shopId, p));
}
