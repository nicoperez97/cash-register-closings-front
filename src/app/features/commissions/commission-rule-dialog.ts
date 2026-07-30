import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CommissionRule, CommissionsApiService } from './commissions-api.service';

export type CommissionRuleDialogData = {
  shopId: string;
  shopName: string;
  employees: Array<{ id: string; fullName: string }>;
  categories: string[];
} & ({ mode: 'create' } | { mode: 'edit'; rule: CommissionRule });

@Component({
  selector: 'app-commission-rule-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'percent' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar regla' : 'Nueva regla de comisión' }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Empleado</mat-label>
          <mat-select formControlName="employeeId" [disabled]="isEdit">
            @for (e of data.employees; track e.id) {
              <mat-option [value]="e.id">{{ e.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Rubro</mat-label>
          <input matInput formControlName="category" list="comm-categories" placeholder="Ej. COMIDA, PIZZA" />
          <datalist id="comm-categories">
            @for (c of data.categories; track c) {
              <option [value]="c"></option>
            }
          </datalist>
          <mat-hint>Debe coincidir con el rubro de Platos POS</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>% comisión</mat-label>
          <input matInput type="number" min="0" step="0.01" formControlName="ratePercent" />
          <span matTextSuffix>%</span>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Notas</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="form.invalid || saving()"
        (click)="save()"
      >
        Guardar
      </button>
    </mat-dialog-actions>
  `,
})
export class CommissionRuleDialogComponent {
  readonly data = inject<CommissionRuleDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<CommissionRuleDialogComponent, boolean>);
  private readonly api = inject(CommissionsApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly isEdit = this.data.mode === 'edit';
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    employeeId: [
      this.data.mode === 'edit' ? this.data.rule.employeeId : '',
      Validators.required,
    ],
    category: [
      this.data.mode === 'edit' ? this.data.rule.category : '',
      Validators.required,
    ],
    ratePercent: [
      this.data.mode === 'edit' ? this.data.rule.ratePercent : 0,
      [Validators.required, Validators.min(0)],
    ],
    notes: [this.data.mode === 'edit' ? (this.data.rule.notes ?? '') : ''],
  });

  save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    const raw = this.form.getRawValue();
    const req =
      this.data.mode === 'edit'
        ? this.api.updateRule(this.data.shopId, this.data.rule.id, {
            category: raw.category.trim(),
            ratePercent: Number(raw.ratePercent),
            notes: raw.notes.trim() || null,
          })
        : this.api.createRule(this.data.shopId, {
            employeeId: raw.employeeId,
            category: raw.category.trim(),
            ratePercent: Number(raw.ratePercent),
            notes: raw.notes.trim() || null,
          });

    req.subscribe({
      next: () => {
        this.snack.open('Regla guardada', 'OK', { duration: 2500 });
        this.ref.close(true);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.snack.open(
          typeof msg === 'string' ? msg : 'No se pudo guardar',
          'OK',
          { duration: 3500 },
        );
      },
    });
  }
}
