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
import { firstValueFrom, merge, startWith } from 'rxjs';
import { MatDatepickerModule } from '@angular/material/datepicker';
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
import { shareText } from '../../shared/utils/share-text';
import { appendClosingUnitsAndCarrier } from '../../shared/components/record-share-builders';
import { ClosingSaveDialogComponent } from './closing-save-dialog';

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
  { value: 'RAW_MATERIALS', label: 'Materia prima' },
  { value: 'DRINKS', label: 'Bebida' },
  { value: 'SALARIES', label: 'Sueldos' },
  { value: 'COMMISSIONS', label: 'Comisiones' },
  { value: 'RENT', label: 'Alquiler' },
  { value: 'EQUIPMENT', label: 'Equipamiento' },
  { value: 'CLEANING', label: 'Limpieza' },
  { value: 'DISPOSABLES', label: 'Descartables' },
  { value: 'UTILITIES', label: 'Servicios' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'SUPPLIES', label: 'Insumos' },
  { value: 'SERVICES', label: 'Servicios' },
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
            [disabled]="isLocked() && !auth.isAdmin()"
          >
            Guardar cierre
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

        <section class="closing-form__section closing-form__main">
          <h2>Cobros del día</h2>
          <div class="closing-form__fields closing-form__fields--main">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Fecha</mat-label>
              <input matInput [matDatepicker]="closingDatePicker" formControlName="businessDate" />
              <mat-datepicker-toggle matIconSuffix [for]="closingDatePicker" />
              <mat-datepicker #closingDatePicker />
              @if (businessDayHint()) {
                <mat-hint>{{ businessDayHint() }}</mat-hint>
              }
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Caja (sistema)</mat-label>
              <input matInput type="number"
                      inputmode="decimal" formControlName="posSystemAmount" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Efectivo</mat-label>
              <input matInput type="number"
                      inputmode="decimal" formControlName="cashAmount" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>PVS{{ locksCard() ? ' (suma posnets)' : '' }}</mat-label>
              <input matInput type="number"
                      inputmode="decimal" formControlName="cardAmount" [readonly]="locksCard()" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Cuenta DNI{{ locksDni() ? ' (suma)' : '' }}</mat-label>
              <input
                matInput
                type="number"
                      inputmode="decimal"
                formControlName="accountDniAmount"
                [readonly]="locksDni()"
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
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Cuenta destino del efectivo</mat-label>
                <mat-select formControlName="cashWithdrawnToAccountId">
                  @for (acc of withdrawnAccountOptions(); track acc.id) {
                    <mat-option [value]="acc.id">{{ acc.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            } @else if (withdrawnAccountHint()) {
              <p class="closing-form__account-hint">{{ withdrawnAccountHint() }}</p>
            }
          </div>
        </section>

        <div class="closing-form__panels">
          <section class="closing-panel" [class.closing-panel--open]="panelPosnets()">
            <button
              type="button"
              class="closing-panel__toggle"
              (click)="togglePanel('posnets')"
              [attr.aria-expanded]="panelPosnets()"
            >
              <span class="closing-panel__icon" aria-hidden="true">
                <mat-icon>point_of_sale</mat-icon>
              </span>
              <span class="closing-panel__text">
                <strong>Posnets</strong>
                <span>{{ posnetsPanelHint() }}</span>
              </span>
              <mat-icon class="closing-panel__chevron">{{
                panelPosnets() ? 'expand_less' : 'expand_more'
              }}</mat-icon>
            </button>
            @if (panelPosnets()) {
              <div class="closing-panel__body" formArrayName="posnetAmounts">
                <div class="closing-panel__toolbar">
                  <button mat-stroked-button type="button" (click)="addPosnet()">
                    <mat-icon>add</mat-icon>
                    Agregar posnet
                  </button>
                </div>
                @for (row of posnetAmounts.controls; track row; let i = $index) {
                  <div class="closing-form__posnet-row" [formGroupName]="i">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Nombre</mat-label>
                      <input
                        matInput
                        formControlName="name"
                        placeholder="ej. Caja 1"
                        [readonly]="isConfiguredPosnet(i)"
                      />
                    </mat-form-field>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Tipo</mat-label>
                      <mat-select formControlName="type" [disabled]="isConfiguredPosnet(i)">
                        @for (opt of posnetTypes; track opt.value) {
                          <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Monto</mat-label>
                      <input matInput type="number"
                      inputmode="decimal" formControlName="amount" />
                    </mat-form-field>
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
                    } @else {
                      <span class="closing-form__posnet-spacer" aria-hidden="true"></span>
                    }
                  </div>
                } @empty {
                  <p class="closing-form__hint">Sin posnets. Podés cargar PVS a mano o agregar uno ahora.</p>
                }
              </div>
            }
          </section>

          <section class="closing-panel" [class.closing-panel--open]="panelDni()">
            <button
              type="button"
              class="closing-panel__toggle"
              (click)="togglePanel('dni')"
              [attr.aria-expanded]="panelDni()"
            >
              <span class="closing-panel__icon" aria-hidden="true">
                <mat-icon>account_balance</mat-icon>
              </span>
              <span class="closing-panel__text">
                <strong>Transferencias Cuenta DNI</strong>
                <span>{{ dniPanelHint() }}</span>
              </span>
              <mat-icon class="closing-panel__chevron">{{
                panelDni() ? 'expand_less' : 'expand_more'
              }}</mat-icon>
            </button>
            @if (panelDni()) {
              <div class="closing-panel__body" formArrayName="dniTransfers">
                <div class="closing-panel__toolbar">
                  <button mat-stroked-button type="button" (click)="addDniTransfer()">
                    <mat-icon>add</mat-icon>
                    Agregar transferencia
                  </button>
                </div>
                @for (row of dniTransfers.controls; track row; let i = $index) {
                  <div class="closing-form__dni-row" [formGroupName]="i">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Detalle</mat-label>
                      <input matInput formControlName="label" placeholder="ej. Transferencia cliente" />
                    </mat-form-field>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Monto</mat-label>
                      <input matInput type="number"
                      inputmode="decimal" formControlName="amount" />
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
                } @empty {
                  <p class="closing-form__hint">Sin transferencias. Podés cargar Cuenta DNI a mano.</p>
                }
              </div>
            }
          </section>

          <section class="closing-panel" [class.closing-panel--open]="panelOther()">
            <button
              type="button"
              class="closing-panel__toggle"
              (click)="togglePanel('other')"
              [attr.aria-expanded]="panelOther()"
            >
              <span class="closing-panel__icon" aria-hidden="true">
                <mat-icon>more_horiz</mat-icon>
              </span>
              <span class="closing-panel__text">
                <strong>Otros cobros</strong>
                <span>Mercado Pago, delivery y transferencias</span>
              </span>
              <mat-icon class="closing-panel__chevron">{{
                panelOther() ? 'expand_less' : 'expand_more'
              }}</mat-icon>
            </button>
            @if (panelOther()) {
              <div class="closing-panel__body">
                <div class="closing-form__fields">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>MercadoPago{{ locksMp() ? ' (suma posnets)' : '' }}</mat-label>
                    <input
                      matInput
                      type="number"
                      inputmode="decimal"
                      formControlName="mercadoPagoAmount"
                      [readonly]="locksMp()"
                    />
                  </mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>PedidosYa / delivery</mat-label>
                    <input matInput type="number"
                      inputmode="decimal" formControlName="deliveryAppsAmount" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Transferencia</mat-label>
                    <input matInput type="number"
                      inputmode="decimal" formControlName="transferAmount" />
                  </mat-form-field>
                </div>
              </div>
            }
          </section>

          <section class="closing-panel" [class.closing-panel--open]="panelWithdraw()">
            <button
              type="button"
              class="closing-panel__toggle"
              (click)="togglePanel('withdraw')"
              [attr.aria-expanded]="panelWithdraw()"
            >
              <span class="closing-panel__icon" aria-hidden="true">
                <mat-icon>payments</mat-icon>
              </span>
              <span class="closing-panel__text">
                <strong>Retiro y extras</strong>
                <span>{{ withdrawPanelHint() }}</span>
              </span>
              <mat-icon class="closing-panel__chevron">{{
                panelWithdraw() ? 'expand_less' : 'expand_more'
              }}</mat-icon>
            </button>
            @if (panelWithdraw()) {
              <div class="closing-panel__body">
                <div class="closing-form__fields">
                  @if (shop()?.unitsLabel) {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>{{ shop()?.unitsLabel }}</mat-label>
                      <input matInput type="number"
                      inputmode="numeric" pattern="[0-9]*" formControlName="unitsSold" />
                    </mat-form-field>
                  }
                  @if (shop()?.coversEnabled) {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Comensales</mat-label>
                      <input matInput type="number"
                      inputmode="numeric" pattern="[0-9]*" formControlName="coversCount" />
                    </mat-form-field>
                  }
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Cambio en caja</mat-label>
                    <input matInput type="number"
                      inputmode="decimal" formControlName="cashLeftInRegister" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Efectivo retirado</mat-label>
                    <input matInput type="number"
                      inputmode="decimal" formControlName="cashWithdrawn" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Propinas</mat-label>
                    <input matInput type="number"
                      inputmode="decimal" formControlName="tipsAmount" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="closing-notes" subscriptSizing="dynamic">
                    <mat-label>Notas</mat-label>
                    <textarea matInput rows="2" formControlName="notes"></textarea>
                  </mat-form-field>
                </div>
              </div>
            }
          </section>

          <section class="closing-panel" [class.closing-panel--open]="panelExpenses()">
            <button
              type="button"
              class="closing-panel__toggle"
              (click)="togglePanel('expenses')"
              [attr.aria-expanded]="panelExpenses()"
            >
              <span class="closing-panel__icon" aria-hidden="true">
                <mat-icon>receipt_long</mat-icon>
              </span>
              <span class="closing-panel__text">
                <strong>Egresos del día</strong>
                <span>{{ expensesPanelHint() }}</span>
              </span>
              <mat-icon class="closing-panel__chevron">{{
                panelExpenses() ? 'expand_less' : 'expand_more'
              }}</mat-icon>
            </button>
            @if (panelExpenses()) {
              <div class="closing-panel__body">
                <div class="closing-panel__toolbar">
                  <button mat-stroked-button type="button" (click)="addExpense()">
                    <mat-icon>add</mat-icon>
                    Agregar egreso
                  </button>
                </div>
                <div class="closing-form__expenses-list" formArrayName="expenses">
                  @for (row of expenses.controls; track row; let i = $index) {
                    <div class="expense-row" [formGroupName]="i">
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>Concepto</mat-label>
                        <input matInput formControlName="label" />
                      </mat-form-field>
                      <mat-form-field appearance="outline" subscriptSizing="dynamic">
                        <mat-label>Monto</mat-label>
                        <input matInput type="number"
                      inputmode="decimal" formControlName="amount" />
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
            }
          </section>
        </div>
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
          [disabled]="isLocked() && !auth.isAdmin()"
        >
          Guardar cierre
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      :host.closing-form-page--cashier {
        max-width: 760px;
        margin-inline: auto;
      }

      .closing-form-shell {
        padding: 1rem 1.15rem 1.1rem;
      }

      .closing-form-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin-bottom: 0.85rem;
      }

      .closing-form-head h1 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
        line-height: 1.2;
      }

      .closing-form-head p {
        margin: 0.15rem 0 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
      }

      .closing-form-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
      }

      .closing-form-actions--sticky {
        display: none;
      }

      .closing-form {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }

      .closing-form__section {
        padding: 0.95rem 1rem 1.05rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 14px;
        background: color-mix(in srgb, var(--guy-card, #fff) 94%, var(--guy-surface, #f3f6f4));
      }

      .closing-form__section h2 {
        margin: 0 0 0.65rem;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--guy-muted, #5f6f76);
      }

      .closing-form__fields {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.85rem 1rem;
      }

      .closing-form__fields--main {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .closing-form__panels {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }

      .closing-panel {
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 14px;
        background: var(--guy-card, #fff);
        overflow: hidden;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }

      .closing-panel--open {
        border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 35%, var(--guy-border, #d7e0d9));
        box-shadow: 0 8px 22px rgba(0, 51, 102, 0.05);
      }

      .closing-panel__toggle {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.85rem 0.95rem;
        border: 0;
        background: transparent;
        text-align: left;
        cursor: pointer;
        color: inherit;
        font: inherit;
        min-height: 56px;
        -webkit-tap-highlight-color: transparent;
      }

      .closing-panel__toggle:hover {
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 70%, transparent);
      }

      .closing-panel__icon {
        display: grid;
        place-items: center;
        width: 2.35rem;
        height: 2.35rem;
        border-radius: 12px;
        flex-shrink: 0;
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 12%, #fff);
        color: var(--guy-accent, #2e7d32);
      }

      .closing-panel__icon mat-icon {
        font-size: 1.2rem;
        width: 1.2rem;
        height: 1.2rem;
      }

      .closing-panel__text {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
        flex: 1;
      }

      .closing-panel__text strong {
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
      }

      .closing-panel__text span {
        font-size: 0.78rem;
        color: var(--guy-muted, #5f6f76);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .closing-panel__chevron {
        color: var(--guy-muted, #5f6f76);
        flex-shrink: 0;
      }

      .closing-panel__body {
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        padding: 0 0.95rem 0.95rem;
        border-top: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 80%, transparent);
        padding-top: 0.85rem;
      }

      .closing-panel__toolbar {
        display: flex;
        justify-content: flex-end;
      }

      .closing-form__hint {
        margin: 0;
        font-size: 0.82rem;
        color: var(--guy-muted, #5f6f76);
      }

      .closing-form__account-hint {
        grid-column: 1 / -1;
        margin: 0;
        font-size: 0.78rem;
        color: var(--guy-muted, #5f6f76);
      }

      .closing-form__posnet-row {
        display: grid;
        grid-template-columns: 1.2fr 0.9fr 0.8fr auto;
        gap: 0.55rem;
        align-items: center;
      }

      .closing-form__dni-row {
        display: grid;
        grid-template-columns: 1.4fr 0.8fr auto;
        gap: 0.55rem;
        align-items: center;
      }

      .closing-form__row-remove,
      .expense-row__remove {
        color: #c62828;
      }

      .closing-form__posnet-spacer {
        width: 40px;
        height: 40px;
      }

      .closing-notes {
        grid-column: 1 / -1;
      }

      .closing-form__fields .mat-mdc-form-field,
      .closing-panel__body .mat-mdc-form-field {
        margin-bottom: 0 !important;
      }

      :host ::ng-deep .closing-form__fields .mat-mdc-form-field-subscript-wrapper,
      :host ::ng-deep .closing-panel__body .mat-mdc-form-field-subscript-wrapper {
        display: none;
      }

      :host ::ng-deep .closing-form__fields .mat-mdc-form-field-infix,
      :host ::ng-deep .closing-panel__body .mat-mdc-form-field-infix {
        min-height: 42px !important;
        padding-top: 10px !important;
        padding-bottom: 10px !important;
      }

      :host ::ng-deep .closing-form__fields input[readonly],
      :host ::ng-deep .closing-panel__body input[readonly] {
        cursor: default;
      }

      .closing-form__expenses-list {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }

      .expense-row {
        display: grid;
        grid-template-columns: 1.4fr 0.8fr 1fr auto;
        gap: 0.6rem;
        align-items: center;
      }

      .closing-totals {
        padding: 0.85rem 1rem 0.95rem;
        border-radius: 16px;
        border: 1px solid color-mix(in srgb, var(--guy-accent, #2e7d32) 28%, var(--guy-border, #d7e0d9));
        background:
          radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--guy-accent, #2e7d32) 14%, transparent), transparent 42%),
          linear-gradient(160deg, #fff 0%, color-mix(in srgb, var(--guy-surface, #f3f6f4) 65%, #fff) 100%);
      }

      .closing-totals__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.65rem;
        flex-wrap: wrap;
        margin-bottom: 0.75rem;
      }

      .closing-totals__head h2 {
        margin: 0;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--guy-muted, #5f6f76);
      }

      .closing-totals__sub {
        margin: 0.15rem 0 0;
        font-size: 0.8rem;
        color: var(--guy-muted, #5f6f76);
      }

      .closing-totals__grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.7rem;
      }

      .closing-totals__item {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        min-width: 0;
        padding: 0.55rem 0.65rem;
        border-radius: 12px;
        background: color-mix(in srgb, #fff 82%, transparent);
      }

      .closing-totals__item span {
        font-size: 0.68rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--guy-muted, #5f6f76);
      }

      .closing-totals__item strong {
        font-size: 1.08rem;
        line-height: 1.15;
        color: var(--guy-navy, #003366);
        word-break: break-word;
      }

      .closing-totals__item--total {
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 12%, #fff);
      }

      .closing-totals__item--total strong {
        color: var(--guy-accent, #2e7d32);
      }

      @media (max-width: 960px) {
        .closing-form-actions--top {
          display: none;
        }

        .closing-form-shell {
          padding-bottom: calc(
            4.75rem + var(--guy-bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px)
          );
        }

        .closing-form-actions--sticky {
          position: fixed;
          left: 0;
          right: 0;
          bottom: calc(var(--guy-bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px));
          z-index: 25;
          display: flex;
          flex-wrap: nowrap;
          gap: 0.5rem;
          padding: 0.65rem 0.75rem;
          background: color-mix(in srgb, var(--guy-card, #fff) 94%, transparent);
          backdrop-filter: blur(8px);
          border-top: 1px solid var(--guy-border, #d7e0d9);
          box-shadow: 0 -6px 18px rgba(0, 51, 102, 0.08);
        }

        .closing-form-actions--sticky .mat-mdc-button-base {
          flex: 1 1 0;
          min-height: 44px;
        }
      }

      @media (max-width: 720px) {
        .expense-row,
        .closing-form__posnet-row,
        .closing-form__dni-row {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 560px) {
        .closing-form__fields,
        .closing-form__fields--main {
          grid-template-columns: 1fr;
        }
        .closing-totals__grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `,
  ],
})
export class ClosingsFormPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ClosingsApiService);
  private readonly shops = inject(ShopContextService);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly destroyRef = inject(DestroyRef);

  readonly shop = this.shops.selectedShop;
  readonly isEdit = signal(false);
  readonly status = signal<string | null>(null);
  readonly users = signal<ShopUserOption[]>([]);
  readonly expenseCategories = EXPENSE_CATEGORY_OPTIONS;
  readonly posnetTypes = POSNET_TYPE_OPTIONS;
  readonly cashierOnly = () => isCashierOnly(this.auth.currentUser(), this.shops.selectedShopId());
  readonly isLocked = () => this.status() === 'LOCKED';
  private closingId: string | null = null;

  readonly panelPosnets = signal(false);
  readonly panelDni = signal(false);
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

  readonly form = this.fb.nonNullable.group({
    businessDate: [null as Date | null, Validators.required],
    posSystemAmount: [0],
    cardAmount: [0],
    cashAmount: [0],
    mercadoPagoAmount: [0],
    deliveryAppsAmount: [0],
    transferAmount: [0],
    accountDniAmount: [0],
    unitsSold: [0 as number | null],
    coversCount: [0 as number | null],
    cashLeftInRegister: [0],
    cashWithdrawn: [0],
    cashWithdrawnByUserId: [''],
    cashWithdrawnToAccountId: [''],
    tipsAmount: [0],
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
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
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
      (u) => !u.hideFromCashWithdraw || u.id === selected,
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

  posnetsPanelHint(): string {
    const n = this.posnetAmounts.length;
    if (!n) return 'Cargar o sumar terminales';
    return n === 1 ? '1 terminal' : `${n} terminales`;
  }

  dniPanelHint(): string {
    const n = this.dniTransfers.length;
    if (!n) return 'Opcional';
    return n === 1 ? '1 transferencia' : `${n} transferencias`;
  }

  withdrawPanelHint(): string {
    const amount = this.n(this.formValue().cashWithdrawn);
    if (amount > 0) return this.money(amount);
    return 'Cambio, retiro y notas';
  }

  expensesPanelHint(): string {
    const n = this.expenses.length;
    if (!n) return 'Opcional';
    return n === 1 ? '1 egreso' : `${n} egresos`;
  }

  togglePanel(panel: 'posnets' | 'dni' | 'other' | 'withdraw' | 'expenses'): void {
    const map = {
      posnets: this.panelPosnets,
      dni: this.panelDni,
      other: this.panelOther,
      withdraw: this.panelWithdraw,
      expenses: this.panelExpenses,
    } as const;
    map[panel].update((v) => !v);
  }

  private syncPanelDefaults(): void {
    const v = this.form.getRawValue();
    const configured = this.shop()?.posnets?.length ?? 0;
    if (configured > 0 || this.posnetAmounts.length > 0) this.panelPosnets.set(true);
    if (this.dniTransfers.length > 0) this.panelDni.set(true);
    if (
      this.n(v.mercadoPagoAmount) > 0 ||
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
          posSystemAmount: c.posSystemAmount,
          cardAmount: c.cardAmount,
          cashAmount: c.cashAmount,
          mercadoPagoAmount: c.mercadoPagoAmount,
          deliveryAppsAmount: c.deliveryAppsAmount,
          transferAmount: c.transferAmount,
          accountDniAmount: c.accountDniAmount,
          unitsSold: c.unitsSold ?? null,
          coversCount: c.coversCount ?? null,
          cashLeftInRegister: c.cashLeftInRegister,
          cashWithdrawn: c.cashWithdrawn,
          cashWithdrawnByUserId: c.cashWithdrawnByUserId ?? '',
          cashWithdrawnToAccountId: c.cashWithdrawnToAccountId ?? '',
          tipsAmount: c.tipsAmount,
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
      });
    } else {
      const today = this.currentBusinessDate();
      this.form.patchValue({
        businessDate: toDateInput(today),
        cashLeftInRegister: this.shop()?.defaultChangeAmount ?? 0,
      });
      this.initPaymentLines();
      this.syncPanelDefaults();
    }
  }

  money(value: number): string {
    return `$ ${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  private n(v: unknown): number {
    const num = Number(v ?? 0);
    return Number.isFinite(num) ? num : 0;
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
        this.buildPosnetAmountGroup({
          posnetId: posnet.id,
          name: posnet.name,
          type: posnet.type,
          amount: prev?.amount ?? 0,
        }),
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

  private buildPosnetAmountGroup(value: ClosingPosnetAmount) {
    return this.fb.nonNullable.group({
      posnetId: [value.posnetId || newId()],
      name: [value.name || ''],
      type: [value.type || 'PVS'],
      amount: [value.amount ?? 0],
    });
  }

  private buildDniTransferGroup(value: { id: string; label: string; amount: number }) {
    return this.fb.nonNullable.group({
      id: [value.id || newId()],
      label: [value.label || ''],
      amount: [value.amount ?? 0],
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
    const patch: Record<string, number> = {};
    if (hasPvs) patch['cardAmount'] = card;
    if (hasMp) patch['mercadoPagoAmount'] = mp;
    if (hasDniPosnet || hasTransfers) patch['accountDniAmount'] = dniFromPosnets + dniFromTransfers;
    if (Object.keys(patch).length) {
      this.form.patchValue(patch, { emitEvent: true });
    }
  }

  addPosnet(): void {
    this.panelPosnets.set(true);
    this.posnetAmounts.push(
      this.buildPosnetAmountGroup({
        posnetId: newId(),
        name: '',
        type: 'PVS',
        amount: 0,
      }),
    );
  }

  isConfiguredPosnet(index: number): boolean {
    const row = this.posnetAmounts.at(index)?.getRawValue() as ClosingPosnetAmount | undefined;
    return !!row?.posnetId && this.configuredPosnetIds.has(row.posnetId);
  }

  removePosnet(index: number): void {
    if (this.isConfiguredPosnet(index)) return;
    this.posnetAmounts.removeAt(index);
    this.syncDerivedTotals();
  }

  addDniTransfer(): void {
    this.panelDni.set(true);
    this.dniTransfers.push(
      this.buildDniTransferGroup({
        id: newId(),
        label: '',
        amount: 0,
      }),
    );
  }

  removeDniTransfer(index: number): void {
    this.dniTransfers.removeAt(index);
    this.syncDerivedTotals();
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
    const shopName = this.shop()?.name ?? 'Local';
    const raw = this.form.getRawValue();
    const userId = String(raw.cashWithdrawnByUserId ?? '');
    const who =
      this.users().find((u) => u.id === userId)?.fullName?.trim() ||
      null;
    const lines = [
      `Cierre de caja — ${shopName}`,
      `Fecha: ${this.summaryDate()}`,
      `PVS: ${this.money(this.cardAmount())}`,
      `Efectivo: ${this.money(this.cashAmount())}`,
      `Cuenta DNI: ${this.money(this.accountDniAmount())}`,
      `Caja sistema: ${this.money(this.posAmount())}`,
      `Total: ${this.money(this.declaredTotal())}`,
    ];
    appendClosingUnitsAndCarrier(lines, {
      unitsLabel: this.shop()?.unitsLabel,
      unitsSold: raw.unitsSold,
      cashWithdrawnByName: who,
    });

    const result = await shareText({
      title: `Cierre ${shopName}`,
      text: lines.join('\n'),
    });
    if (result === 'copied') {
      this.snack.open('Resumen copiado al portapapeles', 'OK', { duration: 2500 });
    } else if (result === 'failed') {
      this.snack.open('No se pudo compartir', 'OK', { duration: 3000 });
    }
  }

  save(): void {
    if (this.isLocked() && !this.auth.isAdmin()) {
      this.snack.open('El cierre está bloqueado', 'OK', { duration: 2500 });
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.snack.open('Seleccioná un local', 'OK', { duration: 2500 });
      return;
    }
    this.syncDerivedTotals();
    const raw = this.form.getRawValue();
    const userId = raw.cashWithdrawnByUserId || null;
    const selected = this.users().find((u) => u.id === userId);
    const withdrawnAccounts = selected?.ledgerAccounts ?? [];
    let accountId = raw.cashWithdrawnToAccountId || null;
    if (this.n(raw.cashAmount) > 0 && userId && withdrawnAccounts.length > 1 && !accountId) {
      this.snack.open('Seleccioná la cuenta destino del efectivo', 'OK', { duration: 3000 });
      return;
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

    const body = {
      ...raw,
      businessDate: toDateString(raw.businessDate as Date | string | null),
      unitsSold: raw.unitsSold || null,
      coversCount: raw.coversCount || null,
      cashWithdrawnByUserId: userId,
      cashWithdrawnByEmployeeId: null,
      cashWithdrawnByName: selected?.fullName ?? null,
      cashWithdrawnToAccountId: accountId,
      declaredTotal: this.declaredTotal(),
      posnetAmounts: posnetAmounts.length ? posnetAmounts : [],
      expenses: (raw.expenses as Array<{ label: string; amount: number; category?: string }>).filter(
        (e) => !!e.label && Number(e.amount) > 0,
      ),
    };
    // dniTransfers es solo UI; no lo mandamos al API
    delete (body as { dniTransfers?: unknown }).dniTransfers;

    const wasCreate = !this.isEdit();
    if (wasCreate) {
      void this.saveNewWithDialog(shopId, body);
      return;
    }

    this.api.update(shopId, this.closingId!, body).subscribe({
      next: () => {
        this.snack.open('Cierre guardado', 'OK', { duration: 2500 });
        void this.router.navigateByUrl(
          defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId()),
        );
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo guardar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  private async saveNewWithDialog(shopId: string, body: Partial<CashClosing>): Promise<void> {
    const result = await firstValueFrom(
      this.dialogTitle
        .track(
          this.dialog.open(ClosingSaveDialogComponent, {
            width: '440px',
            maxWidth: '95vw',
            panelClass: 'guy-dialog',
            disableClose: true,
            data: {
              shopName: this.shop()?.name ?? 'Local',
              date: this.summaryDate(),
              pvs: this.money(this.cardAmount()),
              cash: this.money(this.cashAmount()),
              accountDni: this.money(this.accountDniAmount()),
              posSystem: this.money(this.posAmount()),
              total: this.money(this.declaredTotal()),
              unitsLabel: this.shop()?.unitsLabel ?? null,
              unitsSold: body.unitsSold ?? null,
              cashWithdrawnByName: body.cashWithdrawnByName ?? null,
              save$: () => this.api.create(shopId, body),
            },
          }),
          'Confirmar cierre',
        )
        .afterClosed(),
    );

    if (result !== 'saved') return;

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
      posSystemAmount: 0,
      cardAmount: 0,
      cashAmount: 0,
      mercadoPagoAmount: 0,
      deliveryAppsAmount: 0,
      transferAmount: 0,
      accountDniAmount: 0,
      unitsSold: null,
      coversCount: null,
      cashLeftInRegister: this.shop()?.defaultChangeAmount ?? 0,
      cashWithdrawn: 0,
      cashWithdrawnByUserId: '',
      cashWithdrawnToAccountId: '',
      tipsAmount: 0,
      notes: '',
      expenses: [],
      posnetAmounts: [],
      dniTransfers: [],
    });
    this.initPaymentLines();
  }

  private buildExpenseGroup(value: { label: string; amount: number; category: string }) {
    return this.fb.nonNullable.group({
      label: [value.label],
      amount: [value.amount],
      category: [value.category],
    });
  }

  addExpense(): void {
    this.panelExpenses.set(true);
    this.expenses.push(this.buildExpenseGroup({ label: '', amount: 0, category: 'OTHER' }));
  }

  removeExpense(index: number): void {
    this.expenses.removeAt(index);
  }
}
