import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { ReservationRow, ReservationsApiService } from './reservations-api.service';

export type ReservationNoteDialogData = {
  shopId: string;
  reservation: ReservationRow;
};

@Component({
  selector: 'app-reservation-note-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSnackBarModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>sticky_note_2</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Nota de reserva</strong>
        <span>{{ label }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nota</mat-label>
          <textarea
            matInput
            rows="3"
            formControlName="notes"
            maxlength="500"
            placeholder="Ej: mesa 12 · cumple · silla bebé"
          ></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">
        Cancelar
      </button>
      <button mat-flat-button color="primary" type="button" [disabled]="busy()" (click)="save()">
        <app-busy-label [busy]="busy()" busyLabel="Guardando…">
          <mat-icon>save</mat-icon>
          Guardar
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
})
export class ReservationNoteDialogComponent {
  readonly data = inject<ReservationNoteDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ReservationNoteDialogComponent, ReservationRow | boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ReservationsApiService);
  private readonly snack = inject(MatSnackBar);

  readonly busy = signal(false);
  readonly label =
    (this.data.reservation.number ? `#${this.data.reservation.number} ` : '') +
    (this.data.reservation.guestName?.trim() || 'Reserva');

  readonly form = this.fb.nonNullable.group({
    notes: [this.data.reservation.notes ?? ''],
  });

  save(): void {
    const notes = this.form.controls.notes.value.trim() || null;
    this.busy.set(true);
    this.api.updateReservation(this.data.shopId, this.data.reservation.id, { notes }).subscribe({
      next: (row) => {
        this.busy.set(false);
        this.snack.open(notes ? 'Nota guardada' : 'Nota quitada', 'OK', { duration: 2000 });
        this.ref.close(row);
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('No se pudo guardar la nota', 'OK', { duration: 3000 });
      },
    });
  }
}
