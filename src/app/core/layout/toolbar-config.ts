/** Config de accesos rápidos de la toolbar (local + override por usuario). */

export type ToolbarCustomAction = {
  /** Id estable (p. ej. `nav:expenses`). */
  id: string;
  label: string;
  icon: string;
  route: string;
};

export type ShopToolbarConfig = {
  /** Orden de ids visibles (los no listados van al final en orden default). */
  order?: string[];
  /** Ids ocultos (aunque el usuario tenga permiso). */
  hidden?: string[];
  /** Atajos extra (módulos agregados a mano). */
  custom?: ToolbarCustomAction[];
};

export type ToolbarQuickActionDef = {
  id: string;
  label: string;
  icon: string;
  /** Solo para el editor: a qué “familia” pertenece. */
  audience: 'staff' | 'cashier' | 'producer';
};

/**
 * Catálogo estable de atajos built-in (ids usados en toolbar + config).
 * Los permisos/flags del local siguen filtrando en runtime.
 */
export const TOOLBAR_QUICK_ACTION_DEFS: readonly ToolbarQuickActionDef[] = [
  { id: 'quick-expense', label: 'Gasto rápido', icon: 'payments', audience: 'staff' },
  { id: 'closings', label: 'Cierres', icon: 'point_of_sale', audience: 'staff' },
  { id: 'shortages', label: 'Faltantes', icon: 'error_outline', audience: 'staff' },
  { id: 'payments', label: 'Pagos', icon: 'local_shipping', audience: 'staff' },
  { id: 'reservations', label: 'Reservas', icon: 'table_restaurant', audience: 'staff' },
  { id: 'waiting-list', label: 'Lista de espera', icon: 'hourglass_top', audience: 'staff' },
  { id: 'tips', label: 'Propinas', icon: 'volunteer_activism', audience: 'staff' },
  { id: 'new-closing', label: 'Nuevo cierre', icon: 'point_of_sale', audience: 'cashier' },
  { id: 'my-hours', label: 'Mis horas', icon: 'restaurant', audience: 'producer' },
  {
    id: 'my-reimbursements',
    label: 'Reintegros',
    icon: 'receipt_long',
    audience: 'producer',
  },
  { id: 'stock', label: 'Alimentos', icon: 'inventory', audience: 'producer' },
  { id: 'beverage-stock', label: 'Bebidas', icon: 'local_bar', audience: 'producer' },
] as const;

export const TOOLBAR_QUICK_ACTION_IDS = new Set(
  TOOLBAR_QUICK_ACTION_DEFS.map((d) => d.id),
);

/** Módulos del menú que se pueden sumar como atajo custom. */
export const TOOLBAR_ADDABLE_MODULE_DEFS: readonly ToolbarCustomAction[] = [
  { id: 'nav:expenses', label: 'Gastos', icon: 'payments', route: '/expenses' },
  { id: 'nav:incomes', label: 'Ingresos', icon: 'south_west', route: '/incomes' },
  {
    id: 'nav:account-transfers',
    label: 'Movimientos',
    icon: 'swap_horiz',
    route: '/account-transfers',
  },
  { id: 'nav:transactions', label: 'Transacciones', icon: 'receipt_long', route: '/transactions' },
  {
    id: 'nav:partner-splits',
    label: 'División de socios',
    icon: 'groups',
    route: '/partner-splits',
  },
  { id: 'nav:orders', label: 'Pedidos', icon: 'local_shipping', route: '/orders' },
  { id: 'nav:attendance', label: 'Asistencia', icon: 'event_available', route: '/attendance' },
  {
    id: 'nav:production-attendance',
    label: 'Presentismo producción',
    icon: 'restaurant',
    route: '/production-attendance',
  },
  { id: 'nav:diagrama', label: 'Diagrama', icon: 'grid_view', route: '/salon/diagrama' },
  { id: 'nav:salon-hours', label: 'Horarios salón', icon: 'schedule', route: '/salon/horarios' },
  { id: 'nav:service-rules', label: 'Normas', icon: 'menu_book', route: '/service-rules' },
  { id: 'nav:employees', label: 'Empleados', icon: 'badge', route: '/employees' },
  { id: 'nav:vacations', label: 'Vacaciones', icon: 'beach_access', route: '/vacations' },
  { id: 'nav:payroll', label: 'Liquidaciones', icon: 'request_quote', route: '/payroll' },
  { id: 'nav:commissions', label: 'Comisiones', icon: 'percent', route: '/commissions' },
  { id: 'nav:reports', label: 'Reportes', icon: 'insights', route: '/reports' },
  {
    id: 'nav:reports-products',
    label: 'Ventas POS',
    icon: 'restaurant_menu',
    route: '/reports/products',
  },
  {
    id: 'nav:cash-withdrawals',
    label: 'A Retirar',
    icon: 'account_balance_wallet',
    route: '/cash-withdrawals',
  },
  { id: 'nav:settlements', label: 'Rendiciones', icon: 'payments', route: '/settlements' },
  { id: 'nav:suppliers', label: 'Proveedores', icon: 'store', route: '/suppliers' },
  { id: 'nav:services', label: 'Servicios', icon: 'handyman', route: '/services' },
  {
    id: 'nav:admin-shop',
    label: 'Config. del local',
    icon: 'storefront',
    route: '/admin/shop',
  },
];

