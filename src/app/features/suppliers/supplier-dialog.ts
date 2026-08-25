import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormDialogShellComponent } from '../../shared/components/form-dialog-shell';
import { ShopSupplier, SuppliersApiService } from './suppliers-api.service';

export type SupplierDialogData = {
  shopId: string;
  shopName: string;
} & ({ mode: 'create' } | { mode: 'edit'; supplier: ShopSupplier });

@Component({
  selector: 'app-supplier-dialog',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatIconModule,
    MatSnackBarModule,
    FormDialogShellComponent,
  ],
  template: `
    <app-form-dialog-shell
      [title]="isEdit ? 'Editar proveedor' : 'Nuevo proveedor'"
      [subtitle]="data.shopName"
      [icon]="isEdit ? 'edit' : 'local_shipping'"
      [busy]="busy()"
      [canSave]="form.valid"
      [saveLabel]="isEdit ? 'Guardar' : 'Crear'"
      [busyLabel]="isEdit ? 'Guardando…' : 'Creando…'"
      [saveIcon]="isEdit ? 'save' : 'add'"
      (save)="save()"
      (cancel)="ref.close(false)"
    >
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <mat-icon matPrefix>store</mat-icon>
          <input matInput formControlName="name" autocomplete="organization" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Razón social</mat-label>
          <mat-icon matPrefix>badge</mat-icon>
          <input matInput formControlName="legalName" autocomplete="organization" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>CUIT</mat-label>
          <mat-icon matPrefix>pin</mat-icon>
          <input matInput formControlName="taxId" placeholder="XX-XXXXXXXX-X" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Alias / CBU</mat-label>
          <mat-icon matPrefix>account_balance</mat-icon>
          <input matInput formControlName="bankAlias" autocomplete="off" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Notas</mat-label>
          <mat-icon matPrefix>notes</mat-icon>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>

        @if (!isEdit) {
          <p class="text-muted small mb-0">
            Al crear el proveedor se genera automáticamente una cuenta contable asociada
            (no aparece en «Quién se lo lleva»).
          </p>
        } @else {
          <p class="text-muted small mb-2">
            Cuenta asociada: <strong>{{ supplier?.accountName || '—' }}</strong>
          </p>
          <mat-slide-toggle formControlName="active">Proveedor visible</mat-slide-toggle>
        }
      </form>
    </app-form-dialog-shell>
  `,
})
export class SupplierDialogComponent {
  readonly data = inject<SupplierDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<SupplierDialogComponent, ShopSupplier | boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(SuppliersApiService);
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = this.data.mode === 'edit';
  readonly supplier = this.data.mode === 'edit' ? this.data.supplier : null;
  readonly busy = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: [this.supplier?.name ?? '', Validators.required],
    legalName: [this.supplier?.legalName ?? ''],
    taxId: [this.supplier?.taxId ?? ''],
    bankAlias: [this.supplier?.bankAlias ?? ''],
    notes: [this.supplier?.notes ?? ''],
    active: [this.supplier?.active ?? true],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const body = {
      name: raw.name.trim(),
      legalName: raw.legalName.trim() || null,
      taxId: raw.taxId.trim() || null,
      bankAlias: raw.bankAlias.trim() || null,
      notes: raw.notes.trim() || null,
    };
    this.busy.set(true);
    const req =
      this.isEdit && this.supplier
        ? this.api.update(this.data.shopId, this.supplier.id, { ...body, active: raw.active })
        : this.api.create(this.data.shopId, body);
    req.subscribe({
      next: (row) => {
        this.busy.set(false);
        this.snack.open(this.isEdit ? 'Proveedor actualizado' : 'Proveedor creado', 'OK', {
          duration: 2500,
        });
        this.ref.close(row);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'No se pudo guardar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }
}
