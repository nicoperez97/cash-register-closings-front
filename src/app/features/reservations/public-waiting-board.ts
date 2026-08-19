import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, Subscription, debounceTime, filter, interval, merge, startWith, switchMap, tap } from 'rxjs';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import { normalizeLogoUrl, resolveShopLogoSrc } from '../../core/utils/drive-url';
import {
  PublicWaitingBoard,
  ReservationsApiService,
} from './reservations-api.service';
import { BoardInstallBannerComponent } from './board-install-banner';
import { BoardPwaService } from './board-pwa.service';

@Component({
  selector: 'app-public-waiting-board',
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
              <p class="board__eyebrow">Lista de espera</p>
              <h1 class="board__brand">{{ b.shop.name }}</h1>
            </div>
          </div>
          <div class="board__live-row">
            <p class="board__live">
              <span class="board__pulse" aria-hidden="true"></span>
              <span class="board__live-text">En vivo</span>
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
          kind="waiting"
          [shopName]="b.shop.name"
          [accent]="accent()"
        />

        <section class="board__names" aria-label="En espera">
          <h2>En espera <span>{{ names().length }}</span></h2>
          <ul>
            @for (w of names(); track w.id) {
              <li [class.board__item--new]="isNew(w.id)">
                <span class="board__name">{{ w.guestName || 'Invitado' }}</span>
              </li>
            } @empty {
              <li class="board__empty">Sin espera</li>
            }
          </ul>
        </section>
      </div>
    } @else {
      <div class="board board--loading">
        <p>Cargando lista de espera…</p>
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
        --accent: #2e7d32;
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

      .board__names {
        max-width: 52rem;
        width: 100%;
        margin: 0 auto;
        padding: 0.85rem 1rem 1rem;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.035);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-sizing: border-box;
      }

      .board__names h2 {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 0 0 0.65rem;
        font-size: 0.75rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: color-mix(in srgb, var(--accent) 75%, #fff);
      }

      .board__names ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }

      .board__names li {
        padding: 0.7rem 0.85rem;
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.22);
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
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 0.45rem;
        padding: 0.55rem 0.65rem;
        border-radius: 12px;
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

      .board__position {
        font-size: 0.82rem;
        font-weight: 750;
        font-variant-numeric: tabular-nums;
        color: color-mix(in srgb, var(--accent) 85%, #fff);
      }

      .board__name {
        font-size: 1rem;
        font-weight: 650;
        letter-spacing: -0.01em;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .board__pax {
        display: inline-flex;
        align-items: baseline;
        gap: 0.05rem;
        padding: 0.2rem 0.45rem 0.22rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--accent) 22%, rgba(0, 0, 0, 0.35));
        border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
        color: #f2fff5;
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
        display: block;
        background: transparent !important;
        color: #8a8176;
        text-align: center;
        padding: 0.85rem 0.35rem !important;
        font-size: 0.85rem;
        grid-column: 1 / -1;
      }

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

        .board__live-row {
          width: 100%;
          justify-content: space-between;
          margin-top: 0.5rem;
        }

        .board__refresh {
          padding: 0.35rem 0.65rem;
          font-size: 0.75rem;
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
          gap: 0.35rem;
        }

        .board__position {
          font-size: 0.72rem;
        }

        .board__name {
          font-size: 0.88rem;
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

      @media (min-width: 721px) {
        .board {
          display: flex;
          flex-direction: column;
          align-items: stretch;
        }
      }
    `,
  ],
})
export class PublicWaitingBoardComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReservationsApiService);
  private readonly boardPwa = inject(BoardPwaService);
  private readonly live = inject(ShopLiveClient);
  private slug = '';
  private pwaApplied = false;

  private readonly refresh$ = new Subject<void>();
  private pollSub: Subscription | null = null;
  private liveSub: Subscription | null = null;
  private onVisible: (() => void) | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private knownIds = new Set<string>();
  private hasLoadedOnce = false;
  private highlightIds = new Set<string>();

  readonly board = signal<PublicWaitingBoard | null>(null);
  readonly error = signal('');
  readonly refreshing = signal(false);
  readonly toast = signal('');
  readonly highlightTick = signal(0);

  readonly accent = computed(() => this.board()?.shop.accentColor || '#2e7d32');

  readonly logoUrl = computed(() => {
    const raw = this.board()?.shop.logoUrl;
    const shopId = this.board()?.shop?.id;
    return resolveShopLogoSrc(raw, shopId) || normalizeLogoUrl(raw) || raw?.trim() || null;
  });

  readonly names = computed(() => {
    this.highlightTick();
    return this.board()?.waiting ?? [];
  });

  ngOnInit(): void {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!this.slug) {
      this.error.set('Local no encontrado');
      return;
    }

    this.boardPwa.prime('waiting', this.slug);
    void this.ensureNotificationPermission();

    this.pollSub = merge(interval(120_000).pipe(startWith(0)), this.refresh$)
      .pipe(
        tap(() => this.refreshing.set(true)),
        switchMap(() => this.api.publicWaitingBoard(this.slug)),
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
    this.liveSub = this.live
      .connect(this.slug)
      .pipe(
        filter((t) => t.domain === 'waiting'),
        debounceTime(280),
      )
      .subscribe(() => this.refresh());
    this.onVisible = () => {
      if (document.visibilityState === 'visible') this.refresh();
    };
    document.addEventListener('visibilitychange', this.onVisible);
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
    this.liveSub?.unsubscribe();
    this.liveSub = null;
    if (this.onVisible) document.removeEventListener('visibilitychange', this.onVisible);
    this.refresh$.complete();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.boardPwa.restore();
  }

  private applyBoardPwa(b: PublicWaitingBoard): void {
    if (this.pwaApplied) return;
    this.pwaApplied = true;
    this.boardPwa.apply({
      kind: 'waiting',
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

  private applyBoard(b: PublicWaitingBoard): void {
    const nextIds = new Set((b.waiting ?? []).map((w) => w.id));
    if (this.hasLoadedOnce) {
      const newcomers = (b.waiting ?? []).filter((w) => !this.knownIds.has(w.id));
      if (newcomers.length) {
        this.highlightIds = new Set(newcomers.map((w) => w.id));
        this.highlightTick.update((n) => n + 1);
        this.notifyNew(newcomers);
      }
    }
    this.knownIds = nextIds;
    this.hasLoadedOnce = true;
    this.board.set(b);
  }

  private notifyNew(
    rows: Array<{ guestName: string; partySize: number; position: number }>,
  ): void {
    const first = rows[0];
    const label = first.guestName?.trim() || 'Invitado';
    const message =
      rows.length === 1 ? `Nuevo en lista: ${label}` : `${rows.length} nuevos en lista (último: ${label})`;

    this.showToast(message);

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('Lista de espera · ' + (this.board()?.shop.name ?? 'Local'), {
          body: message,
          tag: 'waiting-new',
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
