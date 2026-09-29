export type MenuAccountPriceMode = 'fixed' | 'add' | 'percent';

export type MenuItemAccountPrice = {
  accountId: string;
  price: number;
  /** Cómo se llegó a ese precio (ajuste masivo o edición manual). */
  mode?: MenuAccountPriceMode;
  value?: number;
};

/** Ajuste masivo guardado en la carta (puede haber varios por la misma cuenta). */
export type MenuAccountPriceRule = {
  accountId: string;
  mode: MenuAccountPriceMode;
  value: number;
};

export type MenuAccountPriceGroupKey = {
  accountId: string;
  mode: MenuAccountPriceMode | null;
  value: number | null;
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

export function accountPriceEntryOf(
  item: { accountPrices?: MenuItemAccountPrice[] | null },
  accountId: string | null | undefined,
): MenuItemAccountPrice | null {
  const acc = String(accountId ?? '').trim();
  if (!acc) return null;
  return (item.accountPrices ?? []).find((r) => String(r.accountId ?? '').trim() === acc) ?? null;
}

function normalizeMode(raw: unknown): MenuAccountPriceMode | null {
  const mode = String(raw ?? '').trim();
  return mode === 'fixed' || mode === 'add' || mode === 'percent' ? mode : null;
}

export function accountPriceRuleKey(rule: {
  accountId: string;
  mode: MenuAccountPriceMode;
  value: number;
}): string {
  return `${String(rule.accountId).trim()}|${rule.mode}|${Number(rule.value)}`;
}

export function accountPriceGroupKey(row: MenuItemAccountPrice): string {
  const accountId = String(row.accountId ?? '').trim();
  const mode = normalizeMode(row.mode);
  if (!mode || row.value == null || !Number.isFinite(Number(row.value))) {
    return `${accountId}|legacy`;
  }
  return accountPriceRuleKey({ accountId, mode, value: Number(row.value) });
}

export function matchesAccountPriceGroup(
  row: MenuItemAccountPrice,
  group: MenuAccountPriceGroupKey,
): boolean {
  const accountId = String(row.accountId ?? '').trim();
  if (accountId !== String(group.accountId).trim()) return false;
  if (group.mode == null || group.value == null) {
    const mode = normalizeMode(row.mode);
    return !mode || row.value == null || !Number.isFinite(Number(row.value));
  }
  return normalizeMode(row.mode) === group.mode && Number(row.value) === Number(group.value);
}

export function upsertAccountPrice(
  accountPrices: MenuItemAccountPrice[] | null | undefined,
  accountId: string,
  price: number,
  meta?: { mode?: MenuAccountPriceMode; value?: number } | null,
): MenuItemAccountPrice[] {
  const id = String(accountId).trim();
  const next = Math.max(0, Math.round(Number(price) || 0));
  const list = [...(accountPrices ?? [])].filter((r) => String(r.accountId ?? '').trim() !== id);
  const mode = normalizeMode(meta?.mode);
  const value =
    meta?.value != null && Number.isFinite(Number(meta.value)) ? Number(meta.value) : undefined;
  const entry: MenuItemAccountPrice = { accountId: id, price: next };
  if (mode && value != null) {
    entry.mode = mode;
    entry.value = mode === 'fixed' ? Math.max(0, Math.round(value)) : value;
  }
  list.push(entry);
  return list;
}

export function removeAccountPrice(
  accountPrices: MenuItemAccountPrice[] | null | undefined,
  accountId: string,
): MenuItemAccountPrice[] {
  const id = String(accountId).trim();
  return (accountPrices ?? []).filter((r) => String(r.accountId ?? '').trim() !== id);
}

/** Quita precios de una cuenta; si hay mode/value, solo ese grupo. */
export function removeAccountPriceGroup(
  accountPrices: MenuItemAccountPrice[] | null | undefined,
  group: MenuAccountPriceGroupKey,
): MenuItemAccountPrice[] {
  return (accountPrices ?? []).filter((r) => !matchesAccountPriceGroup(r, group));
}

export function upsertAccountPriceRule(
  rules: MenuAccountPriceRule[] | null | undefined,
  rule: MenuAccountPriceRule,
): MenuAccountPriceRule[] {
  const next: MenuAccountPriceRule = {
    accountId: String(rule.accountId).trim(),
    mode: rule.mode,
    value: Number(rule.value),
  };
  const key = accountPriceRuleKey(next);
  const list = [...(rules ?? [])].filter((r) => accountPriceRuleKey(r) !== key);
  list.push(next);
  return list;
}

export function removeAccountPriceRule(
  rules: MenuAccountPriceRule[] | null | undefined,
  accountId: string,
  mode?: MenuAccountPriceMode | null,
  value?: number | null,
): MenuAccountPriceRule[] {
  const id = String(accountId).trim();
  if (mode == null || value == null || !Number.isFinite(Number(value))) {
    return (rules ?? []).filter((r) => String(r.accountId ?? '').trim() !== id);
  }
  const key = accountPriceRuleKey({ accountId: id, mode, value: Number(value) });
  return (rules ?? []).filter((r) => accountPriceRuleKey(r) !== key);
}

export function formatAccountPriceRuleLabel(rule: {
  mode: MenuAccountPriceMode;
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

/** Resume precios por cuenta agrupando mode+value (varios % en la misma cuenta). */
export function summarizeAccountPriceGroups(
  items: Array<{ accountPrices?: MenuItemAccountPrice[] | null }>,
  accounts: Array<{ id: string; name: string }>,
): Array<{
  accountId: string;
  name: string;
  label: string;
  itemCount: number;
  mode: MenuAccountPriceMode | null;
  value: number | null;
}> {
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const counts = new Map<
    string,
    { accountId: string; mode: MenuAccountPriceMode | null; value: number | null; itemCount: number }
  >();

  for (const it of items) {
    for (const row of it.accountPrices ?? []) {
      const accountId = String(row.accountId ?? '').trim();
      if (!accountId) continue;
      const mode = normalizeMode(row.mode);
      const value =
        mode && row.value != null && Number.isFinite(Number(row.value))
          ? Number(row.value)
          : null;
      const key =
        mode && value != null
          ? accountPriceRuleKey({ accountId, mode, value })
          : `${accountId}|legacy`;
      const prev = counts.get(key);
      if (prev) prev.itemCount += 1;
      else counts.set(key, { accountId, mode: mode && value != null ? mode : null, value, itemCount: 1 });
    }
  }

  return [...counts.values()]
    .map((row) => ({
      accountId: row.accountId,
      name: names.get(row.accountId) || 'Cuenta',
      label:
        row.mode != null && row.value != null
          ? formatAccountPriceRuleLabel({ mode: row.mode, value: row.value })
          : 'Precio cargado',
      itemCount: row.itemCount,
      mode: row.mode,
      value: row.value,
    }))
    .filter((r) => r.itemCount > 0)
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, 'es');
      if (byName) return byName;
      return a.label.localeCompare(b.label, 'es');
    });
}

/** Regenera la lista de reglas a partir de los ítems (grupos únicos con mode/value). */
export function syncAccountPriceRulesFromItems(
  items: Array<{ accountPrices?: MenuItemAccountPrice[] | null }>,
): MenuAccountPriceRule[] {
  const byKey = new Map<string, MenuAccountPriceRule>();
  for (const it of items) {
    for (const row of it.accountPrices ?? []) {
      const accountId = String(row.accountId ?? '').trim();
      const mode = normalizeMode(row.mode);
      if (!accountId || !mode || row.value == null || !Number.isFinite(Number(row.value))) continue;
      const rule: MenuAccountPriceRule = { accountId, mode, value: Number(row.value) };
      byKey.set(accountPriceRuleKey(rule), rule);
    }
  }
  return [...byKey.values()];
}
