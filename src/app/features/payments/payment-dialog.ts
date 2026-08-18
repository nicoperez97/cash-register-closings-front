import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import {
  PaymentsApiService,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_PRIORITY_OPTIONS,
  PaymentMethod,
  PaymentPriority,
  PaymentStatus,
  ShopPayment,
} from './payments-api.service';
import { PAYMENT_STATUS_OPTIONS } from './payments-display.util';
import { PaymentFilePreviewDialogComponent } from './payment-file-preview-dialog';
import { ShopSupplier, SuppliersApiService } from '../suppliers/suppliers-api.service';
import { ShopService, ServicesApiService } from '../services/services-api.service';
import { Employee } from '../employees/employees-api.service';
import { takeInputFile } from '../../shared/utils/input-file';
import { Observable, catchError, concatMap, from, map, of, switchMap } from 'rxjs';

export type PaymentDialogKind = 'supplier' | 'employee' | 'service';

export type PaymentDialogData = {
  shopId: string;
  shopName: string;
  users: Array<{ id: string; fullName: string }>;
  /** Cuentas con las que se puede pagar (no proveedores / servicios / sistema). */
  accounts: Array<{ id: string; name: string }>;
  suppliers: ShopSupplier[];
  services: ShopService[];
  employees: Employee[];
  canManageSuppliers: boolean;
  canManageServices: boolean;
  /** Determina si se pide proveedor, servicio o empleado. */
  kind: PaymentDialogKind;
} & (
  | { mode: 'create'; prefill?: Partial<ShopPayment> | null }
  | { mode: 'duplicate'; payment: ShopPayment }
  | { mode: 'edit'; payment: ShopPayment }
);

type PaymentDraft = {
  values: Record<string, unknown>;
  invoiceFile: File | null;
  invoiceExpanded: boolean;
  newSupplierName: string;
  newSupplierAlias: string;
  newServiceName: string;
  newServiceAlias: string;
};

