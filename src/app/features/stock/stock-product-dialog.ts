import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { StockApiService, StockCategory, StockProduct } from './stock-api.service';

export type StockProductDialogData = {
  shopId: string;
  shopName: string;
  categories: StockCategory[];
} & ({ mode: 'create' } | { mode: 'edit'; product: StockProduct });

@Component({
  selector: 'app-stock-product-dialog',
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
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'inventory' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar producto' : 'Nuevo producto' }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre del producto</mat-label>
          <mat-icon matPrefix>inventory_2</mat-icon>
          <input matInput formControlName="name" />
          @if (form.controls.name.touched && form.controls.name.hasError('required')) {
            <mat-error>Ingresá un nombre</mat-error>
          }
        </mat-form-field>

        <mat-slide-toggle formControlName="createCategory">
          Crear categoría nueva
        </mat-slide-toggle>

        @if (form.controls.createCategory.value) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Nombre de categoría</mat-label>
            <mat-icon matPrefix>category</mat-icon>
            <input matInput formControlName="newCategoryName" />
          </mat-form-field>
        } @else {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Categoría</mat-label>
            <mat-icon matPrefix>category</mat-icon>
            <mat-select formControlName="categoryId">
              @for (c of data.categories; track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        @if (!isEdit) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Cantidad inicial</mat-label>
            <mat-icon matPrefix>tag</mat-icon>
            <input
              matInput
              type="number"
              min="0"
              step="1"
              inputmode="decimal"
              formControlName="quantity"
            />
          </mat-form-field>
        }

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Stock mínimo</mat-label>
          <mat-icon matPrefix>warning</mat-icon>
          <input
            matInput
            type="number"
            min="0"
            step="1"
            inputmode="decimal"
            formControlName="minQuantity"
          />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Stock máximo</mat-label>
          <mat-icon matPrefix>vertical_align_top</mat-icon>
          <input
            matInput
            type="number"
            min="0"
            step="1"
            inputmode="decimal"
            formControlName="maxQuantity"
          />
          <mat-hint>Usado al reponer. La cantidad puede superar este valor con +/-.</mat-hint>
        </mat-form-field>

        @if (isEdit) {
          <mat-slide-toggle formControlName="active">Producto visible</mat-slide-toggle>
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
        [disabled]="busy() || !canSave()"
        (click)="save()"
      >
        <app-busy-label [busy]="busy()" [busyLabel]="isEdit ? 'Guardando…' : 'Creando…'">
          <mat-icon>{{ isEdit ? 'save' : 'add' }}</mat-icon>
          {{ isEdit ? 'Guardar' : 'Crear' }}
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
})
export class StockProductDialogComponent {
  readonly data = inject<StockProductDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<StockProductDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(StockApiService);
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = this.data.mode === 'edit';
  private readonly product = this.data.mode === 'edit' ? this.data.product : null;
  readonly busy = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: [this.product?.name ?? '', Validators.required],
    createCategory: [false],
    categoryId: [this.product?.categoryId ?? (this.data.categories[0]?.id ?? '')],
    newCategoryName: [''],
    quantity: [this.product?.quantity ?? 0],
    minQuantity: [this.product?.minQuantity ?? 0],
    maxQuantity: [this.product?.maxQuantity ?? 0],
    active: [this.product?.active ?? true],
  });

  canSave(): boolean {
    const raw = this.form.getRawValue();
    if (!raw.name.trim()) return false;
    if (raw.createCategory) return !!raw.newCategoryName.trim();
    return !!raw.categoryId;
  }

  save(): void {
    if (!this.canSave()) {
      this.form.markAllAsTouched();
      return;
    }
    const shopId = this.data.shopId;
    const raw = this.form.getRawValue();
    const body = {
      name: raw.name.trim(),
      minQuantity: Number(raw.minQuantity) || 0,
      maxQuantity: Number(raw.maxQuantity) || 0,
      ...(raw.createCategory
        ? {
            newCategory: { name: raw.newCategoryName.trim() },
            categoryId: null,
          }
        : { categoryId: raw.categoryId }),
      ...(!this.isEdit ? { quantity: Number(raw.quantity) || 0 } : {}),
    };
    this.busy.set(true);

    const req =
      this.isEdit && this.product
        ? this.api.updateProduct(shopId, this.product.id, { ...body, active: raw.active })
        : this.api.createProduct(shopId, body);

    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open(this.isEdit ? 'Producto actualizado' : 'Producto creado', 'OK', {
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
