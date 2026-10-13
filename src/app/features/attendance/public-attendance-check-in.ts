import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MAT_DATE_FORMATS, MAT_NATIVE_DATE_FORMATS } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { environment } from '../../../environments/environment';
import { resolveShopLogoSrc } from '../../core/utils/drive-url';
import { PublicPagePwaService } from '../../core/pwa/public-page-pwa.service';
import { PublicPageInstallBannerComponent } from '../../shared/components/public-page-install-banner';
import { onAccentColor } from '../customer-orders/ordering-ui.util';

/** Formato 24h (18:00 / 00:00) para no confundir medianoche con “12 a. m.”. */
const FICHAR_DATE_FORMATS = {
  ...MAT_NATIVE_DATE_FORMATS,
  parse: {
    ...MAT_NATIVE_DATE_FORMATS.parse,
    timeInput: null,
  },
  display: {
    ...MAT_NATIVE_DATE_FORMATS.display,
    timeInput: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const },
    timeOptionLabel: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const },
  },
};

type PublicShop = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  accentSecondary?: string | null;
};

type ShiftOption = {
  id: string;
  name: string;
  opensAt?: string;
  closesAt?: string;
  checkInAt?: string;
  checkOutAt?: string;
};

type CheckInMark = {
  shiftId?: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
};

type CheckInResult = {
  ok: true;
  alreadyMarked?: boolean;
  needsTimes?: boolean;
  withHours?: boolean;
  displayName?: string;
  date?: string;
  defaultShiftId?: string;
  shiftId?: string;
  shifts?: ShiftOption[];
  checkInAt?: string | null;
  checkOutAt?: string | null;
  marks?: CheckInMark[];
};

type Phase = 'pin' | 'times' | 'ok' | 'already';

const WEEKDAY_LABELS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

const MONTH_LABELS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fecha de negocio YYYY-MM-DD → “lunes 12 de octubre”. */
function formatBusinessDateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return '';
  const weekday = WEEKDAY_LABELS[dt.getDay()] ?? '';
  const month = MONTH_LABELS[mo - 1] ?? '';
  return `${weekday} ${d} de ${month}`;
}

function formatHhMmRange(checkIn?: string | null, checkOut?: string | null): string {
  const a = String(checkIn ?? '').trim();
  const b = String(checkOut ?? '').trim();
  if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(a) && /^([01]\d|2[0-3]):([0-5]\d)$/.test(b)) {
    return `${a} – ${b}`;
  }
  return '';
}

function formatCheckInHours(res: CheckInResult): string {
  const fromMarks = (Array.isArray(res.marks) ? res.marks : [])
    .map((m) => formatHhMmRange(m.checkInAt, m.checkOutAt))
    .filter(Boolean);
  if (fromMarks.length) {
    return [...new Set(fromMarks)].join(' · ');
  }
  return formatHhMmRange(res.checkInAt, res.checkOutAt);
}

function hhMmToDate(hhmm: string): Date | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm ?? '').trim());
  if (!m) return null;
  const d = new Date();
  d.setSeconds(0, 0);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

