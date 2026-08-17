import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { normalizeLogoUrl, resolveShopLogoSrc } from '../../core/utils/drive-url';

type PublicShop = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  accentColor?: string | null;
};

type PublicEmployee = {
  id: string;
  fullName: string;
  producesFood?: boolean;
};

type PublicDay = {
  isPresent: boolean;
  isHoliday: boolean;
  overtimeHours: number;
  hours: number | null;
};

type PublicMonth = {
  shop: PublicShop;
  employee: PublicEmployee;
  year: number;
  month: number;
  daysInMonth: number;
  closedWeekdays: number[];
  days: Record<string, PublicDay>;
  totals: {
    present: number;
    holiday: number;
    overtimeHours: number;
    productionHours: number | null;
  };
};

const MONTH_LABELS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function storageKey(slug: string): string {
  return `crc.publicAttendance.${slug}`;
}

@Component({
  selector: 'app-public-attendance-board',
  imports: [FormsModule],
  template: `
    @if (error()) {
      <div class="board board--error" [style.--accent]="accent()">
        <p>{{ error() }}</p>
        <button type="button" class="board__btn" (click)="reloadList()">Reintentar</button>
      </div>
    } @else if (shop(); as s) {
      <div class="board" [style.--accent]="accent()">
        <header class="board__hero">
          <div class="board__glow" aria-hidden="true"></div>
          <div class="board__identity">
            @if (logoUrl()) {
              <img class="board__logo" [src]="logoUrl()!" [alt]="s.name" />
            }
            <div>
              <p class="board__eyebrow">Presentismo</p>
              <h1 class="board__brand">{{ s.name }}</h1>
            </div>
          </div>
        </header>

        @if (!employeeId()) {
          <section class="board__pick" aria-label="Elegí tu nombre">
            <h2>¿Quién sos?</h2>
            @if (employees().length > 8) {
              <input
                class="board__search"
                type="search"
                placeholder="Buscar nombre"
                [ngModel]="query()"
                (ngModelChange)="query.set($event)"
              />
            }
            <ul>
              @for (e of filteredEmployees(); track e.id) {
                <li>
                  <button type="button" (click)="selectEmployee(e)">{{ e.fullName }}</button>
                </li>
              } @empty {
                <li class="board__empty">No hay personal cargado</li>
              }
            </ul>
          </section>
        } @else {
          <section class="board__month">
            <div class="board__who">
              <button type="button" class="board__back" (click)="clearEmployee()">Cambiar</button>
              <h2>{{ month()?.employee?.fullName || selectedName() }}</h2>
            </div>
            <div class="board__nav">
              <button type="button" (click)="shiftMonth(-1)" aria-label="Mes anterior">‹</button>
              <strong>{{ MONTH_LABELS[viewMonth() - 1] }} {{ viewYear() }}</strong>
              <button type="button" (click)="shiftMonth(1)" aria-label="Mes siguiente">›</button>
            </div>

            @if (loadingMonth()) {
              <p class="board__muted">Cargando mes…</p>
            } @else if (monthError()) {
              <p class="board__muted">{{ monthError() }}</p>
              <button type="button" class="board__btn" (click)="loadMonth()">Reintentar</button>
            } @else if (month(); as m) {
              <div class="cal" role="grid" aria-label="Calendario del mes">
                @for (w of WEEKDAYS; track w) {
                  <span class="cal__wd">{{ w }}</span>
                }
                @for (cell of calendar(); track $index) {
                  @if (cell.day == null) {
                    <span class="cal__empty"></span>
                  } @else {
                    <span
                      class="cal__day"
                      [class.cal__day--present]="cell.kind === 'present'"
                      [class.cal__day--holiday]="cell.kind === 'holiday'"
                      [class.cal__day--absent]="cell.kind === 'absent'"
                      [class.cal__day--closed]="cell.kind === 'closed'"
                      [attr.title]="cell.title"
                    >
                      <span class="cal__num">{{ cell.day }}</span>
                      @if (cell.extra) {
                        <span class="cal__extra">+{{ cell.extra }}</span>
                      }
                      @if (cell.hours != null) {
                        <span class="cal__hrs">{{ cell.hours }}h</span>
                      }
                    </span>
                  }
                }
              </div>

              <ul class="board__legend">
                <li><i class="dot dot--present"></i> Presente</li>
                <li><i class="dot dot--absent"></i> Ausente</li>
                <li><i class="dot dot--holiday"></i> Feriado</li>
                <li><i class="dot dot--closed"></i> Franco</li>
              </ul>

              <div class="board__totals">
                <div>
                  <strong>{{ m.totals.present }}</strong>
                  <span>días</span>
                </div>
                <div>
                  <strong>{{ m.totals.holiday }}</strong>
                  <span>feriados</span>
                </div>
                @if (m.totals.overtimeHours > 0) {
                  <div>
                    <strong>{{ fmtNum(m.totals.overtimeHours) }}</strong>
                    <span>hs extra</span>
                  </div>
                }
                @if (m.totals.productionHours != null) {
                  <div>
                    <strong>{{ fmtNum(m.totals.productionHours) }}</strong>
                    <span>hs prod.</span>
                  </div>
                }
              </div>
            }
          </section>
        }
      </div>
    } @else {
      <div class="board board--loading">
        <p>Cargando presentismo…</p>
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
        --accent: #2e7d32;
        min-height: 100dvh;
        padding: calc(1.15rem + env(safe-area-inset-top, 0px)) 1.1rem
          calc(1.5rem + env(safe-area-inset-bottom, 0px));
        color: #f4efe6;
        box-sizing: border-box;
        background:
          radial-gradient(
            ellipse 80% 50% at 50% -10%,
            color-mix(in srgb, var(--accent) 35%, transparent),
            transparent 70%
          ),
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
        padding: 0.5rem 0.5rem 1.1rem;
        max-width: 36rem;
        margin: 0 auto;
      }
      .board__glow {
        position: absolute;
        inset: -1rem 10% auto;
        height: 6rem;
        background: radial-gradient(circle, color-mix(in srgb, var(--accent) 40%, transparent), transparent 70%);
        pointer-events: none;
      }
      .board__identity {
        position: relative;
        display: grid;
        justify-items: center;
        gap: 0.65rem;
      }
      .board__logo {
        width: 4.5rem;
        height: 4.5rem;
        object-fit: contain;
        border-radius: 1rem;
        background: #fff;
        padding: 0.25rem;
      }
      .board__eyebrow {
        margin: 0;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        font-size: 0.72rem;
        color: color-mix(in srgb, var(--accent) 70%, #f4efe6);
        font-weight: 700;
      }
      .board__brand {
        margin: 0.15rem 0 0;
        font-size: 1.45rem;
      }
      .board__pick,
      .board__month {
        max-width: 36rem;
        margin: 0 auto;
      }
      .board__pick h2,
      .board__who h2 {
        margin: 0 0 0.75rem;
        font-size: 1.15rem;
      }
      .board__search {
        width: 100%;
        margin-bottom: 0.75rem;
        border: 1px solid #3a332c;
        background: #1c1815;
        color: #f4efe6;
        border-radius: 12px;
        padding: 0.7rem 0.9rem;
        font: inherit;
      }
      .board__pick ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.45rem;
      }
      .board__pick button,
      .board__btn,
      .board__back,
      .board__nav button {
        border: 1px solid color-mix(in srgb, var(--accent) 45%, #3a332c);
        background: color-mix(in srgb, var(--accent) 18%, #1c1815);
        color: #f4efe6;
        border-radius: 12px;
        padding: 0.75rem 1rem;
        font: inherit;
        font-weight: 650;
        cursor: pointer;
        width: 100%;
        text-align: left;
      }
      .board__btn {
        width: auto;
        text-align: center;
      }
      .board__who {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        margin-bottom: 0.75rem;
      }
      .board__who h2 {
        margin: 0;
      }
      .board__back {
        width: auto;
        padding: 0.4rem 0.7rem;
        font-size: 0.82rem;
      }
      .board__nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.9rem;
      }
      .board__nav button {
        width: 2.6rem;
        text-align: center;
        padding: 0.45rem;
        font-size: 1.2rem;
      }
      .board__muted,
      .board__empty {
        color: #cfc6ba;
        text-align: center;
      }
      .cal {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 0.35rem;
      }
      .cal__wd {
        text-align: center;
        font-size: 0.72rem;
        font-weight: 700;
        color: #9d9488;
      }
      .cal__empty {
        min-height: 3.1rem;
      }
      .cal__day {
        min-height: 3.1rem;
        border-radius: 10px;
        display: grid;
        place-items: center;
        gap: 0.05rem;
        background: #241f1b;
        border: 1px solid #3a332c;
        font-size: 0.82rem;
      }
      .cal__num {
        font-weight: 700;
      }
      .cal__extra,
      .cal__hrs {
        font-size: 0.62rem;
        color: #f9d38a;
      }
      .cal__day--present {
        background: color-mix(in srgb, var(--accent) 38%, #1c1815);
        border-color: color-mix(in srgb, var(--accent) 70%, #3a332c);
      }
      .cal__day--holiday {
        background: color-mix(in srgb, #e65100 38%, #1c1815);
        border-color: #e65100;
      }
      .cal__day--absent {
        background: #2a2320;
      }
      .cal__day--closed {
        opacity: 0.4;
      }
      .board__legend {
        list-style: none;
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        padding: 0;
        margin: 1rem 0 0.75rem;
        font-size: 0.78rem;
        color: #cfc6ba;
      }
      .dot {
        display: inline-block;
        width: 0.65rem;
        height: 0.65rem;
        border-radius: 999px;
        margin-right: 0.3rem;
        vertical-align: middle;
      }
      .dot--present {
        background: var(--accent);
      }
      .dot--absent {
        background: #6b6258;
      }
      .dot--holiday {
        background: #e65100;
      }
      .dot--closed {
        background: #3a332c;
      }
      .board__totals {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
        gap: 0.55rem;
      }
      .board__totals div {
        background: #1c1815;
        border: 1px solid #3a332c;
        border-radius: 12px;
        padding: 0.7rem 0.55rem;
        text-align: center;
      }
      .board__totals strong {
        display: block;
        font-size: 1.25rem;
      }
      .board__totals span {
        font-size: 0.72rem;
        color: #9d9488;
      }
    `,
  ],
})
export class PublicAttendanceBoardComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  readonly MONTH_LABELS = MONTH_LABELS;
  readonly WEEKDAYS = WEEKDAYS;

  private slug = '';
  readonly shop = signal<PublicShop | null>(null);
  readonly employees = signal<PublicEmployee[]>([]);
  readonly employeeId = signal<string | null>(null);
  readonly month = signal<PublicMonth | null>(null);
  readonly error = signal('');
  readonly monthError = signal('');
  readonly query = signal('');
  readonly loadingMonth = signal(false);
  readonly viewYear = signal(new Date().getFullYear());
  readonly viewMonth = signal(new Date().getMonth() + 1);
  readonly selectedName = computed(() => {
    const id = this.employeeId();
    return this.employees().find((e) => e.id === id)?.fullName ?? '';
  });

  readonly accent = computed(() => this.shop()?.accentColor || '#2e7d32');
  readonly logoUrl = computed(() => {
    const raw = this.shop()?.logoUrl;
    const shopId = this.shop()?.id;
    return resolveShopLogoSrc(raw, shopId) || normalizeLogoUrl(raw) || raw?.trim() || null;
  });
  readonly filteredEmployees = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.employees();
    if (!q) return list;
    return list.filter((e) => e.fullName.toLowerCase().includes(q));
  });
  readonly calendar = computed(() => {
    const m = this.month();
    if (!m) return [];
    const first = new Date(m.year, m.month - 1, 1);
    const lead = (first.getDay() + 6) % 7;
    const cells: Array<{
      day: number | null;
      kind: 'present' | 'absent' | 'holiday' | 'closed' | '';
      title: string;
      extra: string;
      hours: number | null;
    }> = [];
    for (let i = 0; i < lead; i++) {
      cells.push({ day: null, kind: '', title: '', extra: '', hours: null });
    }
    const closed = m.closedWeekdays ?? [];
    for (let d = 1; d <= m.daysInMonth; d++) {
      const date = new Date(m.year, m.month - 1, d);
      const iso = isoDate(m.year, m.month, d);
      const cell = m.days[iso];
      const isClosed = closed.includes(date.getDay());
      let kind: 'present' | 'absent' | 'holiday' | 'closed' = 'absent';
      let title = 'Ausente';
      if (isClosed) {
        kind = 'closed';
        title = 'Franco del local';
      } else if (cell?.isHoliday && !cell.isPresent) {
        kind = 'holiday';
        title = 'Feriado';
      } else if (cell?.isPresent) {
        kind = 'present';
        title = 'Presente';
      }
      const extra = cell?.overtimeHours ? String(cell.overtimeHours) : '';
      cells.push({
        day: d,
        kind,
        title,
        extra,
        hours: cell?.hours ?? null,
      });
    }
    return cells;
  });

  ngOnInit(): void {
    this.slug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!this.slug) {
      this.error.set('Local no encontrado');
      return;
    }
    this.reloadList();
  }

  fmtNum(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  }

  reloadList(): void {
    this.error.set('');
    this.http
      .get<{ shop: PublicShop; employees: PublicEmployee[] }>(
        `${environment.apiUrl}/public/shops/${encodeURIComponent(this.slug)}/attendance`,
      )
      .subscribe({
        next: (res) => {
          this.shop.set(res.shop);
          this.employees.set(res.employees ?? []);
          let saved = '';
          try {
            saved = localStorage.getItem(storageKey(this.slug)) ?? '';
          } catch {
            saved = '';
          }
          const match = res.employees.find((e) => e.id === saved);
          if (match) this.selectEmployee(match);
        },
        error: () => this.error.set('Presentismo no disponible en este local'),
      });
  }

  selectEmployee(emp: PublicEmployee): void {
    this.employeeId.set(emp.id);
    try {
      localStorage.setItem(storageKey(this.slug), emp.id);
    } catch {
      // ignore
    }
    this.loadMonth();
  }

  clearEmployee(): void {
    this.employeeId.set(null);
    this.month.set(null);
    try {
      localStorage.removeItem(storageKey(this.slug));
    } catch {
      // ignore
    }
  }

  shiftMonth(delta: number): void {
    const d = new Date(this.viewYear(), this.viewMonth() - 1, 1);
    d.setMonth(d.getMonth() + delta);
    this.viewYear.set(d.getFullYear());
    this.viewMonth.set(d.getMonth() + 1);
    this.loadMonth();
  }

  loadMonth(): void {
    const employeeId = this.employeeId();
    if (!employeeId) return;
    this.loadingMonth.set(true);
    this.monthError.set('');
    this.http
      .get<PublicMonth>(
        `${environment.apiUrl}/public/shops/${encodeURIComponent(this.slug)}/attendance/${employeeId}`,
        { params: { year: String(this.viewYear()), month: String(this.viewMonth()) } },
      )
      .subscribe({
        next: (res) => {
          this.loadingMonth.set(false);
          this.shop.set(res.shop);
          this.month.set(res);
          this.viewYear.set(res.year);
          this.viewMonth.set(res.month);
        },
        error: () => {
          this.loadingMonth.set(false);
          this.monthError.set('No se pudo cargar el mes');
        },
      });
  }
}
