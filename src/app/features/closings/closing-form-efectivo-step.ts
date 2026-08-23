import { Component, computed, inject, input, output, signal } from '@angular/core';
import { ControlContainer, FormGroupDirective, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ClosingFormStepNavComponent } from './closing-form-step-nav';
import { WithdrawAccountOption } from './withdraw-account-options';
import {
  SelectSearchComponent,
  filterBySelectQuery,
  onSelectSearchOpened,
} from '../../shared/components/select-search';
import { MoneyInputDirective } from '../../shared/directives/money-input';

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
    SelectSearchComponent,
    MoneyInputDirective,
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
        <div class="closing-form__fields closing-form__fields--single">
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            floatLabel="always"
            class="closing-field--money"
          >
            <mat-label>Efectivo total</mat-label>
            <span matTextPrefix class="closing-field__prefix">$</span>
            <input matInput type="text" inputmode="decimal" appMoney formControlName="cashAmount" />
          </mat-form-field>
        </div>
        <div class="closing-form__fields closing-form__fields--cash">
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            floatLabel="always"
            class="closing-field--money"
          >
            <mat-label>Efectivo de apertura</mat-label>
            <span matTextPrefix class="closing-field__prefix">$</span>
            <input matInput type="text" inputmode="decimal" appMoney formControlName="cashOpeningAmount" />
          </mat-form-field>
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            floatLabel="always"
            class="closing-field--money"
          >
            <mat-label>Efectivo a retirar</mat-label>
            <span matTextPrefix class="closing-field__prefix">$</span>
            <input matInput type="text" inputmode="decimal" appMoney formControlName="cashWithdrawn" />
          </mat-form-field>
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            floatLabel="always"
            class="closing-field--money"
          >
            <mat-label>Efectivo que se deja en caja</mat-label>
            <span matTextPrefix class="closing-field__prefix">$</span>
            <input matInput type="text" inputmode="decimal" appMoney formControlName="cashLeftInRegister" />
          </mat-form-field>
          <p class="closing-form__account-hint closing-form__span-all">
            El efectivo total tiene que ser igual a efectivo a retirar más efectivo que se deja en caja.
          </p>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="closing-form__span-all">
            <mat-label>Quién se lo lleva</mat-label>
            <mat-select
              formControlName="cashWithdrawnToAccountId"
              panelClass="guy-select-search-panel"
              (openedChange)="onSelectSearchOpened($event, accountQuery)"
              (selectionChange)="withdrawnAccountChange.emit($event.value)"
            >
              <mat-option disabled class="select-search-opt">
                <app-select-search [(query)]="accountQuery" placeholder="Buscar cuenta…" />
              </mat-option>
              <mat-option value="">— Sin asignar —</mat-option>
              @for (acc of filteredWithdrawAccounts(); track acc.id) {
                <mat-option [value]="acc.id">{{ acc.label }}</mat-option>
              }
              @if (accountQuery() && !filteredWithdrawAccounts().length) {
                <mat-option disabled>Sin resultados</mat-option>
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
  private readonly parent = inject(FormGroupDirective);

  readonly withdrawAccounts = input<WithdrawAccountOption[]>([]);
  readonly pendingHint = input('');

  readonly countBills = output<void>();
  readonly withdrawnAccountChange = output<string>();

  readonly accountQuery = signal('');
  readonly onSelectSearchOpened = onSelectSearchOpened;
  readonly filteredWithdrawAccounts = computed(() =>
    filterBySelectQuery(
      this.withdrawAccounts(),
      this.accountQuery(),
      (a) => a.label,
      this.parent.form.get('cashWithdrawnToAccountId')?.value,
    ),
  );
}
