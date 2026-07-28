import { Component } from '@angular/core';
import { DocsShellComponent } from './docs-shell';
import { APP_BRAND } from '../../core/config/app-brand';

@Component({
  selector: 'app-docs-getting-started',
  imports: [DocsShellComponent],
  template: `
    <app-docs-shell
      title="Empezar"
      subtitle="Cómo usar este template en un proyecto nuevo"
      description="Cloná la carpeta, renombrá el producto y reemplazá el AuthService mock por tu API."
    >
      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Checklist</h2>
        <ol class="mb-0">
          <li>Copiá <code>angular-globaluy-template</code> y renombrá el proyecto en <code>package.json</code> / <code>angular.json</code>.</li>
          <li>Editá <code>src/app/core/config/app-brand.ts</code> (nombre, tagline, URL).</li>
          <li>Logos: <code>logo-globaluy.svg</code> (color) y <code>logo-globaluy-white.svg</code> (login).</li>
          <li>Conectá <code>AuthService</code> a tu backend (hoy es mock localStorage).</li>
          <li>Borrá <code>features/docs</code> y <code>features/demo</code> cuando no los necesites.</li>
          <li>Agregá tus features bajo <code>src/app/features/</code> y registralas en las rutas del layout.</li>
        </ol>
      </div>

      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Comandos</h2>
        <pre class="docs-code">npm install
npm start
# → http://localhost:4200
# Login demo: admin&#64;globaluy.com / demo</pre>
      </div>

      <div class="panel-card">
        <h2 class="guy-section-title">Estructura</h2>
        <pre class="docs-code">src/app/
  core/layout/     # shell responsive
  core/auth/       # mock auth + guard
  shared/          # componentes UI
  features/docs/   # catálogo vivo
  features/demo/   # páginas ejemplo
  features/auth/   # login</pre>
        <p class="small text-muted mb-0 mt-2">by {{ brand.company }}</p>
      </div>
    </app-docs-shell>
  `,
})
export class DocsGettingStartedPage {
  readonly brand = APP_BRAND;
}
