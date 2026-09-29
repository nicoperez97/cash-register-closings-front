export type MenuItemAccountPrice = {
  accountId: string;
  price: number;
};

/** Último ajuste masivo guardado por cuenta en la carta. */
export type MenuAccountPriceRule = {
  accountId: string;
  mode: 'fixed' | 'add' | 'percent';
  value: number;
};

/** Precio unitario según cuenta del medio; si no hay, el precio fijo. */
export function resolveItemUnitPrice(
  item: { price?: number | null; accountPrices?: MenuItemAccountPrice[] | null },
  accountId?: string | null,
): number {
  const base = item.price == null ? 0 : Number(item.price);
  const baseOk = Number.isFinite(base) && base >= 0 ? Math.round(base) : 0;
  const acc = String(accountId ?? '').trim();
  if (acc) {
    const hit = (item.accountPrices ?? []).find((r) => String(r.accountId ?? '').trim() === acc);
    if (hit) {
      const n = Number(hit.price);
      if (Number.isFinite(n) && n >= 0) return Math.round(n);
    }
  }
  return baseOk;
}

export function accountPriceOf(
  item: { accountPrices?: MenuItemAccountPrice[] | null },
  accountId: string | null | undefined,
): number | null {
  const acc = String(accountId ?? '').trim();
  if (!acc) return null;
  const hit = (item.accountPrices ?? []).find((r) => String(r.accountId ?? '').trim() === acc);
  if (!hit) return null;
  const n = Number(hit.price);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function upsertAccountPrice(
  accountPrices: MenuItemAccountPrice[] | null | undefined,
  accountId: string,
  price: number,
): MenuItemAccountPrice[] {
  const id = String(accountId).trim();
  const next = Math.max(0, Math.round(Number(price) || 0));
  const list = [...(accountPrices ?? [])].filter((r) => String(r.accountId ?? '').trim() !== id);
  list.push({ accountId: id, price: next });
  return list;
}

export function removeAccountPrice(
  accountPrices: MenuItemAccountPrice[] | null | undefined,
  accountId: string,
): MenuItemAccountPrice[] {
  const id = String(accountId).trim();
  return (accountPrices ?? []).filter((r) => String(r.accountId ?? '').trim() !== id);
}

export function upsertAccountPriceRule(
  rules: MenuAccountPriceRule[] | null | undefined,
  rule: MenuAccountPriceRule,
): MenuAccountPriceRule[] {
  const id = String(rule.accountId).trim();
  const list = [...(rules ?? [])].filter((r) => String(r.accountId ?? '').trim() !== id);
  list.push({
    accountId: id,
    mode: rule.mode,
    value: Number(rule.value),
  });
  return list;
}

export function removeAccountPriceRule(
  rules: MenuAccountPriceRule[] | null | undefined,
  accountId: string,
): MenuAccountPriceRule[] {
  const id = String(accountId).trim();
  return (rules ?? []).filter((r) => String(r.accountId ?? '').trim() !== id);
}

export function formatAccountPriceRuleLabel(rule: {
  mode: 'fixed' | 'add' | 'percent';
  value: number;
}): string {
  const v = Number(rule.value);
  if (rule.mode === 'fixed') {
    return `Fijo $${Math.round(v).toLocaleString('es-AR')}`;
  }
  if (rule.mode === 'add') {
    const n = Math.round(v);
    return n >= 0
      ? `Sumar $${n.toLocaleString('es-AR')}`
      : `Restar $${Math.abs(n).toLocaleString('es-AR')}`;
  }
  const pct = Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
  return v >= 0 ? `+${pct}%` : `${pct}%`;
}
