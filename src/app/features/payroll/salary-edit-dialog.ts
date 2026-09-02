import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { SalariesApiService, SalaryEmployee } from './salaries-api.service';

export type SalaryEditDialogData = {
  shopId: string;
  shopName: string;
  shopHolidayMultiplier: number;
  employee: SalaryEmployee;
};

@Component({
  selector: 'app-salary-edit-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatIconModule,
    MatSnackBarModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>payments</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Editar sueldo</strong>
        <span>{{ data.employee.fullName }} · {{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Precio por hora</mat-label>
          <mat-icon matPrefix>payments</mat-icon>
          <input matInput type="number" min="0" inputmode="decimal" formControlName="baseSalary" />
        </mat-form-field>

        <mat-checkbox formControlName="differentOvertimeRate">
          Hora extra con precio diferente
        </mat-checkbox>

        @if (form.controls.differentOvertimeRate.value) {
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
          </mat-form-field>
        } @else {
          <p class="salary-dlg__hint">
            La hora extra usa el mismo precio hora ($
            {{ Number(form.controls.baseSalary.value ?? 0).toLocaleString('es-AR') }}).
          </p>
        }

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Multiplicador feriado</mat-label>
          <mat-icon matPrefix>event</mat-icon>
          <input
            matInput
            type="number"
            min="0.01"
            step="0.01"
            inputmode="decimal"
            formControlName="holidayPayMultiplier"
          />
          <mat-hint>
            Vacío = hereda el del local (×{{ data.shopHolidayMultiplier }})
          </mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nota del cambio</mat-label>
          <mat-icon matPrefix>notes</mat-icon>
          <textarea matInput rows="2" formControlName="note"></textarea>
        </mat-form-field>
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
        <app-busy-label [busy]="busy()" busyLabel="Guardando…">
          <mat-icon>save</mat-icon>
          Guardar
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .salary-dlg__hint {
      margin: -0.25rem 0 0.75rem;
      font-size: 0.85rem;
      color: var(--guy-muted, #5f6f76);
    }
  `,
})
export class SalaryEditDialogComponent {
  readonly data = inject<SalaryEditDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<SalaryEditDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(SalariesApiService);
  private readonly snack = inject(MatSnackBar);
  readonly busy = signal(false);
  readonly Number = Number;

  readonly form = this.fb.nonNullable.group({
    baseSalary: [this.data.employee.baseSalary, [Validators.required, Validators.min(0)]],
    differentOvertimeRate: [
      this.data.employee.hasDifferentOvertimeRate ??
        (this.data.employee.overtimeHourRate ?? 0) > 0,
    ],
    overtimeHourRate: [this.data.employee.overtimeHourRate ?? 0, [Validators.min(0)]],
    holidayPayMultiplier: this.fb.control<number | null>(
      this.data.employee.holidayPayMultiplier,
      [Validators.min(0.01)],
    ),
    note: [''],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const holidayRaw = raw.holidayPayMultiplier;
    const holidayPayMultiplier =
      holidayRaw === null || holidayRaw === undefined || (holidayRaw as unknown) === ''
        ? null
        : Number(holidayRaw);
    this.busy.set(true);
    this.api
      .update(this.data.shopId, this.data.employee.id, {
        baseSalary: raw.baseSalary,
        overtimeHourRate: raw.differentOvertimeRate ? raw.overtimeHourRate : 0,
        holidayPayMultiplier:
          holidayPayMultiplier == null || Number.isNaN(holidayPayMultiplier)
            ? null
            : holidayPayMultiplier,
        note: raw.note.trim() || null,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.snack.open('Sueldo actualizado', 'OK', { duration: 2500 });
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
