import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';

export type ComandaLineReason =
  | 'cortesia'
  | 'error'
  | 'cambio_mesa'
  | 'transfer'
  | 'merma'
  | 'otro';

export const COMANDA_LINE_REASONS: Array<{ id: ComandaLineReason; label: string }> = [
  { id: 'cortesia', label: 'Cortesía' },
  { id: 'error', label: 'Error / mal armado' },
  { id: 'cambio_mesa', label: 'Cambio de mesa' },
  { id: 'transfer', label: 'Transferencia de mesa' },
  { id: 'merma', label: 'Merma (quemado, no salió)' },
  { id: 'otro', label: 'Otro' },
];

export function comandaReasonLabel(reason?: string | null): string {
  const id = String(reason ?? '').trim().toLowerCase();
  return COMANDA_LINE_REASONS.find((r) => r.id === id)?.label ?? (id || '');
}

export type ComandaLineReasonDialogData = {
  itemName: string;
  mode: 'remove' | 'qty_down';
};

export type ComandaLineReasonDialogResult = {
  reason: ComandaLineReason;
  note: string;
};

@Component({
  selector: 'app-comanda-line-reason-dialog',
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
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon guy-dialog__title-icon--warn" aria-hidden="true">
        <mat-icon>report</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ data.mode === 'remove' ? 'Quitar del ticket' : 'Bajar cantidad' }}</strong>
        <span>{{ data.itemName }}</span>
      </span>
    </h2>
    <mat-dialog-content>
      <p class="hint">Elegí el motivo. Queda en Cambios de la mesa y en el monitor.</p>
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
        Confirmar
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
export class ComandaLineReasonDialogComponent {
  readonly data = inject<ComandaLineReasonDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(
    MatDialogRef<ComandaLineReasonDialogComponent, ComandaLineReasonDialogResult>,
  );
  readonly reasons = COMANDA_LINE_REASONS;
  reason: ComandaLineReason | '' = 'error';
  note = '';

  confirm(): void {
    if (!this.reason) return;
    this.ref.close({ reason: this.reason, note: this.note.trim() });
  }
}