@Component({
  selector: 'app-payment-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatIconModule,
    MatSnackBarModule,
    MatExpansionModule,
    BusyLabelComponent,
  ],
  styles: [
    `
      .supplier-create {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 0.5rem;
        align-items: start;
        margin: -0.25rem 0 0.75rem;
      }
      .supplier-create button {
        margin-top: 0.35rem;
      }
      .invoice-panel {
        margin: 0.25rem 0 0.5rem;
        border: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 90%, transparent);
        border-radius: 12px;
        overflow: hidden;
      }
      .invoice-panel ::ng-deep .mat-expansion-panel-header {
        padding: 0 1rem;
      }
      .invoice-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        margin-bottom: 0.75rem;
      }
      .invoice-file-name {
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
      }
      .invoice-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem;
      }
      .invoice-grid .full {
        grid-column: 1 / -1;
      }
      @media (max-width: 560px) {
        .supplier-create,
        .invoice-grid {
          grid-template-columns: 1fr;
        }
        .invoice-grid .full {
          grid-column: auto;
        }
      }
      .prio-field {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin: 0.1rem 0 0.15rem;
      }
      .prio-field__label {
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--guy-muted, #5f6f76);
      }
      .prio-field__btns {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.45rem;
      }
      .prio-btn {
        min-height: 40px;
        border-radius: 999px !important;
        font-weight: 700 !important;
      }
      .prio-btn--high.prio-btn--on {
        background: color-mix(in srgb, #c62828 16%, #fff);
        border-color: #c62828;
        color: #c62828;
      }
      .prio-btn--medium.prio-btn--on {
        background: color-mix(in srgb, #ef6c00 16%, #fff);
        border-color: #e65100;
        color: #e65100;
      }
      .prio-btn--low.prio-btn--on {
        background: color-mix(in srgb, #1565c0 16%, #fff);
        border-color: #1565c0;
        color: #1565c0;
      }
      .pay-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin: 0 0 0.85rem;
      }
      .pay-tab {
        min-height: 36px;
        border-radius: 999px !important;
        font-weight: 700 !important;
      }
      .pay-tab--on {
        background: color-mix(in srgb, var(--guy-accent, #3d5a40) 14%, #fff);
      }
      .pay-tab__x {
        margin-left: 0.15rem;
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .pay-add-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin: 0.15rem 0 0.35rem;
      }
    `,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ titleIcon }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ titleText }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      @if (!isEdit && drafts().length > 1) {
        <div class="pay-tabs">
          @for (d of drafts(); track $index) {
            <button
              mat-stroked-button
              type="button"
              class="pay-tab"
              [class.pay-tab--on]="$index === activeDraft()"
              [disabled]="busy()"
              (click)="selectDraft($index)"
            >
              Pago {{ $index + 1 }}
              @if (drafts().length > 1) {
                <mat-icon class="pay-tab__x" (click)="removeDraft($index, $event)">close</mat-icon>
              }
            </button>
          }
        </div>
      }

      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Concepto</mat-label>
          <input matInput formControlName="title" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Monto</mat-label>
          <input matInput type="number" min="0" step="0.01" inputmode="decimal" formControlName="amount" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Fecha tentativa</mat-label>
          <input matInput [matDatepicker]="duePicker" formControlName="dueDate" />
          <mat-datepicker-toggle matIconSuffix [for]="duePicker" />
          <mat-datepicker #duePicker />
        </mat-form-field>

        <div class="prio-field">
          <span class="prio-field__label">Prioridad</span>
          <div class="prio-field__btns">
            @for (opt of paymentPriorities; track opt.value) {
              <button
                mat-stroked-button
                type="button"
                class="prio-btn"
                [class.prio-btn--on]="form.controls.priority.value === opt.value"
                [class.prio-btn--high]="opt.value === 'high'"
                [class.prio-btn--medium]="opt.value === 'medium'"
                [class.prio-btn--low]="opt.value === 'low'"
                (click)="setPriority(opt.value)"
              >
                {{ opt.label }}
              </button>
            }
          </div>
        </div>

        @if (!isEdit) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Estado</mat-label>
            <mat-select formControlName="status">
              @for (opt of statusOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        @if (isPaidEdit || isPaidStatus()) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Fecha de pago</mat-label>
            <input matInput [matDatepicker]="paidPicker" formControlName="paidAt" />
            <mat-datepicker-toggle matIconSuffix [for]="paidPicker" />
            <mat-datepicker #paidPicker />
            @if (isPaidEdit) {
              <mat-hint>Actualiza también el movimiento contable</mat-hint>
            } @else {
              <mat-hint>Si está vacía, usa la fecha de hoy</mat-hint>
            }
          </mat-form-field>
        }

        @if (isSupplierKind) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Proveedor</mat-label>
            <mat-select formControlName="supplierId" (selectionChange)="onSupplierChange($event.value)">
              <mat-option [value]="null">Sin proveedor</mat-option>
              @for (s of suppliers(); track s.id) {
                <mat-option [value]="s.id">
                  {{ s.name }}
                  @if (s.bankAlias) {
                    · {{ s.bankAlias }}
                  }
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          @if (data.canManageSuppliers) {
            <div class="supplier-create">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Nuevo proveedor</mat-label>
                <input matInput [formControl]="newSupplierName" placeholder="Nombre" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Alias / CBU</mat-label>
                <input matInput [formControl]="newSupplierAlias" placeholder="Opcional" />
              </mat-form-field>
              <button
                mat-stroked-button
                type="button"
                [disabled]="!newSupplierName.value.trim() || creatingSupplier()"
                (click)="createSupplier()"
              >
                <mat-icon>add</mat-icon>
                Crear
              </button>
            </div>
          }
        } @else if (isServiceKind) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Servicio</mat-label>
            <mat-select formControlName="serviceId" (selectionChange)="onServiceChange($event.value)">
              <mat-option [value]="null">Sin servicio</mat-option>
              @for (s of services(); track s.id) {
                <mat-option [value]="s.id">
                  {{ s.name }}
                  @if (s.bankAlias) {
                    · {{ s.bankAlias }}
                  }
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          @if (data.canManageServices) {
            <div class="supplier-create">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Nuevo servicio</mat-label>
                <input matInput [formControl]="newServiceName" placeholder="Nombre" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Alias / CBU</mat-label>
                <input matInput [formControl]="newServiceAlias" placeholder="Opcional" />
              </mat-form-field>
              <button
                mat-stroked-button
                type="button"
                [disabled]="!newServiceName.value.trim() || creatingService()"
                (click)="createService()"
              >
                <mat-icon>add</mat-icon>
                Crear
              </button>
            </div>
          }
        } @else {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Empleado</mat-label>
            <mat-select formControlName="employeeId">
              <mat-option [value]="null">Sin empleado</mat-option>
              @for (e of data.employees; track e.id) {
                <mat-option [value]="e.id">{{ e.fullName }}</mat-option>
              }
            </mat-select>
            <mat-hint>A quién corresponde este pago interno</mat-hint>
          </mat-form-field>
        }

        @if (isBilledKind) {
          <mat-accordion class="invoice-panel">
            <mat-expansion-panel [expanded]="invoiceExpanded()">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <mat-icon style="margin-right: 0.35rem">receipt_long</mat-icon>
                  Datos de facturación
                </mat-panel-title>
                <mat-panel-description>
                  @if (form.controls.invoiceNumber.value) {
                    {{ form.controls.invoiceType.value || '' }}
                    {{ form.controls.invoiceNumber.value }}
                  } @else {
                    Opcional · PDF o foto
                  }
                </mat-panel-description>
              </mat-expansion-panel-header>

              <div class="invoice-actions">
                <input
                  #invoiceInput
                  type="file"
                  accept="application/pdf,image/*"
                  hidden
                  (change)="onInvoicePicked($event)"
                />
                <button
                  mat-stroked-button
                  type="button"
                  [disabled]="parsingInvoice()"
                  (click)="invoiceInput.click()"
                >
                  <mat-icon>upload_file</mat-icon>
                  {{ parsingInvoice() ? 'Leyendo…' : 'Cargar factura (PDF/foto)' }}
                </button>
                @if (pendingInvoiceFile()) {
                  <span class="invoice-file-name">{{ pendingInvoiceFile()!.name }}</span>
                } @else if (existingInvoiceName()) {
                  <span class="invoice-file-name">Adjunto: {{ existingInvoiceName() }}</span>
                  @if (payment) {
                    <button mat-stroked-button type="button" (click)="viewExistingInvoice()">
                      <mat-icon>visibility</mat-icon>
                      Ver
                    </button>
                  }
                }
              </div>

              <div class="invoice-grid">
                <mat-form-field class="full" appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Razón social</mat-label>
                  <input matInput formControlName="invoiceLegalName" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>CUIT</mat-label>
                  <input matInput formControlName="invoiceTaxId" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Tipo de factura</mat-label>
                  <input matInput formControlName="invoiceType" placeholder="A / B / C" />
                </mat-form-field>
                <mat-form-field class="full" appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Número de factura</mat-label>
                  <input matInput formControlName="invoiceNumber" placeholder="0009-00035900" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Monto neto</mat-label>
                  <input
                    matInput
                    type="number"
                    min="0"
                    step="0.01"
                    inputmode="decimal"
                    formControlName="invoiceNetAmount"
                  />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>IVA</mat-label>
                  <input
                    matInput
                    type="number"
                    min="0"
                    step="0.01"
                    inputmode="decimal"
                    formControlName="invoiceIvaAmount"
                  />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Percepciones</mat-label>
                  <input
                    matInput
                    type="number"
                    min="0"
                    step="0.01"
                    inputmode="decimal"
                    formControlName="invoicePerceptionsAmount"
                  />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Otros impuestos</mat-label>
                  <input
                    matInput
                    type="number"
                    min="0"
                    step="0.01"
                    inputmode="decimal"
                    formControlName="invoiceOtherTaxesAmount"
                  />
                </mat-form-field>
              </div>
            </mat-expansion-panel>
          </mat-accordion>
        }

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Quién debería pagar</mat-label>
          <mat-select formControlName="payerUserId">
            <mat-option [value]="null">Sin asignar</mat-option>
            @for (u of data.users; track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Quién debería validar</mat-label>
          <mat-select formControlName="validatorUserId">
            <mat-option [value]="null">Sin asignar</mat-option>
            @for (u of data.users; track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Cuenta que paga</mat-label>
          <mat-select formControlName="accountId">
            <mat-option [value]="null">Sin asignar</mat-option>
            @for (a of data.accounts; track a.id) {
              <mat-option [value]="a.id">{{ a.name }}</mat-option>
            }
          </mat-select>
          <mat-hint>Cuenta desde la que sale el dinero (egreso)</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Forma de pago</mat-label>
          <mat-select formControlName="paymentMethod">
            <mat-option [value]="null">Sin asignar</mat-option>
            @for (opt of paymentMethods; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Notas</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>

        @if (!isEdit) {
          <div class="pay-add-row">
            <button mat-stroked-button type="button" [disabled]="busy() || parsingInvoice()" (click)="duplicateActive()">
              <mat-icon>content_copy</mat-icon>
              Duplicar este
            </button>
            <button mat-stroked-button type="button" [disabled]="busy() || parsingInvoice()" (click)="addBlank()">
              <mat-icon>add</mat-icon>
              Agregar otro
            </button>
          </div>
        }
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="busy() || parsingInvoice()"
        (click)="save()"
      >
        <app-busy-label [busy]="busy()" busyLabel="Guardando…">
          <mat-icon>save</mat-icon>
          {{ isEdit ? 'Guardar' : saveLabel }}
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
})
export class PaymentDialogComponent {
  readonly data = inject<PaymentDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<PaymentDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(PaymentsApiService);
  private readonly suppliersApi = inject(SuppliersApiService);
  private readonly servicesApi = inject(ServicesApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly isEdit = this.data.mode === 'edit';
  readonly isDuplicate = this.data.mode === 'duplicate';
  readonly isSupplierKind = this.data.kind === 'supplier';
  readonly isServiceKind = this.data.kind === 'service';
  readonly isBilledKind = this.isSupplierKind || this.isServiceKind;
  readonly isPaidEdit =
    this.data.mode === 'edit' && this.data.payment.status === 'PAID';
  readonly paymentMethods = PAYMENT_METHOD_OPTIONS;
  readonly paymentPriorities = PAYMENT_PRIORITY_OPTIONS;

  setPriority(value: PaymentPriority): void {
    const current = this.form.controls.priority.value;
    this.form.controls.priority.setValue(current === value ? null : value);
  }
  readonly seed: Partial<ShopPayment> | null =
    this.data.mode === 'edit' || this.data.mode === 'duplicate'
      ? this.data.payment
      : (this.data.prefill ?? null);
  readonly payment = this.data.mode === 'edit' ? this.data.payment : null;

  readonly titleIcon = this.isEdit ? 'edit' : this.isDuplicate ? 'content_copy' : 'payments';
  get titleText(): string {
    if (this.isEdit) return this.isPaidEdit ? 'Editar pago abonado' : 'Editar pago';
    if (this.drafts().length > 1) return 'Nuevos pagos';
    return this.isDuplicate ? 'Duplicar pago' : 'Nuevo pago';
  }
  get saveLabel(): string {
    const n = this.drafts().length;
    if (n > 1) return `Crear ${n} pagos`;
    return this.isDuplicate ? 'Duplicar' : 'Crear';
  }

  readonly busy = signal(false);
  readonly creatingSupplier = signal(false);
  readonly creatingService = signal(false);
  readonly parsingInvoice = signal(false);
  readonly invoiceExpanded = signal(
    !!(
      this.seed?.invoiceNumber ||
      this.seed?.invoiceLegalName ||
      this.seed?.hasInvoiceFile
    ),
  );
  readonly pendingInvoiceFile = signal<File | null>(null);
  readonly existingInvoiceName = signal<string | null>(
    this.isEdit && this.seed?.hasInvoiceFile ? (this.seed.invoiceFileName ?? 'factura') : null,
  );
  readonly suppliers = signal<ShopSupplier[]>([...this.data.suppliers]);
  readonly services = signal<ShopService[]>([...(this.data.services ?? [])]);
  readonly newSupplierName = this.fb.nonNullable.control('');
  readonly newSupplierAlias = this.fb.nonNullable.control('');
  readonly newServiceName = this.fb.nonNullable.control('');
  readonly newServiceAlias = this.fb.nonNullable.control('');

  private parseDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (!m) return new Date(value);
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  private toIsoDate(value: Date | string | null): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10) || null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private numOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  readonly form = this.fb.group({
    title: [this.seed?.title ?? ''],
    amount: [this.seed?.amount ?? (null as number | null)],
    dueDate: [this.parseDate(this.seed?.dueDate) as Date | null],
    paidAt: [this.parseDate(this.seed?.paidAt) as Date | null],
    status: [
      this.isEdit
        ? ((this.seed?.status ?? 'PENDING_VALIDATION') as PaymentStatus)
        : ('PENDING_VALIDATION' as PaymentStatus),
    ],
    priority: [this.seed?.priority ?? (null as PaymentPriority | null)],
    supplierId: [
      this.isSupplierKind ? (this.seed?.supplierId ?? null) : (null as string | null),
    ],
    serviceId: [
      this.isServiceKind ? (this.seed?.serviceId ?? null) : (null as string | null),
    ],
    employeeId: [
      !this.isBilledKind ? (this.seed?.employeeId ?? null) : (null as string | null),
    ],
    payerUserId: [this.seed?.payerUserId ?? (null as string | null)],
    validatorUserId: [this.seed?.validatorUserId ?? (null as string | null)],
    accountId: [this.seed?.accountId ?? (null as string | null)],
    paymentMethod: [this.seed?.paymentMethod ?? (null as PaymentMethod | null)],
    notes: [this.seed?.notes ?? ''],
    invoiceLegalName: [this.seed?.invoiceLegalName ?? ''],
    invoiceTaxId: [this.seed?.invoiceTaxId ?? ''],
    invoiceType: [this.seed?.invoiceType ?? ''],
    invoiceNumber: [this.seed?.invoiceNumber ?? ''],
    invoiceNetAmount: [this.seed?.invoiceNetAmount ?? (null as number | null)],
    invoiceIvaAmount: [this.seed?.invoiceIvaAmount ?? (null as number | null)],
    invoicePerceptionsAmount: [
      this.seed?.invoicePerceptionsAmount ?? (null as number | null),
    ],
    invoiceOtherTaxesAmount: [this.seed?.invoiceOtherTaxesAmount ?? (null as number | null)],
  });

  readonly statusOptions = PAYMENT_STATUS_OPTIONS;
  readonly activeDraft = signal(0);
  readonly drafts = signal<PaymentDraft[]>([this.snapshot()]);

  isPaidStatus(): boolean {
    return !this.isEdit && this.form.controls.status.value === 'PAID';
  }

  private snapshot(): PaymentDraft {
    return {
      values: { ...this.form.getRawValue() },
      invoiceFile: this.pendingInvoiceFile(),
      invoiceExpanded: this.invoiceExpanded(),
      newSupplierName: this.newSupplierName.value,
      newSupplierAlias: this.newSupplierAlias.value,
      newServiceName: this.newServiceName.value,
      newServiceAlias: this.newServiceAlias.value,
    };
  }

  private restore(draft: PaymentDraft): void {
    this.form.reset(draft.values, { emitEvent: false });
    this.pendingInvoiceFile.set(draft.invoiceFile);
    this.invoiceExpanded.set(draft.invoiceExpanded);
    this.newSupplierName.setValue(draft.newSupplierName, { emitEvent: false });
    this.newSupplierAlias.setValue(draft.newSupplierAlias, { emitEvent: false });
    this.newServiceName.setValue(draft.newServiceName, { emitEvent: false });
    this.newServiceAlias.setValue(draft.newServiceAlias, { emitEvent: false });
  }

  private persistActive(): void {
    const list = this.drafts().slice();
    list[this.activeDraft()] = this.snapshot();
    this.drafts.set(list);
  }

  private blankDraft(): PaymentDraft {
    return {
      values: {
        title: '',
        amount: null,
        dueDate: null,
        paidAt: null,
        status: 'PENDING_VALIDATION',
        priority: null,
        supplierId: null,
        serviceId: null,
        employeeId: null,
        payerUserId: null,
        validatorUserId: null,
        accountId: null,
        paymentMethod: null,
        notes: '',
        invoiceLegalName: '',
        invoiceTaxId: '',
        invoiceType: '',
        invoiceNumber: '',
        invoiceNetAmount: null,
        invoiceIvaAmount: null,
        invoicePerceptionsAmount: null,
        invoiceOtherTaxesAmount: null,
      },
      invoiceFile: null,
      invoiceExpanded: false,
      newSupplierName: '',
      newSupplierAlias: '',
      newServiceName: '',
      newServiceAlias: '',
    };
  }

  selectDraft(index: number): void {
    if (index === this.activeDraft() || this.busy()) return;
    this.persistActive();
    this.activeDraft.set(index);
    this.restore(this.drafts()[index]);
  }

  removeDraft(index: number, ev?: Event): void {
    ev?.preventDefault();
    ev?.stopPropagation();
    if (this.drafts().length <= 1 || this.busy()) return;
    this.persistActive();
    const list = this.drafts().filter((_, i) => i !== index);
    let next = this.activeDraft();
    if (index === next) next = Math.min(index, list.length - 1);
    else if (index < next) next -= 1;
    this.drafts.set(list);
    this.activeDraft.set(next);
    this.restore(list[next]);
  }

  duplicateActive(): void {
    if (this.busy()) return;
    this.persistActive();
    const copy = this.snapshot();
    const list = [...this.drafts(), copy];
    this.drafts.set(list);
    this.activeDraft.set(list.length - 1);
    this.restore(copy);
  }

  addBlank(): void {
    if (this.busy()) return;
    this.persistActive();
    const list = [...this.drafts(), this.blankDraft()];
    this.drafts.set(list);
    this.activeDraft.set(list.length - 1);
    this.restore(list[list.length - 1]);
  }

  private dropCreatedPrefix(count: number): void {
    const rest = this.drafts().slice(count);
    const list = rest.length ? rest : [this.blankDraft()];
    this.drafts.set(list);
    this.activeDraft.set(0);
    this.restore(list[0]);
  }

  onSupplierChange(supplierId: string | null): void {
    if (!supplierId) return;
    const s = this.suppliers().find((x) => x.id === supplierId);
    if (!s) return;
    if (!this.form.controls.invoiceLegalName.value && s.legalName) {
      this.form.controls.invoiceLegalName.setValue(s.legalName);
    }
    if (!this.form.controls.invoiceTaxId.value && s.taxId) {
      this.form.controls.invoiceTaxId.setValue(s.taxId);
    }
  }

  onServiceChange(serviceId: string | null): void {
    if (!serviceId) return;
    const s = this.services().find((x) => x.id === serviceId);
    if (!s) return;
    if (!this.form.controls.invoiceLegalName.value && s.legalName) {
      this.form.controls.invoiceLegalName.setValue(s.legalName);
    }
    if (!this.form.controls.invoiceTaxId.value && s.taxId) {
      this.form.controls.invoiceTaxId.setValue(s.taxId);
    }
  }

  private normalizeTaxId(v: string | null | undefined): string {
    return (v ?? '').replace(/\D/g, '');
  }

  private normalizeName(v: string | null | undefined): string {
    return (v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(s\.?\s*r\.?\s*l\.?|s\.?\s*a\.?\s*s\.?|s\.?\s*a\.?)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
    const na = this.normalizeName(a);
    const nb = this.normalizeName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    // Coincide si uno contiene al otro (mín. 6 caracteres para evitar falsos positivos)
    if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) {
      return true;
    }
    return false;
  }

  private findSupplierMatch(legalName: string | null, taxId: string | null): ShopSupplier | null {
    const taxDigits = this.normalizeTaxId(taxId);
    if (taxDigits.length === 11) {
      const byTax = this.suppliers().find(
        (s) => this.normalizeTaxId(s.taxId) === taxDigits,
      );
      if (byTax) return byTax;
    }

    const candidates = this.suppliers().filter(
      (s) =>
        this.namesMatch(s.name, legalName) || this.namesMatch(s.legalName, legalName),
    );
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const exact = candidates.find(
        (s) =>
          this.normalizeName(s.name) === this.normalizeName(legalName) ||
          this.normalizeName(s.legalName) === this.normalizeName(legalName),
      );
      return exact ?? candidates[0];
    }
    return null;
  }

  /** Selecciona proveedor existente por CUIT/razón social, o sugiere crear uno nuevo. */
  private suggestNewSupplierFromInvoice(legalName: string | null, taxId: string | null): boolean {
    const match = this.findSupplierMatch(legalName, taxId);
    if (match) {
      const currentId = this.form.controls.supplierId.value;
      this.form.controls.supplierId.setValue(match.id);
      this.newSupplierName.setValue('');
      if (!this.form.controls.invoiceLegalName.value && (match.legalName || match.name)) {
        this.form.controls.invoiceLegalName.setValue(match.legalName || match.name);
      }
      if (!this.form.controls.invoiceTaxId.value && match.taxId) {
        this.form.controls.invoiceTaxId.setValue(match.taxId);
      }
      if (currentId !== match.id) {
        this.snack.open(`Proveedor seleccionado: ${match.name}`, 'OK', { duration: 2800 });
      } else {
        this.snack.open('Datos de factura cargados', 'OK', { duration: 2500 });
      }
      return true;
    }

    if (!this.form.controls.supplierId.value) {
      const name = (legalName ?? '').trim();
      if (name && !this.newSupplierName.value.trim()) {
        this.newSupplierName.setValue(name);
      }
    }
    return false;
  }

  private findServiceMatch(legalName: string | null, taxId: string | null): ShopService | null {
    const taxDigits = this.normalizeTaxId(taxId);
    if (taxDigits.length === 11) {
      const byTax = this.services().find((s) => this.normalizeTaxId(s.taxId) === taxDigits);
      if (byTax) return byTax;
    }

    const candidates = this.services().filter(
      (s) =>
        this.namesMatch(s.name, legalName) || this.namesMatch(s.legalName, legalName),
    );
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const exact = candidates.find(
        (s) =>
          this.normalizeName(s.name) === this.normalizeName(legalName) ||
          this.normalizeName(s.legalName) === this.normalizeName(legalName),
      );
      return exact ?? candidates[0];
    }
    return null;
  }

  private suggestNewServiceFromInvoice(legalName: string | null, taxId: string | null): boolean {
    const match = this.findServiceMatch(legalName, taxId);
    if (match) {
      const currentId = this.form.controls.serviceId.value;
      this.form.controls.serviceId.setValue(match.id);
      this.newServiceName.setValue('');
      if (!this.form.controls.invoiceLegalName.value && (match.legalName || match.name)) {
        this.form.controls.invoiceLegalName.setValue(match.legalName || match.name);
      }
      if (!this.form.controls.invoiceTaxId.value && match.taxId) {
        this.form.controls.invoiceTaxId.setValue(match.taxId);
      }
      if (currentId !== match.id) {
        this.snack.open(`Servicio seleccionado: ${match.name}`, 'OK', { duration: 2800 });
      } else {
        this.snack.open('Datos de factura cargados', 'OK', { duration: 2500 });
      }
      return true;
    }

    if (!this.form.controls.serviceId.value) {
      const name = (legalName ?? '').trim();
      if (name && !this.newServiceName.value.trim()) {
        this.newServiceName.setValue(name);
      }
    }
    return false;
  }

  async onInvoicePicked(ev: Event): Promise<void> {
    const file = await takeInputFile(ev.target as HTMLInputElement);
    if (!file) {
      this.snack.open('No se pudo leer el archivo. Probá de nuevo.', 'OK', { duration: 3500 });
      return;
    }
    this.pendingInvoiceFile.set(file);
    this.invoiceExpanded.set(true);
    this.parsingInvoice.set(true);
    this.api.parseInvoice(this.data.shopId, file).subscribe({
      next: (parsed) => {
        this.parsingInvoice.set(false);
        if (parsed.legalName) this.form.controls.invoiceLegalName.setValue(parsed.legalName);
        if (parsed.taxId) this.form.controls.invoiceTaxId.setValue(parsed.taxId);
        if (parsed.invoiceType) this.form.controls.invoiceType.setValue(parsed.invoiceType);
        if (parsed.invoiceNumber) this.form.controls.invoiceNumber.setValue(parsed.invoiceNumber);
        if (parsed.netAmount != null) this.form.controls.invoiceNetAmount.setValue(parsed.netAmount);
        if (parsed.ivaAmount != null) this.form.controls.invoiceIvaAmount.setValue(parsed.ivaAmount);
        if (parsed.perceptionsAmount != null) {
          this.form.controls.invoicePerceptionsAmount.setValue(parsed.perceptionsAmount);
        }
        if (parsed.otherTaxesAmount != null) {
          this.form.controls.invoiceOtherTaxesAmount.setValue(parsed.otherTaxesAmount);
        }
        if (parsed.totalAmount != null && !this.form.controls.amount.value) {
          this.form.controls.amount.setValue(parsed.totalAmount);
        }
        const matched = this.isServiceKind
          ? this.suggestNewServiceFromInvoice(parsed.legalName, parsed.taxId)
          : this.suggestNewSupplierFromInvoice(parsed.legalName, parsed.taxId);
        if (!matched) {
          this.snack.open('Datos de factura cargados', 'OK', { duration: 2500 });
        }
      },
      error: (err) => {
        this.parsingInvoice.set(false);
        const msg = err?.error?.message ?? 'No se pudo leer la factura';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }

  viewExistingInvoice(): void {
    if (!this.payment) return;
    this.api.downloadInvoiceFile(this.data.shopId, this.payment.id).subscribe({
      next: (blob) => {
        this.dialog.open(PaymentFilePreviewDialogComponent, {
          width: '920px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          panelClass: 'guy-dialog',
          data: {
            title: 'Factura',
            fileName: this.existingInvoiceName() || 'factura.pdf',
            blob,
          },
        });
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo abrir la factura';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  createSupplier(): void {
    const name = this.newSupplierName.value.trim();
    if (!name || this.creatingSupplier()) return;
    this.creatingSupplier.set(true);
    this.ensureSupplierCreated$(name).subscribe({
      next: () => {
        this.creatingSupplier.set(false);
        this.newSupplierName.setValue('');
        this.newSupplierAlias.setValue('');
        this.snack.open('Proveedor creado', 'OK', { duration: 2000 });
      },
      error: (err) => {
        this.creatingSupplier.set(false);
        const msg = err?.error?.message ?? 'No se pudo crear el proveedor';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  createService(): void {
    const name = this.newServiceName.value.trim();
    if (!name || this.creatingService()) return;
    this.creatingService.set(true);
    this.ensureServiceCreated$(name).subscribe({
      next: () => {
        this.creatingService.set(false);
        this.newServiceName.setValue('');
        this.newServiceAlias.setValue('');
        this.snack.open('Servicio creado', 'OK', { duration: 2000 });
      },
      error: (err) => {
        this.creatingService.set(false);
        const msg = err?.error?.message ?? 'No se pudo crear el servicio';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  private ensureSupplierCreated$(name: string): Observable<string> {
    const legalName =
      (this.form.controls.invoiceLegalName.value ?? '').trim() || name;
    const taxId = (this.form.controls.invoiceTaxId.value ?? '').trim() || null;
    const match = this.findSupplierMatch(legalName, taxId) ?? this.findSupplierMatch(name, taxId);
    if (match) {
      this.form.controls.supplierId.setValue(match.id);
      return of(match.id);
    }
    return this.suppliersApi
      .create(this.data.shopId, {
        name,
        legalName: legalName || null,
        taxId,
        bankAlias: this.newSupplierAlias.value.trim() || null,
      })
      .pipe(
        switchMap((row) => {
          this.suppliers.update((list) =>
            [...list, row].sort((a, b) => a.name.localeCompare(b.name)),
          );
          this.form.controls.supplierId.setValue(row.id);
          return of(row.id);
        }),
      );
  }

  /** Crea el proveedor desde el nombre sugerido si aún no hay uno seleccionado. */
  private resolveSupplierId$(): Observable<string | null> {
    if (!this.isSupplierKind) return of(null);
    const current = this.form.controls.supplierId.value || null;
    if (current) return of(current);
    if (!this.data.canManageSuppliers) return of(null);

    const fromField = this.newSupplierName.value.trim();
    const fromInvoice = (this.form.controls.invoiceLegalName.value ?? '').trim();
    const name = fromField || fromInvoice;
    if (!name) return of(null);
    return this.ensureSupplierCreated$(name);
  }

  private ensureServiceCreated$(name: string): Observable<string> {
    const legalName =
      (this.form.controls.invoiceLegalName.value ?? '').trim() || name;
    const taxId = (this.form.controls.invoiceTaxId.value ?? '').trim() || null;
    const match = this.findServiceMatch(legalName, taxId) ?? this.findServiceMatch(name, taxId);
    if (match) {
      this.form.controls.serviceId.setValue(match.id);
      return of(match.id);
    }
    return this.servicesApi
      .create(this.data.shopId, {
        name,
        legalName: legalName || null,
        taxId,
        bankAlias: this.newServiceAlias.value.trim() || null,
      })
      .pipe(
        switchMap((row) => {
          this.services.update((list) =>
            [...list, row].sort((a, b) => a.name.localeCompare(b.name)),
          );
          this.form.controls.serviceId.setValue(row.id);
          return of(row.id);
        }),
      );
  }

  private resolveServiceId$(): Observable<string | null> {
    if (!this.isServiceKind) return of(null);
    const current = this.form.controls.serviceId.value || null;
    if (current) return of(current);
    if (!this.data.canManageServices) return of(null);

    const fromField = this.newServiceName.value.trim();
    const fromInvoice = (this.form.controls.invoiceLegalName.value ?? '').trim();
    const name = fromField || fromInvoice;
    if (!name) return of(null);
    return this.ensureServiceCreated$(name);
  }

  private resolveParty$(): Observable<{
    supplierId: string | null;
    serviceId: string | null;
    employeeId: string | null;
  }> {
    if (this.isSupplierKind) {
      return this.resolveSupplierId$().pipe(
        map((supplierId) => ({
          supplierId,
          serviceId: null,
          employeeId: null,
        })),
      );
    }
    if (this.isServiceKind) {
      return this.resolveServiceId$().pipe(
        map((serviceId) => ({
          supplierId: null,
          serviceId,
          employeeId: null,
        })),
      );
    }
    return of({
      supplierId: null,
      serviceId: null,
      employeeId: this.form.controls.employeeId.value || null,
    });
  }

  private invoiceBody() {
    const raw = this.form.getRawValue();
    return {
      invoiceLegalName: (raw.invoiceLegalName ?? '').trim() || null,
      invoiceTaxId: (raw.invoiceTaxId ?? '').trim() || null,
      invoiceType: (raw.invoiceType ?? '').trim() || null,
      invoiceNumber: (raw.invoiceNumber ?? '').trim() || null,
      invoiceNetAmount: this.numOrNull(raw.invoiceNetAmount),
      invoiceIvaAmount: this.numOrNull(raw.invoiceIvaAmount),
      invoicePerceptionsAmount: this.numOrNull(raw.invoicePerceptionsAmount),
      invoiceOtherTaxesAmount: this.numOrNull(raw.invoiceOtherTaxesAmount),
    };
  }

  save(): void {
    if (!this.isEdit) {
      this.saveBatch();
      return;
    }
    const raw = this.form.getRawValue();
    const amountRaw = raw.amount;
    const amount =
      amountRaw === null || amountRaw === undefined || (amountRaw as any) === ''
        ? null
        : Number(amountRaw);
    if (this.isPaidEdit && (!(amount != null && amount > 0) || !raw.accountId || !raw.paymentMethod)) {
      this.snack.open(
        !raw.accountId
          ? 'Indicá la cuenta que paga'
          : !raw.paymentMethod
            ? 'Indicá la forma de pago'
            : 'Un pago abonado necesita un monto mayor a 0',
        'OK',
        { duration: 3500 },
      );
      return;
    }

    const invoice = this.isBilledKind
      ? this.invoiceBody()
      : {
          invoiceLegalName: null,
          invoiceTaxId: null,
          invoiceType: null,
          invoiceNumber: null,
          invoiceNetAmount: null,
          invoiceIvaAmount: null,
          invoicePerceptionsAmount: null,
          invoiceOtherTaxesAmount: null,
        };

    this.busy.set(true);

    this.resolveParty$()
      .pipe(
        switchMap((party) => {
          const next = {
            title: (raw.title ?? '').trim() || null,
            amount,
            dueDate: this.toIsoDate(raw.dueDate),
            paidAt: this.isPaidEdit ? this.toIsoDate(raw.paidAt) : null,
            priority: (raw.priority as PaymentPriority | null) || null,
            supplierId: party.supplierId,
            serviceId: party.serviceId,
            employeeId: party.employeeId,
            payerUserId: raw.payerUserId || null,
            validatorUserId: raw.validatorUserId || null,
            accountId: raw.accountId ? String(raw.accountId) : null,
            paymentMethod: (raw.paymentMethod as PaymentMethod | null) || null,
            notes: (raw.notes ?? '').trim() || null,
            ...invoice,
          };

          if (this.isEdit && this.payment) {
            const prev = this.payment;
            const sameAmount = (a: number | null, b: number | null) =>
              (a == null && b == null) || (a != null && b != null && Number(a) === Number(b));
            const sameStr = (a: string | null | undefined, b: string | null | undefined) =>
              (a || null) === (b || null);

            const body: Record<string, string | number | null> = {};
            if (!sameStr(next.title, prev.title)) body['title'] = next.title;
            if (!sameAmount(next.amount, prev.amount ?? null)) body['amount'] = next.amount;
            if (!sameStr(next.dueDate, prev.dueDate)) body['dueDate'] = next.dueDate;
            if (!sameStr(next.priority, prev.priority)) body['priority'] = next.priority;
            if (this.isPaidEdit && next.paidAt && !sameStr(next.paidAt, prev.paidAt)) {
              body['paidAt'] = next.paidAt;
            }
            if (this.isSupplierKind && !sameStr(next.supplierId, prev.supplierId)) {
              body['supplierId'] = next.supplierId;
            }
            if (this.isServiceKind && !sameStr(next.serviceId, prev.serviceId)) {
              body['serviceId'] = next.serviceId;
            }
            if (!this.isBilledKind && !sameStr(next.employeeId, prev.employeeId)) {
              body['employeeId'] = next.employeeId;
            }
            if (!sameStr(next.payerUserId, prev.payerUserId)) body['payerUserId'] = next.payerUserId;
            if (!sameStr(next.validatorUserId, prev.validatorUserId)) {
              body['validatorUserId'] = next.validatorUserId;
            }
            if (!sameStr(next.accountId, prev.accountId)) body['accountId'] = next.accountId;
            if (!sameStr(next.paymentMethod, prev.paymentMethod)) {
              body['paymentMethod'] = next.paymentMethod;
            }
            if (!sameStr(next.notes, prev.notes)) body['notes'] = next.notes;
            if (this.isBilledKind) {
              if (!sameStr(next.invoiceLegalName, prev.invoiceLegalName)) {
                body['invoiceLegalName'] = next.invoiceLegalName;
              }
              if (!sameStr(next.invoiceTaxId, prev.invoiceTaxId)) {
                body['invoiceTaxId'] = next.invoiceTaxId;
              }
              if (!sameStr(next.invoiceType, prev.invoiceType)) {
                body['invoiceType'] = next.invoiceType;
              }
              if (!sameStr(next.invoiceNumber, prev.invoiceNumber)) {
                body['invoiceNumber'] = next.invoiceNumber;
              }
              if (!sameAmount(next.invoiceNetAmount, prev.invoiceNetAmount ?? null)) {
                body['invoiceNetAmount'] = next.invoiceNetAmount;
              }
              if (!sameAmount(next.invoiceIvaAmount, prev.invoiceIvaAmount ?? null)) {
                body['invoiceIvaAmount'] = next.invoiceIvaAmount;
              }
              if (
                !sameAmount(next.invoicePerceptionsAmount, prev.invoicePerceptionsAmount ?? null)
              ) {
                body['invoicePerceptionsAmount'] = next.invoicePerceptionsAmount;
              }
              if (
                !sameAmount(next.invoiceOtherTaxesAmount, prev.invoiceOtherTaxesAmount ?? null)
              ) {
                body['invoiceOtherTaxesAmount'] = next.invoiceOtherTaxesAmount;
              }
            }

            const hasFile = !!this.pendingInvoiceFile();
            if (!Object.keys(body).length && !hasFile) {
              return of({ kind: 'noop' as const });
            }

            const req$ = Object.keys(body).length
              ? this.api.update(this.data.shopId, this.payment.id, body)
              : of(this.payment);

            return req$.pipe(
              switchMap((saved) => {
                const file = this.pendingInvoiceFile();
                if (!file || !this.isBilledKind) {
                  return of({ kind: 'updated' as const, saved, invoiceOk: true });
                }
                return this.api.uploadInvoiceFile(this.data.shopId, saved.id, file, false).pipe(
                  map((s) => ({ kind: 'updated' as const, saved: s, invoiceOk: true })),
                  catchError(() =>
                    of({ kind: 'updated' as const, saved, invoiceOk: false }),
                  ),
                );
              }),
            );
          }

          return of({ kind: 'noop' as const });
        }),
      )
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          if (result.kind === 'noop') {
            this.snack.open('Sin cambios', 'OK', { duration: 2000 });
            this.ref.close(false);
            return;
          }
          if (this.isSupplierKind && this.newSupplierName.value.trim()) {
            this.newSupplierName.setValue('');
            this.newSupplierAlias.setValue('');
          }
          if (this.isServiceKind && this.newServiceName.value.trim()) {
            this.newServiceName.setValue('');
            this.newServiceAlias.setValue('');
          }
          const msg =
            result.invoiceOk === false
              ? 'Pago actualizado, pero no se pudo subir la factura. Volvé a adjuntarla desde el listado.'
              : 'Pago actualizado';
          this.snack.open(msg, 'OK', {
            duration: result.invoiceOk === false ? 5500 : 2500,
          });
          this.ref.close(true);
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
        },
      });
  }

  private paidError(raw: {
    amount?: unknown;
    accountId?: unknown;
    paymentMethod?: unknown;
  }): string | null {
    const amountRaw = raw.amount;
    const amount =
      amountRaw === null || amountRaw === undefined || amountRaw === ''
        ? null
        : Number(amountRaw);
    if (!(amount != null && amount > 0) || !raw.accountId || !raw.paymentMethod) {
      return !raw.accountId
        ? 'Indicá la cuenta que paga'
        : !raw.paymentMethod
          ? 'Indicá la forma de pago'
          : 'Un pago abonado necesita un monto mayor a 0';
    }
    return null;
  }

  private saveBatch(): void {
    this.persistActive();
    const list = this.drafts();
    for (let i = 0; i < list.length; i++) {
      const raw = list[i].values as {
        status?: PaymentStatus;
        amount?: unknown;
        accountId?: unknown;
        paymentMethod?: unknown;
      };
      if (raw.status === 'PAID') {
        const msg = this.paidError(raw);
        if (msg) {
          this.activeDraft.set(i);
          this.restore(list[i]);
          this.snack.open(`Pago ${i + 1}: ${msg}`, 'OK', { duration: 3500 });
          return;
        }
      }
    }

    this.busy.set(true);
    let created = 0;
    let invoiceFail = 0;
    from(list.map((_, i) => i))
      .pipe(
        concatMap((i) => {
          this.restore(this.drafts()[i]);
          this.activeDraft.set(i);
          return this.createCurrent$();
        }),
      )
      .subscribe({
        next: (result) => {
          created += 1;
          if (!result.invoiceOk) invoiceFail += 1;
        },
        error: (err) => {
          this.busy.set(false);
          this.dropCreatedPrefix(created);
          const msg = err?.error?.message ?? 'No se pudo guardar';
          const prefix = created
            ? `Se crearon ${created} pago${created === 1 ? '' : 's'}. El siguiente falló: `
            : '';
          this.snack.open(`${prefix}${Array.isArray(msg) ? msg.join(', ') : msg}`, 'OK', {
            duration: 5000,
          });
        },
        complete: () => {
          this.busy.set(false);
          const n = created;
          const msg = invoiceFail
            ? `${n === 1 ? 'Pago creado' : `${n} pagos creados`}, pero no se pudo subir alguna factura.`
            : n === 1
              ? this.isDuplicate
                ? 'Pago duplicado'
                : 'Pago creado'
              : `${n} pagos creados`;
          this.snack.open(msg, 'OK', { duration: invoiceFail ? 5500 : 2500 });
          this.ref.close(true);
        },
      });
  }

  private createCurrent$() {
    const raw = this.form.getRawValue();
    const amountRaw = raw.amount;
    const amount =
      amountRaw === null || amountRaw === undefined || (amountRaw as any) === ''
        ? null
        : Number(amountRaw);
    const invoice = this.isBilledKind
      ? this.invoiceBody()
      : {
          invoiceLegalName: null,
          invoiceTaxId: null,
          invoiceType: null,
          invoiceNumber: null,
          invoiceNetAmount: null,
          invoiceIvaAmount: null,
          invoicePerceptionsAmount: null,
          invoiceOtherTaxesAmount: null,
        };
    const status = (raw.status as PaymentStatus) || 'PENDING_VALIDATION';
    return this.resolveParty$().pipe(
      switchMap((party) =>
        this.api
          .create(this.data.shopId, {
            title: (raw.title ?? '').trim() || null,
            amount,
            dueDate: this.toIsoDate(raw.dueDate),
            paidAt: status === 'PAID' ? this.toIsoDate(raw.paidAt) : null,
            status,
            priority: (raw.priority as PaymentPriority | null) || null,
            supplierId: party.supplierId,
            serviceId: party.serviceId,
            employeeId: party.employeeId,
            payerUserId: raw.payerUserId || null,
            validatorUserId: raw.validatorUserId || null,
            accountId: raw.accountId ? String(raw.accountId) : null,
            paymentMethod: (raw.paymentMethod as PaymentMethod | null) || null,
            notes: (raw.notes ?? '').trim() || null,
            ...invoice,
          })
          .pipe(
            switchMap((created) => {
              const file = this.pendingInvoiceFile();
              if (!file || !this.isBilledKind) {
                return of({ invoiceOk: true as const });
              }
              return this.api.uploadInvoiceFile(this.data.shopId, created.id, file, false).pipe(
                map(() => ({ invoiceOk: true as const })),
                catchError(() => of({ invoiceOk: false as const })),
              );
            }),
          ),
      ),
    );
  }
}
