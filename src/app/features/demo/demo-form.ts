import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';

@Component({
  selector: 'app-demo-form',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSnackBarModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header
      title="Formulario demo"
      subtitle="Grid responsive Material"
    />

    <div class="panel-card">
      <h2 class="guy-section-title">Datos del contacto</h2>
      <form class="guy-form-grid guy-form-grid--2" [formGroup]="form" (ngSubmit)="submit()">
        <mat-form-field appearance="outline">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Email</mat-label>
          <input matInput type="email" formControlName="email" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Rol</mat-label>
          <mat-select formControlName="role">
            <mat-option value="admin">Admin</mat-option>
            <mat-option value="user">Usuario</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Teléfono</mat-label>
          <input matInput formControlName="phone" />
        </mat-form-field>
        <mat-form-field appearance="outline" style="grid-column: 1 / -1">
          <mat-label>Mensaje</mat-label>
          <textarea matInput rows="4" formControlName="message"></textarea>
        </mat-form-field>
        <div class="d-flex gap-2" style="grid-column: 1 / -1">
          <button mat-flat-button color="primary" type="submit">Guardar</button>
          <button mat-stroked-button type="button" (click)="form.reset()">Limpiar</button>
        </div>
      </form>
    </div>
  `,
})
export class DemoFormPage {
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    role: ['user', Validators.required],
    phone: [''],
    message: [''],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.snack.open('Formulario válido (demo)', 'OK', { duration: 2500 });
  }
}
