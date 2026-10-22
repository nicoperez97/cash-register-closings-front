import { Injectable, computed, signal } from '@angular/core';

export type OrderingCartPromoSelection = {
  menuItemId: string;
  name: string;
  qty: number;
};

export type OrderingCartLine = {
  kind: 'ITEM' | 'EXTRA' | 'PROMO';
  menuItemId: string;
  name: string;
  unitPrice: number;
  qty: number;
  notes: string;
  extraId?: string;
  attachedToMenuItemId?: string;
  /** Ingredientes a retirar (ordenados para clave estable). */
  removedIngredients?: string[];
  promoId?: string;
  selections?: OrderingCartPromoSelection[];
};

type CartStore = Record<string, OrderingCartLine[]>;

const STORAGE_PREFIX = 'ordering-cart:';

function storageKey(slug: string): string {
  return `${STORAGE_PREFIX}${slug}`;
}

function normalizeRemoved(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    const name = String(x ?? '').trim().slice(0, 40);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.sort((a, b) => a.localeCompare(b, 'es'));
}

function normalizeSelections(raw: unknown): OrderingCartPromoSelection[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, OrderingCartPromoSelection>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const menuItemId = String((row as OrderingCartPromoSelection).menuItemId ?? '').trim();
    if (!menuItemId) continue;
    const qty = Math.max(1, Math.min(99, Math.round(Number((row as OrderingCartPromoSelection).qty) || 1)));
    const name = String((row as OrderingCartPromoSelection).name ?? '').trim() || menuItemId;
    const prev = byId.get(menuItemId);
    if (prev) byId.set(menuItemId, { ...prev, qty: Math.min(99, prev.qty + qty) });
    else byId.set(menuItemId, { menuItemId, name, qty });
  }
  return [...byId.values()].sort((a, b) => a.menuItemId.localeCompare(b.menuItemId));
}

function selectionsKey(selections?: OrderingCartPromoSelection[]): string {
  return normalizeSelections(selections)
    .map((s) => `${s.menuItemId}x${s.qty}`)
    .join(',');
}

function readSlug(slug: string): OrderingCartLine[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OrderingCartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l) => l && l.menuItemId && l.name && Number(l.unitPrice) >= 0)
      .map((l) => {
        const kind =
          l.kind === 'EXTRA' ? ('EXTRA' as const) : l.kind === 'PROMO' ? ('PROMO' as const) : ('ITEM' as const);
        return {
          kind,
          menuItemId: String(l.menuItemId),
          name: String(l.name),
          unitPrice: Number(l.unitPrice) || 0,
          qty: Math.max(1, Math.min(99, Number(l.qty) || 1)),
          notes: String(l.notes ?? '').trim().slice(0, 300),
          extraId: l.extraId ? String(l.extraId) : undefined,
          attachedToMenuItemId: l.attachedToMenuItemId
            ? String(l.attachedToMenuItemId)
            : undefined,
          removedIngredients:
            kind === 'ITEM' ? normalizeRemoved(l.removedIngredients) : undefined,
          promoId: kind === 'PROMO' ? String(l.promoId ?? l.menuItemId) : undefined,
          selections: kind === 'PROMO' ? normalizeSelections(l.selections) : undefined,
        };
      })
      .filter((l) => l.kind !== 'PROMO' || (l.promoId && (l.selections?.length ?? 0) > 0));
  } catch {
    return [];
  }
}

function writeSlug(slug: string, lines: OrderingCartLine[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!lines.length) {
      localStorage.removeItem(storageKey(slug));
      return;
    }
    localStorage.setItem(storageKey(slug), JSON.stringify(lines));
  } catch {
    // quota / private mode
  }
}

function lineKey(
  l: Pick<
    OrderingCartLine,
    | 'kind'
    | 'menuItemId'
    | 'notes'
    | 'extraId'
    | 'attachedToMenuItemId'
    | 'removedIngredients'
    | 'promoId'
    | 'selections'
  >,
): string {
  if (l.kind === 'EXTRA') {
    return `e:${l.extraId ?? l.menuItemId}:${l.attachedToMenuItemId ?? ''}`;
  }
  if (l.kind === 'PROMO') {
    return `p:${l.promoId ?? l.menuItemId}:${selectionsKey(l.selections)}`;
  }
  const removed = normalizeRemoved(l.removedIngredients).join('|');
  return `i:${l.menuItemId}:${l.notes ?? ''}:${removed}`;
}

