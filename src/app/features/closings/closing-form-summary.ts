import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatStepperModule } from '@angular/material/stepper';

@Component({
  selector: 'app-closing-form-summary',
  imports: [MatButtonModule, MatIconModule, MatStepperModule],
  template: `
    <div class="closing-totals closing-totals--hero">
      <div class="closing-totals__head">
        <div>
          <h2>Resumen</h2>
          <p class="closing-totals__sub">Lo que importa del día</p>
        </div>
        <button mat-stroked-button type="button" (click)="shareClicked.emit()">
          <mat-icon>share</mat-icon>
          Compartir
        </button>
      </div>
      <div class="closing-totals__grid">
        <div class="closing-totals__item">
          <span>Fecha</span>
          <strong>{{ summaryDate() }}</strong>
        </div>
        <div class="closing-totals__item">
          <span>PVS</span>
          <strong>{{ cardAmount() }}</strong>
        </div>
        <div class="closing-totals__item">
          <span>Efectivo</span>
          <strong>{{ cashAmount() }}</strong>
        </div>
        <div class="closing-totals__item">
          <span>Cuenta DNI</span>
          <strong>{{ accountDniAmount() }}</strong>
        </div>
        <div class="closing-totals__item">
          <span>Caja sistema</span>
          <strong>{{ posAmount() }}</strong>
        </div>
        <div class="closing-totals__item closing-totals__item--total">
          <span>Total declarado</span>
          <strong>{{ declaredTotal() }}</strong>
        </div>
        @if (asideTotal()) {
          <div class="closing-totals__item">
            <span>Cuentas aparte</span>
            <strong>{{ asideTotal() }}</strong>
          </div>
          <div class="closing-totals__item closing-totals__item--day">
            <span>Total del día</span>
            <strong>{{ dayTotal() }}</strong>
          </div>
        }
      </div>
      @if (asideLines().length) {
        <ul class="closing-totals__aside">
          @for (line of asideLines(); track line.name) {
            <li>
              <span>{{ line.name }}</span>
              <strong>{{ line.amount }}</strong>
            </li>
          }
        </ul>
      }
    </div>
    <div class="closing-form__total-bar" aria-live="polite">
      <span>Total declarado</span>
      <strong>{{ declaredTotal() }}</strong>
    </div>
    <div class="closing-stepper__nav closing-stepper__nav--final">
      <button mat-stroked-button type="button" matStepperPrevious>Atrás</button>
      <button
        mat-flat-button
        color="primary"
        type="submit"
        [disabled]="saveDisabled()"
      >
        {{ saving() ? 'Guardando…' : 'Guardar cierre' }}
      </button>
    </div>
  `,
  styleUrl: './closing-form-summary.scss',
})
export class ClosingFormSummaryComponent {
  readonly summaryDate = input('');
  readonly cardAmount = input('');
  readonly cashAmount = input('');
  readonly accountDniAmount = input('');
  readonly posAmount = input('');
  readonly declaredTotal = input('');
  readonly asideTotal = input('');
  readonly dayTotal = input('');
  readonly asideLines = input<Array<{ name: string; amount: string }>>([]);
  readonly saving = input(false);
  readonly saveDisabled = input(false);

  readonly shareClicked = output<void>();
}
