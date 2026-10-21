import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { environment } from '../../../environments/environment';
import { ShopContextService } from '../../core/shop/shop-context.service';
import {
  resolveCurrentShift,
  shiftHoursLabel,
  shiftsOnIsoDate,
  type ShopShift,
} from '../../core/shop/shop-shifts';
import { zonedDateParts } from '../../core/shop/business-date';
import { onAccentColor } from '../customer-orders/ordering-ui.util';
import { apiErrorMessage } from '../../core/http/api-error-message';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { LoadingStateComponent } from '../../shared/components/loading-state';

type PunchPhase = 'checkIn' | 'checkOut';

type EmployeeKind = 'FIXED' | 'ROTATING';

type PendingRow = {
  employeeId: string;
  fullName: string;
  shiftId: string;
  shiftName: string;
  employeeType?: EmployeeKind | null;
  punchPhase: PunchPhase;
  checkInAt: string | null;
  checkOutAt: string | null;
  defaultCheckIn: string;
  defaultCheckOut: string;
};

function isRotating(row: PendingRow): boolean {
  return String(row.employeeType ?? '').toUpperCase() === 'ROTATING';
}

type PendingResponse = {
  date: string;
  withHours: boolean;
  shop: {
    id: string;
    name: string;
    accentColor?: string | null;
    accentSecondary?: string | null;
    logoUrl?: string | null;
  };
  employees: PendingRow[];
};

