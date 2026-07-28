import { Component } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DocsShellComponent } from './docs-shell';

@Component({
  selector: 'app-docs-forms-filters',
  imports: [
    DocsShellComponent,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  template: `
    <app-docs-shell
      title="Forms & filters"
      subtitle="Patrones CSS guy-form-grid y guy-filters"
      description="Clases globales para formularios y paneles de filtro responsive."
    >
      <div class="panel-card guy-filters mb-3">
        <div class="guy-filters__head">
          <div>
            <h3 class="guy-filters__title">Filtros</h3>
            <p class="guy-filters__subtitle">Ejemplo de barra de filtros</p>
          </div>
          <button mat-button type="button" class="guy-filters__clear">
            <mat-icon>filter_alt_off</mat-icon>
            Limpiar
          </button>
        </div>
        <div class="guy-filters__grid guy-filters__grid--2" [formGroup]="filters">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Buscar</mat-label>
            <input matInput formControlName="q" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Estado</mat-label>
            <mat-select formControlName="status">
              <mat-option value="">Todos</mat-option>
              <mat-option value="active">Activo</mat-option>
              <mat-option value="paused">Pausa</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </div>

      <div class="panel-card">
        <h2 class="guy-section-title">Formulario</h2>
        <form class="guy-form-grid guy-form-grid--2" [formGroup]="form">
          <mat-form-field appearance="outline">
            <mat-label>Nombre</mat-label>
            <input matInput formControlName="name" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Email</mat-label>
            <input matInput formControlName="email" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="guy-form-grid--span">
            <mat-label>Notas</mat-label>
            <textarea matInput rows="3" formControlName="notes"></textarea>
          </mat-form-field>
        </form>
        <pre class="docs-code mt-3 mb-0">.guy-form-grid--2 / --3  → 1 columna bajo 720px
.guy-filters + .guy-filters__grid</pre>
      </div>
    </app-docs-shell>
  `,
})
export class DocsFormsFiltersPage {
  private readonly fb = new FormBuilder();

  readonly filters = this.fb.nonNullable.group({
    q: [''],
    status: [''],
  });

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    notes: [''],
  });
}
