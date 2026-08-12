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
  selector: 'app-closing-form-dni-step',
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
          <h3>Cuenta DNI</h3>
          <span class="closing-form__meta">{{ panelHint() }}</span>
        </div>
        <button mat-stroked-button type="button" class="closing-form__add-btn" (click)="add.emit()">
          <mat-icon>add</mat-icon>
          Transferencia
        </button>
      </div>
      <div class="closing-form__block-body">
        <div class="closing-form__stack" formArrayName="dniTransfers">
          @for (row of dniTransfers().controls; track row; let i = $index) {
            <div class="closing-form__dni-row" [formGroupName]="i">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Detalle</mat-label>
                <input matInput formControlName="label" placeholder="ej. Transferencia cliente" />
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
              <button
                mat-icon-button
                type="button"
                class="closing-form__row-remove"
                aria-label="Quitar transferencia"
                (click)="remove.emit(i)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          }
        </div>
        <div class="closing-form__fields closing-form__fields--single">
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            floatLabel="always"
            class="closing-field--money"
          >
            <mat-label>Cuenta DNI{{ locksDni() ? ' (suma)' : '' }}</mat-label>
            <span matTextPrefix class="closing-field__prefix">$</span>
            <input
              matInput
              type="number"
              inputmode="decimal"
              formControlName="accountDniAmount"
              [readonly]="locksDni()"
            />
          </mat-form-field>
        </div>
      </div>
    </div>
    <app-closing-form-step-nav />
  `,
  styleUrl: './closing-form-dni-step.scss',
})
export class ClosingFormDniStepComponent {
  readonly dniTransfers = input.required<FormArray>();
  readonly panelHint = input('');
  readonly locksDni = input(false);

  readonly add = output<void>();
  readonly remove = output<number>();
}
