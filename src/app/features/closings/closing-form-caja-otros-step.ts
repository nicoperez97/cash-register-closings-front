import { Component } from '@angular/core';
import { ControlContainer, FormGroupDirective, ReactiveFormsModule } from '@angular/forms';
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
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Transferencia</mat-label>
            <input matInput type="number" inputmode="decimal" formControlName="transferAmount" />
          </mat-form-field>
        </div>
      </div>
    </div>
    <app-closing-form-step-nav />
  `,
  styleUrl: './closing-form-caja-otros-step.scss',
})
export class ClosingFormCajaOtrosStepComponent {}
