import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

export type AttendanceShiftDialogData = {
  employeeName: string;
  dateLabel: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  defaultCheckIn: string;
  defaultCheckOut: string;
};

export type AttendanceShiftDialogResult = {
  checkInAt: string;
  checkOutAt: string;
};

@Component({
  selector: 'app-attendance-overtime-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>schedule</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Horario de servicio</strong>
        <span>{{ data.employeeName }} · {{ data.dateLabel }}</span>
      </span>
    </h2>
    <mat-dialog-content>
      <div class="shift-grid">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Entrada</mat-label>
          <input matInput type="time" [(ngModel)]="checkInAt" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Salida</mat-label>
          <input matInput type="time" [(ngModel)]="checkOutAt" />
        </mat-form-field>
      </div>
      <p class="shift-hint">
        Extra = horas después de la retirada del turno ({{ data.defaultCheckOut }}).
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(null)">Cancelar</button>
      <button mat-flat-button color="primary" type="button" (click)="save()">
        <mat-icon>check</mat-icon>
        Guardar
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .shift-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem;
        margin-top: 0.35rem;
      }
      .shift-hint {
        margin: 0.35rem 0 0;
        color: var(--guy-muted, #5f6f76);
        font-size: 0.85rem;
      }
    `,
  ],
})
export class AttendanceOvertimeDialogComponent {
  readonly data = inject<AttendanceShiftDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(
    MatDialogRef<AttendanceOvertimeDialogComponent, AttendanceShiftDialogResult | null>,
  );
  checkInAt = this.data.checkInAt || this.data.defaultCheckIn || '18:00';
  checkOutAt = this.data.checkOutAt || this.data.defaultCheckOut || '00:00';

  save(): void {
    if (!this.checkInAt || !this.checkOutAt) return;
    this.ref.close({ checkInAt: this.checkInAt, checkOutAt: this.checkOutAt });
  }
}