/**
 * Prioridad: personalización del usuario en el local (`myToolbarConfig`),
 * si no hay override → del local (`toolbarConfig`).
 */
export function effectiveToolbarConfig(shop: {
  myToolbarConfig?: ShopToolbarConfig | null;
  toolbarConfig?: ShopToolbarConfig | null;
} | null): ShopToolbarConfig | null {
  if (!shop) return null;
  return shop.myToolbarConfig ?? shop.toolbarConfig ?? null;
}

/** Aplica order/hidden sobre la lista ya filtrada por permiso. */
export function applyToolbarConfig<T extends { id: string }>(
  items: T[],
  config?: ShopToolbarConfig | null,
): T[] {
  if (!config) return items;
  const hidden = new Set((config.hidden ?? []).filter(Boolean));
  const visible = hidden.size ? items.filter((i) => !hidden.has(i.id)) : items;
  const known = new Set(visible.map((i) => i.id));
  const order = (config.order ?? []).filter((id) => known.has(id));
  if (!order.length) return visible;

  const byId = new Map(visible.map((i) => [i.id, i]));
  const ordered: T[] = [];
  for (const id of order) {
    const hit = byId.get(id);
    if (hit) {
      ordered.push(hit);
      byId.delete(id);
    }
  }
  for (const item of visible) {
    if (byId.has(item.id)) ordered.push(item);
  }
  return ordered;
}

export function isMeaningfulToolbarConfig(cfg: ShopToolbarConfig | null | undefined): boolean {
  if (!cfg) return false;
  return !!(cfg.order?.length || cfg.hidden?.length || cfg.custom?.length);
}

function normalizeCustom(raw: unknown): ToolbarCustomAction[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ToolbarCustomAction[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const id = String(r['id'] ?? '').trim();
    const label = String(r['label'] ?? '').trim();
    const icon = String(r['icon'] ?? '').trim() || 'bolt';
    const route = String(r['route'] ?? '').trim();
    if (!id || !label || !route || seen.has(id) || TOOLBAR_QUICK_ACTION_IDS.has(id)) continue;
    if (!route.startsWith('/')) continue;
    seen.add(id);
    out.push({ id, label, icon, route });
  }
  return out.length ? out : undefined;
}

export function normalizeToolbarConfig(raw: ShopToolbarConfig | null | undefined): ShopToolbarConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const custom = normalizeCustom(raw.custom);
  const knownIds = new Set<string>([
    ...TOOLBAR_QUICK_ACTION_IDS,
    ...(custom ?? []).map((c) => c.id),
  ]);
  const order = Array.isArray(raw.order)
    ? [...new Set(raw.order.map((id) => String(id ?? '').trim()).filter((id) => knownIds.has(id)))]
    : undefined;
  const hidden = Array.isArray(raw.hidden)
    ? [...new Set(raw.hidden.map((id) => String(id ?? '').trim()).filter((id) => knownIds.has(id)))]
    : undefined;
  const next: ShopToolbarConfig = {};
  if (order?.length) next.order = order;
  if (hidden?.length) next.hidden = hidden;
  if (custom?.length) next.custom = custom;
  return isMeaningfulToolbarConfig(next) ? next : null;
}
