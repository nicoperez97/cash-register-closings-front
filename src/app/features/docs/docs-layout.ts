import { Component } from '@angular/core';
import { DocsShellComponent } from './docs-shell';

@Component({
  selector: 'app-docs-layout',
  imports: [DocsShellComponent],
  template: `
    <app-docs-shell
      title="Layout"
      subtitle="Shell: sidebar, toolbar y bottom-nav"
      description="MainLayout orquesta el sidenav Material. En mobile usa mode over + bottom nav fijo; en desktop, sidebar permanente."
    >
      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Breakpoints</h2>
        <table class="docs-api">
          <thead>
            <tr>
              <th>Fuente</th>
              <th>Comportamiento</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>BreakpointObserver</code> Handset / TabletPortrait</td>
              <td>Drawer overlay, bottom nav, toolbar compacto</td>
            </tr>
            <tr>
              <td>Desktop</td>
              <td>Sidebar side, sin bottom nav</td>
            </tr>
            <tr>
              <td>≤960px gutters</td>
              <td>Padding reducido vía <code>--guy-gutter</code></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Componentes</h2>
        <ul class="mb-0">
          <li><code>app-main-layout</code> — contenedor + router-outlet</li>
          <li><code>app-sidebar</code> — brand, nav, footer “by GlobalUY”</li>
          <li><code>app-toolbar</code> — menú, contexto, usuario, logout</li>
          <li><code>app-bottom-nav</code> — tabs + botón “Más”</li>
        </ul>
      </div>

      <div class="panel-card">
        <h2 class="guy-section-title">Uso</h2>
        <pre class="docs-code">{{ snippet }}</pre>
      </div>
    </app-docs-shell>
  `,
})
export class DocsLayoutPage {
  readonly snippet = `{
  path: '',
  component: MainLayoutComponent,
  canActivate: [authGuard],
  children: [ /* tus rutas */ ]
}`;
}
