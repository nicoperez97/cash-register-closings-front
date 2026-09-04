import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { finalize } from 'rxjs';
import { ShopContextService } from '../../core/shop/shop-context.service';
import {
  ReservationArea,
  ReservationDaySettings,
  ReservationRow,
  ReservationsApiService,
} from './reservations-api.service';
import { toTimeString } from './reservation-date.util';
import { partyOutsideHint, effectivePartyRules } from './reservation-party-rules.util';

export type ReservationComposeSaved = {
  id: string;
  guestName: string;
  partySize: number;
  area: ReservationArea;
  reservationTime: string | null;
  row: ReservationRow;
};

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
        [class.floor-form--saving]="saving()"
        [class.floor-form--just-saved]="justSaved()"
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
            autocomplete="name"
            enterkeyhint="next"
          />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Personas</mat-label>
          <input
            matInput
            type="number"
            min="1"
            max="99"
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
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Mesa</mat-label>
          <input matInput formControlName="tableNumber" placeholder="Opcional" maxlength="20" />
        </mat-form-field>
        <mat-button-toggle-group
          formControlName="area"
          class="floor-area-toggle"
          hideSingleSelectionIndicator
        >
          <mat-button-toggle value="INSIDE" [disabled]="!insideOpen()">Adentro</mat-button-toggle>
          <mat-button-toggle value="OUTSIDE" [disabled]="!outsideOpen()">Afuera</mat-button-toggle>
        </mat-button-toggle-group>
        <button
          mat-flat-button
          color="primary"
          type="submit"
          class="floor-form__submit"
          [disabled]="form.invalid || saving()"
        >
          <mat-icon>{{ saving() ? 'hourglass_empty' : justSaved() ? 'check' : 'add' }}</mat-icon>
          {{ saving() ? 'Agregando…' : justSaved() ? 'Agregada' : 'Agregar' }}
        </button>
      </form>
      @if (capacityHint(); as hint) {
        <p class="floor-form__capacity-hint text-muted small">{{ hint }}</p>
      }
      @if (partyAreaHint(); as hint) {
        <p class="floor-form__capacity-hint text-muted small">{{ hint }}</p>
      }
    }
  `,
  styleUrl: './reservation-compose-form.scss',
})
export class ReservationComposeFormComponent {
  private readonly api = inject(ReservationsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly shops = inject(ShopContextService);

  readonly businessDate = input.required<string>();
  readonly canManage = input(false);
  readonly daySettings = input<ReservationDaySettings | null>(null);

  readonly saved = output<ReservationComposeSaved>();
  readonly saving = signal(false);
  readonly justSaved = signal(false);
  private justSavedTimer: ReturnType<typeof setTimeout> | null = null;

  readonly form = this.fb.group({
    guestName: this.fb.nonNullable.control(''),
    partySize: this.fb.nonNullable.control(2, [
      Validators.required,
      Validators.min(1),
      Validators.max(99),
    ]),
    area: this.fb.nonNullable.control<ReservationArea>('INSIDE'),
    reservationTime: this.fb.control<Date | null>(null),
    tableNumber: this.fb.nonNullable.control(''),
  });

  readonly insideOpen = computed(() => this.daySettings()?.insideEnabled !== false);

  readonly outsideOpen = computed(() => this.daySettings()?.outsideEnabled !== false);

  readonly capacityHint = computed(() => {
    const settings = this.daySettings();
    const parts: string[] = [];
    if (settings?.insideCapacityRemaining != null) {
      parts.push(`Adentro: ${settings.insideCapacityRemaining}`);
    }
    if (settings?.outsideCapacityRemaining != null) {
      parts.push(`Afuera: ${settings.outsideCapacityRemaining}`);
    }
    return parts.length ? `Cupo restante · ${parts.join(' · ')}` : '';
  });

  readonly partyAreaHint = computed(() =>
    partyOutsideHint(
      this.partySizeValue(),
      effectivePartyRules(this.shops.selectedShop(), this.daySettings()),
    ),
  );

  private readonly selectedArea = signal<ReservationArea>('INSIDE');
  private readonly partySizeValue = signal(2);

  readonly partyMax = computed(() => 99);

  constructor() {
    this.form.controls.area.valueChanges.subscribe((area) => {
      if (area) this.selectedArea.set(area);
    });
    this.form.controls.partySize.valueChanges.subscribe((size) => {
      this.partySizeValue.set(Number(size ?? 2));
    });

    effect(() => {
      const inside = this.insideOpen();
      const outside = this.outsideOpen();
      const area = this.selectedArea();
      if (area === 'INSIDE' && !inside && outside) {
        this.form.controls.area.setValue('OUTSIDE');
      } else if (area === 'OUTSIDE' && !outside && inside) {
        this.form.controls.area.setValue('INSIDE');
      }
      const max = this.partyMax();
      const size = Number(this.form.controls.partySize.value ?? 2);
      if (size > max) {
        this.form.controls.partySize.setValue(max);
      }
      this.form.controls.partySize.setValidators([
        Validators.required,
        Validators.min(1),
        Validators.max(max),
      ]);
      this.form.controls.partySize.updateValueAndValidity({ emitEvent: false });
    });
  }

  save(): void {
    if (this.form.invalid || !this.canManage() || this.saving()) return;
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const raw = this.form.getRawValue();
    const area = raw.area ?? 'INSIDE';
    const partySize = Number(raw.partySize);
    this.saving.set(true);
    try {
      this.api
        .createReservation(shopId, {
          businessDate: this.businessDate(),
          guestName: (raw.guestName ?? '').trim(),
          partySize,
          area,
          reservationTime: toTimeString(raw.reservationTime as Date | string | null),
          tableNumber: (raw.tableNumber ?? '').trim() || null,
        })
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: (created) => {
            const guestName = (raw.guestName ?? '').trim();
            const reservationTime =
              toTimeString(raw.reservationTime as Date | string | null) ?? null;
            this.form.patchValue({
              guestName: '',
              partySize: Math.min(2, this.partyMax()),
              area: this.insideOpen() ? 'INSIDE' : 'OUTSIDE',
              reservationTime: null,
              tableNumber: '',
            });
            this.flashJustSaved();
            // El badge se actualiza por SSE; un refresh HTTP acá satura conexiones
            // (EventSource + GETs) y el próximo POST queda en pending.
            this.saved.emit({
              id: created.id,
              guestName,
              partySize,
              area,
              reservationTime,
              row: created,
            });
            // Mantener el flujo de carga rápida de varias reservas seguidas.
            requestAnimationFrame(() => this.focusGuestName());
          },
          error: (err) => {
            const msg = err?.error?.message ?? 'No se pudo guardar';
            this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
          },
        });
    } catch {
      this.saving.set(false);
      this.snack.open('No se pudo guardar', 'OK', { duration: 3500 });
    }
  }

  focusGuestName(): void {
    const input = document.getElementById('reservation-guest-name') as HTMLInputElement | null;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }

  private flashJustSaved(): void {
    if (this.justSavedTimer) {
      clearTimeout(this.justSavedTimer);
      this.justSavedTimer = null;
    }
    this.justSaved.set(true);
    this.justSavedTimer = setTimeout(() => {
      this.justSaved.set(false);
      this.justSavedTimer = null;
    }, 1200);
  }
}
