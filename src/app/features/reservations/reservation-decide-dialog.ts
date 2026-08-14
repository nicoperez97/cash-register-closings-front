import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ReservationRequestRow } from './reservations-api.service';
import { requestWhenLabel } from './reservation-messaging.util';

export type ReservationDecideAction = 'accept' | 'reject';

export type ReservationDecideDialogData = {
  request: ReservationRequestRow;
  action: ReservationDecideAction;
  openIg?: boolean;
};

export type ReservationDecideResult = {
  note: string;
  openIg: boolean;
};

@Component({
  selector: 'app-reservation-decide-dialog',
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
      <span
        class="guy-dialog__title-icon"
        [class.guy-dialog__title-icon--ok]="isAccept"
        [class.guy-dialog__title-icon--warn]="!isAccept"
        aria-hidden="true"
      >
        <mat-icon>{{ isAccept ? 'check_circle' : 'cancel' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isAccept ? 'Aceptar reserva' : 'Rechazar reserva' }}</strong>
        <span>{{ summary }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <mat-form-field appearance="outline" class="w-100" subscriptSizing="dynamic">
        <mat-label>{{ isAccept ? 'Mensaje para el comensal' : 'Motivo' }}</mat-label>
        <textarea
          matInput
          rows="4"
          maxlength="500"
          [(ngModel)]="note"
          [placeholder]="
            isAccept
              ? 'Opcional. Se envía por mail al confirmar.'
              : 'Opcional. Se envía por mail al rechazar.'
          "
        ></textarea>
      </mat-form-field>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(null)">Cancelar</button>
      <button
        mat-flat-button
        [color]="isAccept ? 'primary' : 'warn'"
        type="button"
        (click)="confirm()"
      >
        {{ confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ReservationDecideDialogComponent {
  readonly data = inject<ReservationDecideDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(
    MatDialogRef<ReservationDecideDialogComponent, ReservationDecideResult | null>,
  );

  note = '';
  readonly isAccept = this.data.action === 'accept';
  readonly confirmLabel = this.data.openIg
    ? 'Aceptar e IG'
    : this.isAccept
      ? 'Aceptar'
      : 'Rechazar';
  readonly summary = [
    this.data.request.guestName,
    `${this.data.request.partySize} pers.`,
    this.data.request.area === 'OUTSIDE' ? 'Afuera' : 'Adentro',
    requestWhenLabel(this.data.request),
  ].join(' · ');

  confirm(): void {
    this.ref.close({
      note: this.note.trim(),
      openIg: !!this.data.openIg,
    });
  }
}
