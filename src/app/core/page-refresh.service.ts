import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth/auth.service';

const MIN_SPINNER_MS = 500;

/**
 * Registro de “recargar esta pantalla” para pull-to-refresh móvil.
 * Varios componentes pueden registrar handlers; todos corren juntos.
 */
@Injectable({ providedIn: 'root' })
export class PageRefreshService {
  private readonly auth = inject(AuthService);
  private readonly handlers = new Map<symbol, () => void | Promise<void>>();

  readonly hasHandler = signal(false);
  readonly refreshing = signal(false);

  register(handler: () => void | Promise<void>, destroyRef: DestroyRef): void {
    const id = Symbol('page-refresh');
    this.handlers.set(id, handler);
    this.hasHandler.set(true);
    destroyRef.onDestroy(() => {
      this.handlers.delete(id);
      this.hasHandler.set(this.handlers.size > 0);
      if (!this.handlers.size) this.refreshing.set(false);
    });
  }

  async refresh(): Promise<void> {
    if (!this.handlers.size || this.refreshing()) return;
    this.refreshing.set(true);
    const started = Date.now();
    try {
      await Promise.all(
        [...this.handlers.values()].map((handler) => Promise.resolve(handler())),
      );
      void this.auth.refreshMe().catch(() => undefined);
    } finally {
      const wait = MIN_SPINNER_MS - (Date.now() - started);
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait));
      }
      this.refreshing.set(false);
    }
  }
}

/** Registrar el reload de la página actual (llamar en constructor / injection context). */
export function usePageRefresh(handler: () => void | Promise<void>): void {
  const svc = inject(PageRefreshService);
  const destroyRef = inject(DestroyRef);
  svc.register(handler, destroyRef);
}
