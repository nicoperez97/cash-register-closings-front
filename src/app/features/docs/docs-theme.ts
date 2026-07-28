import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DocsShellComponent } from './docs-shell';
import { ThemeService, ThemeMode } from '../../core/theme/theme.service';

@Component({
  selector: 'app-docs-theme',
  imports: [DocsShellComponent, MatButtonModule, MatIconModule],
  template: `
    <app-docs-shell
      title="Tema y colores"
      subtitle="Light / dark / system + paletas"
      description="El ThemeService guarda preferencias en localStorage y aplica CSS variables (--guy-primary, --guy-accent) + data-theme."
    >
      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Modo actual: {{ theme.modeLabel() }}</h2>
        <div class="d-flex flex-wrap gap-2 mb-3">
          <button mat-stroked-button type="button" (click)="set('light')">
            <mat-icon>light_mode</mat-icon>
            Claro
          </button>
          <button mat-stroked-button type="button" (click)="set('dark')">
            <mat-icon>dark_mode</mat-icon>
            Oscuro
          </button>
          <button mat-stroked-button type="button" (click)="set('system')">
            <mat-icon>brightness_auto</mat-icon>
            Sistema
          </button>
        </div>
        <p class="small text-muted mb-0">
          También podés cambiarlo desde el ícono de tema en el toolbar.
        </p>
      </div>

      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Presets</h2>
        <div class="d-flex flex-wrap gap-2">
          @for (p of theme.presets; track p.id) {
            <button mat-stroked-button type="button" (click)="theme.applyPreset(p.id)">
              <span
                class="docs-dot"
                [style.background]="p.primary"
              ></span>
              <span
                class="docs-dot"
                [style.background]="p.accent"
              ></span>
              {{ p.label }}
            </button>
          }
        </div>
      </div>

      <div class="panel-card mb-3">
        <h2 class="guy-section-title">API</h2>
        <table class="docs-api">
          <thead>
            <tr>
              <th>Método</th>
              <th>Descripción</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>setMode('light'|'dark'|'system')</code></td>
              <td>Cambia el modo (system sigue prefers-color-scheme)</td>
            </tr>
            <tr>
              <td><code>applyPreset(id)</code></td>
              <td>Aplica un preset (GlobalUY, Classic, …)</td>
            </tr>
            <tr>
              <td><code>setPrimary / setAccent</code></td>
              <td>Color libre (marca preset custom)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel-card">
        <h2 class="guy-section-title">Snippet</h2>
        <pre class="docs-code">{{ snippet }}</pre>
      </div>
    </app-docs-shell>
  `,
  styles: [
    `
      .docs-dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        margin-right: 0.2rem;
        vertical-align: middle;
      }
    `,
  ],
})
export class DocsThemePage {
  readonly theme = inject(ThemeService);
  readonly snippet = `inject(ThemeService).setMode('dark');
inject(ThemeService).applyPreset('globaluy');
// CSS: html[data-theme="dark"] + --guy-primary / --guy-accent`;

  set(mode: ThemeMode): void {
    this.theme.setMode(mode);
  }
}
