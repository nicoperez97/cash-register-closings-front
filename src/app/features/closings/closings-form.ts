import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom, map, merge, startWith } from 'rxjs';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatStepperModule } from '@angular/material/stepper';
import { BreakpointObserver } from '@angular/cdk/layout';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { defaultHomeRoute, isCashierOnly } from '../../core/auth/auth.models';
import { newId } from '../../core/utils/id';
import {
  formatBusinessDayHint,
  formatIsoDateDisplay,
  resolveShopBusinessDate,
} from '../../core/shop/business-date';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ClosingsApiService, CashClosing, ClosingPosnetAmount, ShopUserAccountOption, ShopUserOption } from './closings-api.service';
import { CashWithdrawalsInboxService } from '../cash-withdrawals/cash-withdrawals-inbox.service';
import { shareText } from '../../shared/utils/share-text';
import {
  closingSharePayload,
} from '../../shared/components/record-share-builders';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { ClosingSaveDialogComponent } from './closing-save-dialog';
import { CashBillCounterDialogComponent } from './cash-bill-counter-dialog';
import { isUserVisible } from '../../shared/user-visibility';
import { EmployeesApiService, Employee } from '../employees/employees-api.service';
import { TipsApiService } from '../tips/tips-api.service';
import {
  TipsEditorComponent,
  TipsEditorState,
  tipDayToEditorState,
} from '../tips/tips-editor';

