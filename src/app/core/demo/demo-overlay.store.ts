import { Injectable } from '@angular/core';

type ListOverlay = {
  upserts: Map<string, Record<string, unknown>>;
  deletedIds: Set<string>;
};

/**
 * Estado efímero de mutaciones demo (solo memoria; se pierde al recargar).
 */
@Injectable({ providedIn: 'root' })
export class DemoOverlayStore {
  private readonly lists = new Map<string, ListOverlay>();
  private readonly docs = new Map<string, unknown>();

  clear(): void {
    this.lists.clear();
    this.docs.clear();
  }

  setDoc(key: string, body: unknown, merge = true): void {
    const prev = this.docs.get(key);
    if (
      merge &&
      prev &&
      typeof prev === 'object' &&
      !Array.isArray(prev) &&
      body &&
      typeof body === 'object' &&
      !Array.isArray(body)
    ) {
      this.docs.set(key, { ...(prev as object), ...(body as object) });
      return;
    }
    this.docs.set(key, body);
  }

  getDoc(key: string): unknown {
    return this.docs.get(key);
  }

  markDeleted(listKey: string, id: string): void {
    const entry = this.ensureList(listKey);
    entry.deletedIds.add(id);
    entry.upserts.delete(id);
  }

  upsertInList(listKey: string, row: Record<string, unknown>): void {
    const id = this.rowId(row);
    if (!id) return;
    const entry = this.ensureList(listKey);
    entry.deletedIds.delete(id);
    const prev = entry.upserts.get(id);
    entry.upserts.set(id, prev ? { ...prev, ...row } : row);
  }

  mergeGet(key: string, serverBody: unknown): unknown {
    if (this.docs.has(key)) {
      const doc = this.docs.get(key);
      if (Array.isArray(doc)) return doc;
      if (doc && typeof doc === 'object' && serverBody && typeof serverBody === 'object' && !Array.isArray(serverBody)) {
        return { ...(serverBody as object), ...(doc as object) };
      }
      return doc;
    }

    if (Array.isArray(serverBody)) {
      const entry = this.lists.get(key);
      if (!entry) return serverBody;
      let list = serverBody.filter((row) => {
        const id = this.rowId(row);
        return !id || !entry.deletedIds.has(id);
      });
      for (const [id, row] of entry.upserts) {
        if (entry.deletedIds.has(id)) continue;
        const idx = list.findIndex((r) => this.rowId(r) === id);
        if (idx >= 0) {
          list[idx] = { ...(list[idx] as object), ...row };
        } else {
          list = [row, ...list];
        }
      }
      return list;
    }

    return serverBody;
  }

  private ensureList(key: string): ListOverlay {
    let entry = this.lists.get(key);
    if (!entry) {
      entry = { upserts: new Map(), deletedIds: new Set() };
      this.lists.set(key, entry);
    }
    return entry;
  }

  private rowId(row: unknown): string | null {
    if (!row || typeof row !== 'object') return null;
    const r = row as Record<string, unknown>;
    const id = r['id'] ?? r['userId'] ?? r['accountId'];
    return id != null ? String(id) : null;
  }
}
