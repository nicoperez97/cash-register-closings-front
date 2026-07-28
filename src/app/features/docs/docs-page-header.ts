import { Component } from '@angular/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DocsShellComponent } from './docs-shell';
import { PageHeaderComponent } from '../../shared/components/page-header';

@Component({
  selector: 'app-docs-page-header',
  imports: [DocsShellComponent, PageHeaderComponent, MatSnackBarModule],
  template: `
    <app-docs-shell
      title="Page header"
      subtitle="app-page-header"
      description="Cabecera de página con eyebrow GlobalUY, título, subtítulo y CTA opcional."
    >
      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Demo</h2>
        <app-page-header
          title="Ejemplo de cabecera"
          subtitle="Podés pasar actionLabel para un CTA"
          actionLabel="Nueva acción"
          (action)="onAction()"
        />
      </div>

      <div class="panel-card mb-3">
        <h2 class="guy-section-title">API</h2>
        <table class="docs-api">
          <thead>
            <tr>
              <th>Input / Output</th>
              <th>Tipo</th>
              <th>Descripción</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>title</code></td>
              <td>string (req)</td>
              <td>Título principal</td>
            </tr>
            <tr>
              <td><code>subtitle</code></td>
              <td>string</td>
              <td>Texto de apoyo</td>
            </tr>
            <tr>
              <td><code>eyebrow</code></td>
              <td>string</td>
              <td>Override del brand (default GlobalUY)</td>
            </tr>
            <tr>
              <td><code>actionLabel</code> / <code>actionIcon</code></td>
              <td>string</td>
              <td>CTA opcional</td>
            </tr>
            <tr>
              <td><code>action</code></td>
              <td>Output</td>
              <td>Click del botón</td>
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
})
export class DocsPageHeaderPage {
  readonly snippet = `<app-page-header
  title="Mis entidades"
  subtitle="Listado principal"
  actionLabel="Nuevo"
  (action)="openCreate()"
/>`;

  constructor(private readonly snack: MatSnackBar) {}

  onAction(): void {
    this.snack.open('CTA del page-header', 'OK', { duration: 2000 });
  }
}
