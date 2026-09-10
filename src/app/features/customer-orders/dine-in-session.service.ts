import { Injectable, computed, signal } from '@angular/core';

export type DineInStoredSession = {
  token: string;
  sessionId: string;
  tableId: string;
  tableLabel: string;
  covers: number;
};

const STORAGE_PREFIX = 'dine-in-session:';

function storageKey(slug: string): string {
  return `${STORAGE_PREFIX}${slug}`;
}

@Injectable({ providedIn: 'root' })
export class DineInSessionService {
  private readonly slug = signal('');
  private readonly stored = signal<DineInStoredSession | null>(null);

  readonly active = computed(() => this.stored());
  readonly tableLabel = computed(() => this.stored()?.tableLabel ?? null);
  readonly covers = computed(() => this.stored()?.covers ?? null);

  bindSlug(slug: string): void {
    const s = String(slug ?? '').trim();
    this.slug.set(s);
    this.stored.set(s ? this.read(s) : null);
  }

  save(session: DineInStoredSession): void {
    const s = this.slug();
    if (!s) return;
    this.stored.set(session);
    try {
      localStorage.setItem(storageKey(s), JSON.stringify(session));
    } catch {
      /* private mode */
    }
  }

  clear(): void {
    const s = this.slug();
    this.stored.set(null);
    if (!s) return;
    try {
      localStorage.removeItem(storageKey(s));
    } catch {
      /* ignore */
    }
  }

  token(): string | null {
    return this.stored()?.token ?? null;
  }

  private read(slug: string): DineInStoredSession | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(storageKey(slug));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DineInStoredSession;
      if (!parsed?.token || !parsed.sessionId || !parsed.tableId) return null;
      return {
        token: String(parsed.token),
        sessionId: String(parsed.sessionId),
        tableId: String(parsed.tableId),
        tableLabel: String(parsed.tableLabel ?? '').trim() || '—',
        covers: Math.max(1, Math.min(30, Number(parsed.covers) || 2)),
      };
    } catch {
      return null;
    }
  }
}
