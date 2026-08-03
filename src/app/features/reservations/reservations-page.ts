import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import {
  formatIsoDateDisplay,
  resolveShopCalendarDate,
} from '../../core/shop/business-date';
import {
  ReservationArea,
  ReservationRow,
  ReservationsApiService,
} from './reservations-api.service';

function toDateInput(value?: string | null): Date {
  if (!value) return new Date();
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toDateString(value: Date | null): string {
  const d = value ?? new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toTimeString(value: Date | null): string | undefined {
  if (!value || Number.isNaN(value.getTime())) return undefined;
  const h = String(value.getHours()).padStart(2, '0');
  const m = String(value.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

@Component({
  selector: 'app-reservations-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatTimepickerModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header
      title="Reservas"
      [subtitle]="shops.selectedShop()?.name ?? 'Local'"
      [actionLabel]="canManage() ? 'Nueva reserva' : ''"
      actionIcon="add"
      (action)="focusReservationForm()"
    />

    <section class="panel-card floor-panel">
      <div class="floor-panel__head">
        <div>
          <h2 class="guy-section-title">Reservas del día</h2>
          <div class="floor-head-meta">
            <span class="text-muted small">{{ dateLabel() }}</span>
            @if (shopSlug()) {
              <div class="floor-public-actions">
                <a
                  mat-stroked-button
                  class="floor-public-btn"
                  [href]="publicUrl()"
                  target="_blank"
                  rel="noopener"
                >
                  <mat-icon>open_in_new</mat-icon>
                  Ver
                </a>
                <button mat-stroked-button type="button" class="floor-public-btn" (click)="copyPublicUrl()">
                  <mat-icon>link</mat-icon>
                  Copiar URL
                </button>
              </div>
            }
          </div>
        </div>
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="floor-date">
          <mat-label>Fecha</mat-label>
          <input
            matInput
            [matDatepicker]="dayPicker"
            [value]="selectedDay()"
            (dateChange)="onDayPicked($event.value)"
          />
          <mat-datepicker-toggle matIconSuffix [for]="dayPicker" />
          <mat-datepicker #dayPicker />
        </mat-form-field>
      </div>

      @if (canManage()) {
        <form
          id="reservation-compose"
          class="floor-form"
          [formGroup]="reservationForm"
          (ngSubmit)="saveReservation()"
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
          <mat-button-toggle-group formControlName="area" class="floor-area-toggle" hideSingleSelectionIndicator>
            <mat-button-toggle value="INSIDE">Adentro</mat-button-toggle>
            <mat-button-toggle value="OUTSIDE">Afuera</mat-button-toggle>
          </mat-button-toggle-group>
          <button mat-flat-button color="primary" type="submit" [disabled]="reservationForm.invalid">
            <mat-icon>add</mat-icon>
            Agregar
          </button>
        </form>
      }

      <div class="floor-stats">
        <div class="floor-stat">
          <strong>{{ reservationGuests() }}</strong>
          <span>comensales</span>
        </div>
        <div class="floor-stat">
          <strong>{{ reservationInside() }}</strong>
          <span>adentro</span>
        </div>
        <div class="floor-stat">
          <strong>{{ reservationOutside() }}</strong>
          <span>afuera</span>
        </div>
      </div>

      <ul class="floor-list">
        @for (r of reservations(); track r.id) {
          <li class="floor-card" [class.floor-card--out]="r.area === 'OUTSIDE'">
            <div class="floor-card__main">
              <strong>{{ r.guestName || 'Reserva' }}</strong>
              <span>
                {{ r.partySize }} pers.
                · {{ r.area === 'OUTSIDE' ? 'Afuera' : 'Adentro' }}
                @if (r.reservationTime) {
                  · {{ r.reservationTime }}
                }
              </span>
            </div>
            @if (canManage()) {
              <div class="floor-card__actions">
                <button mat-icon-button type="button" aria-label="Eliminar" (click)="deleteReservation(r)">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </li>
        } @empty {
          <li class="floor-empty">Sin reservas para este día</li>
        }
      </ul>
    </section>
  `,
  styles: [
    `
      .floor-panel {
        padding: 1rem 1.1rem 1.15rem;
      }

      .floor-panel__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.85rem;
      }

      .floor-date {
        width: 11.5rem;
        flex-shrink: 0;
      }

      .floor-head-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.55rem 0.75rem;
        margin-top: 0.2rem;
      }

      .floor-public-actions {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }

      .floor-public-btn {
        min-height: 34px !important;
        padding: 0 0.75rem !important;
        border-radius: 999px !important;
        font-size: 0.82rem !important;
        font-weight: 650 !important;
        line-height: 1 !important;
      }

      .floor-public-btn mat-icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
        margin-right: 0.15rem;
      }

      .floor-form {
        display: grid;
        grid-template-columns: 1fr 5.5rem 8rem auto auto;
        gap: 0.55rem;
        align-items: center;
        margin-bottom: 0.85rem;
      }

      @media (max-width: 720px) {
        .floor-form {
          grid-template-columns: 1fr 1fr;
        }

        .floor-form > mat-form-field:nth-child(3),
        .floor-form button[type='submit'],
        .floor-area-toggle {
          grid-column: 1 / -1;
        }
      }

      .floor-area-toggle {
        width: 100%;
        display: inline-flex !important;
        border-radius: 12px;
        overflow: hidden;
      }

      .floor-area-toggle .mat-button-toggle {
        flex: 1 1 0;
      }

      .floor-area-toggle .mat-button-toggle-label-content {
        width: 100%;
        text-align: center;
        line-height: 1.2;
        padding: 0.55rem 0.75rem !important;
      }

      .floor-area-toggle .mat-button-toggle-button {
        width: 100%;
      }

      .floor-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.5rem;
        margin-bottom: 0.85rem;
      }

      .floor-stat {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        padding: 0.65rem 0.75rem;
        border-radius: 12px;
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 80%, #fff);
      }

      .floor-stat strong {
        font-size: 1.25rem;
        line-height: 1.1;
        color: var(--guy-navy, #003366);
      }

      .floor-stat span {
        font-size: 0.75rem;
        color: var(--guy-muted, #5f6f76);
      }

      .floor-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }

      .floor-card {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        padding: 0.7rem 0.8rem;
        border-radius: 14px;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: #fff;
      }

      .floor-card--out {
        border-color: color-mix(in srgb, #ef6c00 35%, var(--guy-border, #d7e0d9));
        background: color-mix(in srgb, #ef6c00 6%, #fff);
      }

      .floor-card__main {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
        flex: 1;
      }

      .floor-card__main strong {
        font-size: 0.98rem;
      }

      .floor-card__main span {
        font-size: 0.8rem;
        color: var(--guy-muted, #5f6f76);
      }

      .floor-empty {
        padding: 1.25rem 0.5rem;
        text-align: center;
        color: var(--guy-muted, #5f6f76);
        list-style: none;
      }

      :host-context(html[data-theme='dark']) .floor-card {
        background: var(--guy-card, #1a1f1c);
      }
    `,
  ],
})
export class ReservationsPage implements OnInit {
  private readonly api = inject(ReservationsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);

  readonly businessDate = signal(this.defaultDate());
  readonly reservations = signal<ReservationRow[]>([]);

  readonly selectedDay = computed(() => toDateInput(this.businessDate()));

  readonly reservationForm = this.fb.group({
    guestName: this.fb.nonNullable.control(''),
    partySize: this.fb.nonNullable.control(2, [Validators.required, Validators.min(1)]),
    area: this.fb.nonNullable.control<ReservationArea>('INSIDE'),
    reservationTime: this.fb.control<Date | null>(null),
  });

  readonly shopSlug = computed(() => this.shops.selectedShop()?.slug ?? '');

  readonly dateLabel = computed(() => formatIsoDateDisplay(this.businessDate()));

  readonly reservationGuests = computed(() =>
    this.reservations().reduce((s, r) => s + Number(r.partySize || 0), 0),
  );
  readonly reservationInside = computed(() =>
    this.reservations()
      .filter((r) => r.area !== 'OUTSIDE')
      .reduce((s, r) => s + Number(r.partySize || 0), 0),
  );
  readonly reservationOutside = computed(() =>
    this.reservations()
      .filter((r) => r.area === 'OUTSIDE')
      .reduce((s, r) => s + Number(r.partySize || 0), 0),
  );

  canManage(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'reservations.manage');
  }

  ngOnInit(): void {
    this.loadReservations();
  }

  private defaultDate(): string {
    const shop = this.shops.selectedShop();
    return resolveShopCalendarDate(new Date(), {
      timezone: shop?.timezone,
    });
  }

  publicUrl(): string {
    const slug = this.shopSlug();
    return `${window.location.origin}/r/${encodeURIComponent(slug)}`;
  }

  async copyPublicUrl(): Promise<void> {
    const url = this.publicUrl();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
      }
      this.snack.open('URL copiada', 'OK', { duration: 2000 });
    } catch {
      this.snack.open('No se pudo copiar la URL', 'OK', { duration: 3000 });
    }
  }

  onDayPicked(value: Date | null): void {
    if (!value) return;
    this.businessDate.set(toDateString(value));
    this.loadReservations();
  }

  focusReservationForm(): void {
    if (!this.canManage()) {
      this.snack.open('No tenés permiso para crear reservas', 'OK', { duration: 2500 });
      return;
    }
    const form = document.getElementById('reservation-compose');
    form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Esperar el scroll / layout antes de enfocar
    requestAnimationFrame(() => {
      const input = document.getElementById('reservation-guest-name') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  private loadReservations(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.listReservations(shopId, this.businessDate()).subscribe({
      next: (res) => {
        this.businessDate.set(res.businessDate);
        this.reservations.set(res.reservations ?? []);
      },
      error: () => this.snack.open('No se pudieron cargar las reservas', 'OK', { duration: 3000 }),
    });
  }

  saveReservation(): void {
    if (this.reservationForm.invalid || !this.canManage()) return;
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const raw = this.reservationForm.getRawValue();
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
          this.reservationForm.patchValue({
            guestName: '',
            partySize: 2,
            area: 'INSIDE',
            reservationTime: null,
          });
          this.loadReservations();
          this.snack.open('Reserva agregada', 'OK', { duration: 2000 });
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'No se pudo guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  deleteReservation(row: ReservationRow): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage()) return;
    this.api.removeReservation(shopId, row.id).subscribe({
      next: () => {
        this.loadReservations();
        this.snack.open('Reserva eliminada', 'OK', { duration: 2000 });
      },
      error: () => this.snack.open('No se pudo eliminar', 'OK', { duration: 3000 }),
    });
  }
}
