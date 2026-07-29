import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';

export interface AdminPosProductRow {
  id: string;
  productCode: string;
  productName?: string | null;
  category?: string | null;
  active: boolean;
}

export type AdminPosProductDialogData = {
  shopId: string;
  product: AdminPosProductRow;
};

@Component({
  selector: 'app-admin-pos-product-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>edit</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <span class="guy-dialog__eyebrow">Plato POS</span>
        <span>{{ data.product.productName || data.product.productCode }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Código</mat-label>
          <input matInput [value]="data.product.productCode" readonly />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="productName" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Rubro</mat-label>
          <input matInput formControlName="category" placeholder="Ej. Entradas, Bebidas, Postres" />
          <mat-hint>Se aplica a las ventas históricas de este código</mat-hint>
        </mat-form-field>

        <mat-slide-toggle formControlName="active" color="primary">Activo</mat-slide-toggle>
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
export class AdminPosProductDialogComponent {
  readonly data = inject<AdminPosProductDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AdminPosProductDialogComponent, AdminPosProductRow>);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  saving = false;

  readonly form = this.fb.nonNullable.group({
    productName: [this.data.product.productName ?? '', Validators.required],
    category: [this.data.product.category ?? ''],
    active: [this.data.product.active],
  });

  save(): void {
    if (this.form.invalid || this.saving) return;
    this.saving = true;
    const raw = this.form.getRawValue();
    this.http
      .patch<AdminPosProductRow>(
        `${environment.apiUrl}/shops/${this.data.shopId}/pos-products/${this.data.product.id}`,
        {
          productName: raw.productName.trim(),
          category: raw.category.trim() || null,
          active: raw.active,
        },
      )
      .subscribe({
        next: (row) => {
          this.snack.open('Producto actualizado', 'OK', { duration: 2500 });
          this.ref.close(row);
        },
        error: () => {
          this.saving = false;
          this.snack.open('No se pudo guardar', 'OK', { duration: 3000 });
        },
      });
  }
}
