/** Kinds instalables (alineados con API `public-page-pwa.ts`). */
export type PublicPagePwaKind =
  | 'menu'
  | 'ordering'
  | 'orderLookup'
  | 'waiter'
  | 'reservations'
  | 'reservationSignup'
  | 'reservationLookup'
  | 'waiting'
  | 'attendance'
  | 'serviceRules';

export type PublicPagePwaMeta = {
  pathPrefix: string;
  fullLabel: string;
  shortLabel: string;
  /** Título del banner de instalación. */
  bannerTitle: string;
  defaultAccent: string;
  statusScheme: 'light' | 'dark';
  /** Color de status bar inicial (antes de conocer accent). */
  statusFallback: string;
};

export const PUBLIC_PAGE_PWA_META: Record<PublicPagePwaKind, PublicPagePwaMeta> = {
  menu: {
    pathPrefix: 'm',
    fullLabel: 'Carta',
    shortLabel: 'Carta',
    bannerTitle: 'App Carta',
    defaultAccent: '#1D65A0',
    statusScheme: 'light',
    statusFallback: '#ffffff',
  },
  ordering: {
    pathPrefix: 'pedir',
    fullLabel: 'Pedir',
    shortLabel: 'Pedir',
    bannerTitle: 'App Pedir',
    defaultAccent: '#2e7d32',
    statusScheme: 'light',
    statusFallback: '#eef1ee',
  },
  orderLookup: {
    pathPrefix: 'mi-pedido',
    fullLabel: 'Consultar pedido',
    shortLabel: 'Mi pedido',
    bannerTitle: 'App Mi pedido',
    defaultAccent: '#2e7d32',
    statusScheme: 'light',
    statusFallback: '#eef1ee',
  },
  waiter: {
    pathPrefix: 'mozo',
    fullLabel: 'Comanda mozos',
    shortLabel: 'Comanda',
    bannerTitle: 'App Comanda',
    defaultAccent: '#1D65A0',
    statusScheme: 'light',
    statusFallback: '#eef1ee',
  },
  reservations: {
    pathPrefix: 'r',
    fullLabel: 'Reservas',
    shortLabel: 'Reservas',
    bannerTitle: 'App Reservas',
    defaultAccent: '#c45c26',
    statusScheme: 'dark',
    statusFallback: '#0e0c0b',
  },
  reservationSignup: {
    pathPrefix: 'reservar',
    fullLabel: 'Reservar',
    shortLabel: 'Reservar',
    bannerTitle: 'App Reservar',
    defaultAccent: '#c45c26',
    statusScheme: 'dark',
    statusFallback: '#0e0c0b',
  },
  reservationLookup: {
    pathPrefix: 'mi-reserva',
    fullLabel: 'Consultar reserva',
    shortLabel: 'Mi reserva',
    bannerTitle: 'App Mi reserva',
    defaultAccent: '#c45c26',
    statusScheme: 'dark',
    statusFallback: '#0e0c0b',
  },
  waiting: {
    pathPrefix: 'w',
    fullLabel: 'Lista de espera',
    shortLabel: 'Espera',
    bannerTitle: 'App Lista de espera',
    defaultAccent: '#2e7d32',
    statusScheme: 'dark',
    statusFallback: '#0e0c0b',
  },
  attendance: {
    pathPrefix: 'p',
    fullLabel: 'Presentismo',
    shortLabel: 'Presentismo',
    bannerTitle: 'App Presentismo',
    defaultAccent: '#1D65A0',
    statusScheme: 'light',
    statusFallback: '#ffffff',
  },
  serviceRules: {
    pathPrefix: 'n',
    fullLabel: 'Normas de servicio',
    shortLabel: 'Normas',
    bannerTitle: 'App Normas',
    defaultAccent: '#1D65A0',
    statusScheme: 'light',
    statusFallback: '#ffffff',
  },
};

export function publicPageStartPath(kind: PublicPagePwaKind, slug: string): string {
  const meta = PUBLIC_PAGE_PWA_META[kind];
  return `/${meta.pathPrefix}/${encodeURIComponent(slug)}`;
}

/** true si pathname sigue dentro del scope de esa PWA (incluye rutas hijas). */
export function isWithinPublicPageScope(
  kind: PublicPagePwaKind,
  slug: string,
  pathname: string,
): boolean {
  const start = publicPageStartPath(kind, slug);
  const path = pathname || '';
  return path === start || path.startsWith(`${start}/`);
}