function dateToHhMm(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return '';
  return `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
}

function normalizeHex(raw: string | null | undefined, fallback: string): string {
  const v = String(raw ?? '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v) || /^#[0-9A-Fa-f]{3}$/.test(v)) return v;
  return fallback;
}

@Component({
  selector: 'app-public-attendance-check-in',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatTimepickerModule,
    PublicPageInstallBannerComponent,
  ],
  providers: [{ provide: MAT_DATE_FORMATS, useValue: FICHAR_DATE_FORMATS }],
  host: {
    '[style.--accent]': 'accent()',
    '[style.--accent-2]': 'accentSecondary()',
    '[style.--on-accent]': 'onAccent()',
  },
  template: `
    @if (fatalError(); as err) {
      <div class="kiosk kiosk--error">
        <p>{{ err }}</p>
        <button
          type="button"
          class="kiosk__btn"
          [style.background]="accent()"
          [style.color]="onAccent()"
          (click)="reload()"
        >
          Reintentar
        </button>
      </div>
    } @else {
      <div class="kiosk">
        <app-public-page-install-banner kind="attendanceCheckIn" [accent]="accent()" />

        <header class="kiosk__hero">
          @if (logoUrl()) {
            <img class="kiosk__logo" [src]="logoUrl()!" [alt]="shopName()" />
          } @else {
            <div class="kiosk__mark" aria-hidden="true">{{ brandInitial() }}</div>
          }
          <p class="kiosk__eyebrow">Fichar</p>
          <h1 class="kiosk__brand">{{ shopName() || slug() || 'Local' }}</h1>
          @if (phase() === 'pin') {
            <p class="kiosk__lead">Ingresá tu código</p>
          } @else if (phase() === 'times') {
            <p class="kiosk__lead">
              @if (withHours()) {
                Turno, ingreso y salida
              } @else {
                Elegí el turno
              }
            </p>
            @if (dateLabel(); as when) {
              <p class="kiosk__date">{{ when }}</p>
            }
          }
        </header>

        @if (phase() === 'pin') {
          @if (formError(); as ferr) {
            <p class="kiosk__err" role="alert">{{ ferr }}</p>
          }
          <section class="kiosk__sheet" aria-label="Código">
            <div class="kiosk__dots" aria-hidden="true">
              @for (filled of pinDots(); track $index) {
                <span class="kiosk__dot" [class.kiosk__dot--on]="filled"></span>
              }
            </div>
            <div class="kiosk__pad">
              @for (key of padKeys; track $index) {
                @if (key === '') {
                  <span class="kiosk__pad-spacer"></span>
                } @else {
                  <button
                    type="button"
                    class="kiosk__pad-key"
                    [class.kiosk__pad-key--action]="key === '⌫'"
                    (click)="onPadKey(key)"
                    [disabled]="busy()"
                  >
                    {{ key }}
                  </button>
                }
              }
            </div>
            <button
              type="button"
              class="kiosk__btn"
              [style.background]="accent()"
              [style.color]="onAccent()"
              (click)="submitPin()"
              [disabled]="busy() || !canSubmitPin()"
            >
              {{ busy() ? 'Continuando…' : 'Continuar' }}
            </button>
          </section>
        } @else if (phase() === 'times') {
          @if (formError(); as ferr) {
            <p class="kiosk__err" role="alert">{{ ferr }}</p>
          }
          <form class="kiosk__sheet" (ngSubmit)="submitTimes()">
            @if (shifts().length) {
              <div class="kiosk__shifts" role="group" aria-label="Turno">
                <p class="kiosk__label">Turno</p>
                <div class="kiosk__shift-list">
                  @for (s of shifts(); track s.id) {
                    <button
                      type="button"
                      class="kiosk__shift"
                      [class.kiosk__shift--on]="s.id === selectedShiftId()"
                      (click)="selectShift(s.id)"
                      [disabled]="busy()"
                    >
                      <span class="kiosk__shift-name">{{ s.name }}</span>
                      @if (s.opensAt && s.closesAt) {
                        <span class="kiosk__shift-hours">{{ s.opensAt }} – {{ s.closesAt }}</span>
                      }
                    </button>
                  }
                </div>
              </div>
            }

            @if (withHours()) {
              <mat-form-field appearance="outline" class="kiosk__field" subscriptSizing="dynamic">
                <mat-label>Hora de ingreso</mat-label>
                <input
                  matInput
                  [matTimepicker]="inPicker"
                  name="checkInAt"
                  [ngModel]="checkInDate()"
                  (ngModelChange)="checkInDate.set($event)"
                  [disabled]="busy()"
                />
                <mat-timepicker-toggle matIconSuffix [for]="inPicker" [disabled]="busy()" />
                <mat-timepicker #inPicker interval="1m" />
              </mat-form-field>

              <mat-form-field appearance="outline" class="kiosk__field" subscriptSizing="dynamic">
                <mat-label>Hora de salida</mat-label>
                <input
                  matInput
                  [matTimepicker]="outPicker"
                  name="checkOutAt"
                  [ngModel]="checkOutDate()"
                  (ngModelChange)="checkOutDate.set($event)"
                  [disabled]="busy()"
                />
                <mat-timepicker-toggle matIconSuffix [for]="outPicker" [disabled]="busy()" />
                <mat-timepicker #outPicker interval="1m" />
              </mat-form-field>
            }

            <button
              type="submit"
              class="kiosk__btn"
              [style.background]="accent()"
              [style.color]="onAccent()"
              [disabled]="busy() || !canSubmitTimes()"
            >
              {{ busy() ? 'Guardando…' : 'Guardar' }}
            </button>
            <button
              type="button"
              class="kiosk__btn kiosk__btn--ghost"
              [style.color]="accent()"
              [style.borderColor]="accent()"
              (click)="backToPin()"
              [disabled]="busy()"
            >
              Volver
            </button>
          </form>
        } @else {
          <div class="kiosk__done" role="status">
            <p class="kiosk__done-title">
              {{ phase() === 'already' ? 'Ya registrado' : 'Listo' }}
            </p>
            @if (flashHours(); as hours) {
              <p class="kiosk__done-meta">{{ hours }}</p>
            }
            @if (dateLabel(); as when) {
              <p class="kiosk__done-meta kiosk__done-meta--muted">{{ when }}</p>
            }
            <button
              type="button"
              class="kiosk__btn kiosk__btn--ghost kiosk__done-back"
              [style.color]="accent()"
              [style.borderColor]="accent()"
              (click)="backToPin()"
            >
              Volver
            </button>
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      --accent: #1d65a0;
      --accent-2: #1d65a0;
      display: block;
      min-height: 100dvh;
      font-family: Figtree, system-ui, sans-serif;
      color: #142018;
      /* Fondo neutro a pantalla completa: el acento en lavados se ve violeta. */
      background: #f4f5f4;
    }

    .kiosk {
      box-sizing: border-box;
      width: 100%;
      max-width: min(26rem, 100%);
      margin: 0 auto;
      min-height: 100dvh;
      padding: calc(0.85rem + var(--guy-safe-top, 0px)) 1.15rem
        calc(1.35rem + var(--guy-safe-bottom, 0px));
      display: flex;
      flex-direction: column;
      gap: 1rem;
      background: transparent;
    }

    .kiosk--error {
      justify-content: center;
      text-align: center;
      gap: 1.25rem;
    }

    .kiosk__hero {
      position: relative;
      text-align: center;
      padding: 1.25rem 0 0.25rem;
    }

    .kiosk__logo,
    .kiosk__mark {
      position: relative;
      width: 5.25rem;
      height: 5.25rem;
      margin: 0 auto 0.85rem;
      display: grid;
      place-items: center;
      border-radius: 1.25rem;
      background: #fff;
      border: 1px solid #e2e6e2;
      box-shadow: 0 8px 20px rgba(20, 32, 24, 0.08);
    }

    .kiosk__logo {
      object-fit: contain;
      padding: 0.35rem;
    }

    .kiosk__mark {
      font-size: 1.85rem;
      font-weight: 800;
      color: var(--accent);
      letter-spacing: -0.02em;
    }

    .kiosk__eyebrow {
      position: relative;
      margin: 0;
      font-size: 0.72rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent-2);
      font-weight: 800;
    }

    .kiosk__brand {
      position: relative;
      margin: 0.3rem 0 0;
      font-size: clamp(1.85rem, 7vw, 2.35rem);
      line-height: 1.1;
      font-weight: 800;
      letter-spacing: -0.03em;
    }

    .kiosk__lead {
      position: relative;
      margin: 0.55rem 0 0;
      color: #5a686f;
      font-size: 0.98rem;
      line-height: 1.35;
    }

    .kiosk__date {
      position: relative;
      margin: 0.4rem 0 0;
      font-size: 1.05rem;
      font-weight: 750;
      color: var(--accent-2);
      text-transform: capitalize;
    }

    .kiosk__err {
      margin: 0;
      padding: 0.7rem 0.9rem;
      border-radius: 0.9rem;
      background: #fdecea;
      color: #b71c1c;
      font-size: 0.9rem;
      font-weight: 650;
      text-align: center;
    }

    .kiosk__sheet {
      display: flex;
      flex-direction: column;
      gap: 0.95rem;
      margin-top: 0.15rem;
      padding: 1.15rem 1.05rem 1.2rem;
      border-radius: 1.35rem;
      background: #fff;
      border: 1px solid #e2e6e2;
      box-shadow: 0 12px 28px rgba(20, 32, 24, 0.07);
    }

    .kiosk__dots {
      display: flex;
      justify-content: center;
      gap: 0.65rem;
      padding: 0.35rem 0 0.15rem;
    }

    .kiosk__dot {
      width: 0.85rem;
      height: 0.85rem;
      border-radius: 999px;
      border: 2px solid color-mix(in srgb, var(--accent) 35%, #c5cdc6);
      background: transparent;
      transition:
        background 0.15s ease,
        border-color 0.15s ease,
        transform 0.15s ease;
    }

    .kiosk__dot--on {
      background: var(--accent);
      border-color: var(--accent);
      transform: scale(1.08);
    }

    .kiosk__pad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.55rem;
    }

    .kiosk__pad-spacer {
      min-height: 3.4rem;
    }

    .kiosk__pad-key {
      appearance: none;
      border: 1px solid #e0e5e1;
      border-radius: 1rem;
      min-height: 3.4rem;
      font-family: inherit;
      font-size: 1.35rem;
      font-weight: 750;
      color: #142018;
      background: #f7f8f7;
      cursor: pointer;
      touch-action: manipulation;
      transition:
        transform 0.12s ease,
        background 0.12s ease;
    }

    .kiosk__pad-key:active:not(:disabled) {
      transform: scale(0.96);
      background: #eef1ee;
    }

    .kiosk__pad-key--action {
      font-size: 1.15rem;
      color: var(--accent-2);
    }

    .kiosk__pad-key:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .kiosk__label {
      margin: 0;
      font-size: 0.82rem;
      font-weight: 750;
      color: #5a686f;
      letter-spacing: 0.02em;
    }

    .kiosk__shifts {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .kiosk__shift-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .kiosk__shift {
      appearance: none;
      width: 100%;
      text-align: left;
      border: 1.5px solid color-mix(in srgb, var(--accent) 22%, #d5dcd2);
      border-radius: 1rem;
      padding: 0.9rem 1rem;
      background: #fff;
      color: #142018;
      font-family: inherit;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      touch-action: manipulation;
    }

    .kiosk__shift-name {
      font-size: 1.05rem;
      font-weight: 800;
    }

    .kiosk__shift-hours {
      font-size: 0.85rem;
      color: #5a686f;
      font-variant-numeric: tabular-nums;
    }

    .kiosk__shift--on {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 10%, #fff);
      box-shadow: inset 0 0 0 1px var(--accent);
    }

    .kiosk__shift--on .kiosk__shift-name {
      color: var(--accent);
    }

    .kiosk__shift:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .kiosk__btn {
      appearance: none;
      border: none;
      border-radius: 1rem;
      padding: 1rem 1.15rem;
      min-height: 3.15rem;
      font-size: 1.05rem;
      font-weight: 800;
      font-family: inherit;
      background: var(--accent);
      color: var(--on-accent, #fff);
      cursor: pointer;
      width: 100%;
      touch-action: manipulation;
      transition: transform 0.12s ease, filter 0.12s ease, opacity 0.12s ease;
    }

    .kiosk__btn:active:not(:disabled) {
      transform: scale(0.98);
      filter: brightness(0.96);
    }

    .kiosk__btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .kiosk__btn--ghost {
      background: transparent !important;
      border: 1.5px solid color-mix(in srgb, var(--accent) 40%, #d5dcd2);
      color: var(--accent);
    }

    .kiosk__field {
      width: 100%;
    }

    :host ::ng-deep .kiosk__field .mdc-text-field--outlined:not(.mdc-text-field--disabled)
      .mdc-notched-outline__leading,
    :host ::ng-deep .kiosk__field .mdc-text-field--outlined:not(.mdc-text-field--disabled)
      .mdc-notched-outline__notch,
    :host ::ng-deep .kiosk__field .mdc-text-field--outlined:not(.mdc-text-field--disabled)
      .mdc-notched-outline__trailing {
      border-color: color-mix(in srgb, var(--accent) 28%, #d5dcd2) !important;
    }

    :host ::ng-deep .kiosk__field .mdc-text-field--focused:not(.mdc-text-field--disabled)
      .mdc-notched-outline__leading,
    :host ::ng-deep .kiosk__field .mdc-text-field--focused:not(.mdc-text-field--disabled)
      .mdc-notched-outline__notch,
    :host ::ng-deep .kiosk__field .mdc-text-field--focused:not(.mdc-text-field--disabled)
      .mdc-notched-outline__trailing {
      border-color: var(--accent) !important;
    }

    :host ::ng-deep .kiosk__field .mdc-floating-label--float-above {
      color: var(--accent) !important;
    }

    :host ::ng-deep .kiosk__field .mat-mdc-form-field-icon-suffix {
      color: var(--accent);
    }

    .kiosk__done {
      margin-top: 0.5rem;
      text-align: center;
      padding: 2.25rem 1.15rem;
      border-radius: 1.35rem;
      background: #fff;
      border: 1px solid #e2e6e2;
      box-shadow: 0 12px 28px rgba(20, 32, 24, 0.07);
    }

    .kiosk__done-title {
      margin: 0;
      font-size: 1.9rem;
      font-weight: 800;
      color: var(--accent);
      letter-spacing: -0.02em;
    }

    .kiosk__done-meta {
      margin: 0.55rem 0 0;
      font-size: 1.15rem;
      font-weight: 700;
      color: #243028;
      letter-spacing: -0.01em;
    }

    .kiosk__done-meta--muted {
      margin-top: 0.35rem;
      font-size: 1rem;
      font-weight: 600;
      color: #5a686f;
    }

    .kiosk__done-back {
      margin-top: 1.25rem;
    }
  `,
})
export class PublicAttendanceCheckInComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly pwa = inject(PublicPagePwaService);

  readonly padKeys = PAD_KEYS;

  readonly slug = signal('');
  readonly shop = signal<PublicShop | null>(null);
  readonly pin = signal('');
  readonly checkInDate = signal<Date | null>(null);
  readonly checkOutDate = signal<Date | null>(null);
  readonly businessDate = signal('');
  readonly shifts = signal<ShiftOption[]>([]);
  readonly selectedShiftId = signal('');
  readonly withHours = signal(true);
  readonly busy = signal(false);
  readonly fatalError = signal('');
  readonly formError = signal('');
  readonly phase = signal<Phase>('pin');
  /** Horas ya fichadas / recién guardadas (sin nombre). */
  readonly flashHours = signal('');

  /** PIN validado, solo en memoria para el paso de horas. */
  private pendingPin = '';

  readonly shopName = computed(() => this.shop()?.name ?? '');
  readonly accent = computed(() => normalizeHex(this.shop()?.accentColor, '#1D65A0'));
  readonly accentSecondary = computed(() =>
    normalizeHex(this.shop()?.accentSecondary, this.accent()),
  );
  /** Blanco u oscuro según luminancia del acento del local. */
  readonly onAccent = computed(() => onAccentColor(this.accent()));
  readonly dateLabel = computed(() => formatBusinessDateLabel(this.businessDate()));
  readonly logoUrl = computed(() => {
    const s = this.shop();
    if (!s?.logoUrl) return null;
    return resolveShopLogoSrc(s.logoUrl, s.id);
  });
  readonly brandInitial = computed(() => {
    const name = this.shopName().trim();
    return name ? name.charAt(0).toUpperCase() : 'F';
  });
  readonly pinDots = computed(() => {
    const len = this.pin().length;
    return Array.from({ length: 4 }, (_, i) => i < len);
  });

  ngOnInit(): void {
    const slug = String(this.route.snapshot.paramMap.get('slug') ?? '')
      .trim()
      .toLowerCase();
    this.slug.set(slug);
    this.pwa.prime('attendanceCheckIn', slug);
    this.reload();
  }

  ngOnDestroy(): void {
    this.pendingPin = '';
    this.pwa.release('attendanceCheckIn', this.slug());
  }

  canSubmitPin(): boolean {
    return /^\d{4}$/.test(this.pin().trim());
  }

  canSubmitTimes(): boolean {
    if (!this.selectedShiftId()) return false;
    if (!this.withHours()) return true;
    return !!dateToHhMm(this.checkInDate()) && !!dateToHhMm(this.checkOutDate());
  }

  onPadKey(key: string): void {
    if (this.busy()) return;
    this.formError.set('');
    if (key === '⌫') {
      this.pin.set(this.pin().slice(0, -1));
      return;
    }
    if (!/^\d$/.test(key) || this.pin().length >= 4) return;
    this.pin.set(this.pin() + key);
  }

  selectShift(id: string): void {
    if (this.busy() || id === this.selectedShiftId()) return;
    this.selectedShiftId.set(id);
    const shift = this.shifts().find((s) => s.id === id);
    if (!shift || !this.withHours()) return;
    this.checkInDate.set(hhMmToDate(String(shift.checkInAt ?? '')));
    this.checkOutDate.set(hhMmToDate(String(shift.checkOutAt ?? '')));
  }

  backToPin(): void {
    this.pendingPin = '';
    this.pin.set('');
    this.flashHours.set('');
    this.checkInDate.set(null);
    this.checkOutDate.set(null);
    this.businessDate.set('');
    this.shifts.set([]);
    this.selectedShiftId.set('');
    this.withHours.set(true);
    this.formError.set('');
    this.phase.set('pin');
  }

  reload(): void {
    const slug = this.slug();
    if (!slug) {
      this.fatalError.set('Local no encontrado');
      return;
    }
    this.fatalError.set('');
    this.formError.set('');
    this.phase.set('pin');
    this.flashHours.set('');
    this.pin.set('');
    this.checkInDate.set(null);
    this.checkOutDate.set(null);
    this.businessDate.set('');
    this.shifts.set([]);
    this.selectedShiftId.set('');
    this.withHours.set(true);
    this.pendingPin = '';
    this.http
      .get<{ shop: PublicShop }>(
        `${environment.apiUrl}/public/shops/${encodeURIComponent(slug)}/attendance/check-in`,
      )
      .subscribe({
        next: (res) => {
          this.shop.set(res.shop);
          this.pwa.apply({
            kind: 'attendanceCheckIn',
            slug: res.shop.slug,
            shopName: res.shop.name,
            accentColor: res.shop.accentColor,
            logoUrl: res.shop.logoUrl,
          });
        },
        error: (err: HttpErrorResponse) => {
          this.shop.set(null);
          this.fatalError.set(
            err.status === 404
              ? 'Fichaje no disponible en este local'
              : 'No se pudo cargar el local',
          );
        },
      });
  }

  submitPin(): void {
    if (this.busy() || !this.canSubmitPin()) return;
    const slug = this.slug();
    const pin = this.pin().trim();
    this.busy.set(true);
    this.formError.set('');
    this.http
      .post<CheckInResult>(
        `${environment.apiUrl}/public/shops/${encodeURIComponent(slug)}/attendance/check-in`,
        { pin },
      )
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.handleResult(res, pin);
        },
        error: (err: HttpErrorResponse) => {
          this.busy.set(false);
          this.pin.set('');
          this.pendingPin = '';
          this.formError.set(this.errorMessage(err));
        },
      });
  }

  submitTimes(): void {
    if (this.busy() || !this.canSubmitTimes() || !this.pendingPin) return;
    const slug = this.slug();
    const body: Record<string, string> = {
      pin: this.pendingPin,
      shiftId: this.selectedShiftId(),
    };
    if (this.withHours()) {
      body['checkInAt'] = dateToHhMm(this.checkInDate());
      body['checkOutAt'] = dateToHhMm(this.checkOutDate());
    }
    this.busy.set(true);
    this.formError.set('');
    this.http
      .post<CheckInResult>(
        `${environment.apiUrl}/public/shops/${encodeURIComponent(slug)}/attendance/check-in`,
        body,
      )
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.handleResult(res, this.pendingPin);
        },
        error: (err: HttpErrorResponse) => {
          this.busy.set(false);
          this.formError.set(this.errorMessage(err));
        },
      });
  }

  private handleResult(res: CheckInResult, pin: string): void {
    if (res.date) this.businessDate.set(String(res.date).slice(0, 10));
    if (res.alreadyMarked) {
      this.flashHours.set(formatCheckInHours(res));
      this.pin.set('');
      this.pendingPin = '';
      this.phase.set('already');
      return;
    }
    if (res.needsTimes) {
      this.flashHours.set('');
      this.pendingPin = pin;
      this.pin.set('');
      const list = Array.isArray(res.shifts) ? res.shifts : [];
      this.shifts.set(list);
      this.withHours.set(res.withHours !== false);
      const pick =
        String(res.shiftId ?? '').trim() ||
        String(res.defaultShiftId ?? '').trim() ||
        list[0]?.id ||
        '';
      this.selectedShiftId.set(pick);
      const selected = list.find((s) => s.id === pick);
      if (this.withHours()) {
        this.checkInDate.set(
          hhMmToDate(String(selected?.checkInAt ?? res.checkInAt ?? '')),
        );
        this.checkOutDate.set(
          hhMmToDate(String(selected?.checkOutAt ?? res.checkOutAt ?? '')),
        );
      } else {
        this.checkInDate.set(null);
        this.checkOutDate.set(null);
      }
      this.phase.set('times');
      return;
    }
    this.flashHours.set(formatCheckInHours(res));
    this.pin.set('');
    this.pendingPin = '';
    this.checkInDate.set(null);
    this.checkOutDate.set(null);
    this.shifts.set([]);
    this.selectedShiftId.set('');
    this.phase.set('ok');
  }

  private errorMessage(err: HttpErrorResponse): string {
    return (
      (typeof err.error?.message === 'string' && err.error.message) ||
      (Array.isArray(err.error?.message) && err.error.message[0]) ||
      (err.status === 401
        ? 'PIN incorrecto'
        : err.status === 400
          ? 'No disponible'
          : 'No se pudo registrar')
    );
  }
}