type PunchResult = {
  ok: true;
  status?: 'needsCheckIn' | 'needsCheckOut' | 'complete' | 'alreadyMarked';
  alreadyMarked?: boolean;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  date?: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function normalizeHhMm(raw: string | null | undefined): string {
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(String(raw ?? '').trim());
  return m ? `${m[1]}:${m[2]}` : '';
}

function nowHhMm(timezone?: string | null): string {
  const p = zonedDateParts(new Date(), timezone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

function formatHours(checkIn?: string | null, checkOut?: string | null): string {
  const a = String(checkIn ?? '').trim();
  const b = String(checkOut ?? '').trim();
  if (a && b) return `${a} – ${b}`;
  if (a) return `Entrada ${a}`;
  if (b) return `Salida ${b}`;
  return '';
}

function formatIsoDateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  if (!m) return String(iso ?? '').trim();
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function statusLabel(row: PendingRow, withHours: boolean, dateLabel = ''): string {
  if (!withHours) return 'Pendiente';
  if (row.punchPhase === 'checkOut') {
    if (!row.checkInAt) return 'Falta salida';
    const when = dateLabel ? `${row.checkInAt} · ${dateLabel}` : row.checkInAt;
    return `Falta salida (entrada ${when})`;
  }
  return 'Falta entrada';
}

function resolveAccent(
  fromApi: string | null | undefined,
  fromShop: string | null | undefined,
  fallback = '#2E7D32',
): string {
  const a = String(fromApi ?? '').trim();
  if (a) return a;
  const b = String(fromShop ?? '').trim();
  return b || fallback;
}

@Component({
  selector: 'app-admin-attendance-check-in',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    PageHeaderComponent,
    LoadingStateComponent,
  ],
  host: {
    '[style.--accent]': 'accent()',
    '[style.--on-accent]': 'onAccent()',
  },
  template: `
    <app-page-header
      title="Fichar"
      [subtitle]="shopName() || 'Asistencia'"
      actionLabel="Actualizar"
      actionIcon="refresh"
      [actionDisabled]="busy() || loading()"
      (action)="reload()"
    />

    @if (loading()) {
      <div class="panel-card">
        <app-loading-state
          [loading]="true"
          title="Cargando pendientes"
          message="Buscando quién falta fichar"
        />
      </div>
    } @else if (flash(); as f) {
      <div class="fichar-stage">
        <div class="panel-card fichar-card fichar-done" role="status">
          <mat-icon class="fichar-done__icon">check_circle</mat-icon>
          <p class="fichar-done__title">{{ f.title }}</p>
          @if (f.hours) {
            <p class="fichar-done__meta">{{ f.hours }}</p>
          }
          @if (f.date) {
            <p class="fichar-done__meta fichar-done__meta--muted">{{ f.date }}</p>
          }
          @if (f.name) {
            <p class="fichar-done__meta fichar-done__meta--muted">{{ f.name }}</p>
          }
          <button
            mat-flat-button
            color="primary"
            type="button"
            class="fichar-card__primary"
            (click)="clearFlash()"
          >
            Volver al listado
          </button>
        </div>
      </div>
    } @else if (selected(); as row) {
      <div class="fichar-stage">
        <section class="panel-card fichar-card fichar-sheet">
          <div class="fichar-sheet__hero">
            <span class="fichar-sheet__avatar" aria-hidden="true">{{ initials(row.fullName) }}</span>
            <div class="fichar-sheet__hero-text">
              <div class="fichar-sheet__who">
                <h2 class="fichar-sheet__name">{{ row.fullName }}</h2>
                <span class="fichar-sheet__kind">{{ isRotating(row) ? 'Rotativo' : 'Fijo' }}</span>
              </div>
              <p class="fichar-sheet__shift">
                {{ row.shiftName }}
                @if (shiftHoursFor(row.shiftId); as hours) {
                  <span class="fichar-sheet__shift-hours">{{ hours }}</span>
                }
              </p>
            </div>
          </div>

          <p class="fichar-sheet__phase">
            @if (!withHours()) {
              Marcar presente
            } @else if (row.punchPhase === 'checkOut') {
              Marcar salida
            } @else {
              Marcar entrada
            }
          </p>
          @if (businessDateLabel(); as when) {
            <p class="fichar-sheet__date">{{ when }}</p>
          }

          @if (error(); as err) {
            <p class="fichar-err" role="alert">{{ err }}</p>
          }

          @if (!withHours()) {
            <p class="fichar-hint">Se marca presente en este turno.</p>
          } @else if (row.punchPhase === 'checkOut') {
            <p class="fichar-hint">
              Entrada ya registrada:
              {{ row.checkInAt }}@if (businessDateLabel(); as when) {
                · {{ when }}
              }
            </p>
            <mat-form-field appearance="outline" class="fichar-field" subscriptSizing="dynamic">
              <mat-label>Hora de salida</mat-label>
              <input
                matInput
                type="time"
                step="60"
                name="checkOutAt"
                [ngModel]="punchTime()"
                (ngModelChange)="punchTime.set(normalizeHhMm($event))"
                [disabled]="busy()"
              />
            </mat-form-field>
          } @else {
            <mat-form-field appearance="outline" class="fichar-field" subscriptSizing="dynamic">
              <mat-label>Hora de ingreso</mat-label>
              <input
                matInput
                type="time"
                step="60"
                name="checkInAt"
                [ngModel]="punchTime()"
                (ngModelChange)="punchTime.set(normalizeHhMm($event))"
                [disabled]="busy()"
              />
            </mat-form-field>
          }

          <div class="fichar-sheet__actions">
            <button
              mat-stroked-button
              type="button"
              class="fichar-card__ghost"
              (click)="cancelSheet()"
              [disabled]="busy()"
            >
              Volver
            </button>
            <button
              mat-flat-button
              color="primary"
              type="button"
              class="fichar-card__primary"
              [disabled]="busy() || !canSave()"
              (click)="save()"
            >
              {{ busy() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </section>
      </div>
    } @else {
      <div class="panel-card fichar-panel">
        <div class="fichar-bar">
          <div class="fichar-bar__meta">
            <h2 class="fichar-bar__title">Pendientes</h2>
            @if (businessDate()) {
              <span class="fichar-bar__date">{{ businessDateLabel() }}</span>
            }
          </div>

          @if (showShiftSelect()) {
            <mat-form-field appearance="outline" class="fichar-bar__shift" subscriptSizing="dynamic">
              <mat-label>Turno</mat-label>
              <mat-select
                [ngModel]="selectedShiftId()"
                (ngModelChange)="onShiftChange($event)"
              >
                @for (shift of shopShifts(); track shift.id) {
                  <mat-option [value]="shift.id">
                    {{ shift.name }} · {{ shiftHoursLabel(shift) }}
                  </mat-option>
                }
              </mat-select>
            </mat-form-field>
          }

          <span class="fichar-bar__count">
            {{ filteredRows().length }}
            {{ filteredRows().length === 1 ? 'persona' : 'personas' }}
          </span>
        </div>

        @if (error(); as err) {
          <p class="fichar-err" role="alert">{{ err }}</p>
        }

        @if (!filteredRows().length) {
          <div class="fichar-empty">
            <mat-icon>check_circle</mat-icon>
            <p>
              @if (rows().length && showShiftSelect()) {
                Nadie pendiente en este turno.
              } @else {
                Nadie pendiente de fichar en este día.
              }
            </p>
          </div>
        } @else {
          <p class="fichar-lead">
            Tocá a la persona para marcar
            {{ withHours() ? 'entrada o salida' : 'presente' }}.
          </p>
          @if (fixedRows().length) {
            <section class="fichar-group" aria-label="Fijos">
              <h3 class="fichar-group__title">
                Fijos
                <span class="fichar-group__count">{{ fixedRows().length }}</span>
              </h3>
              <ul class="fichar-list">
                @for (row of fixedRows(); track row.employeeId + row.shiftId) {
                  <li>
                    <button type="button" class="fichar-row" (click)="pick(row)">
                      <span class="fichar-row__avatar" aria-hidden="true">
                        {{ initials(row.fullName) }}
                      </span>
                      <span class="fichar-row__main">
                        <span class="fichar-row__name">{{ row.fullName }}</span>
                        <span class="fichar-row__meta">{{
                          statusLabel(row, withHours(), businessDateLabel())
                        }}</span>
                      </span>
                      <mat-icon class="fichar-row__chevron" aria-hidden="true">chevron_right</mat-icon>
                    </button>
                  </li>
                }
              </ul>
            </section>
          }
          @if (rotatingRows().length) {
            <section class="fichar-group" aria-label="Rotativos">
              <h3 class="fichar-group__title">
                Rotativos
                <span class="fichar-group__count">{{ rotatingRows().length }}</span>
              </h3>
              <ul class="fichar-list">
                @for (row of rotatingRows(); track row.employeeId + row.shiftId) {
                  <li>
                    <button
                      type="button"
                      class="fichar-row fichar-row--rotating"
                      (click)="pick(row)"
                    >
                      <span class="fichar-row__avatar" aria-hidden="true">
                        {{ initials(row.fullName) }}
                      </span>
                      <span class="fichar-row__main">
                        <span class="fichar-row__name">{{ row.fullName }}</span>
                        <span class="fichar-row__meta">{{
                          statusLabel(row, withHours(), businessDateLabel())
                        }}</span>
                      </span>
                      <mat-icon class="fichar-row__chevron" aria-hidden="true">chevron_right</mat-icon>
                    </button>
                  </li>
                }
              </ul>
            </section>
          }
        }
      </div>
    }
  `,
  styles: `
    :host {
      --accent: var(--guy-green, #2e7d32);
      --on-accent: #fff;
      display: block;
      color: #142018;
      /* Botones nativos no heredan color; sin esto el nombre sale celeste del navegador. */
      button:not(.mat-mdc-button-base) {
        color: inherit;
      }
    }
    .fichar-panel {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .fichar-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.55rem 0.75rem;
    }
    .fichar-bar__meta {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      min-width: 0;
      margin-right: auto;
    }
    .fichar-bar__title {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--guy-navy, #003366);
      line-height: 1.2;
    }
    .fichar-bar__date {
      font-size: 0.84rem;
      font-weight: 600;
      color: var(--guy-navy, #003366);
      opacity: 0.8;
    }
    .fichar-bar__shift {
      width: min(100%, 16rem);
      margin: 0;
    }
    :host ::ng-deep .fichar-bar__shift .mat-mdc-text-field-wrapper {
      height: 40px;
    }
    :host ::ng-deep .fichar-bar__shift .mat-mdc-form-field-infix {
      min-height: 40px !important;
      padding-top: 8px !important;
      padding-bottom: 8px !important;
    }
    :host ::ng-deep .fichar-bar__shift .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }
    .fichar-bar__count {
      font-size: 0.85rem;
      font-weight: 650;
      color: #5a686f;
      white-space: nowrap;
    }
    .fichar-lead {
      margin: 0;
      color: #5a686f;
      font-size: 0.95rem;
    }
    .fichar-group {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }
    .fichar-group__title {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #5a686f;
    }
    .fichar-group__count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.35rem;
      height: 1.35rem;
      padding: 0 0.35rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 12%, #fff);
      color: var(--accent);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: none;
    }
    .fichar-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(16.5rem, 1fr));
      gap: 0.55rem;
    }
    .fichar-row {
      appearance: none;
      -webkit-appearance: none;
      width: 100%;
      text-align: left;
      border: 1px solid #e2e6e2;
      border-radius: 0.85rem;
      background: #fff;
      padding: 0.75rem 0.85rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.7rem;
      font: inherit;
      color: inherit;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .fichar-row:hover {
      border-color: color-mix(in srgb, var(--accent) 45%, #e2e6e2);
      background: color-mix(in srgb, var(--accent) 6%, #fff);
    }
    .fichar-row--rotating {
      border-style: dashed;
    }
    .fichar-stage {
      display: flex;
      justify-content: center;
      padding: 0.25rem 0 1rem;
    }
    .fichar-card {
      width: min(100%, 26rem);
      margin: 0;
    }
    .fichar-sheet__kind {
      display: inline-block;
      padding: 0.18rem 0.5rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 750;
      letter-spacing: 0.02em;
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 12%, #fff);
    }
    .fichar-row__avatar {
      width: 2.35rem;
      height: 2.35rem;
      border-radius: 999px;
      flex-shrink: 0;
      display: grid;
      place-items: center;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 14%, #fff);
    }
    .fichar-row__main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.12rem;
    }
    .fichar-row__name {
      font-weight: 750;
      color: var(--guy-navy, #142018);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .fichar-row__meta {
      font-size: 0.85rem;
      color: #5a686f;
    }
    .fichar-row__chevron {
      color: #9aa5ab;
      flex-shrink: 0;
    }
    .fichar-sheet {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1.35rem 1.35rem 1.25rem;
    }
    .fichar-sheet__hero {
      display: flex;
      align-items: center;
      gap: 0.9rem;
    }
    .fichar-sheet__avatar {
      width: 3.25rem;
      height: 3.25rem;
      border-radius: 999px;
      flex-shrink: 0;
      display: grid;
      place-items: center;
      font-size: 0.95rem;
      font-weight: 800;
      letter-spacing: 0.03em;
      color: var(--accent);
      background: color-mix(in srgb, var(--accent) 14%, #fff);
      border: 1px solid color-mix(in srgb, var(--accent) 22%, #e2e6e2);
    }
    .fichar-sheet__hero-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .fichar-sheet__who {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem 0.55rem;
    }
    .fichar-sheet__name {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 800;
      line-height: 1.15;
      color: var(--guy-navy, #003366);
    }
    .fichar-sheet__shift {
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.25rem 0.45rem;
      color: var(--accent);
      font-weight: 750;
      font-size: 0.95rem;
    }
    .fichar-sheet__shift-hours {
      font-weight: 600;
      color: #5a686f;
    }
    .fichar-sheet__phase {
      margin: 0;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #5a686f;
    }
    .fichar-sheet__date {
      margin: -0.55rem 0 0;
      font-size: 1.05rem;
      font-weight: 750;
      color: var(--guy-navy, #142018);
    }
    .fichar-field {
      width: 100%;
    }
    :host ::ng-deep .fichar-field .mat-mdc-form-field-infix {
      min-height: 3.1rem;
    }
    :host ::ng-deep .fichar-field input[type='time'] {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .fichar-sheet__actions {
      display: grid;
      grid-template-columns: 1fr 1.35fr;
      gap: 0.55rem;
      margin-top: 0.15rem;
    }
    .fichar-card__ghost,
    .fichar-card__primary {
      width: 100%;
      min-height: 2.75rem;
    }
    .fichar-hint {
      margin: 0;
      color: #5a686f;
      font-size: 0.92rem;
    }
    .fichar-err {
      margin: 0;
      padding: 0.7rem 0.9rem;
      border-radius: 0.9rem;
      background: #fdecea;
      color: #b71c1c;
      font-weight: 650;
    }
    .fichar-empty {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: #5a686f;
      padding: 0.35rem 0;
    }
    .fichar-empty mat-icon {
      color: var(--accent);
    }
    .fichar-empty p {
      margin: 0;
    }
    .fichar-done {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
      padding: 1.75rem 1.35rem 1.35rem;
    }
    .fichar-done__icon {
      font-size: 2.75rem;
      width: 2.75rem;
      height: 2.75rem;
      color: var(--accent);
      margin-bottom: 0.15rem;
    }
    .fichar-done__title {
      margin: 0;
      font-size: 1.55rem;
      font-weight: 800;
      color: var(--accent);
    }
    .fichar-done__meta {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
    }
    .fichar-done__meta--muted {
      font-weight: 600;
      color: #5a686f;
      font-size: 0.95rem;
    }
    .fichar-done .fichar-card__primary {
      margin-top: 0.85rem;
      max-width: 14rem;
    }
    @media (max-width: 420px) {
      .fichar-sheet__actions {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class AdminAttendanceCheckInPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly shops = inject(ShopContextService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly withHours = signal(true);
  readonly rows = signal<PendingRow[]>([]);
  readonly selected = signal<PendingRow | null>(null);
  readonly punchTime = signal('');
  readonly normalizeHhMm = normalizeHhMm;
  readonly shopName = signal('');
  readonly businessDate = signal('');
  readonly accentFromApi = signal('');
  readonly accent = computed(() =>
    resolveAccent(this.accentFromApi(), this.shops.accentColor()),
  );
  readonly onAccent = computed(() => onAccentColor(this.accent()));
  readonly flash = signal<{ title: string; hours: string; date: string; name: string } | null>(
    null,
  );
  readonly selectedShiftId = signal('');

  readonly shopShifts = computed(() =>
    shiftsOnIsoDate(this.shops.selectedShop(), this.businessDate() || undefined),
  );
  readonly showShiftSelect = computed(() => this.shopShifts().length > 1);
  readonly filteredRows = computed(() => {
    const all = this.rows();
    const shiftId = this.selectedShiftId();
    if (!this.showShiftSelect() || !shiftId) return all;
    return all.filter((r) => r.shiftId === shiftId);
  });
  readonly fixedRows = computed(() => this.filteredRows().filter((r) => !isRotating(r)));
  readonly rotatingRows = computed(() => this.filteredRows().filter((r) => isRotating(r)));
  readonly businessDateLabel = computed(() => formatIsoDateLabel(this.businessDate()));

  readonly statusLabel = statusLabel;
  readonly shiftHoursLabel = shiftHoursLabel;
  readonly isRotating = isRotating;

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      void this.router.navigate(['/admin/inicio']);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.selected.set(null);
    this.flash.set(null);
    this.http.get<PendingResponse>(`${environment.apiUrl}/shops/${shopId}/attendance/check-in`).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.withHours.set(!!res.withHours);
        this.rows.set(Array.isArray(res.employees) ? res.employees : []);
        this.shopName.set(res.shop?.name ?? this.shops.selectedShop()?.name ?? '');
        this.businessDate.set(String(res.date ?? '').slice(0, 10));
        this.accentFromApi.set(String(res.shop?.accentColor ?? '').trim());
        this.ensureSelectedShift(this.shopShifts());
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudo cargar el listado'));
      },
    });
  }

  onShiftChange(shiftId: string): void {
    this.selectedShiftId.set(shiftId);
    this.selected.set(null);
    this.error.set('');
  }

  cancelSheet(): void {
    this.selected.set(null);
    this.error.set('');
  }

  pick(row: PendingRow): void {
    this.error.set('');
    this.selected.set(row);
    if (row.shiftId) this.selectedShiftId.set(row.shiftId);
    this.punchTime.set(nowHhMm(this.shops.selectedShop()?.timezone));
  }

  clearFlash(): void {
    this.flash.set(null);
    this.reload();
  }

  canSave(): boolean {
    if (!this.selected()) return false;
    if (!this.withHours()) return true;
    return !!normalizeHhMm(this.punchTime());
  }

  shiftHoursFor(shiftId: string): string {
    const shift = this.shopShifts().find((s) => s.id === shiftId);
    return shift ? shiftHoursLabel(shift) : '';
  }

  initials(name: string): string {
    const parts = String(name ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
  }

  save(): void {
    const row = this.selected();
    const shopId = this.shops.selectedShopId();
    if (!row || !shopId || this.busy() || !this.canSave()) return;
    const body: Record<string, string> = {
      employeeId: row.employeeId,
      shiftId: row.shiftId,
    };
    if (this.withHours()) {
      const hh = normalizeHhMm(this.punchTime());
      if (row.punchPhase === 'checkOut') body['checkOutAt'] = hh;
      else body['checkInAt'] = hh;
    }
    this.busy.set(true);
    this.error.set('');
    this.http.post<PunchResult>(`${environment.apiUrl}/shops/${shopId}/attendance/check-in`, body).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.selected.set(null);
        let title = 'Listo';
        if (res.alreadyMarked || res.status === 'alreadyMarked') title = 'Ya registrado';
        else if (res.status === 'needsCheckOut') title = 'Entrada registrada';
        else if (res.status === 'complete' && res.checkOutAt) title = 'Salida registrada';
        this.flash.set({
          title,
          hours: formatHours(res.checkInAt, res.checkOutAt),
          date: formatIsoDateLabel(String(res.date ?? this.businessDate()).slice(0, 10)),
          name: row.fullName,
        });
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudo fichar'));
      },
    });
  }

  private ensureSelectedShift(shifts: ShopShift[]): void {
    if (!shifts.length) {
      this.selectedShiftId.set('');
      return;
    }
    const current = this.selectedShiftId();
    if (current && shifts.some((s) => s.id === current)) return;
    const preferred = resolveCurrentShift(this.shops.selectedShop());
    const pick =
      (preferred && shifts.find((s) => s.id === preferred.id)?.id) || shifts[0].id;
    this.selectedShiftId.set(pick);
  }
}
