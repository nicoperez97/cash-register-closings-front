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
import { forkJoin, Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { Employee, EmployeeType, EmployeesApiService, ShopUserOption } from './employees-api.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';

export type ProducerOption = {
  id: string;
  fullName: string;
  supervisorEmployeeId?: string | null;
};

export type EmployeeDialogData = {
  shopId: string;
  shopName: string;
  users: ShopUserOption[];
  /** Productores del local (excluye al editado en opciones de UI). */
  producers: ProducerOption[];
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
    BusyLabelComponent,
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
          <input matInput type="number" min="0" inputmode="decimal" formControlName="baseSalary" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Tipo</mat-label>
          <mat-icon matPrefix>badge</mat-icon>
          <mat-select formControlName="type">
            <mat-option value="FIXED">Fijo</mat-option>
            <mat-option value="ROTATING">Rotativo</mat-option>
          </mat-select>
          <mat-hint>Los rotativos no se marcan con “Todos presentes”</mat-hint>
        </mat-form-field>

        <mat-slide-toggle formControlName="producesFood">
          Produce comida (asistencia en producción)
        </mat-slide-toggle>

        @if (form.controls.producesFood.value) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Su supervisor</mat-label>
            <mat-icon matPrefix>supervisor_account</mat-icon>
            <mat-select formControlName="supervisorEmployeeId">
              <mat-option [value]="null">Sin supervisor</mat-option>
              @for (p of peerOptions(); track p.id) {
                <mat-option [value]="p.id">{{ p.fullName }}</mat-option>
              }
            </mat-select>
            <mat-hint>Quién puede cargar las horas de este productor</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Productores a cargo</mat-label>
            <mat-icon matPrefix>group</mat-icon>
            <mat-select formControlName="supervisedIds" multiple>
              @for (p of peerOptions(); track p.id) {
                <mat-option [value]="p.id">{{ p.fullName }}</mat-option>
              }
            </mat-select>
            <mat-hint>Podés elegir varios; este productor cargará sus horas</mat-hint>
          </mat-form-field>
        }

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Usuario vinculado (opcional)</mat-label>
          <mat-icon matPrefix>person</mat-icon>
          <mat-select formControlName="userId">
            <mat-option [value]="null">Sin vincular</mat-option>
            @for (u of data.users; track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
          <mat-hint>
            Para que cargue sus horas: vincular usuario + preset “Productor” en Usuarios
          </mat-hint>
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
        <app-busy-label [busy]="busy()" [busyLabel]="isEdit ? 'Guardando…' : 'Creando…'">
          <mat-icon>{{ isEdit ? 'save' : 'add' }}</mat-icon>
          {{ isEdit ? 'Guardar cambios' : 'Crear' }}
        </app-busy-label>
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

  private readonly initialSupervisedIds = this.employee
    ? (this.data.producers ?? [])
        .filter((p) => p.supervisorEmployeeId === this.employee!.id)
        .map((p) => p.id)
    : [];

  readonly form = this.fb.nonNullable.group({
    fullName: [this.employee?.fullName ?? '', Validators.required],
    baseSalary: [this.employee?.baseSalary ?? 0, [Validators.required, Validators.min(0)]],
    type: this.fb.nonNullable.control<EmployeeType>(this.employee?.type ?? 'FIXED'),
    producesFood: [this.employee?.producesFood ?? false],
    supervisorEmployeeId: this.fb.control<string | null>(
      this.employee?.supervisorEmployeeId ?? null,
    ),
    supervisedIds: this.fb.nonNullable.control<string[]>([...this.initialSupervisedIds]),
    userId: this.fb.control<string | null>(this.employee?.userId ?? null),
    hireDate: this.fb.control<Date | null>(toDateInput(this.employee?.hireDate)),
    notes: [this.employee?.notes ?? ''],
    active: [this.employee?.active ?? true],
  });

  peerOptions(): ProducerOption[] {
    const selfId = this.employee?.id;
    return (this.data.producers ?? []).filter((p) => p.id !== selfId);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const shopId = this.data.shopId;
    const raw = this.form.getRawValue();
    const producesFood = !!raw.producesFood;
    const body: Partial<Employee> = {
      fullName: raw.fullName.trim(),
      baseSalary: raw.baseSalary,
      type: raw.type,
      producesFood,
      supervisorEmployeeId: producesFood ? raw.supervisorEmployeeId || null : null,
      userId: raw.userId || null,
      hireDate: toDateString(raw.hireDate),
      notes: raw.notes.trim() || null,
    };
    this.busy.set(true);

    const saveEmp$: Observable<Employee> =
      this.isEdit && this.employee
        ? this.api.update(shopId, this.employee.id, { ...body, active: raw.active })
        : this.api.create(shopId, body);

    const desiredSupervised = producesFood ? raw.supervisedIds : [];

    saveEmp$
      .pipe(
        switchMap((saved) => {
          const patches = this.buildSupervisedPatches(
            shopId,
            saved.id,
            this.initialSupervisedIds,
            desiredSupervised,
          );
          if (!patches.length) return of(saved);
          return forkJoin(patches).pipe(switchMap(() => of(saved)));
        }),
      )
      .subscribe({
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

  private buildSupervisedPatches(
    shopId: string,
    supervisorId: string,
    previousIds: string[],
    desiredIds: string[],
  ): Observable<Employee>[] {
    const prev = new Set(previousIds);
    const next = new Set(desiredIds);
    const patches: Observable<Employee>[] = [];
    for (const id of next) {
      if (!prev.has(id) && id !== supervisorId) {
        patches.push(this.api.update(shopId, id, { supervisorEmployeeId: supervisorId }));
      }
    }
    for (const id of prev) {
      if (!next.has(id)) {
        patches.push(this.api.update(shopId, id, { supervisorEmployeeId: null }));
      }
    }
    return patches;
  }
}
