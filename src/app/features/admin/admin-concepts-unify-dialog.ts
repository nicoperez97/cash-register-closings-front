import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { AdminConceptRow, CONCEPT_KIND_OPTIONS } from './admin-concept-dialog';

export type AdminConceptsUnifyData = {
  shopId: string;
  selected: AdminConceptRow[];
  all: AdminConceptRow[];
};

@Component({
  selector: 'app-admin-concepts-unify-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    MatSnackBarModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>Unificar conceptos</h2>
    <mat-dialog-content>
      <p class="lead">
        Vas a unir
        <strong>{{ data.selected.length }}</strong>
        concepto{{ data.selected.length === 1 ? '' : 's' }} en uno. Pagos, gastos y movimientos
        de los demás pasan al destino; esos se archivan.
      </p>
      <p class="hint">Elegí bien el destino: ese es el que queda y el que vas a ver en reportes.</p>
      <ul class="src">
        @for (c of data.selected; track c.id) {
          <li>{{ c.name }}</li>
        }
      </ul>

      <form [formGroup]="form" class="stack">
        <mat-radio-group formControlName="mode" class="modes">
          <mat-radio-button value="existing">Usar uno existente</mat-radio-button>
          <mat-radio-button value="new">Crear uno nuevo</mat-radio-button>
        </mat-radio-group>

        @if (form.value.mode === 'existing') {
          <mat-form-field appearance="outline">
            <mat-label>Concepto destino</mat-label>
            <mat-select formControlName="targetId">
              @for (c of targets(); track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        } @else {
          <mat-form-field appearance="outline">
            <mat-label>Nombre del concepto unificado</mat-label>
            <input matInput formControlName="targetName" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Tipo</mat-label>
            <mat-select formControlName="kind">
              @for (k of kindOptions; track k.value) {
                <mat-option [value]="k.value">{{ k.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [disabled]="busy()" (click)="ref.close(false)">
        Cancelar
      </button>
      <button mat-flat-button color="primary" type="button" [disabled]="busy()" (click)="save()">
        <app-busy-label [busy]="busy()" busyLabel="Unificando…">Unificar</app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .lead {
      margin: 0 0 0.75rem;
      line-height: 1.45;
    }
    .hint {
      margin: 0 0 0.65rem;
      font-size: 0.9rem;
      color: var(--guy-muted, #5a6b7d);
      line-height: 1.4;
    }
    .src {
      margin: 0 0 1rem;
      padding-left: 1.1rem;
      color: var(--guy-muted, #5a6b7d);
    }
    .stack {
      display: grid;
      gap: 0.5rem;
    }
    .modes {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-bottom: 0.35rem;
    }
  `,
})
export class AdminConceptsUnifyDialogComponent {
  readonly data = inject<AdminConceptsUnifyData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AdminConceptsUnifyDialogComponent, boolean>);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  readonly busy = signal(false);
  readonly kindOptions = CONCEPT_KIND_OPTIONS;

  readonly form = this.fb.nonNullable.group({
    mode: this.fb.nonNullable.control<'existing' | 'new'>('existing'),
    targetId: [this.data.selected[0]?.id ?? ''],
    targetName: [''],
    kind: this.fb.nonNullable.control<'INCOME' | 'EXPENSE' | 'TRANSFER'>(
      this.data.selected[0]?.kind ?? 'EXPENSE',
    ),
  });

  targets(): AdminConceptRow[] {
    const selectedIds = new Set(this.data.selected.map((c) => c.id));
    // Destino: cualquiera activo, preferimos mostrar también los seleccionados (uno queda).
    return this.data.all.filter((c) => c.active !== false || selectedIds.has(c.id));
  }

  save(): void {
    if (this.busy()) return;
    const mode = this.form.value.mode;
    const sourceIds = this.data.selected.map((c) => c.id);
    const body: Record<string, unknown> = { sourceIds };
    if (mode === 'existing') {
      const targetId = String(this.form.value.targetId || '').trim();
      if (!targetId) {
        this.snack.open('Elegí el concepto destino', 'OK', { duration: 2500 });
        return;
      }
      body['targetId'] = targetId;
    } else {
      const targetName = String(this.form.value.targetName || '').trim();
      if (!targetName) {
        this.snack.open('Ingresá el nombre del concepto unificado', 'OK', { duration: 2500 });
        return;
      }
      body['targetName'] = targetName;
      body['kind'] = this.form.value.kind;
    }

    this.busy.set(true);
    this.http
      .post<{
        ok: boolean;
        reassigned?: { payments: number; movements: number; closingExpenses: number };
        removed?: number;
      }>(`${environment.apiUrl}/shops/${this.data.shopId}/concepts/unify`, body)
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          const r = res.reassigned;
          const parts = [
            r?.payments ? `${r.payments} pago(s)` : null,
            r?.movements ? `${r.movements} movimiento(s)` : null,
            r?.closingExpenses ? `${r.closingExpenses} egreso(s) de cierre` : null,
          ].filter(Boolean);
          this.snack.open(
            parts.length
              ? `Unificados. Se reasignaron ${parts.join(', ')}.`
              : 'Conceptos unificados.',
            'OK',
            { duration: 4000 },
          );
          this.ref.close(true);
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudo unificar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }
}
