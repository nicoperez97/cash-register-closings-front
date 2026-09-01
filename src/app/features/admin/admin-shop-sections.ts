/** Submódulos de Configuración del local (hub + rutas hijas). */
export type AdminShopSectionId =
  | 'identidad'
  | 'operacion'
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
    blurb: 'Turnos de caja, presentismo, multiplicador de feriado, francos y módulos públicos.',
    subtitle:
      'Día a día del local: caja, horarios del personal, producción y qué módulos están activos.',
  },
  {
    id: 'dispositivos',
    path: 'dispositivos',
    label: 'Dispositivos',
    icon: 'point_of_sale',
    blurb: 'Posnets y cuentas aparte del cierre.',
    subtitle: 'Terminales de cobro y fuentes que no entran al total declarado (Pedidos Ya, etc.).',
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
