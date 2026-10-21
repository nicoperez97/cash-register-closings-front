import { Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  Router,
  RouterOutlet,
} from '@angular/router';
import { filter, take } from 'rxjs';
import { ThemeService } from './core/theme/theme.service';
import { installSmoothCardHeights } from './shared/utils/smooth-card-heights';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    @if (!shellReady()) {
      <div class="app-shell-boot" role="status" aria-live="polite" aria-busy="true">
        <span class="app-shell-boot__spin" aria-hidden="true"></span>
        <span class="app-shell-boot__sr">Cargando…</span>
      </div>
    }
    <router-outlet />
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        min-height: 100%;
      }
      .app-shell-boot {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--guy-surface, #f3f6f4);
      }
      .app-shell-boot__spin {
        width: 1.75rem;
        height: 1.75rem;
        border: 2px solid rgba(197, 208, 204, 0.85);
        border-top-color: #3d9be0;
        border-radius: 50%;
        animation: guy-app-boot-spin 0.7s linear infinite;
      }
      .app-shell-boot__sr {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      @keyframes guy-app-boot-spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class App {
  /** Eager init: aplica tema guardado antes del primer paint útil. */
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  /**
   * Cubre el primer navegación (p.ej. `/` → `/admin/inicio` con sesión) para no
   * pintar la portada mientras la URL ya cambió.
   */
  readonly shellReady = signal(false);

  constructor() {
    if (this.router.navigated) {
      this.shellReady.set(true);
    } else {
      this.router.events
        .pipe(
          filter(
            (e) =>
              e instanceof NavigationEnd ||
              e instanceof NavigationCancel ||
              e instanceof NavigationError,
          ),
          take(1),
          takeUntilDestroyed(),
        )
        .subscribe(() => this.shellReady.set(true));
    }

    afterNextRender(() => {
      const stop = installSmoothCardHeights();
      this.destroyRef.onDestroy(stop);
    });
  }
}
