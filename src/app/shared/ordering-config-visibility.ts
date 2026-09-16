/** Qué bloques ve el usuario en Pedidos → pestaña Configurar (true = visible). */
export type OrderingConfigVisibilityKey =
  | 'caja'
  | 'channels'
  | 'payments'
  | 'items'
  | 'extras';

export type OrderingConfigVisibility = Record<OrderingConfigVisibilityKey, boolean>;

export const ORDERING_CONFIG_VISIBILITY_OPTIONS: Array<{
  key: OrderingConfigVisibilityKey;
  label: string;
  hint: string;
}> = [
  {
    key: 'caja',
    label: 'Caja',
    hint: 'Abrir caja, caja abierta y Generar cierre',
  },
  {
    key: 'channels',
    label: 'Canales',
    hint: 'Take away y Delivery',
  },
  {
    key: 'payments',
    label: 'Medios de pago',
    hint: 'Efectivo y Transferencia',
  },
  {
    key: 'items',
    label: 'Ítems de la carta',
    hint: 'Alta/baja de disponibilidad de ítems',
  },
  {
    key: 'extras',
    label: 'Extras',
    hint: 'Alta/baja de extras del pedido',
  },
];

export function defaultOrderingConfigVisibility(): OrderingConfigVisibility {
  return {
    caja: true,
    channels: true,
    payments: true,
    items: true,
    extras: true,
  };
}

export function normalizeOrderingConfigVisibility(
  raw?: Partial<OrderingConfigVisibility> | null,
): OrderingConfigVisibility {
  const base = defaultOrderingConfigVisibility();
  if (!raw || typeof raw !== 'object') return base;
  for (const opt of ORDERING_CONFIG_VISIBILITY_OPTIONS) {
    if (raw[opt.key] !== undefined) base[opt.key] = !!raw[opt.key];
  }
  return base;
}

export function canSeeOrderingConfig(
  visibility: Partial<OrderingConfigVisibility> | null | undefined,
  key: OrderingConfigVisibilityKey,
): boolean {
  return normalizeOrderingConfigVisibility(visibility)[key] !== false;
}

export function hasAnyOrderingConfigSection(
  visibility: Partial<OrderingConfigVisibility> | null | undefined,
): boolean {
  const v = normalizeOrderingConfigVisibility(visibility);
  return ORDERING_CONFIG_VISIBILITY_OPTIONS.some((o) => v[o.key]);
}
