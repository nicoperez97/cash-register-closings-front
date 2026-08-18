import { Component, input, output } from '@angular/core';
import {
  ControlContainer,
  FormArray,
  FormGroupDirective,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ClosingFormStepNavComponent } from './closing-form-step-nav';

@Component({
  selector: 'app-closing-form-caja-otros-step',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ClosingFormStepNavComponent,
  ],
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
  template: `
    <div class="closing-form__block">
      <div class="closing-form__block-head">
        <div class="closing-form__block-title">
          <h3>Caja</h3>
          <span class="closing-form__meta">Total del sistema</span>
        </div>
      </div>
      <div class="closing-form__block-body">
        <div class="closing-form__fields closing-form__fields--single">
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            floatLabel="always"
            class="closing-field--money"
          >
            <mat-label>Caja (sistema)</mat-label>
            <span matTextPrefix class="closing-field__prefix">$</span>
            <input matInput type="number" inputmode="decimal" formControlName="posSystemAmount" />
          </mat-form-field>
        </div>
      </div>
    </div>
    <div class="closing-form__block">
      <div class="closing-form__block-head">
        <div class="closing-form__block-title">
          <h3>Cobros</h3>
          <span class="closing-form__meta">{{ cobrosHint() }}</span>
        </div>
      </div>
      <div class="closing-form__block-body">
        <div class="closing-form__stack" formArrayName="otherCobros">
          @for (row of otherCobros().controls; track row; let i = $index) {
            <div class="closing-form__cobro-row" [formGroupName]="i">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Cobro {{ i + 1 }}</mat-label>
                <input matInput formControlName="label" [placeholder]="'Cobro ' + (i + 1)" />
              </mat-form-field>
              <mat-form-field
                appearance="outline"
                subscriptSizing="dynamic"
                floatLabel="always"
                class="closing-field--money"
              >
                <mat-label>Monto</mat-label>
                <span matTextPrefix class="closing-field__prefix">$</span>
                <input matInput type="number" inputmode="decimal" formControlName="amount" />
              </mat-form-field>
              @if (otherCobros().length > 1 && i < otherCobros().length - 1) {
                <button
                  mat-icon-button
                  type="button"
                  class="closing-form__row-remove"
                  aria-label="Quitar cobro"
                  (click)="remove.emit(i)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              }
            </div>
          }
        </div>
        <div class="closing-form__fields closing-form__fields--single closing-form__fields--totals">
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            floatLabel="always"
            class="closing-field--money"
          >
            <mat-label>Total cobros</mat-label>
            <span matTextPrefix class="closing-field__prefix">$</span>
            <input matInput [value]="cobrosTotal()" readonly />
          </mat-form-field>
        </div>
      </div>
    </div>
    @if (sourceAmounts().length) {
      <div class="closing-form__block">
        <div class="closing-form__block-head">
          <div class="closing-form__block-title">
            <h3>Cuentas aparte</h3>
            <span class="closing-form__meta">
              Fuentes del local · no entran al declarado salvo que esté marcado
            </span>
          </div>
        </div>
        <div class="closing-form__block-body">
          <div class="closing-form__fields" formArrayName="sourceAmounts">
            @for (row of sourceAmounts().controls; track row; let i = $index) {
              <div [formGroupName]="i">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>{{ rowName(i) }}</mat-label>
                  <input
                    matInput
                    type="number"
                    inputmode="decimal"
                    formControlName="amount"
                  />
                  <mat-hint>{{ rowHint(i) }}</mat-hint>
                </mat-form-field>
              </div>
            }
          </div>
        </div>
      </div>
    }
    <app-closing-form-step-nav />
  `,
  styleUrl: './closing-form-caja-otros-step.scss',
})
export class ClosingFormCajaOtrosStepComponent {
  readonly sourceAmounts = input.required<FormArray>();
  readonly otherCobros = input.required<FormArray>();
  readonly cobrosHint = input('');
  readonly cobrosTotal = input('');

  readonly remove = output<number>();

  rowName(index: number): string {
    const row = this.sourceAmounts().at(index);
    return String(row?.get('name')?.value ?? '').trim() || 'Fuente';
  }

  rowHint(index: number): string {
    const row = this.sourceAmounts().at(index);
    if (row?.get('includeInDeclared')?.value) return 'Suma al total declarado';
    const kind = String(row?.get('kind')?.value ?? '');
    if (kind === 'OWN_ACCOUNT') return 'Va a la cuenta del local hoy';
    if (kind === 'SETTLE_CASH') return 'Rinde después en efectivo';
    if (kind === 'SETTLE_ACCOUNT') return 'Se deposita después en una cuenta';
    return 'Queda a cuenta aparte';
  }
}
