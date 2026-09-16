/** Nivel por sección de Configuración del local. */
export type ShopConfigLevel = 'none' | 'read' | 'manage';

export type ShopConfigVisibilityKey =
  | 'resumen'
  | 'identidad'
  | 'operacion'
  | 'pedidos'
  | 'comanda'
  | 'dispositivos'
  | 'menu'
  | 'carta'
  | 'avanzado';

export type ShopConfigVisibility = Record<ShopConfigVisibilityKey, ShopConfigLevel>;

export const SHOP_CONFIG_LEVELS: Array<{
  value: ShopConfigLevel;
  label: string;
  short: string;
}> = [
  { value: 'none', label: 'Ninguno', short: 'Off' },
  { value: 'read', label: 'Ver', short: 'Ver' },
  { value: 'manage', label: 'Gestionar', short: 'Todo' },
];

export const SHOP_CONFIG_VISIBILITY_OPTIONS: Array<{
  key: ShopConfigVisibilityKey;
  label: string;
  hint: string;
  icon: string;
}> = [
  {
    key: 'resumen',
    label: 'Resumen',
    hint: 'Hub de configuración del local',
    icon: 'dashboard',
  },
  {
    key: 'identidad',
    label: 'Identidad',
    hint: 'Nombre, logo, colores y mails',
    icon: 'badge',
  },
  {
    key: 'operacion',
    label: 'Operación',
    hint: 'Turnos, presentismo, francos y módulos públicos',
    icon: 'schedule',
  },
  {
    key: 'pedidos',
    label: 'Pedidos',
    hint: 'Página /pedir, horarios, zonas y pagos online',
    icon: 'shopping_bag',
  },
  {
    key: 'comanda',
    label: 'Comandas',
    hint: 'Comanda mozos, /mozo y pagos de mesa',
    icon: 'room_service',
  },
  {
    key: 'dispositivos',
    label: 'Dispositivos',
    hint: 'Token Comandas, posnets y cuentas aparte',
    icon: 'point_of_sale',
  },
  {
    key: 'menu',
    label: 'Menú',
    hint: 'Menú lateral y accesos rápidos',
    icon: 'menu',
  },
  {
    key: 'carta',
    label: 'Carta',
    hint: 'Ítems y precios de la carta pública',
    icon: 'restaurant_menu',
  },
  {
    key: 'avanzado',
    label: 'Avanzado',
    hint: 'Activar/desactivar local y dump',
    icon: 'tune',
  },
];

export const SHOP_CONFIG_VISIBILITY_KEYS: ShopConfigVisibilityKey[] =
  SHOP_CONFIG_VISIBILITY_OPTIONS.map((o) => o.key);

export function defaultShopConfigVisibility(): ShopConfigVisibility {
  return {
    resumen: 'manage',
    identidad: 'manage',
    operacion: 'manage',
    pedidos: 'manage',
    comanda: 'manage',
    dispositivos: 'manage',
    menu: 'manage',
    carta: 'manage',
    avanzado: 'manage',
  };
}

function coerceShopConfigLevel(raw: unknown): ShopConfigLevel {
  if (raw === true || raw === 'manage' || raw === 'todo' || raw === 'all') return 'manage';
  if (raw === 'read' || raw === 'ver' || raw === 'view') return 'read';
  if (raw === false || raw === 'none' || raw === 'off') return 'none';
  if (raw === 'manage' || raw === 'read' || raw === 'none') return raw;
  return 'manage';
}

export function normalizeShopConfigVisibility(
  raw?: Partial<Record<ShopConfigVisibilityKey, unknown>> | null,
): ShopConfigVisibility {
  const base = defaultShopConfigVisibility();
  if (!raw || typeof raw !== 'object') return base;
  for (const opt of SHOP_CONFIG_VISIBILITY_OPTIONS) {
    if (raw[opt.key] !== undefined) base[opt.key] = coerceShopConfigLevel(raw[opt.key]);
  }
  return base;
}

export function shopConfigLevelOf(
  visibility: Partial<ShopConfigVisibility> | null | undefined,
  key: ShopConfigVisibilityKey,
): ShopConfigLevel {
  return normalizeShopConfigVisibility(visibility)[key];
}

export function canSeeShopConfig(
  visibility: Partial<ShopConfigVisibility> | null | undefined,
  key: ShopConfigVisibilityKey,
): boolean {
  return shopConfigLevelOf(visibility, key) !== 'none';
}

export function canEditShopConfig(
  visibility: Partial<ShopConfigVisibility> | null | undefined,
  key: ShopConfigVisibilityKey,
): boolean {
  return shopConfigLevelOf(visibility, key) === 'manage';
}

export function hasAnyShopConfigSection(
  visibility: Partial<ShopConfigVisibility> | null | undefined,
): boolean {
  const v = normalizeShopConfigVisibility(visibility);
  return SHOP_CONFIG_VISIBILITY_OPTIONS.some((o) => v[o.key] !== 'none');
}
