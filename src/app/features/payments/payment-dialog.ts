import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { PaymentsApiService, ShopPayment } from './payments-api.service';
import { ShopSupplier, SuppliersApiService } from '../suppliers/suppliers-api.service';
import { Employee } from '../employees/employees-api.service';

export type PaymentDialogKind = 'supplier' | 'employee';

export type PaymentDialogData = {
  shopId: string;
  shopName: string;
  users: Array<{ id: string; fullName: string }>;
  /** Cuentas con las que se puede pagar (no proveedores / sistema). */
  accounts: Array<{ id: string; name: string }>;
  suppliers: ShopSupplier[];
  employees: Employee[];
  canManageSuppliers: boolean;
  /** Determina si se pide proveedor o empleado. */
  kind: PaymentDialogKind;
} & (
  | { mode: 'create'; prefill?: Partial<ShopPayment> | null }
  | { mode: 'duplicate'; payment: ShopPayment }
  | { mode: 'edit'; payment: ShopPayment }
);

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
      @media (max-width: 560px) {
        .supplier-create {
          grid-template-columns: 1fr;
        }
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

        @if (isPaidEdit) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Fecha de pago</mat-label>
            <input matInput [matDatepicker]="paidPicker" formControlName="paidAt" />
            <mat-datepicker-toggle matIconSuffix [for]="paidPicker" />
            <mat-datepicker #paidPicker />
            <mat-hint>Actualiza también el movimiento contable</mat-hint>
          </mat-form-field>
        }

        @if (isSupplierKind) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Proveedor</mat-label>
            <mat-select formControlName="supplierId">
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
          <mat-label>Notas</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="busy()"
        (click)="save()"
      >
        <app-busy-label [busy]="busy()" busyLabel="Guardando…">
          <mat-icon>save</mat-icon>
          {{ isEdit ? 'Guardar' : isDuplicate ? 'Duplicar' : 'Crear' }}
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
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = this.data.mode === 'edit';
  readonly isDuplicate = this.data.mode === 'duplicate';
  readonly isSupplierKind = this.data.kind !== 'employee';
  readonly isPaidEdit =
    this.data.mode === 'edit' && this.data.payment.status === 'PAID';
  readonly seed: Partial<ShopPayment> | null =
    this.data.mode === 'edit' || this.data.mode === 'duplicate'
      ? this.data.payment
      : (this.data.prefill ?? null);
  readonly payment = this.data.mode === 'edit' ? this.data.payment : null;

  readonly titleIcon = this.isEdit ? 'edit' : this.isDuplicate ? 'content_copy' : 'payments';
  readonly titleText = this.isEdit
    ? this.isPaidEdit
      ? 'Editar pago abonado'
      : 'Editar pago'
    : this.isDuplicate
      ? 'Duplicar pago'
      : 'Nuevo pago';

  readonly busy = signal(false);
  readonly creatingSupplier = signal(false);
  readonly suppliers = signal<ShopSupplier[]>([...this.data.suppliers]);
  readonly newSupplierName = this.fb.nonNullable.control('');
  readonly newSupplierAlias = this.fb.nonNullable.control('');

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

  readonly form = this.fb.group({
    title: [this.seed?.title ?? ''],
    amount: [this.seed?.amount ?? (null as number | null)],
    dueDate: [this.parseDate(this.seed?.dueDate) as Date | null],
    paidAt: [this.parseDate(this.seed?.paidAt) as Date | null],
    supplierId: [
      this.isSupplierKind ? (this.seed?.supplierId ?? null) : (null as string | null),
    ],
    employeeId: [
      !this.isSupplierKind ? (this.seed?.employeeId ?? null) : (null as string | null),
    ],
    payerUserId: [this.seed?.payerUserId ?? (null as string | null)],
    validatorUserId: [this.seed?.validatorUserId ?? (null as string | null)],
    accountId: [this.seed?.accountId ?? (null as string | null)],
    notes: [this.seed?.notes ?? ''],
  });

  createSupplier(): void {
    const name = this.newSupplierName.value.trim();
    if (!name || this.creatingSupplier()) return;
    this.creatingSupplier.set(true);
    this.suppliersApi
      .create(this.data.shopId, {
        name,
        bankAlias: this.newSupplierAlias.value.trim() || null,
      })
      .subscribe({
        next: (row) => {
          this.creatingSupplier.set(false);
          this.suppliers.update((list) =>
            [...list, row].sort((a, b) => a.name.localeCompare(b.name)),
          );
          this.form.controls.supplierId.setValue(row.id);
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

  save(): void {
    const raw = this.form.getRawValue();
    const amountRaw = raw.amount;
    const amount =
      amountRaw === null || amountRaw === undefined || (amountRaw as any) === ''
        ? null
        : Number(amountRaw);
    const body = {
      title: (raw.title ?? '').trim() || null,
      amount,
      dueDate: this.toIsoDate(raw.dueDate),
      ...(this.isPaidEdit ? { paidAt: this.toIsoDate(raw.paidAt) } : {}),
      supplierId: this.isSupplierKind ? raw.supplierId || null : null,
      employeeId: this.isSupplierKind ? null : raw.employeeId || null,
      payerUserId: raw.payerUserId || null,
      validatorUserId: raw.validatorUserId || null,
      accountId: raw.accountId || null,
      notes: (raw.notes ?? '').trim() || null,
    };
    this.busy.set(true);
    const req =
      this.isEdit && this.payment
        ? this.api.update(this.data.shopId, this.payment.id, body)
        : this.api.create(this.data.shopId, body);
    req.subscribe({
      next: () => {
        this.busy.set(false);
        const wasValidated = this.isEdit && this.payment?.status === 'VALIDATED';
        this.snack.open(
          wasValidated
            ? 'Pago actualizado · vuelve a pendiente de validación'
            : this.isEdit
              ? this.isPaidEdit
                ? 'Pago abonado actualizado'
                : 'Pago actualizado'
              : this.isDuplicate
                ? 'Pago duplicado'
                : 'Pago creado',
          'OK',
          { duration: 3200 },
        );
        this.ref.close(true);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'No se pudo guardar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }
}