@Injectable({ providedIn: 'root' })
export class OrderingCartService {
  private readonly store = signal<CartStore>({});
  private activeSlug = '';

  readonly lines = computed(() => {
    const slug = this.activeSlug;
    if (!slug) return [] as OrderingCartLine[];
    return this.store()[slug] ?? [];
  });

  readonly count = computed(() => this.lines().reduce((n, l) => n + l.qty, 0));

  readonly subtotal = computed(() =>
    this.lines().reduce((sum, l) => sum + l.unitPrice * l.qty, 0),
  );

  bindSlug(slug: string): void {
    const key = String(slug ?? '').trim();
    this.activeSlug = key;
    if (!key) return;
    const current = this.store();
    if (!(key in current)) {
      this.store.set({ ...current, [key]: readSlug(key) });
    }
  }

  private mutate(next: OrderingCartLine[]): void {
    const slug = this.activeSlug;
    if (!slug) return;
    this.store.update((s) => ({ ...s, [slug]: next }));
    writeSlug(slug, next);
  }

  /**
   * Saca del carrito ítems/extras que ya no están disponibles y actualiza precios/nombres.
   * @returns { removedQty, priceChanged }
   */
  reconcileAvailable(available: {
    itemIds: Iterable<string>;
    extraIds?: Iterable<string>;
    promoIds?: Iterable<string>;
    itemPrices?: Record<string, { unitPrice: number; name?: string }>;
    extraPrices?: Record<string, { unitPrice: number; name?: string }>;
    promoPrices?: Record<string, { unitPrice: number; name?: string }>;
  }): { removedQty: number; priceChanged: boolean } {
    const items = new Set(
      [...available.itemIds].map((id) => String(id ?? '').trim()).filter(Boolean),
    );
    const extras = new Set(
      [...(available.extraIds ?? [])].map((id) => String(id ?? '').trim()).filter(Boolean),
    );
    const promos = new Set(
      [...(available.promoIds ?? [])].map((id) => String(id ?? '').trim()).filter(Boolean),
    );
    const beforeQty = this.count();
    let priceChanged = false;
    const keptItems = this.lines()
      .filter((l) => {
        if (l.kind === 'EXTRA') {
          const extraOk = !extras.size || extras.has(String(l.extraId ?? ''));
          const parentOk = !l.attachedToMenuItemId || items.has(l.attachedToMenuItemId);
          return extraOk && parentOk;
        }
        if (l.kind === 'PROMO') {
          const promoId = String(l.promoId ?? l.menuItemId);
          if (promos.size && !promos.has(promoId)) return false;
          return (l.selections ?? []).every((s) => items.has(s.menuItemId));
        }
        return items.has(l.menuItemId);
      })
      .map((l) => {
        if (l.kind === 'EXTRA' && l.extraId && available.extraPrices?.[l.extraId]) {
          const fresh = available.extraPrices[l.extraId];
          if (Number(fresh.unitPrice) !== Number(l.unitPrice)) priceChanged = true;
          return {
            ...l,
            unitPrice: Number(fresh.unitPrice) || 0,
            name: fresh.name ? String(fresh.name) : l.name,
          };
        }
        if (l.kind === 'PROMO') {
          const promoId = String(l.promoId ?? l.menuItemId);
          if (available.promoPrices?.[promoId]) {
            const fresh = available.promoPrices[promoId];
            if (Number(fresh.unitPrice) !== Number(l.unitPrice)) priceChanged = true;
            return {
              ...l,
              unitPrice: Number(fresh.unitPrice) || 0,
              name: fresh.name ? String(fresh.name) : l.name,
            };
          }
          return l;
        }
        if (l.kind === 'ITEM' && available.itemPrices?.[l.menuItemId]) {
          const fresh = available.itemPrices[l.menuItemId];
          if (Number(fresh.unitPrice) !== Number(l.unitPrice)) priceChanged = true;
          return {
            ...l,
            unitPrice: Number(fresh.unitPrice) || 0,
            name: fresh.name ? String(fresh.name) : l.name,
          };
        }
        return l;
      });
    const itemIdsLeft = new Set(
      keptItems.filter((l) => l.kind === 'ITEM').map((l) => l.menuItemId),
    );
    const next = keptItems.filter((l) => {
      if (l.kind === 'EXTRA' && l.attachedToMenuItemId) {
        return itemIdsLeft.has(l.attachedToMenuItemId);
      }
      return true;
    });
    this.mutate(next);
    return {
      removedQty: Math.max(0, beforeQty - this.count()),
      priceChanged,
    };
  }

