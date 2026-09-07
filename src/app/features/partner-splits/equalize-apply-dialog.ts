import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import type { EqualizePreview } from './partner-splits-api.service';
import { formatMoney } from '../../shared/utils/money';

export type EqualizeGenerateMode = 'skip' | 'payment' | 'movement';

export type EqualizeApplyDialogResult = {
  transferActions: Array<{
    fromAccountId: string;
    toAccountId: string;
    generate: EqualizeGenerateMode;
  }>;
};

export type EqualizeApplyDialogData = {
  preview: EqualizePreview;
};

type ApplyRow = {
  fromAccountId: string;
  toAccountId: string;
  fromName: string;
  toName: string;
  amount: number;
  generate: EqualizeGenerateMode;
};

function money(value: number): string {
  return formatMoney(value);
}

@Component({
  selector: 'app-equalize-apply-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>savings</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Aplicar equilibrado</strong>
        <span>Pago o movimiento · destino Dividendos</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="hint">
        Cada fila es un pase. El dinero baja del que pone y va a <strong>Dividendos</strong> (ya no
        es del local / personal del socio); el beneficiario queda anotado y
        <strong>no le suma saldo</strong>. <strong>Pago</strong> queda en A socios (validado).
        <strong>Movimiento</strong> se anota ya en Movimientos.
      </p>

      <div class="bulk">
        <button mat-stroked-button type="button" (click)="setAll('payment')">Todos pago</button>
        <button mat-stroked-button type="button" (click)="setAll('movement')">
          Todos movimiento
        </button>
      </div>

      <div class="rows">
        @for (row of rows; track row.fromAccountId + row.toAccountId) {
          <div class="row">
            <div class="row__info">
              <strong>{{ row.fromName }} → Dividendos</strong>
              <span>para {{ row.toName }} · {{ money(row.amount) }}</span>
            </div>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Generar</mat-label>
              <mat-select [(ngModel)]="row.generate">
                <mat-option value="skip">No hacer nada</mat-option>
                <mat-option value="payment">Pago</mat-option>
                <mat-option value="movement">Movimiento</mat-option>
              </mat-select>
            </mat-form-field>
          </div>
        }
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(null)">Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="!hasActive()"
        (click)="confirm()"
      >
        Aplicar
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .hint {
      margin: 0 0 0.85rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
      line-height: 1.4;
    }
    .bulk {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      margin-bottom: 0.85rem;
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 10.5rem;
      gap: 0.75rem;
      align-items: center;
      padding: 0.65rem 0.75rem;
      border: 1px solid var(--guy-border, #e4e0d8);
      border-radius: 12px;
      background: #fff;
    }
    .row__info {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      min-width: 0;
    }
    .row__info strong {
      font-size: 0.95rem;
    }
    .row__info span {
      font-variant-numeric: tabular-nums;
      font-weight: 650;
      color: var(--guy-navy, #003366);
      font-size: 0.82rem;
    }
    @media (max-width: 640px) {
      .row {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class EqualizeApplyDialogComponent {
  readonly data = inject<EqualizeApplyDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<EqualizeApplyDialogComponent, EqualizeApplyDialogResult | null>);

  readonly money = money;

  readonly rows: ApplyRow[] = (this.data.preview.transfers ?? []).map((t) => ({
    fromAccountId: t.fromAccountId,
    toAccountId: t.toAccountId,
    fromName: t.fromName,
    toName: t.toName,
    amount: t.amount,
    generate: 'payment' as EqualizeGenerateMode,
  }));

  setAll(mode: EqualizeGenerateMode): void {
    for (const row of this.rows) row.generate = mode;
  }

  hasActive(): boolean {
    return this.rows.some((r) => r.generate !== 'skip');
  }

  confirm(): void {
    this.ref.close({
      transferActions: this.rows.map((r) => ({
        fromAccountId: r.fromAccountId,
        toAccountId: r.toAccountId,
        generate: r.generate,
      })),
    });
  }
}
