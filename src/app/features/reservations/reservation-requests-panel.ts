import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth/auth.service';
import { usePageRefresh } from '../../core/page-refresh.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import {
  ReservationArea,
  ReservationRequestRow,
  ReservationsApiService,
} from './reservations-api.service';
import { ReservationsInboxService } from './reservations-inbox.service';
import {
  copyTextNow,
  igConfirmMessage,
  requestWhenLabel,
} from './reservation-messaging.util';

export type ReservationRequestAccepted = {
  reservationId: string | null;
  businessDate: string;
};

@Component({
  selector: 'app-reservation-requests-panel',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  template: `
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
                · {{ pendingRequests().length }} pendiente{{
                  pendingRequests().length === 1 ? '' : 's'
                }}
                por resolver
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
                    [href]="
                      req.instagramUrl ||
                      'https://www.instagram.com/' + req.instagramHandle + '/'
                    "
                    target="_blank"
                    rel="noopener"
                    >@{{ req.instagramHandle }}</a
                  >
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
  `,
  styleUrl: './reservation-requests-panel.scss',
})
export class ReservationRequestsPanelComponent implements OnInit, OnDestroy {
  private readonly api = inject(ReservationsApiService);
  private readonly inbox = inject(ReservationsInboxService);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  readonly shops = inject(ShopContextService);

  readonly accepted = output<ReservationRequestAccepted>();

  readonly pendingRequests = signal<ReservationRequestRow[]>([]);
  readonly busyRequestId = signal<string | null>(null);
  readonly signupBusy = signal(false);
  readonly requestsBusy = signal(false);

  private requestsPoll: ReturnType<typeof setInterval> | null = null;

  readonly shopSlug = computed(() => this.shops.selectedShop()?.slug ?? '');
  readonly signupOpen = computed(
    () => this.shops.selectedShop()?.reservationSignupEnabled !== false,
  );
  readonly insideOpen = computed(
    () => this.shops.selectedShop()?.reservationInsideEnabled !== false,
  );
  readonly outsideOpen = computed(
    () => this.shops.selectedShop()?.reservationOutsideEnabled !== false,
  );

  constructor() {
    usePageRefresh(() => {
      this.loadRequests();
      this.inbox.refresh();
    });
  }

  ngOnInit(): void {
    this.loadRequests();
    this.requestsPoll = setInterval(() => this.loadRequests(), 45_000);
  }

  ngOnDestroy(): void {
    if (this.requestsPoll) {
      clearInterval(this.requestsPoll);
      this.requestsPoll = null;
    }
  }

  signupUrl(): string {
    const slug = this.shopSlug();
    return `${window.location.origin}/reservar/${encodeURIComponent(slug)}`;
  }

  async copySignupUrl(): Promise<void> {
    const copied = copyTextNow(this.signupUrl());
    this.snack.open(
      copied ? 'Link del formulario copiado' : 'No se pudo copiar',
      'OK',
      { duration: 2200 },
    );
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

  requestWhen(req: ReservationRequestRow): string {
    return requestWhenLabel(req);
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
        this.loadRequests();
        this.inbox.refresh();
        this.accepted.emit({
          reservationId: row.reservationId ?? null,
          businessDate: day,
        });
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
    const shop = this.shops.selectedShop()?.name ?? 'el local';
    const text = igConfirmMessage(
      {
        guestName: req.guestName,
        partySize: req.partySize,
        when: this.requestWhen(req),
        area: req.area === 'OUTSIDE' ? 'Afuera' : 'Adentro',
        accepted,
      },
      shop,
    );
    const copied = copyTextNow(text);
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

  reloadRequests(): void {
    this.loadRequests();
    this.inbox.refresh();
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
}
