import { Component } from '@angular/core';
import { DocsShellComponent } from './docs-shell';
import { KpiStripComponent, KpiItem } from '../../shared/components/kpi-strip';

@Component({
  selector: 'app-docs-kpi-strip',
  imports: [DocsShellComponent, KpiStripComponent],
  template: `
    <app-docs-shell
      title="KPI strip"
      subtitle="app-kpi-strip"
      description="Fila de métricas responsive (Bootstrap grid: 2 cols mobile, 4 en md+)."
    >
      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Demo</h2>
        <app-kpi-strip [items]="items" />
      </div>
      <div class="panel-card mb-3">
        <h2 class="guy-section-title">API</h2>
        <table class="docs-api">
          <thead>
            <tr>
              <th>Input</th>
              <th>Tipo</th>
              <th>Descripción</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>items</code></td>
              <td><code>KpiItem[]</code></td>
              <td><code>label, value, hint?</code></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="panel-card">
        <pre class="docs-code">{{ snippet }}</pre>
      </div>
    </app-docs-shell>
  `,
})
export class DocsKpiStripPage {
  readonly snippet = `<app-kpi-strip [items]="[
  { label: 'Usuarios', value: 128, hint: 'Activos' }
]" />`;

  readonly items: KpiItem[] = [
    { label: 'Usuarios', value: 128, hint: 'Activos' },
    { label: 'Proyectos', value: 14 },
    { label: 'Uptime', value: '99.9%' },
    { label: 'Tickets', value: 3, hint: 'Abiertos' },
  ];
}
