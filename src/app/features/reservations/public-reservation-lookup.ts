import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
import { formatIsoDateWithWeekday } from '../../core/shop/business-date';
import { ReservationRow, ReservationsApiService } from './reservations-api.service';

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
          <p class="brand">{{ shopName() || 'Reservas' }}</p>
          <h1>¿Tenés reserva?</h1>
          <p class="lead">Ingresá el mail con el que reservaste. Te mostramos las que todavía no pasaron.</p>
        </header>

        <form class="card" (submit)="search($event)">
          <label>
            Mail
            <input type="email" [(ngModel)]="email" name="email" required autocomplete="email" />
          </label>
          <button type="submit" [disabled]="loading()">{{ loading() ? 'Buscando…' : 'Consultar' }}</button>
        </form>

        @if (searched()) {
          @if (!rows().length) {
            <p class="empty">No hay reservas próximas con ese mail.</p>
          } @else {
            <ul class="list">
              @for (r of rows(); track r.id) {
                <li>
                  <strong>{{ formatWhen(r.businessDate, r.reservationTime) }}</strong>
                  <span>{{ r.guestName || 'Sin nombre' }} · {{ r.partySize }} personas · {{ r.area === 'OUTSIDE' ? 'Afuera' : 'Adentro' }}</span>
                  @if (r.tableNumber) {
                    <span>Mesa {{ r.tableNumber }}</span>
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
    :host { display: block; min-height: 100dvh; background: #0e0c0b; color: #f4efe8; }
    .page { max-width: 28rem; margin: 0 auto; padding: 2rem 1.1rem 3rem; }
    .hero { margin-bottom: 1.2rem; }
    .brand { margin: 0 0 0.4rem; letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.75rem; color: var(--accent, #3dba6e); }
    h1 { margin: 0 0 0.4rem; font-size: 1.7rem; }
    .lead, .empty, .back { color: #c9c0b5; }
    .card, li { background: #1a1714; border-radius: 14px; padding: 1rem; }
    label { display: grid; gap: 0.35rem; font-size: 0.9rem; }
    input { border: 1px solid #3a342e; border-radius: 10px; padding: 0.7rem 0.8rem; background: #12100e; color: inherit; }
    button { margin-top: 0.8rem; width: 100%; border: 0; border-radius: 10px; padding: 0.75rem; background: var(--accent, #3dba6e); color: #07210f; font-weight: 700; }
    .list { list-style: none; padding: 0; display: grid; gap: 0.7rem; }
    li { display: grid; gap: 0.2rem; }
    .back { margin-top: 1.4rem; }
    a { color: var(--accent, #3dba6e); }
    .page--error { padding: 3rem 1rem; text-align: center; }
  `,
})
export class PublicReservationLookupComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReservationsApiService);
  private readonly title = inject(Title);

  readonly slug = computed(() => String(this.route.snapshot.paramMap.get('slug') ?? '').trim());
  readonly shopName = signal('');
  readonly accent = signal('#3dba6e');
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);
  readonly searched = signal(false);
  readonly rows = signal<ReservationRow[]>([]);
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
        this.accent.set(res.shop?.accentColor?.trim() || '#3dba6e');
        this.rows.set(res.reservations ?? []);
        this.title.setTitle(`Reservas · ${res.shop?.name ?? slug}`);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No pudimos consultar las reservas de este local.');
      },
    });
  }

  formatWhen(iso: string, time?: string | null): string {
    const label = formatIsoDateWithWeekday(iso) || iso;
    return time ? `${label} a las ${time}` : label;
  }
}
