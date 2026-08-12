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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
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
  ReservationRequestRow,
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

type DayFormMode = 'normal' | 'closed' | 'no-inside' | 'no-outside';

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
    MatSlideToggleModule,
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

    @if (canManage()) {
      <section class="panel-card req-panel" [class.req-panel--closed]="!signupOpen()">
        <div class="req-panel__head">
          <div class="req-panel__intro">
            <h2 class="guy-section-title">Solicitudes web</h2>
            <p class="text-muted small req-panel__lead">
              @if (signupOpen()) {
                @if (pendingRequests().length) {
                  {{ pendingRequests().length }} para aceptar o rechazar · aviso por mail
                } @else {
                  Cuando alguien reserve desde el link, aparece acá
                }
              } @else {
                Cerrado · ingreso por orden de llegada
                @if (pendingRequests().length) {
                  · {{ pendingRequests().length }} pendiente{{ pendingRequests().length === 1 ? '' : 's' }} por resolver
                }
              }
            </p>
          </div>
          <div class="req-panel__tools">
            <div class="req-panel__toggles">
              <mat-slide-toggle
                color="primary"
                [checked]="signupOpen()"
                [disabled]="signupBusy()"
                (change)="toggleSignup($event.checked)"
              >
                {{ signupOpen() ? 'Abierto' : 'Cerrado' }}
              </mat-slide-toggle>
              <div class="req-areas">
                <mat-slide-toggle
                  color="primary"
                  [checked]="insideOpen()"
                  [disabled]="signupBusy() || (insideOpen() && !outsideOpen())"
                  (change)="toggleArea('INSIDE', $event.checked)"
                >
                  Adentro
                </mat-slide-toggle>
                <mat-slide-toggle
                  color="primary"
                  [checked]="outsideOpen()"
                  [disabled]="signupBusy() || (outsideOpen() && !insideOpen())"
                  (change)="toggleArea('OUTSIDE', $event.checked)"
                >
                  Afuera
                </mat-slide-toggle>
              </div>
            </div>
            <div class="req-panel__links">
              @if (shopSlug()) {
                <a
                  class="floor-public-btn"
                  [href]="signupUrl()"
                  target="_blank"
                  rel="noopener"
                  matTooltip="Formulario público"
                >
                  <mat-icon>link</mat-icon>
                  <span class="req-panel__btn-label">Formulario público</span>
                </a>
                <button
                  type="button"
                  class="floor-public-btn floor-public-btn--ghost"
                  (click)="copySignupUrl()"
                  matTooltip="Copiar link"
                >
                  <mat-icon>content_copy</mat-icon>
                  <span class="req-panel__btn-label">Copiar link</span>
                </button>
              }
              <button
                type="button"
                class="floor-public-btn floor-public-btn--ghost"
                (click)="reloadRequests()"
                [disabled]="requestsBusy()"
                matTooltip="Recargar solicitudes"
              >
                <mat-icon [class.req-spin]="requestsBusy()">refresh</mat-icon>
                <span class="req-panel__btn-label">Recargar</span>
              </button>
            </div>
          </div>
        </div>

        <ul class="req-list" [class.req-list--hidden]="!signupOpen() && !pendingRequests().length">
          @for (req of pendingRequests(); track req.id) {
            <li class="req-card">
              <div class="req-card__main">
                <strong>{{ req.guestName }}</strong>
                <div class="req-card__chips">
                  <span class="req-chip">
                    {{ req.partySize }} {{ req.partySize === 1 ? 'persona' : 'personas' }}
                  </span>
                  <span class="req-chip" [class.req-chip--out]="req.area === 'OUTSIDE'">
                    {{ req.area === 'OUTSIDE' ? 'Afuera' : 'Adentro' }}
                  </span>
                  <span class="req-chip">{{ requestWhen(req) }}</span>
                </div>
                <span class="req-card__contact">
                  <a [href]="'mailto:' + req.guestEmail">{{ req.guestEmail }}</a>
                  @if (req.instagramHandle) {
                    <span>·</span>
                    <a
                      [href]="req.instagramUrl || 'https://www.instagram.com/' + req.instagramHandle + '/'"
                      target="_blank"
                      rel="noopener"
                    >@{{ req.instagramHandle }}</a>
                  }
                </span>
                @if (req.guestComment) {
                  <span class="req-card__comment">{{ req.guestComment }}</span>
                }
              </div>
              <div class="req-card__actions">
                @if (req.instagramHandle) {
                  <button
                    type="button"
                    class="req-ig"
                    matTooltip="Copiar mensaje y abrir perfil"
                    (click)="openGuestInstagram(req, true)"
                  >
                    <mat-icon>photo_camera</mat-icon>
                    IG
                  </button>
                }
                <button
                  type="button"
                  class="req-btn req-btn--no"
                  [disabled]="busyRequestId() === req.id"
                  (click)="rejectRequest(req)"
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  class="req-btn req-btn--yes"
                  [disabled]="busyRequestId() === req.id"
                  (click)="acceptRequest(req)"
                >
                  Aceptar
                </button>
                @if (req.instagramHandle) {
                  <button
                    type="button"
                    class="req-btn req-btn--yes-ig"
                    [disabled]="busyRequestId() === req.id"
                    matTooltip="Aceptar, copiar mensaje y abrir Instagram"
                    (click)="acceptRequest(req, true)"
                  >
                    <mat-icon>photo_camera</mat-icon>
                    Aceptar e IG
                  </button>
                }
              </div>
            </li>
          } @empty {
            @if (signupOpen()) {
              <li class="floor-empty">Sin solicitudes pendientes</li>
            }
          }
        </ul>
      </section>
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

      <div class="floor-notice">
        <div class="floor-notice__head">
          <mat-icon>campaign</mat-icon>
          <div>
            <strong>Aviso del día</strong>
            <span class="text-muted small">Se muestra en la pantalla pública</span>
          </div>
        </div>
        @if (canManage()) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="floor-notice__field">
            <mat-label>Mensaje para la web pública</mat-label>
            <textarea
              matInput
              rows="2"
              [ngModel]="noticeDraft()"
              (ngModelChange)="noticeDraft.set($event)"
              maxlength="2000"
              placeholder="Ej: Hoy solo menú del día · Terraza cerrada por lluvia"
            ></textarea>
          </mat-form-field>
          <div class="floor-notice__actions">
            <button
              mat-stroked-button
              type="button"
              [disabled]="savingNotice() || !noticeDirty()"
              (click)="saveNotice()"
            >
              <mat-icon>save</mat-icon>
              {{ noticeDraft().trim() ? 'Guardar aviso' : 'Quitar aviso' }}
            </button>
            @if (savedNotice()) {
              <button mat-button type="button" [disabled]="savingNotice()" (click)="clearNotice()">
                Limpiar
              </button>
            }
          </div>
          <div class="floor-day-settings">
            <div class="floor-day-settings__row">
              <span class="floor-day-settings__label">Formulario web</span>
              <mat-button-toggle-group
                class="floor-form-mode-toggle"
                hideSingleSelectionIndicator
                [value]="dayFormMode()"
                [disabled]="savingDaySettings()"
                (change)="onDayFormMode($event.value)"
                aria-label="Configuración del formulario web para este día"
              >
                <mat-button-toggle value="normal">Normal</mat-button-toggle>
                <mat-button-toggle value="closed">Cerrar</mat-button-toggle>
                <mat-button-toggle value="no-inside">Sin adentro</mat-button-toggle>
                <mat-button-toggle value="no-outside">Sin afuera</mat-button-toggle>
              </mat-button-toggle-group>
            </div>
          </div>
        } @else if (savedNotice()) {
          <p class="floor-notice__preview">{{ savedNotice() }}</p>
        } @else {
          <p class="floor-notice__empty text-muted small">Sin aviso para este día</p>
        }
      </div>

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
  readonly noticeDraft = signal('');
  readonly savedNotice = signal<string | null>(null);
  readonly savingNotice = signal(false);
  readonly savedDaySettings = signal<ReservationDaySettings | null>(null);
  readonly daySignupOverride = signal<boolean | null>(null);
  readonly dayInsideOverride = signal<boolean | null>(null);
  readonly dayOutsideOverride = signal<boolean | null>(null);
  readonly savingDaySettings = signal(false);

  readonly dayFormMode = computed((): DayFormMode => {
    if (this.daySignupOverride() === false) return 'closed';
    if (this.dayInsideOverride() === false) return 'no-inside';
    if (this.dayOutsideOverride() === false) return 'no-outside';
    return 'normal';
  });

  readonly noticeDirty = computed(
    () => this.noticeDraft().trim() !== (this.savedNotice() ?? '').trim(),
  );

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
  readonly pendingRequests = signal<ReservationRequestRow[]>([]);
  readonly busyRequestId = signal<string | null>(null);
  readonly signupBusy = signal(false);
  readonly requestsBusy = signal(false);
  readonly highlightedReservationId = signal<string | null>(null);
  private requestsPoll: ReturnType<typeof setInterval> | null = null;
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly floorPanel = viewChild<ElementRef<HTMLElement>>('floorPanel');
  readonly signupOpen = computed(
    () => this.shops.selectedShop()?.reservationSignupEnabled !== false,
  );
  readonly insideOpen = computed(
    () => this.shops.selectedShop()?.reservationInsideEnabled !== false,
  );
  readonly outsideOpen = computed(
    () => this.shops.selectedShop()?.reservationOutsideEnabled !== false,
  );

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
      this.loadRequests();
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
    this.loadRequests();
    this.requestsPoll = setInterval(() => this.loadRequests(), 45_000);
  }

  ngOnDestroy(): void {
    if (this.requestsPoll) {
      clearInterval(this.requestsPoll);
      this.requestsPoll = null;
    }
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }
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

  signupUrl(): string {
    const slug = this.shopSlug();
    return `${window.location.origin}/reservar/${encodeURIComponent(slug)}`;
  }

  async copySignupUrl(): Promise<void> {
    await this.copyText(this.signupUrl(), 'Link del formulario copiado');
  }

  toggleArea(area: ReservationArea, enabled: boolean): void {
    const shop = this.shops.selectedShop();
    const shopId = this.shops.selectedShopId();
    if (!shop || !shopId || this.signupBusy()) return;
    const inside = area === 'INSIDE' ? enabled : this.insideOpen();
    const outside = area === 'OUTSIDE' ? enabled : this.outsideOpen();
    if (!inside && !outside) {
      this.snack.open('Dejá al menos un sector habilitado', 'OK', { duration: 2800 });
      return;
    }
    this.signupBusy.set(true);
    this.api.setReservationAreasEnabled(shopId, { inside, outside }).subscribe({
      next: (res) => {
        this.signupBusy.set(false);
        this.shops.upsertShop({
          ...shop,
          reservationInsideEnabled: res.reservationInsideEnabled,
          reservationOutsideEnabled: res.reservationOutsideEnabled,
        });
        this.auth.scheduleRefreshMe(200);
        this.snack.open(
          area === 'OUTSIDE'
            ? res.reservationOutsideEnabled
              ? 'Sector afuera habilitado'
              : 'Sector afuera deshabilitado'
            : res.reservationInsideEnabled
              ? 'Sector adentro habilitado'
              : 'Sector adentro deshabilitado',
          'OK',
          { duration: 2200 },
        );
      },
      error: (err) => {
        this.signupBusy.set(false);
        const msg =
          (err?.error?.message as string | string[] | undefined) ??
          'No se pudo cambiar el sector';
        this.snack.open(Array.isArray(msg) ? msg[0] : String(msg), 'OK', { duration: 3000 });
      },
    });
  }

  toggleSignup(enabled: boolean): void {
    const shop = this.shops.selectedShop();
    const shopId = this.shops.selectedShopId();
    if (!shop || !shopId || this.signupBusy()) return;
    this.signupBusy.set(true);
    this.api.setReservationSignupEnabled(shopId, enabled).subscribe({
      next: (res) => {
        this.signupBusy.set(false);
        this.shops.upsertShop({
          ...shop,
          reservationSignupEnabled: res.reservationSignupEnabled,
        });
        this.auth.scheduleRefreshMe(200);
        this.snack.open(
          res.reservationSignupEnabled
            ? 'Formulario público abierto'
            : 'Formulario público cerrado',
          'OK',
          { duration: 2200 },
        );
      },
      error: () => {
        this.signupBusy.set(false);
        this.snack.open('No se pudo cambiar el formulario', 'OK', { duration: 3000 });
      },
    });
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

  requestWhen(req: ReservationRequestRow): string {
    const iso = req.businessDate?.slice(0, 10) ?? '';
    const [y, m, d] = iso.split('-');
    const label = d && m ? `${d}/${m}${y ? `/${y}` : ''}` : iso;
    return req.reservationTime ? `${label} · ${req.reservationTime}` : label;
  }

  acceptRequest(req: ReservationRequestRow, openIg = false): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    if (openIg) {
      this.openGuestInstagram(req, true, { snack: false });
    }
    this.busyRequestId.set(req.id);
    this.api.acceptReservationRequest(shopId, req.id).subscribe({
      next: (row) => {
        this.busyRequestId.set(null);
        this.snack.open(
          openIg
            ? 'Reserva aceptada. Pegá el mensaje en Instagram.'
            : 'Reserva aceptada. Ya está en reservas del día.',
          'OK',
          { duration: 3200 },
        );
        const day = String(row.businessDate || req.businessDate || '').slice(0, 10);
        if (day && day !== this.businessDate()) {
          this.businessDate.set(day);
          this.calendarMonth.set(monthKeyFromIso(day));
        }
        this.highlightReservation(row.reservationId ?? null);
        this.loadRequests();
        this.loadReservations();
        this.loadSummary();
        this.inbox.refresh();
        this.scrollToDayReservations();
      },
      error: () => {
        this.busyRequestId.set(null);
        this.snack.open('No se pudo aceptar', 'OK', { duration: 3000 });
      },
    });
  }

  rejectRequest(req: ReservationRequestRow): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.busyRequestId.set(req.id);
    this.api.rejectReservationRequest(shopId, req.id).subscribe({
      next: () => {
        this.busyRequestId.set(null);
        this.snack.open('Solicitud rechazada. Se avisó por mail.', 'OK', { duration: 2800 });
        this.loadRequests();
        this.inbox.refresh();
      },
      error: () => {
        this.busyRequestId.set(null);
        this.snack.open('No se pudo rechazar', 'OK', { duration: 3000 });
      },
    });
  }

  openGuestInstagram(
    req: ReservationRequestRow,
    accepted = true,
    opts?: { snack?: boolean },
  ): void {
    if (!req.instagramHandle) return;
    const text = this.igConfirmMessage({
      guestName: req.guestName,
      partySize: req.partySize,
      when: this.requestWhen(req),
      area: req.area === 'OUTSIDE' ? 'Afuera' : 'Adentro',
      accepted,
    });
    const copied = this.copyTextNow(text);
    window.open(
      req.instagramUrl || `https://www.instagram.com/${req.instagramHandle}/`,
      '_blank',
      'noopener',
    );
    if (opts?.snack !== false) {
      this.snack.open(
        copied
          ? 'Mensaje copiado: pegalo en el chat de Instagram'
          : 'No se pudo copiar. Copiá el mensaje a mano',
        'OK',
        { duration: 2800 },
      );
    }
  }

  copyReservationMessage(r: ReservationRow): void {
    const copied = this.copyTextNow(this.reservationConfirmText(r));
    this.snack.open(
      copied ? 'Mensaje copiado' : 'No se pudo copiar. Intentá de nuevo',
      'OK',
      { duration: 2500 },
    );
  }

  openReservationInstagram(r: ReservationRow): void {
    const ig = this.instagramFromNotes(r.notes);
    if (!ig) return;
    this.copyTextNow(this.reservationConfirmText(r));
    window.open(ig.dmUrl, '_blank', 'noopener');
  }

  private reservationConfirmText(r: ReservationRow): string {
    const iso = r.businessDate?.slice(0, 10) ?? '';
    const [y, m, d] = iso.split('-');
    const label = d && m ? `${d}/${m}${y ? `/${y}` : ''}` : iso;
    const when = r.reservationTime ? `${label} · ${r.reservationTime}` : label;
    return this.igConfirmMessage({
      guestName: r.guestName || 'Reserva',
      partySize: r.partySize,
      when,
      area: r.area === 'OUTSIDE' ? 'Afuera' : 'Adentro',
      accepted: true,
    });
  }

  private igConfirmMessage(opts: {
    guestName: string;
    partySize: number;
    when: string;
    area: string;
    accepted: boolean;
  }): string {
    const shop = this.shops.selectedShop()?.name ?? 'el local';
    const first = opts.guestName.split(' ')[0] || '';
    const pers = opts.partySize === 1 ? 'persona' : 'personas';
    if (!opts.accepted) {
      return `Hola ${first}! Esta vez no pudimos confirmar tu reserva en ${shop} (${opts.when}). Gracias por escribirnos.`;
    }
    return `Hola ${first}! Te confirmamos la reserva en ${shop} (${opts.partySize} ${pers} · ${opts.area} · ${opts.when}). ¡Te esperamos!`;
  }

  reloadRequests(): void {
    this.loadRequests();
    this.inbox.refresh();
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

  private loadRequests(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.pendingRequests.set([]);
      return;
    }
    this.requestsBusy.set(true);
    this.api.listReservationRequests(shopId, 'PENDING').subscribe({
      next: (rows) => {
        this.requestsBusy.set(false);
        this.pendingRequests.set(rows ?? []);
      },
      error: () => {
        this.requestsBusy.set(false);
        this.pendingRequests.set([]);
      },
    });
  }

  /** Copia síncrona en el clic; hay que hacerlo antes de window.open o el navegador lo bloquea. */
  private copyTextNow(text: string): boolean {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    el.setSelectionRange(0, text.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    el.remove();
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }
    return ok;
  }

  private async copyText(text: string, okMsg: string, showSnack = true): Promise<void> {
    const copied = this.copyTextNow(text);
    if (showSnack) {
      this.snack.open(copied ? okMsg : 'No se pudo copiar', 'OK', { duration: 2200 });
    }
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
        this.noticeDraft.set(notice ?? '');
        this.applyDaySettings(res.daySettings ?? null);
      },
      error: () => this.snack.open('No se pudieron cargar las reservas', 'OK', { duration: 3000 }),
    });
  }

  saveNotice(): void {
    if (!this.canManage() || this.savingNotice()) return;
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const message = this.noticeDraft().trim();
    this.savingNotice.set(true);
    this.api
      .upsertDayNotice(shopId, {
        businessDate: this.businessDate(),
        message,
      })
      .subscribe({
        next: (res) => {
          this.savingNotice.set(false);
          const notice = String(res.notice ?? '').trim() || null;
          this.savedNotice.set(notice);
          this.noticeDraft.set(notice ?? '');
          this.snack.open(notice ? 'Aviso guardado' : 'Aviso quitado', 'OK', {
            duration: 2200,
          });
        },
        error: (err) => {
          this.savingNotice.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar el aviso';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  clearNotice(): void {
    this.noticeDraft.set('');
    this.saveNotice();
  }

  onDayFormMode(value: string | null | undefined): void {
    const mode = this.parseDayFormMode(value);
    if (!mode || mode === this.dayFormMode()) return;
    switch (mode) {
      case 'normal':
        this.daySignupOverride.set(null);
        this.dayInsideOverride.set(null);
        this.dayOutsideOverride.set(null);
        break;
      case 'closed':
        this.daySignupOverride.set(false);
        this.dayInsideOverride.set(null);
        this.dayOutsideOverride.set(null);
        break;
      case 'no-inside':
        this.daySignupOverride.set(null);
        this.dayInsideOverride.set(false);
        this.dayOutsideOverride.set(null);
        break;
      case 'no-outside':
        this.daySignupOverride.set(null);
        this.dayInsideOverride.set(null);
        this.dayOutsideOverride.set(false);
        break;
    }
    this.saveDaySettings(true);
  }

  private parseDayFormMode(value: string | null | undefined): DayFormMode | null {
    if (
      value === 'normal' ||
      value === 'closed' ||
      value === 'no-inside' ||
      value === 'no-outside'
    ) {
      return value;
    }
    return null;
  }

  saveDaySettings(silent = false): void {
    if (!this.canManage() || this.savingDaySettings()) return;
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.savingDaySettings.set(true);
    this.api
      .upsertDayNotice(shopId, {
        businessDate: this.businessDate(),
        signupEnabled: this.daySignupOverride(),
        insideEnabled: this.dayInsideOverride(),
        outsideEnabled: this.dayOutsideOverride(),
      })
      .subscribe({
        next: (res) => {
          this.savingDaySettings.set(false);
          this.applyDaySettings(res.daySettings ?? null);
          if (!silent) {
            this.snack.open('Formulario del día guardado', 'OK', { duration: 2200 });
          }
        },
        error: (err) => {
          this.savingDaySettings.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar el formulario';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  private applyDaySettings(settings: ReservationDaySettings | null): void {
    this.savedDaySettings.set(settings);
    this.daySignupOverride.set(settings?.signupEnabled ?? null);
    this.dayInsideOverride.set(settings?.insideEnabled ?? null);
    this.dayOutsideOverride.set(settings?.outsideEnabled ?? null);
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
