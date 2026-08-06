import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth/auth.service';

const MIN_SPINNER_MS = 500;

/**
 * Registro de “recargar esta pantalla” para pull-to-refresh móvil.
 * Cada página con datos de API llama `usePageRefresh(() => this.reload())`.
 */
@Injectable({ providedIn: 'root' })
export class PageRefreshService {
  private handler: (() => void | Promise<void>) | null = null;

  readonly hasHandler = signal(false);
  readonly refreshing = signal(false);

  register(handler: () => void | Promise<void>, destroyRef: DestroyRef): void {
    this.handler = handler;
    this.hasHandler.set(true);
    destroyRef.onDestroy(() => {
      if (this.handler === handler) {
        this.handler = null;
        this.hasHandler.set(false);
        this.refreshing.set(false);
      }
    });
  }

  async refresh(): Promise<void> {
    if (!this.handler || this.refreshing()) return;
    this.refreshing.set(true);
    const started = Date.now();
    try {
      await Promise.resolve(this.handler());
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
  const auth = inject(AuthService);
  svc.register(async () => {
    await Promise.resolve(handler());
    void auth.refreshMe().catch(() => undefined);
  }, destroyRef);
}
