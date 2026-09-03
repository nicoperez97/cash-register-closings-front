import type { NavChild, NavItem } from './sidebar/sidebar';

export type ShopNavConfig = {
  groups?: Array<{ id: string; label?: string }>;
  itemGroup?: Record<string, string>;
  itemOrder?: Record<string, string[]>;
  hidden?: string[];
  /** Nombres custom de ítems del catálogo. */
  itemLabels?: Record<string, string>;
};

export const NAV_GROUP_DEFS: Array<{ id: string; label: string; icon: string }> = [
  { id: 'operacion', label: 'Operación', icon: 'today' },
  { id: 'cuentas', label: 'Cuentas', icon: 'account_balance' },
  { id: 'salon', label: 'Salón', icon: 'table_restaurant' },
  { id: 'stock', label: 'Stock', icon: 'inventory_2' },
  { id: 'asistencia', label: 'Asistencia', icon: 'event_available' },
  { id: 'pagos', label: 'Pagos', icon: 'payments' },
  { id: 'reportes', label: 'Reportes', icon: 'insights' },
  { id: 'personal', label: 'Personal', icon: 'groups' },
  { id: 'admin', label: 'Administración', icon: 'settings' },
];

/** Catálogo de ítems del menú (id estable ↔ ruta, label e ícono únicos). */
export type NavItemDef = {
  id: string;
  label: string;
  icon: string;
  defaultGroup: string | null;
  route: string;
  /** Prefijos adicionales que mapean a este id (p. ej. /closings/123). */
  pathPrefixes?: string[];
};

