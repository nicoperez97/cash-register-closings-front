import { Injectable, computed, effect, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DEMO_STORAGE_KEYS } from './demo-constants';
import { DemoOverlayStore } from './demo-overlay.store';
import { isDemoSession } from './demo-offline';

@Injectable({ providedIn: 'root' })
export class DemoModeService {
  private readonly auth = inject(AuthService);
  private readonly overlay = inject(DemoOverlayStore);

  readonly enabled = computed(
    () => !!this.auth.currentUser()?.isDemo || isDemoSession(),
  );

  constructor() {
    effect(() => {
      if (!this.enabled()) this.overlay.clear();
    });
  }

  clear(): void {
    this.overlay.clear();
  }

  /** Llamar al salir de la demo. */
  exit(): void {
    this.clear();
    try {
      sessionStorage.removeItem(DEMO_STORAGE_KEYS.tour);
    } catch {
      // ignore
    }
  }
}
