import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';

export type StockAdjustReason = 'merma' | 'cortesia' | 'error' | 'otro';

export const STOCK_ADJUST_REASONS: Array<{ id: StockAdjustReason; label: string }> = [
  { id: 'merma', label: 'Merma (quemado, vencido, corte)' },
  { id: 'cortesia', label: 'Cortesía' },
  { id: 'error', label: 'Error / pedido mal armado' },
  { id: 'otro', label: 'Otro' },
];

export type StockAdjustReasonDialogData = {
  productName: string;
};

export type StockAdjustReasonDialogResult = {
  reason: StockAdjustReason;
  note: string;
};

@Component({
  selector: 'app-stock-adjust-reason-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title id="stock-adjust-reason-title">
      <span class="guy-dialog__title-icon guy-dialog__title-icon--warn" aria-hidden="true">
        <mat-icon>report</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Restar stock</strong>
        <span>{{ data.productName }}</span>
      </span>
    </h2>
    <mat-dialog-content>
      <p class="hint">Elegí por qué baja: merma, cortesía o un error. Así el libro de gastos no es el único control.</p>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Motivo</mat-label>
        <mat-select [(ngModel)]="reason">
          @for (r of reasons; track r.id) {
            <mat-option [value]="r.id">{{ r.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Nota (opcional)</mat-label>
        <input matInput [(ngModel)]="note" maxlength="200" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Cancelar</button>
      <button mat-flat-button color="warn" type="button" [disabled]="!reason" (click)="confirm()">
        Restar 1
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .hint {
      margin: 0 0 0.75rem;
      font-size: 0.85rem;
      color: var(--guy-muted, #5f6f76);
    }
    mat-form-field {
      width: 100%;
      display: block;
      margin-bottom: 0.5rem;
    }
  `,
})
export class StockAdjustReasonDialogComponent {
  readonly data = inject<StockAdjustReasonDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<StockAdjustReasonDialogComponent, StockAdjustReasonDialogResult>);
  readonly reasons = STOCK_ADJUST_REASONS;
  reason: StockAdjustReason | '' = 'merma';
  note = '';

  confirm(): void {
    if (!this.reason) return;
    this.ref.close({ reason: this.reason, note: this.note.trim() });
  }
}