export const NAV_ITEM_DEFS: NavItemDef[] = [
  { id: 'home', label: 'Inicio', icon: 'home', defaultGroup: null, route: '/' },
  { id: 'closings', label: 'Cierres', icon: 'point_of_sale', defaultGroup: 'operacion', route: '/closings', pathPrefixes: ['/closings'] },
  { id: 'cashWithdrawals', label: 'A retirar', icon: 'payments', defaultGroup: 'operacion', route: '/cash-withdrawals' },
  { id: 'settlements', label: 'Rendiciones', icon: 'account_balance_wallet', defaultGroup: 'operacion', route: '/settlements' },
  { id: 'tips', label: 'Propinas', icon: 'volunteer_activism', defaultGroup: 'operacion', route: '/tips' },
  { id: 'serviceRules', label: 'Normas de servicio', icon: 'menu_book', defaultGroup: 'operacion', route: '/service-rules' },
  { id: 'expenses', label: 'Gastos', icon: 'payments', defaultGroup: 'cuentas', route: '/expenses' },
  { id: 'incomes', label: 'Ingresos', icon: 'south_west', defaultGroup: 'cuentas', route: '/incomes' },
  { id: 'accountTransfers', label: 'Movimientos entre cuentas', icon: 'swap_horiz', defaultGroup: 'cuentas', route: '/account-transfers' },
  { id: 'transactions', label: 'Transacciones', icon: 'receipt_long', defaultGroup: 'cuentas', route: '/transactions' },
  { id: 'partnerSplits', label: 'División de socios', icon: 'groups', defaultGroup: 'cuentas', route: '/partner-splits' },
  { id: 'splits', label: 'Divisiones', icon: 'history', defaultGroup: 'cuentas', route: '/splits' },
  { id: 'reservations', label: 'Reservas', icon: 'table_restaurant', defaultGroup: 'salon', route: '/reservations' },
  { id: 'waitingList', label: 'Lista de espera', icon: 'hourglass_top', defaultGroup: 'salon', route: '/waiting-list' },
  { id: 'diagrama', label: 'Diagrama', icon: 'grid_view', defaultGroup: 'salon', route: '/salon/diagrama' },
  { id: 'salonRules', label: 'Reglas', icon: 'tune', defaultGroup: 'salon', route: '/salon/reglas' },
  { id: 'salonHours', label: 'Horarios', icon: 'schedule', defaultGroup: 'salon', route: '/salon/horarios' },
  { id: 'stockFood', label: 'Alimentos', icon: 'inventory', defaultGroup: 'stock', route: '/stock' },
  { id: 'beverageStock', label: 'Bebidas', icon: 'local_bar', defaultGroup: 'stock', route: '/beverage-stock' },
  { id: 'shortages', label: 'Faltantes', icon: 'error_outline', defaultGroup: 'stock', route: '/shortages' },
  { id: 'orders', label: 'Pedidos', icon: 'local_shipping', defaultGroup: 'stock', route: '/orders' },
  { id: 'attendance', label: 'Presentismo de salón', icon: 'storefront', defaultGroup: 'asistencia', route: '/attendance' },
  { id: 'productionAttendance', label: 'Horas de cocina', icon: 'restaurant', defaultGroup: 'asistencia', route: '/production-attendance' },
  { id: 'myProduction', label: 'Mis horas', icon: 'restaurant', defaultGroup: null, route: '/my-production' },
  { id: 'reimbursements', label: 'Reintegros', icon: 'receipt_long', defaultGroup: 'personal', route: '/reimbursements' },
  { id: 'paymentsSuppliers', label: 'A proveedores', icon: 'local_shipping', defaultGroup: 'pagos', route: '/payments/suppliers' },
  { id: 'paymentsServices', label: 'A servicios', icon: 'home_repair_service', defaultGroup: 'pagos', route: '/payments/services' },
  { id: 'paymentsEmployees', label: 'A empleados', icon: 'badge', defaultGroup: 'pagos', route: '/payments/employees' },
  { id: 'paymentsPartners', label: 'A socios', icon: 'groups', defaultGroup: 'pagos', route: '/payments/partners' },
  { id: 'suppliers', label: 'Proveedores', icon: 'inventory_2', defaultGroup: 'pagos', route: '/suppliers' },
  { id: 'services', label: 'Servicios', icon: 'home_repair_service', defaultGroup: 'pagos', route: '/services' },
  { id: 'reports', label: 'Cierres', icon: 'insights', defaultGroup: 'reportes', route: '/reports' },
  { id: 'reportsConcepts', label: 'Conceptos', icon: 'category', defaultGroup: 'reportes', route: '/reports/concepts' },
  { id: 'reportsProducts', label: 'Ventas POS', icon: 'restaurant_menu', defaultGroup: 'reportes', route: '/reports/products' },
  { id: 'reportsStats', label: 'Estadísticas', icon: 'analytics', defaultGroup: 'reportes', route: '/reports/stats' },
  { id: 'employees', label: 'Empleados', icon: 'badge', defaultGroup: 'personal', route: '/employees' },
  { id: 'vacations', label: 'Vacaciones', icon: 'beach_access', defaultGroup: 'personal', route: '/vacations' },
  { id: 'candidates', label: 'CVs / Candidatos', icon: 'person_search', defaultGroup: 'personal', route: '/candidates' },
  { id: 'payroll', label: 'Sueldos', icon: 'request_quote', defaultGroup: 'personal', route: '/salaries' },
  { id: 'commissions', label: 'Comisiones', icon: 'percent', defaultGroup: 'personal', route: '/commissions' },
  { id: 'adminShops', label: 'Locales', icon: 'add_business', defaultGroup: 'admin', route: '/admin/shops' },
  { id: 'adminShop', label: 'Configuración del local', icon: 'storefront', defaultGroup: 'admin', route: '/admin/shop' },
  { id: 'adminMessages', label: 'Mensajes', icon: 'campaign', defaultGroup: 'admin', route: '/admin/messages' },
  { id: 'adminMenu', label: 'Carta', icon: 'restaurant_menu', defaultGroup: 'admin', route: '/admin/menu' },
  { id: 'adminQr', label: 'QR', icon: 'qr_code_2', defaultGroup: 'admin', route: '/admin/qr' },
  { id: 'adminInstrucciones', label: 'Instrucciones', icon: 'menu_book', defaultGroup: 'admin', route: '/admin/instrucciones' },
  { id: 'adminUsers', label: 'Usuarios', icon: 'manage_accounts', defaultGroup: 'admin', route: '/admin/users' },
  { id: 'adminUserActivity', label: 'Actividad', icon: 'history', defaultGroup: 'admin', route: '/admin/user-activity' },
  { id: 'adminAccounts', label: 'Cuentas', icon: 'account_balance', defaultGroup: 'admin', route: '/admin/accounts' },
  { id: 'adminConcepts', label: 'Conceptos', icon: 'category', defaultGroup: 'admin', route: '/admin/concepts' },
  { id: 'adminSalesSystems', label: 'Sistemas', icon: 'dns', defaultGroup: 'admin', route: '/admin/sales-systems' },
  { id: 'adminPosProducts', label: 'Platos y rubros', icon: 'restaurant', defaultGroup: 'admin', route: '/admin/pos-products' },
];

