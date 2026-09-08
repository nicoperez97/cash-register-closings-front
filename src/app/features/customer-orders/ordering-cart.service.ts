import { Injectable, computed, signal } from '@angular/core';

export type OrderingCartLine = {
  menuItemId: string;
  name: string;
  unitPrice: number;
  qty: number;
  notes: string;
};

type CartStore = Record<string, OrderingCartLine[]>;

const STORAGE_PREFIX = 'ordering-cart:';

function storageKey(slug: string): string {
  return `${STORAGE_PREFIX}${slug}`;
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
        menuItemId: String(l.menuItemId),
        name: String(l.name),
        unitPrice: Number(l.unitPrice) || 0,
        qty: Math.max(1, Math.min(99, Number(l.qty) || 1)),
        notes: String(l.notes ?? '').trim().slice(0, 300),
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

  add(line: Omit<OrderingCartLine, 'qty'> & { qty?: number }): void {
    const qty = Math.max(1, Math.min(99, Number(line.qty) || 1));
    const notes = String(line.notes ?? '').trim().slice(0, 300);
    const menuItemId = String(line.menuItemId);
    const existing = this.lines();
    const idx = existing.findIndex(
      (l) => l.menuItemId === menuItemId && l.notes === notes,
    );
    if (idx >= 0) {
      const copy = existing.map((l, i) =>
        i === idx ? { ...l, qty: Math.min(99, l.qty + qty) } : l,
      );
      this.mutate(copy);
      return;
    }
    this.mutate([
      ...existing,
      {
        menuItemId,
        name: String(line.name),
        unitPrice: Number(line.unitPrice) || 0,
        qty,
        notes,
      },
    ]);
  }

  updateQty(menuItemId: string, notes: string, qty: number): void {
    const id = String(menuItemId);
    const n = String(notes ?? '').trim();
    const q = Math.max(0, Math.min(99, Math.floor(Number(qty) || 0)));
    if (q <= 0) {
      this.remove(id, n);
      return;
    }
    this.mutate(
      this.lines().map((l) =>
        l.menuItemId === id && l.notes === n ? { ...l, qty: q } : l,
      ),
    );
  }

  updateNotes(menuItemId: string, oldNotes: string, newNotes: string): void {
    const id = String(menuItemId);
    const from = String(oldNotes ?? '').trim();
    const to = String(newNotes ?? '').trim().slice(0, 300);
    const existing = this.lines();
    const line = existing.find((l) => l.menuItemId === id && l.notes === from);
    if (!line) return;
    const without = existing.filter((l) => !(l.menuItemId === id && l.notes === from));
    const mergeIdx = without.findIndex((l) => l.menuItemId === id && l.notes === to);
    if (mergeIdx >= 0) {
      const copy = without.map((l, i) =>
        i === mergeIdx ? { ...l, qty: Math.min(99, l.qty + line.qty) } : l,
      );
      this.mutate(copy);
      return;
    }
    this.mutate([...without, { ...line, notes: to }]);
  }

  remove(menuItemId: string, notes: string): void {
    const id = String(menuItemId);
    const n = String(notes ?? '').trim();
    this.mutate(this.lines().filter((l) => !(l.menuItemId === id && l.notes === n)));
  }

  clear(): void {
    this.mutate([]);
  }
}
