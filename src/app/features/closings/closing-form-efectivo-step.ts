import { Component, computed, inject, input, output, signal } from '@angular/core';
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
import { MatSelectModule } from '@angular/material/select';
import { ClosingFormStepNavComponent } from './closing-form-step-nav';
import { WithdrawAccountOption } from './withdraw-account-options';
import {
  SelectSearchComponent,
  filterBySelectQuery,
  onSelectSearchOpened,
} from '../../shared/components/select-search';
import { MoneyInputDirective } from '../../shared/directives/money-input';
import { formatMoney } from '../../shared/utils/money';

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
    <div class="closing-form__pane">
      <div class="closing-form__block-head">
        <div class="closing-form__block-title">
          <h3>Efectivo</h3>
          <span class="closing-form__meta">Contá sin mirar el POS. La diferencia se ve en Caja.</span>
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
            <mat-hint>
              @if (changeContributionsTotal() > 0) {
                Base sin aportes. Total con cambio: {{ money(effectiveOpening()) }}
              } @else {
                Lo dejado / cambio del local
              }
            </mat-hint>
          </mat-form-field>
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            floatLabel="always"
            class="closing-field--money"
          >
            <mat-label>Efectivo a retirar</mat-label>
            <span matTextPrefix class="closing-field__prefix">$</span>
            <input
              matInput
              type="text"
              inputmode="decimal"
              appMoney
              formControlName="cashWithdrawn"
              readonly
            />
            <mat-hint>Se calcula solo: arranca igual al total; si dejás plata, se descuenta</mat-hint>
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
            <mat-hint>Se propone como apertura del próximo turno</mat-hint>
          </mat-form-field>
          <p class="closing-form__account-hint closing-form__span-all">
            Al cargar el total, a retirar queda igual al total (no se edita). Si dejás plata en caja,
            se descuenta solo.
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

        <div class="closing-form__change-block">
          <div class="closing-form__block-head closing-form__change-head">
            <div class="closing-form__block-title">
              <h4>Cambio aportado a la caja</h4>
              <span class="closing-form__meta">
                Se suma a la apertura. Al guardar: cuenta → Efectivo Caja (concepto de quién se lo lleva).
              </span>
            </div>
            <button mat-stroked-button type="button" class="closing-form__add-btn" (click)="addChange.emit()">
              <mat-icon>add</mat-icon>
              Agregar
            </button>
          </div>
          <div class="closing-form__change-list" formArrayName="cashChangeContributions">
            @for (row of cashChangeContributions().controls; track row; let i = $index) {
              <div class="change-row" [formGroupName]="i">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Quién lo dejó</mat-label>
                  <mat-select
                    formControlName="accountId"
                    panelClass="guy-select-search-panel"
                    (openedChange)="onSelectSearchOpened($event, changeAccountQuery)"
                    (selectionChange)="changeAccountChange.emit({ index: i, accountId: $event.value })"
                  >
                    <mat-option disabled class="select-search-opt">
                      <app-select-search [(query)]="changeAccountQuery" placeholder="Buscar cuenta…" />
                    </mat-option>
                    <mat-option value="">— Elegí cuenta —</mat-option>
                    @for (acc of filteredChangeAccounts(i); track acc.id) {
                      <mat-option [value]="acc.id">{{ acc.label }}</mat-option>
                    }
                    @if (changeAccountQuery() && !filteredChangeAccounts(i).length) {
                      <mat-option disabled>Sin resultados</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field
                  appearance="outline"
                  subscriptSizing="dynamic"
                  floatLabel="always"
                  class="closing-field--money"
                >
                  <mat-label>Monto</mat-label>
                  <span matTextPrefix class="closing-field__prefix">$</span>
                  <input matInput type="text" inputmode="decimal" appMoney formControlName="amount" />
                </mat-form-field>
                <button
                  mat-icon-button
                  type="button"
                  class="change-row__remove"
                  aria-label="Quitar aporte"
                  (click)="removeChange.emit(i)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            } @empty {
              <p class="closing-form__hint">Si alguien puso cambio en caja, agregalo acá.</p>
            }
          </div>
          @if (changeContributionsTotal() > 0) {
            <p class="closing-form__account-hint">
              Aportes: {{ money(changeContributionsTotal()) }} · Apertura total:
              {{ money(effectiveOpening()) }}
            </p>
          }
        </div>
      </div>
    </div>
    @if (showNav()) {
      <app-closing-form-step-nav />
    }
  `,
  styleUrl: './closing-form-efectivo-step.scss',
})
export class ClosingFormEfectivoStepComponent {
  private readonly parent = inject(FormGroupDirective);

  readonly withdrawAccounts = input<WithdrawAccountOption[]>([]);
  readonly pendingHint = input('');
  readonly showNav = input(true);
  readonly cashChangeContributions = input.required<FormArray>();
  readonly changeContributionsTotal = input(0);
  readonly effectiveOpening = input(0);

  readonly countBills = output<void>();
  readonly withdrawnAccountChange = output<string>();
  readonly addChange = output<void>();
  readonly removeChange = output<number>();
  readonly changeAccountChange = output<{ index: number; accountId: string }>();

  readonly accountQuery = signal('');
  readonly changeAccountQuery = signal('');
  readonly onSelectSearchOpened = onSelectSearchOpened;
  readonly money = (v: number) => formatMoney(v);

  readonly filteredWithdrawAccounts = computed(() =>
    filterBySelectQuery(
      this.withdrawAccounts(),
      this.accountQuery(),
      (a) => a.label,
      this.parent.form.get('cashWithdrawnToAccountId')?.value,
    ),
  );

  filteredChangeAccounts(index: number): WithdrawAccountOption[] {
    const selected = String(
      this.cashChangeContributions().at(index)?.get('accountId')?.value ?? '',
    );
    return filterBySelectQuery(
      this.withdrawAccounts(),
      this.changeAccountQuery(),
      (a) => a.label,
      selected || null,
    );
  }
}
