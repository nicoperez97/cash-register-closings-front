/** Submódulos de Configuración del local (hub + rutas hijas). */
export type AdminShopSectionId =
  | 'identidad'
  | 'operacion'
  | 'pedidos'
  | 'comanda'
  | 'comanderas'
  | 'dispositivos'
  | 'menu'
  | 'avanzado';

export interface AdminShopSection {
  id: AdminShopSectionId;
  path: string;
  label: string;
  icon: string;
  /** Una frase en el hub. */
  blurb: string;
  /** Subtítulo del page header al abrir el submódulo. */
  subtitle: string;
}

export const ADMIN_SHOP_SECTIONS: readonly AdminShopSection[] = [
  {
    id: 'identidad',
    path: 'identidad',
    label: 'Identidad',
    icon: 'badge',
    blurb: 'Nombre, logo, colores y mails del local.',
    subtitle: 'Cómo se ve y cómo te contactan: marca, logo y notificaciones por correo.',
  },
  {
    id: 'operacion',
    path: 'operacion',
    label: 'Operación',
    icon: 'schedule',
    blurb: 'Turnos de caja, presentismo, francos y módulos públicos.',
    subtitle:
      'Día a día del local: caja, horarios del personal, producción y qué módulos están activos.',
  },
  {
    id: 'pedidos',
    path: 'pedidos',
    label: 'Pedidos',
    icon: 'shopping_bag',
    blurb: 'Página /pedir, take away, delivery, horarios, zonas y pagos online.',
    subtitle: 'Pedidos online: página pública, horarios, zonas y medios de pago.',
  },
  {
    id: 'comanda',
    path: 'comanda',
    label: 'Comandas',
    icon: 'room_service',
    blurb: 'Comanda mozos: link /mozo, pagos de mesa y permisos.',
    subtitle:
      'Operación → Comanda y /mozo: activación, medios de pago al cerrar y qué puede hacer cada canal.',
  },
  {
    id: 'comanderas',
    path: 'comanderas',
    label: 'Comanderas',
    icon: 'print',
    blurb: 'Token e instalador de Cierres-Comandas. Con Ver ya se puede regenerar el token.',
    subtitle:
      'Generá o regenerá el token (también con permiso Ver), descargá el instalador y pegalo en Cierres-Comandas → Conexión.',
  },
  {
    id: 'dispositivos',
    path: 'dispositivos',
    label: 'Cuentas del local',
    icon: 'account_balance_wallet',
    blurb: 'Cuentas del cierre y posnets.',
    subtitle: 'Lista compacta: destino y posnets por cuenta del cierre.',
  },
  {
    id: 'menu',
    path: 'menu',
    label: 'Menú',
    icon: 'menu',
    blurb: 'Menú lateral y accesos rápidos de la barra.',
    subtitle: 'Menú lateral y atajos de la toolbar. Guardá para aplicar los cambios.',
  },
  {
    id: 'avanzado',
    path: 'avanzado',
    label: 'Avanzado',
    icon: 'tune',
    blurb: 'Activar o desactivar el local y herramientas de dump.',
    subtitle: 'Estado del local y, si sos super admin, dump y reset.',
  },
] as const;

export function adminShopSectionByPath(path: string): AdminShopSection | undefined {
  return ADMIN_SHOP_SECTIONS.find((s) => s.path === path);
}
