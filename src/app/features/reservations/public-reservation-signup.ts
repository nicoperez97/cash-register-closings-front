import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDatepicker, MatDatepickerModule } from '@angular/material/datepicker';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
import { formatIsoDateWithWeekday, resolveShopCalendarDate } from '../../core/shop/business-date';
import { resolveShopLogoSrc } from '../../core/utils/drive-url';
import {
  PublicReservationSignup,
  ReservationsApiService,
} from './reservations-api.service';
import { partyMustSitOutside, partyOutsideHint } from './reservation-party-rules.util';

const TIME_SLOTS = ['19:30', '20:00', '20:30', '21:00'];

@Component({
  selector: 'app-public-reservation-signup',
  imports: [FormsModule, MatDatepickerModule],
  template: `
    @if (error(); as err) {
      <div class="page page--error">
        <p>{{ err }}</p>
        <button type="button" class="ghost" (click)="load()">Reintentar</button>
      </div>
    } @else if (info(); as i) {
      <div class="page" [class.page--logo-only]="!shopSignupOpen()" [style.--accent]="accent()">
        <div class="glow" aria-hidden="true"></div>
        <header class="hero">
          @if (logoUrl()) {
            @if (!shopSignupOpen() && igUrl(); as url) {
              <a [href]="url" target="_blank" rel="noopener" [attr.aria-label]="'Instagram de ' + i.shop.name">
                <img class="logo" [src]="logoUrl()!" [alt]="i.shop.name" />
              </a>
            } @else {
              <img class="logo" [src]="logoUrl()!" [alt]="i.shop.name" />
            }
          } @else {
            <p class="brand">{{ i.shop.name }}</p>
          }
          @if (shopSignupOpen()) {
            <div class="hero__text">
              <h1>Reservá tu mesa</h1>
              <p class="lead">Dejanos tus datos. Te confirmamos por mail.</p>
              <p class="lead lead--policy">
                Se toman reservas hasta las 21 hs. A partir de las 21 hs es por orden de llegada.
              </p>
              <p class="shop-name">{{ i.shop.name }}</p>
            </div>
          } @else {
            <p class="walkin">El ingreso es por orden de llegada</p>
          }
        </header>

        @if (shopSignupOpen()) {
        @if (sent()) {
          <section class="card done" role="status">
            <div class="done__mark" aria-hidden="true">✓</div>
            <h2>¡Listo, {{ sentName() }}!</h2>
            <p>
              @if (sentConfirmed()) {
                Reserva confirmada para <strong>{{ sentPeople() }}</strong> el
                <strong>{{ sentWhen() }}</strong>.
              } @else {
                Pedido para <strong>{{ sentPeople() }}</strong> el
                <strong>{{ sentWhen() }}</strong>.
              }
            </p>
            <p class="done__mail">
              @if (sentConfirmed()) {
                Te enviamos la confirmación a <strong>{{ sentEmail() }}</strong>.
              } @else {
                Te avisamos a <strong>{{ sentEmail() }}</strong> cuando el local confirme.
              }
            </p>
            <button type="button" class="ghost" (click)="reset()">Hacer otra reserva</button>
          </section>
        } @else if (dateSignupOpen()) {
          <form class="card form" (ngSubmit)="submit()" novalidate>
            <label class="field">
              <span>Tu nombre</span>
              <input
                type="text"
                name="guestName"
                autocomplete="name"
                maxlength="120"
                required
                [(ngModel)]="guestName"
                placeholder="Ej: Ana Pérez"
              />
            </label>
            <div class="pair">
              <label class="field">
                <span>Mail</span>
                <input
                  type="email"
                  name="guestEmail"
                  autocomplete="email"
                  inputmode="email"
                  maxlength="180"
                  required
                  [(ngModel)]="guestEmail"
                  placeholder="tunombre@mail.com"
                />
              </label>
              <label class="field">
                <span>Instagram <em>opcional</em></span>
                <div class="ig">
                  <span class="ig__prefix" aria-hidden="true">@</span>
                  <input
                    type="text"
                    name="instagram"
                    autocomplete="username"
                    maxlength="30"
                    [(ngModel)]="instagram"
                    placeholder="tuusuario"
                    (blur)="normalizeIg()"
                  />
                </div>
              </label>
            </div>

            <div class="block">
              <span class="lbl">¿Qué día?</span>
              <div class="split">
                <div class="pills">
                  <button
                    type="button"
                    class="pill"
                    [class.pill--on]="isOffset(0)"
                    [disabled]="isClosedOffset(0)"
                    (click)="setOffset(0)"
                  >
                    Hoy
                  </button>
                  <button
                    type="button"
                    class="pill"
                    [class.pill--on]="isOffset(1)"
                    [disabled]="isClosedOffset(1)"
                    (click)="setOffset(1)"
                  >
                    Mañana
                  </button>
                  <button
                    type="button"
                    class="pill"
                    [class.pill--on]="!isOffset(0) && !isOffset(1)"
                    (click)="pickOtherDay()"
                  >
                    <span class="only-desk">{{ dateChipLabel(false) }}</span>
                    <span class="only-mob">{{ dateChipLabel(true) }}</span>
                  </button>
                </div>
                <input
                  class="date-sr"
                  [matDatepicker]="otherPicker"
                  [min]="minAsDate"
                  [matDatepickerFilter]="dateFilter"
                  [value]="selectedAsDate"
                  (dateChange)="onDatePicked($event.value)"
                  tabindex="-1"
                  aria-hidden="true"
                />
                <mat-datepicker #otherPicker touchUi />
                <div class="stepper stepper--inline" aria-label="Cantidad de personas">
                  <button type="button" class="stepper__btn" (click)="bump(-1)" [disabled]="partySize <= 1">
                    −
                  </button>
                  <strong>{{ partySize }}</strong>
                  <button
                    type="button"
                    class="stepper__btn"
                    (click)="bump(1)"
                    [disabled]="partySize >= maxPartySize()"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div class="block">
              <span class="lbl">Horario <em>opcional</em></span>
              <div class="pills pills--times">
                @for (slot of timeSlots; track slot) {
                  <button
                    type="button"
                    class="pill"
                    [class.pill--on]="reservationTime === slot"
                    (click)="toggleTime(slot)"
                  >
                    {{ slot }}
                  </button>
                }
              </div>
            </div>

            <div class="block block--people">
              <span class="lbl">¿Cuántas personas?</span>
              <div class="stepper stepper--wide">
                <button type="button" class="stepper__btn" (click)="bump(-1)" [disabled]="partySize <= 1">
                  −
                </button>
                <strong>{{ partySize }}</strong>
                <button
                  type="button"
                  class="stepper__btn"
                  (click)="bump(1)"
                  [disabled]="partySize >= maxPartySize()"
                >
                  +
                </button>
              </div>
              @if (capacityHint(); as hint) {
                <p class="capacity-hint">{{ hint }}</p>
              }
            </div>

            @if (insideEnabled() && outsideEnabled()) {
              <div class="block">
                <span class="lbl">Sector preferido</span>
                <div class="pills pills--area">
                  <button
                    type="button"
                    class="pill"
                    [class.pill--on]="area === 'INSIDE'"
                    [disabled]="!insideAllowedForParty()"
                    (click)="setArea('INSIDE')"
                  >
                    Adentro
                    @if (insideCapacityLabel(); as cap) {
                      <em>· {{ cap }}</em>
                    }
                  </button>
                  <button
                    type="button"
                    class="pill"
                    [class.pill--on]="area === 'OUTSIDE'"
                    (click)="setArea('OUTSIDE')"
                  >
                    Afuera
                    @if (outsideCapacityLabel(); as cap) {
                      <em>· {{ cap }}</em>
                    }
                  </button>
                </div>
                @if (partyAreaHint(); as hint) {
                  <p class="area-note">{{ hint }}</p>
                }
              </div>
            } @else if (onlyAreaLabel(); as only) {
              <p class="area-note">
                La reserva es <strong>{{ only.open }}</strong>.
                El sector {{ only.full }} está lleno.
              </p>
              @if (partyAreaHint(); as hint) {
                <p class="area-note">{{ hint }}</p>
              }
            }

            <label class="field">
              <span>Comentario <em>opcional</em></span>
              <input
                type="text"
                name="guestComment"
                maxlength="400"
                [(ngModel)]="guestComment"
                placeholder="Algún pedido o detalle"
              />
            </label>

            <input class="hp" tabindex="-1" autocomplete="off" [(ngModel)]="website" name="website" />

            @if (formError()) {
              <p class="form-error">{{ formError() }}</p>
            }

            <button type="submit" class="submit" [disabled]="busy() || !canSubmitArea()">
              {{ busy() ? 'Enviando…' : 'Pedir reserva' }}
            </button>
            <p class="hint">
              Si el local tiene cupo abierto para ese sector, la reserva se confirma al instante.
              Si no, queda pendiente hasta que la acepten.
            </p>
          </form>
        } @else {
          <section class="card closed day-closed" role="status">
            <h2>Este día no toma reservas web</h2>
            <p>
              Para el
              <strong>{{ formatWhen(businessDate) }}</strong>
              el ingreso es por orden de llegada.
            </p>
            <p class="hint">Elegí otro día para pedir mesa:</p>
            <div class="block day-closed__pick">
              <div class="pills">
                <button
                  type="button"
                  class="pill"
                  [class.pill--on]="isOffset(0)"
                  [disabled]="isClosedOffset(0)"
                  (click)="setOffset(0)"
                >
                  Hoy
                </button>
                <button
                  type="button"
                  class="pill"
                  [class.pill--on]="isOffset(1)"
                  [disabled]="isClosedOffset(1)"
                  (click)="setOffset(1)"
                >
                  Mañana
                </button>
                <button
                  type="button"
                  class="pill"
                  [class.pill--on]="!isOffset(0) && !isOffset(1)"
                  (click)="pickOtherDay()"
                >
                  <span class="only-desk">{{ dateChipLabel(false) }}</span>
                  <span class="only-mob">{{ dateChipLabel(true) }}</span>
                </button>
              </div>
              <input
                class="date-sr"
                [matDatepicker]="closedDayPicker"
                [min]="minAsDate"
                [matDatepickerFilter]="dateFilter"
                [value]="selectedAsDate"
                (dateChange)="onDatePicked($event.value)"
                tabindex="-1"
                aria-hidden="true"
              />
              <mat-datepicker #closedDayPicker touchUi />
            </div>
            <button type="button" class="ghost" (click)="pickOtherDay()">Elegir otra fecha</button>
          </section>
        }
        }
      </div>
    } @else {
      <div class="page page--loading"><p>Cargando…</p></div>
    }
  `,
  styleUrl: './public-reservation-signup.scss',
})
export class PublicReservationSignupComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReservationsApiService);
  private readonly title = inject(Title);

  readonly timeSlots = TIME_SLOTS;
  readonly info = signal<PublicReservationSignup | null>(null);
  readonly dateFlags = signal<{
    signupEnabled: boolean;
    insideEnabled: boolean;
    outsideEnabled: boolean;
    insideCapacityRemaining: number | null;
    outsideCapacityRemaining: number | null;
  } | null>(null);
  readonly closedWeekdays = signal<number[]>([]);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly sentConfirmed = signal(false);
  readonly formError = signal<string | null>(null);
  readonly sentName = signal('');
  readonly sentEmail = signal('');
  readonly sentPeople = signal('');
  readonly sentWhen = signal('');

  guestName = '';
  guestEmail = '';
  instagram = '';
  businessDate = this.todayIso();
  reservationTime = '';
  partySize = 2;
  area: 'INSIDE' | 'OUTSIDE' = 'INSIDE';
  guestComment = '';
  website = '';
  minDate = this.todayIso();
  private readonly otherPicker = viewChild<MatDatepicker<Date>>('otherPicker');
  private readonly closedDayPicker = viewChild<MatDatepicker<Date>>('closedDayPicker');

  readonly shopSignupOpen = computed(() => this.info()?.shopSignupEnabled !== false);
  readonly dateSignupOpen = computed(() => {
    const df = this.dateFlags();
    if (df) return df.signupEnabled;
    return this.info()?.signupEnabled !== false;
  });
  readonly insideEnabled = computed(() => {
    const df = this.dateFlags();
    const v = df?.insideEnabled ?? this.info()?.insideEnabled;
    return v !== false;
  });
  readonly outsideEnabled = computed(() => {
    const df = this.dateFlags();
    const v = df?.outsideEnabled ?? this.info()?.outsideEnabled;
    return v !== false;
  });
  readonly onlyAreaLabel = computed(() => {
    const inside = this.insideEnabled();
    const outside = this.outsideEnabled();
    if (inside && !outside) return { open: 'adentro', full: 'afuera' };
    if (outside && !inside) return { open: 'afuera', full: 'adentro' };
    return null;
  });
  readonly accent = computed(() => this.info()?.shop.accentColor?.trim() || '#3dba6e');
  readonly logoUrl = computed(() => {
    const shop = this.info()?.shop;
    return resolveShopLogoSrc(shop?.logoUrl, shop?.id);
  });
  readonly igUrl = computed(() => {
    const handle = this.info()?.shop.instagramHandle?.replace(/^@+/, '').trim();
    return handle ? `https://www.instagram.com/${handle}/` : null;
  });

  ngOnInit(): void {
    applyStatusBar('#0e0c0b', 'dark');
    this.load();
  }

  ngOnDestroy(): void {
    resetStatusBar();
  }

  load(): void {
    const slug = this.slug();
    this.error.set(null);
    const today = this.todayIso();
    this.minDate = today;
    if (!this.businessDate || this.businessDate < today) {
      this.businessDate = today;
    }
    this.api.publicSignupInfo(slug, this.businessDate).subscribe({
      next: (info) => {
        this.info.set(info);
        this.closedWeekdays.set(
          Array.isArray(info.closedWeekdays) ? info.closedWeekdays : [],
        );
        if (info.closedDay || this.isIsoClosed(this.businessDate)) {
          const nextOpen = this.nextOpenIso(this.businessDate);
          if (nextOpen && nextOpen !== this.businessDate) {
            this.businessDate = nextOpen;
            this.refreshDateFlags();
            this.title.setTitle(`Reservar · ${info.shop.name}`);
            applyStatusBar('#0e0c0b', 'dark');
            return;
          }
        }
        this.applyDateFlags(info);
        this.syncArea(this.insideEnabled(), this.outsideEnabled());
        this.title.setTitle(`Reservar · ${info.shop.name}`);
        applyStatusBar('#0e0c0b', 'dark');
      },
      error: () => this.error.set('Este local no tiene reservas online por ahora.'),
    });
  }

  private applyDateFlags(info: PublicReservationSignup): void {
    if (Array.isArray(info.closedWeekdays)) {
      this.closedWeekdays.set(info.closedWeekdays);
    }
    this.dateFlags.set({
      signupEnabled: info.signupEnabled,
      insideEnabled: info.insideEnabled !== false,
      outsideEnabled: info.outsideEnabled !== false,
      insideCapacityRemaining:
        info.insideCapacityRemaining == null ? null : Number(info.insideCapacityRemaining),
      outsideCapacityRemaining:
        info.outsideCapacityRemaining == null ? null : Number(info.outsideCapacityRemaining),
    });
    this.syncArea(this.insideEnabled(), this.outsideEnabled());
    this.clampPartySize();
  }

  private refreshDateFlags(): void {
    const slug = this.slug();
    if (!slug || !this.businessDate) return;
    this.api.publicSignupInfo(slug, this.businessDate).subscribe({
      next: (info) => {
        this.applyDateFlags(info);
        this.syncArea(this.insideEnabled(), this.outsideEnabled());
      },
    });
  }

  readonly dateFilter = (date: Date | null): boolean => {
    if (!date || Number.isNaN(date.getTime())) return false;
    const closed = this.closedWeekdays();
    if (!closed.length) return true;
    return !closed.includes(date.getDay());
  };

  isIsoClosed(iso: string): boolean {
    const closed = this.closedWeekdays();
    if (!closed.length) return false;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return false;
    const weekday = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
    return closed.includes(weekday);
  }

  isClosedOffset(days: number): boolean {
    return this.isIsoClosed(this.isoPlus(days));
  }

  nextOpenIso(fromIso: string): string | null {
    const closed = this.closedWeekdays();
    if (!closed.length) return fromIso;
    const [y, m, d] = fromIso.split('-').map(Number);
    if (!y || !m || !d) return fromIso;
    for (let i = 0; i < 14; i++) {
      const dt = new Date(Date.UTC(y, m - 1, d + i, 12, 0, 0));
      const iso = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
      if (!this.isIsoClosed(iso)) return iso;
    }
    return null;
  }

  bump(delta: number): void {
    this.partySize = Math.min(this.maxPartySize(), Math.max(1, this.partySize + delta));
    this.syncArea(this.insideEnabled(), this.outsideEnabled());
  }

  setArea(next: 'INSIDE' | 'OUTSIDE'): void {
    if (next === 'INSIDE' && !this.insideAllowedForParty()) return;
    this.area = next;
    this.clampPartySize();
  }

  insideAllowedForParty(): boolean {
    if (!this.insideEnabled()) return false;
    return !partyMustSitOutside(this.partySize, this.info());
  }

  canSubmitArea(): boolean {
    if (this.area === 'OUTSIDE') return this.outsideEnabled();
    return this.insideAllowedForParty();
  }

  partyAreaHint(): string {
    return partyOutsideHint(this.partySize, this.info());
  }

  maxPartySize(): number {
    const df = this.dateFlags();
    const cap =
      this.area === 'OUTSIDE' ? df?.outsideCapacityRemaining : df?.insideCapacityRemaining;
    if (cap == null || !Number.isFinite(cap)) return 20;
    return Math.max(1, Math.min(20, Number(cap)));
  }

  capacityHint(): string {
    const max = this.maxPartySize();
    const df = this.dateFlags();
    const cap =
      this.area === 'OUTSIDE' ? df?.outsideCapacityRemaining : df?.insideCapacityRemaining;
    if (cap == null || !Number.isFinite(cap)) return '';
    const sector = this.area === 'OUTSIDE' ? 'afuera' : 'adentro';
    return `Máximo ${max} persona${max === 1 ? '' : 's'} ${sector}`;
  }

  insideCapacityLabel(): string {
    const cap = this.dateFlags()?.insideCapacityRemaining;
    if (cap == null || !Number.isFinite(cap)) return '';
    return `${cap}`;
  }

  outsideCapacityLabel(): string {
    const cap = this.dateFlags()?.outsideCapacityRemaining;
    if (cap == null || !Number.isFinite(cap)) return '';
    return `${cap}`;
  }

  private clampPartySize(): void {
    const max = this.maxPartySize();
    if (this.partySize > max) this.partySize = max;
  }

  toggleTime(slot: string): void {
    this.reservationTime = this.reservationTime === slot ? '' : slot;
  }

  normalizeIg(): void {
    this.instagram = this.instagram.replace(/^@+/, '').trim();
  }

  isoPlus(days: number): string {
    const [y, m, d] = this.minDate.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }

  isOffset(days: number): boolean {
    return this.businessDate === this.isoPlus(days);
  }

  setOffset(days: number): void {
    if (this.isClosedOffset(days)) return;
    this.businessDate = this.isoPlus(days);
    this.refreshDateFlags();
  }

  get minAsDate(): Date {
    return this.isoToLocalDate(this.minDate);
  }

  get selectedAsDate(): Date {
    return this.isoToLocalDate(this.businessDate || this.minDate);
  }

  pickOtherDay(): void {
    (this.closedDayPicker() ?? this.otherPicker())?.open();
  }

  onDatePicked(value: Date | null): void {
    if (!value || Number.isNaN(value.getTime())) return;
    if (!this.dateFilter(value)) return;
    this.businessDate = this.localDateToIso(value);
    this.refreshDateFlags();
  }

  dateChipLabel(short: boolean): string {
    if (this.isOffset(0) || this.isOffset(1)) return short ? 'Otro' : 'Otro día';
    const [y, m, d] = this.businessDate.split('-');
    return d && m ? `${d}/${m}` : short ? 'Otro' : 'Otro día';
  }

  submit(): void {
    this.formError.set(null);
    const name = this.guestName.trim();
    const email = this.guestEmail.trim();
    if (name.length < 2) {
      this.formError.set('Ingresá tu nombre.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.formError.set('Ingresá un mail válido.');
      return;
    }
    if (!this.businessDate) {
      this.formError.set('Elegí el día.');
      return;
    }
    if (this.isIsoClosed(this.businessDate)) {
      this.formError.set('El local no abre ese día (franco).');
      return;
    }
    if (!this.dateSignupOpen()) {
      this.formError.set('No tomamos reservas web para este día.');
      return;
    }
    if (this.area === 'INSIDE' && !this.insideAllowedForParty()) {
      this.formError.set(this.partyAreaHint() || 'El sector adentro no está disponible.');
      return;
    }
    if (this.area === 'OUTSIDE' && !this.outsideEnabled()) {
      this.formError.set('El sector afuera no está disponible.');
      return;
    }
    if (this.partySize > this.maxPartySize()) {
      this.formError.set(`Solo quedan ${this.maxPartySize()} lugares en ese sector.`);
      return;
    }
    this.busy.set(true);
    this.api
      .createPublicReservationRequest(this.slug(), {
        guestName: name,
        guestEmail: email,
        instagramHandle: this.instagram.replace(/^@+/, '').trim() || null,
        partySize: this.partySize,
        businessDate: this.businessDate,
        reservationTime: this.reservationTime || null,
        area: this.area,
        guestComment: this.guestComment.trim() || null,
        website: this.website,
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.sent.set(true);
          this.sentConfirmed.set(
            !!res?.autoAccepted || String(res?.status ?? '').toUpperCase() === 'ACCEPTED',
          );
          this.sentName.set(name.split(' ')[0] || name);
          this.sentEmail.set(email);
          this.sentPeople.set(
            this.partySize === 1 ? '1 persona' : `${this.partySize} personas`,
          );
          this.sentWhen.set(this.formatWhen(this.businessDate, this.reservationTime));
        },
        error: (err: HttpErrorResponse) => {
          this.busy.set(false);
          const msg =
            (err.error?.message as string | string[] | undefined) ??
            'No se pudo enviar. Probá de nuevo.';
          this.formError.set(Array.isArray(msg) ? msg[0] : String(msg));
        },
      });
  }

  reset(): void {
    this.sent.set(false);
    this.sentConfirmed.set(false);
    this.guestName = '';
    this.guestEmail = '';
    this.instagram = '';
    this.partySize = 2;
    this.reservationTime = '';
    this.syncArea(this.insideEnabled(), this.outsideEnabled());
    this.guestComment = '';
    this.businessDate = this.todayIso();
  }

  private syncArea(inside: boolean, outside: boolean): void {
    const insideOk = inside && !partyMustSitOutside(this.partySize, this.info());
    if (this.area === 'INSIDE' && !insideOk && outside) this.area = 'OUTSIDE';
    else if (this.area === 'OUTSIDE' && !outside && insideOk) this.area = 'INSIDE';
    else if (!insideOk && outside) this.area = 'OUTSIDE';
    else if (insideOk) this.area = 'INSIDE';
  }

  private slug(): string {
    return String(this.route.snapshot.paramMap.get('slug') ?? '').trim().toLowerCase();
  }

  private isoToLocalDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
  }

  private localDateToIso(value: Date): string {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private todayIso(): string {
    return resolveShopCalendarDate(new Date(), {
      timezone: this.info()?.shop.timezone,
    });
  }

  formatWhen(iso: string, time?: string): string {
    const label = formatIsoDateWithWeekday(iso) || iso;
    return time ? `${label} a las ${time}` : label;
  }
}
