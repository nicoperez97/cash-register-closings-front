import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AuthService } from '../../core/auth/auth.service';
import { NotifyRecipientsFieldComponent } from '../../shared/components/notify-recipients-field';
import { takeInputFile } from '../../shared/utils/input-file';
import {
  Concept,
  EXPENSE_PAYMENT_METHOD_OPTIONS,
  ExpensePaymentMethod,
  LedgerAccount,
  Movement,
  MovementsApiService,
  accountListedIn,
  expenseReceiptRequired,
  isMovementAccountType,
} from './movements-api.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import {
  SelectSearchComponent,
  filterBySelectQuery,
  onSelectSearchOpened,
} from '../../shared/components/select-search';
import { resolveShopCalendarDate } from '../../core/shop/business-date';
import { ShopContextService } from '../../core/shop/shop-context.service';
import type { UserVisibility } from '../../shared/user-visibility';
import { MoneyInputDirective } from '../../shared/directives/money-input';
import { parseLocaleNumber } from '../../shared/utils/money';

export interface MovementEmployeeOption {
  id: string;
  fullName: string;
}

export interface MovementUserAccountOption {
  id: string;
  name: string;
  code: string;
}

export interface MovementUserOption {
  id: string;
  fullName: string;
  email?: string;
  ledgerAccounts?: MovementUserAccountOption[];
  visibility?: Partial<UserVisibility> | null;
  hideFromCashWithdraw?: boolean;
}

export type MovementDialogData = {
  shopId: string;
  shopName: string;
  accounts: LedgerAccount[];
  concepts: Concept[];
  employees: MovementEmployeeOption[];
  users: MovementUserOption[];
  /** expense = gasto · income = ingreso · transfer = entre cuentas */
  kind?: 'expense' | 'income' | 'transfer';
} & ({ mode: 'create' } | { mode: 'edit'; movement: Movement });

