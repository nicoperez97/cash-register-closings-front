import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
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
import { BusyLabelComponent } from '../../shared/components/busy-label';
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
} from './reservations-api.service';
import { ReservationsInboxService } from './reservations-inbox.service';
import { isActiveReservationStatus } from './reservation-status';

type ReservationNoteDialogData = {
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
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="busy()"
        (click)="save()"
      >
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
  styles: [
    `
      .req-panel {
        padding: 1rem 1.1rem 1.05rem;
        margin-bottom: 0.85rem;
      }

      .req-panel--closed {
        padding: 0.7rem 1rem 0.75rem;
        margin-bottom: 0.7rem;
      }

      .req-panel--closed .req-panel__head {
        margin-bottom: 0;
        align-items: center;
        gap: 0.55rem;
      }

      .req-panel--closed:has(.req-card) .req-panel__head {
        margin-bottom: 0.7rem;
      }

      .req-panel--closed .guy-section-title {
        margin: 0;
        font-size: 0.98rem;
      }

      .req-panel__lead {
        margin: 0.15rem 0 0;
        max-width: 36rem;
        line-height: 1.35;
      }

      .req-spin {
        animation: req-spin 0.8s linear infinite;
      }

      @keyframes req-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .req-list--hidden {
        display: none;
      }

      .req-panel__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.75rem;
      }

      .req-panel__intro {
        min-width: 0;
        flex: 1 1 auto;
      }

      .req-panel__tools {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 0.75rem 1rem;
      }

      .req-panel__toggles {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.55rem 0.85rem;
      }

      .req-panel__links {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
      }

      .req-areas {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.55rem 0.85rem;
        padding: 0.15rem 0.2rem 0.15rem 0.75rem;
        border-left: 1px solid color-mix(in srgb, var(--guy-muted, #5f6f76) 28%, transparent);
      }

      .req-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.55rem;
      }

      .req-card {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem 1rem;
        padding: 0.85rem 0.95rem;
        border-radius: 1rem;
        border: 1px solid color-mix(in srgb, var(--guy-primary, #1d65a0) 22%, transparent);
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 6%, #fff);
      }

      .req-card__main {
        display: grid;
        gap: 0.28rem;
        min-width: 14rem;
        flex: 1 1 16rem;
      }

      .req-card__main strong {
        font-size: 1.02rem;
      }

      .req-card__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
      }

      .req-chip {
        display: inline-flex;
        align-items: center;
        min-height: 1.45rem;
        padding: 0.1rem 0.55rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 10%, #fff);
        color: color-mix(in srgb, var(--guy-ink, #1b2420) 82%, #5f6f76);
        font-size: 0.75rem;
        font-weight: 650;
      }

      .req-chip--out {
        background: color-mix(in srgb, #c17a2a 16%, #fff);
      }

      .req-card__contact {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.28rem 0.35rem;
        font-size: 0.8rem;
        color: var(--guy-muted, #5f6f76);
      }

      .req-card__contact a {
        color: inherit;
        text-decoration: none;
      }

      .req-card__contact a:hover {
        color: var(--guy-primary, #1d65a0);
        text-decoration: underline;
      }

      .req-card__comment {
        display: block;
        margin-top: 0.1rem;
        padding: 0.4rem 0.55rem;
        border-radius: 0.55rem;
        background: color-mix(in srgb, var(--guy-ink, #1b2420) 5%, #fff);
        color: var(--guy-ink, #1b2420);
        font-size: 0.82rem;
        font-style: italic;
        line-height: 1.35;
      }

      .req-card__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-left: auto;
      }

      .req-btn,
      .req-ig,
      .req-copy {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
        min-height: 2.25rem;
        padding: 0.35rem 0.85rem;
        border-radius: 999px;
        font: inherit;
        font-size: 0.82rem;
        font-weight: 700;
        cursor: pointer;
        text-decoration: none;
      }

      .req-btn {
        border: 1px solid transparent;
      }

      .req-btn--yes {
        background: color-mix(in srgb, var(--guy-green, #2e7d32) 92%, #0f2a1a);
        color: #fff;
      }

      .req-btn--yes-ig {
        background: #c13584;
        color: #fff;
        border: 1px solid transparent;
      }

      .req-btn--yes-ig mat-icon {
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
      }

      .req-btn--no {
        background: transparent;
        border-color: color-mix(in srgb, #c62828 45%, transparent);
        color: #c62828;
      }

      .req-ig {
        appearance: none;
        border: 1px solid color-mix(in srgb, #c13584 40%, transparent);
        color: #c13584;
        background: #fff;
      }

      .req-copy {
        appearance: none;
        border: 1px solid color-mix(in srgb, var(--guy-muted, #5f6f76) 40%, transparent);
        color: var(--guy-text, #1a1a1a);
        background: #fff;
      }

      .req-ig mat-icon,
      .req-copy mat-icon {
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
      }

      :host-context(html[data-theme='dark']) .req-card {
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 16%, var(--guy-card, #1a1f1c));
      }

      :host-context(html[data-theme='dark']) .req-chip {
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 22%, var(--guy-card, #1a1f1c));
        color: var(--guy-ink, #e8eeea);
      }

      :host-context(html[data-theme='dark']) .req-chip--out {
        background: color-mix(in srgb, #c17a2a 28%, var(--guy-card, #1a1f1c));
      }

      :host-context(html[data-theme='dark']) .req-card__comment {
        background: color-mix(in srgb, #fff 8%, var(--guy-card, #1a1f1c));
        color: var(--guy-ink, #e8eeea);
      }

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
        background: #fff;
        color: var(--guy-navy, #003366);
        border-color: color-mix(in srgb, var(--guy-navy, #003366) 22%, #c5d0c8);
        box-shadow: none;
      }

      .floor-public-btn--ghost:hover {
        background: color-mix(in srgb, var(--guy-navy, #003366) 6%, #fff);
        border-color: color-mix(in srgb, var(--guy-navy, #003366) 45%, transparent);
      }

      .floor-week {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        align-items: center;
        gap: 0.25rem;
        margin-bottom: 0.85rem;
      }

      .floor-week__nav {
        display: contents;
      }

      .floor-week__nav > :first-child {
        grid-column: 1;
      }

      .floor-week__nav > :last-child {
        grid-column: 3;
      }

      .floor-week__days {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: 0.35rem;
        grid-column: 2;
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
        grid-column: 4;
        justify-self: start;
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
          grid-template-columns: 1fr;
          gap: 0.45rem;
        }

        .floor-week__nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.35rem;
          grid-column: 1;
        }

        .floor-week__nav > :first-child,
        .floor-week__nav > :last-child {
          grid-column: auto;
        }

        .floor-week__days {
          grid-column: 1;
        }

        .floor-week__today {
          grid-column: auto;
          margin-left: 0;
          flex: 1;
        }
      }

      @media (max-width: 720px) {
        .req-panel,
        .req-panel--closed,
        .floor-panel {
          padding: 0.7rem 0.75rem 0.8rem;
        }

        .req-panel__head,
        .req-panel--closed .req-panel__head,
        .floor-panel__head {
          flex-direction: column;
          align-items: stretch;
          justify-content: flex-start;
          gap: 0.55rem;
        }

        .req-panel__intro {
          flex: 0 0 auto;
        }

        .req-panel .guy-section-title,
        .floor-panel .guy-section-title {
          margin-bottom: 0.2rem;
        }

        .req-panel__lead {
          max-width: none;
        }

        .req-panel__tools {
          width: 100%;
          flex-direction: column;
          align-items: stretch;
          justify-content: flex-start;
          gap: 0.55rem;
        }

        .req-panel__toggles {
          display: grid;
          width: 100%;
          grid-template-columns: 1fr;
          gap: 0.4rem;
          padding: 0.5rem 0.65rem;
          border-radius: 12px;
          background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 80%, #fff);
        }

        .req-areas {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.4rem 0.65rem;
          padding: 0.4rem 0 0;
          border-left: 0;
          border-top: 1px solid color-mix(in srgb, var(--guy-muted, #5f6f76) 22%, transparent);
        }

        .req-panel__links,
        .floor-public-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          width: 100%;
          gap: 0.45rem;
        }

        .req-panel__links > *,
        .floor-public-actions > * {
          min-width: 0;
          width: 100%;
          justify-content: center;
        }

        .req-panel__links .floor-public-btn:last-child:nth-child(odd) {
          grid-column: 1 / -1;
        }

        .floor-public-btn {
          width: 100%;
          min-height: 2.55rem;
          padding: 0.45rem 0.5rem;
          font-size: 0.78rem;
          box-sizing: border-box;
        }

        .req-card__main {
          min-width: 0;
          flex: 1 1 100%;
        }

        .req-card__actions {
          width: 100%;
          margin-left: 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
        }

        .req-card__actions .req-btn--yes-ig {
          grid-column: 1 / -1;
        }

        .floor-head-meta {
          width: 100%;
        }

        .floor-head-meta > .text-muted {
          display: none;
        }

        .floor-head-tools {
          width: 100%;
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.45rem;
        }

        .floor-cal-toggle {
          width: 100%;
          min-height: 2.55rem;
        }

        .floor-date {
          display: none;
        }

        .floor-form {
          grid-template-columns: 1fr 1fr;
        }

        .floor-form > mat-form-field:first-child,
        .floor-form button[type='submit'],
        .floor-area-toggle {
          grid-column: 1 / -1;
        }

        .floor-week__day {
          min-height: 3.85rem;
          padding: 0.35rem 0.08rem;
        }

        .floor-week__label {
          font-size: 0.6rem;
        }

        .floor-week__guests--empty {
          display: none;
        }

        .floor-card {
          flex-direction: column;
          align-items: stretch;
        }

        .floor-card__actions {
          width: 100%;
          justify-content: stretch;
        }

        .floor-card__actions > * {
          flex: 1 1 auto;
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

      .floor-notice {
        margin: 0.85rem 0 1rem;
        padding: 0.85rem 0.9rem;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 85%, transparent);
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 6%, var(--guy-card, #fff));
      }

      .floor-notice__head {
        display: flex;
        align-items: flex-start;
        gap: 0.55rem;
        margin-bottom: 0.65rem;
      }

      .floor-notice__head mat-icon {
        color: var(--guy-primary, #1d65a0);
        margin-top: 0.1rem;
      }

      .floor-notice__head strong {
        display: block;
        font-size: 0.95rem;
      }

      .floor-notice__head span {
        display: block;
      }

      .floor-notice__field {
        width: 100%;
      }

      .floor-notice__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-top: 0.15rem;
      }

      .floor-notice__preview {
        margin: 0;
        white-space: pre-line;
        line-height: 1.45;
      }

      .floor-notice__empty {
        margin: 0;
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

      .floor-card--seated {
        opacity: 0.78;
        border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 40%, var(--guy-border, #d7e0d9));
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 6%, #fff);
      }

      .floor-card--new {
        outline: 2px solid color-mix(in srgb, var(--guy-green, #2e7d32) 75%, transparent);
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--guy-green, #2e7d32) 18%, transparent);
      }

      .floor-num {
        color: var(--guy-primary, #1d65a0);
        margin-right: 0.25rem;
        font-variant-numeric: tabular-nums;
      }

      .floor-badge {
        display: inline-block;
        margin-left: 0.4rem;
        padding: 0.1rem 0.4rem;
        border-radius: 999px;
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--guy-primary, #1d65a0);
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 12%, #fff);
        vertical-align: middle;
      }

      .floor-card__actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.25rem;
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

      .floor-card__note {
        display: block;
        margin-top: 0.2rem;
        font-size: 0.8rem !important;
        color: var(--guy-navy, #003366) !important;
        white-space: pre-wrap;
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