  add(
    line: Omit<OrderingCartLine, 'qty' | 'kind'> & {
      qty?: number;
      kind?: 'ITEM' | 'EXTRA' | 'PROMO';
      removedIngredients?: string[];
      promoId?: string;
      selections?: OrderingCartPromoSelection[];
    },
  ): void {
    const qty = Math.max(1, Math.min(99, Number(line.qty) || 1));
    const notes = String(line.notes ?? '').trim().slice(0, 300);
    const kind =
      line.kind === 'EXTRA'
        ? ('EXTRA' as const)
        : line.kind === 'PROMO'
          ? ('PROMO' as const)
          : ('ITEM' as const);
    const nextLine: OrderingCartLine = {
      kind,
      menuItemId: String(line.menuItemId),
      name: String(line.name),
      unitPrice: Number(line.unitPrice) || 0,
      qty,
      notes,
      extraId: line.extraId ? String(line.extraId) : undefined,
      attachedToMenuItemId: line.attachedToMenuItemId
        ? String(line.attachedToMenuItemId)
        : undefined,
      removedIngredients: kind === 'ITEM' ? normalizeRemoved(line.removedIngredients) : undefined,
      promoId: kind === 'PROMO' ? String(line.promoId ?? line.menuItemId) : undefined,
      selections: kind === 'PROMO' ? normalizeSelections(line.selections) : undefined,
    };
    if (kind === 'PROMO' && !(nextLine.selections?.length)) return;
    const existing = this.lines();
    const key = lineKey(nextLine);
    const idx = existing.findIndex((l) => lineKey(l) === key);
    if (idx >= 0) {
      const copy = existing.map((l, i) =>
        i === idx ? { ...l, qty: Math.min(99, l.qty + qty) } : l,
      );
      this.mutate(copy);
      return;
    }
    this.mutate([...existing, nextLine]);
  }

  updateQty(
    menuItemId: string,
    notes: string,
    qty: number,
    kind: 'ITEM' | 'EXTRA' | 'PROMO' = 'ITEM',
    extraId?: string,
    attachedToMenuItemId?: string,
    removedIngredients?: string[],
    promoId?: string,
    selections?: OrderingCartPromoSelection[],
  ): void {
    const key = lineKey({
      kind,
      menuItemId,
      notes,
      extraId,
      attachedToMenuItemId,
      removedIngredients,
      promoId,
      selections,
    });
    const q = Math.max(0, Math.min(99, Math.floor(Number(qty) || 0)));
    if (q <= 0) {
      this.mutate(this.lines().filter((l) => lineKey(l) !== key));
      return;
    }
    this.mutate(this.lines().map((l) => (lineKey(l) === key ? { ...l, qty: q } : l)));
  }

  updateNotes(menuItemId: string, oldNotes: string, newNotes: string): void {
    const id = String(menuItemId);
    const from = String(oldNotes ?? '').trim();
    const to = String(newNotes ?? '').trim().slice(0, 300);
    const existing = this.lines();
    const line = existing.find(
      (l) => l.kind === 'ITEM' && l.menuItemId === id && l.notes === from,
    );
    if (!line) return;
    const without = existing.filter(
      (l) => !(l.kind === 'ITEM' && l.menuItemId === id && l.notes === from),
    );
    const mergeKey = lineKey({ ...line, notes: to });
    const mergeIdx = without.findIndex((l) => lineKey(l) === mergeKey);
    if (mergeIdx >= 0) {
      const copy = without.map((l, i) =>
        i === mergeIdx ? { ...l, qty: Math.min(99, l.qty + line.qty) } : l,
      );
      this.mutate(copy);
      return;
    }
    this.mutate([...without, { ...line, notes: to }]);
  }

  remove(
    menuItemId: string,
    notes: string,
    kind: 'ITEM' | 'EXTRA' | 'PROMO' = 'ITEM',
    extraId?: string,
    attachedToMenuItemId?: string,
    removedIngredients?: string[],
    promoId?: string,
    selections?: OrderingCartPromoSelection[],
  ): void {
    const key = lineKey({
      kind,
      menuItemId,
      notes,
      extraId,
      attachedToMenuItemId,
      removedIngredients,
      promoId,
      selections,
    });
    this.mutate(this.lines().filter((l) => lineKey(l) !== key));
  }

  clear(): void {
    this.mutate([]);
  }
}
