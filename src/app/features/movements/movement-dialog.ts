import { Component, inject, signal } from '@angular/core';
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
import { Concept, LedgerAccount, Movement, MovementsApiService } from './movements-api.service';

export interface MovementEmployeeOption {
  id: string;
  fullName: string;
}

export type MovementDialogData = {
  shopId: string;
  shopName: string;
  accounts: LedgerAccount[];
  concepts: Concept[];
  employees: MovementEmployeeOption[];
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
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'swap_horiz' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar movimiento' : 'Nuevo movimiento' }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Fecha</mat-label>
          <mat-icon matPrefix>event</mat-icon>
          <input matInput [matDatepicker]="datePicker" formControlName="businessDate" />
          <mat-datepicker-toggle matIconSuffix [for]="datePicker" />
          <mat-datepicker #datePicker />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Cuenta origen</mat-label>
          <mat-icon matPrefix>call_made</mat-icon>
          <mat-select formControlName="fromAccountId">
            @for (a of data.accounts; track a.id) {
              <mat-option [value]="a.id">{{ a.name }}</mat-option>
            }
          </mat-select>
          @if (form.controls.fromAccountId.touched && form.controls.fromAccountId.hasError('required')) {
            <mat-error>Elegí una cuenta origen</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Cuenta destino</mat-label>
          <mat-icon matPrefix>call_received</mat-icon>
          <mat-select formControlName="toAccountId">
            @for (a of data.accounts; track a.id) {
              <mat-option [value]="a.id">{{ a.name }}</mat-option>
            }
          </mat-select>
          @if (form.controls.toAccountId.touched && form.controls.toAccountId.hasError('required')) {
            <mat-error>Elegí una cuenta destino</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Concepto</mat-label>
          <mat-icon matPrefix>sell</mat-icon>
          <mat-select formControlName="conceptId">
            <mat-option [value]="null">Sin concepto</mat-option>
            @for (c of data.concepts; track c.id) {
              <mat-option [value]="c.id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="guy-dialog__span-2">
          <mat-label>Descripción</mat-label>
          <mat-icon matPrefix>notes</mat-icon>
          <input matInput formControlName="description" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Monto (UYU)</mat-label>
          <mat-icon matPrefix>attach_money</mat-icon>
          <input matInput type="number" min="0" formControlName="amountUyu" />
          @if (form.controls.amountUyu.touched && form.controls.amountUyu.hasError('required')) {
            <mat-error>Ingresá un monto</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Cotización USD (opcional)</mat-label>
          <input matInput type="number" min="0" step="0.01" formControlName="usdRate" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Monto USD (opcional)</mat-label>
          <input matInput type="number" min="0" step="0.01" formControlName="amountUsd" />
          <mat-hint>Se calcula solo si dejás este campo vacío y cargás la cotización</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Empleado (opcional)</mat-label>
          <mat-icon matPrefix>badge</mat-icon>
          <mat-select formControlName="employeeId">
            <mat-option [value]="null">Sin empleado</mat-option>
            @for (e of data.employees; track e.id) {
              <mat-option [value]="e.id">{{ e.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <div class="guy-dialog__span-2 d-flex align-items-center gap-3 flex-wrap">
          <mat-slide-toggle formControlName="invoiced">Facturado</mat-slide-toggle>
          @if (form.controls.invoiced.value) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1;min-width:180px">
              <mat-label>N° de factura</mat-label>
              <input matInput formControlName="invoiceNumber" />
            </mat-form-field>
          }
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">
        Cancelar
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="form.invalid || busy()"
        (click)="save()"
      >
        <mat-icon>{{ isEdit ? 'save' : 'add' }}</mat-icon>
        {{ isEdit ? 'Guardar cambios' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .guy-dialog__span-2 {
        grid-column: 1 / -1;
      }
    `,
  ],
})
export class MovementDialogComponent {
  readonly data = inject<MovementDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<MovementDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(MovementsApiService);
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = this.data.mode === 'edit';
  private readonly movement = this.data.mode === 'edit' ? this.data.movement : null;
  readonly busy = signal(false);

  readonly form = this.fb.nonNullable.group({
    businessDate: [toDateInput(this.movement?.businessDate), Validators.required],
    fromAccountId: [this.movement?.fromAccountId ?? '', Validators.required],
    toAccountId: [this.movement?.toAccountId ?? '', Validators.required],
    conceptId: this.fb.control<string | null>(this.movement?.conceptId ?? null),
    description: [this.movement?.description ?? ''],
    amountUyu: [this.movement?.amountUyu ?? 0, [Validators.required, Validators.min(0)]],
    usdRate: this.fb.control<number | null>(this.movement?.usdRate ?? null),
    amountUsd: this.fb.control<number | null>(this.movement?.amountUsd ?? null),
    employeeId: this.fb.control<string | null>(this.movement?.employeeId ?? null),
    invoiced: [this.movement?.invoiced ?? false],
    invoiceNumber: [this.movement?.invoiceNumber ?? ''],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const shopId = this.data.shopId;
    const raw = this.form.getRawValue();
    const body: Partial<Movement> = {
      businessDate: toDateString(raw.businessDate),
      fromAccountId: raw.fromAccountId,
      toAccountId: raw.toAccountId,
      conceptId: raw.conceptId || null,
      description: raw.description.trim() || null,
      amountUyu: raw.amountUyu,
      usdRate: raw.usdRate,
      amountUsd: raw.amountUsd,
      employeeId: raw.employeeId || null,
      invoiced: raw.invoiced,
      invoiceNumber: raw.invoiced ? raw.invoiceNumber.trim() || null : null,
    };
    this.busy.set(true);

    const req =
      this.isEdit && this.movement
        ? this.api.update(shopId, this.movement.id, body)
        : this.api.create(shopId, body);

    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open(this.isEdit ? 'Movimiento actualizado' : 'Movimiento creado', 'OK', {
          duration: 2500,
        });
        this.ref.close(true);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'Error al guardar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }
}
