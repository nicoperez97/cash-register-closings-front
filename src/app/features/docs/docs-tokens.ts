import { Component } from '@angular/core';
import { DocsShellComponent } from './docs-shell';

@Component({
  selector: 'app-docs-tokens',
  imports: [DocsShellComponent],
  template: `
    <app-docs-shell
      title="Design tokens"
      subtitle="Variables CSS --guy-* y utilidades"
      description="Tokens CSS del design system GlobalUY. Definidos en src/styles.scss."
    >
      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Colores</h2>
        <div class="docs-swatch-row">
          @for (s of swatches; track s.name) {
            <div class="docs-swatch">
              <div class="docs-swatch__color" [style.background]="s.color"></div>
              <div class="docs-swatch__meta">
                <strong>{{ s.name }}</strong>
                <span>{{ s.color }}</span>
              </div>
            </div>
          }
        </div>
      </div>

      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Clases útiles</h2>
        <ul class="mb-0">
          <li><code>.panel-card</code> — contenedor de sección</li>
          <li><code>.guy-entity-card</code> — card de entidad (mobile lists)</li>
          <li><code>.guy-chip--primary|success|warning|muted</code></li>
          <li><code>.guy-empty</code> — empty state</li>
          <li><code>.guy-enter</code> / <code>.guy-stagger</code> — motion</li>
          <li><code>.guy-kpi</code> — métrica (vía kpi-strip)</li>
        </ul>
      </div>

      <div class="panel-card">
        <pre class="docs-code">{{ snippet }}</pre>
      </div>
    </app-docs-shell>
  `,
})
export class DocsTokensPage {
  readonly snippet = `:root {
  --guy-navy: #003366;
  --guy-green: #2e7d32;
  --guy-surface: #f3f6f4;
  --guy-radius: 12px;
  --guy-dur-slow: 380ms;
}`;

  readonly swatches = [
    { name: '--guy-navy', color: '#003366' },
    { name: '--guy-green', color: '#2e7d32' },
    { name: '--guy-blue', color: '#0b5cab' },
    { name: '--guy-orange', color: '#e6870a' },
    { name: '--guy-surface', color: '#f3f6f4' },
    { name: '--guy-border', color: '#d7e0d9' },
  ];
}