function toDateInput(value?: string | null): Date {
  if (!value) return new Date();
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toDateString(value: Date | null | string | undefined): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const EXPENSE_CATEGORY_OPTIONS = [
  { value: 'VEGETABLES', label: 'Verdulería' },
  { value: 'CHEESE', label: 'Quesería' },
  { value: 'MEAT', label: 'Carnicería' },
  { value: 'FISH', label: 'Pescadería' },
  { value: 'BAKERY', label: 'Panadería' },
  { value: 'DELI', label: 'Fiambrería' },
  { value: 'GROCERY', label: 'Almacén / secos' },
  { value: 'DAIRY', label: 'Lácteos' },
  { value: 'BEVERAGES', label: 'Bebidas' },
  { value: 'BAR', label: 'Cerveza y bar' },
  { value: 'COFFEE', label: 'Café' },
  { value: 'RAW_MATERIALS', label: 'Materia prima' },
  { value: 'DRINKS', label: 'Bebidas (genérico)' },
  { value: 'DISPOSABLES', label: 'Descartables' },
  { value: 'CLEANING', label: 'Limpieza' },
  { value: 'SUPPLIES', label: 'Insumos cocina' },
  { value: 'SALARIES', label: 'Sueldos' },
  { value: 'COMMISSIONS', label: 'Comisiones' },
  { value: 'RENT', label: 'Alquiler' },
  { value: 'EQUIPMENT', label: 'Equipamiento' },
  { value: 'UTILITIES', label: 'Servicios (luz/gas)' },
  { value: 'SERVICES', label: 'Servicios' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'TRANSFER_SHOP', label: 'Transferencia locales' },
  { value: 'OTHER', label: 'Otros' },
];

const POSNET_TYPE_OPTIONS = [
  { value: 'PVS', label: 'PVS' },
  { value: 'MERCADO_PAGO', label: 'Mercado Pago' },
  { value: 'CUENTA_DNI', label: 'Cuenta DNI' },
];

const POSNET_TYPE_LABEL: Record<string, string> = {
  PVS: 'PVS',
  MERCADO_PAGO: 'Mercado Pago',
  CUENTA_DNI: 'Cuenta DNI',
};

type PosnetType = 'PVS' | 'MERCADO_PAGO' | 'CUENTA_DNI';

@Component({
  selector: 'app-closings-form',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatDialogModule,
    MatDatepickerModule,
    MatStepperModule,
    TipsEditorComponent,
  ],
  host: {
    class: 'closing-form-page',
    '[class.closing-form-page--cashier]': 'cashierOnly()',
  },
  template: `
    <div class="closing-form-shell panel-card">
      <header class="closing-form-head">
        <div>
          <h1>{{ isEdit() ? 'Editar cierre' : 'Nuevo cierre' }}</h1>
          <p>{{ shop()?.name ?? '' }}</p>
        </div>
        <div class="closing-form-actions closing-form-actions--top">
          @if (!cashierOnly()) {
            <button mat-stroked-button type="button" (click)="cancel()">Cancelar</button>
          }
          @if (isLocked() && auth.isAdmin()) {
            <button mat-stroked-button type="button" (click)="unlock()">
              <mat-icon>lock_open</mat-icon>
              Desbloquear
            </button>
          }
          <button
            mat-flat-button
            color="primary"
            type="submit"
            form="closing-form"
            [disabled]="saving() || (isLocked() && !auth.isAdmin())"
          >
            {{ saving() ? 'Guardando…' : 'Guardar cierre' }}
          </button>
        </div>
      </header>

      <form
        id="closing-form"
        class="closing-form"
        [formGroup]="form"
        (ngSubmit)="save()"
        [class.closing-form--locked]="isLocked() && !auth.isAdmin()"
      >
        <section class="closing-form__section closing-form__main">
          <h2>Cobros del día</h2>
          <div class="closing-form__fields closing-form__fields--date">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Fecha</mat-label>
              <input matInput [matDatepicker]="closingDatePicker" formControlName="businessDate" />
              <mat-datepicker-toggle matIconSuffix [for]="closingDatePicker" />
              <mat-datepicker #closingDatePicker touchUi />
              @if (businessDayHint()) {
                <mat-hint>{{ businessDayHint() }}</mat-hint>
              }
            </mat-form-field>
          </div>

          <mat-stepper
            class="closing-stepper"
            [orientation]="isMobile() ? 'vertical' : 'horizontal'"
            [linear]="false"
          >
            <mat-step label="Posnets">
              <div class="closing-form__block">
                <div class="closing-form__block-head">
                  <div class="closing-form__block-title">
                    <h3>Posnets</h3>
                    <span class="closing-form__meta">{{ posnetsPanelHint() }}</span>
                  </div>
                  <button mat-stroked-button type="button" class="closing-form__add-btn" (click)="addPosnet()">
                    <mat-icon>add</mat-icon>
                    Agregar
                  </button>
                </div>
                <div class="closing-form__block-body">
                  <div class="closing-form__stack" formArrayName="posnetAmounts">
                    @for (row of posnetAmounts.controls; track row; let i = $index) {
                      <div class="closing-form__posnet-card" [formGroupName]="i">
                        <div class="closing-form__posnet-card-head">
                          <div class="closing-form__posnet-card-title">
                            <span class="closing-form__posnet-index">{{ i + 1 }}</span>
                            <div>
                              <strong>{{ posnetRowTitle(i) }}</strong>
                              <span>{{ posnetRowTypeLabel(i) }}</span>
                            </div>
                          </div>
                          @if (!isConfiguredPosnet(i)) {
                            <button
                              mat-icon-button
                              type="button"
                              class="closing-form__row-remove"
                              aria-label="Quitar posnet"
                              (click)="removePosnet(i)"
                            >
                              <mat-icon>delete</mat-icon>
                            </button>
                          }
                        </div>
                        <div class="closing-form__posnet-row" [class.closing-form__posnet-row--amount-only]="isConfiguredPosnet(i)">
                          @if (!isConfiguredPosnet(i)) {
                            <mat-form-field appearance="outline" subscriptSizing="dynamic">
                              <mat-label>Nombre</mat-label>
                              <input matInput formControlName="name" placeholder="ej. Caja 1" />
                            </mat-form-field>
                            <mat-form-field appearance="outline" subscriptSizing="dynamic">
                              <mat-label>Tipo</mat-label>
                              <mat-select formControlName="type">
                                @for (opt of posnetTypes; track opt.value) {
                                  <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                                }
                              </mat-select>
                            </mat-form-field>
                          }
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
                        </div>
                      </div>
                    } @empty {
                      <p class="closing-form__hint">Sin terminales. Completá PVS y Mercado Pago abajo.</p>
                    }
                  </div>
                  <div class="closing-form__fields closing-form__fields--totals">
                    <mat-form-field
                      appearance="outline"
                      subscriptSizing="dynamic"
                      floatLabel="always"
                      class="closing-field--money"
                    >
                      <mat-label>PVS{{ locksCard() ? ' (suma)' : '' }}</mat-label>
                      <span matTextPrefix class="closing-field__prefix">$</span>
                      <input
                        matInput
                        type="number"
                        inputmode="decimal"
                        formControlName="cardAmount"
                        [readonly]="locksCard()"
                      />
                    </mat-form-field>
                    <mat-form-field
                      appearance="outline"
                      subscriptSizing="dynamic"
                      floatLabel="always"
                      class="closing-field--money"
                    >
                      <mat-label>Mercado Pago{{ locksMp() ? ' (suma)' : '' }}</mat-label>
                      <span matTextPrefix class="closing-field__prefix">$</span>
                      <input
                        matInput
                        type="number"
                        inputmode="decimal"
                        formControlName="mercadoPagoAmount"
                        [readonly]="locksMp()"
                      />
                    </mat-form-field>
                  </div>
                </div>
              </div>
              <div class="closing-stepper__nav">
                <span></span>
                <button mat-flat-button color="primary" type="button" matStepperNext>Siguiente</button>
              </div>
            </mat-step>

            <mat-step label="Efectivo">
              <div class="closing-form__block">
                <div class="closing-form__block-head">
                  <div class="closing-form__block-title">
                    <h3>Efectivo</h3>
                    <span class="closing-form__meta">Contá billetes, dejá cambio y quién se lo lleva</span>
                  </div>
                  <button
                    mat-stroked-button
                    type="button"
                    class="closing-form__add-btn"
                    (click)="openBillCounter()"
                  >
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
                      <input
                        matInput
                        type="number"
                        inputmode="decimal"
                        formControlName="cashLeftInRegister"
                      />
                    </mat-form-field>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Quién se lo lleva</mat-label>
                      <mat-select
                        formControlName="cashWithdrawnByUserId"
                        (selectionChange)="onWithdrawnUserChange($event.value)"
                      >
                        <mat-option value="">— Sin asignar —</mat-option>
                        @for (u of withdrawUsers(); track u.id) {
                          <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                    @if (needsWithdrawnAccountPick()) {
                      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="closing-form__span-all">
                        <mat-label>Cuenta destino del efectivo</mat-label>
                        <mat-select formControlName="cashWithdrawnToAccountId">
                          @for (acc of withdrawnAccountOptions(); track acc.id) {
                            <mat-option [value]="acc.id">{{ acc.name }}</mat-option>
                          }
                        </mat-select>
                      </mat-form-field>
                    } @else if (withdrawnAccountHint()) {
                      <p class="closing-form__account-hint closing-form__span-all">{{ withdrawnAccountHint() }}</p>
                    }
                    @if (pendingWithdrawHint()) {
                      <p class="closing-form__account-hint closing-form__span-all closing-form__pending-hint">
                        {{ pendingWithdrawHint() }}
                      </p>
                    }
                  </div>
                </div>
              </div>
              <div class="closing-stepper__nav">
                <button mat-stroked-button type="button" matStepperPrevious>Atrás</button>
                <button mat-flat-button color="primary" type="button" matStepperNext>Siguiente</button>
              </div>
            </mat-step>

            <mat-step label="Cuenta DNI">
              <div class="closing-form__block">
                <div class="closing-form__block-head">
                  <div class="closing-form__block-title">
                    <h3>Cuenta DNI</h3>
                    <span class="closing-form__meta">{{ dniPanelHint() }}</span>
                  </div>
                  <button
                    mat-stroked-button
                    type="button"
                    class="closing-form__add-btn"
                    (click)="addDniTransfer()"
                  >
                    <mat-icon>add</mat-icon>
                    Transferencia
                  </button>
                </div>
                <div class="closing-form__block-body">
                  <div class="closing-form__stack" formArrayName="dniTransfers">
                    @for (row of dniTransfers.controls; track row; let i = $index) {
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
                          (click)="removeDniTransfer(i)"
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
              <div class="closing-stepper__nav">
                <button mat-stroked-button type="button" matStepperPrevious>Atrás</button>
                <button mat-flat-button color="primary" type="button" matStepperNext>Siguiente</button>
              </div>
            </mat-step>

            <mat-step label="Caja y otros">
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
              <div class="closing-stepper__nav">
                <button mat-stroked-button type="button" matStepperPrevious>Atrás</button>
                <button mat-flat-button color="primary" type="button" matStepperNext>Siguiente</button>
              </div>
            </mat-step>

            <mat-step label="Retiro y egresos">
              <div class="closing-form__block">
                <div class="closing-form__block-head">
                  <div class="closing-form__block-title">
                    <h3>Retiro y extras</h3>
                    <span class="closing-form__meta">{{ withdrawPanelHint() }}</span>
                  </div>
                </div>
                <div class="closing-form__block-body">
                  <div class="closing-form__fields">
                    @if (shop()?.unitsLabel) {
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>{{ shop()?.unitsLabel }}</mat-label>
                        <input matInput type="number" inputmode="numeric" pattern="[0-9]*" formControlName="unitsSold" />
                      </mat-form-field>
                    }
                    @if (shop()?.coversEnabled) {
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>Comensales</mat-label>
                        <input matInput type="number" inputmode="numeric" pattern="[0-9]*" formControlName="coversCount" />
                      </mat-form-field>
                    }
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Efectivo retirado</mat-label>
                      <input matInput type="number" inputmode="decimal" formControlName="cashWithdrawn" />
                    </mat-form-field>
                    @if (!tipsEnabled()) {
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>Propinas</mat-label>
                        <input matInput type="number" inputmode="decimal" formControlName="tipsAmount" />
                      </mat-form-field>
                    }
                    <mat-form-field appearance="outline" class="closing-notes" subscriptSizing="dynamic">
                      <mat-label>Notas</mat-label>
                      <textarea matInput rows="2" formControlName="notes"></textarea>
                    </mat-form-field>
                  </div>
                  @if (tipsEnabled()) {
                    <div class="closing-form__tips">
                      <h4 class="closing-form__tips-title">Propinas del día</h4>
                      <app-tips-editor
                        [employees]="tipEmployees()"
                        [value]="tipEditorValue()"
                        [readonly]="isLocked() && !auth.isAdmin()"
                        [showDelivery]="false"
                        (valueChange)="onTipEditorChange($event)"
                      />
                    </div>
                  }
                </div>
              </div>
              <div class="closing-form__block">
                <div class="closing-form__block-head">
                  <div class="closing-form__block-title">
                    <h3>Egresos del día</h3>
                    <span class="closing-form__meta">{{ expensesPanelHint() }}</span>
                  </div>
                  <button mat-stroked-button type="button" class="closing-form__add-btn" (click)="addExpense()">
                    <mat-icon>add</mat-icon>
                    Agregar
                  </button>
                </div>
                <div class="closing-form__block-body">
                  <div class="closing-form__expenses-list" formArrayName="expenses">
                    @for (row of expenses.controls; track row; let i = $index) {
                      <div class="expense-row" [formGroupName]="i">
                        <mat-form-field appearance="outline" subscriptSizing="dynamic">
                          <mat-label>Concepto</mat-label>
                          <input matInput formControlName="label" />
                        </mat-form-field>
                        <mat-form-field appearance="outline" subscriptSizing="dynamic">
                          <mat-label>Monto</mat-label>
                          <input matInput type="number" inputmode="decimal" formControlName="amount" />
                        </mat-form-field>
                        <mat-form-field appearance="outline" subscriptSizing="dynamic">
                          <mat-label>Categoría</mat-label>
                          <mat-select formControlName="category">
                            @for (opt of expenseCategories; track opt.value) {
                              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                            }
                          </mat-select>
                        </mat-form-field>
                        <button
                          mat-icon-button
                          type="button"
                          class="expense-row__remove"
                          aria-label="Quitar egreso"
                          (click)="removeExpense(i)"
                        >
                          <mat-icon>delete</mat-icon>
                        </button>
                      </div>
                    } @empty {
                      <p class="closing-form__hint">No hay egresos cargados.</p>
                    }
                  </div>
                </div>
              </div>
              <div class="closing-stepper__nav">
                <button mat-stroked-button type="button" matStepperPrevious>Atrás</button>
                <button mat-flat-button color="primary" type="button" matStepperNext>Siguiente</button>
              </div>
            </mat-step>

            <mat-step label="Resumen">
              <div class="closing-totals closing-totals--hero">
                <div class="closing-totals__head">
                  <div>
                    <h2>Resumen</h2>
                    <p class="closing-totals__sub">Lo que importa del día</p>
                  </div>
                  <button mat-stroked-button type="button" (click)="shareSummary()">
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
                    <strong>{{ money(cardAmount()) }}</strong>
                  </div>
                  <div class="closing-totals__item">
                    <span>Efectivo</span>
                    <strong>{{ money(cashAmount()) }}</strong>
                  </div>
                  <div class="closing-totals__item">
                    <span>Cuenta DNI</span>
                    <strong>{{ money(accountDniAmount()) }}</strong>
                  </div>
                  <div class="closing-totals__item">
                    <span>Caja sistema</span>
                    <strong>{{ money(posAmount()) }}</strong>
                  </div>
                  <div class="closing-totals__item closing-totals__item--total">
                    <span>Total</span>
                    <strong>{{ money(declaredTotal()) }}</strong>
                  </div>
                </div>
              </div>
              <div class="closing-form__total-bar" aria-live="polite">
                <span>Total declarado</span>
                <strong>{{ money(declaredTotal()) }}</strong>
              </div>
              <div class="closing-stepper__nav closing-stepper__nav--final">
                <button mat-stroked-button type="button" matStepperPrevious>Atrás</button>
                <button
                  mat-flat-button
                  color="primary"
                  type="submit"
                  [disabled]="saving() || (isLocked() && !auth.isAdmin())"
                >
                  {{ saving() ? 'Guardando…' : 'Guardar cierre' }}
                </button>
              </div>
            </mat-step>
          </mat-stepper>
        </section>
      </form>

      <div class="closing-form-actions closing-form-actions--sticky" aria-label="Acciones del cierre">
        @if (!cashierOnly()) {
          <button mat-stroked-button type="button" (click)="cancel()">Cancelar</button>
        }
        @if (isLocked() && auth.isAdmin()) {
          <button mat-stroked-button type="button" (click)="unlock()">
            <mat-icon>lock_open</mat-icon>
            Desbloquear
          </button>
        }
        <button
          mat-flat-button
          color="primary"
          type="submit"
          form="closing-form"
          [disabled]="saving() || (isLocked() && !auth.isAdmin())"
        >
          {{ saving() ? 'Guardando…' : 'Guardar cierre' }}
        </button>
      </div>
    </div>
  `,
  styleUrl: './closings-form.scss',
})
export class ClosingsFormPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ClosingsApiService);
  private readonly cashWithdrawalsInbox = inject(CashWithdrawalsInboxService);
  private readonly tipsApi = inject(TipsApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  private readonly shops = inject(ShopContextService);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpointObserver = inject(BreakpointObserver);

  readonly shop = this.shops.selectedShop;
  readonly tipsEnabled = computed(() => !!this.shop()?.tipsEnabled);
  readonly tipEmployees = signal<Employee[]>([]);
  readonly tipEditorValue = signal<TipsEditorState | null>(null);
  private tipDraft: TipsEditorState | null = null;
  readonly isEdit = signal(false);
  readonly saving = signal(false);
  readonly status = signal<string | null>(null);
  readonly users = signal<ShopUserOption[]>([]);
  readonly expenseCategories = EXPENSE_CATEGORY_OPTIONS;
  readonly posnetTypes = POSNET_TYPE_OPTIONS;
  readonly cashierOnly = () => isCashierOnly(this.auth.currentUser(), this.shops.selectedShopId());
  readonly isLocked = () => this.status() === 'LOCKED';
  readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 720px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  private closingId: string | null = null;

  readonly panelOther = signal(false);
  readonly panelWithdraw = signal(false);
  readonly panelExpenses = signal(false);

  /** IDs de posnets del local (para distinguir transferencias DNI ad-hoc al editar). */
  private configuredPosnetIds = new Set<string>();

  private currentBusinessDate(): string {
    const shop = this.shop();
    return resolveShopBusinessDate(new Date(), {
      timezone: shop?.timezone,
      openingTime: shop?.openingTime,
    });
  }

  readonly form = this.fb.group({
    businessDate: [null as Date | null, Validators.required],
    posSystemAmount: [null as number | null],
    cardAmount: [null as number | null],
    cashAmount: [null as number | null],
    mercadoPagoAmount: [null as number | null],
    deliveryAppsAmount: [null as number | null],
    transferAmount: [null as number | null],
    accountDniAmount: [null as number | null],
    unitsSold: [null as number | null],
    coversCount: [null as number | null],
    cashLeftInRegister: [null as number | null],
    cashWithdrawn: [null as number | null],
    cashWithdrawnByUserId: [''],
    cashWithdrawnToAccountId: [''],
    tipsAmount: [null as number | null],
    notes: [''],
    expenses: this.fb.array([]),
    posnetAmounts: this.fb.array([]),
    dniTransfers: this.fb.array([]),
  });

  get expenses(): FormArray {
    return this.form.get('expenses') as FormArray;
  }

  get posnetAmounts(): FormArray {
    return this.form.get('posnetAmounts') as FormArray;
  }

  get dniTransfers(): FormArray {
    return this.form.get('dniTransfers') as FormArray;
  }

  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      // valueChanges omite controles disabled; usamos raw para posnets bloqueados.
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  readonly businessDayHint = computed(() => {
    const date = toDateString(this.formValue()?.businessDate as Date | string | null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    return formatBusinessDayHint(date, this.shop()?.openingTime);
  });

  readonly locksCard = computed(() => this.hasPosnetType('PVS'));
  readonly locksMp = computed(() => this.hasPosnetType('MERCADO_PAGO'));
  readonly locksDni = computed(
    () => this.hasPosnetType('CUENTA_DNI') || (this.formValue().dniTransfers?.length ?? 0) > 0,
  );

  readonly cardAmount = computed(() => this.n(this.formValue().cardAmount));
  readonly cashAmount = computed(() => this.n(this.formValue().cashAmount));
  readonly accountDniAmount = computed(() => this.n(this.formValue().accountDniAmount));
  readonly posAmount = computed(() => this.n(this.formValue().posSystemAmount));

  readonly declaredTotal = computed(() => {
    const v = this.formValue();
    return (
      this.n(v.cardAmount) +
      this.n(v.cashAmount) +
      this.n(v.mercadoPagoAmount) +
      this.n(v.deliveryAppsAmount) +
      this.n(v.transferAmount) +
      this.n(v.accountDniAmount)
    );
  });

  readonly summaryDate = computed(() => {
    const date = toDateString(this.formValue().businessDate as Date | string | null);
    return date ? formatIsoDateDisplay(date) : '—';
  });

  readonly withdrawnAccountOptions = computed((): ShopUserAccountOption[] => {
    const userId = String(this.formValue().cashWithdrawnByUserId ?? '');
    if (!userId) return [];
    const user = this.users().find((u) => u.id === userId);
    return user?.ledgerAccounts ?? [];
  });

  /** Usuarios visibles en “Quién se lo lleva”; mantiene el seleccionado si está oculto (edición). */
  readonly withdrawUsers = computed(() => {
    const selected = String(this.formValue().cashWithdrawnByUserId ?? '');
    return this.users().filter(
      (u) => isUserVisible(u, 'cashWithdraw') || u.id === selected,
    );
  });

  readonly needsWithdrawnAccountPick = computed(() => this.withdrawnAccountOptions().length > 1);

  readonly withdrawnAccountHint = computed(() => {
    const userId = String(this.formValue().cashWithdrawnByUserId ?? '');
    if (!userId) return '';
    const accounts = this.withdrawnAccountOptions();
    if (accounts.length === 0) {
      return 'Sin cuenta asociada: al guardar se crea una a su nombre.';
    }
    if (accounts.length === 1) {
      return `El efectivo va a la cuenta «${accounts[0].name}».`;
    }
    return '';
  });

  /** Monto a retirar si no hay destinatario (queda en A Retirar). */
  readonly pendingWithdrawAmount = computed(() => {
    const v = this.formValue();
    const userId = String(v.cashWithdrawnByUserId ?? '');
    if (userId) return 0;
    const explicit = this.n(v.cashWithdrawn);
    if (explicit > 0) return explicit;
    const expenses = (v.expenses ?? []) as Array<{ amount?: number | null }>;
    const expensesTotal = expenses.reduce((s, e) => s + this.n(e?.amount), 0);
    return Math.max(0, this.n(v.cashAmount) - this.n(v.cashLeftInRegister) - expensesTotal);
  });

  readonly pendingWithdrawHint = computed(() => {
    const v = this.formValue();
    const userId = String(v.cashWithdrawnByUserId ?? '');
    if (userId) return '';
    const amount = this.pendingWithdrawAmount();
    if (amount > 0) {
      return `Quedará en A Retirar (${this.money(amount)}).`;
    }
    const cash = this.n(v.cashAmount);
    if (cash <= 0) return '';
    // Sin asignar pero no hay monto a retirar (todo queda en caja / egresos).
    return 'Sin asignar: para que vaya a A Retirar, «Se deja en caja» tiene que ser menor que el efectivo (menos egresos).';
  });

  posnetsPanelHint(): string {
    const n = this.posnetAmounts.length;
    if (!n) return 'Sin terminales · PVS y MP a mano';
    return n === 1 ? '1 terminal' : `${n} terminales`;
  }

  dniPanelHint(): string {
    const n = this.dniTransfers.length;
    if (!n) return 'Transferencias opcionales';
    return n === 1 ? '1 transferencia' : `${n} transferencias`;
  }

  withdrawPanelHint(): string {
    const amount = this.n(this.formValue().cashWithdrawn);
    if (amount > 0) return this.money(amount);
    return 'Retiro, propinas y notas';
  }

  expensesPanelHint(): string {
    const n = this.expenses.length;
    if (!n) return 'Opcional';
    return n === 1 ? '1 egreso' : `${n} egresos`;
  }

  togglePanel(panel: 'other' | 'withdraw' | 'expenses'): void {
    const map = {
      other: this.panelOther,
      withdraw: this.panelWithdraw,
      expenses: this.panelExpenses,
    } as const;
    map[panel].update((v) => !v);
  }

  private syncPanelDefaults(): void {
    const v = this.form.getRawValue();
    if (
      this.n(v.deliveryAppsAmount) > 0 ||
      this.n(v.transferAmount) > 0
    ) {
      this.panelOther.set(true);
    }
    if (
      this.n(v.cashWithdrawn) > 0 ||
      this.n(v.tipsAmount) > 0 ||
      !!String(v.notes ?? '').trim()
    ) {
      this.panelWithdraw.set(true);
    }
    if (this.expenses.length > 0) this.panelExpenses.set(true);
  }

  ngOnInit(): void {
    const shopId = this.shops.selectedShopId();
    if (shopId) {
      this.api.shopUsers(shopId).subscribe({
        next: (rows) => {
          this.users.set(rows);
          const uid = String(this.form.getRawValue().cashWithdrawnByUserId ?? '');
          if (uid) this.onWithdrawnUserChange(uid);
        },
        error: () =>
          this.snack.open('No se pudieron cargar los usuarios del local', 'OK', {
            duration: 3000,
          }),
      });
      if (this.tipsEnabled()) {
        this.employeesApi.list(shopId).subscribe({
          next: (rows) => this.tipEmployees.set(rows.filter((e) => e.active)),
          error: () => this.tipEmployees.set([]),
        });
      }
    }

    merge(this.posnetAmounts.valueChanges, this.dniTransfers.valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncDerivedTotals());

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new' && shopId) {
      this.isEdit.set(true);
      this.closingId = id;
      this.api.get(shopId, id).subscribe((c) => {
        this.status.set(c.status);
        if (c.status === 'LOCKED' && !this.auth.isAdmin()) {
          this.form.disable({ emitEvent: false });
        }
        this.form.patchValue({
          businessDate: toDateInput(c.businessDate),
          posSystemAmount: this.emptyNum(c.posSystemAmount),
          cardAmount: this.emptyNum(c.cardAmount),
          cashAmount: this.emptyNum(c.cashAmount),
          mercadoPagoAmount: this.emptyNum(c.mercadoPagoAmount),
          deliveryAppsAmount: this.emptyNum(c.deliveryAppsAmount),
          transferAmount: this.emptyNum(c.transferAmount),
          accountDniAmount: this.emptyNum(c.accountDniAmount),
          unitsSold: this.emptyNum(c.unitsSold),
          coversCount: this.emptyNum(c.coversCount),
          cashLeftInRegister: this.emptyNum(c.cashLeftInRegister),
          cashWithdrawn: this.emptyNum(c.cashWithdrawn),
          cashWithdrawnByUserId: c.cashWithdrawnByUserId ?? '',
          cashWithdrawnToAccountId: c.cashWithdrawnToAccountId ?? '',
          tipsAmount: this.emptyNum(c.tipsAmount),
          notes: c.notes ?? '',
        });
        this.initPaymentLines(c.posnetAmounts);
        this.expenses.clear();
        for (const expense of c.expenses ?? []) {
          this.expenses.push(
            this.buildExpenseGroup({
              label: expense.label ?? '',
              amount: expense.amount ?? 0,
              category: expense.category ?? 'OTHER',
            }),
          );
        }
        this.syncPanelDefaults();
        this.loadTipDay(c.businessDate);
      });
    } else {
      const today = this.currentBusinessDate();
      this.form.patchValue({
        businessDate: toDateInput(today),
        cashLeftInRegister: this.emptyNum(this.shop()?.defaultChangeAmount),
      });
      this.initPaymentLines();
      this.syncPanelDefaults();
      this.loadTipDay(today);
    }

    this.form
      .get('businessDate')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => {
        const date = toDateString(v as Date | string | null);
        if (date) this.loadTipDay(date);
      });
  }

  onTipEditorChange(state: TipsEditorState) {
    this.tipDraft = state;
    const total =
      Math.round(
        (Number(state.cashAmount || 0) +
          Number(state.transferAmount || 0) +
          Number(state.ticketsAmount || 0)) *
          100,
      ) / 100;
    this.form.patchValue({ tipsAmount: total || null }, { emitEvent: false });
  }

  private loadTipDay(businessDate: string) {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.tipsEnabled() || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      return;
    }
    this.tipsApi.getByDate(shopId, businessDate).subscribe({
      next: (day) => {
        const state = tipDayToEditorState(day);
        if (!day.id && this.n(this.form.getRawValue().tipsAmount) > 0 && !state.cashAmount) {
          state.cashAmount = this.n(this.form.getRawValue().tipsAmount);
        }
        this.tipEditorValue.set(state);
        this.tipDraft = state;
        const total =
          Math.round(
            (state.cashAmount + state.transferAmount + state.ticketsAmount) * 100,
          ) / 100;
        if (total > 0) {
          this.form.patchValue({ tipsAmount: total }, { emitEvent: false });
        }
      },
      error: () => {
        const tips = this.n(this.form.getRawValue().tipsAmount);
        const state: TipsEditorState = {
          cashAmount: tips,
          receipts: [],
          transferAmount: 0,
          ticketsAmount: 0,
          notes: '',
          allocations: [],
        };
        this.tipEditorValue.set(state);
        this.tipDraft = state;
      },
    });
  }

  private tipPayloadForClosing(): Record<string, unknown> {
    if (!this.tipsEnabled() || !this.tipDraft) return {};
    const d = this.tipDraft;
    const allocSum = Math.round(
      d.allocations.reduce((s, a) => s + Number(a.amount || 0), 0) * 100,
    ) / 100;
    const total =
      Math.round(
        (Number(d.cashAmount || 0) +
          Number(d.transferAmount || 0) +
          Number(d.ticketsAmount || 0)) *
          100,
      ) / 100;
    if (d.allocations.length && Math.abs(allocSum - total) > 0.02) {
      this.snack.open('El reparto de propinas debe sumar el total', 'OK', {
        duration: 3000,
      });
      return { __tipsInvalid: true };
    }
    return {
      tipCashAmount: Number(d.cashAmount || 0),
      tipTransferAmount: Number(d.transferAmount || 0),
      tipTicketsAmount: Number(d.ticketsAmount || 0),
      tipReceipts: d.receipts ?? [],
      tipNotes: d.notes?.trim() || null,
      tipAllocations: d.allocations.map((a) => ({
        employeeId: a.employeeId,
        amount: Number(a.amount || 0),
        delivered: !!a.delivered,
      })),
      tipsAmount: total,
    };
  }

  money(value: number): string {
    return `$ ${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  private n(v: unknown): number {
    const num = Number(v ?? 0);
    return Number.isFinite(num) ? num : 0;
  }

  /** Vacío en el input si no hay monto (evita el 0 adelante en móvil). */
  private emptyNum(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const num = Number(v);
    if (!Number.isFinite(num) || num === 0) return null;
    return num;
  }

  private hasPosnetType(type: PosnetType): boolean {
    const rows = (this.formValue().posnetAmounts ?? []) as ClosingPosnetAmount[];
    return rows.some((r) => r?.type === type);
  }

  private initPaymentLines(saved?: ClosingPosnetAmount[] | null): void {
    const configured = this.shop()?.posnets ?? [];
    this.configuredPosnetIds = new Set(configured.map((p) => p.id));
    this.posnetAmounts.clear({ emitEvent: false });
    this.dniTransfers.clear({ emitEvent: false });

    const byId = new Map((saved ?? []).map((p) => [p.posnetId, p]));
    for (const posnet of configured) {
      const prev = byId.get(posnet.id);
      this.posnetAmounts.push(
        this.buildPosnetAmountGroup(
          {
            posnetId: posnet.id,
            name: posnet.name,
            type: posnet.type,
            amount: prev?.amount ?? null,
          },
          { lockIdentity: true },
        ),
        { emitEvent: false },
      );
    }

    for (const row of saved ?? []) {
      if (this.configuredPosnetIds.has(row.posnetId)) continue;
      if (row.type === 'CUENTA_DNI') {
        this.dniTransfers.push(
          this.buildDniTransferGroup({
            id: row.posnetId,
            label: row.name,
            amount: row.amount ?? 0,
          }),
          { emitEvent: false },
        );
        continue;
      }
      this.posnetAmounts.push(this.buildPosnetAmountGroup(row), { emitEvent: false });
    }

    this.syncDerivedTotals();
  }

  private buildPosnetAmountGroup(
    value: {
      posnetId: string;
      name: string;
      type: PosnetType | string;
      amount?: number | null;
    },
    opts?: { lockIdentity?: boolean },
  ) {
    const group = this.fb.group({
      posnetId: [value.posnetId || newId()],
      name: [value.name || ''],
      type: [value.type || 'PVS'],
      amount: [this.emptyNum(value.amount)],
    });
    if (opts?.lockIdentity) {
      group.controls.name.disable({ emitEvent: false });
      group.controls.type.disable({ emitEvent: false });
    }
    return group;
  }

  private buildDniTransferGroup(value: { id: string; label: string; amount?: number | null }) {
    return this.fb.group({
      id: [value.id || newId()],
      label: [value.label || ''],
      amount: [this.emptyNum(value.amount)],
    });
  }

  private syncDerivedTotals(): void {
    const posnets = this.posnetAmounts.getRawValue() as ClosingPosnetAmount[];
    const transfers = this.dniTransfers.getRawValue() as Array<{ id: string; label: string; amount: number }>;

    let card = 0;
    let mp = 0;
    let dniFromPosnets = 0;
    let hasPvs = false;
    let hasMp = false;
    let hasDniPosnet = false;

    for (const row of posnets) {
      const amount = this.n(row.amount);
      if (row.type === 'PVS') {
        hasPvs = true;
        card += amount;
      } else if (row.type === 'MERCADO_PAGO') {
        hasMp = true;
        mp += amount;
      } else if (row.type === 'CUENTA_DNI') {
        hasDniPosnet = true;
        dniFromPosnets += amount;
      }
    }

    const dniFromTransfers = transfers.reduce((acc, t) => acc + this.n(t.amount), 0);
    const hasTransfers = transfers.length > 0;
    const patch: Record<string, number | null> = {};
    if (hasPvs) patch['cardAmount'] = this.emptyNum(card);
    if (hasMp) patch['mercadoPagoAmount'] = this.emptyNum(mp);
    if (hasDniPosnet || hasTransfers) {
      patch['accountDniAmount'] = this.emptyNum(dniFromPosnets + dniFromTransfers);
    }
    if (Object.keys(patch).length) {
      this.form.patchValue(patch, { emitEvent: true });
    }
  }

  addPosnet(): void {
    this.posnetAmounts.push(
      this.buildPosnetAmountGroup({
        posnetId: newId(),
        name: '',
        type: 'PVS',
        amount: null,
      }),
    );
  }

  isConfiguredPosnet(index: number): boolean {
    const row = this.posnetAmounts.at(index)?.getRawValue() as ClosingPosnetAmount | undefined;
    return !!row?.posnetId && this.configuredPosnetIds.has(row.posnetId);
  }

  posnetRowTitle(index: number): string {
    const row = this.posnetAmounts.at(index)?.getRawValue() as ClosingPosnetAmount | undefined;
    const name = String(row?.name ?? '').trim();
    return name || `Terminal ${index + 1}`;
  }

  posnetRowTypeLabel(index: number): string {
    const row = this.posnetAmounts.at(index)?.getRawValue() as ClosingPosnetAmount | undefined;
    const type = String(row?.type ?? '');
    return POSNET_TYPE_LABEL[type] ?? 'Posnet';
  }

  removePosnet(index: number): void {
    if (this.isConfiguredPosnet(index)) return;
    this.posnetAmounts.removeAt(index);
    this.syncDerivedTotals();
  }

  addDniTransfer(): void {
    this.dniTransfers.push(
      this.buildDniTransferGroup({
        id: newId(),
        label: '',
        amount: null,
      }),
    );
  }

  removeDniTransfer(index: number): void {
    this.dniTransfers.removeAt(index);
    this.syncDerivedTotals();
  }

  openBillCounter(): void {
    this.dialogTitle
      .track(
        this.dialog.open(CashBillCounterDialogComponent, {
          width: '440px',
          maxWidth: '96vw',
          maxHeight: 'calc(100dvh - 4.5rem)',
          autoFocus: 'dialog',
          panelClass: 'guy-dialog',
          data: {
            initialTotal: this.form.controls.cashAmount.value,
          },
        }),
        'Contar billetes',
      )
      .afterClosed()
      .subscribe((result) => {
        if (!result || result.total <= 0) return;
        this.form.patchValue({ cashAmount: result.total });
      });
  }

  onWithdrawnUserChange(userId: string): void {
    const user = this.users().find((u) => u.id === userId);
    const accounts = user?.ledgerAccounts ?? [];
    if (accounts.length === 1) {
      this.form.patchValue({ cashWithdrawnToAccountId: accounts[0].id }, { emitEvent: false });
      return;
    }
    if (accounts.length === 0) {
      this.form.patchValue({ cashWithdrawnToAccountId: '' }, { emitEvent: false });
      return;
    }
    const current = String(this.form.getRawValue().cashWithdrawnToAccountId ?? '');
    if (!accounts.some((a) => a.id === current)) {
      this.form.patchValue({ cashWithdrawnToAccountId: '' }, { emitEvent: false });
    }
  }

  async shareSummary(): Promise<void> {
    const needsSave = !this.isEdit() || this.form.dirty;
    if (needsSave) {
      const saveFirst = await this.confirmDialog.confirm(
        'Guardar antes de compartir',
        'El cierre todavía no está guardado. ¿Querés guardarlo antes de compartir?',
        {
          confirmLabel: 'Sí, guardar',
          cancelLabel: 'Compartir sin guardar',
          confirmColor: 'primary',
          icon: 'save',
        },
      );
      if (saveFirst) {
        await this.saveAndShare();
        return;
      }
    }
    await this.doShare();
  }

  private async doShare(): Promise<void> {
    const shopName = this.shop()?.name ?? 'Local';
    const payload = closingSharePayload(this.buildShareClosing(), shopName, {
      unitsLabel: this.shop()?.unitsLabel,
    });
    const result = await shareText(payload);
    if (result === 'copied') {
      this.snack.open('Resumen copiado al portapapeles', 'OK', { duration: 2500 });
    } else if (result === 'failed') {
      this.snack.open('No se pudo compartir', 'OK', { duration: 3000 });
    }
  }

  /** Guarda y luego comparte. En alta abre el diálogo de confirmación. */
  private async saveAndShare(): Promise<void> {
    if (this.isLocked() && !this.auth.isAdmin()) {
      this.snack.open('El cierre está bloqueado', 'OK', { duration: 2500 });
      return;
    }
    const prepared = this.prepareSaveBody();
    if (!prepared) return;

    const { shopId, body } = prepared;
    if (!this.isEdit()) {
      void this.saveNewWithDialog(shopId, body, { shareAfterSave: true });
      return;
    }

    this.api.update(shopId, this.closingId!, body).subscribe({
      next: () => {
        this.form.markAsPristine();
        this.cashWithdrawalsInbox.refresh();
        this.snack.open('Cierre guardado', 'OK', { duration: 2500 });
        void this.doShare();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo guardar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  /** Arma el body de guardado o null si la validación falla. */
  private prepareSaveBody(): { shopId: string; body: Partial<CashClosing> } | null {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return null;
    }
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.snack.open('Seleccioná un local', 'OK', { duration: 2500 });
      return null;
    }
    this.syncDerivedTotals();
    const raw = this.form.getRawValue();
    const userId = raw.cashWithdrawnByUserId || null;
    const selected = this.users().find((u) => u.id === userId);
    const withdrawnAccounts = selected?.ledgerAccounts ?? [];
    let accountId = raw.cashWithdrawnToAccountId || null;
    if (this.n(raw.cashAmount) > 0 && userId && withdrawnAccounts.length > 1 && !accountId) {
      this.snack.open('Seleccioná la cuenta destino del efectivo', 'OK', { duration: 3000 });
      return null;
    }
    if (withdrawnAccounts.length === 1) {
      accountId = withdrawnAccounts[0].id;
    }
    if (!userId) accountId = null;

    const posnetAmounts: ClosingPosnetAmount[] = (raw.posnetAmounts as ClosingPosnetAmount[])
      .filter((p) => !!String(p.name ?? '').trim() || this.n(p.amount) > 0)
      .map((p) => ({
        posnetId: p.posnetId || newId(),
        name: String(p.name ?? '').trim() || POSNET_TYPE_LABEL[p.type] || 'Posnet',
        type: p.type,
        amount: this.n(p.amount),
      }));

    for (const t of raw.dniTransfers as Array<{ id: string; label: string; amount: number }>) {
      if (!String(t.label ?? '').trim() && this.n(t.amount) <= 0) continue;
      posnetAmounts.push({
        posnetId: t.id || newId(),
        name: String(t.label ?? '').trim() || 'Transferencia Cuenta DNI',
        type: 'CUENTA_DNI',
        amount: this.n(t.amount),
      });
    }

    const body: Partial<CashClosing> & Record<string, unknown> = {
      ...raw,
      businessDate: toDateString(raw.businessDate as Date | string | null),
      posSystemAmount: this.n(raw.posSystemAmount),
      cardAmount: this.n(raw.cardAmount),
      cashAmount: this.n(raw.cashAmount),
      mercadoPagoAmount: this.n(raw.mercadoPagoAmount),
      deliveryAppsAmount: this.n(raw.deliveryAppsAmount),
      transferAmount: this.n(raw.transferAmount),
      accountDniAmount: this.n(raw.accountDniAmount),
      cashLeftInRegister: this.n(raw.cashLeftInRegister),
      cashWithdrawn: this.n(raw.cashWithdrawn),
      tipsAmount: this.n(raw.tipsAmount),
      unitsSold: raw.unitsSold || null,
      coversCount: raw.coversCount || null,
      cashWithdrawnByUserId: userId,
      cashWithdrawnByEmployeeId: null,
      cashWithdrawnByName: selected?.fullName ?? null,
      cashWithdrawnToAccountId: accountId,
      cashPendingPickup: userId
        ? 0
        : (() => {
            const explicit = this.n(raw.cashWithdrawn);
            if (explicit > 0) return explicit;
            const expensesTotal = (
              raw.expenses as Array<{ label: string; amount: number }>
            )
              .filter((e) => !!e.label && this.n(e.amount) > 0)
              .reduce((s, e) => s + this.n(e.amount), 0);
            return Math.max(
              0,
              this.n(raw.cashAmount) - this.n(raw.cashLeftInRegister) - expensesTotal,
            );
          })(),
      declaredTotal: this.declaredTotal(),
      posnetAmounts: posnetAmounts.length ? posnetAmounts : [],
      expenses: (raw.expenses as Array<{ label: string; amount: number; category?: string }>)
        .filter((e) => !!e.label && this.n(e.amount) > 0)
        .map((e) => ({
          label: e.label,
          amount: this.n(e.amount),
          category: e.category,
        })),
      notes: String(raw.notes ?? '').trim() || null,
      ...this.tipPayloadForClosing(),
    };
    if (body['__tipsInvalid']) return null;
    delete body['__tipsInvalid'];
    // dniTransfers es solo UI; no lo mandamos al API
    delete (body as { dniTransfers?: unknown }).dniTransfers;
    return { shopId, body };
  }

  /** Snapshot del formulario como CashClosing para armar el texto de compartir. */
  private buildShareClosing(): CashClosing {
    const raw = this.form.getRawValue();
    this.syncDerivedTotals();
    const userId = String(raw.cashWithdrawnByUserId ?? '');
    const who =
      this.users().find((u) => u.id === userId)?.fullName?.trim() || null;
    const declared = this.declaredTotal();
    const pos = this.posAmount();

    const posnetAmounts: ClosingPosnetAmount[] = [
      ...((raw.posnetAmounts as ClosingPosnetAmount[]) ?? []),
      ...((raw.dniTransfers as Array<{ id: string; label: string; amount: number }>) ?? []).map(
        (t) => ({
          posnetId: t.id,
          name: String(t.label ?? '').trim() || 'Transferencia Cuenta DNI',
          type: 'CUENTA_DNI' as const,
          amount: this.n(t.amount),
        }),
      ),
    ].filter((p) => this.n(p.amount) > 0);

    const expenses = (
      (raw.expenses as Array<{ label: string; amount: number; category?: string }>) ?? []
    )
      .filter((e) => !!e.label && this.n(e.amount) > 0)
      .map((e) => ({
        label: e.label,
        amount: this.n(e.amount),
        category: e.category,
      }));

    return {
      id: this.closingId ?? '',
      shopId: this.shops.selectedShopId() ?? '',
      businessDate: toDateString(raw.businessDate as Date | string | null),
      status: this.status() ?? 'OPEN',
      posSystemAmount: pos,
      cardAmount: this.n(raw.cardAmount),
      cashAmount: this.n(raw.cashAmount),
      mercadoPagoAmount: this.n(raw.mercadoPagoAmount),
      deliveryAppsAmount: this.n(raw.deliveryAppsAmount),
      transferAmount: this.n(raw.transferAmount),
      accountDniAmount: this.n(raw.accountDniAmount),
      otherAmount: 0,
      tipsAmount: this.n(raw.tipsAmount),
      cashLeftInRegister: this.n(raw.cashLeftInRegister),
      cashPendingPickup: 0,
      cashWithdrawn: this.n(raw.cashWithdrawn),
      cashWithdrawnByName: who,
      unitsSold: raw.unitsSold || null,
      coversCount: raw.coversCount || null,
      declaredTotal: declared,
      calculatedTotal: declared,
      difference: declared - pos,
      notes: String(raw.notes ?? '').trim() || null,
      posnetAmounts,
      expenses,
    };
  }

  save(): void {
    if (this.saving()) return;
    if (this.isLocked() && !this.auth.isAdmin()) {
      this.snack.open('El cierre está bloqueado', 'OK', { duration: 2500 });
      return;
    }
    const prepared = this.prepareSaveBody();
    if (!prepared) return;

    const { shopId, body } = prepared;
    const wasCreate = !this.isEdit();
    if (wasCreate) {
      void this.saveNewWithDialog(shopId, body);
      return;
    }

    this.saving.set(true);
    this.api.update(shopId, this.closingId!, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.cashWithdrawalsInbox.refresh();
        this.snack.open('Cierre guardado', 'OK', { duration: 2500 });
        void this.router.navigateByUrl(
          defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId()),
        );
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message ?? 'No se pudo guardar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  private async saveNewWithDialog(
    shopId: string,
    body: Partial<CashClosing>,
    opts?: { shareAfterSave?: boolean },
  ): Promise<void> {
    const shopName = this.shop()?.name ?? 'Local';
    const share = closingSharePayload(
      {
        ...this.buildShareClosing(),
        ...body,
        cashWithdrawnByName: body.cashWithdrawnByName ?? null,
      } as CashClosing,
      shopName,
      { unitsLabel: this.shop()?.unitsLabel },
    );

    const result = await firstValueFrom(
      this.dialogTitle
        .track(
          this.dialog.open(ClosingSaveDialogComponent, {
            width: '440px',
            maxWidth: '95vw',
            panelClass: 'guy-dialog',
            disableClose: true,
            data: {
              shopName,
              date: this.summaryDate(),
              pvs: this.money(this.cardAmount()),
              cash: this.money(this.cashAmount()),
              accountDni: this.money(this.accountDniAmount()),
              posSystem: this.money(this.posAmount()),
              total: this.money(this.declaredTotal()),
              unitsLabel: this.shop()?.unitsLabel ?? null,
              unitsSold: body.unitsSold ?? null,
              cashWithdrawnByName: body.cashWithdrawnByName ?? null,
              shareTitle: share.title,
              shareText: share.text,
              shareAfterSave: opts?.shareAfterSave === true,
              save$: () => this.api.create(shopId, body),
            },
          }),
          'Confirmar cierre',
        )
        .afterClosed(),
    );

    if (result !== 'saved') return;

    this.cashWithdrawalsInbox.refresh();

    if (this.cashierOnly()) {
      this.resetForNextClosing();
      return;
    }
    void this.router.navigateByUrl(
      defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId()),
    );
  }

  cancel(): void {
    void this.router.navigateByUrl(
      defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId()),
    );
  }

  unlock(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.closingId || !this.auth.isAdmin()) return;
    this.api.unlock(shopId, this.closingId).subscribe({
      next: (c) => {
        this.status.set(c.status);
        this.form.enable({ emitEvent: false });
        this.snack.open('Cierre desbloqueado', 'OK', { duration: 2500 });
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo desbloquear';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
      },
    });
  }

  private resetForNextClosing(): void {
    const today = this.currentBusinessDate();
    this.expenses.clear();
    this.dniTransfers.clear();
    this.form.reset({
      businessDate: toDateInput(today),
      posSystemAmount: null,
      cardAmount: null,
      cashAmount: null,
      mercadoPagoAmount: null,
      deliveryAppsAmount: null,
      transferAmount: null,
      accountDniAmount: null,
      unitsSold: null,
      coversCount: null,
      cashLeftInRegister: this.emptyNum(this.shop()?.defaultChangeAmount),
      cashWithdrawn: null,
      cashWithdrawnByUserId: '',
      cashWithdrawnToAccountId: '',
      tipsAmount: null,
      notes: '',
      expenses: [],
      posnetAmounts: [],
      dniTransfers: [],
    });
    this.initPaymentLines();
  }

  private buildExpenseGroup(value: { label: string; amount?: number | null; category: string }) {
    return this.fb.group({
      label: [value.label || ''],
      amount: [this.emptyNum(value.amount)],
      category: [value.category || 'OTHER'],
    });
  }

  addExpense(): void {
    this.panelExpenses.set(true);
    this.expenses.push(this.buildExpenseGroup({ label: '', amount: null, category: 'OTHER' }));
  }

  removeExpense(index: number): void {
    this.expenses.removeAt(index);
  }
}
