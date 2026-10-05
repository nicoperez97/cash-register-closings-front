import { Component, DestroyRef, afterNextRender, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme/theme.service';
import { installSmoothCardHeights } from './shared/utils/smooth-card-heights';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        min-height: 100%;
      }
    `,
  ],
})
export class App {
  /** Eager init: aplica tema guardado antes del primer paint útil. */
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      const stop = installSmoothCardHeights();
      this.destroyRef.onDestroy(stop);
    });
  }
}
