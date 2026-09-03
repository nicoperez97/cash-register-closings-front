/** Config de accesos rápidos de la toolbar (local + override por usuario). */

import {
  APP_SHORTCUT_DEFS,
  NAV_ITEM_DEFS,
  appShortcutById,
  navItemById,
} from './nav-config';

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

function shortcutUi(id: string, fallbackLabel: string, fallbackIcon: string) {
  const short = appShortcutById(id);
  if (short) return { label: short.label, icon: short.icon };
  const nav = navItemById(id);
  if (nav) return { label: nav.label, icon: nav.icon };
  return { label: fallbackLabel, icon: fallbackIcon };
}

/**
 * Catálogo estable de atajos built-in (ids usados en toolbar + config).
 * Labels/íconos salen del catálogo de navegación / atajos de app.
 */
export const TOOLBAR_QUICK_ACTION_DEFS: readonly ToolbarQuickActionDef[] = [
  { id: 'quick-expense', ...shortcutUi('quick-expense', 'Gasto rápido', 'payments'), audience: 'staff' },
  { id: 'closings', ...shortcutUi('closings', 'Cierres', 'point_of_sale'), audience: 'staff' },
  { id: 'shortages', ...shortcutUi('shortages', 'Faltantes', 'error_outline'), audience: 'staff' },
  { id: 'payments', ...shortcutUi('payments', 'Pagos', 'payments'), audience: 'staff' },
  { id: 'reservations', ...shortcutUi('reservations', 'Reservas', 'table_restaurant'), audience: 'staff' },
  { id: 'waiting-list', ...shortcutUi('waitingList', 'Lista de espera', 'hourglass_top'), audience: 'staff' },
  { id: 'tips', ...shortcutUi('tips', 'Propinas', 'volunteer_activism'), audience: 'staff' },
  { id: 'new-closing', ...shortcutUi('new-closing', 'Nuevo cierre', 'point_of_sale'), audience: 'cashier' },
  { id: 'my-hours', ...shortcutUi('myProduction', 'Mis horas', 'restaurant'), audience: 'producer' },
  {
    id: 'my-reimbursements',
    ...shortcutUi('reimbursements', 'Reintegros', 'receipt_long'),
    audience: 'producer',
  },
  { id: 'stock', ...shortcutUi('stockFood', 'Alimentos', 'inventory'), audience: 'producer' },
  { id: 'beverage-stock', ...shortcutUi('beverageStock', 'Bebidas', 'local_bar'), audience: 'producer' },
] as const;

export const TOOLBAR_QUICK_ACTION_IDS = new Set(
  TOOLBAR_QUICK_ACTION_DEFS.map((d) => d.id),
);

const ADDABLE_NAV_IDS = [
  'expenses',
  'incomes',
  'accountTransfers',
  'transactions',
  'partnerSplits',
  'orders',
  'attendance',
  'productionAttendance',
  'diagrama',
  'salonHours',
  'serviceRules',
  'employees',
  'vacations',
  'payroll',
  'commissions',
  'reports',
  'reportsProducts',
  'cashWithdrawals',
  'settlements',
  'suppliers',
  'services',
  'adminShop',
] as const;

/** Módulos del menú que se pueden sumar como atajo custom (desde el catálogo). */
export const TOOLBAR_ADDABLE_MODULE_DEFS: readonly ToolbarCustomAction[] = ADDABLE_NAV_IDS.map(
  (id) => {
    const d = navItemById(id)!;
    return { id: `nav:${d.id}`, label: d.label, icon: d.icon, route: d.route };
  },
);

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
