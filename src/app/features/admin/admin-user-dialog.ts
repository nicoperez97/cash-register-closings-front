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

export interface AdminUserRow {
  id: string;
  fullName: string;
  email: string;
  globalRole: string;
  active: boolean;
}

export type AdminUserDialogData = {
  shopId: string;
  shopName: string;
  roleOptions: Array<{ value: string; label: string }>;
} & ({ mode: 'create' } | { mode: 'edit'; user: AdminUserRow });

@Component({
  selector: 'app-admin-user-dialog',
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
        <mat-icon>{{ isEdit ? 'edit' : 'person_add' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar usuario' : 'Nuevo usuario' }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <mat-icon matPrefix>badge</mat-icon>
          <input matInput formControlName="fullName" autocomplete="name" />
          @if (form.controls.fullName.touched && form.controls.fullName.hasError('required')) {
            <mat-error>Ingresá un nombre</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Correo</mat-label>
          <mat-icon matPrefix>mail</mat-icon>
          <input matInput formControlName="email" autocomplete="email" />
          @if (form.controls.email.touched && form.controls.email.hasError('required')) {
            <mat-error>Ingresá un correo</mat-error>
          }
          @if (form.controls.email.touched && form.controls.email.hasError('email')) {
            <mat-error>Correo inválido</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>{{ isEdit ? 'Nueva contraseña (opcional)' : 'Contraseña' }}</mat-label>
          <mat-icon matPrefix>lock</mat-icon>
          <input matInput type="password" formControlName="password" autocomplete="new-password" />
          @if (form.controls.password.touched && form.controls.password.hasError('required')) {
            <mat-error>Ingresá una contraseña</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Rol</mat-label>
          <mat-icon matPrefix>shield</mat-icon>
          <mat-select formControlName="globalRole">
            @for (opt of data.roleOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        @if (isEdit) {
          <mat-slide-toggle formControlName="active">Usuario activo</mat-slide-toggle>
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
        <mat-icon>{{ isEdit ? 'save' : 'person_add' }}</mat-icon>
        {{ isEdit ? 'Guardar cambios' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class AdminUserDialogComponent {
  readonly data = inject<AdminUserDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AdminUserDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = this.data.mode === 'edit';
  private readonly user = this.data.mode === 'edit' ? this.data.user : null;
  readonly busy = signal(false);

  readonly form = this.fb.nonNullable.group({
    fullName: [this.user?.fullName ?? '', Validators.required],
    email: [this.user?.email ?? '', [Validators.required, Validators.email]],
    password: [this.isEdit ? '' : 'demo', this.isEdit ? [] : [Validators.required]],
    globalRole: [this.user?.globalRole ?? 'CASHIER', Validators.required],
    active: [this.user?.active ?? true],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const shopId = this.data.shopId;
    const raw = this.form.getRawValue();
    this.busy.set(true);

    if (this.isEdit && this.user) {
      const body: Record<string, unknown> = {
        fullName: raw.fullName,
        email: raw.email,
        globalRole: raw.globalRole,
        active: raw.active,
        shopIds: [shopId],
        shopRole: raw.globalRole,
      };
      if (raw.password.trim()) body['password'] = raw.password.trim();
      this.http.patch(`${environment.apiUrl}/users/${this.user.id}?shopId=${shopId}`, body).subscribe({
        next: () => {
          this.busy.set(false);
          this.snack.open('Usuario actualizado', 'OK', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'Error al guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
      return;
    }

    if (!raw.password.trim()) {
      this.busy.set(false);
      this.snack.open('Ingresá una contraseña', 'OK', { duration: 2500 });
      return;
    }

    this.http
      .post(`${environment.apiUrl}/users?shopId=${shopId}`, {
        fullName: raw.fullName,
        email: raw.email,
        password: raw.password,
        globalRole: raw.globalRole,
        shopIds: [shopId],
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.snack.open('Usuario creado', 'OK', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'Error al crear';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }
}
