import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { conceptKindLabel } from '../../core/i18n/labels';

export interface AdminConceptRow {
  id: string;
  name: string;
  kind: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  active: boolean;
}

export const CONCEPT_KIND_OPTIONS: Array<{ value: 'INCOME' | 'EXPENSE' | 'TRANSFER'; label: string }> = [
  { value: 'INCOME', label: conceptKindLabel('INCOME') },
  { value: 'EXPENSE', label: conceptKindLabel('EXPENSE') },
  { value: 'TRANSFER', label: conceptKindLabel('TRANSFER') },
];

export type AdminConceptDialogData =
  | { mode: 'create' }
  | { mode: 'edit'; concept: AdminConceptRow };

@Component({
  selector: 'app-admin-concept-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'sell' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar concepto' : 'Nuevo concepto' }}</strong>
        <span>Conceptos de movimientos</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <mat-icon matPrefix>badge</mat-icon>
          <input matInput formControlName="name" />
          @if (form.controls.name.touched && form.controls.name.hasError('required')) {
            <mat-error>Ingresá un nombre</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Tipo</mat-label>
          <mat-icon matPrefix>category</mat-icon>
          <mat-select formControlName="kind">
            @for (opt of kindOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        @if (isEdit) {
          <mat-slide-toggle formControlName="active">Concepto activo</mat-slide-toggle>
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
export class AdminConceptDialogComponent {
  readonly data = inject<{ shopId: string } & AdminConceptDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AdminConceptDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly kindOptions = CONCEPT_KIND_OPTIONS;
  readonly isEdit = this.data.mode === 'edit';
  private readonly concept = this.data.mode === 'edit' ? this.data.concept : null;
  readonly busy = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: [this.concept?.name ?? '', Validators.required],
    kind: [this.concept?.kind ?? 'EXPENSE', Validators.required],
    active: [this.concept?.active ?? true],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const shopId = this.data.shopId;
    const raw = this.form.getRawValue();
    const body = {
      name: raw.name.trim(),
      kind: raw.kind,
      ...(this.isEdit ? { active: raw.active } : {}),
    };
    this.busy.set(true);

    const req =
      this.isEdit && this.concept
        ? this.http.patch(`${environment.apiUrl}/shops/${shopId}/concepts/${this.concept.id}`, body)
        : this.http.post(`${environment.apiUrl}/shops/${shopId}/concepts`, body);

    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open(this.isEdit ? 'Concepto actualizado' : 'Concepto creado', 'OK', {
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
