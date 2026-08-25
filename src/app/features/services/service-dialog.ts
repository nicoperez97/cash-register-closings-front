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
import { ShopService, ServicesApiService } from './services-api.service';

export type ServiceDialogData = {
  shopId: string;
  shopName: string;
} & ({ mode: 'create' } | { mode: 'edit'; service: ShopService });

@Component({
  selector: 'app-service-dialog',
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
      [title]="isEdit ? 'Editar servicio' : 'Nuevo servicio'"
      [subtitle]="data.shopName"
      [icon]="isEdit ? 'edit' : 'home_repair_service'"
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
            Al crear el servicio se genera automáticamente una cuenta contable asociada
            (no aparece en «Quién se lo lleva»).
          </p>
        } @else {
          <p class="text-muted small mb-2">
            Cuenta asociada: <strong>{{ service?.accountName || '—' }}</strong>
          </p>
          <mat-slide-toggle formControlName="active">Servicio visible</mat-slide-toggle>
        }
      </form>
    </app-form-dialog-shell>
  `,
})
export class ServiceDialogComponent {
  readonly data = inject<ServiceDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ServiceDialogComponent, ShopService | boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ServicesApiService);
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = this.data.mode === 'edit';
  readonly service = this.data.mode === 'edit' ? this.data.service : null;
  readonly busy = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: [this.service?.name ?? '', Validators.required],
    legalName: [this.service?.legalName ?? ''],
    taxId: [this.service?.taxId ?? ''],
    bankAlias: [this.service?.bankAlias ?? ''],
    notes: [this.service?.notes ?? ''],
    active: [this.service?.active ?? true],
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
      this.isEdit && this.service
        ? this.api.update(this.data.shopId, this.service.id, { ...body, active: raw.active })
        : this.api.create(this.data.shopId, body);
    req.subscribe({
      next: (row) => {
        this.busy.set(false);
        this.snack.open(this.isEdit ? 'Servicio actualizado' : 'Servicio creado', 'OK', {
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
