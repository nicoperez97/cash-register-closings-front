import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';

export interface DemoListItem {
  id: string;
  name: string;
  category: string;
  owner: string;
}

export type DemoItemDialogData =
  | { mode: 'create' }
  | { mode: 'edit'; item: DemoListItem };

export type DemoItemDialogResult = Omit<DemoListItem, 'id'> & { id?: string };

@Component({
  selector: 'app-demo-item-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'add' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar ítem' : 'Nuevo ítem' }}</strong>
        <span>{{ isEdit ? 'Actualizá los datos del registro' : 'Completá los datos para crear un registro' }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <mat-icon matPrefix>label</mat-icon>
          <input matInput formControlName="name" autocomplete="off" />
          @if (form.controls.name.touched && form.controls.name.hasError('required')) {
            <mat-error>Ingresá un nombre</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Categoría</mat-label>
          <mat-icon matPrefix>category</mat-icon>
          <mat-select formControlName="category">
            <mat-option value="Producto">Producto</mat-option>
            <mat-option value="Servicio">Servicio</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Owner</mat-label>
          <mat-icon matPrefix>person</mat-icon>
          <input matInput formControlName="owner" autocomplete="name" />
          @if (form.controls.owner.touched && form.controls.owner.hasError('required')) {
            <mat-error>Ingresá un owner</mat-error>
          }
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="form.invalid"
        (click)="save()"
      >
        <mat-icon>{{ isEdit ? 'save' : 'add' }}</mat-icon>
        {{ isEdit ? 'Guardar' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class DemoItemDialogComponent {
  readonly data = inject<DemoItemDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<DemoItemDialogComponent, DemoItemDialogResult | undefined>);
  private readonly fb = inject(FormBuilder);

  readonly isEdit = this.data.mode === 'edit';
  private readonly item = this.data.mode === 'edit' ? this.data.item : null;

  readonly form = this.fb.nonNullable.group({
    name: [this.item?.name ?? '', [Validators.required, Validators.maxLength(80)]],
    category: [this.item?.category ?? 'Producto', Validators.required],
    owner: [this.item?.owner ?? '', [Validators.required, Validators.maxLength(60)]],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.ref.close({
      id: this.item?.id,
      ...value,
    });
  }
}
