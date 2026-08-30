import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { catchError, forkJoin, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EmployeesApiService } from '../employees/employees-api.service';
import { CommissionRule, CommissionsApiService } from './commissions-api.service';

export type CommissionRuleDialogData = {
  shopId: string;
  shopName: string;
  /** Seed opcional; el diálogo vuelve a cargar al abrir. */
  employees?: Array<{ id: string; fullName: string }>;
  categories?: string[];
} & ({ mode: 'create' } | { mode: 'edit'; rule: CommissionRule });

@Component({
  selector: 'app-commission-rule-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'percent' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar regla' : 'Nueva regla de comisión' }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    @if (loadingLists()) {
      <mat-dialog-content class="comm-rule__loading">
        <mat-spinner diameter="36" />
        <p>Cargando empleados y rubros…</p>
      </mat-dialog-content>
    } @else if (listsFailed()) {
      <mat-dialog-content>
        <p class="comm-rule__empty">No se pudieron cargar empleados o rubros. Probá de nuevo.</p>
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
        <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Empleado</mat-label>
            <mat-select formControlName="employeeId" [disabled]="isEdit">
              @for (e of employees(); track e.id) {
                <mat-option [value]="e.id">{{ e.fullName }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Rubro</mat-label>
            <input
              matInput
              formControlName="category"
              list="comm-categories"
              placeholder="Ej. COMIDA, PIZZA"
            />
            <datalist id="comm-categories">
              @for (c of categories(); track c) {
                <option [value]="c"></option>
              }
            </datalist>
            <mat-hint>Debe coincidir con el rubro de Platos POS</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>% comisión</mat-label>
            <input
              matInput
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              formControlName="ratePercent"
            />
            <span matTextSuffix>%</span>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Notas</mat-label>
            <textarea matInput rows="2" formControlName="notes"></textarea>
          </mat-form-field>
        </form>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="form.invalid || saving() || !employees().length"
          (click)="save()"
        >
          Guardar
        </button>
      </mat-dialog-actions>
    }
  `,
  styles: `
    .comm-rule__loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      padding: 1.5rem 1rem;
      text-align: center;
      color: var(--guy-muted, #5f6f76);
    }
    .comm-rule__empty {
      margin: 0;
      color: var(--guy-muted, #5f6f76);
    }
  `,
})
export class CommissionRuleDialogComponent implements OnInit {
  readonly data = inject<CommissionRuleDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<CommissionRuleDialogComponent, boolean>);
  private readonly api = inject(CommissionsApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly isEdit = this.data.mode === 'edit';
  readonly saving = signal(false);
  readonly loadingLists = signal(true);
  readonly listsFailed = signal(false);
  readonly employees = signal<Array<{ id: string; fullName: string }>>(
    this.data.employees ?? [],
  );
  readonly categories = signal<string[]>(this.data.categories ?? []);

  readonly form = this.fb.nonNullable.group({
    employeeId: [
      this.data.mode === 'edit' ? this.data.rule.employeeId : '',
      Validators.required,
    ],
    category: [
      this.data.mode === 'edit' ? this.data.rule.category : '',
      Validators.required,
    ],
    ratePercent: [
      this.data.mode === 'edit' ? this.data.rule.ratePercent : 0,
      [Validators.required, Validators.min(0)],
    ],
    notes: [this.data.mode === 'edit' ? (this.data.rule.notes ?? '') : ''],
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
    forkJoin({
      employees: this.employeesApi.list(shopId).pipe(catchError(() => of(null))),
      products: this.http
        .get<Array<{ category?: string | null }>>(
          `${environment.apiUrl}/shops/${shopId}/pos-products`,
        )
        .pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ employees, products }) => {
        this.loadingLists.set(false);
        if (!employees || !products) {
          this.listsFailed.set(true);
          if (employees) {
            this.employees.set(
              employees.map((e) => ({ id: e.id, fullName: e.fullName })),
            );
          }
          if (products) this.categories.set(this.categoriesFromProducts(products));
          return;
        }
        this.employees.set(employees.map((e) => ({ id: e.id, fullName: e.fullName })));
        this.categories.set(this.categoriesFromProducts(products));
        this.listsFailed.set(false);
      },
      error: () => {
        this.loadingLists.set(false);
        this.listsFailed.set(true);
      },
    });
  }

  save(): void {
    if (this.form.invalid || this.saving() || this.loadingLists() || this.listsFailed()) return;
    this.saving.set(true);
    const raw = this.form.getRawValue();
    const req =
      this.data.mode === 'edit'
        ? this.api.updateRule(this.data.shopId, this.data.rule.id, {
            category: raw.category.trim(),
            ratePercent: Number(raw.ratePercent),
            notes: raw.notes.trim() || null,
          })
        : this.api.createRule(this.data.shopId, {
            employeeId: raw.employeeId,
            category: raw.category.trim(),
            ratePercent: Number(raw.ratePercent),
            notes: raw.notes.trim() || null,
          });

    req.subscribe({
      next: () => {
        this.snack.open('Regla guardada', 'OK', { duration: 2500 });
        this.ref.close(true);
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message;
        this.snack.open(
          typeof msg === 'string' ? msg : 'No se pudo guardar',
          'OK',
          { duration: 3500 },
        );
      },
    });
  }

  private categoriesFromProducts(rows: Array<{ category?: string | null }>): string[] {
    const set = new Set<string>();
    for (const r of rows) {
      const c = r.category?.trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }
}
