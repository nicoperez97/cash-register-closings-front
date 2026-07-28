import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { KpiStripComponent, KpiItem } from '../../shared/components/kpi-strip';

@Component({
  selector: 'app-demo-dashboard',
  imports: [PageHeaderComponent, KpiStripComponent, MatIconModule],
  template: `
    <app-page-header
      title="Dashboard demo"
      subtitle="Ejemplo de página con KPIs y cards"
    />
    <app-kpi-strip class="mb-3" [items]="kpis" />
    <div class="row g-3 guy-stagger">
      @for (item of cards; track item.title) {
        <div class="col-12 col-md-6 col-lg-4">
          <article class="guy-entity-card">
            <h3 class="guy-entity-card__title">{{ item.title }}</h3>
            <div class="guy-entity-card__chips">
              <span class="guy-chip guy-chip--success">
                <mat-icon>check_circle</mat-icon>
                {{ item.chip }}
              </span>
            </div>
            <p class="guy-entity-card__meta mb-0">
              <mat-icon>schedule</mat-icon>
              {{ item.meta }}
            </p>
          </article>
        </div>
      }
    </div>
  `,
})
export class DemoDashboardPage {
  readonly kpis: KpiItem[] = [
    { label: 'Ingresos', value: '$ 42k', hint: 'Mes' },
    { label: 'Clientes', value: 86 },
    { label: 'NPS', value: 72 },
    { label: 'SLA', value: '98%' },
  ];

  readonly cards = [
    { title: 'Onboarding Acme', chip: 'En curso', meta: 'Actualizado hoy' },
    { title: 'Integración API', chip: 'OK', meta: 'Hace 2 h' },
    { title: 'Release 1.2', chip: 'Planificado', meta: 'Viernes' },
  ];
}
