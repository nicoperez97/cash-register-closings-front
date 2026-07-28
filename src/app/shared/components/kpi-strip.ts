import { Component, Input } from '@angular/core';

export interface KpiItem {
  label: string;
  value: string | number;
  hint?: string;
}

@Component({
  selector: 'app-kpi-strip',
  template: `
    <div class="row g-2 guy-stagger">
      @for (k of items; track k.label) {
        <div class="col-6 col-md-3">
          <div class="guy-kpi">
            <div class="guy-kpi__label">{{ k.label }}</div>
            <div class="guy-kpi__value">{{ k.value }}</div>
            @if (k.hint) {
              <div class="small text-muted">{{ k.hint }}</div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class KpiStripComponent {
  @Input() items: KpiItem[] = [];
}
