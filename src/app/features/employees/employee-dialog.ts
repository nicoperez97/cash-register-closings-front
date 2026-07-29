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
import { Employee, EmployeesApiService, ShopUserOption } from './employees-api.service';

export type EmployeeDialogData = {
  shopId: string;
  shopName: string;
  users: ShopUserOption[];
} & ({ mode: 'create' } | { mode: 'edit'; employee: Employee });

function toDateInput(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDateString(value: Date | null): string | null {
  if (!value) return null;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-employee-dialog',
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
        <mat-icon>{{ isEdit ? 'edit' : 'badge' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar empleado' : 'Nuevo empleado' }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre completo</mat-label>
          <mat-icon matPrefix>badge</mat-icon>
          <input matInput formControlName="fullName" autocomplete="name" />
          @if (form.controls.fullName.touched && form.controls.fullName.hasError('required')) {
            <mat-error>Ingresá un nombre</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Sueldo base</mat-label>
          <mat-icon matPrefix>payments</mat-icon>
          <input matInput type="number" min="0" formControlName="baseSalary" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Usuario vinculado (opcional)</mat-label>
          <mat-icon matPrefix>person</mat-icon>
          <mat-select formControlName="userId">
            <mat-option [value]="null">Sin vincular</mat-option>
            @for (u of data.users; track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Fecha de ingreso</mat-label>
          <mat-icon matPrefix>event</mat-icon>
          <input matInput [matDatepicker]="hirePicker" formControlName="hireDate" />
          <mat-datepicker-toggle matIconSuffix [for]="hirePicker" />
          <mat-datepicker #hirePicker />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Notas</mat-label>
          <mat-icon matPrefix>notes</mat-icon>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>

          @if (isEdit) {
          <mat-slide-toggle formControlName="active">Empleado visible</mat-slide-toggle>
        }
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
})
export class EmployeeDialogComponent {
  readonly data = inject<EmployeeDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<EmployeeDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(EmployeesApiService);
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = this.data.mode === 'edit';
  private readonly employee = this.data.mode === 'edit' ? this.data.employee : null;
  readonly busy = signal(false);

  readonly form = this.fb.nonNullable.group({
    fullName: [this.employee?.fullName ?? '', Validators.required],
    baseSalary: [this.employee?.baseSalary ?? 0, [Validators.required, Validators.min(0)]],
    userId: this.fb.control<string | null>(this.employee?.userId ?? null),
    hireDate: this.fb.control<Date | null>(toDateInput(this.employee?.hireDate)),
    notes: [this.employee?.notes ?? ''],
    active: [this.employee?.active ?? true],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const shopId = this.data.shopId;
    const raw = this.form.getRawValue();
    const body: Partial<Employee> = {
      fullName: raw.fullName.trim(),
      baseSalary: raw.baseSalary,
      userId: raw.userId || null,
      hireDate: toDateString(raw.hireDate),
      notes: raw.notes.trim() || null,
    };
    this.busy.set(true);

    const req =
      this.isEdit && this.employee
        ? this.api.update(shopId, this.employee.id, { ...body, active: raw.active })
        : this.api.create(shopId, body);

    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open(this.isEdit ? 'Empleado actualizado' : 'Empleado creado', 'OK', {
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
