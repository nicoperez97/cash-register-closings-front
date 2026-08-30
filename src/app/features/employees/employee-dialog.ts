import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { catchError, forkJoin, Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { Employee, EmployeeType, EmployeesApiService, ShopUserOption } from './employees-api.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { isUserVisible } from '../../shared/user-visibility';

export type ProducerOption = {
  id: string;
  fullName: string;
  supervisorEmployeeId?: string | null;
};

export type EmployeeDialogData = {
  shopId: string;
  shopName: string;
  /** Seed opcional; el diálogo vuelve a cargar al abrir. */
  users?: ShopUserOption[];
  /** Productores del local (excluye al editado en opciones de UI). */
  producers?: ProducerOption[];
  serviceAttendanceWithHours: boolean;
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
    MatProgressSpinnerModule,
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

    @if (loadingLists()) {
      <mat-dialog-content class="emp-dlg__loading">
        <mat-spinner diameter="36" />
        <p>Cargando usuarios y productores…</p>
      </mat-dialog-content>
    } @else if (listsFailed()) {
      <mat-dialog-content>
        <p class="emp-dlg__empty">No se pudieron cargar usuarios o productores. Probá de nuevo.</p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="ref.close(false)">Cancelar</button>
        <button mat-flat-button color="primary" type="button" (click)="reloadLists()">
          <mat-icon>refresh</mat-icon>
          Reintentar
        </button>
      </mat-dialog-actions>
    } @else {
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

          @if (data.serviceAttendanceWithHours) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Precio por hora extra</mat-label>
              <mat-icon matPrefix>schedule</mat-icon>
              <input
                matInput
                type="number"
                min="0"
                inputmode="decimal"
                formControlName="overtimeHourRate"
              />
              <mat-hint>Costo de horas extra de servicio (no cambia la liquidación)</mat-hint>
            </mat-form-field>

            <div class="emp-shift">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Entrada de servicio</mat-label>
                <mat-icon matPrefix>login</mat-icon>
                <input matInput type="time" formControlName="serviceCheckIn" />
                <mat-hint>Vacío = horario default del local</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Retirada de servicio</mat-label>
                <mat-icon matPrefix>logout</mat-icon>
                <input matInput type="time" formControlName="serviceCheckOut" />
              </mat-form-field>
            </div>
          }

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

            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Alias o CBU (reintegros)</mat-label>
              <mat-icon matPrefix>account_balance</mat-icon>
              <input matInput formControlName="bankAlias" maxlength="120" />
              <mat-hint>El productor también puede cargarlo desde Mis reintegros</mat-hint>
            </mat-form-field>
          }

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Usuario vinculado (opcional)</mat-label>
            <mat-icon matPrefix>person</mat-icon>
            <mat-select formControlName="userId">
              <mat-option [value]="null">Sin vincular</mat-option>
              @for (u of users(); track u.id) {
                <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
              }
            </mat-select>
            <mat-hint>
              Para que cargue horas y reintegros: vincular usuario + preset “Productor” en Usuarios
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
    }
  `,
  styles: `
    .emp-dlg__loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      padding: 1.5rem 1rem;
      text-align: center;
      color: var(--guy-muted, #5f6f76);
    }
    .emp-dlg__empty {
      margin: 0;
      color: var(--guy-muted, #5f6f76);
    }
    .emp-shift {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    @media (max-width: 520px) {
      .emp-shift {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class EmployeeDialogComponent implements OnInit {
  readonly data = inject<EmployeeDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<EmployeeDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(EmployeesApiService);
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = this.data.mode === 'edit';
  private readonly employee = this.data.mode === 'edit' ? this.data.employee : null;
  readonly busy = signal(false);
  readonly loadingLists = signal(true);
  readonly listsFailed = signal(false);
  readonly users = signal<ShopUserOption[]>(this.data.users ?? []);
  readonly producers = signal<ProducerOption[]>(this.data.producers ?? []);

  private initialSupervisedIds: string[] = this.employee
    ? (this.data.producers ?? [])
        .filter((p) => p.supervisorEmployeeId === this.employee!.id)
        .map((p) => p.id)
    : [];

  readonly form = this.fb.nonNullable.group({
    fullName: [this.employee?.fullName ?? '', Validators.required],
    baseSalary: [this.employee?.baseSalary ?? 0, [Validators.required, Validators.min(0)]],
    overtimeHourRate: [this.employee?.overtimeHourRate ?? 0, [Validators.min(0)]],
    serviceCheckIn: [this.employee?.serviceCheckIn ?? ''],
    serviceCheckOut: [this.employee?.serviceCheckOut ?? ''],
    type: this.fb.nonNullable.control<EmployeeType>(this.employee?.type ?? 'FIXED'),
    producesFood: [this.employee?.producesFood ?? false],
    supervisorEmployeeId: this.fb.control<string | null>(
      this.employee?.supervisorEmployeeId ?? null,
    ),
    supervisedIds: this.fb.nonNullable.control<string[]>([...this.initialSupervisedIds]),
    userId: this.fb.control<string | null>(this.employee?.userId ?? null),
    hireDate: this.fb.control<Date | null>(toDateInput(this.employee?.hireDate)),
    notes: [this.employee?.notes ?? ''],
    bankAlias: [this.employee?.bankAlias ?? ''],
    active: [this.employee?.active ?? true],
  });

  ngOnInit(): void {
    this.reloadLists();
  }

  reloadLists(): void {
    const shopId = this.data.shopId;
    if (!shopId) {
      this.loadingLists.set(false);
      this.listsFailed.set(true);
      return;
    }
    this.loadingLists.set(true);
    this.listsFailed.set(false);
    const linkedUserId = this.employee?.userId ?? null;
    forkJoin({
      users: this.api.shopUsers(shopId).pipe(catchError(() => of(null))),
      employees: this.api.list(shopId, true).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ users, employees }) => {
        this.loadingLists.set(false);
        if (!users || !employees) {
          this.listsFailed.set(true);
          if (users) {
            this.users.set(
              users.filter((u) => isUserVisible(u, 'employeeLink') || u.id === linkedUserId),
            );
          }
          if (employees) this.applyProducers(employees);
          return;
        }
        this.users.set(
          users.filter((u) => isUserVisible(u, 'employeeLink') || u.id === linkedUserId),
        );
        this.applyProducers(employees);
        this.listsFailed.set(false);
      },
      error: () => {
        this.loadingLists.set(false);
        this.listsFailed.set(true);
      },
    });
  }

  peerOptions(): ProducerOption[] {
    const selfId = this.employee?.id;
    return this.producers().filter((p) => p.id !== selfId);
  }

  private applyProducers(employees: Employee[]): void {
    const producers = employees
      .filter((e) => !!e.producesFood && e.active)
      .map((e) => ({
        id: e.id,
        fullName: e.fullName,
        supervisorEmployeeId: e.supervisorEmployeeId ?? null,
      }));
    this.producers.set(producers);
    if (!this.employee) return;
    const supervised = producers
      .filter((p) => p.supervisorEmployeeId === this.employee!.id)
      .map((p) => p.id);
    this.initialSupervisedIds = supervised;
    if (!this.form.controls.supervisedIds.dirty) {
      this.form.controls.supervisedIds.setValue([...supervised]);
    }
  }

  save(): void {
    if (this.form.invalid || this.loadingLists() || this.listsFailed()) {
      this.form.markAllAsTouched();
      return;
    }
    const shopId = this.data.shopId;
    const raw = this.form.getRawValue();
    const producesFood = !!raw.producesFood;
    const body: Partial<Employee> = {
      fullName: raw.fullName.trim(),
      baseSalary: raw.baseSalary,
      overtimeHourRate: raw.overtimeHourRate,
      serviceCheckIn: raw.serviceCheckIn || null,
      serviceCheckOut: raw.serviceCheckOut || null,
      type: raw.type,
      producesFood,
      supervisorEmployeeId: producesFood ? raw.supervisorEmployeeId || null : null,
      userId: raw.userId || null,
      hireDate: toDateString(raw.hireDate),
      notes: raw.notes.trim() || null,
      bankAlias: producesFood ? raw.bankAlias.trim() || null : null,
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
