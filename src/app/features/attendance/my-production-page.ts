import { Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { LoadingStateComponent } from '../../shared/components/loading-state';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { environment } from '../../../environments/environment';
import { usePageRefresh } from '../../core/page-refresh.service';
import { forkJoin, firstValueFrom } from 'rxjs';
import { shareText } from '../../shared/utils/share-text';
import { productionHoursSharePayload } from '../../shared/utils/attendance-share';

type ViewMode = 'day' | 'week' | 'month';
type ScopeMode = 'self' | 'team';

interface MyProdRangeResponse {
  shopId: string;
  from: string;
  to: string;
  defaultHours: number;
  employee: { employeeId: string; fullName: string };
  days: Record<string, { id?: string; hours: number; isPresent: boolean }>;
  totalHours: number;
}

interface TeamResponse {
  supervisor: { employeeId: string; fullName: string };
  team: Array<{ employeeId: string; fullName: string }>;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string): Date {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0=dom
  const diff = day === 0 ? -6 : 1 - day; // lunes
  x.setDate(x.getDate() + diff);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Reparte `total` en `n` días (2 decimales); la suma coincide con el total. */
function distributeHours(total: number, n: number): number[] {
  if (n <= 0) return [];
  const safe = Math.max(0, Number.isFinite(total) ? total : 0);
  const cents = Math.round(safe * 100);
  const base = Math.floor(cents / n);
  let rem = cents - base * n;
  return Array.from({ length: n }, () => {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem -= 1;
    return (base + extra) / 100;
  });
}

@Component({
  selector: 'app-my-production-page',
  imports: [
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    PageHeaderComponent,
    LoadingStateComponent,
  ],
  template: `
    <app-page-header
      title="Mis horas de producción"
      [subtitle]="subtitle()"
    />

    @if (team().length) {
      <div class="panel-card mb-3 my-prod-scope">
        <mat-button-toggle-group
          [value]="scope()"
          (change)="onScope($event.value)"
          aria-label="Alcance"
        >
          <mat-button-toggle value="self">Mis horas</mat-button-toggle>
          <mat-button-toggle value="team">Mi equipo</mat-button-toggle>
        </mat-button-toggle-group>
        @if (scope() === 'team') {
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="my-prod-scope__select">
            <mat-label>Productor</mat-label>
            <mat-select
              [ngModel]="selectedTeamId()"
              (ngModelChange)="onTeamMember($event)"
            >
              @for (m of team(); track m.employeeId) {
                <mat-option [value]="m.employeeId">{{ m.fullName }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      </div>
    }

    <div class="panel-card mb-3 my-prod-toolbar">
      <mat-button-toggle-group
        [value]="mode()"
        (change)="onMode($event.value)"
        aria-label="Vista"
      >
        <mat-button-toggle value="day">Día</mat-button-toggle>
        <mat-button-toggle value="week">Semana</mat-button-toggle>
        <mat-button-toggle value="month">Mes</mat-button-toggle>
      </mat-button-toggle-group>

      <div class="my-prod-toolbar__nav">
        <button mat-icon-button type="button" aria-label="Anterior" (click)="shift(-1)">
          <mat-icon>chevron_left</mat-icon>
        </button>
        <strong class="my-prod-toolbar__label">{{ rangeLabel() }}</strong>
        <button mat-icon-button type="button" aria-label="Siguiente" (click)="shift(1)">
          <mat-icon>chevron_right</mat-icon>
        </button>
        <button mat-stroked-button type="button" (click)="goToday()">Hoy</button>
        <button
          mat-stroked-button
          type="button"
          [disabled]="sharing() || loading()"
          (click)="shareCurrent()"
        >
          <mat-icon>share</mat-icon>
          Compartir
        </button>
      </div>
    </div>

    @if (loading()) {
      <app-loading-state
        [loading]="true"
        title="Cargando…"
        message="Obteniendo tus horas"
      />
    } @else if (error()) {
      <div class="panel-card guy-empty">
        <mat-icon>link_off</mat-icon>
        <div>
          <strong>No se pudieron cargar las horas</strong>
          <div class="small">{{ error() }}</div>
        </div>
      </div>
    } @else {
      <div class="panel-card mb-3 my-prod-summary">
        <div>
          <span class="my-prod-summary__label">Total del período</span>
          <strong class="my-prod-summary__value">{{ totalHours() | number: '1.0-2' }} h</strong>
        </div>
        <div>
          <span class="my-prod-summary__label">Default del local</span>
          <strong>{{ defaultHours() }} h</strong>
        </div>
        @if (mode() !== 'day') {
          <div class="my-prod-summary__distribute">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="my-prod-summary__total-input">
              <mat-label>{{ mode() === 'week' ? 'Total semanal' : 'Total mensual' }}</mat-label>
              <input
                matInput
                type="number"
                inputmode="decimal"
                min="0"
                step="0.5"
                [ngModel]="distributeTotal()"
                (ngModelChange)="onDistributeTotalChange($event)"
                [disabled]="saving()"
              />
            </mat-form-field>
            <button
              mat-stroked-button
              type="button"
              [disabled]="saving() || !canDistribute()"
              (click)="applyDistribute()"
            >
              <mat-icon>call_split</mat-icon>
              Repartir en los días
            </button>
          </div>
        }
      </div>

      <div class="my-prod-days">
        @for (day of dayList(); track day.iso) {
          <article class="panel-card my-prod-day" [class.my-prod-day--today]="day.iso === todayIso">
            <div class="my-prod-day__meta">
              <strong>{{ day.weekday }}</strong>
              <span>{{ day.label }}</span>
            </div>
            <div class="my-prod-day__actions">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="my-prod-day__hours">
                <mat-label>Horas</mat-label>
                <input
                  matInput
                  type="number"
                  inputmode="decimal"
                  min="0"
                  step="0.5"
                  [ngModel]="draftHours()[day.iso] ?? null"
                  (ngModelChange)="setDraft(day.iso, $event)"
                  [disabled]="saving()"
                />
              </mat-form-field>
              <button
                mat-stroked-button
                type="button"
                [disabled]="saving()"
                (click)="applyDefault(day.iso)"
              >
                {{ defaultHours() }} h
              </button>
              <button
                mat-button
                type="button"
                [disabled]="saving()"
                (click)="clearDay(day.iso)"
              >
                Limpiar
              </button>
            </div>
          </article>
        }
      </div>

      <div class="my-prod-footer">
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="saving() || !dirty()"
          (click)="save()"
        >
          <mat-icon>save</mat-icon>
          Guardar cambios
        </button>
      </div>
    }
  `,
  styles: [
    `
      .my-prod-scope {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
      }
      .my-prod-scope__select {
        min-width: 14rem;
        flex: 1;
      }
      .my-prod-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
      }
      .my-prod-toolbar__nav {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.35rem;
      }
      .my-prod-toolbar__label {
        min-width: 9rem;
        text-align: center;
        color: var(--guy-navy, #003366);
        text-transform: capitalize;
      }
      .my-prod-summary {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: 1.25rem 2rem;
        padding: 0.9rem 1rem;
      }
      .my-prod-summary__label {
        display: block;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--guy-muted, #5f6f76);
      }
      .my-prod-summary__value {
        font-size: 1.35rem;
        color: var(--guy-navy, #003366);
      }
      .my-prod-summary__distribute {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
        margin-left: auto;
      }
      .my-prod-summary__total-input {
        width: 9.5rem;
      }
      .my-prod-days {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }
      .my-prod-day {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
      }
      .my-prod-day--today {
        border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 45%, var(--guy-border, #d7e0d9));
      }
      .my-prod-day__meta {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 7rem;
      }
      .my-prod-day__meta strong {
        color: var(--guy-navy, #003366);
      }
      .my-prod-day__meta span {
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
      }
      .my-prod-day__actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.45rem;
      }
      .my-prod-day__hours {
        width: 7.5rem;
      }
      .my-prod-footer {
        position: sticky;
        bottom: 0.75rem;
        display: flex;
        justify-content: flex-end;
        margin-top: 1rem;
        padding-top: 0.5rem;
      }
    `,
  ],
})
export class MyProductionPage {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  readonly shops = inject(ShopContextService);

  readonly mode = signal<ViewMode>('week');
  readonly scope = signal<ScopeMode>('self');
  readonly team = signal<Array<{ employeeId: string; fullName: string }>>([]);
  readonly selectedTeamId = signal<string | null>(null);
  readonly anchor = signal(new Date());
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly sharing = signal(false);
  readonly error = signal<string | null>(null);
  readonly data = signal<MyProdRangeResponse | null>(null);
  /** Borrador editable: iso → horas o null (vacío). */
  readonly draftHours = signal<Record<string, number | null>>({});
  readonly baseline = signal<Record<string, number | null>>({});
  /** Total a repartir en semana/mes (input del productor). */
  readonly distributeTotal = signal<number | null>(null);

  readonly todayIso = isoDate(new Date());

  readonly shopId = this.shops.selectedShopId;

  readonly subtitle = computed(() => {
    const name = this.data()?.employee?.fullName;
    const shop = this.shops.selectedShop()?.name ?? 'Local';
    if (this.scope() === 'team' && name) return `${shop} · Equipo · ${name}`;
    return name ? `${shop} · ${name}` : shop;
  });

  readonly defaultHours = computed(() => this.data()?.defaultHours ?? 8);
  readonly totalHours = computed(() => {
    let sum = 0;
    for (const v of Object.values(this.draftHours())) {
      const n = Number(v ?? 0);
      if (Number.isFinite(n)) sum += n;
    }
    return sum;
  });

  readonly range = computed(() => {
    const a = this.anchor();
    const mode = this.mode();
    if (mode === 'day') {
      const iso = isoDate(a);
      return { from: iso, to: iso };
    }
    if (mode === 'week') {
      const start = startOfWeek(a);
      return { from: isoDate(start), to: isoDate(addDays(start, 6)) };
    }
    const y = a.getFullYear();
    const m = a.getMonth() + 1;
    const last = daysInMonth(y, m);
    return {
      from: `${y}-${String(m).padStart(2, '0')}-01`,
      to: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    };
  });

  readonly rangeLabel = computed(() => {
    const { from, to } = this.range();
    if (this.mode() === 'day') {
      return parseIso(from).toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    }
    if (this.mode() === 'week') {
      const a = parseIso(from).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
      const b = parseIso(to).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
      return `${a} – ${b}`;
    }
    return parseIso(from).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  });

  readonly dayList = computed(() => {
    const { from, to } = this.range();
    const out: Array<{ iso: string; weekday: string; label: string }> = [];
    let cur = parseIso(from);
    const end = parseIso(to);
    while (cur <= end) {
      const iso = isoDate(cur);
      out.push({
        iso,
        weekday: cur.toLocaleDateString('es-AR', { weekday: 'short' }),
        label: cur.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }),
      });
      cur = addDays(cur, 1);
    }
    return out;
  });

  readonly dirty = computed(() => {
    const draft = this.draftHours();
    const base = this.baseline();
    const keys = new Set([...Object.keys(draft), ...Object.keys(base)]);
    for (const k of keys) {
      const a = draft[k] ?? null;
      const b = base[k] ?? null;
      if (a !== b) return true;
    }
    return false;
  });

  readonly canDistribute = computed(() => {
    const n = Number(this.distributeTotal());
    return Number.isFinite(n) && n >= 0 && this.dayList().length > 0;
  });

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shopId();
      if (!shopId) {
        this.team.set([]);
        return;
      }
      this.http
        .get<TeamResponse>(`${environment.apiUrl}/shops/${shopId}/production-attendance/me/team`)
        .subscribe({
          next: (res) => {
            this.team.set(res.team ?? []);
            if (!(res.team ?? []).length && this.scope() === 'team') {
              this.scope.set('self');
              this.selectedTeamId.set(null);
            } else if ((res.team ?? []).length && !this.selectedTeamId()) {
              this.selectedTeamId.set(res.team[0].employeeId);
            }
          },
          error: () => this.team.set([]),
        });
    });
    effect(() => {
      this.shopId();
      this.range();
      this.scope();
      this.selectedTeamId();
      this.reload();
    });
  }

  onMode(value: ViewMode): void {
    if (!value) return;
    this.mode.set(value);
  }

  onScope(value: ScopeMode): void {
    if (!value) return;
    this.scope.set(value);
    if (value === 'team' && !this.selectedTeamId() && this.team().length) {
      this.selectedTeamId.set(this.team()[0].employeeId);
    }
  }

  onTeamMember(employeeId: string): void {
    this.selectedTeamId.set(employeeId || null);
  }

  goToday(): void {
    this.anchor.set(new Date());
  }

  async shareCurrent(): Promise<void> {
    const shopId = this.shopId();
    if (!shopId) return;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    const { from, to } = this.range();
    const params = { from, to };
    this.sharing.set(true);
    try {
      const self$ = this.http.get<MyProdRangeResponse>(
        `${environment.apiUrl}/shops/${shopId}/production-attendance/me`,
        { params },
      );
      const teamReqs = this.team().map((m) =>
        this.http.get<MyProdRangeResponse>(
          `${environment.apiUrl}/shops/${shopId}/production-attendance/me/team/${m.employeeId}`,
          { params },
        ),
      );
      const rows = await firstValueFrom(forkJoin([self$, ...teamReqs]));
      const people = rows.map((res, i) => {
        const hoursByDate: Record<string, number> = {};
        const isCurrentView =
          (this.scope() !== 'team' && i === 0) ||
          (this.scope() === 'team' && res.employee.employeeId === this.selectedTeamId());
        for (const day of this.dayList()) {
          const draft = isCurrentView ? this.draftHours()[day.iso] : null;
          const saved = Number(res.days?.[day.iso]?.hours ?? 0) || 0;
          hoursByDate[day.iso] =
            draft != null && Number.isFinite(Number(draft)) ? Number(draft) : saved;
        }
        return { name: res.employee.fullName, hoursByDate };
      });
      const payload = productionHoursSharePayload({
        shopName,
        fromIso: from,
        toIso: to,
        people,
      });
      const result = await shareText(payload);
      if (result === 'copied') {
        this.snack.open('Horas copiadas al portapapeles', 'OK', { duration: 2200 });
      } else if (result === 'failed') {
        this.snack.open('No se pudo compartir', 'OK', { duration: 3000 });
      }
    } finally {
      this.sharing.set(false);
    }
  }

  shift(dir: -1 | 1): void {
    const a = new Date(this.anchor());
    const mode = this.mode();
    if (mode === 'day') a.setDate(a.getDate() + dir);
    else if (mode === 'week') a.setDate(a.getDate() + dir * 7);
    else a.setMonth(a.getMonth() + dir);
    this.anchor.set(a);
  }

  setDraft(iso: string, value: number | string | null): void {
    const num =
      value === null || value === '' || value === undefined
        ? null
        : Number(value);
    this.draftHours.update((prev) => ({
      ...prev,
      [iso]: num != null && Number.isFinite(num) ? num : null,
    }));
  }

  applyDefault(iso: string): void {
    this.setDraft(iso, this.defaultHours());
  }

  clearDay(iso: string): void {
    this.setDraft(iso, null);
  }

  onDistributeTotalChange(value: number | string | null): void {
    if (value === null || value === '' || value === undefined) {
      this.distributeTotal.set(null);
      return;
    }
    const n = Number(value);
    this.distributeTotal.set(Number.isFinite(n) ? n : null);
  }

  applyDistribute(): void {
    const total = Number(this.distributeTotal());
    const days = this.dayList();
    if (!Number.isFinite(total) || total < 0 || !days.length) return;
    const parts = distributeHours(total, days.length);
    const next: Record<string, number | null> = { ...this.draftHours() };
    days.forEach((day, i) => {
      const h = parts[i] ?? 0;
      next[day.iso] = h > 0 ? h : null;
    });
    this.draftHours.set(next);
    const period = this.mode() === 'week' ? 'la semana' : 'el mes';
    this.snack.open(`Total de ${total} h repartido en ${days.length} días de ${period}`, 'OK', {
      duration: 2800,
    });
  }

  reload(): void {
    const shopId = this.shopId();
    if (!shopId) {
      this.loading.set(false);
      this.error.set('Seleccioná un local.');
      return;
    }
    const { from, to } = this.range();
    const teamId = this.selectedTeamId();
    if (this.scope() === 'team' && !teamId) {
      this.loading.set(false);
      this.error.set('Seleccioná un productor del equipo.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const url =
      this.scope() === 'team' && teamId
        ? `${environment.apiUrl}/shops/${shopId}/production-attendance/me/team/${teamId}`
        : `${environment.apiUrl}/shops/${shopId}/production-attendance/me`;
    this.http
      .get<MyProdRangeResponse>(url, {
        params: { from, to },
      })
      .subscribe({
        next: (res) => {
          this.data.set(res);
          const draft: Record<string, number | null> = {};
          let cur = parseIso(from);
          const end = parseIso(to);
          while (cur <= end) {
            const iso = isoDate(cur);
            const hours = res.days?.[iso]?.hours;
            draft[iso] = hours && hours > 0 ? hours : null;
            cur = addDays(cur, 1);
          }
          this.draftHours.set(draft);
          this.baseline.set({ ...draft });
          this.distributeTotal.set(
            Object.values(draft).reduce<number>((sum, v) => sum + (Number(v) || 0), 0) || null,
          );
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.data.set(null);
          const msg = err?.error?.message ?? 'No se pudieron cargar tus horas';
          this.error.set(Array.isArray(msg) ? msg.join(', ') : String(msg));
        },
      });
  }

  save(): void {
    const shopId = this.shopId();
    if (!shopId || this.saving()) return;
    const teamId = this.selectedTeamId();
    if (this.scope() === 'team' && !teamId) return;
    const draft = this.draftHours();
    const base = this.baseline();
    const items: Array<{ date: string; hours: number }> = [];
    const keys = new Set([...Object.keys(draft), ...Object.keys(base)]);
    for (const date of keys) {
      const next = draft[date] ?? null;
      const prev = base[date] ?? null;
      if (next === prev) continue;
      items.push({ date, hours: next == null ? 0 : Math.max(0, Number(next) || 0) });
    }
    if (!items.length) return;
    this.saving.set(true);
    const url =
      this.scope() === 'team' && teamId
        ? `${environment.apiUrl}/shops/${shopId}/production-attendance/me/team/${teamId}/bulk`
        : `${environment.apiUrl}/shops/${shopId}/production-attendance/me/bulk`;
    this.http
      .post(url, { items })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('Horas guardadas', 'OK', { duration: 2500 });
          this.reload();
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudieron guardar las horas';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }
}
