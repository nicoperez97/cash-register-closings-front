/** Nivel por bloque en Pedidos → Configurar. */
export type OrderingConfigLevel = 'none' | 'read' | 'manage';

export type OrderingConfigVisibilityKey =
  | 'caja'
  | 'channels'
  | 'payments'
  | 'items'
  | 'extras';

export type OrderingConfigVisibility = Record<OrderingConfigVisibilityKey, OrderingConfigLevel>;

export const ORDERING_CONFIG_LEVELS: Array<{
  value: OrderingConfigLevel;
  label: string;
  short: string;
}> = [
  { value: 'none', label: 'Ninguno', short: 'Off' },
  { value: 'read', label: 'Ver', short: 'Ver' },
  { value: 'manage', label: 'Gestionar', short: 'Todo' },
];

export const ORDERING_CONFIG_VISIBILITY_OPTIONS: Array<{
  key: OrderingConfigVisibilityKey;
  label: string;
  hint: string;
  icon: string;
}> = [
  {
    key: 'caja',
    label: 'Caja',
    hint: 'Abrir caja, caja abierta y Generar cierre',
    icon: 'point_of_sale',
  },
  {
    key: 'channels',
    label: 'Canales',
    hint: 'Take away y Delivery',
    icon: 'local_shipping',
  },
  {
    key: 'payments',
    label: 'Medios de pago',
    hint: 'Efectivo y Transferencia',
    icon: 'payments',
  },
  {
    key: 'items',
    label: 'Ítems de la carta',
    hint: 'Alta/baja de disponibilidad de ítems',
    icon: 'restaurant_menu',
  },
  {
    key: 'extras',
    label: 'Extras',
    hint: 'Alta/baja de extras del pedido',
    icon: 'add_circle',
  },
];

export function defaultOrderingConfigVisibility(): OrderingConfigVisibility {
  return {
    caja: 'manage',
    channels: 'manage',
    payments: 'manage',
    items: 'manage',
    extras: 'manage',
  };
}

function coerceOrderingConfigLevel(raw: unknown): OrderingConfigLevel {
  if (raw === true || raw === 'manage' || raw === 'todo' || raw === 'all') return 'manage';
  if (raw === 'read' || raw === 'ver' || raw === 'view') return 'read';
  if (raw === false || raw === 'none' || raw === 'off') return 'none';
  if (raw === 'manage' || raw === 'read' || raw === 'none') return raw;
  return 'manage';
}

export function normalizeOrderingConfigVisibility(
  raw?: Partial<Record<OrderingConfigVisibilityKey, unknown>> | null,
): OrderingConfigVisibility {
  const base = defaultOrderingConfigVisibility();
  if (!raw || typeof raw !== 'object') return base;
  for (const opt of ORDERING_CONFIG_VISIBILITY_OPTIONS) {
    if (raw[opt.key] !== undefined) base[opt.key] = coerceOrderingConfigLevel(raw[opt.key]);
  }
  return base;
}

export function canSeeOrderingConfig(
  visibility: Partial<Record<OrderingConfigVisibilityKey, unknown>> | null | undefined,
  key: OrderingConfigVisibilityKey,
): boolean {
  return orderingConfigLevelOf(visibility, key) !== 'none';
}

export function canEditOrderingConfig(
  visibility: Partial<Record<OrderingConfigVisibilityKey, unknown>> | null | undefined,
  key: OrderingConfigVisibilityKey,
): boolean {
  return orderingConfigLevelOf(visibility, key) === 'manage';
}

export function orderingConfigLevelOf(
  visibility: Partial<Record<OrderingConfigVisibilityKey, unknown>> | null | undefined,
  key: OrderingConfigVisibilityKey,
): OrderingConfigLevel {
  return normalizeOrderingConfigVisibility(visibility)[key];
}

export function hasAnyOrderingConfigSection(
  visibility: Partial<Record<OrderingConfigVisibilityKey, unknown>> | null | undefined,
): boolean {
  const v = normalizeOrderingConfigVisibility(visibility);
  return ORDERING_CONFIG_VISIBILITY_OPTIONS.some((o) => v[o.key] !== 'none');
}
