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
import { normalizeLogoUrl, resolveShopLogoSrc } from '../../core/utils/drive-url';
import {
  PublicReservationsBoard,
  ReservationsApiService,
} from './reservations-api.service';
import { BoardInstallBannerComponent } from './board-install-banner';
import { BoardPwaService } from './board-pwa.service';

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
                  @if (r.notes?.trim()) {
                    <span class="board__note">{{ r.notes }}</span>
                  }
                  <span class="board__meta">
                    @if (r.reservationTime) {
                      <span class="board__time">{{ r.reservationTime }}</span>
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
                  @if (r.notes?.trim()) {
                    <span class="board__note">{{ r.notes }}</span>
                  }
                  <span class="board__meta">
                    @if (r.reservationTime) {
                      <span class="board__time">{{ r.reservationTime }}</span>
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
        padding: calc(1.15rem + env(safe-area-inset-top, 0px)) 1.1rem
          calc(5.5rem + env(safe-area-inset-bottom, 0px));
        color: #f4efe6;
        box-sizing: border-box;
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
        padding: 1.25rem 0.5rem 1.35rem;
        max-width: 52rem;
        width: 100%;
        margin: 0 auto;
        box-sizing: border-box;
      }

      .board__glow {
        position: absolute;
        inset: 10% 20% auto;
        height: 8rem;
        background: radial-gradient(circle, color-mix(in srgb, var(--accent) 40%, transparent), transparent 70%);
        filter: blur(24px);
        pointer-events: none;
      }

      .board__identity {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.65rem;
      }

      .board__titles {
        min-width: 0;
      }

      .board__logo {
        position: relative;
        width: 5.5rem;
        height: 5.5rem;
        object-fit: contain;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.06);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
      }

      .board__eyebrow {
        position: relative;
        margin: 0 0 0.25rem;
        font-size: 0.72rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--accent) 80%, #fff);
        font-weight: 600;
      }

      .board__brand {
        position: relative;
        margin: 0;
        font-size: clamp(1.85rem, 5.5vw, 3.2rem);
        font-weight: 750;
        letter-spacing: -0.03em;
        line-height: 1.05;
      }

      .board__date {
        position: relative;
        margin: 0.35rem 0 0;
        font-size: 0.95rem;
        color: #cfc6ba;
        text-transform: capitalize;
      }

      .board__live-row {
        position: relative;
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 0.5rem 0.75rem;
        margin-top: 0.75rem;
      }

      .board__live {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        margin: 0;
        font-size: 0.78rem;
        color: #9a9186;
      }

      .board__pulse {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 999px;
        background: #3dba6e;
        box-shadow: 0 0 0 0 rgba(61, 186, 110, 0.55);
        animation: pulse 1.6s ease-out infinite;
      }

      .board__refresh {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.4rem 0.8rem;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(255, 255, 255, 0.06);
        color: #f4efe6;
        font: inherit;
        font-size: 0.82rem;
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
        gap: 0.5rem;
        max-width: 52rem;
        width: 100%;
        margin: 0 auto 1rem;
        box-sizing: border-box;
      }

      .board__notice {
        max-width: 52rem;
        width: 100%;
        margin: 0 auto 1rem;
        padding: 0.95rem 1.1rem;
        border-radius: 16px;
        background: color-mix(in srgb, var(--accent, #3dba6e) 18%, rgba(0, 0, 0, 0.35));
        border: 1px solid color-mix(in srgb, var(--accent, #3dba6e) 45%, transparent);
        box-sizing: border-box;
      }

      .board__notice-label {
        margin: 0 0 0.35rem;
        font-size: 0.72rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        font-weight: 700;
        color: color-mix(in srgb, var(--accent, #3dba6e) 80%, #fff);
      }

      .board__notice-text {
        margin: 0;
        white-space: pre-line;
        line-height: 1.45;
        font-size: clamp(1rem, 2.6vw, 1.2rem);
        font-weight: 600;
        color: #f3fff7;
      }

      .board__waiting {
        max-width: 52rem;
        width: 100%;
        margin: 0 auto 1rem;
        padding: 0.95rem 1.1rem;
        border-radius: 16px;
        background: color-mix(in srgb, #f59e0b 22%, rgba(0, 0, 0, 0.4));
        border: 1px solid color-mix(in srgb, #f59e0b 50%, transparent);
        box-sizing: border-box;
        text-align: center;
      }

      .board__waiting-label {
        margin: 0 0 0.35rem;
        font-size: 0.72rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        font-weight: 700;
        color: #ffd89a;
      }

      .board__waiting-count {
        margin: 0;
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: 0.55rem;
        flex-wrap: wrap;
        color: #fff8eb;
      }

      .board__waiting-count strong {
        font-size: clamp(1.8rem, 6vw, 2.6rem);
        line-height: 1;
        font-weight: 800;
      }

      .board__waiting-count span {
        font-size: clamp(0.95rem, 2.4vw, 1.15rem);
        font-weight: 600;
        opacity: 0.92;
      }

      .board__total {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        padding: 0.7rem 0.45rem;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        text-align: center;
      }

      .board__total strong {
        font-size: clamp(1.25rem, 3.8vw, 1.85rem);
        line-height: 1;
        font-weight: 750;
      }

      .board__total span {
        font-size: 0.68rem;
        color: #a89f93;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      .board__lists {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
        max-width: 52rem;
        width: 100%;
        margin: 0 auto;
        flex: 1 1 auto;
        min-height: 0;
        box-sizing: border-box;
        align-items: start;
      }

      .board__col {
        display: flex;
        flex-direction: column;
        min-height: 0;
        padding: 0.75rem 0.8rem 0.85rem;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.035);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .board__col--out {
        border-color: color-mix(in srgb, var(--accent) 35%, rgba(255, 255, 255, 0.08));
      }

      .board__col h2 {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.35rem;
        margin: 0 0 0.55rem;
        font-size: 0.75rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--accent) 75%, #fff);
      }

      .board__col h2 span {
        font-variant-numeric: tabular-nums;
        opacity: 0.75;
        letter-spacing: 0;
      }

      .board__col ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        overflow: auto;
        min-height: 0;
        flex: 1 1 auto;
        overscroll-behavior: contain;
      }

      .board__col li {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        padding: 0.55rem 0.65rem;
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.22);
      }

      .board__item--tappable {
        cursor: pointer;
        transition: background 160ms ease;
      }

      .board__item--tappable:active {
        background: color-mix(in srgb, var(--accent) 18%, rgba(0, 0, 0, 0.22));
      }

      .board__item--seated {
        opacity: 1;
        border: 1px solid color-mix(in srgb, #eab308 70%, transparent);
        background: color-mix(in srgb, #eab308 22%, rgba(0, 0, 0, 0.28));
        color: #fef9c3;
        box-shadow: 0 0 0 1px color-mix(in srgb, #facc15 25%, transparent);
      }

      .board__item--seated .board__num {
        color: #fde047;
      }

      .board__item--seated .board__pax {
        background: color-mix(in srgb, #eab308 35%, transparent);
        color: #fef08a;
      }

      .board__badge--seated {
        background: color-mix(in srgb, #eab308 45%, transparent);
        color: #fef9c3;
      }

      .board__dismiss {
        margin-left: auto;
        border: 0;
        border-radius: 999px;
        width: 1.65rem;
        height: 1.65rem;
        display: inline-grid;
        place-items: center;
        cursor: pointer;
        font-size: 0.85rem;
        line-height: 1;
        color: #fecaca;
        background: color-mix(in srgb, #ef4444 35%, transparent);
        flex-shrink: 0;
      }

      .board__dismiss:active {
        transform: scale(0.94);
      }

      .board__item--removed {
        opacity: 1;
        text-decoration: line-through;
        text-decoration-thickness: 1.5px;
        text-decoration-color: color-mix(in srgb, #ef4444 75%, #fff);
        border: 1px solid color-mix(in srgb, #ef4444 55%, transparent);
        background: color-mix(in srgb, #ef4444 18%, rgba(0, 0, 0, 0.28));
        color: #fecaca;
      }

      .board__item--removed .board__num {
        color: #f87171;
      }

      .board__item--removed .board__pax {
        background: color-mix(in srgb, #ef4444 28%, transparent);
        color: #fecaca;
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
        font-size: 1rem;
        font-weight: 650;
        letter-spacing: -0.01em;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.35rem 0.45rem;
      }

      .board__note {
        display: block;
        margin: 0.15rem 0 0.05rem;
        font-size: 0.82rem;
        line-height: 1.35;
        font-weight: 500;
        color: color-mix(in srgb, #f4efe6 78%, var(--accent));
        white-space: pre-wrap;
      }

      .board__item--removed .board__note {
        color: #fecaca;
      }

      .board__item--seated .board__note {
        color: #fef08a;
      }

      .board__num {
        font-variant-numeric: tabular-nums;
        color: color-mix(in srgb, var(--accent) 85%, #fff);
        font-weight: 750;
      }

      .board__badge {
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        text-decoration: none;
        padding: 0.15rem 0.4rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--accent) 28%, transparent);
        color: #f8f0e8;
      }

      .board__badge--removed {
        background: color-mix(in srgb, #ef4444 42%, transparent);
        color: #fee2e2;
        text-decoration: none;
      }

      .board__meta {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        flex-wrap: wrap;
      }

      .board__time {
        font-size: 0.78rem;
        color: #b5aa9c;
        font-variant-numeric: tabular-nums;
      }

      .board__pax {
        display: inline-flex;
        align-items: baseline;
        gap: 0.05rem;
        padding: 0.2rem 0.45rem 0.22rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--accent) 22%, rgba(0, 0, 0, 0.35));
        border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
        color: #fff8f2;
        font-variant-numeric: tabular-nums;
        line-height: 1;
        flex-shrink: 0;
      }

      .board__pax strong {
        font-size: 1.15rem;
        font-weight: 800;
        letter-spacing: -0.02em;
      }

      .board__pax span {
        font-size: 0.72rem;
        font-weight: 700;
        opacity: 0.85;
        text-transform: lowercase;
      }

      .board__empty {
        background: transparent !important;
        color: #8a8176;
        text-align: center;
        padding: 0.85rem 0.35rem !important;
        font-size: 0.85rem;
      }

      /* Teléfono: layout compacto */
      @media (max-width: 720px) {
        .board {
          padding: 0.55rem 0.6rem 0.7rem;
          height: 100dvh;
          max-height: 100dvh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .board__hero {
          padding: 0.25rem 0 0.55rem;
          flex-shrink: 0;
        }

        .board__identity {
          flex-direction: row;
          text-align: left;
          gap: 0.65rem;
          width: 100%;
        }

        .board__logo {
          width: 3rem;
          height: 3rem;
          border-radius: 11px;
          flex-shrink: 0;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
        }

        .board__eyebrow {
          margin: 0;
          font-size: 0.62rem;
          letter-spacing: 0.12em;
        }

        .board__brand {
          font-size: 1.35rem;
          line-height: 1.1;
        }

        .board__date {
          margin: 0.15rem 0 0;
          font-size: 0.78rem;
        }

        .board__live-row {
          width: 100%;
          justify-content: space-between;
          margin-top: 0.5rem;
        }

        .board__refresh {
          padding: 0.35rem 0.65rem;
          font-size: 0.75rem;
        }

        .board__notice,
        .board__waiting {
          flex-shrink: 0;
          margin-bottom: 0.55rem;
        }

        .board__totals {
          gap: 0.35rem;
          margin: 0 0 0.55rem;
          flex-shrink: 0;
        }

        .board__total {
          padding: 0.45rem 0.2rem;
          border-radius: 10px;
        }

        .board__total strong {
          font-size: 1.15rem;
        }

        .board__total span {
          font-size: 0.58rem;
        }

        .board__lists {
          flex: 1 1 auto;
          min-height: 0;
          gap: 0.45rem;
          grid-template-columns: 1fr 1fr;
        }

        .board__col {
          padding: 0.55rem 0.5rem 0.6rem;
          border-radius: 12px;
          height: 100%;
        }

        .board__col h2 {
          margin: 0 0 0.4rem;
          font-size: 0.68rem;
        }

        .board__col li {
          padding: 0.4rem 0.45rem;
          border-radius: 9px;
        }

        .board__name {
          font-size: 0.88rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .board__time {
          font-size: 0.68rem;
        }

        .board__pax {
          padding: 0.16rem 0.4rem 0.18rem;
        }

        .board__pax strong {
          font-size: 1.05rem;
        }

        .board__pax span {
          font-size: 0.65rem;
        }
      }

      /* Desktop con mouse */
      @media (min-width: 721px) {
        .board {
          display: flex;
          flex-direction: column;
          align-items: stretch;
        }
      }

      /*
       * iPad / tablet táctil: misma composición que desktop
       * (hero centrado, logo grande, 2 columnas) pero a pantalla completa.
       */
      @media (min-width: 721px) and (hover: none) and (pointer: coarse) {
        .board {
          height: 100dvh;
          max-height: 100dvh;
          overflow: hidden;
          padding: calc(0.85rem + env(safe-area-inset-top, 0px)) 1.35rem
            calc(1.1rem + env(safe-area-inset-bottom, 0px));
        }

        .board__hero {
          flex-shrink: 0;
          max-width: none;
          padding: 0.65rem 0.35rem 0.9rem;
        }

        .board__identity {
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .board__logo {
          width: 5rem;
          height: 5rem;
          border-radius: 16px;
        }

        .board__brand {
          font-size: clamp(2rem, 3.6vw, 2.85rem);
        }

        .board__date {
          font-size: 1rem;
        }

        .board__live-row {
          justify-content: center;
        }

        .board__notice,
        .board__waiting,
        .board__totals,
        .board__lists {
          max-width: none;
          width: 100%;
        }

        .board__notice,
        .board__waiting {
          flex-shrink: 0;
          margin-bottom: 0.85rem;
        }

        .board__totals {
          flex-shrink: 0;
          gap: 0.65rem;
          margin-bottom: 0.85rem;
        }

        .board__total {
          padding: 0.85rem 0.5rem;
        }

        .board__total strong {
          font-size: clamp(1.45rem, 2.8vw, 1.95rem);
        }

        .board__total span {
          font-size: 0.72rem;
        }

        .board__lists {
          flex: 1 1 auto;
          min-height: 0;
          gap: 1rem;
        }

        .board__col {
          height: 100%;
          min-height: 0;
          padding: 0.9rem 0.95rem 1rem;
          border-radius: 18px;
        }

        .board__col h2 {
          font-size: 0.82rem;
          margin-bottom: 0.65rem;
        }

        .board__col ul {
          gap: 0.5rem;
        }

        .board__col li {
          padding: 0.7rem 0.8rem;
          border-radius: 14px;
        }

        .board__name {
          font-size: 1.12rem;
        }

        .board__note {
          font-size: 0.9rem;
        }

        .board__time {
          font-size: 0.85rem;
        }

        .board__pax strong {
          font-size: 1.25rem;
        }

        .board__item--tappable {
          min-height: 3.1rem;
        }
      }
    `,
  ],
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
    removedAfterSeated?: boolean;
  }): void {
    if (!this.canToggleSeat(r) || this.seating) return;
    const nextStatus = r.status === 'SEATED' ? 'CONFIRMED' : 'SEATED';
    this.seating = true;
    this.patchLocalStatus(r.id, nextStatus as 'CONFIRMED' | 'SEATED');
    this.api.publicSeatReservation(this.slug, r.id).subscribe({
      next: (res) => {
        this.seating = false;
        if (res.status === 'CONFIRMED' || res.status === 'SEATED') {
          this.patchLocalStatus(r.id, res.status);
        }
      },
      error: () => {
        this.seating = false;
        this.patchLocalStatus(r.id, r.status as 'CONFIRMED' | 'SEATED');
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

  private patchLocalStatus(id: string, status: 'CONFIRMED' | 'SEATED'): void {
    const prev = this.board();
    if (!prev) return;
    this.board.set({
      ...prev,
      reservations: prev.reservations.map((r) =>
        r.id === id ? { ...r, status, removedAfterSeated: false } : r,
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
