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
import { normalizeLogoUrl } from '../../core/utils/drive-url';
import {
  PublicReservationsBoard,
  ReservationsApiService,
} from './reservations-api.service';

@Component({
  selector: 'app-public-reservations-board',
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
          @if (logoUrl()) {
            <img class="board__logo" [src]="logoUrl()!" [alt]="b.shop.name" />
          }
          <p class="board__eyebrow">Reservas de hoy</p>
          <h1 class="board__brand">{{ b.shop.name }}</h1>
          <p class="board__date">{{ dateLabel() }}</p>
          <div class="board__live-row">
            <p class="board__live">
              <span class="board__pulse" aria-hidden="true"></span>
              Actualiza cada minuto
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
              {{ refreshing() ? 'Actualizando…' : 'Actualizar' }}
            </button>
          </div>
        </header>

        <section class="board__totals" aria-label="Totales">
          <div class="board__total">
            <strong>{{ b.totals.guests }}</strong>
            <span>personas</span>
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

        <section class="board__lists">
          <div class="board__col">
            <h2>Adentro</h2>
            <ul>
              @for (r of inside(); track r.id) {
                <li [class.board__item--new]="isNew(r.id)">
                  <span class="board__name">{{ r.guestName || 'Reserva' }}</span>
                  <span class="board__meta">
                    @if (r.reservationTime) {
                      {{ r.reservationTime }} ·
                    }
                    {{ r.partySize }} pers.
                  </span>
                </li>
              } @empty {
                <li class="board__empty">Sin reservas adentro</li>
              }
            </ul>
          </div>
          <div class="board__col board__col--out">
            <h2>Afuera</h2>
            <ul>
              @for (r of outside(); track r.id) {
                <li [class.board__item--new]="isNew(r.id)">
                  <span class="board__name">{{ r.guestName || 'Reserva' }}</span>
                  <span class="board__meta">
                    @if (r.reservationTime) {
                      {{ r.reservationTime }} ·
                    }
                    {{ r.partySize }} pers.
                  </span>
                </li>
              } @empty {
                <li class="board__empty">Sin reservas afuera</li>
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
  styles: [
    `
      :host {
        display: block;
        min-height: 100dvh;
        font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
      }

      .board-toast {
        position: fixed;
        top: 1rem;
        left: 50%;
        z-index: 40;
        transform: translateX(-50%);
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        max-width: min(92vw, 28rem);
        padding: 0.85rem 1.15rem;
        border-radius: 999px;
        background: #163524;
        color: #e8fff0;
        border: 1px solid color-mix(in srgb, #3dba6e 55%, transparent);
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
        font-weight: 650;
        animation: toast-in 280ms ease-out both;
      }

      .board-toast__dot {
        width: 0.55rem;
        height: 0.55rem;
        border-radius: 999px;
        background: #3dba6e;
        flex-shrink: 0;
      }

      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translate(-50%, -8px);
        }
        to {
          opacity: 1;
          transform: translate(-50%, 0);
        }
      }

      .board {
        --accent: #c45c26;
        min-height: 100dvh;
        padding: 1.5rem 1.25rem 2.5rem;
        color: #f4efe6;
        background:
          radial-gradient(ellipse 80% 50% at 50% -10%, color-mix(in srgb, var(--accent) 35%, transparent), transparent 70%),
          linear-gradient(165deg, #1a1512 0%, #0e0c0b 45%, #161210 100%);
      }

      .board--loading,
      .board--error {
        display: grid;
        place-items: center;
        gap: 1rem;
        text-align: center;
        color: #cfc6ba;
      }

      .board__hero {
        position: relative;
        text-align: center;
        padding: 1.5rem 0.5rem 1.75rem;
        max-width: 52rem;
        margin: 0 auto;
      }

      .board__glow {
        position: absolute;
        inset: 10% 20% auto;
        height: 8rem;
        background: radial-gradient(circle, color-mix(in srgb, var(--accent) 40%, transparent), transparent 70%);
        filter: blur(24px);
        pointer-events: none;
      }

      .board__logo {
        position: relative;
        width: 6.5rem;
        height: 6.5rem;
        object-fit: contain;
        border-radius: 20px;
        margin-bottom: 1rem;
        background: rgba(255, 255, 255, 0.06);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
      }

      .board__eyebrow {
        position: relative;
        margin: 0 0 0.35rem;
        font-size: 0.78rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--accent) 80%, #fff);
        font-weight: 600;
      }

      .board__brand {
        position: relative;
        margin: 0;
        font-size: clamp(2.2rem, 7vw, 3.6rem);
        font-weight: 750;
        letter-spacing: -0.03em;
        line-height: 1.05;
      }

      .board__date {
        position: relative;
        margin: 0.55rem 0 0;
        font-size: 1.05rem;
        color: #cfc6ba;
        text-transform: capitalize;
      }

      .board__live-row {
        position: relative;
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 0.65rem 0.85rem;
        margin-top: 0.95rem;
      }

      .board__live {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        margin: 0;
        font-size: 0.8rem;
        color: #9a9186;
      }

      .board__pulse {
        width: 0.55rem;
        height: 0.55rem;
        border-radius: 999px;
        background: #3dba6e;
        box-shadow: 0 0 0 0 rgba(61, 186, 110, 0.55);
        animation: pulse 1.6s ease-out infinite;
      }

      .board__refresh {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.45rem 0.9rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(255, 255, 255, 0.06);
        color: #f4efe6;
        font: inherit;
        font-size: 0.85rem;
        font-weight: 650;
        cursor: pointer;
        transition:
          background 160ms ease,
          border-color 160ms ease,
          transform 160ms ease;
      }

      .board__refresh:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.11);
        border-color: color-mix(in srgb, var(--accent) 45%, rgba(255, 255, 255, 0.2));
      }

      .board__refresh:disabled {
        opacity: 0.65;
        cursor: wait;
      }

      .board__refresh-icon {
        width: 1rem;
        height: 1rem;
      }

      .board__refresh-icon--spin {
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes pulse {
        70% {
          box-shadow: 0 0 0 10px rgba(61, 186, 110, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(61, 186, 110, 0);
        }
      }

      .board__totals {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.65rem;
        max-width: 52rem;
        margin: 0 auto 1.5rem;
      }

      @media (max-width: 560px) {
        .board__totals {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      .board__total {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding: 0.9rem 0.75rem;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        text-align: center;
      }

      .board__total strong {
        font-size: clamp(1.5rem, 4vw, 2rem);
        line-height: 1;
        font-weight: 750;
      }

      .board__total span {
        font-size: 0.78rem;
        color: #a89f93;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .board__lists {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        max-width: 52rem;
        margin: 0 auto;
      }

      @media (max-width: 720px) {
        .board__lists {
          grid-template-columns: 1fr;
        }
      }

      .board__col {
        padding: 1rem 1rem 1.15rem;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.035);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .board__col--out {
        border-color: color-mix(in srgb, var(--accent) 35%, rgba(255, 255, 255, 0.08));
      }

      .board__col h2 {
        margin: 0 0 0.85rem;
        font-size: 0.82rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--accent) 75%, #fff);
      }

      .board__col ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }

      .board__col li {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding: 0.75rem 0.85rem;
        border-radius: 14px;
        background: rgba(0, 0, 0, 0.22);
      }

      .board__item--new {
        outline: 1px solid color-mix(in srgb, #3dba6e 55%, transparent);
        background: color-mix(in srgb, #3dba6e 12%, rgba(0, 0, 0, 0.22));
        animation: item-glow 1.2s ease-out;
      }

      @keyframes item-glow {
        from {
          box-shadow: 0 0 0 0 rgba(61, 186, 110, 0.45);
        }
        to {
          box-shadow: 0 0 0 12px rgba(61, 186, 110, 0);
        }
      }

      .board__name {
        font-size: 1.15rem;
        font-weight: 650;
        letter-spacing: -0.01em;
      }

      .board__meta {
        font-size: 0.85rem;
        color: #b5aa9c;
      }

      .board__empty {
        background: transparent !important;
        color: #8a8176;
        text-align: center;
        padding: 1.5rem 0.5rem !important;
      }
    `,
  ],
})
export class PublicReservationsBoardComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReservationsApiService);

  private readonly refresh$ = new Subject<void>();
  private pollSub: Subscription | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private knownIds = new Set<string>();
  private hasLoadedOnce = false;
  private highlightIds = new Set<string>();

  readonly board = signal<PublicReservationsBoard | null>(null);
  readonly error = signal('');
  readonly refreshing = signal(false);
  readonly toast = signal('');
  readonly highlightTick = signal(0);

  readonly accent = computed(() => this.board()?.shop.accentColor || '#c45c26');

  readonly logoUrl = computed(() => {
    const raw = this.board()?.shop.logoUrl;
    return normalizeLogoUrl(raw) || raw?.trim() || null;
  });

  readonly dateLabel = computed(() => {
    const iso = this.board()?.businessDate;
    return iso ? formatIsoDateLong(iso) : '';
  });

  readonly inside = computed(() => {
    this.highlightTick();
    return (this.board()?.reservations ?? []).filter((r) => r.area !== 'OUTSIDE');
  });
  readonly outside = computed(() => {
    this.highlightTick();
    return (this.board()?.reservations ?? []).filter((r) => r.area === 'OUTSIDE');
  });

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!slug) {
      this.error.set('Local no encontrado');
      return;
    }

    document.body.classList.add('auth-login');
    void this.ensureNotificationPermission();

    this.pollSub = merge(interval(60_000).pipe(startWith(0)), this.refresh$)
      .pipe(
        tap(() => this.refreshing.set(true)),
        switchMap(() => this.api.publicBoard(slug)),
      )
      .subscribe({
        next: (b) => {
          this.applyBoard(b);
          this.refreshing.set(false);
          this.error.set('');
          document.title = `Reservas · ${b.shop.name}`;
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
    document.body.classList.remove('auth-login');
  }

  refresh(): void {
    if (this.refreshing()) return;
    this.refresh$.next();
  }

  isNew(id: string): boolean {
    this.highlightTick();
    return this.highlightIds.has(id);
  }

  private applyBoard(b: PublicReservationsBoard): void {
    const nextIds = new Set((b.reservations ?? []).map((r) => r.id));
    if (this.hasLoadedOnce) {
      const newcomers = (b.reservations ?? []).filter((r) => !this.knownIds.has(r.id));
      if (newcomers.length) {
        this.highlightIds = new Set(newcomers.map((r) => r.id));
        this.highlightTick.update((n) => n + 1);
        this.notifyNew(newcomers);
      }
    }
    this.knownIds = nextIds;
    this.hasLoadedOnce = true;
    this.board.set(b);
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
      this.highlightIds = new Set();
      this.highlightTick.update((n) => n + 1);
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
