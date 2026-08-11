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
import { resolveShopCalendarDate } from '../../core/shop/business-date';
import { resolveShopLogoSrc } from '../../core/utils/drive-url';
import {
  PublicReservationSignup,
  ReservationsApiService,
} from './reservations-api.service';

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
      <div class="page" [class.page--logo-only]="!i.signupEnabled" [style.--accent]="accent()">
        <div class="glow" aria-hidden="true"></div>
        <header class="hero">
          @if (logoUrl()) {
            @if (!i.signupEnabled && igUrl(); as url) {
              <a [href]="url" target="_blank" rel="noopener" [attr.aria-label]="'Instagram de ' + i.shop.name">
                <img class="logo" [src]="logoUrl()!" [alt]="i.shop.name" />
              </a>
            } @else {
              <img class="logo" [src]="logoUrl()!" [alt]="i.shop.name" />
            }
          } @else {
            <p class="brand">{{ i.shop.name }}</p>
          }
          @if (i.signupEnabled) {
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

        @if (i.signupEnabled) {
        @if (sent()) {
          <section class="card done" role="status">
            <div class="done__mark" aria-hidden="true">✓</div>
            <h2>¡Listo, {{ sentName() }}!</h2>
            <p>
              Pedido para <strong>{{ sentPeople() }}</strong> el
              <strong>{{ sentWhen() }}</strong>.
            </p>
            <p class="done__mail">Te avisamos a <strong>{{ sentEmail() }}</strong> cuando el local confirme.</p>
            <button type="button" class="ghost" (click)="reset()">Hacer otra reserva</button>
          </section>
        } @else {
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
                  <button type="button" class="pill" [class.pill--on]="isOffset(0)" (click)="setOffset(0)">
                    Hoy
                  </button>
                  <button type="button" class="pill" [class.pill--on]="isOffset(1)" (click)="setOffset(1)">
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
                  <button type="button" class="stepper__btn" (click)="bump(1)" [disabled]="partySize >= 20">
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
                <button type="button" class="stepper__btn" (click)="bump(1)" [disabled]="partySize >= 20">
                  +
                </button>
              </div>
            </div>

            @if (insideEnabled() && outsideEnabled()) {
              <div class="block">
                <span class="lbl">Sector preferido</span>
                <div class="pills pills--area">
                  <button
                    type="button"
                    class="pill"
                    [class.pill--on]="area === 'INSIDE'"
                    (click)="area = 'INSIDE'"
                  >
                    Adentro
                  </button>
                  <button
                    type="button"
                    class="pill"
                    [class.pill--on]="area === 'OUTSIDE'"
                    (click)="area = 'OUTSIDE'"
                  >
                    Afuera
                  </button>
                </div>
              </div>
            } @else if (onlyAreaLabel(); as only) {
              <p class="area-note">
                La reserva es <strong>{{ only.open }}</strong>.
                El sector {{ only.full }} está lleno.
              </p>
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

            <button type="submit" class="submit" [disabled]="busy()">
              {{ busy() ? 'Enviando…' : 'Pedir reserva' }}
            </button>
            <p class="hint">Sin pago. Queda pendiente hasta que el local la acepte.</p>
          </form>
        }
        }
      </div>
    } @else {
      <div class="page page--loading"><p>Cargando…</p></div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        min-height: 100dvh;
        background: #0e0c0b;
        color-scheme: dark;
        font-family:
          'Segoe UI',
          system-ui,
          -apple-system,
          sans-serif;
      }

      .page {
        --accent: #3dba6e;
        --ink: #f7f1e8;
        position: relative;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100dvh;
        width: 100%;
        padding: calc(1.25rem + env(safe-area-inset-top, 0px)) 1.25rem
          calc(1.5rem + env(safe-area-inset-bottom, 0px));
        background:
          radial-gradient(ellipse 80% 45% at 50% -8%, color-mix(in srgb, var(--accent) 32%, transparent), transparent 70%),
          linear-gradient(165deg, #1a1512 0%, #0e0c0b 48%, #141210 100%);
        color: var(--ink);
        color-scheme: dark;
        overflow-x: hidden;
        overflow-y: auto;
      }

      .page--logo-only {
        justify-content: center;
        text-align: center;
      }

      .page--logo-only .hero {
        display: grid;
        justify-items: center;
        align-items: center;
        gap: 1.25rem;
        margin: 0;
        width: min(22rem, 100%);
        text-align: center;
      }

      .page--logo-only .logo {
        width: min(15rem, 68vw);
        height: min(15rem, 68vw);
        margin: 0 auto;
      }

      .page--logo-only .hero a {
        display: block;
        line-height: 0;
        margin: 0 auto;
      }

      .page--error,
      .page--loading {
        display: grid;
        place-items: center;
        text-align: center;
      }

      .glow {
        pointer-events: none;
        position: absolute;
        inset: 4% 18% auto;
        height: 7rem;
        background: radial-gradient(circle, color-mix(in srgb, var(--accent) 40%, transparent), transparent 70%);
        filter: blur(22px);
      }

      .hero {
        position: relative;
        width: min(34rem, 100%);
        margin: 0 0 1.1rem;
        text-align: center;
      }

      .logo {
        width: 6.6rem;
        height: 6.6rem;
        object-fit: contain;
        border-radius: 50%;
        margin: 0 auto 0.85rem;
        display: block;
        filter: drop-shadow(0 10px 24px rgba(0, 0, 0, 0.35));
      }

      .brand {
        margin: 0 0 0.4rem;
        font-weight: 700;
        color: color-mix(in srgb, var(--accent) 80%, #fff);
      }

      h1 {
        margin: 0 0 0.4rem;
        font-size: clamp(1.85rem, 4vw, 2.35rem);
        font-weight: 750;
        letter-spacing: -0.03em;
      }

      .lead {
        margin: 0 auto;
        max-width: 28rem;
        color: color-mix(in srgb, var(--ink) 86%, transparent);
        font-size: 1.08rem;
        line-height: 1.45;
      }

      .lead--policy {
        margin-top: 0.35rem;
        font-size: 1.02rem;
        font-weight: 650;
        color: #fff;
      }

      .walkin {
        margin: 0 auto;
        max-width: 16rem;
        color: #fff;
        font-size: clamp(1.35rem, 4.2vw, 1.7rem);
        font-weight: 750;
        line-height: 1.35;
        text-align: center;
        text-wrap: balance;
      }

      .shop-name {
        display: none;
      }

      .card {
        position: relative;
        width: min(34rem, 100%);
        margin: 0;
        padding: 1.25rem 1.2rem 1.3rem;
        border-radius: 1.35rem;
        background: rgba(22, 18, 16, 0.78);
        border: 1px solid color-mix(in srgb, #fff 10%, transparent);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
      }

      .form {
        display: grid;
        gap: 1.05rem;
        align-content: start;
        align-items: start;
      }

      .pair {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
      }

      .field,
      .block {
        display: grid;
        gap: 0.45rem;
        align-content: start;
      }

      .field > span,
      .lbl {
        font-size: 0.95rem;
        font-weight: 700;
        color: color-mix(in srgb, var(--ink) 90%, transparent);
      }

      em {
        font-style: normal;
        font-weight: 500;
        opacity: 0.55;
      }

      input[type='text'],
      input[type='email'] {
        appearance: none;
        -webkit-appearance: none;
        width: 100%;
        height: 3.15rem;
        min-height: 3.15rem;
        max-height: 3.15rem;
        border: 1px solid color-mix(in srgb, #fff 14%, transparent);
        border-radius: 0.9rem;
        background: rgba(8, 7, 6, 0.55);
        color: #fff;
        font: inherit;
        font-size: 1.12rem;
        line-height: 1.25;
        padding: 0 0.9rem;
        outline: none;
        box-sizing: border-box;
        color-scheme: dark;
        field-sizing: fixed;
      }

      input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent);
      }

      .ig {
        display: flex;
        align-items: center;
        height: 3.15rem;
        min-height: 3.15rem;
        max-height: 3.15rem;
        border: 1px solid color-mix(in srgb, #fff 14%, transparent);
        border-radius: 0.9rem;
        background: rgba(8, 7, 6, 0.55);
        box-sizing: border-box;
      }

      .ig:focus-within {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent);
      }

      .ig__prefix {
        flex: 0 0 auto;
        padding: 0 0.15rem 0 0.85rem;
        color: var(--accent);
        font-weight: 800;
        line-height: 1;
        pointer-events: none;
      }

      .ig input {
        flex: 1;
        min-width: 0;
        height: 100%;
        min-height: 0;
        max-height: none;
        border: 0;
        background: transparent;
        box-shadow: none;
        padding: 0 0.85rem 0 0.35rem;
        border-radius: 0.9rem;
      }

      .ig input:focus {
        box-shadow: none;
      }

      .split {
        display: block;
        position: relative;
      }

      .pills {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
      }

      .pills--times {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
      }

      .pills--area {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }

      .area-note {
        margin: 0;
        padding: 0.85rem 1rem;
        border-radius: 0.95rem;
        background: color-mix(in srgb, var(--accent) 18%, rgba(8, 7, 6, 0.55));
        border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
        color: #fff;
        font-size: 1.05rem;
        font-weight: 650;
        line-height: 1.4;
        text-align: center;
      }

      .area-note strong {
        font-weight: 800;
      }

      .pill {
        appearance: none;
        flex: 1;
        min-height: 2.85rem;
        padding: 0.4rem 0.75rem;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, #fff 14%, transparent);
        background: rgba(8, 7, 6, 0.45);
        color: var(--ink);
        font: inherit;
        font-size: 1rem;
        font-weight: 650;
        cursor: pointer;
        white-space: nowrap;
      }

      .pill--on {
        background: var(--accent);
        border-color: transparent;
        color: #102010;
      }

      .date-sr {
        position: absolute;
        width: 0;
        height: 0;
        opacity: 0;
        border: 0;
        padding: 0;
        pointer-events: none;
      }

      .only-mob {
        display: none;
      }

      .stepper {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.3rem;
        border-radius: 999px;
        background: rgba(8, 7, 6, 0.45);
        border: 1px solid color-mix(in srgb, #fff 12%, transparent);
      }

      .stepper--inline {
        display: none;
      }

      .stepper strong {
        font-size: 1.35rem;
        font-weight: 800;
        min-width: 2rem;
        text-align: center;
        color: #fff;
      }

      .stepper__btn {
        width: 2.7rem;
        height: 2.7rem;
        border: 0;
        border-radius: 999px;
        background: var(--accent);
        color: #102010;
        font-size: 1.4rem;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
      }

      .stepper__btn:disabled {
        opacity: 0.35;
        cursor: default;
      }

      .submit {
        min-height: 3.4rem;
        border: 0;
        border-radius: 999px;
        background: var(--accent);
        color: #102010;
        font: inherit;
        font-size: 1.18rem;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 12px 28px color-mix(in srgb, var(--accent) 35%, transparent);
      }

      .submit:disabled {
        opacity: 0.55;
        cursor: default;
      }

      .hint,
      .form-error {
        margin: 0;
        text-align: center;
        font-size: 0.95rem;
      }

      .hint {
        color: color-mix(in srgb, var(--ink) 70%, transparent);
      }

      .form-error {
        color: #ffb4b4;
      }

      .hp {
        position: absolute;
        left: -9999px;
        opacity: 0;
      }

      .done {
        text-align: center;
        display: grid;
        gap: 0.5rem;
      }

      .done__mark {
        width: 3.2rem;
        height: 3.2rem;
        margin: 0.2rem auto 0.2rem;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: var(--accent);
        color: #083018;
        font-size: 1.4rem;
        font-weight: 800;
      }

      .done h2,
      .closed h2 {
        margin: 0;
        font-size: 1.35rem;
        color: #fff;
        font-weight: 750;
      }

      .done p,
      .closed p {
        margin: 0;
        color: rgba(247, 241, 232, 0.88);
        line-height: 1.45;
      }

      .closed {
        text-align: center;
        display: grid;
        gap: 0.55rem;
        padding: 1.15rem 1rem 1.2rem;
      }

      .ig-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 2.7rem;
        margin: 0.35rem auto 0;
        padding: 0 1.1rem;
        border-radius: 999px;
        background: var(--accent);
        color: #102010;
        font-weight: 800;
        text-decoration: none;
      }

      .ghost {
        margin-top: 0.55rem;
        min-height: 3.1rem;
        padding: 0 1.2rem;
        border-radius: 999px;
        border: 2px solid color-mix(in srgb, #fff 62%, transparent);
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        font: inherit;
        font-size: 1.08rem;
        font-weight: 750;
        cursor: pointer;
      }

      @media (max-width: 720px) {
        .page {
          justify-content: center;
          align-items: center;
          gap: 0.85rem;
          padding: calc(0.85rem + env(safe-area-inset-top, 0px)) 1rem
            calc(1rem + env(safe-area-inset-bottom, 0px));
        }

        .page.page--logo-only {
          min-height: 100dvh;
          justify-content: center;
        }

        .page--logo-only .hero {
          display: grid;
          justify-items: center;
          gap: 1.15rem;
          margin: 0 auto;
          width: min(22rem, 100%);
          text-align: center;
        }

        .page--logo-only .walkin {
          font-size: 1.4rem;
          max-width: 14rem;
        }

        .page--logo-only .logo {
          width: min(13.5rem, 62vw);
          height: min(13.5rem, 62vw);
          margin: 0 auto;
        }

        .glow {
          display: none;
        }

        .hero {
          display: grid;
          justify-items: center;
          gap: 0;
          margin: 0 auto;
          width: min(34rem, 100%);
          text-align: center;
        }

        .logo {
          width: 4.4rem;
          height: 4.4rem;
          margin: 0 auto 0.55rem;
        }

        h1 {
          font-size: 1.55rem;
          margin: 0 0 0.3rem;
        }

        .lead {
          display: block;
          margin: 0 auto;
          max-width: 22rem;
          font-size: 1.02rem;
          line-height: 1.4;
          overflow: visible;
        }

        .lead--policy {
          margin-top: 0.3rem;
          font-size: 0.98rem;
        }

        .shop-name {
          display: none;
        }

        .card {
          width: min(34rem, 100%);
          padding: 1rem 0.95rem 1.05rem;
          border-radius: 1.2rem;
        }

        .form {
          gap: 0.85rem;
        }

        .pair {
          grid-template-columns: 1fr;
          gap: 0.85rem;
        }

        .field > span,
        .lbl {
          display: block;
          font-size: 0.92rem;
          line-height: 1.25;
        }

        .hint {
          display: block;
          font-size: 0.9rem;
        }

        .stepper--inline {
          display: none;
        }

        .block--people {
          display: grid;
        }

        input[type='text'],
        input[type='email'] {
          height: 3.2rem;
          min-height: 3.2rem;
          max-height: 3.2rem;
          border-radius: 0.9rem;
          font-size: 1.12rem;
          padding: 0 0.9rem;
        }

        .ig {
          height: 3.2rem;
          min-height: 3.2rem;
          max-height: 3.2rem;
          border-radius: 0.9rem;
        }

        .pill {
          min-height: 2.85rem;
          font-size: 0.95rem;
          padding: 0 0.55rem;
        }

        .only-desk {
          display: none;
        }

        .only-mob {
          display: inline;
        }

        .stepper__btn {
          width: 3rem;
          height: 3rem;
          font-size: 1.55rem;
        }

        .submit {
          min-height: 3.35rem;
          height: 3.35rem;
          margin-top: 0.2rem;
          font-size: 1.15rem;
        }
      }
    `,
  ],
})
export class PublicReservationSignupComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ReservationsApiService);
  private readonly title = inject(Title);

  readonly timeSlots = TIME_SLOTS;
  readonly info = signal<PublicReservationSignup | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly sent = signal(false);
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

  readonly insideEnabled = computed(() => this.info()?.insideEnabled !== false);
  readonly outsideEnabled = computed(() => this.info()?.outsideEnabled !== false);
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
    this.api.publicSignupInfo(slug).subscribe({
      next: (info) => {
        this.info.set(info);
        const today = this.todayIso();
        this.minDate = today;
        if (!this.businessDate || this.businessDate < today) {
          this.businessDate = today;
        }
        this.syncArea(info.insideEnabled !== false, info.outsideEnabled !== false);
        this.title.setTitle(`Reservar · ${info.shop.name}`);
        applyStatusBar('#0e0c0b', 'dark');
      },
      error: () => this.error.set('Este local no tiene reservas online por ahora.'),
    });
  }

  bump(delta: number): void {
    this.partySize = Math.min(20, Math.max(1, this.partySize + delta));
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
    this.businessDate = this.isoPlus(days);
  }

  get minAsDate(): Date {
    return this.isoToLocalDate(this.minDate);
  }

  get selectedAsDate(): Date {
    return this.isoToLocalDate(this.businessDate || this.minDate);
  }

  pickOtherDay(): void {
    this.otherPicker()?.open();
  }

  onDatePicked(value: Date | null): void {
    if (!value || Number.isNaN(value.getTime())) return;
    this.businessDate = this.localDateToIso(value);
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
    if (this.area === 'INSIDE' && !this.insideEnabled()) {
      this.formError.set('El sector adentro no está disponible.');
      return;
    }
    if (this.area === 'OUTSIDE' && !this.outsideEnabled()) {
      this.formError.set('El sector afuera no está disponible.');
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
        next: () => {
          this.busy.set(false);
          this.sent.set(true);
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
    if (this.area === 'INSIDE' && !inside && outside) this.area = 'OUTSIDE';
    else if (this.area === 'OUTSIDE' && !outside && inside) this.area = 'INSIDE';
    else if (!inside && outside) this.area = 'OUTSIDE';
    else if (inside) this.area = 'INSIDE';
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

  private formatWhen(iso: string, time?: string): string {
    const [y, m, d] = iso.split('-');
    const label = `${d}/${m}/${y}`;
    return time ? `${label} a las ${time}` : label;
  }
}
