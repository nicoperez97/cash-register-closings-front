import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { ShopSupplier, SuppliersApiService } from './suppliers-api.service';

export type SupplierDialogData = {
  shopId: string;
  shopName: string;
} & ({ mode: 'create' } | { mode: 'edit'; supplier: ShopSupplier });

@Component({
  selector: 'app-supplier-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatIconModule,
    MatSnackBarModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'local_shipping' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar proveedor' : 'Nuevo proveedor' }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <mat-icon matPrefix>store</mat-icon>
          <input matInput formControlName="name" autocomplete="organization" />
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
        <app-busy-label [busy]="busy()" [busyLabel]="isEdit ? 'Guardando…' : 'Creando…'">
          <mat-icon>{{ isEdit ? 'save' : 'add' }}</mat-icon>
          {{ isEdit ? 'Guardar' : 'Crear' }}
        </app-busy-label>
      </button>
    </mat-dialog-actions>
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