const NAV_ITEM_BY_ID = new Map(NAV_ITEM_DEFS.map((d) => [d.id, d]));

export function navItemById(id: string): NavItemDef | undefined {
  return NAV_ITEM_BY_ID.get(id);
}

export function navItemLabel(id: string, fallback = id): string {
  return NAV_ITEM_BY_ID.get(id)?.label ?? fallback;
}

/** Hoja de menú desde el catálogo (label/ícono/ruta únicos). */
export function navLeaf(
  id: string,
  extra?: Partial<NavChild>,
): NavChild | null {
  const d = NAV_ITEM_BY_ID.get(id);
  if (!d) return null;
  return { label: d.label, route: d.route, icon: d.icon, ...extra };
}

/**
 * Atajos que no son un ítem del menú (acción o ruta corta).
 * Labels/íconos alineados al catálogo cuando aplica.
 */
export const APP_SHORTCUT_DEFS = [
  {
    id: 'new-closing',
    label: 'Nuevo cierre',
    icon: 'point_of_sale',
    route: '/closings/new',
  },
  {
    id: 'quick-expense',
    label: 'Gasto rápido',
    icon: 'payments',
    action: 'quick-expense' as const,
  },
  {
    id: 'payments',
    label: 'Pagos',
    icon: 'payments',
    route: '/g/pagos',
  },
] as const;

export function appShortcutById(id: string) {
  return APP_SHORTCUT_DEFS.find((d) => d.id === id);
}

const GROUP_ROUTE_PREFIX = '__group_';

function groupRoute(id: string): string {
  return `${GROUP_ROUTE_PREFIX}${id}`;
}

export function groupIdFromRoute(route: string): string | null {
  if (!route.startsWith(GROUP_ROUTE_PREFIX)) return null;
  return route.slice(GROUP_ROUTE_PREFIX.length) || null;
}

/** Pantalla con los módulos de un grupo del menú. */
export function navGroupPagePath(groupId: string): string {
  return `/g/${groupId}`;
}

export function navItemIdForRoute(route: string): string | null {
  const path = route.split('?')[0] || route;
  if (path === '/' || path === '') return 'home';
  let best: { id: string; len: number } | null = null;
  for (const def of NAV_ITEM_DEFS) {
    if (def.id === 'home') continue;
    const candidates = [def.route, ...(def.pathPrefixes ?? [])];
    for (const c of candidates) {
      if (path === c || path.startsWith(`${c}/`)) {
        if (!best || c.length > best.len) best = { id: def.id, len: c.length };
      }
    }
  }
  return best?.id ?? null;
}

/**
 * Prioridad: personalización del usuario en el local (`myNavConfig`),
 * si no hay override → menú del local (`navConfig`).
 */
export function effectiveNavConfig(shop?: {
  myNavConfig?: ShopNavConfig | null;
  navConfig?: ShopNavConfig | null;
} | null): ShopNavConfig | null {
  if (!shop) return null;
  return shop.myNavConfig ?? shop.navConfig ?? null;
}

