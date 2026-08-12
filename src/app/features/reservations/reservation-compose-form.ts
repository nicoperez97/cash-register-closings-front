import { Component, inject, input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { ReservationArea, ReservationsApiService } from './reservations-api.service';
import { ReservationsInboxService } from './reservations-inbox.service';
import { toTimeString } from './reservation-date.util';

@Component({
  selector: 'app-reservation-compose-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    MatTimepickerModule,
  ],
  template: `
    @if (canManage()) {
      <form
        id="reservation-compose"
        class="floor-form"
        [formGroup]="form"
        (ngSubmit)="save()"
      >
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <input
            matInput
            formControlName="guestName"
            placeholder="Opcional"
            id="reservation-guest-name"
          />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Personas</mat-label>
          <input
            matInput
            type="number"
            min="1"
            inputmode="numeric"
            pattern="[0-9]*"
            formControlName="partySize"
          />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Hora</mat-label>
          <input matInput [matTimepicker]="timePicker" formControlName="reservationTime" />
          <mat-timepicker-toggle matIconSuffix [for]="timePicker" />
          <mat-timepicker #timePicker interval="15m" />
        </mat-form-field>
        <mat-button-toggle-group
          formControlName="area"
          class="floor-area-toggle"
          hideSingleSelectionIndicator
        >
          <mat-button-toggle value="INSIDE">Adentro</mat-button-toggle>
          <mat-button-toggle value="OUTSIDE">Afuera</mat-button-toggle>
        </mat-button-toggle-group>
        <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid">
          <mat-icon>add</mat-icon>
          Agregar
        </button>
      </form>
    }
  `,
  styleUrl: './reservation-compose-form.scss',
})
export class ReservationComposeFormComponent {
  private readonly api = inject(ReservationsApiService);
  private readonly inbox = inject(ReservationsInboxService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly shops = inject(ShopContextService);

  readonly businessDate = input.required<string>();
  readonly canManage = input(false);

  readonly saved = output<void>();

  readonly form = this.fb.group({
    guestName: this.fb.nonNullable.control(''),
    partySize: this.fb.nonNullable.control(2, [
      Validators.required,
      Validators.min(1),
      Validators.max(99),
    ]),
    area: this.fb.nonNullable.control<ReservationArea>('INSIDE'),
    reservationTime: this.fb.control<Date | null>(null),
  });

  save(): void {
    if (this.form.invalid || !this.canManage()) return;
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const raw = this.form.getRawValue();
    this.api
      .createReservation(shopId, {
        businessDate: this.businessDate(),
        guestName: (raw.guestName ?? '').trim(),
        partySize: Number(raw.partySize),
        area: raw.area ?? 'INSIDE',
        reservationTime: toTimeString(raw.reservationTime),
      })
      .subscribe({
        next: () => {
          this.form.patchValue({
            guestName: '',
            partySize: 2,
            area: 'INSIDE',
            reservationTime: null,
          });
          this.inbox.refresh();
          this.saved.emit();
          this.snack.open('Reserva agregada', 'OK', { duration: 2000 });
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'No se pudo guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }
}
