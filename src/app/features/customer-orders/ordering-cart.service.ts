import { Injectable, computed, signal } from '@angular/core';

export type OrderingCartLine = {
  kind: 'ITEM' | 'EXTRA';
  menuItemId: string;
  name: string;
  unitPrice: number;
  qty: number;
  notes: string;
  extraId?: string;
  attachedToMenuItemId?: string;
  /** Ingredientes a retirar (ordenados para clave estable). */
  removedIngredients?: string[];
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

function readSlug(slug: string): OrderingCartLine[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OrderingCartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((l) => l && l.menuItemId && l.name && Number(l.unitPrice) >= 0)
      .map((l) => ({
        kind: l.kind === 'EXTRA' ? ('EXTRA' as const) : ('ITEM' as const),
        menuItemId: String(l.menuItemId),
        name: String(l.name),
        unitPrice: Number(l.unitPrice) || 0,
        qty: Math.max(1, Math.min(99, Number(l.qty) || 1)),
        notes: String(l.notes ?? '').trim().slice(0, 300),
        extraId: l.extraId ? String(l.extraId) : undefined,
        attachedToMenuItemId: l.attachedToMenuItemId
          ? String(l.attachedToMenuItemId)
          : undefined,
        removedIngredients: normalizeRemoved(l.removedIngredients),
      }));
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
    'kind' | 'menuItemId' | 'notes' | 'extraId' | 'attachedToMenuItemId' | 'removedIngredients'
  >,
): string {
  if (l.kind === 'EXTRA') {
    return `e:${l.extraId ?? l.menuItemId}:${l.attachedToMenuItemId ?? ''}`;
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
   * Saca del carrito ítems/extras que ya no están disponibles en la carta fresca.
   * @returns cantidad de unidades quitadas
   */
  reconcileAvailable(available: {
    itemIds: Iterable<string>;
    extraIds?: Iterable<string>;
  }): number {
    const items = new Set(
      [...available.itemIds].map((id) => String(id ?? '').trim()).filter(Boolean),
    );
    const extras = new Set(
      [...(available.extraIds ?? [])].map((id) => String(id ?? '').trim()).filter(Boolean),
    );
    const beforeQty = this.count();
    const keptItems = this.lines().filter((l) => {
      if (l.kind === 'EXTRA') {
        const extraOk = !extras.size || extras.has(String(l.extraId ?? ''));
        const parentOk = !l.attachedToMenuItemId || items.has(l.attachedToMenuItemId);
        return extraOk && parentOk;
      }
      return items.has(l.menuItemId);
    });
    const itemIdsLeft = new Set(
      keptItems.filter((l) => l.kind !== 'EXTRA').map((l) => l.menuItemId),
    );
    const next = keptItems.filter((l) => {
      if (l.kind === 'EXTRA' && l.attachedToMenuItemId) {
        return itemIdsLeft.has(l.attachedToMenuItemId);
      }
      return true;
    });
    this.mutate(next);
    return Math.max(0, beforeQty - this.count());
  }

  add(
    line: Omit<OrderingCartLine, 'qty' | 'kind'> & {
      qty?: number;
      kind?: 'ITEM' | 'EXTRA';
      removedIngredients?: string[];
    },
  ): void {
    const qty = Math.max(1, Math.min(99, Number(line.qty) || 1));
    const notes = String(line.notes ?? '').trim().slice(0, 300);
    const kind = line.kind === 'EXTRA' ? ('EXTRA' as const) : ('ITEM' as const);
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
    };
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
    kind: 'ITEM' | 'EXTRA' = 'ITEM',
    extraId?: string,
    attachedToMenuItemId?: string,
    removedIngredients?: string[],
  ): void {
    const key = lineKey({
      kind,
      menuItemId,
      notes,
      extraId,
      attachedToMenuItemId,
      removedIngredients,
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
      (l) => l.kind !== 'EXTRA' && l.menuItemId === id && l.notes === from,
    );
    if (!line) return;
    const without = existing.filter(
      (l) => !(l.kind !== 'EXTRA' && l.menuItemId === id && l.notes === from),
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
    kind: 'ITEM' | 'EXTRA' = 'ITEM',
    extraId?: string,
    attachedToMenuItemId?: string,
    removedIngredients?: string[],
  ): void {
    const key = lineKey({
      kind,
      menuItemId,
      notes,
      extraId,
      attachedToMenuItemId,
      removedIngredients,
    });
    this.mutate(this.lines().filter((l) => lineKey(l) !== key));
  }

  clear(): void {
    this.mutate([]);
  }
}
