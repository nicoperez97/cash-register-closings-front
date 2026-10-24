/**
 * Rubros para reglas de comisión: los de Ventas (rubros de Carta) y los de Ventas POS
 * (Platos POS). La API los compara sin tildes ni mayúsculas, igual que acá.
 */

export type CommissionCategoryOrigin = 'both' | 'sales' | 'pos';

export type CommissionCategoryGroup = {
  origin: CommissionCategoryOrigin;
  label: string;
  items: string[];
};

const GROUP_LABEL: Record<CommissionCategoryOrigin, string> = {
  both: 'En Ventas y Ventas POS',
  sales: 'Solo Ventas (Carta)',
  pos: 'Solo Ventas POS',
};

export function normCategory(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

/** Índice rubro normalizado → nombre a mostrar y de dónde viene. */
export function indexCommissionCategories(
  salesCategories: Array<string | null | undefined>,
  posCategories: Array<string | null | undefined>,
): Map<string, { name: string; origin: CommissionCategoryOrigin }> {
  const map = new Map<string, { name: string; inSales: boolean; inPos: boolean }>();
  const add = (raw: string | null | undefined, kind: 'sales' | 'pos') => {
    const name = String(raw ?? '').trim();
    if (!name) return;
    const key = normCategory(name);
    const cur = map.get(key) ?? { name, inSales: false, inPos: false };
    if (kind === 'sales') cur.inSales = true;
    else cur.inPos = true;
    map.set(key, cur);
  };
  for (const c of salesCategories) add(c, 'sales');
  for (const c of posCategories) add(c, 'pos');
  const out = new Map<string, { name: string; origin: CommissionCategoryOrigin }>();
  for (const [key, v] of map) {
    out.set(key, { name: v.name, origin: v.inSales && v.inPos ? 'both' : v.inSales ? 'sales' : 'pos' });
  }
  return out;
}

/** Grupos para el desplegable, filtrados por lo escrito. */
export function groupCommissionCategories(
  index: Map<string, { name: string; origin: CommissionCategoryOrigin }>,
  query = '',
): CommissionCategoryGroup[] {
  const q = normCategory(query);
  const groups: CommissionCategoryGroup[] = (['both', 'sales', 'pos'] as const).map((origin) => ({
    origin,
    label: GROUP_LABEL[origin],
    items: [],
  }));
  for (const [key, v] of index) {
    if (q && !key.includes(q)) continue;
    groups.find((g) => g.origin === v.origin)!.items.push(v.name);
  }
  for (const g of groups) g.items.sort((a, b) => a.localeCompare(b, 'es'));
  return groups.filter((g) => g.items.length);
}

/** Texto de ayuda según dónde existe el rubro elegido. */
export function commissionCategoryHint(
  index: Map<string, { name: string; origin: CommissionCategoryOrigin }>,
  value: string,
): string {
  const v = String(value ?? '').trim();
  if (!v) return 'Elegí un rubro de Ventas (Carta) o de Ventas POS.';
  const hit = index.get(normCategory(v));
  if (!hit) return 'Este rubro no existe en Ventas ni en Ventas POS: no va a sumar ventas.';
  if (hit.origin === 'both') return 'Suma ventas de Ventas (pedidos y comanda) y de Ventas POS.';
  if (hit.origin === 'sales') return 'Solo suma Ventas (pedidos y comanda): no está en Platos POS.';
  return 'Solo suma Ventas POS: no está en los rubros de la Carta.';
}
