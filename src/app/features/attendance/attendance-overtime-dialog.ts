import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

export type AttendanceOvertimeDialogData = {
  employeeName: string;
  dateLabel: string;
  overtimeHours: number;
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
        <strong>Horas extra</strong>
        <span>{{ data.employeeName }} · {{ data.dateLabel }}</span>
      </span>
    </h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="ot-field">
        <mat-label>Horas extra</mat-label>
        <mat-icon matPrefix>timelapse</mat-icon>
        <input
          matInput
          type="number"
          inputmode="decimal"
          min="0"
          step="0.5"
          [(ngModel)]="hours"
        />
      </mat-form-field>
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
      .ot-field {
        width: 100%;
        margin-top: 0.35rem;
      }
    `,
  ],
})
export class AttendanceOvertimeDialogComponent {
  readonly data = inject<AttendanceOvertimeDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AttendanceOvertimeDialogComponent, number | null>);
  hours = Number(this.data.overtimeHours ?? 0);

  save(): void {
    const n = Number(this.hours);
    if (!Number.isFinite(n) || n < 0) return;
    this.ref.close(Math.round(n * 100) / 100);
  }
}
