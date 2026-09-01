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

/** Catálogo de ítems del menú (id estable ↔ ruta). */
export const NAV_ITEM_DEFS: Array<{
  id: string;
  defaultGroup: string | null;
  route: string;
  /** Prefijos adicionales que mapean a este id (p. ej. /closings/123). */
  pathPrefixes?: string[];
}> = [
  { id: 'home', defaultGroup: null, route: '/' },
  { id: 'closings', defaultGroup: 'operacion', route: '/closings', pathPrefixes: ['/closings'] },
  { id: 'cashWithdrawals', defaultGroup: 'operacion', route: '/cash-withdrawals' },
  { id: 'settlements', defaultGroup: 'operacion', route: '/settlements' },
  { id: 'tips', defaultGroup: 'operacion', route: '/tips' },
  { id: 'serviceRules', defaultGroup: 'operacion', route: '/service-rules' },
  { id: 'expenses', defaultGroup: 'cuentas', route: '/expenses' },
  { id: 'incomes', defaultGroup: 'cuentas', route: '/incomes' },
  { id: 'accountTransfers', defaultGroup: 'cuentas', route: '/account-transfers' },
  { id: 'transactions', defaultGroup: 'cuentas', route: '/transactions' },
  { id: 'partnerSplits', defaultGroup: 'cuentas', route: '/partner-splits' },
  { id: 'splits', defaultGroup: 'cuentas', route: '/splits' },
  { id: 'reservations', defaultGroup: 'salon', route: '/reservations' },
  { id: 'waitingList', defaultGroup: 'salon', route: '/waiting-list' },
  { id: 'diagrama', defaultGroup: 'salon', route: '/salon/diagrama' },
  { id: 'salonRules', defaultGroup: 'salon', route: '/salon/reglas' },
  { id: 'salonHours', defaultGroup: 'salon', route: '/salon/horarios' },
  { id: 'stockFood', defaultGroup: 'stock', route: '/stock' },
  { id: 'beverageStock', defaultGroup: 'stock', route: '/beverage-stock' },
  { id: 'shortages', defaultGroup: 'stock', route: '/shortages' },
  { id: 'orders', defaultGroup: 'stock', route: '/orders' },
  { id: 'attendance', defaultGroup: 'asistencia', route: '/attendance' },
  { id: 'productionAttendance', defaultGroup: 'asistencia', route: '/production-attendance' },
  { id: 'myProduction', defaultGroup: null, route: '/my-production' },
  { id: 'reimbursements', defaultGroup: 'personal', route: '/reimbursements' },
  { id: 'paymentsSuppliers', defaultGroup: 'pagos', route: '/payments/suppliers' },
  { id: 'paymentsServices', defaultGroup: 'pagos', route: '/payments/services' },
  { id: 'paymentsEmployees', defaultGroup: 'pagos', route: '/payments/employees' },
  { id: 'paymentsPartners', defaultGroup: 'pagos', route: '/payments/partners' },
  { id: 'suppliers', defaultGroup: 'pagos', route: '/suppliers' },
  { id: 'services', defaultGroup: 'pagos', route: '/services' },
  { id: 'reports', defaultGroup: 'reportes', route: '/reports' },
  { id: 'reportsConcepts', defaultGroup: 'reportes', route: '/reports/concepts' },
  { id: 'reportsProducts', defaultGroup: 'reportes', route: '/reports/products' },
  { id: 'reportsStats', defaultGroup: 'reportes', route: '/reports/stats' },
  { id: 'employees', defaultGroup: 'personal', route: '/employees' },
  { id: 'vacations', defaultGroup: 'personal', route: '/vacations' },
  { id: 'candidates', defaultGroup: 'personal', route: '/candidates' },
  { id: 'payroll', defaultGroup: 'personal', route: '/salaries' },
  { id: 'commissions', defaultGroup: 'personal', route: '/commissions' },
  { id: 'adminShops', defaultGroup: 'admin', route: '/admin/shops' },
  { id: 'adminShop', defaultGroup: 'admin', route: '/admin/shop' },
  { id: 'adminMessages', defaultGroup: 'admin', route: '/admin/messages' },
  { id: 'adminMenu', defaultGroup: 'admin', route: '/admin/menu' },
  { id: 'adminQr', defaultGroup: 'admin', route: '/admin/qr' },
  { id: 'adminInstrucciones', defaultGroup: 'admin', route: '/admin/instrucciones' },
  { id: 'adminUsers', defaultGroup: 'admin', route: '/admin/users' },
  { id: 'adminUserActivity', defaultGroup: 'admin', route: '/admin/user-activity' },
  { id: 'adminAccounts', defaultGroup: 'admin', route: '/admin/accounts' },
  { id: 'adminConcepts', defaultGroup: 'admin', route: '/admin/concepts' },
  { id: 'adminSalesSystems', defaultGroup: 'admin', route: '/admin/sales-systems' },
  { id: 'adminPosProducts', defaultGroup: 'admin', route: '/admin/pos-products' },
];

const GROUP_ROUTE_PREFIX = '__group_';

function groupRoute(id: string): string {
  return `${GROUP_ROUTE_PREFIX}${id}`;
}

function groupIdFromRoute(route: string): string | null {
  if (!route.startsWith(GROUP_ROUTE_PREFIX)) return null;
  return route.slice(GROUP_ROUTE_PREFIX.length) || null;
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
export function applyNavConfig(
  builtItems: NavItem[],
  config?: ShopNavConfig | null,
): NavItem[] {
  if (!config) return builtItems;

  const home = builtItems.find((i) => i.route === '/' && i.exact);
  const rest = builtItems.filter((i) => !(i.route === '/' && i.exact));

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
      defaultRoute: children[0]?.route,
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
      out.push({ ...item, children: kept, defaultRoute: kept[0]?.route ?? item.defaultRoute });
      continue;
    }
    const id = navItemIdForRoute(item.route);
    if (id && byId.has(id)) continue;
    if (id && hidden.has(id)) continue;
    if (!id) out.push(item);
  }

  return out;
}
