import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, Subscription, interval, merge, startWith, switchMap, tap } from 'rxjs';
import { formatIsoDateLong } from '../../core/shop/business-date';
import { publicBoardNotes } from './reservation-messaging.util';
import { normalizeLogoUrl, resolveShopLogoSrc } from '../../core/utils/drive-url';
import {
  PublicReservationsBoard,
  ReservationsApiService,
} from './reservations-api.service';
import { BoardInstallBannerComponent } from './board-install-banner';
import { BoardPwaService } from './board-pwa.service';
import {
  formatPartyMix,
  formatPartyMixItem,
  partyMixFromReservations,
} from './reservation-party-summary.util';

@Component({
  selector: 'app-public-reservations-board',
  imports: [BoardInstallBannerComponent],
  template: `
    @if (toast(); as t) {
      <div class="board-toast" role="status" aria-live="polite">
        <span class="board-toast__dot" aria-hidden="true"></span>
        {{ t }}
      </div>
    }

    @if (error()) {
      <div class="board board--error">
        <p>{{ error() }}</p>
        <button type="button" class="board__refresh" (click)="refresh()">Reintentar</button>
      </div>
    } @else if (board(); as b) {
      <div class="board" [style.--accent]="accent()">
        <header class="board__hero">
          <div class="board__glow" aria-hidden="true"></div>
          <div class="board__identity">
            @if (logoUrl()) {
              <img class="board__logo" [src]="logoUrl()!" [alt]="b.shop.name" />
            }
            <div class="board__titles">
              <p class="board__eyebrow">Reservas de hoy</p>
              <h1 class="board__brand">{{ b.shop.name }}</h1>
              <p class="board__date">{{ dateLabel() }}</p>
            </div>
          </div>
          <div class="board__live-row">
            <p class="board__live">
              <span class="board__pulse" aria-hidden="true"></span>
              <span class="board__live-text">Auto · 30 s</span>
            </p>
            <button
              type="button"
              class="board__refresh"
              [disabled]="refreshing()"
              (click)="refresh()"
              [attr.aria-label]="refreshing() ? 'Actualizando' : 'Actualizar ahora'"
            >
              <svg
                class="board__refresh-icon"
                [class.board__refresh-icon--spin]="refreshing()"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-1.76-4.24L14 10h6V4l-2.35 2.35Z"
                />
              </svg>
              <span class="board__refresh-label">{{ refreshing() ? '…' : 'Actualizar' }}</span>
            </button>
          </div>
        </header>

        <app-board-install-banner
          kind="reservations"
          [shopName]="b.shop.name"
          [accent]="accent()"
        />

        @if (b.notice) {
          <section class="board__notice" aria-label="Aviso del día">
            <p class="board__notice-label">Aviso</p>
            <p class="board__notice-text">{{ b.notice }}</p>
          </section>
        }

        @if ((b.waiting?.guests ?? 0) > 0) {
          <section class="board__waiting" aria-label="Lista de espera">
            <p class="board__waiting-label">Lista de espera</p>
            <p class="board__waiting-count">
              <strong>{{ b.waiting!.guests }}</strong>
              <span>
                {{ b.waiting!.guests === 1 ? 'persona' : 'personas' }}
              </span>
            </p>
          </section>
        }

        <section class="board__totals" aria-label="Totales">
          <div class="board__total">
            <strong>{{ b.totals.guests }}</strong>
            <span>pers.</span>
          </div>
          <div class="board__total">
            <strong>{{ b.totals.parties }}</strong>
            <span>mesas</span>
          </div>
          <div class="board__total">
            <strong>{{ b.totals.inside }}</strong>
            <span>adentro</span>
          </div>
          <div class="board__total">
            <strong>{{ b.totals.outside }}</strong>
            <span>afuera</span>
          </div>
        </section>
        @if (partyMix().length) {
          <section class="board__mix" [attr.aria-label]="'Mesas: ' + partyMixLabel()">
            <p class="board__mix-label">Composición</p>
            <p class="board__mix-chips">
              @for (item of partyMix(); track item.partySize) {
                <span class="board__mix-chip">{{ formatMix(item) }}</span>
              }
            </p>
            @if (showAreaMix()) {
              <p class="board__mix-areas">
                @if (partyMixInside().length) {
                  <span>Adentro: {{ mixLabel(partyMixInside()) }}</span>
                }
                @if (partyMixOutside().length) {
                  <span>Afuera: {{ mixLabel(partyMixOutside()) }}</span>
                }
              </p>
            }
          </section>
        }

        <section class="board__lists">
          <div class="board__col">
            <h2>Adentro <span>{{ inside().length }}</span></h2>
            <ul>
              @for (r of inside(); track r.id) {
                <li
                  class="board__item"
                  [class.board__item--new]="isNew(r.id)"
                  [class.board__item--seated]="r.status === 'SEATED' && !r.removedAfterSeated"
                  [class.board__item--removed]="!!r.removedAfterSeated"
                  [class.board__item--tappable]="canToggleSeat(r)"
                  (click)="onItemTap(r)"
                >
                  <span class="board__name">
                    @if (r.number) {
                      <span class="board__num">#{{ r.number }}</span>
                    }
                    {{ r.guestName || 'Reserva' }}
                    @if (r.status === 'SEATED' && !r.removedAfterSeated) {
                      <span class="board__badge board__badge--seated">Marcada</span>
                    }
                    @if (r.removedAfterSeated) {
                      <span class="board__badge board__badge--removed">Liberada</span>
                    }
                  </span>
                  @if (publicNote(r.notes); as note) {
                    <span class="board__note">{{ note }}</span>
                  }
                  <span class="board__meta">
                    @if (r.reservationTime) {
                      <span class="board__time">{{ r.reservationTime }}</span>
                    }
                    @if (!r.removedAfterSeated) {
                      <input
                        class="board__mesa"
                        type="text"
                        maxlength="20"
                        inputmode="numeric"
                        [value]="mesaValue(r)"
                        placeholder="Mesa"
                        aria-label="Número de mesa"
                        (click)="$event.stopPropagation()"
                        (pointerdown)="$event.stopPropagation()"
                        (input)="setMesaDraft(r.id, $any($event.target).value)"
                      />
                    } @else if (r.tableNumber) {
                      <span class="board__time">Mesa {{ r.tableNumber }}</span>
                    }
                    <span class="board__pax" [attr.aria-label]="r.partySize + ' personas'">
                      <strong>{{ r.partySize }}</strong><span>p</span>
                    </span>
                    @if (r.removedAfterSeated) {
                      <button
                        type="button"
                        class="board__dismiss"
                        aria-label="Quitar de la vista"
                        (click)="dismissRemoved($event, r)"
                      >
                        ✕
                      </button>
                    }
                  </span>
                </li>
              } @empty {
                <li class="board__empty">Sin reservas</li>
              }
            </ul>
          </div>
          <div class="board__col board__col--out">
            <h2>Afuera <span>{{ outside().length }}</span></h2>
            <ul>
              @for (r of outside(); track r.id) {
                <li
                  class="board__item"
                  [class.board__item--new]="isNew(r.id)"
                  [class.board__item--seated]="r.status === 'SEATED' && !r.removedAfterSeated"
                  [class.board__item--removed]="!!r.removedAfterSeated"
                  [class.board__item--tappable]="canToggleSeat(r)"
                  (click)="onItemTap(r)"
                >
                  <span class="board__name">
                    @if (r.number) {
                      <span class="board__num">#{{ r.number }}</span>
                    }
                    {{ r.guestName || 'Reserva' }}
                    @if (r.status === 'SEATED' && !r.removedAfterSeated) {
                      <span class="board__badge board__badge--seated">Marcada</span>
                    }
                    @if (r.removedAfterSeated) {
                      <span class="board__badge board__badge--removed">Liberada</span>
                    }
                  </span>
                  @if (publicNote(r.notes); as note) {
                    <span class="board__note">{{ note }}</span>
                  }
                  <span class="board__meta">
                    @if (r.reservationTime) {
                      <span class="board__time">{{ r.reservationTime }}</span>
                    }
                    @if (!r.removedAfterSeated) {
                      <input
                        class="board__mesa"
                        type="text"
                        maxlength="20"
                        inputmode="numeric"
                        [value]="mesaValue(r)"
                        placeholder="Mesa"
                        aria-label="Número de mesa"
                        (click)="$event.stopPropagation()"
                        (pointerdown)="$event.stopPropagation()"
                        (input)="setMesaDraft(r.id, $any($event.target).value)"
                      />
                    } @else if (r.tableNumber) {
                      <span class="board__time">Mesa {{ r.tableNumber }}</span>
                    }
                    <span class="board__pax" [attr.aria-label]="r.partySize + ' personas'">
                      <strong>{{ r.partySize }}</strong><span>p</span>
                    </span>
                    @if (r.removedAfterSeated) {
                      <button
                        type="button"
                        class="board__dismiss"
                        aria-label="Quitar de la vista"
                        (click)="dismissRemoved($event, r)"
                      >
                        ✕
                      </button>
                    }
                  </span>
                </li>
              } @empty {
                <li class="board__empty">Sin reservas</li>
              }
            </ul>
          </div>
        </section>
      </div>
    } @else {
      <div class="board board--loading">
        <p>Cargando reservas…</p>
      </div>
    }
  `,
  styleUrl: './public-reservations-board.scss',
})
export class PublicReservationsBoardComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReservationsApiService);
  private readonly boardPwa = inject(BoardPwaService);
  private slug = '';
  private pwaApplied = false;

  private readonly refresh$ = new Subject<void>();
  private pollSub: Subscription | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  private knownIds = new Set<string>();
  private hasLoadedOnce = false;
  private highlightIds = new Set<string>();
  private seating = false;

  readonly board = signal<PublicReservationsBoard | null>(null);
  readonly error = signal('');
  readonly refreshing = signal(false);
  readonly toast = signal('');
  readonly highlightTick = signal(0);
  readonly mesaDrafts = signal<Record<string, string>>({});

  readonly accent = computed(() => this.board()?.shop.accentColor || '#c45c26');

  readonly logoUrl = computed(() => {
    const raw = this.board()?.shop.logoUrl;
    const shopId = this.board()?.shop?.id;
    return resolveShopLogoSrc(raw, shopId) || normalizeLogoUrl(raw) || raw?.trim() || null;
  });

  readonly dateLabel = computed(() => {
    const iso = this.board()?.businessDate;
    return iso ? formatIsoDateLong(iso) : '';
  });

  readonly inside = computed(() => {
    this.highlightTick();
    return this.sortColumn(
      (this.board()?.reservations ?? []).filter((r) => r.area !== 'OUTSIDE'),
    );
  });
  readonly outside = computed(() => {
    this.highlightTick();
    return this.sortColumn(
      (this.board()?.reservations ?? []).filter((r) => r.area === 'OUTSIDE'),
    );
  });

  readonly activeBoardRows = computed(() =>
    (this.board()?.reservations ?? []).filter((r) => !r.removedAfterSeated),
  );
  readonly partyMix = computed(() => partyMixFromReservations(this.activeBoardRows()));
  readonly partyMixInside = computed(() =>
    partyMixFromReservations(this.activeBoardRows().filter((r) => r.area !== 'OUTSIDE')),
  );
  readonly partyMixOutside = computed(() =>
    partyMixFromReservations(this.activeBoardRows().filter((r) => r.area === 'OUTSIDE')),
  );
  readonly showAreaMix = computed(
    () => this.partyMixInside().length > 0 && this.partyMixOutside().length > 0,
  );
  readonly partyMixLabel = computed(() => formatPartyMix(this.partyMix()));

  formatMix = formatPartyMixItem;

  mixLabel(items: { partySize: number; tables: number }[]): string {
    return formatPartyMix(items);
  }

  ngOnInit(): void {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!this.slug) {
      this.error.set('Local no encontrado');
      return;
    }

    this.boardPwa.prime('reservations', this.slug);
    void this.ensureNotificationPermission();

    this.pollSub = merge(interval(30_000).pipe(startWith(0)), this.refresh$)
      .pipe(
        tap(() => this.refreshing.set(true)),
        switchMap(() => this.api.publicBoard(this.slug)),
      )
      .subscribe({
        next: (b) => {
          this.applyBoard(b);
          this.refreshing.set(false);
          this.error.set('');
          this.applyBoardPwa(b);
        },
        error: () => {
          this.refreshing.set(false);
          if (!this.board()) this.error.set('No se pudo cargar este local');
        },
      });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
    this.refresh$.complete();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.boardPwa.restore();
  }

  private applyBoardPwa(b: PublicReservationsBoard): void {
    if (this.pwaApplied) return;
    this.pwaApplied = true;
    this.boardPwa.apply({
      kind: 'reservations',
      slug: this.slug || b.shop.slug,
      shopName: b.shop.name,
      accentColor: b.shop.accentColor,
      logoUrl: this.logoUrl(),
    });
  }

  refresh(): void {
    if (this.refreshing()) return;
    this.refresh$.next();
  }

  isNew(id: string): boolean {
    this.highlightTick();
    return this.highlightIds.has(id);
  }

  publicNote(notes?: string | null): string | null {
    return publicBoardNotes(notes);
  }

  canToggleSeat(r: {
    status: string;
    removedAfterSeated?: boolean;
  }): boolean {
    return (
      !r.removedAfterSeated &&
      (r.status === 'CONFIRMED' || r.status === 'SEATED')
    );
  }

  onItemTap(r: {
    id: string;
    guestName: string;
    partySize: number;
    status: string;
    tableNumber?: string | null;
    removedAfterSeated?: boolean;
  }): void {
    if (!this.canToggleSeat(r) || this.seating) return;
    const mesa = r.status === 'CONFIRMED' ? this.mesaValue(r).trim() || null : undefined;
    this.toggleSeat(r.id, r.status as 'CONFIRMED' | 'SEATED', mesa);
  }

  mesaValue(r: { id: string; tableNumber?: string | null }): string {
    return this.mesaDrafts()[r.id] ?? r.tableNumber ?? '';
  }

  setMesaDraft(id: string, value: string): void {
    this.mesaDrafts.update((prev) => ({ ...prev, [id]: value }));
  }

  private toggleSeat(
    id: string,
    currentStatus: 'CONFIRMED' | 'SEATED',
    tableNumber?: string | null,
  ): void {
    const nextStatus = currentStatus === 'SEATED' ? 'CONFIRMED' : 'SEATED';
    this.seating = true;
    this.patchLocalStatus(id, nextStatus, tableNumber);
    this.api.publicSeatReservation(this.slug, id, tableNumber).subscribe({
      next: (res) => {
        this.seating = false;
        if (res.status === 'CONFIRMED' || res.status === 'SEATED') {
          this.patchLocalStatus(id, res.status, res.tableNumber);
        }
      },
      error: () => {
        this.seating = false;
        this.patchLocalStatus(id, currentStatus);
        this.showToast('No se pudo marcar la mesa');
      },
    });
  }

  dismissRemoved(
    event: Event,
    r: { id: string; guestName: string; removedAfterSeated?: boolean },
  ): void {
    event.stopPropagation();
    if (!r.removedAfterSeated || this.seating) return;
    this.seating = true;
    const prev = this.board();
    if (prev) {
      this.board.set({
        ...prev,
        reservations: prev.reservations.filter((x) => x.id !== r.id),
      });
    }
    this.api.publicDismissRemovedReservation(this.slug, r.id).subscribe({
      next: () => {
        this.seating = false;
        this.showToast(`Quitada: ${r.guestName?.trim() || 'Reserva'}`);
      },
      error: () => {
        this.seating = false;
        if (prev) this.board.set(prev);
        this.showToast('No se pudo quitar de la vista');
      },
    });
  }

  private patchLocalStatus(
    id: string,
    status: 'CONFIRMED' | 'SEATED',
    tableNumber?: string | null,
  ): void {
    const prev = this.board();
    if (!prev) return;
    this.board.set({
      ...prev,
      reservations: prev.reservations.map((r) =>
        r.id === id
          ? {
              ...r,
              status,
              removedAfterSeated: false,
              ...(tableNumber !== undefined ? { tableNumber } : {}),
            }
          : r,
      ),
    });
  }

  private sortColumn<
    T extends { removedAfterSeated?: boolean; number?: number; createdAt?: string },
  >(rows: T[]): T[] {
    return [...rows].sort((a, b) => {
      const ar = a.removedAfterSeated ? 1 : 0;
      const br = b.removedAfterSeated ? 1 : 0;
      if (ar !== br) return ar - br;
      const an = a.number ?? 0;
      const bn = b.number ?? 0;
      if (an && bn && an !== bn) return an - bn;
      return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
    });
  }

  private applyBoard(b: PublicReservationsBoard): void {
    const nextIds = new Set((b.reservations ?? []).map((r) => r.id));
    if (this.hasLoadedOnce) {
      const newcomers = (b.reservations ?? []).filter(
        (r) => !this.knownIds.has(r.id) && !r.removedAfterSeated,
      );
      if (newcomers.length) {
        for (const r of newcomers) this.highlightIds.add(r.id);
        this.highlightTick.update((n) => n + 1);
        this.scheduleHighlightClear();
        this.notifyNew(newcomers);
      }
    }
    this.knownIds = nextIds;
    this.hasLoadedOnce = true;
    this.board.set(b);
  }

  private scheduleHighlightClear(): void {
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => {
      this.highlightIds = new Set();
      this.highlightTick.update((n) => n + 1);
      this.highlightTimer = null;
    }, 25_000);
  }

  private notifyNew(
    rows: Array<{ guestName: string; partySize: number; reservationTime?: string | null }>,
  ): void {
    const first = rows[0];
    const label = first.guestName?.trim() || 'Reserva';
    const detail = [
      first.reservationTime || null,
      `${first.partySize} pers.`,
    ]
      .filter(Boolean)
      .join(' · ');
    const message =
      rows.length === 1
        ? `Nueva reserva: ${label}${detail ? ` (${detail})` : ''}`
        : `${rows.length} nuevas reservas (última: ${label})`;

    this.showToast(message);

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('Reservas · ' + (this.board()?.shop.name ?? 'Local'), {
          body: message,
          tag: 'reservations-new',
        });
      } catch {
        // Algunos navegadores bloquean Notification sin service worker.
      }
    }
  }

  private showToast(message: string): void {
    this.toast.set(message);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.set('');
      this.toastTimer = null;
    }, 5500);
  }

  private async ensureNotificationPermission(): Promise<void> {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    try {
      await Notification.requestPermission();
    } catch {
      // ignore
    }
  }
}
