import { Injectable, DestroyRef, computed, inject, signal } from '@angular/core';

/**
 * Estado de conectividad para demos y banners offline.
 * En producción combiná esto con Service Worker + sync/outbox.
 */
@Injectable({ providedIn: 'root' })
export class OfflineService {
  private readonly destroyRef = inject(DestroyRef);

  readonly online = signal(typeof navigator !== 'undefined' ? navigator.onLine : true);
  /** Simulación manual (docs/demo) — no afecta navigator.onLine real. */
  readonly simulatedOffline = signal(false);

  readonly effectivelyOnline = computed(() => this.online() && !this.simulatedOffline());

  constructor() {
    if (typeof window === 'undefined') return;

    const sync = () => this.online.set(navigator.onLine);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    });
    sync();
  }

  setSimulatedOffline(value: boolean): void {
    this.simulatedOffline.set(value);
  }

  toggleSimulatedOffline(): void {
    this.simulatedOffline.update((v) => !v);
  }
}
