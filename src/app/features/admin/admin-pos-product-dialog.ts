import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AdminPosCategoryRow {
  id: string;
  name: string;
  sortOrder: number;
  notes?: string | null;
  active: boolean;
}

export interface AdminPosSubcategoryRow {
  id: string;
  categoryId: string;
  categoryName?: string | null;
  name: string;
  sortOrder: number;
  notes?: string | null;
  active: boolean;
}

export interface AdminPosProductRow {
  id: string;
  productCode: string;
  productName?: string | null;
  category?: string | null;
  subcategory?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
  active: boolean;
}

export type AdminPosProductDialogData = {
  shopId: string;
  product: AdminPosProductRow;
  /** Seed opcional; el diálogo vuelve a cargar al abrir. */
  categories?: AdminPosCategoryRow[];
  subcategories?: AdminPosSubcategoryRow[];
};

@Component({
  selector: 'app-admin-pos-product-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatIconModule,
    MatProgressSpinnerModule,
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

    @if (loadingLists()) {
      <mat-dialog-content class="pos-dlg__loading">
        <mat-spinner diameter="36" />
        <p>Cargando rubros…</p>
      </mat-dialog-content>
    } @else if (listsFailed()) {
      <mat-dialog-content>
        <p class="pos-dlg__empty">No se pudieron cargar los rubros. Probá de nuevo.</p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button color="primary" type="button" (click)="reloadLists()">
          <mat-icon>refresh</mat-icon>
          Reintentar
        </button>
      </mat-dialog-actions>
    } @else {
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
            <mat-select formControlName="categoryId" (selectionChange)="onCategoryChange()">
              <mat-option [value]="null">Sin rubro</mat-option>
              @for (c of categories(); track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-slide-toggle formControlName="active" color="primary">Activo</mat-slide-toggle>
        </form>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="form.invalid || saving"
          (click)="save()"
        >
          Guardar
        </button>
      </mat-dialog-actions>
    }
  `,
  styles: `
    .pos-dlg__loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      padding: 1.5rem 1rem;
      text-align: center;
      color: var(--guy-muted, #5f6f76);
    }
    .pos-dlg__empty {
      margin: 0;
      color: var(--guy-muted, #5f6f76);
    }
  `,
})
export class AdminPosProductDialogComponent implements OnInit {
  readonly data = inject<AdminPosProductDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AdminPosProductDialogComponent, AdminPosProductRow>);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  saving = false;
  readonly loadingLists = signal(true);
  readonly listsFailed = signal(false);
  readonly categories = signal<AdminPosCategoryRow[]>(this.data.categories ?? []);

  readonly form = this.fb.nonNullable.group({
    productName: [this.data.product.productName ?? '', Validators.required],
    categoryId: [this.data.product.categoryId ?? (null as string | null)],
    subcategoryId: [this.data.product.subcategoryId ?? (null as string | null)],
    active: [this.data.product.active],
  });

  ngOnInit(): void {
    this.reloadLists();
  }

  reloadLists(): void {
    const shopId = this.data.shopId;
    if (!shopId) {
      this.loadingLists.set(false);
      this.listsFailed.set(true);
      return;
    }
    this.loadingLists.set(true);
    this.listsFailed.set(false);
    this.http
      .get<AdminPosCategoryRow[]>(`${environment.apiUrl}/shops/${shopId}/pos-categories`)
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (rows) => {
          this.loadingLists.set(false);
          if (!rows) {
            this.listsFailed.set(true);
            return;
          }
          this.categories.set(rows.filter((c) => c.active !== false));
          this.listsFailed.set(false);
        },
        error: () => {
          this.loadingLists.set(false);
          this.listsFailed.set(true);
        },
      });
  }

  onCategoryChange(): void {
    // Al cambiar rubro, limpiamos subrubro (campo oculto por ahora).
    this.form.controls.subcategoryId.setValue(null);
  }

  save(): void {
    if (this.form.invalid || this.saving || this.loadingLists() || this.listsFailed()) return;
    this.saving = true;
    const raw = this.form.getRawValue();
    this.http
      .patch<AdminPosProductRow>(
        `${environment.apiUrl}/shops/${this.data.shopId}/pos-products/${this.data.product.id}`,
        {
          productName: raw.productName.trim(),
          categoryId: raw.categoryId,
          subcategoryId: raw.subcategoryId,
          active: raw.active,
        },
      )
      .subscribe({
        next: (row) => {
          this.snack.open('Plato actualizado', 'OK', { duration: 2500 });
          this.ref.close(row);
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
