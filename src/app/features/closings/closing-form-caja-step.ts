import { Component, input } from '@angular/core';
import { ControlContainer, FormGroupDirective, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ClosingFormStepNavComponent } from './closing-form-step-nav';

@Component({
  selector: 'app-closing-form-caja-step',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    ClosingFormStepNavComponent,
  ],
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
  template: `
    <div class="closing-form__block">
      <div class="closing-form__block-head">
        <div class="closing-form__block-title">
          <h3>Caja</h3>
          <span class="closing-form__meta">Lo cobrado vs el total del sistema</span>
        </div>
      </div>
      <div class="closing-form__block-body">
        <ul class="closing-caja__calc">
          @for (row of breakdown(); track row.name) {
            <li>
              <span>{{ row.name }}</span>
              <strong>{{ row.amount }}</strong>
            </li>
          } @empty {
            <li class="closing-caja__empty">Todavía no hay cobros cargados</li>
          }
          <li class="closing-caja__calc-total">
            <span>Calculado</span>
            <strong>{{ calculated() }}</strong>
          </li>
        </ul>
        <div class="closing-form__fields closing-form__fields--single">
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            floatLabel="always"
            class="closing-field--money closing-form__caja-field"
          >
            <mat-label>Caja (sistema)</mat-label>
            <span matTextPrefix class="closing-field__prefix">$</span>
            <input matInput type="number" inputmode="decimal" formControlName="posSystemAmount" />
          </mat-form-field>
        </div>
        <div
          class="closing-caja__diff"
          [class.closing-caja__diff--pending]="difference() === null"
          [class.closing-caja__diff--ok]="difference() === 0"
          [class.closing-caja__diff--plus]="(difference() ?? 0) > 0"
          [class.closing-caja__diff--minus]="(difference() ?? 0) < 0"
        >
          <div>
            <span>Diferencia</span>
            <small>Caja − Calculado</small>
          </div>
          <strong>{{ differenceLabel() }}</strong>
        </div>
      </div>
    </div>
    <app-closing-form-step-nav />
  `,
  styleUrl: './closing-form-caja-step.scss',
})
export class ClosingFormCajaStepComponent {
  readonly calculated = input('');
  readonly breakdown = input<Array<{ name: string; amount: string }>>([]);
  readonly difference = input<number | null>(null);
  readonly differenceLabel = input('—');
}
