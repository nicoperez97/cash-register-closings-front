import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { HttpClient } from '@angular/common/http';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { FormDialogShellComponent } from '../../shared/components/form-dialog-shell';
import { environment } from '../../../environments/environment';
import { EmployeesApiService } from '../employees/employees-api.service';
import {
  Vacation,
  VacationPersonType,
  VacationsApiService,
} from './vacations-api.service';

export type VacationDialogPerson = { id: string; name: string };

export type VacationDialogData = {
  shopId: string;
  shopName: string;
  personType: VacationPersonType;
  /** Semilla opcional; el diálogo siempre recarga al abrir. */
  persons?: VacationDialogPerson[];
} & ({ mode: 'create' } | { mode: 'edit'; vacation: Vacation });

function parseIsoLocal(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatIso(d: Date | null): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-vacation-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    FormDialogShellComponent,
  ],
  template: `
    <app-form-dialog-shell
      [title]="isEdit ? 'Editar vacaciones' : 'Cargar vacaciones'"
      [subtitle]="data.shopName"
      [icon]="isEdit ? 'edit' : 'beach_access'"
      [busy]="busy()"
      [canSave]="!loadingLists() && !listsFailed() && form.valid && persons().length > 0"
      [saveLabel]="isEdit ? 'Guardar' : 'Cargar'"
      [busyLabel]="isEdit ? 'Guardando…' : 'Cargando…'"
      [saveIcon]="isEdit ? 'save' : 'add'"
      (save)="save()"
      (cancel)="ref.close(false)"
    >
      @if (loadingLists()) {
        <div class="vac-loading">
          <mat-spinner diameter="36" />
          <p>Cargando {{ personLabel.toLowerCase() }}s…</p>
        </div>
      } @else if (listsFailed()) {
        <p class="vac-empty">No se pudieron cargar. Probá de nuevo.</p>
        <button mat-flat-button color="primary" type="button" (click)="reloadPersons()">
          <mat-icon>refresh</mat-icon>
          Reintentar
        </button>
      } @else if (!persons().length) {
        <p class="vac-empty">
          {{
            data.personType === 'EMPLOYEE'
              ? 'No hay empleados activos para cargar vacaciones'
              : 'No hay cuentas de socio activas para cargar vacaciones'
          }}
        </p>
      } @else {
        <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ personLabel }}</mat-label>
            <mat-select formControlName="personId">
              @for (p of persons(); track p.id) {
                <mat-option [value]="p.id">{{ p.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Período</mat-label>
            <mat-date-range-input [rangePicker]="picker">
              <input matStartDate formControlName="start" placeholder="Desde" />
              <input matEndDate formControlName="end" placeholder="Hasta" />
            </mat-date-range-input>
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-date-range-picker #picker />
          </mat-form-field>

          <p class="vac-days text-muted small mb-0">
            Días:
            <strong>{{ previewDays() ?? '—' }}</strong>
            <span class="vac-days__hint">(sin los francos del local)</span>
          </p>

          <mat-checkbox formControlName="unpaid">Sin goce de sueldo</mat-checkbox>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Notas</mat-label>
            <textarea matInput rows="2" formControlName="notes"></textarea>
          </mat-form-field>
        </form>
      }
    </app-form-dialog-shell>
  `,
  styles: [
    `
      .vac-days {
        margin: 0 0 0.5rem;
      }
      .vac-days__hint {
        display: block;
        margin-top: 0.15rem;
        opacity: 0.85;
      }
      .vac-loading {
        display: grid;
        place-items: center;
        gap: 0.75rem;
        padding: 1rem 0;
        text-align: center;
        color: var(--guy-muted, #5f6f76);
      }
      .vac-loading p,
      .vac-empty {
        margin: 0 0 0.75rem;
        font-size: 0.92rem;
        line-height: 1.45;
        color: var(--guy-muted, #5f6f76);
      }
    `,
  ],
})
export class VacationDialogComponent implements OnInit {
  readonly data = inject<VacationDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<VacationDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(VacationsApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly isEdit = this.data.mode === 'edit';
  readonly vacation = this.data.mode === 'edit' ? this.data.vacation : null;
  readonly busy = signal(false);
  readonly loadingLists = signal(true);
  readonly listsFailed = signal(false);
  readonly persons = signal<VacationDialogPerson[]>([...(this.data.persons ?? [])]);
  readonly previewDays = signal<number | null>(this.vacation?.businessDays ?? null);

  readonly personLabel = this.data.personType === 'EMPLOYEE' ? 'Empleado' : 'Socio';

  readonly form = this.fb.nonNullable.group({
    personId: [
      this.vacation
        ? (this.data.personType === 'EMPLOYEE'
            ? this.vacation.employeeId
            : this.vacation.partnerAccountId) ?? ''
        : '',
      Validators.required,
    ],
    start: [parseIsoLocal(this.vacation?.fromDate) as Date | null, Validators.required],
    end: [parseIsoLocal(this.vacation?.toDate) as Date | null, Validators.required],
    unpaid: [this.vacation?.unpaid ?? true],
    notes: [this.vacation?.notes ?? ''],
  });

  ngOnInit(): void {
    this.reloadPersons();
    this.form.valueChanges
      .pipe(
        debounceTime(200),
        distinctUntilChanged(
          (a, b) =>
            formatIso(a.start ?? null) === formatIso(b.start ?? null) &&
            formatIso(a.end ?? null) === formatIso(b.end ?? null),
        ),
        switchMap((v) => {
          const from = formatIso(v.start ?? null);
          const to = formatIso(v.end ?? null);
          if (!from || !to || to < from) {
            this.previewDays.set(null);
            return of(null);
          }
          return this.api.previewDays(this.data.shopId, from, to).pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        if (res) this.previewDays.set(res.businessDays);
      });
  }

  reloadPersons(): void {
    const shopId = this.data.shopId;
    if (!shopId) {
      this.loadingLists.set(false);
      this.listsFailed.set(true);
      return;
    }
    this.loadingLists.set(true);
    this.listsFailed.set(false);

    const finish = (persons: VacationDialogPerson[] | null) => {
      this.loadingLists.set(false);
      if (!persons) {
        this.listsFailed.set(true);
        return;
      }
      let next = persons;
      if (this.vacation) {
        const currentId =
          this.data.personType === 'EMPLOYEE'
            ? this.vacation.employeeId
            : this.vacation.partnerAccountId;
        const currentName = this.vacation.personName;
        if (currentId && !next.some((p) => p.id === currentId)) {
          next = [{ id: currentId, name: currentName || '—' }, ...next];
        }
      }
      this.persons.set(next);
      this.listsFailed.set(false);
    };

    if (this.data.personType === 'EMPLOYEE') {
      this.employeesApi.list(shopId).subscribe({
        next: (rows) =>
          finish(
            rows
              .filter((e) => e.active !== false)
              .map((e) => ({ id: e.id, name: e.fullName })),
          ),
        error: () => finish(null),
      });
      return;
    }

    this.http
      .get<Array<{ id: string; name: string; type?: string; active?: boolean }>>(
        `${environment.apiUrl}/shops/${shopId}/accounts`,
      )
      .subscribe({
        next: (rows) =>
          finish(
            rows
              .filter((a) => a.active !== false && a.type === 'PARTNER')
              .map((a) => ({ id: a.id, name: a.name }))
              .sort((a, b) => a.name.localeCompare(b.name, 'es')),
          ),
        error: () => finish(null),
      });
  }

  save(): void {
    if (this.form.invalid || this.busy() || this.loadingLists() || this.listsFailed()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const fromDate = formatIso(raw.start);
    const toDate = formatIso(raw.end);
    if (!fromDate || !toDate) return;

    const personPayload =
      this.data.personType === 'EMPLOYEE'
        ? { employeeId: raw.personId }
        : { partnerAccountId: raw.personId };

    this.busy.set(true);
    const req =
      this.isEdit && this.vacation
        ? this.api.update(this.data.shopId, this.vacation.id, {
            ...personPayload,
            fromDate,
            toDate,
            unpaid: raw.unpaid,
            notes: raw.notes.trim() || null,
          })
        : this.api.create(this.data.shopId, {
            personType: this.data.personType,
            ...personPayload,
            fromDate,
            toDate,
            unpaid: raw.unpaid,
            notes: raw.notes.trim() || null,
          });

    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open(this.isEdit ? 'Vacaciones actualizadas' : 'Vacaciones cargadas', 'OK', {
          duration: 2500,
        });
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
