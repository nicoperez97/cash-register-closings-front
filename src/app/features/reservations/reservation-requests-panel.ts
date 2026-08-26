import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { usePageRefresh } from '../../core/page-refresh.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
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
import { partyMustSitOutside } from './reservation-party-rules.util';
import {
  ReservationDecideDialogComponent,
  ReservationDecideDialogData,
} from './reservation-decide-dialog';

export type ReservationRequestAccepted = {
  reservationId: string | null;
  businessDate: string;
  guestName: string;
  partySize: number;
  area: ReservationArea | string | null;
  reservationTime?: string | null;
  whenLabel: string;
};

@Component({
  selector: 'app-reservation-requests-panel',
  imports: [
    FormsModule,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDialogModule,
  ],
  template: `
    <section class="panel-card req-panel" [class.req-panel--closed]="!signupOpen()">
      <header class="req-head">
        <div class="req-head__title">
          <h2 class="guy-section-title">Solicitudes web</h2>
          @if (pendingRequests().length) {
            <span class="req-count">{{ pendingRequests().length }}</span>
          }
          <p class="req-head__lead">
            @if (signupOpen()) {
              @if (pendingRequests().length) {
                Aceptar o rechazar avisa por mail · Borrar no avisa
              } @else {
                Cuando alguien reserve desde el link, aparece acá
              }
            } @else {
              Cerrado · ingreso por orden de llegada
            }
          </p>
        </div>
        <div class="req-head__tools">
          @if (shopSlug()) {
            <a
              class="req-icon-btn req-icon-btn--accent"
              [href]="signupUrl()"
              target="_blank"
              rel="noopener"
              matTooltip="Abrir formulario público"
            >
              <mat-icon>open_in_new</mat-icon>
            </a>
            <button
              type="button"
              class="req-icon-btn"
              (click)="copySignupUrl()"
              matTooltip="Copiar link"
            >
              <mat-icon>content_copy</mat-icon>
            </button>
          }
          <button
            type="button"
            class="req-icon-btn"
            (click)="reloadRequests()"
            [disabled]="requestsBusy()"
            matTooltip="Recargar solicitudes y reservas"
          >
            <mat-icon [class.req-spin]="requestsBusy()">refresh</mat-icon>
          </button>
        </div>
      </header>

      <div class="req-settings">
        <button
          type="button"
          class="req-live"
          [class.req-live--on]="signupOpen()"
          [disabled]="signupBusy()"
          (click)="toggleSignup(!signupOpen())"
        >
          <span class="req-live__dot"></span>
          {{ signupOpen() ? 'Abierto' : 'Cerrado' }}
        </button>
        <div class="req-seg" role="group" aria-label="Sectores">
          <button
            type="button"
            class="req-seg__btn"
            [class.req-seg__btn--on]="insideOpen()"
            [disabled]="signupBusy() || (insideOpen() && !outsideOpen())"
            (click)="toggleArea('INSIDE', !insideOpen())"
          >
            Adentro
          </button>
          <button
            type="button"
            class="req-seg__btn"
            [class.req-seg__btn--on]="outsideOpen()"
            [disabled]="signupBusy() || (outsideOpen() && !insideOpen())"
            (click)="toggleArea('OUTSIDE', !outsideOpen())"
          >
            Afuera
          </button>
        </div>
        <div class="req-seg" role="group" aria-label="Horario del formulario">
          <button
            type="button"
            class="req-seg__btn"
            [class.req-seg__btn--on]="!timeRequired()"
            [disabled]="timeRequiredBusy()"
            (click)="setTimeRequired(false)"
          >
            Opcional
          </button>
          <button
            type="button"
            class="req-seg__btn"
            [class.req-seg__btn--on]="timeRequired()"
            [disabled]="timeRequiredBusy()"
            (click)="setTimeRequired(true)"
          >
            Obligatorio
          </button>
        </div>
        <label class="req-num">
          <span>Máx. adentro</span>
          <input
            type="number"
            min="1"
            max="99"
            inputmode="numeric"
            [ngModel]="insideMaxDraft()"
            (ngModelChange)="insideMaxDraft.set($event)"
            placeholder="—"
          />
        </label>
        <label class="req-num">
          <span>Afuera hasta</span>
          <input
            type="number"
            min="1"
            max="99"
            inputmode="numeric"
            [ngModel]="outsideMinDraft()"
            (ngModelChange)="outsideMinDraft.set($event)"
            placeholder="—"
          />
        </label>
        <button
          type="button"
          class="req-save"
          [disabled]="partyRulesBusy() || !partyRulesDirty()"
          (click)="savePartyRules()"
        >
          {{ partyRulesBusy() ? '…' : 'Guardar' }}
        </button>
      </div>

      <ul class="req-list" [class.req-list--hidden]="!signupOpen() && !pendingRequests().length">
        @for (req of pendingRequests(); track req.id) {
          <li
            class="req-card"
            [id]="'reservation-request-' + req.id"
            [class.req-card--out]="req.area === 'OUTSIDE' || mustSitOutside(req)"
            [class.req-card--working]="busyRequestId() === req.id"
            [class.req-card--working-reject]="busyRequestId() === req.id && busyAction() === 'reject'"
            [class.req-card--working-delete]="busyRequestId() === req.id && busyAction() === 'delete'"
            [class.req-card--locked]="!!busyRequestId() && busyRequestId() !== req.id"
          >
            <span class="req-card__avatar" aria-hidden="true">{{ initials(req.guestName) }}</span>
            <div class="req-card__body">
              <div class="req-card__top">
                <strong>{{ req.guestName }}</strong>
                <span class="req-card__when">{{ requestWhen(req) }}</span>
              </div>
              <p class="req-card__meta">
                {{ req.partySize }} {{ req.partySize === 1 ? 'persona' : 'personas' }}
                <span>·</span>
                {{ req.area === 'OUTSIDE' ? 'Afuera' : 'Adentro' }}
              </p>
              @if (mustSitOutside(req)) {
                <p class="req-card__rule">Al aceptar queda afuera</p>
              }
              <div class="req-card__contact">
                <a [href]="'mailto:' + req.guestEmail">{{ req.guestEmail }}</a>
                @if (req.instagramHandle) {
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
              </div>
              @if (req.guestComment) {
                <p class="req-card__comment">{{ req.guestComment }}</p>
              }
              @if (busyRequestId() === req.id) {
                <p class="req-card__status" role="status">
                  {{
                    busyAction() === 'reject'
                      ? 'Rechazando…'
                      : busyAction() === 'delete'
                        ? 'Borrando…'
                        : 'Aceptando y cargando en el piso…'
                  }}
                </p>
              }
            </div>
            <div class="req-card__actions">
              <button
                type="button"
                class="req-btn req-btn--yes"
                [disabled]="!!busyRequestId()"
                (click)="acceptRequest(req)"
              >
                @if (busyRequestId() === req.id && busyAction() === 'accept') {
                  <mat-icon class="req-spin">sync</mat-icon>
                  Aceptando…
                } @else {
                  Aceptar
                }
              </button>
              @if (req.instagramHandle) {
                <button
                  type="button"
                  class="req-btn req-btn--ig"
                  [disabled]="!!busyRequestId()"
                  matTooltip="Aceptar, copiar mensaje y abrir Instagram"
                  (click)="acceptRequest(req, true)"
                >
                  Aceptar + IG
                </button>
              }
              <button
                type="button"
                class="req-btn req-btn--ghost"
                [disabled]="!!busyRequestId()"
                (click)="rejectRequest(req)"
              >
                {{ busyRequestId() === req.id && busyAction() === 'reject' ? '…' : 'Rechazar' }}
              </button>
              <button
                type="button"
                class="req-btn req-btn--mute"
                [disabled]="!!busyRequestId()"
                matTooltip="La saca de la lista. No envía mail."
                (click)="deleteRequest(req)"
              >
                {{ busyRequestId() === req.id && busyAction() === 'delete' ? '…' : 'Borrar' }}
              </button>
              @if (req.instagramHandle) {
                <button
                  type="button"
                  class="req-icon-btn"
                  matTooltip="Copiar mensaje y abrir Instagram"
                  [disabled]="!!busyRequestId()"
                  (click)="openGuestInstagram(req, true)"
                >
                  <mat-icon>photo_camera</mat-icon>
                </button>
              }
            </div>
          </li>
        } @empty {
          @if (signupOpen()) {
            <li class="req-empty">Sin solicitudes pendientes</li>
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
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirm = inject(ConfirmDialogService);
  readonly shops = inject(ShopContextService);
  private readonly live = inject(ShopLiveClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private openedRequestId: string | null = null;

  readonly accepted = output<ReservationRequestAccepted>();
  readonly refreshAll = output<void>();

  readonly pendingRequests = signal<ReservationRequestRow[]>([]);
  readonly busyRequestId = signal<string | null>(null);
  readonly busyAction = signal<'accept' | 'reject' | 'delete' | null>(null);
  readonly signupBusy = signal(false);
  readonly timeRequiredBusy = signal(false);
  readonly requestsBusy = signal(false);
  readonly partyRulesBusy = signal(false);
  readonly insideMaxDraft = signal<number | null>(null);
  readonly outsideMinDraft = signal<number | null>(null);
  private partyRulesShopId: string | null = null;

  private requestsPoll: ReturnType<typeof setInterval> | null = null;

  readonly shopSlug = computed(() => this.shops.selectedShop()?.slug ?? '');
  readonly signupOpen = computed(
    () => this.shops.selectedShop()?.reservationSignupEnabled !== false,
  );
  readonly timeRequired = computed(
    () => this.shops.selectedShop()?.reservationTimeRequired === true,
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
    this.live
      .watch(this.shopSlug, ['reservations'])
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.loadRequests());
    effect(() => {
      const shop = this.shops.selectedShop();
      const id = shop?.id ?? null;
      if (id === this.partyRulesShopId) return;
      this.partyRulesShopId = id;
      this.insideMaxDraft.set(this.normalizePartyRule(shop?.reservationInsideMaxPartySize));
      this.outsideMinDraft.set(this.normalizePartyRule(shop?.reservationOutsideMinPartySize));
    });
  }

  ngOnInit(): void {
    this.loadRequests(() => this.openRequestFromQuery());
    this.requestsPoll = setInterval(() => this.loadRequests(), 120_000);
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

  async toggleArea(area: ReservationArea, enabled: boolean): Promise<void> {
    const shop = this.shops.selectedShop();
    const shopId = this.shops.selectedShopId();
    if (!shop || !shopId || this.signupBusy()) return;
    const inside = area === 'INSIDE' ? enabled : this.insideOpen();
    const outside = area === 'OUTSIDE' ? enabled : this.outsideOpen();
    if (!inside && !outside) {
      this.snack.open('Dejá al menos un sector habilitado', 'OK', { duration: 2800 });
      return;
    }
    const label = area === 'OUTSIDE' ? 'Afuera' : 'Adentro';
    const ok = await this.confirm.confirm(
      enabled ? `¿Activar ${label}?` : `¿Desactivar ${label}?`,
      enabled
        ? `Van a poder pedir mesa ${label.toLowerCase()} desde el formulario.`
        : `No van a poder pedir mesa ${label.toLowerCase()} hasta que lo actives de nuevo.`,
      {
        confirmLabel: enabled ? 'Activar' : 'Desactivar',
        confirmColor: enabled ? 'primary' : 'warn',
        icon: enabled ? 'check_circle' : 'block',
      },
    );
    if (!ok) return;
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

  async toggleSignup(enabled: boolean): Promise<void> {
    const shop = this.shops.selectedShop();
    const shopId = this.shops.selectedShopId();
    if (!shop || !shopId || this.signupBusy()) return;
    const ok = await this.confirm.confirm(
      enabled ? '¿Abrir reservas?' : '¿Cerrar reservas?',
      enabled
        ? 'La gente va a poder pedir mesa desde el link público.'
        : 'Nadie va a poder pedir mesa hasta que lo abras de nuevo.',
      {
        confirmLabel: enabled ? 'Abrir' : 'Cerrar',
        confirmColor: enabled ? 'primary' : 'warn',
        icon: enabled ? 'lock_open' : 'lock',
      },
    );
    if (!ok) return;
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

  setTimeRequired(required: boolean): void {
    const shop = this.shops.selectedShop();
    const shopId = this.shops.selectedShopId();
    if (!shop || !shopId || this.timeRequiredBusy()) return;
    if (this.timeRequired() === required) return;
    this.timeRequiredBusy.set(true);
    this.api.setReservationTimeRequired(shopId, required).subscribe({
      next: (res) => {
        this.timeRequiredBusy.set(false);
        this.shops.upsertShop({
          ...shop,
          reservationTimeRequired: res.reservationTimeRequired,
        });
        this.auth.scheduleRefreshMe(200);
        this.snack.open(
          res.reservationTimeRequired
            ? 'Horario obligatorio en el formulario'
            : 'Horario opcional en el formulario',
          'OK',
          { duration: 2200 },
        );
      },
      error: () => {
        this.timeRequiredBusy.set(false);
        this.snack.open('No se pudo cambiar el horario', 'OK', { duration: 3000 });
      },
    });
  }

  requestWhen(req: ReservationRequestRow): string {
    return requestWhenLabel(req);
  }

  initials(name: string): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const first = parts[0][0] ?? '';
    const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : (parts[0][1] ?? '');
    return `${first}${last}`.toUpperCase();
  }

  mustSitOutside(req: ReservationRequestRow): boolean {
    if (req.area === 'OUTSIDE') return false;
    return partyMustSitOutside(req.partySize, this.shops.selectedShop());
  }

  partyRulesDirty(): boolean {
    const shop = this.shops.selectedShop();
    return (
      this.normalizePartyRule(this.insideMaxDraft()) !==
        this.normalizePartyRule(shop?.reservationInsideMaxPartySize) ||
      this.normalizePartyRule(this.outsideMinDraft()) !==
        this.normalizePartyRule(shop?.reservationOutsideMinPartySize)
    );
  }

  savePartyRules(): void {
    const shop = this.shops.selectedShop();
    const shopId = this.shops.selectedShopId();
    if (!shop || !shopId || this.partyRulesBusy()) return;
    this.partyRulesBusy.set(true);
    this.api
      .setReservationPartyRules(shopId, {
        insideMaxPartySize: this.normalizePartyRule(this.insideMaxDraft()),
        outsideMaxPartySize: this.normalizePartyRule(this.outsideMinDraft()),
        outsideMinPartySize: this.normalizePartyRule(this.outsideMinDraft()),
      })
      .subscribe({
        next: (res) => {
          this.partyRulesBusy.set(false);
          this.shops.upsertShop({
            ...shop,
            reservationInsideMaxPartySize: res.reservationInsideMaxPartySize,
            reservationOutsideMinPartySize: res.reservationOutsideMinPartySize,
          });
          this.insideMaxDraft.set(this.normalizePartyRule(res.reservationInsideMaxPartySize));
          this.outsideMinDraft.set(
            this.normalizePartyRule(
              res.reservationOutsideMaxPartySize ?? res.reservationOutsideMinPartySize,
            ),
          );
          this.auth.scheduleRefreshMe(200);
          this.snack.open('Regla de personas actualizada', 'OK', { duration: 2200 });
        },
        error: (err) => {
          this.partyRulesBusy.set(false);
          const msg =
            (err?.error?.message as string | string[] | undefined) ??
            'No se pudo guardar';
          this.snack.open(Array.isArray(msg) ? msg[0] : String(msg), 'OK', { duration: 3000 });
        },
      });
  }

  private normalizePartyRule(raw: number | string | null | undefined): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(99, n);
  }

  private async askDecision(
    req: ReservationRequestRow,
    action: 'accept' | 'reject',
    openIg = false,
  ) {
    return firstValueFrom(
      this.dialogTitle
        .track(
          this.dialog.open(ReservationDecideDialogComponent, {
            width: '440px',
            maxWidth: '96vw',
            panelClass: 'guy-dialog',
            data: { request: req, action, openIg } satisfies ReservationDecideDialogData,
          }),
          action === 'accept' ? 'Aceptar reserva' : 'Rechazar reserva',
        )
        .afterClosed(),
    );
  }

  async acceptRequest(req: ReservationRequestRow, openIg = false): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.busyRequestId()) return;
    const decision = await this.askDecision(req, 'accept', openIg);
    if (!decision) return;
    if (decision.openIg) {
      this.openGuestInstagram(req, true, { snack: false });
    }
    this.busyRequestId.set(req.id);
    this.busyAction.set('accept');
    requestAnimationFrame(() => {
      document
        .getElementById(`reservation-request-${req.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    this.api.acceptReservationRequest(shopId, req.id, decision.note || null).subscribe({
      next: (row) => {
        const day = String(row.businessDate || req.businessDate || '').slice(0, 10);
        const guestName = String(row.guestName || req.guestName || 'Reserva').trim();
        const partySize = Number(row.partySize ?? req.partySize ?? 0);
        const area = row.area || req.area || 'INSIDE';
        const whenLabel = this.requestWhen(req);
        const areaLabel = area === 'OUTSIDE' ? 'Afuera' : 'Adentro';
        const people =
          partySize === 1 ? '1 persona' : `${partySize || '?'} personas`;
        const detail = `${guestName} · ${people} · ${areaLabel} · ${whenLabel}`;
        this.snack.open(
          openIg
            ? `Confirmada: ${detail}. Pegá el mensaje en Instagram.`
            : `Confirmada: ${detail}`,
          'OK',
          { duration: 4500 },
        );
        this.inbox.refresh();
        this.accepted.emit({
          reservationId: row.reservationId ?? null,
          businessDate: day,
          guestName,
          partySize,
          area,
          reservationTime: row.reservationTime ?? req.reservationTime ?? null,
          whenLabel,
        });
        this.loadRequests(() => {
          this.busyRequestId.set(null);
          this.busyAction.set(null);
        });
      },
      error: (err) => {
        this.busyRequestId.set(null);
        this.busyAction.set(null);
        const msg = err?.error?.message ?? 'No se pudo aceptar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
      },
    });
  }

  async rejectRequest(req: ReservationRequestRow): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.busyRequestId()) return;
    const decision = await this.askDecision(req, 'reject');
    if (!decision) return;
    this.busyRequestId.set(req.id);
    this.busyAction.set('reject');
    this.api.rejectReservationRequest(shopId, req.id, decision.note || null).subscribe({
      next: () => {
        this.busyRequestId.set(null);
        this.busyAction.set(null);
        this.snack.open('Solicitud rechazada. Se avisó por mail.', 'OK', { duration: 2800 });
        this.loadRequests();
        this.inbox.refresh();
      },
      error: () => {
        this.busyRequestId.set(null);
        this.busyAction.set(null);
        this.snack.open('No se pudo rechazar', 'OK', { duration: 3000 });
      },
    });
  }

  async deleteRequest(req: ReservationRequestRow): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.busyRequestId()) return;
    const when = this.requestWhen(req);
    const ok = await this.confirm.confirm(
      'Borrar solicitud',
      `¿Borrar la solicitud de ${req.guestName} (${when})? No se avisa por mail.`,
      { confirmLabel: 'Borrar', icon: 'delete' },
    );
    if (!ok) return;
    this.busyRequestId.set(req.id);
    this.busyAction.set('delete');
    this.api.removeReservationRequest(shopId, req.id).subscribe({
      next: () => {
        this.busyRequestId.set(null);
        this.busyAction.set(null);
        this.snack.open('Solicitud borrada. No se envió mail.', 'OK', { duration: 2800 });
        this.loadRequests();
        this.inbox.refresh();
      },
      error: () => {
        this.busyRequestId.set(null);
        this.busyAction.set(null);
        this.snack.open('No se pudo borrar', 'OK', { duration: 3000 });
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
    this.refreshAll.emit();
  }

  private openRequestFromQuery(): void {
    const id = (this.route.snapshot.queryParamMap.get('request') || '').trim();
    if (!id || this.openedRequestId === id) return;
    const req = this.pendingRequests().find((r) => r.id === id);
    if (!req) return;
    this.openedRequestId = id;
    void this.askDecision(req, 'accept');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { request: null, shop: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private loadRequests(afterLoad?: () => void): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.pendingRequests.set([]);
      afterLoad?.();
      return;
    }
    this.requestsBusy.set(true);
    this.api.listReservationRequests(shopId, 'PENDING').subscribe({
      next: (rows) => {
        this.requestsBusy.set(false);
        this.pendingRequests.set(rows ?? []);
        this.openRequestFromQuery();
        afterLoad?.();
      },
      error: () => {
        this.requestsBusy.set(false);
        this.pendingRequests.set([]);
        afterLoad?.();
      },
    });
  }
}
