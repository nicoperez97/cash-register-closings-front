import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import {
  AdminPosCategoryRow,
  AdminPosSubcategoryRow,
} from './admin-pos-product-dialog';

export type AdminPosCategoryDialogData = {
  shopId: string;
} & ({ mode: 'create' } | { mode: 'edit'; category: AdminPosCategoryRow });

export type AdminPosSubcategoryDialogData = {
  shopId: string;
  categories: AdminPosCategoryRow[];
} & ({ mode: 'create' } | { mode: 'edit'; subcategory: AdminPosSubcategoryRow });

@Component({
  selector: 'app-admin-pos-category-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'category' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar rubro' : 'Nuevo rubro' }}</strong>
      </span>
    </h2>
    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="name" placeholder="Ej. COMIDA, PIZZA" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Orden</mat-label>
          <input matInput type="number" formControlName="sortOrder" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Notas</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" type="button" [disabled]="form.invalid || saving" (click)="save()">
        Guardar
      </button>
    </mat-dialog-actions>
  `,
})
export class AdminPosCategoryDialogComponent {
  readonly data = inject<AdminPosCategoryDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AdminPosCategoryDialogComponent, boolean>);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly isEdit = this.data.mode === 'edit';
  saving = false;

  readonly form = this.fb.nonNullable.group({
    name: [
      this.data.mode === 'edit' ? this.data.category.name : '',
      Validators.required,
    ],
    sortOrder: [
      this.data.mode === 'edit' ? this.data.category.sortOrder : 0,
    ],
    notes: [this.data.mode === 'edit' ? (this.data.category.notes ?? '') : ''],
  });

  save(): void {
    if (this.form.invalid || this.saving) return;
    this.saving = true;
    const raw = this.form.getRawValue();
    const body = {
      name: raw.name.trim(),
      sortOrder: Number(raw.sortOrder) || 0,
      notes: raw.notes.trim() || null,
    };
    const req =
      this.data.mode === 'edit'
        ? this.http.patch(
            `${environment.apiUrl}/shops/${this.data.shopId}/pos-categories/${this.data.category.id}`,
            body,
          )
        : this.http.post(`${environment.apiUrl}/shops/${this.data.shopId}/pos-categories`, body);
    req.subscribe({
      next: () => {
        this.snack.open('Rubro guardado', 'OK', { duration: 2500 });
        this.ref.close(true);
      },
      error: (err) => {
        this.saving = false;
        const msg = err?.error?.message;
        this.snack.open(typeof msg === 'string' ? msg : 'No se pudo guardar', 'OK', {
          duration: 3500,
        });
      },
    });
  }
}

@Component({
  selector: 'app-admin-pos-subcategory-dialog',
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
        <mat-icon>{{ isEdit ? 'edit' : 'account_tree' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar subrubro' : 'Nuevo subrubro' }}</strong>
      </span>
    </h2>
    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Rubro</mat-label>
          <mat-select formControlName="categoryId">
            @for (c of data.categories; track c.id) {
              <mat-option [value]="c.id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="name" placeholder="Ej. Pastas, Postres" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Orden</mat-label>
          <input matInput type="number" formControlName="sortOrder" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Notas</mat-label>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" type="button" [disabled]="form.invalid || saving" (click)="save()">
        Guardar
      </button>
    </mat-dialog-actions>
  `,
})
export class AdminPosSubcategoryDialogComponent {
  readonly data = inject<AdminPosSubcategoryDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AdminPosSubcategoryDialogComponent, boolean>);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly isEdit = this.data.mode === 'edit';
  saving = false;

  readonly form = this.fb.nonNullable.group({
    categoryId: [
      this.data.mode === 'edit'
        ? this.data.subcategory.categoryId
        : (this.data.categories[0]?.id ?? ''),
      Validators.required,
    ],
    name: [
      this.data.mode === 'edit' ? this.data.subcategory.name : '',
      Validators.required,
    ],
    sortOrder: [
      this.data.mode === 'edit' ? this.data.subcategory.sortOrder : 0,
    ],
    notes: [this.data.mode === 'edit' ? (this.data.subcategory.notes ?? '') : ''],
  });

  save(): void {
    if (this.form.invalid || this.saving) return;
    this.saving = true;
    const raw = this.form.getRawValue();
    const body = {
      categoryId: raw.categoryId,
      name: raw.name.trim(),
      sortOrder: Number(raw.sortOrder) || 0,
      notes: raw.notes.trim() || null,
    };
    const req =
      this.data.mode === 'edit'
        ? this.http.patch(
            `${environment.apiUrl}/shops/${this.data.shopId}/pos-subcategories/${this.data.subcategory.id}`,
            body,
          )
        : this.http.post(
            `${environment.apiUrl}/shops/${this.data.shopId}/pos-subcategories`,
            body,
          );
    req.subscribe({
      next: () => {
        this.snack.open('Subrubro guardado', 'OK', { duration: 2500 });
        this.ref.close(true);
      },
      error: (err) => {
        this.saving = false;
        const msg = err?.error?.message;
        this.snack.open(typeof msg === 'string' ? msg : 'No se pudo guardar', 'OK', {
          duration: 3500,
        });
      },
    });
  }
}
