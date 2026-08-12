import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import {
  formatIsoDateDisplay,
  resolveShopCalendarDate,
} from '../../core/shop/business-date';
import { usePageRefresh } from '../../core/page-refresh.service';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import {
  ReservationArea,
  ReservationRow,
  ReservationsApiService,
  ReservationsDaySummary,
  ReservationDaySettings,
} from './reservations-api.service';
import { ReservationsInboxService } from './reservations-inbox.service';
import { isActiveReservationStatus } from './reservation-status';
import {
  ReservationNoteDialogComponent,
  ReservationNoteDialogData,
} from './reservation-note-dialog';
import {
  ReservationRequestsPanelComponent,
  ReservationRequestAccepted,
} from './reservation-requests-panel';
import { ReservationDayNoticeComponent } from './reservation-day-notice';
import { copyTextNow, igConfirmMessage } from './reservation-messaging.util';

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
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatTimepickerModule,
    MatTooltipModule,
    PageHeaderComponent,
    ReservationRequestsPanelComponent,
    ReservationDayNoticeComponent,
  ],
  template: `
    <app-page-header
      title="Reservas"
      [subtitle]="shops.selectedShop()?.name ?? 'Local'"
      [actionLabel]="canManage() ? 'Nueva reserva' : ''"
      actionIcon="add"
      (action)="focusReservationForm()"
    />

    @if (canManage()) {
      <app-reservation-requests-panel (accepted)="onRequestAccepted($event)" />
    }

    <section class="panel-card floor-panel" #floorPanel>
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
            (click)="shiftWeek(-1)"
          >
            <mat-icon>chevron_left</mat-icon>
          </button>
          <button mat-stroked-button type="button" class="floor-week__today" (click)="goToday()">
            Hoy
          </button>
          <button
            mat-icon-button
            type="button"
            aria-label="Semana siguiente"
            (click)="shiftWeek(1)"
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

      <app-reservation-day-notice
        [businessDate]="businessDate()"
        [canManage]="canManage()"
        [notice]="savedNotice()"
        [daySettings]="savedDaySettings()"
        (noticeUpdated)="savedNotice.set($event)"
        (daySettingsUpdated)="savedDaySettings.set($event)"
      />

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
          <li
            class="floor-card"
            [class.floor-card--out]="r.area === 'OUTSIDE'"
            [class.floor-card--seated]="r.status === 'SEATED'"
            [class.floor-card--new]="highlightedReservationId() === r.id"
          >
            <div class="floor-card__main">
              <strong>
                @if (r.number) {
                  <span class="floor-num">#{{ r.number }}</span>
                }
                {{ r.guestName || 'Reserva' }}
                @if (r.status === 'SEATED') {
                  <span class="floor-badge">Marcada</span>
                }
              </strong>
              <span>
                {{ r.partySize }} pers.
                · {{ r.area === 'OUTSIDE' ? 'Afuera' : 'Adentro' }}
                @if (r.reservationTime) {
                  · {{ r.reservationTime }}
                }
              </span>
              @if (r.notes?.trim()) {
                <span class="floor-card__note">{{ r.notes }}</span>
              }
            </div>
            @if (canManage()) {
              <div class="floor-card__actions">
                <button
                  type="button"
                  class="req-copy"
                  matTooltip="Copiar mensaje de confirmación"
                  (click)="copyReservationMessage(r)"
                >
                  <mat-icon>content_copy</mat-icon>
                  Copiar
                </button>
                @if (instagramFromNotes(r.notes); as ig) {
                  <button
                    type="button"
                    class="req-ig"
                    matTooltip="Abrir perfil de Instagram"
                    (click)="openReservationInstagram(r)"
                  >
                    <mat-icon>photo_camera</mat-icon>
                    IG
                  </button>
                }
                @if (r.status === 'CONFIRMED') {
                  <button mat-stroked-button type="button" (click)="markReservation(r, true)">
                    Marcar
                  </button>
                }
                @if (r.status === 'SEATED') {
                  <button mat-stroked-button type="button" (click)="markReservation(r, false)">
                    Desmarcar
                  </button>
                }
                <button
                  mat-icon-button
                  type="button"
                  [matTooltip]="r.notes?.trim() ? 'Editar nota' : 'Agregar nota'"
                  [attr.aria-label]="r.notes?.trim() ? 'Editar nota' : 'Agregar nota'"
                  (click)="editNote(r)"
                >
                  <mat-icon>{{ r.notes?.trim() ? 'sticky_note_2' : 'note_add' }}</mat-icon>
                </button>
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
  styleUrl: './reservations-page.scss',
})
export class ReservationsPage implements OnInit, OnDestroy {
  private readonly api = inject(ReservationsApiService);
  private readonly inbox = inject(ReservationsInboxService);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);

  readonly weekdayHeaders = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  readonly businessDate = signal(this.defaultDate());
  readonly reservations = signal<ReservationRow[]>([]);
  readonly daySummary = signal<Record<string, ReservationsDaySummary>>({});
  readonly showCalendar = signal(false);
  readonly calendarMonth = signal(monthKeyFromIso(this.defaultDate()));
  readonly todayIso = signal(this.defaultDate());
  readonly savedNotice = signal<string | null>(null);
  readonly savedDaySettings = signal<ReservationDaySettings | null>(null);

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
  readonly highlightedReservationId = signal<string | null>(null);
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly floorPanel = viewChild<ElementRef<HTMLElement>>('floorPanel');

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
    const today = this.defaultDate();
    this.todayIso.set(today);
    this.businessDate.set(today);
    this.calendarMonth.set(monthKeyFromIso(today));
    this.loadReservations();
    this.loadSummary();
  }

  ngOnDestroy(): void {
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }
  }

  onRequestAccepted(event: ReservationRequestAccepted): void {
    const day = event.businessDate;
    if (day && day !== this.businessDate()) {
      this.businessDate.set(day);
      this.calendarMonth.set(monthKeyFromIso(day));
    }
    this.highlightReservation(event.reservationId);
    this.loadReservations();
    this.loadSummary();
    this.scrollToDayReservations();
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

  instagramFromNotes(notes?: string | null): { handle: string; url: string; dmUrl: string } | null {
    const m = String(notes ?? '').match(/(?:^|[\s·])@([A-Za-z0-9._]{1,30})\b/);
    const handle = m?.[1]?.replace(/\.+$/, '');
    if (!handle) return null;
    return {
      handle,
      url: `https://www.instagram.com/${handle}/`,
      dmUrl: `https://www.instagram.com/${handle}/`,
    };
  }

  copyReservationMessage(r: ReservationRow): void {
    const copied = copyTextNow(this.reservationConfirmText(r));
    this.snack.open(
      copied ? 'Mensaje copiado' : 'No se pudo copiar. Intentá de nuevo',
      'OK',
      { duration: 2500 },
    );
  }

  openReservationInstagram(r: ReservationRow): void {
    const ig = this.instagramFromNotes(r.notes);
    if (!ig) return;
    copyTextNow(this.reservationConfirmText(r));
    window.open(ig.dmUrl, '_blank', 'noopener');
  }

  private reservationConfirmText(r: ReservationRow): string {
    const iso = r.businessDate?.slice(0, 10) ?? '';
    const [y, m, d] = iso.split('-');
    const label = d && m ? `${d}/${m}${y ? `/${y}` : ''}` : iso;
    const when = r.reservationTime ? `${label} · ${r.reservationTime}` : label;
    const shop = this.shops.selectedShop()?.name ?? 'el local';
    return igConfirmMessage(
      {
        guestName: r.guestName || 'Reserva',
        partySize: r.partySize,
        when,
        area: r.area === 'OUTSIDE' ? 'Afuera' : 'Adentro',
        accepted: true,
      },
      shop,
    );
  }

  private highlightReservation(id: string | null): void {
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }
    this.highlightedReservationId.set(id);
    if (!id) return;
    this.highlightTimer = setTimeout(() => {
      this.highlightedReservationId.set(null);
      this.highlightTimer = null;
    }, 4500);
  }

  private scrollToDayReservations(): void {
    const el = this.floorPanel()?.nativeElement;
    if (!el) return;
    queueMicrotask(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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
        const notice = String(res.notice ?? '').trim() || null;
        this.savedNotice.set(notice);
        this.savedDaySettings.set(res.daySettings ?? null);
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

  markReservation(row: ReservationRow, marked: boolean): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage()) return;
    const status = marked ? 'SEATED' : 'CONFIRMED';
    this.api.updateReservation(shopId, row.id, { status }).subscribe({
      next: () => {
        this.loadReservations();
        this.inbox.refresh();
        this.snack.open(
          marked
            ? `${row.guestName || 'Reserva'} marcada`
            : `${row.guestName || 'Reserva'} desmarcada`,
          'OK',
          { duration: 2000 },
        );
      },
      error: () => this.snack.open('No se pudo actualizar', 'OK', { duration: 3000 }),
    });
  }

  editNote(row: ReservationRow): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage()) return;
    this.dialogTitle
      .track(
        this.dialog.open(ReservationNoteDialogComponent, {
          width: '420px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { shopId, reservation: row },
        }),
        'Nota de reserva',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.loadReservations();
      });
  }
}
