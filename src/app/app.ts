import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { inject } from '@angular/core';
import { ThemeService } from './core/theme/theme.service';

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
}
