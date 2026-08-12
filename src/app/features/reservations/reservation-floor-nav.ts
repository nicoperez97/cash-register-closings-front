import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  CalendarCell,
  toDateInput,
  toDateString,
  WeekDayChip,
} from './reservation-date.util';

@Component({
  selector: 'app-reservation-floor-nav',
  imports: [
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
  ],
  template: `
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
              <button
                type="button"
                class="floor-public-btn floor-public-btn--ghost"
                (click)="copyPublicUrl()"
              >
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
          (click)="toggleCalendar.emit()"
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
            (dateChange)="dayPicked.emit($event.value)"
          />
          <mat-datepicker-toggle matIconSuffix [for]="dayPicker" />
          <mat-datepicker #dayPicker touchUi />
        </mat-form-field>
      </div>
    </div>

    <div class="floor-week" aria-label="Días de la semana">
      <div class="floor-week__nav">
        <button
          mat-icon-button
          type="button"
          aria-label="Semana anterior"
          (click)="shiftWeek.emit(-1)"
        >
          <mat-icon>chevron_left</mat-icon>
        </button>
        <button mat-stroked-button type="button" class="floor-week__today" (click)="goToday.emit()">
          Hoy
        </button>
        <button
          mat-icon-button
          type="button"
          aria-label="Semana siguiente"
          (click)="shiftWeek.emit(1)"
        >
          <mat-icon>chevron_right</mat-icon>
        </button>
      </div>
      <div class="floor-week__days">
        @for (d of weekDays(); track d.iso) {
          <button
            type="button"
            class="floor-week__day"
            [class.floor-week__day--selected]="d.isSelected"
            [class.floor-week__day--today]="d.isToday"
            [class.floor-week__day--busy]="d.guests > 0"
            (click)="selectIso.emit(d.iso)"
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
    </div>

    @if (showCalendar()) {
      <div class="floor-cal" aria-label="Calendario de reservas">
        <div class="floor-cal__nav">
          <button mat-icon-button type="button" aria-label="Mes anterior" (click)="shiftMonth.emit(-1)">
            <mat-icon>chevron_left</mat-icon>
          </button>
          <strong>{{ calendarMonthLabel() }}</strong>
          <button mat-icon-button type="button" aria-label="Mes siguiente" (click)="shiftMonth.emit(1)">
            <mat-icon>chevron_right</mat-icon>
          </button>
        </div>
        <div class="floor-cal__weekdays">
          @for (w of weekdayHeaders(); track w) {
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
                (click)="selectIso.emit(cell.iso!)"
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
  `,
  styleUrl: './reservation-floor-nav.scss',
})
export class ReservationFloorNavComponent {
  private readonly snack = inject(MatSnackBar);

  readonly businessDate = input.required<string>();
  readonly dateLabel = input.required<string>();
  readonly shopSlug = input('');
  readonly showCalendar = input(false);
  readonly weekDays = input.required<WeekDayChip[]>();
  readonly calendarMonthLabel = input.required<string>();
  readonly calendarCells = input.required<CalendarCell[]>();
  readonly weekdayHeaders = input(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);

  readonly selectedDay = computed(() => toDateInput(this.businessDate()));

  readonly selectIso = output<string>();
  readonly shiftWeek = output<-1 | 1>();
  readonly shiftMonth = output<-1 | 1>();
  readonly toggleCalendar = output<void>();
  readonly goToday = output<void>();
  readonly dayPicked = output<Date | null>();

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
}
