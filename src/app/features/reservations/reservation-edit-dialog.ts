import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import {
  ReservationArea,
  ReservationRow,
  ReservationsApiService,
} from './reservations-api.service';
import { emailFromNotes } from './reservation-messaging.util';

export type ReservationEditDialogData = {
  shopId: string;
  reservation: ReservationRow;
};

@Component({
  selector: 'app-reservation-edit-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSnackBarModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>edit</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Editar reserva</strong>
        <span>{{ label }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form res-edit" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <input matInput formControlName="guestName" autocomplete="name" />
        </mat-form-field>
        <div class="res-edit__row">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Personas</mat-label>
            <input matInput type="number" min="1" max="99" inputmode="numeric" formControlName="partySize" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Fecha</mat-label>
            <input matInput type="date" formControlName="businessDate" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Hora</mat-label>
            <input matInput type="time" formControlName="reservationTime" />
          </mat-form-field>
        </div>
        <mat-button-toggle-group formControlName="area" hideSingleSelectionIndicator class="floor-area-toggle">
          <mat-button-toggle value="INSIDE">Adentro</mat-button-toggle>
          <mat-button-toggle value="OUTSIDE">Afuera</mat-button-toggle>
        </mat-button-toggle-group>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Mail</mat-label>
          <input matInput type="email" formControlName="guestEmail" autocomplete="email" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nota</mat-label>
          <textarea matInput rows="3" formControlName="notes" maxlength="500"></textarea>
        </mat-form-field>

        @if (canEmail()) {
          <div class="res-edit__mail">
            <mat-form-field appearance="outline" class="w-100" subscriptSizing="dynamic">
              <mat-label>Mensaje por mail</mat-label>
              <textarea
                matInput
                rows="3"
                maxlength="2000"
                formControlName="mailMessage"
                placeholder="Se envía al mail de la reserva"
              ></textarea>
            </mat-form-field>
            <button
              mat-stroked-button
              type="button"
              [disabled]="mailBusy() || !form.controls.mailMessage.value?.trim()"
              (click)="sendMail()"
            >
              <app-busy-label [busy]="mailBusy()" busyLabel="Enviando…">
                <mat-icon>mail</mat-icon>
                Enviar mail
              </app-busy-label>
            </button>
          </div>
        }
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">
        Cancelar
      </button>
      <button mat-flat-button color="primary" type="button" [disabled]="busy() || form.invalid" (click)="save()">
        <app-busy-label [busy]="busy()" busyLabel="Guardando…">
          <mat-icon>save</mat-icon>
          Guardar
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .res-edit__row {
      display: grid;
      grid-template-columns: 6.5rem 1fr 7rem;
      gap: 0.65rem;
    }
    .res-edit__mail {
      display: grid;
      gap: 0.55rem;
      padding-top: 0.25rem;
    }
    .res-edit__mail button {
      justify-self: start;
    }
    @media (max-width: 560px) {
      .res-edit__row {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class ReservationEditDialogComponent {
  readonly data = inject<ReservationEditDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ReservationEditDialogComponent, ReservationRow | boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ReservationsApiService);
  private readonly snack = inject(MatSnackBar);

  readonly busy = signal(false);
  readonly mailBusy = signal(false);
  readonly label =
    (this.data.reservation.number ? `#${this.data.reservation.number} ` : '') +
    (this.data.reservation.guestName?.trim() || 'Reserva');

  readonly form = this.fb.nonNullable.group({
    guestName: [this.data.reservation.guestName ?? ''],
    partySize: [this.data.reservation.partySize ?? 2, [Validators.required, Validators.min(1), Validators.max(99)]],
    businessDate: [String(this.data.reservation.businessDate ?? '').slice(0, 10), Validators.required],
    reservationTime: [this.data.reservation.reservationTime ?? ''],
    area: [this.data.reservation.area ?? ('INSIDE' as ReservationArea)],
    guestEmail: [this.data.reservation.guestEmail || emailFromNotes(this.data.reservation.notes) || ''],
    notes: [this.data.reservation.notes ?? ''],
    mailMessage: [''],
  });

  canEmail(): boolean {
    return !!String(this.form.controls.guestEmail.value ?? '').trim();
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.busy.set(true);
    this.api
      .updateReservation(this.data.shopId, this.data.reservation.id, {
        guestName: raw.guestName.trim(),
        partySize: Number(raw.partySize),
        businessDate: raw.businessDate,
        reservationTime: raw.reservationTime || null,
        area: raw.area,
        guestEmail: raw.guestEmail.trim() || null,
        notes: raw.notes.trim() || null,
      })
      .subscribe({
        next: (row) => {
          this.busy.set(false);
          this.snack.open('Reserva actualizada', 'OK', { duration: 2200 });
          this.ref.close(row);
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  sendMail(): void {
    const message = this.form.controls.mailMessage.value.trim();
    const email = this.form.controls.guestEmail.value.trim();
    if (!message || !email || this.mailBusy()) return;
    this.mailBusy.set(true);
    const send = () =>
      this.api.sendReservationMessage(this.data.shopId, this.data.reservation.id, message).subscribe({
        next: () => {
          this.mailBusy.set(false);
          this.form.controls.mailMessage.setValue('');
          this.snack.open('Mail enviado al comensal', 'OK', { duration: 2500 });
        },
        error: (err) => {
          this.mailBusy.set(false);
          const msg = err?.error?.message ?? 'No se pudo enviar el mail';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
    if (email !== (this.data.reservation.guestEmail || '').trim()) {
      this.api
        .updateReservation(this.data.shopId, this.data.reservation.id, { guestEmail: email })
        .subscribe({
          next: () => send(),
          error: (err) => {
            this.mailBusy.set(false);
            const msg = err?.error?.message ?? 'No se pudo guardar el mail';
            this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
          },
        });
      return;
    }
    send();
  }
}
