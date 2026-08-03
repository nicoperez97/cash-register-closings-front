import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { interval, startWith, switchMap } from 'rxjs';
import { formatIsoDateLong } from '../../core/shop/business-date';
import { normalizeLogoUrl } from '../../core/utils/drive-url';
import {
  PublicReservationsBoard,
  ReservationsApiService,
} from './reservations-api.service';

@Component({
  selector: 'app-public-reservations-board',
  template: `
    @if (error()) {
      <div class="board board--error">
        <p>{{ error() }}</p>
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
          <p class="board__live">
            <span class="board__pulse" aria-hidden="true"></span>
            Actualiza cada minuto
          </p>
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
                <li>
                  <span class="board__name">{{ r.guestName }}</span>
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
                <li>
                  <span class="board__name">{{ r.guestName }}</span>
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

      .board__live {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        margin: 0.85rem 0 0;
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
export class PublicReservationsBoardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReservationsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly board = signal<PublicReservationsBoard | null>(null);
  readonly error = signal('');

  readonly accent = computed(() => this.board()?.shop.accentColor || '#c45c26');

  readonly logoUrl = computed(() => {
    const raw = this.board()?.shop.logoUrl;
    return normalizeLogoUrl(raw) || raw?.trim() || null;
  });

  readonly dateLabel = computed(() => {
    const iso = this.board()?.businessDate;
    return iso ? formatIsoDateLong(iso) : '';
  });

  readonly inside = computed(() =>
    (this.board()?.reservations ?? []).filter((r) => r.area !== 'OUTSIDE'),
  );
  readonly outside = computed(() =>
    (this.board()?.reservations ?? []).filter((r) => r.area === 'OUTSIDE'),
  );

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!slug) {
      this.error.set('Local no encontrado');
      return;
    }

    document.body.classList.add('auth-login');
    this.destroyRef.onDestroy(() => document.body.classList.remove('auth-login'));

    interval(60_000)
      .pipe(
        startWith(0),
        switchMap(() => this.api.publicBoard(slug)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (b) => {
          this.board.set(b);
          this.error.set('');
          document.title = `Reservas · ${b.shop.name}`;
        },
        error: () => {
          if (!this.board()) this.error.set('No se pudo cargar este local');
        },
      });
  }
}