export function isNavPathHidden(
  path: string,
  config?: ShopNavConfig | null,
): boolean {
  if (!config?.hidden?.length) return false;
  const id = navItemIdForRoute(path);
  if (!id || id === 'home') return false;
  return config.hidden.includes(id);
}

type Leaf = NavChild & { navId: string; sourceGroupId: string | null };

function leafFromChild(child: NavChild, groupId: string | null): Leaf | null {
  const navId = navItemIdForRoute(child.route);
  if (!navId || navId === 'home') return null;
  return { ...child, navId, sourceGroupId: groupId };
}

/**
 * Aplica orden de grupos, `itemGroup`, `itemOrder` y `hidden` del local.
 * Home (`/`) queda fijo primero y no se oculta ni mueve.
 */
/** Click del grupo = grilla `/g/:id`, no el primer hijo (así vale con o sin menú del local). */
export function assignGroupHubRoutes(items: NavItem[]): NavItem[] {
  return items.map((item) => {
    const gid = groupIdFromRoute(item.route);
    if (!item.children?.length || !gid) return item;
    return { ...item, defaultRoute: navGroupPagePath(gid) };
  });
}

/** Atrás: en un hub de grupo → Inicio; en un módulo → la grilla del grupo. */
export function navBackTarget(
  path: string,
  items: NavItem[],
  homeRoute = '/',
): { route: string; label: string } | null {
  const p = (path.split('?')[0] || path).trim();
  if (!p || p === '/' || p === homeRoute || p === '/login' || p === '/profile') return null;
  if (p === '/forbidden' || p.startsWith('/forbidden')) {
    return { route: homeRoute || '/', label: 'Inicio' };
  }
  if (p.startsWith('/g/')) {
    return { route: homeRoute || '/', label: 'Inicio' };
  }
  for (const item of items) {
    if (!item.children?.length) continue;
    const gid = groupIdFromRoute(item.route);
    if (!gid) continue;
    const onChild = item.children.some(
      (c) => p === c.route || (c.route !== '/' && p.startsWith(`${c.route}/`)),
    );
    if (onChild) {
      return { route: navGroupPagePath(gid), label: item.label };
    }
  }
  if (homeRoute && homeRoute !== p) {
    return { route: homeRoute, label: 'Inicio' };
  }
  return null;
}

