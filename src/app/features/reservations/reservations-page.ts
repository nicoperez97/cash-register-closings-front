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
import { usePageRefresh } from '../../core/page-refresh.service';
import {
  ReservationArea,
  ReservationRow,
  ReservationsApiService,
  ReservationsDaySummary,
} from './reservations-api.service';
import { ReservationsInboxService } from './reservations-inbox.service';
import { isActiveReservationStatus } from './reservation-status';

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

function addDaysIso(iso: string, delta: number): string {
  const d = toDateInput(iso);
  d.setDate(d.getDate() + delta);
  return toDateString(d);
}

function startOfWeekIso(iso: string): string {
  const d = toDateInput(iso);
  const day = d.getDay(); // 0=dom
  const diff = day === 0 ? -6 : 1 - day; // lunes
  d.setDate(d.getDate() + diff);
  return toDateString(d);
}

function monthKeyFromIso(iso: string): string {
  return iso.slice(0, 7);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

interface WeekDayChip {
  iso: string;
  label: string;
  dayNum: number;
  guests: number;
  isToday: boolean;
  isSelected: boolean;
}

interface CalendarCell {
  iso: string | null;
  dayNum: number | null;
  guests: number;
  isToday: boolean;
  isSelected: boolean;
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
                <a class="floor-public-btn" [href]="publicUrl()" target="_blank" rel="noopener">
                  <mat-icon>open_in_new</mat-icon>
                  Pantalla pública
                </a>
                <button type="button" class="floor-public-btn floor-public-btn--ghost" (click)="copyPublicUrl()">
                  <mat-icon>content_copy</mat-icon>
                  Copiar link
                </button>
              </div>
            }
          </div>
        </div>
        <div class="floor-head-tools">
          <button
            mat-stroked-button
            type="button"
            class="floor-cal-toggle"
            [class.floor-cal-toggle--on]="showCalendar()"
            (click)="toggleCalendar()"
          >
            <mat-icon>calendar_month</mat-icon>
            Calendario
          </button>
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
      </div>

      <div class="floor-week" aria-label="Días de la semana">
        <button
          mat-icon-button
          type="button"
          aria-label="Semana anterior"
          (click)="shiftWeek(-1)"
        >
          <mat-icon>chevron_left</mat-icon>
        </button>
        <div class="floor-week__days">
          @for (d of weekDays(); track d.iso) {
            <button
              type="button"
              class="floor-week__day"
              [class.floor-week__day--selected]="d.isSelected"
              [class.floor-week__day--today]="d.isToday"
              [class.floor-week__day--busy]="d.guests > 0"
              (click)="selectIso(d.iso)"
            >
              <span class="floor-week__label">{{ d.label }}</span>
              <strong class="floor-week__num">{{ d.dayNum }}</strong>
              @if (d.guests > 0) {
                <span class="floor-week__guests">{{ d.guests }}</span>
              } @else {
                <span class="floor-week__guests floor-week__guests--empty">·</span>
              }
            </button>
          }
        </div>
        <button
          mat-icon-button
          type="button"
          aria-label="Semana siguiente"
          (click)="shiftWeek(1)"
        >
          <mat-icon>chevron_right</mat-icon>
        </button>
        <button mat-stroked-button type="button" class="floor-week__today" (click)="goToday()">
          Hoy
        </button>
      </div>

      @if (showCalendar()) {
        <div class="floor-cal" aria-label="Calendario de reservas">
          <div class="floor-cal__nav">
            <button mat-icon-button type="button" aria-label="Mes anterior" (click)="shiftMonth(-1)">
              <mat-icon>chevron_left</mat-icon>
            </button>
            <strong>{{ calendarMonthLabel() }}</strong>
            <button mat-icon-button type="button" aria-label="Mes siguiente" (click)="shiftMonth(1)">
              <mat-icon>chevron_right</mat-icon>
            </button>
          </div>
          <div class="floor-cal__weekdays">
            @for (w of weekdayHeaders; track w) {
              <span>{{ w }}</span>
            }
          </div>
          <div class="floor-cal__grid">
            @for (cell of calendarCells(); track $index) {
              @if (cell.iso) {
                <button
                  type="button"
                  class="floor-cal__cell"
                  [class.floor-cal__cell--selected]="cell.isSelected"
                  [class.floor-cal__cell--today]="cell.isToday"
                  [class.floor-cal__cell--busy]="cell.guests > 0"
                  (click)="selectIso(cell.iso)"
                >
                  <span class="floor-cal__day">{{ cell.dayNum }}</span>
                  @if (cell.guests > 0) {
                    <span class="floor-cal__count">{{ cell.guests }}</span>
                  }
                </button>
              } @else {
                <div class="floor-cal__cell floor-cal__cell--empty"></div>
              }
            }
          </div>
          <p class="floor-cal__hint text-muted small">
            Tocá un día para ver las reservas. El número indica comensales.
          </p>
        </div>
      }

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
        @for (r of activeReservations(); track r.id) {
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

      .floor-head-tools {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: flex-end;
        gap: 0.55rem;
      }

      .floor-cal-toggle {
        min-height: 2.75rem;
      }

      .floor-cal-toggle--on {
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 10%, #fff);
        border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 45%, transparent);
        color: var(--guy-primary, #1d65a0);
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
        gap: 0.5rem;
      }

      .floor-public-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        min-height: 2.4rem;
        padding: 0.45rem 1rem;
        border-radius: 999px;
        border: 1px solid transparent;
        background: color-mix(in srgb, var(--guy-green, #2e7d32) 92%, #0f2a1a);
        color: #fff;
        text-decoration: none;
        font: inherit;
        font-size: 0.86rem;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 6px 16px rgba(46, 125, 50, 0.22);
        transition:
          transform 140ms ease,
          background 140ms ease,
          border-color 140ms ease;
      }

      .floor-public-btn mat-icon {
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
        color: inherit;
      }

      .floor-public-btn:hover {
        transform: translateY(-1px);
        background: color-mix(in srgb, var(--guy-green, #2e7d32) 78%, #0f2a1a);
      }

      .floor-public-btn--ghost {
        background: transparent;
        color: var(--guy-navy, #003366);
        border-color: color-mix(in srgb, var(--guy-navy, #003366) 28%, transparent);
        box-shadow: none;
      }

      .floor-public-btn--ghost:hover {
        background: color-mix(in srgb, var(--guy-navy, #003366) 6%, #fff);
        border-color: color-mix(in srgb, var(--guy-navy, #003366) 45%, transparent);
      }

      .floor-week {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        margin-bottom: 0.85rem;
      }

      .floor-week__days {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 0.35rem;
        flex: 1;
        min-width: 0;
      }

      .floor-week__day {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.1rem;
        min-height: 4.1rem;
        padding: 0.4rem 0.2rem;
        border-radius: 12px;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: #fff;
        color: inherit;
        font: inherit;
        cursor: pointer;
        transition:
          background 140ms ease,
          border-color 140ms ease,
          transform 140ms ease;
      }

      .floor-week__day:hover {
        transform: translateY(-1px);
        border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 35%, var(--guy-border, #d7e0d9));
      }

      .floor-week__day--today {
        border-color: color-mix(in srgb, var(--guy-accent-secondary, #2e7d32) 45%, var(--guy-border, #d7e0d9));
      }

      .floor-week__day--selected {
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 12%, #fff);
        border-color: var(--guy-primary, #1d65a0);
        box-shadow: inset 0 0 0 1px var(--guy-primary, #1d65a0);
      }

      .floor-week__day--busy .floor-week__guests {
        background: color-mix(in srgb, var(--guy-accent-secondary, #2e7d32) 88%, #0f2a1a);
        color: #fff;
      }

      .floor-week__label {
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        color: var(--guy-muted, #5f6f76);
      }

      .floor-week__num {
        font-size: 1.05rem;
        line-height: 1.1;
        color: var(--guy-text, #1b2a33);
      }

      .floor-week__guests {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.35rem;
        height: 1.15rem;
        padding: 0 0.35rem;
        margin-top: 0.15rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--guy-accent-secondary, #2e7d32) 88%, #0f2a1a);
        color: #fff;
        font-size: 0.68rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        line-height: 1;
        letter-spacing: 0;
      }

      .floor-week__guests--empty {
        background: transparent;
        color: var(--guy-muted, #5f6f76);
        opacity: 0.35;
        font-weight: 500;
        min-width: 0;
        height: 1.15rem;
        padding: 0;
      }

      .floor-week__today {
        flex-shrink: 0;
        margin-left: 0.15rem;
      }

      .floor-cal {
        margin-bottom: 0.95rem;
        padding: 0.75rem 0.8rem 0.65rem;
        border-radius: 14px;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 70%, #fff);
      }

      .floor-cal__nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.55rem;
      }

      .floor-cal__nav strong {
        text-transform: capitalize;
        color: var(--guy-navy, #003366);
      }

      .floor-cal__weekdays {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 0.3rem;
        margin-bottom: 0.3rem;
      }

      .floor-cal__weekdays span {
        text-align: center;
        font-size: 0.7rem;
        text-transform: uppercase;
        color: var(--guy-muted, #5f6f76);
        letter-spacing: 0.02em;
      }

      .floor-cal__grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 0.3rem;
      }

      .floor-cal__cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.1rem;
        min-height: 3.15rem;
        padding: 0.3rem 0.15rem;
        border-radius: 10px;
        border: 1px solid transparent;
        background: #fff;
        color: inherit;
        font: inherit;
        cursor: pointer;
        transition:
          background 140ms ease,
          border-color 140ms ease;
      }

      .floor-cal__cell--empty {
        background: transparent;
        cursor: default;
        min-height: 3.15rem;
      }

      .floor-cal__cell:hover:not(.floor-cal__cell--empty) {
        border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 30%, transparent);
      }

      .floor-cal__cell--today {
        border-color: color-mix(in srgb, var(--guy-accent-secondary, #2e7d32) 40%, transparent);
      }

      .floor-cal__cell--selected {
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 14%, #fff);
        border-color: var(--guy-primary, #1d65a0);
      }

      .floor-cal__cell--busy .floor-cal__count {
        background: color-mix(in srgb, var(--guy-accent-secondary, #2e7d32) 88%, #0f2a1a);
        color: #fff;
      }

      .floor-cal__day {
        font-size: 0.92rem;
        font-weight: 600;
        line-height: 1.1;
        color: var(--guy-text, #1b2a33);
      }

      .floor-cal__count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.25rem;
        height: 1.05rem;
        padding: 0 0.3rem;
        margin-top: 0.12rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--guy-accent-secondary, #2e7d32) 88%, #0f2a1a);
        color: #fff;
        font-size: 0.65rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        line-height: 1;
        letter-spacing: 0;
      }

      .floor-cal__hint {
        margin: 0.55rem 0 0;
      }

      .floor-form {
        display: grid;
        grid-template-columns: 1fr 5.5rem 8rem auto auto;
        gap: 0.55rem;
        align-items: center;
        margin-bottom: 0.85rem;
      }

      @media (max-width: 860px) {
        .floor-week {
          flex-wrap: wrap;
        }

        .floor-week__days {
          order: 3;
          width: 100%;
          flex: 1 1 100%;
        }

        .floor-week__today {
          margin-left: auto;
        }
      }

      @media (max-width: 720px) {
        .floor-panel__head {
          flex-direction: column;
        }

        .floor-head-tools {
          width: 100%;
          justify-content: stretch;
        }

        .floor-date {
          flex: 1;
          width: auto;
        }

        .floor-form {
          grid-template-columns: 1fr 1fr;
        }

        .floor-form > mat-form-field:nth-child(3),
        .floor-form button[type='submit'],
        .floor-area-toggle {
          grid-column: 1 / -1;
        }

        .floor-week__day {
          min-height: 3.6rem;
          padding: 0.3rem 0.1rem;
        }

        .floor-week__label {
          font-size: 0.62rem;
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

      :host-context(html[data-theme='dark']) .floor-card,
      :host-context(html[data-theme='dark']) .floor-week__day,
      :host-context(html[data-theme='dark']) .floor-cal__cell:not(.floor-cal__cell--empty) {
        background: var(--guy-card, #1a1f1c);
      }

      :host-context(html[data-theme='dark']) .floor-cal {
        background: color-mix(in srgb, var(--guy-card, #1a1f1c) 80%, #000);
      }

      :host-context(html[data-theme='dark']) .floor-week__day--selected,
      :host-context(html[data-theme='dark']) .floor-cal__cell--selected {
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 22%, var(--guy-card, #1a1f1c));
      }
    `,
  ],
})
export class ReservationsPage implements OnInit {
  private readonly api = inject(ReservationsApiService);
  private readonly inbox = inject(ReservationsInboxService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);

  readonly weekdayHeaders = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  readonly businessDate = signal(this.defaultDate());
  readonly reservations = signal<ReservationRow[]>([]);
  readonly daySummary = signal<Record<string, ReservationsDaySummary>>({});
  readonly showCalendar = signal(false);
  readonly calendarMonth = signal(monthKeyFromIso(this.defaultDate()));
  readonly todayIso = signal(this.defaultDate());

  readonly selectedDay = computed(() => toDateInput(this.businessDate()));

  readonly reservationForm = this.fb.group({
    guestName: this.fb.nonNullable.control(''),
    partySize: this.fb.nonNullable.control(2, [
      Validators.required,
      Validators.min(1),
      Validators.max(99),
    ]),
    area: this.fb.nonNullable.control<ReservationArea>('INSIDE'),
    reservationTime: this.fb.control<Date | null>(null),
  });

  readonly shopSlug = computed(() => this.shops.selectedShop()?.slug ?? '');

  readonly dateLabel = computed(() => formatIsoDateDisplay(this.businessDate()));

  readonly reservationGuests = computed(() =>
    this.activeReservations().reduce((s, r) => s + Number(r.partySize || 0), 0),
  );
  readonly reservationInside = computed(() =>
    this.activeReservations()
      .filter((r) => r.area !== 'OUTSIDE')
      .reduce((s, r) => s + Number(r.partySize || 0), 0),
  );
  readonly reservationOutside = computed(() =>
    this.activeReservations()
      .filter((r) => r.area === 'OUTSIDE')
      .reduce((s, r) => s + Number(r.partySize || 0), 0),
  );

  readonly activeReservations = computed(() =>
    this.reservations().filter((r) => isActiveReservationStatus(r.status)),
  );

  readonly weekDays = computed((): WeekDayChip[] => {
    const selected = this.businessDate();
    const today = this.todayIso();
    const start = startOfWeekIso(selected);
    const summary = this.daySummary();
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysIso(start, i);
      const d = toDateInput(iso);
      return {
        iso,
        label: d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''),
        dayNum: d.getDate(),
        guests: summary[iso]?.guests ?? 0,
        isToday: iso === today,
        isSelected: iso === selected,
      };
    });
  });

  readonly calendarMonthLabel = computed(() => {
    const [y, m] = this.calendarMonth().split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  });

  readonly calendarCells = computed((): CalendarCell[] => {
    const [y, m] = this.calendarMonth().split('-').map(Number);
    const monthIndex = m - 1;
    const first = new Date(y, monthIndex, 1);
    const jsDay = first.getDay(); // 0=dom
    const offset = jsDay === 0 ? 6 : jsDay - 1; // lunes=0
    const totalDays = daysInMonth(y, monthIndex);
    const selected = this.businessDate();
    const today = this.todayIso();
    const summary = this.daySummary();
    const cells: CalendarCell[] = [];

    for (let i = 0; i < offset; i++) {
      cells.push({
        iso: null,
        dayNum: null,
        guests: 0,
        isToday: false,
        isSelected: false,
      });
    }

    for (let day = 1; day <= totalDays; day++) {
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const s = summary[iso];
      cells.push({
        iso,
        dayNum: day,
        guests: s?.guests ?? 0,
        isToday: iso === today,
        isSelected: iso === selected,
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push({
        iso: null,
        dayNum: null,
        guests: 0,
        isToday: false,
        isSelected: false,
      });
    }

    return cells;
  });

  constructor() {
    usePageRefresh(() => {
      this.loadReservations();
      this.loadSummary();
      this.inbox.refresh();
    });
  }

  canManage(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'reservations.manage');
  }

  ngOnInit(): void {
    this.calendarMonth.set(monthKeyFromIso(this.businessDate()));
    this.loadReservations();
    this.loadSummary();
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
    this.selectIso(toDateString(value));
  }

  selectIso(iso: string): void {
    if (!iso || iso === this.businessDate()) {
      this.calendarMonth.set(monthKeyFromIso(iso || this.businessDate()));
      return;
    }
    this.businessDate.set(iso);
    this.calendarMonth.set(monthKeyFromIso(iso));
    this.loadReservations();
    this.loadSummary();
  }

  goToday(): void {
    this.todayIso.set(this.defaultDate());
    this.selectIso(this.todayIso());
  }

  shiftWeek(dir: -1 | 1): void {
    this.selectIso(addDaysIso(this.businessDate(), dir * 7));
  }

  shiftMonth(dir: -1 | 1): void {
    const [y, m] = this.calendarMonth().split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.calendarMonth.set(key);
    this.loadSummary();
  }

  toggleCalendar(): void {
    const next = !this.showCalendar();
    this.showCalendar.set(next);
    if (next) {
      this.calendarMonth.set(monthKeyFromIso(this.businessDate()));
      this.loadSummary();
    }
  }

  focusReservationForm(): void {
    if (!this.canManage()) {
      this.snack.open('No tenés permiso para crear reservas', 'OK', { duration: 2500 });
      return;
    }
    const form = document.getElementById('reservation-compose');
    form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    requestAnimationFrame(() => {
      const input = document.getElementById('reservation-guest-name') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  private summaryRange(): { from: string; to: string } {
    const selected = this.businessDate();
    const weekStart = startOfWeekIso(selected);
    const weekEnd = addDaysIso(weekStart, 6);

    if (!this.showCalendar()) {
      return { from: weekStart, to: weekEnd };
    }

    const [y, m] = this.calendarMonth().split('-').map(Number);
    const monthFrom = `${y}-${String(m).padStart(2, '0')}-01`;
    const monthTo = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth(y, m - 1)).padStart(2, '0')}`;
    const from = weekStart < monthFrom ? weekStart : monthFrom;
    const to = weekEnd > monthTo ? weekEnd : monthTo;
    return { from, to };
  }

  private loadSummary(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const { from, to } = this.summaryRange();
    this.api.reservationsSummary(shopId, from, to).subscribe({
      next: (res) => {
        const map: Record<string, ReservationsDaySummary> = {};
        for (const day of res.days ?? []) {
          const key = String(day.businessDate ?? '').slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
          map[key] = {
            ...day,
            businessDate: key,
            parties: Number(day.parties) || 0,
            guests: Number(day.guests) || 0,
            inside: Number(day.inside) || 0,
            outside: Number(day.outside) || 0,
          };
        }
        this.daySummary.set(map);
      },
      error: () => {
        /* no pisar totales del calendario si falla el resumen */
      },
    });
  }

  private loadReservations(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.listReservations(shopId, this.businessDate()).subscribe({
      next: (res) => {
        const date = String(res.businessDate ?? this.businessDate()).slice(0, 10);
        this.businessDate.set(date);
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
          this.loadSummary();
          this.inbox.refresh();
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
        this.loadSummary();
        this.inbox.refresh();
        this.snack.open('Reserva eliminada', 'OK', { duration: 2000 });
      },
      error: () => this.snack.open('No se pudo eliminar', 'OK', { duration: 3000 }),
    });
  }
}
