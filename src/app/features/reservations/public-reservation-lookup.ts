import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
import { formatIsoDateWithWeekday } from '../../core/shop/business-date';
import { normalizeLogoUrl, resolveShopLogoSrc } from '../../core/utils/drive-url';
import {
  PublicReservationLookupItem,
  ReservationsApiService,
} from './reservations-api.service';

@Component({
  selector: 'app-public-reservation-lookup',
  imports: [FormsModule, RouterLink],
  template: `
    @if (error(); as err) {
      <div class="page page--error">
        <p>{{ err }}</p>
      </div>
    } @else {
      <div class="page" [style.--accent]="accent()">
        <header class="hero">
          @if (logoUrl()) {
            <img
              class="hero__logo"
              [src]="logoUrl()!"
              [alt]="shopName()"
              (error)="onLogoError()"
            />
          }
          <p class="brand">{{ shopName() || 'Reservas' }}</p>
          <h1>¿Tenés reserva?</h1>
          <p class="lead">
            Ingresá el mail con el que pediste mesa. Te mostramos pendientes, confirmadas y
            rechazadas que todavía no pasaron.
          </p>
        </header>

        <form class="card card--form" (submit)="search($event)">
          <label>
            Mail
            <input
              type="email"
              [(ngModel)]="email"
              name="email"
              required
              autocomplete="email"
              placeholder="tunombre@mail.com"
            />
          </label>
          <button type="submit" [disabled]="loading() || !email.trim()">
            {{ loading() ? 'Buscando…' : 'Consultar' }}
          </button>
        </form>

        @if (searched()) {
          @if (!rows().length) {
            <div class="card card--empty">
              <p class="empty-title">Sin reservas próximas</p>
              <p class="empty">
                No encontramos pedidos con ese mail. Revisá que sea el mismo con el que
                reservaste.
              </p>
            </div>
          } @else {
            <p class="results-meta">{{ rows().length }} resultado{{ rows().length === 1 ? '' : 's' }}</p>
            <ul class="list">
              @for (r of rows(); track r.id) {
                <li [class]="'card card--row card--' + r.publicStatus">
                  <div class="row-top">
                    <span class="badge" [attr.data-status]="r.publicStatus">
                      {{ statusLabel(r.publicStatus) }}
                    </span>
                    @if (r.tableNumber) {
                      <span class="mesa">Mesa {{ r.tableNumber }}</span>
                    }
                  </div>
                  <strong class="when">{{ formatWhen(r.businessDate, r.reservationTime) }}</strong>
                  <span class="meta">
                    {{ r.guestName || 'Sin nombre' }} · {{ r.partySize }}
                    {{ r.partySize === 1 ? 'persona' : 'personas' }} ·
                    {{ r.area === 'OUTSIDE' ? 'Afuera' : 'Adentro' }}
                  </span>
                  @if (r.publicStatus === 'rejected' && r.statusReason) {
                    <p class="reason">
                      <span class="reason__label">Motivo</span>
                      {{ r.statusReason }}
                    </p>
                  } @else if (r.publicStatus === 'rejected') {
                    <p class="reason reason--muted">Sin motivo indicado por el local.</p>
                  } @else if (r.publicStatus === 'pending') {
                    <p class="hint">El local todavía no confirmó esta solicitud.</p>
                  }
                </li>
              }
            </ul>
          }
        }

        <p class="back">
          <a [routerLink]="['/reservar', slug()]">Reservar una mesa</a>
        </p>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
      background:
        radial-gradient(ellipse 80% 50% at 50% -10%, color-mix(in srgb, var(--accent, #3dba6e) 22%, transparent), transparent),
        #0e0c0b;
      color: #f4efe8;
      color-scheme: dark;
    }
    .page {
      max-width: 28rem;
      margin: 0 auto;
      padding: 2rem 1.1rem 3rem;
    }
    .hero {
      margin-bottom: 1.35rem;
    }
    .hero__logo {
      width: 3.25rem;
      height: 3.25rem;
      object-fit: contain;
      border-radius: 12px;
      margin-bottom: 0.75rem;
      background: #1a1714;
    }
    .brand {
      margin: 0 0 0.4rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 0.75rem;
      color: var(--accent, #3dba6e);
      font-weight: 700;
    }
    h1 {
      margin: 0 0 0.45rem;
      font-size: clamp(1.55rem, 5vw, 1.85rem);
      line-height: 1.15;
      color: #f4efe8;
      letter-spacing: -0.02em;
    }
    .lead,
    .empty,
    .back,
    .hint,
    .results-meta {
      color: #c9c0b5;
    }
    .lead {
      margin: 0;
      line-height: 1.45;
      font-size: 0.95rem;
    }
    .card {
      background: #1a1714;
      border: 1px solid #2a2520;
      border-radius: 16px;
      padding: 1.05rem 1.1rem;
      color: #f4efe8;
    }
    .card--form {
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
    }
    .card--empty {
      margin-top: 0.9rem;
      text-align: center;
    }
    .empty-title {
      margin: 0 0 0.35rem;
      font-weight: 700;
      color: #f4efe8;
    }
    .empty {
      margin: 0;
      font-size: 0.9rem;
      line-height: 1.4;
    }
    label {
      display: grid;
      gap: 0.4rem;
      font-size: 0.9rem;
      font-weight: 600;
      color: #e8e0d6;
    }
    input {
      border: 1px solid #3a342e;
      border-radius: 12px;
      padding: 0.75rem 0.85rem;
      background: #12100e;
      color: #f4efe8;
      caret-color: #f4efe8;
      font: inherit;
      color-scheme: dark;
    }
    input:focus {
      outline: 2px solid color-mix(in srgb, var(--accent, #3dba6e) 55%, transparent);
      outline-offset: 1px;
      border-color: color-mix(in srgb, var(--accent, #3dba6e) 50%, #3a342e);
    }
    input::placeholder {
      color: #8a8076;
    }
    input:-webkit-autofill,
    input:-webkit-autofill:hover,
    input:-webkit-autofill:focus {
      -webkit-text-fill-color: #f4efe8;
      caret-color: #f4efe8;
      box-shadow: 0 0 0 1000px #12100e inset;
      transition: background-color 99999s ease-out;
    }
    button {
      margin-top: 0.9rem;
      width: 100%;
      border: 0;
      border-radius: 12px;
      padding: 0.8rem;
      background: var(--accent, #3dba6e);
      color: #fff;
      font-weight: 700;
      font-size: 1rem;
      cursor: pointer;
      text-shadow: 0 1px 1px rgba(0, 0, 0, 0.25);
    }
    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .results-meta {
      margin: 1.1rem 0 0.55rem;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 0.75rem;
    }
    .card--row {
      display: grid;
      gap: 0.35rem;
      border-left: 3px solid #3a342e;
    }
    .card--confirmed {
      border-left-color: var(--accent, #3dba6e);
    }
    .card--pending {
      border-left-color: #e0a84a;
    }
    .card--rejected {
      border-left-color: #e07070;
    }
    .row-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .badge[data-status='confirmed'] {
      background: color-mix(in srgb, var(--accent, #3dba6e) 35%, #1a1714);
      color: #f2fff6;
    }
    .badge[data-status='pending'] {
      background: rgba(224, 168, 74, 0.28);
      color: #ffe7b0;
    }
    .badge[data-status='rejected'] {
      background: rgba(224, 112, 112, 0.28);
      color: #ffd0d0;
    }
    .mesa {
      font-size: 0.8rem;
      color: #c9c0b5;
      font-weight: 600;
    }
    .when {
      color: #f4efe8;
      font-size: 1.05rem;
      line-height: 1.25;
    }
    .meta {
      color: #c9c0b5;
      font-size: 0.9rem;
    }
    .hint {
      margin: 0.25rem 0 0;
      font-size: 0.85rem;
    }
    .reason {
      margin: 0.45rem 0 0;
      padding: 0.55rem 0.65rem;
      border-radius: 10px;
      background: rgba(224, 112, 112, 0.1);
      font-size: 0.88rem;
      line-height: 1.4;
      color: #f0c8c8;
    }
    .reason__label {
      display: block;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #f0a0a0;
      margin-bottom: 0.15rem;
    }
    .reason--muted {
      color: #c9c0b5;
      background: #221e1a;
    }
    .back {
      margin-top: 1.5rem;
      text-align: center;
    }
    a {
      color: var(--accent, #3dba6e);
      font-weight: 600;
    }
    .page--error {
      padding: 3rem 1rem;
      text-align: center;
      color: #f4efe8;
    }
  `,
})
export class PublicReservationLookupComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReservationsApiService);
  private readonly title = inject(Title);

  readonly slug = computed(() => String(this.route.snapshot.paramMap.get('slug') ?? '').trim());
  readonly shopName = signal('');
  readonly logoUrl = signal<string | null>(null);
  readonly accent = signal('#3dba6e');
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);
  readonly searched = signal(false);
  readonly rows = signal<PublicReservationLookupItem[]>([]);
  email = '';

  ngOnInit(): void {
    applyStatusBar('#0e0c0b', 'dark');
    this.title.setTitle('Consultar reserva');
  }

  ngOnDestroy(): void {
    resetStatusBar();
  }

  search(ev: Event): void {
    ev.preventDefault();
    const slug = this.slug();
    const email = this.email.trim();
    if (!slug || !email) return;
    this.loading.set(true);
    this.error.set(null);
    this.api.publicLookupReservations(slug, email).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.searched.set(true);
        this.shopName.set(res.shop?.name ?? '');
        this.logoUrl.set(
          resolveShopLogoSrc(res.shop?.logoUrl, res.shop?.id) ||
            normalizeLogoUrl(res.shop?.logoUrl) ||
            res.shop?.logoUrl?.trim() ||
            null,
        );
        this.accent.set(res.shop?.accentColor?.trim() || '#3dba6e');
        const list = (res.items ?? res.reservations ?? []) as PublicReservationLookupItem[];
        this.rows.set(
          list.map((r) => ({
            ...r,
            publicStatus: r.publicStatus ?? 'confirmed',
            statusReason: r.statusReason ?? null,
          })),
        );
        this.title.setTitle(`Reservas · ${res.shop?.name ?? slug}`);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No pudimos consultar las reservas de este local.');
      },
    });
  }

  statusLabel(status: PublicReservationLookupItem['publicStatus']): string {
    if (status === 'pending') return 'Pendiente';
    if (status === 'rejected') return 'Rechazada';
    return 'Confirmada';
  }

  onLogoError(): void {
    this.logoUrl.set(null);
  }

  formatWhen(iso: string, time?: string | null): string {
    const label = formatIsoDateWithWeekday(iso) || iso;
    return time ? `${label} a las ${time}` : label;
  }
}
