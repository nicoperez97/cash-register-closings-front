import { Component, input } from '@angular/core';

@Component({
  selector: 'app-closing-form-live-summary',
  template: `
    <aside class="closing-live" aria-live="polite" aria-label="Resumen del cierre">
      <div class="closing-live__head">
        <h2>Resumen</h2>
        <div class="closing-live__total">
          <span>Total declarado</span>
          <strong>{{ declaredTotal() }}</strong>
        </div>
      </div>
      @if (lines().length) {
        <ul class="closing-live__lines">
          @for (line of lines(); track line.name) {
            <li>
              <span>{{ line.name }}</span>
              <strong>{{ line.amount }}</strong>
            </li>
          }
        </ul>
      } @else {
        <p class="closing-live__empty">Los montos van apareciendo acá a medida que los cargás.</p>
      }
      @if (asideLines().length) {
        <ul class="closing-live__aside">
          @for (line of asideLines(); track line.name) {
            <li>
              <span>{{ line.name }}</span>
              <strong>{{ line.amount }}</strong>
            </li>
          }
        </ul>
        <div class="closing-live__day">
          <span>Total del día</span>
          <strong>{{ dayTotal() }}</strong>
        </div>
      }
      @if (difference()) {
        <div
          class="closing-live__diff"
          [class.closing-live__diff--ok]="differenceTone() === 0"
          [class.closing-live__diff--plus]="(differenceTone() ?? 0) > 0"
          [class.closing-live__diff--minus]="(differenceTone() ?? 0) < 0"
        >
          <span>Diferencia</span>
          <strong>{{ difference() }}</strong>
        </div>
      }
    </aside>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .closing-live {
        padding: 0.7rem 0.9rem 0.75rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 14px;
        background: var(--guy-card, #fff);
        box-shadow: 0 -4px 14px rgba(0, 51, 102, 0.06);
      }
      .closing-live__head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.45rem;
      }
      .closing-live__head h2 {
        margin: 0;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--guy-muted, #5f6f76);
      }
      .closing-live__total {
        display: flex;
        align-items: baseline;
        gap: 0.45rem;
        font-variant-numeric: tabular-nums;
      }
      .closing-live__total span {
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--guy-muted, #5f6f76);
      }
      .closing-live__total strong {
        font-size: 1.05rem;
        color: var(--guy-accent, #2e7d32);
      }
      .closing-live__lines,
      .closing-live__aside {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
        gap: 0.35rem 0.75rem;
      }
      .closing-live__lines li,
      .closing-live__aside li {
        display: flex;
        justify-content: space-between;
        gap: 0.4rem;
        min-width: 0;
        font-size: 0.8rem;
        color: var(--guy-muted, #5f6f76);
        font-variant-numeric: tabular-nums;
      }
      .closing-live__lines strong,
      .closing-live__aside strong {
        color: var(--guy-navy, #003366);
      }
      .closing-live__aside {
        margin-top: 0.4rem;
        padding-top: 0.4rem;
        border-top: 1px dashed var(--guy-border, #d7e0d9);
      }
      .closing-live__empty {
        margin: 0;
        font-size: 0.8rem;
        color: var(--guy-muted, #5f6f76);
      }
      .closing-live__day,
      .closing-live__diff {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        margin-top: 0.4rem;
        font-size: 0.82rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .closing-live__day strong {
        color: var(--guy-navy, #003366);
      }
      .closing-live__diff--ok strong,
      .closing-live__diff--plus strong {
        color: var(--guy-accent, #2e7d32);
      }
      .closing-live__diff--minus strong {
        color: #c62828;
      }
    `,
  ],
})
export class ClosingFormLiveSummaryComponent {
  readonly lines = input<Array<{ name: string; amount: string }>>([]);
  readonly asideLines = input<Array<{ name: string; amount: string }>>([]);
  readonly declaredTotal = input('');
  readonly dayTotal = input('');
  readonly difference = input('');
  readonly differenceTone = input<number | null>(null);
}