function toDateInput(value?: string | null): Date | null {
  if (!value) return new Date();
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toDateString(value: Date | null): string {
  const d = value ?? new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-movement-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatSlideToggleModule,
    MatIconModule,
    MatSnackBarModule,
    MatCheckboxModule,
    BusyLabelComponent,
    SelectSearchComponent,
    NotifyRecipientsFieldComponent,
    MoneyInputDirective,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : isTransfer ? 'swap_horiz' : 'payments' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ dialogTitle }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form mov-form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Fecha</mat-label>
          <mat-icon matPrefix>event</mat-icon>
          <input matInput [matDatepicker]="datePicker" formControlName="businessDate" />
          <mat-datepicker-toggle matIconSuffix [for]="datePicker" />
          <mat-datepicker #datePicker />
        </mat-form-field>

        <div class="mov-transfer">
          <section class="mov-side">
            <div class="mov-side__head">
              <span class="mov-side__badge mov-side__badge--from" aria-hidden="true">
                <mat-icon>call_made</mat-icon>
              </span>
              <div class="mov-side__titles">
                <strong>Origen</strong>
                <span>De dónde sale</span>
              </div>
            </div>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Cuenta</mat-label>
              <mat-icon matPrefix>account_balance_wallet</mat-icon>
              <mat-select
                formControlName="fromAccountId"
                panelClass="guy-select-search-panel"
                (openedChange)="onSelectSearchOpened($event, fromQuery)"
              >
                <mat-option disabled class="select-search-opt">
                  <app-select-search [(query)]="fromQuery" placeholder="Buscar cuenta…" />
                </mat-option>
                @if (!isTransfer) {
                  <mat-option value="">Elegí una cuenta</mat-option>
                }
                @if (filteredLocalFrom().length) {
                  <mat-optgroup [label]="isTransfer ? 'Cajas y canales' : 'Local'">
                    @for (a of filteredLocalFrom(); track a.id) {
                      <mat-option [value]="a.id">{{ accountLabel(a) }}</mat-option>
                    }
                  </mat-optgroup>
                }
                @if (filteredOtherFrom().length) {
                  <mat-optgroup [label]="isTransfer ? 'Socios y otras' : 'Otras cuentas'">
                    @for (a of filteredOtherFrom(); track a.id) {
                      <mat-option [value]="a.id">{{ accountLabel(a) }}</mat-option>
                    }
                  </mat-optgroup>
                }
                @if (fromQuery() && !filteredLocalFrom().length && !filteredOtherFrom().length) {
                  <mat-option disabled>Sin resultados</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </section>

          <div class="mov-transfer__arrow" aria-hidden="true">
            <mat-icon>south</mat-icon>
          </div>

          <section class="mov-side" [class.mov-side--optional]="!isTransfer">
            <div class="mov-side__head">
              <span class="mov-side__badge mov-side__badge--to" aria-hidden="true">
                <mat-icon>call_received</mat-icon>
              </span>
              <div class="mov-side__titles">
                <strong>Destino</strong>
                <span>{{ isTransfer ? 'A dónde entra' : 'Opcional · a dónde entra' }}</span>
              </div>
            </div>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ isTransfer ? 'Cuenta' : 'Cuenta (opcional)' }}</mat-label>
              <mat-icon matPrefix>account_balance_wallet</mat-icon>
              <mat-select
                formControlName="toAccountId"
                panelClass="guy-select-search-panel"
                (openedChange)="onSelectSearchOpened($event, toQuery)"
              >
                <mat-option disabled class="select-search-opt">
                  <app-select-search [(query)]="toQuery" placeholder="Buscar cuenta…" />
                </mat-option>
                @if (!isTransfer) {
                  <mat-option value="">Sin cuenta</mat-option>
                }
                @if (filteredLocalTo().length) {
                  <mat-optgroup [label]="isTransfer ? 'Cajas y canales' : 'Local'">
                    @for (a of filteredLocalTo(); track a.id) {
                      <mat-option [value]="a.id">{{ accountLabel(a) }}</mat-option>
                    }
                  </mat-optgroup>
                }
                @if (filteredOtherTo().length) {
                  <mat-optgroup [label]="isTransfer ? 'Socios y otras' : 'Otras cuentas'">
                    @for (a of filteredOtherTo(); track a.id) {
                      <mat-option [value]="a.id">{{ accountLabel(a) }}</mat-option>
                    }
                  </mat-optgroup>
                }
                @if (toQuery() && !filteredLocalTo().length && !filteredOtherTo().length) {
                  <mat-option disabled>Sin resultados</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </section>
        </div>

        @if (!isTransfer) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Concepto</mat-label>
            <mat-icon matPrefix>sell</mat-icon>
            <mat-select
              formControlName="conceptId"
              panelClass="guy-select-search-panel"
              (openedChange)="onSelectSearchOpened($event, conceptQuery)"
            >
              <mat-option disabled class="select-search-opt">
                <app-select-search [(query)]="conceptQuery" placeholder="Buscar concepto…" />
              </mat-option>
              @for (c of filteredConcepts(); track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              }
              @if (conceptQuery() && !filteredConcepts().length) {
                <mat-option disabled>Sin resultados</mat-option>
              }
            </mat-select>
            @if (form.controls.conceptId.touched && form.controls.conceptId.hasError('required')) {
              <mat-error>Elegí un concepto</mat-error>
            }
          </mat-form-field>
        }

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Descripción</mat-label>
          <mat-icon matPrefix>notes</mat-icon>
          <input matInput formControlName="description" placeholder="Opcional" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mov-amount">
          <mat-label>Monto ($)</mat-label>
          <mat-icon matPrefix>attach_money</mat-icon>
          <input matInput type="text" inputmode="decimal" appMoney formControlName="amountUyu" />
          @if (form.controls.amountUyu.touched && form.controls.amountUyu.hasError('required')) {
            <mat-error>Ingresá un monto</mat-error>
          }
        </mat-form-field>

        @if (!isTransfer) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Forma de pago</mat-label>
            <mat-icon matPrefix>payments</mat-icon>
            <mat-select formControlName="paymentMethod">
              @for (opt of paymentMethods; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
            @if (
              form.controls.paymentMethod.touched &&
              form.controls.paymentMethod.hasError('required')
            ) {
              <mat-error>Elegí efectivo, transferencia o tarjeta</mat-error>
            }
          </mat-form-field>

          <div class="mov-receipt">
            <span class="mov-receipt__label">{{
              receiptRequired() ? 'Comprobante' : 'Comprobante (opcional)'
            }}</span>
            <div class="mov-receipt__actions">
              <button mat-stroked-button type="button" (click)="cameraInput.click()">
                <mat-icon>photo_camera</mat-icon>
                Foto
              </button>
              <button mat-stroked-button type="button" (click)="fileInput.click()">
                <mat-icon>upload_file</mat-icon>
                Archivo
              </button>
            </div>
            <input
              #cameraInput
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              (change)="onReceiptPicked($event)"
            />
            <input
              #fileInput
              type="file"
              accept="image/*,application/pdf"
              hidden
              (change)="onReceiptPicked($event)"
            />
            @if (receiptFile(); as file) {
              <p class="mov-receipt__name">
                {{ file.name }}
                <button
                  mat-icon-button
                  type="button"
                  aria-label="Quitar"
                  (click)="receiptFile.set(null)"
                >
                  <mat-icon>close</mat-icon>
                </button>
              </p>
            } @else if (movement?.hasReceiptFile) {
              <p class="mov-receipt__name">{{ movement.receiptFileName || 'Comprobante adjunto' }}</p>
            }
          </div>
        }

        @if (!isEdit) {
          <label class="mov-notify">
            <mat-checkbox formControlName="notifyAdmins"></mat-checkbox>
            <span>
              <strong>Enviar notificación a administradores</strong>
              <small>Aviso en la app y por mail</small>
            </span>
          </label>
        }

        @if (isEdit && !isTransfer) {
          <app-notify-recipients-field
            [shopId]="data.shopId"
            [excludeUserId]="actorId"
            enabledLabel="Avisar de este cambio"
            hint="Elegí a quién. Todos los admins marca a los administradores del local."
            [(enabled)]="notifyEnabled"
            [(selectedIds)]="notifyIds"
          />
        }

        <div class="mov-more">
          <button
            type="button"
            class="mov-more__toggle"
            (click)="showMore.set(!showMore())"
            [attr.aria-expanded]="showMore()"
          >
            <mat-icon>{{ showMore() ? 'expand_less' : 'expand_more' }}</mat-icon>
            <span>{{ showMore() ? 'Menos opciones' : 'Más opciones' }}</span>
            <span class="mov-more__hint">USD, empleado, factura</span>
          </button>

          @if (showMore()) {
            <div class="mov-more__body">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Cotización USD</mat-label>
                <input matInput type="number" min="0" step="0.01" inputmode="decimal" formControlName="usdRate" />
              </mat-form-field>

              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Monto USD</mat-label>
                <input matInput type="number" min="0" step="0.01" inputmode="decimal" formControlName="amountUsd" />
                <mat-hint>Se calcula si dejás vacío y hay cotización</mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Empleado</mat-label>
                <mat-icon matPrefix>badge</mat-icon>
                <mat-select formControlName="employeeId">
                  <mat-option [value]="null">Sin empleado</mat-option>
                  @for (e of data.employees; track e.id) {
                    <mat-option [value]="e.id">{{ e.fullName }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <div class="mov-invoice">
                <mat-slide-toggle formControlName="invoiced">Facturado</mat-slide-toggle>
                @if (form.controls.invoiced.value) {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>N° de factura</mat-label>
                    <input matInput formControlName="invoiceNumber" />
                  </mat-form-field>
                }
              </div>
            </div>
          }
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions class="mov-actions">
      <button
        mat-stroked-button
        type="button"
        class="mov-actions__cancel"
        (click)="ref.close(false)"
        [disabled]="busy()"
      >
        Cancelar
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        class="mov-actions__save"
        [disabled]="form.invalid || busy()"
        (click)="save()"
      >
        <app-busy-label [busy]="busy()" [busyLabel]="isEdit ? 'Guardando…' : 'Creando…'">
          <mat-icon>{{ isEdit ? 'save' : 'add' }}</mat-icon>
          {{ isEdit ? 'Guardar' : 'Crear' }}
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .mov-actions {
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        align-items: stretch !important;
        gap: 0.55rem !important;
        width: 100%;
        margin: 0 !important;
        padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px)) !important;
        border-top: 1px solid var(--guy-border, rgba(15, 23, 42, 0.08));
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 55%, var(--guy-card, #fff));
      }

      .mov-actions__cancel,
      .mov-actions__save {
        flex: 1 1 0;
        min-width: 0;
        min-height: 48px;
        margin: 0 !important;
        border-radius: 12px !important;
      }

      .mov-actions__cancel {
        --mdc-outlined-button-outline-color: color-mix(in srgb, var(--guy-navy, #003366) 28%, transparent);
        font-weight: 600;
      }

      .mov-actions__save {
        font-weight: 700;
        letter-spacing: 0.01em;
        box-shadow: 0 6px 16px color-mix(in srgb, var(--guy-navy, #003366) 22%, transparent);
      }

      .mov-actions__save app-busy-label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
        width: 100%;
      }

      .mov-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        container-type: inline-size;
        container-name: mov-form;
      }

      .mov-transfer {
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      .mov-transfer__arrow {
        display: grid;
        place-items: center;
        height: 1.75rem;
        color: var(--guy-muted, #5f6f76);
      }

      .mov-transfer__arrow mat-icon {
        font-size: 1.15rem;
        width: 1.15rem;
        height: 1.15rem;
        opacity: 0.7;
      }

      .mov-side {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        padding: 0.75rem 0.85rem 0.85rem;
        border-radius: 14px;
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 85%, #fff);
        border: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 80%, transparent);
      }

      .mov-side__head {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        margin-bottom: 0.1rem;
      }

      .mov-side__badge {
        display: grid;
        place-items: center;
        width: 2rem;
        height: 2rem;
        border-radius: 10px;
        flex-shrink: 0;
      }

      .mov-side__badge mat-icon {
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
      }

      .mov-side__badge--from {
        background: color-mix(in srgb, #c62828 12%, transparent);
        color: #c62828;
      }

      .mov-side__badge--to {
        background: color-mix(in srgb, var(--guy-green, #2e7d32) 16%, transparent);
        color: var(--guy-green, #2e7d32);
      }

      .mov-side__titles {
        display: flex;
        flex-direction: column;
        gap: 0.05rem;
        min-width: 0;
      }

      .mov-side__titles strong {
        font-size: 0.92rem;
        font-weight: 700;
        line-height: 1.2;
        color: var(--guy-navy, #003366);
      }

      .mov-side__titles span {
        font-size: 0.75rem;
        color: var(--guy-muted, #5f6f76);
      }

      .mov-side .mat-mdc-form-field {
        width: 100%;
      }

      .mov-amount {
        margin-top: 0.15rem;
      }

      .mov-notify {
        display: flex;
        align-items: flex-start;
        gap: 0.35rem;
        margin: 0.05rem 0 0.1rem;
        cursor: pointer;
      }

      .mov-notify span {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        padding-top: 0.2rem;
      }

      .mov-notify strong {
        font-size: 0.9rem;
        font-weight: 650;
        color: var(--guy-navy, #003366);
      }

      .mov-notify small {
        font-size: 0.75rem;
        color: var(--guy-muted, #5f6f76);
      }

      .mov-more {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        margin-top: 0.15rem;
      }

      .mov-more__toggle {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        width: 100%;
        min-height: 44px;
        padding: 0.45rem 0.65rem;
        border: 1px dashed color-mix(in srgb, var(--guy-border, #d7e0d9) 90%, transparent);
        border-radius: 12px;
        background: transparent;
        color: var(--guy-navy, #003366);
        font: inherit;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
      }

      .mov-more__toggle mat-icon {
        font-size: 1.25rem;
        width: 1.25rem;
        height: 1.25rem;
        color: var(--guy-muted, #5f6f76);
      }

      .mov-more__hint {
        margin-left: auto;
        font-size: 0.72rem;
        font-weight: 500;
        color: var(--guy-muted, #5f6f76);
        white-space: nowrap;
      }

      .mov-more__body {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        padding: 0.15rem 0 0.25rem;
      }

      .mov-invoice {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        padding: 0.35rem 0.15rem 0;
      }

      .mov-receipt {
        display: grid;
        gap: 0.45rem;
      }
      .mov-receipt__label {
        font-size: 0.82rem;
        font-weight: 650;
        color: var(--guy-navy, #003366);
      }
      .mov-receipt__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
      }
      .mov-receipt__name {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        margin: 0;
        font-size: 0.85rem;
        color: var(--guy-navy, #003366);
      }

      @media (max-width: 420px) {
        .mov-more__hint {
          display: none;
        }
      }
    `,
  ],
})
export class MovementDialogComponent {
  readonly data = inject<MovementDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<MovementDialogComponent, boolean | Movement>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(MovementsApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);

  readonly actorId = this.auth.currentUser()?.id ?? null;
  readonly notifyEnabled = signal(false);
  readonly notifyIds = signal<string[]>([]);
  readonly receiptFile = signal<File | null>(null);
  readonly paymentMethods = EXPENSE_PAYMENT_METHOD_OPTIONS;

  readonly isEdit = this.data.mode === 'edit';
  readonly isTransfer = (this.data.kind ?? 'expense') === 'transfer';
  readonly isIncome = (this.data.kind ?? 'expense') === 'income';
  readonly dialogTitle = this.isEdit
    ? this.isTransfer
      ? 'Editar transferencia'
      : this.isIncome
        ? 'Editar ingreso'
        : 'Editar gasto'
    : this.isTransfer
      ? 'Nueva transferencia'
      : this.isIncome
        ? 'Nuevo ingreso'
        : 'Nuevo gasto';
  readonly movement = this.data.mode === 'edit' ? this.data.movement : null;
  readonly busy = signal(false);
  readonly showMore = signal(false);
  readonly accounts = signal<LedgerAccount[]>([...this.data.accounts]);

  private defaultBusinessDate(): string {
    const shop = this.shops.selectedShop();
    return resolveShopCalendarDate(new Date(), {
      timezone: shop?.timezone,
    });
  }

  readonly form = this.fb.nonNullable.group({
    businessDate: [
      toDateInput(this.movement?.businessDate ?? this.defaultBusinessDate()),
      Validators.required,
    ],
    fromAccountId: [this.movement?.fromAccountId ?? '', Validators.required],
    toAccountId: [
      this.movement?.toAccountId ?? '',
      this.isTransfer || this.isIncome ? Validators.required : [],
    ],
    conceptId: this.fb.control<string | null>(
      this.isTransfer ? null : (this.movement?.conceptId ?? null),
      this.isTransfer ? [] : [Validators.required],
    ),
    description: [this.movement?.description ?? ''],
    amountUyu: [this.movement?.amountUyu ?? 0, [Validators.required, Validators.min(0)]],
    usdRate: this.fb.control<number | null>(this.movement?.usdRate ?? null),
    amountUsd: this.fb.control<number | null>(this.movement?.amountUsd ?? null),
    employeeId: this.fb.control<string | null>(this.movement?.employeeId ?? null),
    invoiced: [this.movement?.invoiced ?? false],
    invoiceNumber: [this.movement?.invoiceNumber ?? ''],
    paymentMethod: [
      (this.movement?.paymentMethod ?? '') as ExpensePaymentMethod | '',
      this.isTransfer || this.isIncome ? [] : [Validators.required],
    ],
    notifyAdmins: [true],
  });

  receiptRequired(): boolean {
    if (this.isTransfer || this.isIncome) return false;
    return expenseReceiptRequired(this.form.controls.paymentMethod.value);
  }

  missingReceipt(): boolean {
    if (!this.receiptRequired()) return false;
    return !this.receiptFile() && !this.movement?.hasReceiptFile;
  }

  async onReceiptPicked(ev: Event): Promise<void> {
    const file = await takeInputFile(ev.target as HTMLInputElement);
    if (file) this.receiptFile.set(file);
  }

  constructor() {
    if (
      this.movement &&
      (this.movement.usdRate != null ||
        this.movement.amountUsd != null ||
        this.movement.employeeId ||
        this.movement.invoiced)
    ) {
      this.showMore.set(true);
    }
  }

  private readonly selectableAccounts = computed(() => {
    const selected = new Set(
      [this.movement?.fromAccountId, this.movement?.toAccountId].filter(Boolean) as string[],
    );
    return this.accounts()
      .filter((a) => {
        if (!isMovementAccountType(a.type) && !selected.has(a.id)) return false;
        return a.active !== false || selected.has(a.id);
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  private listedForKind(account: LedgerAccount): boolean {
    return accountListedIn(
      account,
      this.isTransfer ? 'transfers' : this.isIncome ? 'incomes' : 'expenses',
    );
  }

  readonly localAccounts = computed(() =>
    this.selectableAccounts().filter(
      (a) => this.listedForKind(a) && (a.type === 'CHANNEL' || a.type === 'SYSTEM'),
    ),
  );

  readonly otherAccounts = computed(() =>
    this.selectableAccounts().filter(
      (a) => this.listedForKind(a) && a.type !== 'CHANNEL' && a.type !== 'SYSTEM',
    ),
  );

  readonly fromQuery = signal('');
  readonly toQuery = signal('');
  readonly conceptQuery = signal('');
  readonly onSelectSearchOpened = onSelectSearchOpened;

  readonly filteredConcepts = computed(() =>
    filterBySelectQuery(
      this.data.concepts,
      this.conceptQuery(),
      (c) => c.name,
      this.form.controls.conceptId.value,
    ),
  );

  readonly filteredLocalFrom = computed(() =>
    filterBySelectQuery(
      this.localAccounts(),
      this.fromQuery(),
      (a) => this.accountLabel(a),
      this.form.controls.fromAccountId.value,
    ),
  );
  readonly filteredOtherFrom = computed(() =>
    filterBySelectQuery(
      this.otherAccounts(),
      this.fromQuery(),
      (a) => this.accountLabel(a),
      this.form.controls.fromAccountId.value,
    ),
  );
  readonly filteredLocalTo = computed(() =>
    filterBySelectQuery(
      this.localAccounts(),
      this.toQuery(),
      (a) => this.accountLabel(a),
      this.form.controls.toAccountId.value,
    ),
  );
  readonly filteredOtherTo = computed(() =>
    filterBySelectQuery(
      this.otherAccounts(),
      this.toQuery(),
      (a) => this.accountLabel(a),
      this.form.controls.toAccountId.value,
    ),
  );

  accountLabel(account: LedgerAccount): string {
    const names = (account.userIds ?? [])
      .map((id) => this.data.users.find((u) => u.id === id)?.fullName?.trim())
      .filter((name): name is string => !!name);
    if (!names.length) {
      const linked = this.data.users.find((u) =>
        (u.ledgerAccounts ?? []).some((a) => a.id === account.id),
      );
      if (linked?.fullName) names.push(linked.fullName);
    }
    return names.length ? `${account.name} · ${names.join(', ')}` : account.name;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const shopId = this.data.shopId;
    const raw = this.form.getRawValue();
    const fromAccountId = raw.fromAccountId || null;
    const toAccountId = raw.toAccountId || null;
    if (this.isTransfer) {
      if (!fromAccountId || !toAccountId) {
        this.snack.open('Origen y destino son obligatorios', 'OK', { duration: 3500 });
        return;
      }
      if (fromAccountId === toAccountId) {
        this.snack.open('Origen y destino deben ser distintos', 'OK', { duration: 3500 });
        return;
      }
    } else if (!fromAccountId) {
      this.snack.open('Elegí de qué cuenta sale', 'OK', { duration: 3500 });
      return;
    }
    if (this.missingReceipt()) {
      this.snack.open('Con transferencia o tarjeta el comprobante es obligatorio', 'OK', {
        duration: 3500,
      });
      return;
    }
    const kind = this.isTransfer ? 'transfer' : this.isIncome ? 'income' : 'expense';
    const body: Partial<Movement> & {
      notifyAdmins?: boolean;
      notifyUserIds?: string[];
      kind?: 'expense' | 'income' | 'transfer';
    } = {
      businessDate: toDateString(raw.businessDate),
      fromAccountId,
      toAccountId,
      fromUserId: this.userIdForAccount(fromAccountId),
      toUserId: this.userIdForAccount(toAccountId),
      conceptId: this.isTransfer ? null : raw.conceptId,
      description: raw.description.trim() || null,
      amountUyu: parseLocaleNumber(raw.amountUyu),
      usdRate: raw.usdRate,
      amountUsd: raw.amountUsd,
      employeeId: raw.employeeId || null,
      invoiced: raw.invoiced,
      invoiceNumber: raw.invoiced ? raw.invoiceNumber.trim() || null : null,
      kind,
    };
    if (!this.isTransfer) {
      body.paymentMethod = (raw.paymentMethod || null) as ExpensePaymentMethod | null;
    }
    if (!this.isEdit) body.notifyAdmins = !!raw.notifyAdmins;
    if (this.isEdit && !this.isTransfer && this.notifyEnabled() && this.notifyIds().length) {
      body.notifyUserIds = this.notifyIds();
    }
    this.busy.set(true);

    const req =
      this.isEdit && this.movement
        ? this.api.update(shopId, this.movement.id, body)
        : this.api.create(shopId, body);

    req.subscribe({
      next: (saved) => {
        const receipt = this.receiptFile();
        if (!receipt || this.isTransfer) {
          this.finishSave(saved);
          return;
        }
        this.api.uploadReceiptFile(shopId, saved.id, receipt).subscribe({
          next: (withFile) => this.finishSave(withFile),
          error: () => {
            this.finishSave(saved);
            this.snack.open('Se guardó, pero el comprobante no se pudo subir', 'OK', {
              duration: 4000,
            });
          },
        });
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'Error al guardar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  private finishSave(saved: Movement): void {
    this.busy.set(false);
    if (this.isEdit) {
      this.snack.open(
        this.isTransfer
          ? 'Transferencia actualizada'
          : this.isIncome
            ? 'Ingreso actualizado'
            : 'Gasto actualizado',
        'OK',
        { duration: 2500 },
      );
      this.ref.close(true);
      return;
    }
    this.ref.close(saved);
  }

  private userIdForAccount(accountId: string | null): string | null {
    if (!accountId) return null;
    const account = this.accounts().find((a) => a.id === accountId);
    if (!account || account.type === 'CHANNEL' || account.type === 'SYSTEM') return null;
    if (account.userIds?.[0]) return account.userIds[0];
    return (
      this.data.users.find((u) => (u.ledgerAccounts ?? []).some((a) => a.id === accountId))?.id ??
      null
    );
  }
}
