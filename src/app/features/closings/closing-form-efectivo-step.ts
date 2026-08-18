import { Component, input, output } from '@angular/core';
import { ControlContainer, FormGroupDirective, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ClosingFormStepNavComponent } from './closing-form-step-nav';
import { WithdrawAccountOption } from './withdraw-account-options';

@Component({
  selector: 'app-closing-form-efectivo-step',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    ClosingFormStepNavComponent,
  ],
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
  template: `
    <div class="closing-form__block">
      <div class="closing-form__block-head">
        <div class="closing-form__block-title">
          <h3>Efectivo</h3>
          <span class="closing-form__meta">Contá billetes, dejá cambio y quién se lo lleva</span>
        </div>
        <button mat-stroked-button type="button" class="closing-form__add-btn" (click)="countBills.emit()">
          <mat-icon>payments</mat-icon>
          Contar
        </button>
      </div>
      <div class="closing-form__block-body">
        <div class="closing-form__fields closing-form__fields--cash">
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            floatLabel="always"
            class="closing-field--money"
          >
            <mat-label>Efectivo</mat-label>
            <span matTextPrefix class="closing-field__prefix">$</span>
            <input matInput type="number" inputmode="decimal" formControlName="cashAmount" />
          </mat-form-field>
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            floatLabel="always"
            class="closing-field--money"
          >
            <mat-label>Se deja en caja</mat-label>
            <span matTextPrefix class="closing-field__prefix">$</span>
            <input matInput type="number" inputmode="decimal" formControlName="cashLeftInRegister" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Quién se lo lleva</mat-label>
            <mat-select
              formControlName="cashWithdrawnToAccountId"
              (selectionChange)="withdrawnAccountChange.emit($event.value)"
            >
              <mat-option value="">— Sin asignar —</mat-option>
              @for (acc of withdrawAccounts(); track acc.id) {
                <mat-option [value]="acc.id">{{ acc.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @if (pendingHint()) {
            <p class="closing-form__account-hint closing-form__span-all closing-form__pending-hint">
              {{ pendingHint() }}
            </p>
          }
        </div>
      </div>
    </div>
    <app-closing-form-step-nav />
  `,
  styleUrl: './closing-form-efectivo-step.scss',
})
export class ClosingFormEfectivoStepComponent {
  readonly withdrawAccounts = input<WithdrawAccountOption[]>([]);
  readonly pendingHint = input('');

  readonly countBills = output<void>();
  readonly withdrawnAccountChange = output<string>();
}
