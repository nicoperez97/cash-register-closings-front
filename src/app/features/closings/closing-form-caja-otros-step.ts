import { Component, input } from '@angular/core';
import {
  ControlContainer,
  FormArray,
  FormGroupDirective,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ClosingFormStepNavComponent } from './closing-form-step-nav';

@Component({
  selector: 'app-closing-form-caja-otros-step',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, ClosingFormStepNavComponent],
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
          <h3>Otros cobros</h3>
          <span class="closing-form__meta">Delivery y transferencias</span>
        </div>
      </div>
      <div class="closing-form__block-body">
        <div class="closing-form__fields">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>PedidosYa / delivery</mat-label>
            <input matInput type="number" inputmode="decimal" formControlName="deliveryAppsAmount" />
            <mat-hint>Suma al total declarado</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Transferencia</mat-label>
            <input matInput type="number" inputmode="decimal" formControlName="transferAmount" />
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