export function applyNavConfig(
  builtItems: NavItem[],
  config?: ShopNavConfig | null,
): NavItem[] {
  const sourced = assignGroupHubRoutes(builtItems);
  if (!config) return sourced;

  const home = sourced.find((i) => i.route === '/' && i.exact);
  const rest = sourced.filter((i) => !(i.route === '/' && i.exact));

  const leaves: Leaf[] = [];
  const groupMeta = new Map<
    string,
    { label: string; icon: string; badge?: number | null; badgeInGroup?: boolean }
  >();

  for (const item of rest) {
    const gid = groupIdFromRoute(item.route);
    if (item.children?.length && gid) {
      groupMeta.set(gid, {
        label: item.label,
        icon: item.icon,
        badge: item.badge,
        badgeInGroup: item.badgeInGroup,
      });
      for (const child of item.children) {
        const leaf = leafFromChild(child, gid);
        if (leaf) leaves.push(leaf);
      }
      continue;
    }
    const leaf = leafFromChild(item, null);
    if (leaf) leaves.push(leaf);
  }

  const hidden = new Set((config.hidden ?? []).filter((id) => id && id !== 'home'));
  const visible = leaves.filter((l) => !hidden.has(l.navId));

  const byId = new Map(visible.map((l) => [l.navId, l]));
  const itemGroup = config.itemGroup ?? {};

  type Bucket = { id: string | null; items: Leaf[] };
  const buckets = new Map<string, Bucket>();
  const ensureBucket = (id: string | null): Bucket => {
    const key = id ?? '__root';
    let b = buckets.get(key);
    if (!b) {
      b = { id, items: [] };
      buckets.set(key, b);
    }
    return b;
  };

  for (const leaf of visible) {
    const target =
      itemGroup[leaf.navId] !== undefined
        ? itemGroup[leaf.navId] || null
        : leaf.sourceGroupId;
    ensureBucket(target).items.push(leaf);
  }

  for (const [groupId, order] of Object.entries(config.itemOrder ?? {})) {
    const bucket = buckets.get(groupId === '' ? '__root' : groupId);
    if (!bucket || !order?.length) continue;
    const rank = new Map(order.map((id, i) => [id, i]));
    bucket.items.sort((a, b) => {
      const ra = rank.has(a.navId) ? rank.get(a.navId)! : 1000;
      const rb = rank.has(b.navId) ? rank.get(b.navId)! : 1000;
      if (ra !== rb) return ra - rb;
      return 0;
    });
  }

  const defaultGroupOrder = [
    ...NAV_GROUP_DEFS.map((g) => g.id),
    ...[...groupMeta.keys()].filter((id) => !NAV_GROUP_DEFS.some((g) => g.id === id)),
  ];

  const configuredGroups = (config.groups ?? [])
    .map((g) => g?.id)
    .filter((id): id is string => !!id);

  const groupOrder =
    configuredGroups.length > 0
      ? [
          ...configuredGroups,
          ...defaultGroupOrder.filter((id) => !configuredGroups.includes(id)),
        ]
      : defaultGroupOrder;

  const groupLabelOverride = new Map(
    (config.groups ?? [])
      .filter((g) => g?.id && g.label)
      .map((g) => [g.id, g.label as string]),
  );

  const out: NavItem[] = [];
  if (home) out.push(home);

  const used = new Set<string>();
  const itemLabels = config.itemLabels ?? {};

  const pushGroup = (groupId: string) => {
    if (used.has(groupId)) return;
    const bucket = buckets.get(groupId);
    if (!bucket?.items.length) return;
    used.add(groupId);
    const def = NAV_GROUP_DEFS.find((g) => g.id === groupId);
    const meta = groupMeta.get(groupId);
    const label = groupLabelOverride.get(groupId) ?? meta?.label ?? def?.label ?? groupId;
    const icon = meta?.icon ?? def?.icon ?? 'folder';
    const children: NavChild[] = bucket.items.map(({ navId, sourceGroupId: _s, ...child }) => ({
      ...child,
      label: itemLabels[navId]?.trim() || child.label,
    }));
    out.push({
      label,
      route: groupRoute(groupId),
      icon,
      defaultRoute: navGroupPagePath(groupId),
      children,
      badge: meta?.badge,
      badgeInGroup: meta?.badgeInGroup,
    });
  };

  for (const gid of groupOrder) pushGroup(gid);
  for (const key of buckets.keys()) {
    if (key === '__root') continue;
    pushGroup(key);
  }

  const root = buckets.get('__root');
  if (root?.items.length) {
    for (const leaf of root.items) {
      const { navId, sourceGroupId: _s, ...item } = leaf;
      out.push({
        ...item,
        label: itemLabels[navId]?.trim() || item.label,
      });
    }
  }

  // Preservar ítems no catalogados (por si el menú crece sin actualizar el catálogo).
  for (const item of rest) {
    const gid = groupIdFromRoute(item.route);
    if (item.children?.length && gid) {
      if (used.has(gid)) continue;
      const kept = item.children.filter((c) => {
        const id = navItemIdForRoute(c.route);
        return !id || !hidden.has(id);
      });
      if (!kept.length) continue;
      out.push({
        ...item,
        children: kept,
        defaultRoute: navGroupPagePath(gid) ?? item.defaultRoute,
      });
      continue;
    }
    const id = navItemIdForRoute(item.route);
    if (id && byId.has(id)) continue;
    if (id && hidden.has(id)) continue;
    if (!id) out.push(item);
  }

  return out;
}
