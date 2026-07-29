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

export interface AdminSalesSystemRow {
  id: string;
  code: string;
  name: string;
  parserKey: string;
  active: boolean;
  parserAvailable?: boolean;
}

export interface ParserOption {
  key: string;
  label: string;
}

export type AdminSalesSystemDialogData = {
  parsers: ParserOption[];
} & ({ mode: 'create' } | { mode: 'edit'; system: AdminSalesSystemRow });

@Component({
  selector: 'app-admin-sales-system-dialog',
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
        <mat-icon>{{ isEdit ? 'edit' : 'dns' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar sistema' : 'Nuevo sistema' }}</strong>
        <span>Sistemas de ventas / POS</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <mat-icon matPrefix>badge</mat-icon>
          <input matInput formControlName="name" placeholder="Restosoft" />
          @if (form.controls.name.touched && form.controls.name.hasError('required')) {
            <mat-error>Ingresá un nombre</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Código</mat-label>
          <mat-icon matPrefix>tag</mat-icon>
          <input matInput formControlName="code" placeholder="RESTOSOFT" />
          <mat-hint>Identificador único (se normaliza a mayúsculas)</mat-hint>
          @if (form.controls.code.touched && form.controls.code.hasError('required')) {
            <mat-error>Ingresá un código</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Parser</mat-label>
          <mat-icon matPrefix>code</mat-icon>
          <mat-select formControlName="parserKey">
            @for (p of data.parsers; track p.key) {
              <mat-option [value]="p.key">{{ p.label }} ({{ p.key }})</mat-option>
            }
          </mat-select>
          <mat-hint>Define cómo se interpreta el reporte de ventas</mat-hint>
        </mat-form-field>

        @if (isEdit) {
          <mat-slide-toggle formControlName="active">Sistema activo</mat-slide-toggle>
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
export class AdminSalesSystemDialogComponent {
  readonly data = inject<AdminSalesSystemDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AdminSalesSystemDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = this.data.mode === 'edit';
  private readonly system = this.data.mode === 'edit' ? this.data.system : null;
  readonly busy = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: [this.system?.name ?? '', Validators.required],
    code: [this.system?.code ?? '', Validators.required],
    parserKey: [
      this.system?.parserKey ?? this.data.parsers[0]?.key ?? 'restosoft',
      Validators.required,
    ],
    active: [this.system?.active ?? true],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const body = {
      name: raw.name.trim(),
      code: raw.code.trim(),
      parserKey: raw.parserKey,
      ...(this.isEdit ? { active: raw.active } : {}),
    };
    this.busy.set(true);

    const req =
      this.isEdit && this.system
        ? this.http.patch(`${environment.apiUrl}/sales-systems/${this.system.id}`, body)
        : this.http.post(`${environment.apiUrl}/sales-systems`, body);

    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open(this.isEdit ? 'Sistema actualizado' : 'Sistema creado', 'OK', {
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
