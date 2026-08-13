import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
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
  ReservationRow,
  ReservationsApiService,
  ReservationsDaySummary,
  ReservationDaySettings,
} from './reservations-api.service';
import { ReservationsInboxService } from './reservations-inbox.service';
import {
  ReservationRequestsPanelComponent,
  ReservationRequestAccepted,
} from './reservation-requests-panel';
import { ReservationDayNoticeComponent } from './reservation-day-notice';
import { ReservationFloorNavComponent } from './reservation-floor-nav';
import { ReservationComposeFormComponent, ReservationComposeSaved } from './reservation-compose-form';
import { ReservationFloorListComponent } from './reservation-floor-list';
import {
  addDaysIso,
  buildCalendarCells,
  buildWeekDays,
  daysInMonth,
  monthKeyFromIso,
  startOfWeekIso,
  toDateString,
} from './reservation-date.util';

@Component({
  selector: 'app-reservations-page',
  imports: [
    MatSnackBarModule,
    PageHeaderComponent,
    ReservationRequestsPanelComponent,
    ReservationDayNoticeComponent,
    ReservationFloorNavComponent,
    ReservationComposeFormComponent,
    ReservationFloorListComponent,
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
      <app-reservation-floor-nav
        [businessDate]="businessDate()"
        [dateLabel]="dateLabel()"
        [shopSlug]="shopSlug()"
        [showCalendar]="showCalendar()"
        [weekDays]="weekDays()"
        [calendarMonthLabel]="calendarMonthLabel()"
        [calendarCells]="calendarCells()"
        (selectIso)="selectIso($event)"
        (shiftWeek)="shiftWeek($event)"
        (shiftMonth)="shiftMonth($event)"
        (toggleCalendar)="toggleCalendar()"
        (goToday)="goToday()"
        (dayPicked)="onDayPicked($event)"
      />

      <div
        id="reservation-compose-anchor"
        class="floor-compose-anchor"
        [class.floor-compose-anchor--pulse]="composePulse()"
      >
        <app-reservation-compose-form
          [businessDate]="businessDate()"
          [canManage]="canManage()"
          [daySettings]="savedDaySettings()"
          (saved)="onReservationSaved($event)"
        />
      </div>

      <app-reservation-day-notice
        [businessDate]="businessDate()"
        [canManage]="canManage()"
        [notice]="savedNotice()"
        [daySettings]="savedDaySettings()"
        (noticeUpdated)="savedNotice.set($event)"
        (daySettingsUpdated)="savedDaySettings.set($event)"
      />

      <app-reservation-floor-list
        [reservations]="reservations()"
        [canManage]="canManage()"
        [highlightedId]="highlightedReservationId()"
        (changed)="onFloorListChanged()"
      />
    </section>
  `,
  styleUrl: './reservations-page.scss',
})
export class ReservationsPage implements OnInit, OnDestroy {
  private readonly api = inject(ReservationsApiService);
  private readonly inbox = inject(ReservationsInboxService);
  private readonly snack = inject(MatSnackBar);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);

  readonly businessDate = signal(this.defaultDate());
  readonly reservations = signal<ReservationRow[]>([]);
  readonly daySummary = signal<Record<string, ReservationsDaySummary>>({});
  readonly showCalendar = signal(false);
  readonly calendarMonth = signal(monthKeyFromIso(this.defaultDate()));
  readonly todayIso = signal(this.defaultDate());
  readonly savedNotice = signal<string | null>(null);
  readonly savedDaySettings = signal<ReservationDaySettings | null>(null);
  readonly shopSlug = computed(() => this.shops.selectedShop()?.slug ?? '');
  readonly highlightedReservationId = signal<string | null>(null);
  readonly composePulse = signal(false);
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  private composePulseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly floorPanel = viewChild<ElementRef<HTMLElement>>('floorPanel');
  private readonly composeForm = viewChild(ReservationComposeFormComponent);

  readonly dateLabel = computed(() => formatIsoDateDisplay(this.businessDate()));

  readonly weekDays = computed(() =>
    buildWeekDays(this.businessDate(), this.todayIso(), this.daySummary()),
  );

  readonly calendarMonthLabel = computed(() => {
    const [y, m] = this.calendarMonth().split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  });

  readonly calendarCells = computed(() =>
    buildCalendarCells(
      this.calendarMonth(),
      this.businessDate(),
      this.todayIso(),
      this.daySummary(),
    ),
  );

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
    if (this.composePulseTimer) {
      clearTimeout(this.composePulseTimer);
      this.composePulseTimer = null;
    }
  }

  onRequestAccepted(event: ReservationRequestAccepted): void {
    const day = event.businessDate;
    if (day && day !== this.businessDate()) {
      this.businessDate.set(day);
      this.calendarMonth.set(monthKeyFromIso(day));
    }
    this.loadSummary();
    this.loadReservations(() => {
      this.highlightReservation(event.reservationId);
      this.scrollToReservation(event.reservationId);
    });
  }

  onReservationSaved(event: ReservationComposeSaved): void {
    const name = event.guestName.trim() || 'Sin nombre';
    const people =
      event.partySize === 1 ? '1 persona' : `${event.partySize} personas`;
    const areaLabel = event.area === 'OUTSIDE' ? 'Afuera' : 'Adentro';
    const when = event.reservationTime ? ` · ${event.reservationTime}` : '';
    this.snack.open(`Agregada: ${name} · ${people} · ${areaLabel}${when}`, 'OK', {
      duration: 4000,
    });
    this.loadSummary();
    this.loadReservations(() => {
      this.highlightReservation(event.id);
      this.scrollToReservation(event.id);
    });
  }

  onFloorListChanged(): void {
    this.loadReservations();
    this.loadSummary();
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
    if (this.showCalendar()) {
      this.showCalendar.set(false);
    }
    this.pulseComposeForm();
    const tryFocus = (attempt = 0) => {
      const anchor =
        document.getElementById('reservation-compose-anchor') ??
        document.getElementById('reservation-compose');
      if (!anchor) {
        if (attempt < 8) {
          window.setTimeout(() => tryFocus(attempt + 1), 40 + attempt * 30);
        }
        return;
      }
      anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => {
        this.composeForm()?.focusGuestName();
      }, 280);
    };
    requestAnimationFrame(() => requestAnimationFrame(() => tryFocus()));
  }

  private pulseComposeForm(): void {
    if (this.composePulseTimer) {
      clearTimeout(this.composePulseTimer);
      this.composePulseTimer = null;
    }
    this.composePulse.set(false);
    requestAnimationFrame(() => {
      this.composePulse.set(true);
      this.composePulseTimer = setTimeout(() => {
        this.composePulse.set(false);
        this.composePulseTimer = null;
      }, 1600);
    });
  }

  private defaultDate(): string {
    const shop = this.shops.selectedShop();
    return resolveShopCalendarDate(new Date(), {
      timezone: shop?.timezone,
    });
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
    }, 5500);
  }

  private scrollToReservation(id: string | null): void {
    const tryScroll = (attempt = 0) => {
      const target = id ? document.getElementById(`reservation-${id}`) : null;
      const el = target ?? this.floorPanel()?.nativeElement ?? null;
      if (!el) {
        if (attempt < 8) {
          window.setTimeout(() => tryScroll(attempt + 1), 50 + attempt * 40);
        }
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    // Esperar a que Angular pinte la lista recargada.
    requestAnimationFrame(() => requestAnimationFrame(() => tryScroll()));
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

  private loadReservations(afterLoad?: () => void): void {
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
        afterLoad?.();
      },
      error: () => this.snack.open('No se pudieron cargar las reservas', 'OK', { duration: 3000 }),
    });
  }
}
