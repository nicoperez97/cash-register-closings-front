import type { ShopSummary, AuthUser } from '../auth/auth.models';
import type { NavChild } from '../layout/sidebar/sidebar';
import { canAccessPublicPage } from './public-page-access';

export type PublicPageRow = {
  id: string;
  label: string;
  description: string;
  path: string;
  url: string;
  icon: string;
  enabled: boolean;
  status: string;
};

/** Catálogo de URLs públicas del local (carta, pedir, reservas, etc.). */
export function buildPublicPages(shop: ShopSummary | null | undefined): PublicPageRow[] {
  if (!shop?.slug) return [];
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const slug = encodeURIComponent(shop.slug);
  const row = (
    id: string,
    label: string,
    description: string,
    path: string,
    icon: string,
    enabled: boolean,
    status: string,
  ): PublicPageRow => ({
    id,
    label,
    description,
    path,
    url: `${origin}${path}`,
    icon,
    enabled,
    status,
  });

  return [
    row(
      'menu',
      'Carta',
      'Menú público del local',
      `/m/${slug}`,
      'restaurant_menu',
      !!shop.menuEnabled,
      shop.menuEnabled ? 'Activa' : 'Desactivada en el local',
    ),
    row(
      'ordering',
      'Pedir',
      'Take away / delivery para clientes',
      `/pedir/${slug}`,
      'shopping_bag',
      !!shop.onlineOrderingEnabled,
      shop.onlineOrderingEnabled ? 'Activa' : 'Pedidos online apagados',
    ),
    row(
      'orderLookup',
      'Consultar pedido',
      'El cliente busca su pedido por código',
      `/mi-pedido/${slug}`,
      'search',
      !!shop.onlineOrderingEnabled,
      shop.onlineOrderingEnabled ? 'Activa' : 'Pedidos online apagados',
    ),
    row(
      'waiter',
      'Comanda mozos',
      'Link /mozo para tomar pedidos en mesa',
      `/mozo/${slug}`,
      'room_service',
      !!shop.waiterOrderingEnabled,
      shop.waiterOrderingEnabled ? 'Activa' : 'Comanda mozos apagada',
    ),
    row(
      'reservationsBoard',
      'Tablero de reservas',
      'Pantalla pública de reservas del día',
      `/r/${slug}`,
      'table_restaurant',
      shop.reservationsEnabled !== false,
      shop.reservationsEnabled === false ? 'Reservas apagadas' : 'Activa',
    ),
    row(
      'reservationSignup',
      'Reservar',
      'Formulario para que el comensal reserve',
      `/reservar/${slug}`,
      'event',
      shop.reservationsEnabled !== false && shop.reservationSignupEnabled !== false,
      shop.reservationsEnabled === false
        ? 'Reservas apagadas'
        : shop.reservationSignupEnabled === false
          ? 'Formulario cerrado'
          : 'Activa',
    ),
    row(
      'reservationLookup',
      'Consultar reserva',
      'El comensal busca su reserva',
      `/mi-reserva/${slug}`,
      'find_in_page',
      shop.reservationsEnabled !== false,
      shop.reservationsEnabled === false ? 'Reservas apagadas' : 'Activa',
    ),
    row(
      'waiting',
      'Lista de espera',
      'Pantalla pública de espera',
      `/w/${slug}`,
      'hourglass_top',
      !!shop.waitingListEnabled,
      shop.waitingListEnabled ? 'Activa' : 'Lista de espera apagada',
    ),
    row(
      'attendance',
      'Presentismo',
      'Marcación pública del personal',
      `/p/${slug}`,
      'event_available',
      !!shop.publicAttendanceEnabled,
      shop.publicAttendanceEnabled ? 'Activa' : 'Presentismo público apagado',
    ),
    row(
      'serviceRules',
      'Normas de servicio',
      'Página pública de normas pre/post servicio',
      `/n/${slug}`,
      'menu_book',
      !!shop.publicServiceRulesEnabled,
      shop.publicServiceRulesEnabled ? 'Activa' : 'Normas públicas apagadas',
    ),
  ];
}

/** Hojas del menú lateral: páginas activas + permiso Ver de esa página. */
export function publicPagesNavChildren(
  shop: ShopSummary | null | undefined,
  user?: AuthUser | null,
  shopId?: string | null,
): NavChild[] {
  return buildPublicPages(shop)
    .filter((p) => p.enabled)
    .filter((p) => !user || canAccessPublicPage(user, shopId ?? null, p.id))
    .map((p) => ({
      label: p.label,
      route: `/admin/public-pages/${p.id}`,
      icon: p.icon,
    }));
}
