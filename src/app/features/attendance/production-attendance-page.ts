import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { environment } from '../../../environments/environment';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { usePageRefresh } from '../../core/page-refresh.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { ProductionAttendanceExcelImportDialogComponent } from './production-attendance-excel-import-dialog';
import {
  attendanceRangeSharePayload,
  formatIsoShareLabel,
  isoDatesInRange,
  monthKeysInRange,
} from '../../shared/utils/attendance-share';
import { shareText } from '../../shared/utils/share-text';
import { LoadingStateComponent } from '../../shared/components/loading-state';
import {
  AttendanceShareRangeDialogComponent,
  AttendanceShareRangeResult,
} from './attendance-share-range-dialog';
import {
  resolveShopCalendarDate,
  zonedDateParts,
} from '../../core/shop/business-date';

interface ProdDayCell {
  id?: string;
  hours: number;
  isPresent: boolean;
}

interface ProdEmployeeRow {
  employeeId: string;
  fullName: string;
  days: Record<string, ProdDayCell>;
}

interface ProdMonthResponse {
  shopId: string;
  year: number;
  month: number;
  daysInMonth: number;
  defaultHours: number;
  employees: ProdEmployeeRow[];
}

interface ProdSummaryEmployee {
  employeeId: string;
  fullName: string;
  hours: number;
}

interface ProdSummaryResponse {
  shopId: string;
  week: {
    from: string;
    to: string;
    totalHours: number;
    byEmployee: ProdSummaryEmployee[];
  };
  year: {
    year: number;
    totalHours: number;
    byEmployee: ProdSummaryEmployee[];
  };
}

interface ProdProducerTotalsRow {
  employeeId: string;
  fullName: string;
  weekHours: number;
  monthHours: number;
  yearHours: number;
}

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatIsoShort(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

@Component({
  selector: 'app-production-attendance-page',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
    MatTooltipModule,
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule,
    PageHeaderComponent,
    FiltersCollapseBtnComponent,
    LoadingStateComponent,
  ],
  template: `
    <app-page-header
      title="Asistencia · Produccion"
      [subtitle]="shops.selectedShop()?.name ?? 'Sin local'"
      [actionLabel]="canManage() ? 'Importar Excel' : ''"
      [actionDisabled]="!canManage()"
      actionIcon="upload_file"
      (action)="openExcelImport()"
    />

    @if (shopId() && employees().length) {
      <div class="panel-card mb-3 today-panel">
        <div class="today-panel__head">
          <div>
            <h2 class="today-panel__title">{{ isQuickDayToday() ? 'Hoy' : 'Día' }}</h2>
            <p class="today-panel__date">
              {{ quickDayLabel() }} · Default {{ defaultHours() }} h
            </p>
            <div class="today-panel__day-nav">
              <button
                mat-icon-button
                type="button"
                aria-label="Día anterior"
                (click)="shiftQuickDay(-1)"
              >
                <mat-icon>chevron_left</mat-icon>
              </button>
              <input
                class="today-panel__day-input"
                type="date"
                [ngModel]="quickDayIso()"
                (ngModelChange)="onQuickDayChange($event)"
                aria-label="Fecha de asistencia"
              />
              <button
                mat-icon-button
                type="button"
                aria-label="Día siguiente"
                (click)="shiftQuickDay(1)"
              >
                <mat-icon>chevron_right</mat-icon>
              </button>
              @if (!isQuickDayToday()) {
                <button mat-stroked-button type="button" (click)="goQuickDayToday()">
                  <mat-icon>today</mat-icon>
                  Hoy
                </button>
              }
            </div>
          </div>
          <div class="today-panel__actions">
            <button
              mat-stroked-button
              type="button"
              [disabled]="sharing()"
              (click)="shareToday()"
            >
              <mat-icon>share</mat-icon>
              Compartir
            </button>
            @if (canManage() && !isQuickDayClosed()) {
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="saving()"
                (click)="markAllPresentToday()"
              >
                <mat-icon>done_all</mat-icon>
                Todos presentes
              </button>
            }
          </div>
        </div>
        @if (isQuickDayClosed()) {
          <p class="today-panel__closed">Franco del local. No se marca asistencia ese día.</p>
        } @else {
          <div class="today-panel__chips">
            @for (emp of employees(); track emp.employeeId) {
              <button
                type="button"
                class="today-chip"
                [class.today-chip--present]="hoursToday(emp) > 0"
                [disabled]="!canManage() || saving()"
                [matTooltip]="chipHint(emp)"
                (click)="onChipClick(emp)"
                (contextmenu)="editHoursToday($event, emp)"
                (pointerdown)="onPressStart($event, () => editHoursToday($event, emp))"
                (pointermove)="onPressMove($event)"
                (pointerup)="onPressEnd()"
                (pointerleave)="onPressEnd()"
                (pointercancel)="onPressEnd()"
              >
                <mat-icon>{{ hoursToday(emp) > 0 ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
                {{ emp.fullName }}
                @if (hoursToday(emp) > 0) {
                  <span class="today-chip__hours">{{ formatHours(hoursToday(emp)) }} h</span>
                }
              </button>
            }
          </div>
        }
      </div>
    }

    @if (shopId() && producerTotals().length) {
      <div class="panel-card mb-3 prod-summary">
        <div class="prod-summary__head">
          <div>
            <h2 class="prod-summary__title">Resumen por productor</h2>
            <p class="prod-summary__subtitle">
              @if (summary(); as s) {
                Semana {{ weekRangeLabel(s.week.from, s.week.to) }}
                · Mes {{ monthLabel() }}
                · Año {{ year() }}
              } @else {
                Mes {{ monthLabel() }} · Año {{ year() }}
              }
            </p>
          </div>
          <div class="prod-summary__totals">
            <span>Semana <strong>{{ formatHours(summary()?.week?.totalHours ?? 0) }} h</strong></span>
            <span>Mes <strong>{{ formatHours(monthHoursTotal()) }} h</strong></span>
            <span>Año <strong>{{ formatHours(summary()?.year?.totalHours ?? 0) }} h</strong></span>
          </div>
        </div>
        <div class="prod-summary__table-wrap">
          <table class="prod-summary__table">
            <thead>
              <tr>
                <th>Productor</th>
                <th>Semana</th>
                <th>Mes</th>
                <th>Año</th>
              </tr>
            </thead>
            <tbody>
              @for (row of producerTotals(); track row.employeeId) {
                <tr>
                  <td>{{ row.fullName }}</td>
                  <td>{{ formatHours(row.weekHours) }} h</td>
                  <td>{{ formatHours(row.monthHours) }} h</td>
                  <td>{{ formatHours(row.yearHours) }} h</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                <th>{{ formatHours(summary()?.week?.totalHours ?? 0) }} h</th>
                <th>{{ formatHours(monthHoursTotal()) }} h</th>
                <th>{{ formatHours(summary()?.year?.totalHours ?? 0) }} h</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    }

    <div
      class="panel-card guy-filters mb-3"
      [class.guy-filters--collapsed]="filtersCollapsed()"
    >
      <div class="guy-filters__head">
        <div>
          <h2 class="guy-filters__title">Filtros</h2>
        </div>
        <div class="guy-filters__tools">
          <app-filters-collapse-btn
            [collapsed]="filtersCollapsed()"
            (toggle)="toggleFilters()"
          />
        </div>
      </div>
      <div class="guy-filters__body">
      <div class="guy-filters__grid guy-filters__grid--dense">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Mes</mat-label>
          <mat-select [ngModel]="month()" (ngModelChange)="onMonthChange($event)">
            @for (m of months; track m.value) {
              <mat-option [value]="m.value">{{ m.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Año</mat-label>
          <mat-select [ngModel]="year()" (ngModelChange)="onYearChange($event)">
            @for (y of years; track y) {
              <mat-option [value]="y">{{ y }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <button mat-stroked-button type="button" (click)="goToTodayMonth()">
          <mat-icon>today</mat-icon>
          Ver mes actual
        </button>
        <button
          mat-stroked-button
          type="button"
          [disabled]="!shopId() || exporting()"
          (click)="exportExcel()"
        >
          <mat-icon>download</mat-icon>
          Descargar Excel
        </button>
      </div>
      </div>
    </div>

    @if (!shopId()) {
      <div class="panel-card">Seleccioná un local en el menú lateral.</div>
    } @else if (loading()) {
      <app-loading-state
        [loading]="true"
        title="Cargando…"
        message="Obteniendo asistencia de producción"
      />
    } @else if (!employees().length) {
      <div class="panel-card">
        No hay productores activos. Marcá “Produce comida” en Empleados para que aparezcan acá.
      </div>
    } @else {
      <div class="panel-card panel-card--flush">
        <div class="panel-card__body">
          <div class="att-board__head">
            <div>
              <h2 class="att-board__title">Tablero del mes</h2>
              <p class="att-board__meta">
                {{ months.find((m) => m.value === month())?.label }} {{ year() }}
              </p>
            </div>
            @if (canManage()) {
              <div class="att-board__actions">
                @if (!markingUnlocked()) {
                  <button mat-flat-button color="primary" type="button" (click)="unlockMarking()">
                    <mat-icon>edit</mat-icon>
                    Editar tablero
                  </button>
                } @else {
                  <button mat-stroked-button type="button" (click)="lockMarking()">
                    <mat-icon>lock</mat-icon>
                    Listo
                  </button>
                }
              </div>
            }
          </div>
          @if (canManage() && !markingUnlocked()) {
            <p class="att-board__lock-hint">
              Activá <strong>Editar tablero</strong> para marcar celdas (viene bloqueado). Cada
              guardado pide confirmación.
            </p>
          }
          <div
            class="att-table-wrap"
            [class.att-table-wrap--locked]="canManage() && !markingUnlocked()"
            #tableWrap
          >
            <table class="att-table">
              <thead>
                <tr>
                  <th class="att-table__name">Productor</th>
                  @for (d of dayNumbers(); track d) {
                    <th
                      class="att-table__day"
                      [class.att-table__day--today]="isTodayColumn(d)"
                      [class.att-table__day--closed]="isClosedDay(d)"
                      [attr.data-day]="d"
                    >
                      <span class="att-table__day-num">{{ d }}</span>
                      @if (isClosedDay(d)) {
                        <span class="att-table__day-label">Franco</span>
                      } @else if (isTodayColumn(d)) {
                        <span class="att-table__day-label">Hoy</span>
                      }
                    </th>
                  }
                  <th class="att-table__total">Total h</th>
                </tr>
              </thead>
              <tbody>
                @for (emp of employees(); track emp.employeeId) {
                  <tr>
                    <td class="att-table__name">{{ emp.fullName }}</td>
                    @for (d of dayNumbers(); track d) {
                      <td
                        [class.att-table__day--today]="isTodayColumn(d)"
                        [class.att-table__day--closed]="isClosedDay(d)"
                      >
                        <button
                          type="button"
                          class="att-cell"
                          [class.att-cell--present]="hoursOf(emp, d) > 0"
                          [class.att-cell--closed]="isClosedDay(d)"
                          [class.att-cell--today]="isTodayColumn(d)"
                          [disabled]="!canManage() || saving() || isClosedDay(d) || !markingUnlocked()"
                          [matTooltip]="cellTooltip(emp, d)"
                          (click)="onCellClick(emp, d)"
                          (contextmenu)="editHours($event, emp, d)"
                          (pointerdown)="onPressStart($event, () => editHours($event, emp, d))"
                          (pointermove)="onPressMove($event)"
                          (pointerup)="onPressEnd()"
                          (pointerleave)="onPressEnd()"
                          (pointercancel)="onPressEnd()"
                        >
                          @if (isClosedDay(d)) {
                            <mat-icon class="att-cell__icon">hotel</mat-icon>
                          } @else if (hoursOf(emp, d) > 0) {
                            <span class="att-cell__hours">{{ formatHours(hoursOf(emp, d)) }}</span>
                          }
                        </button>
                      </td>
                    }
                    <td class="att-table__total">{{ formatHours(monthTotal(emp)) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="att-legend">
            <span class="att-legend__item">Toque: marcar/quitar ({{ defaultHours() }} h)</span>
            <span class="att-legend__item">Mantener pulsado: editar horas</span>
            <span class="att-legend__item att-legend__item--desk">En PC: click derecho también edita</span>
            <span class="att-legend__item">Default del local: {{ defaultHours() }} h</span>
            <span class="att-legend__hint">
              Tablero: activá Editar tablero para marcar celdas. Cada guardado pide confirmación.
            </span>
          </p>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .prod-summary {
        padding: 0.95rem 1.1rem 1.05rem;
      }
      .prod-summary__head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        justify-content: space-between;
        gap: 0.75rem 1.25rem;
        margin-bottom: 0.85rem;
      }
      .prod-summary__title {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
      }
      .prod-summary__subtitle {
        margin: 0.2rem 0 0;
        font-size: 0.82rem;
        color: var(--guy-muted, #5f6f76);
        text-transform: capitalize;
      }
      .prod-summary__totals {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem 1.1rem;
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
      }
      .prod-summary__totals strong {
        color: var(--guy-navy, #003366);
        font-weight: 800;
      }
      .prod-summary__table-wrap {
        overflow-x: auto;
      }
      .prod-summary__table {
        width: 100%;
        border-collapse: collapse;
        min-width: 22rem;
      }
      .prod-summary__table th,
      .prod-summary__table td {
        padding: 0.45rem 0.55rem;
        text-align: left;
        border-bottom: 1px solid var(--guy-border, #d7e0d9);
        font-size: 0.9rem;
      }
      .prod-summary__table th:not(:first-child),
      .prod-summary__table td:not(:first-child),
      .prod-summary__table tfoot th:not(:first-child) {
        text-align: right;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .prod-summary__table thead th {
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--guy-muted, #5f6f76);
        font-weight: 700;
      }
      .prod-summary__table tbody td:first-child {
        font-weight: 600;
        color: var(--guy-navy, #003366);
      }
      .prod-summary__table tfoot th {
        border-bottom: none;
        padding-top: 0.65rem;
        color: var(--guy-navy, #003366);
        font-weight: 800;
      }
      .today-panel__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin-bottom: 0.85rem;
      }
      .today-panel__title {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
      }
      .today-panel__date {
        margin: 0.15rem 0 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
        text-transform: capitalize;
      }
      .today-panel__day-nav {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.15rem;
        margin-top: 0.45rem;
      }
      .today-panel__day-input {
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 10px;
        padding: 0.35rem 0.55rem;
        font: inherit;
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--guy-navy, #003366);
        background: #fff;
        min-height: 40px;
      }
      .today-panel__closed {
        margin: 0;
        font-size: 0.88rem;
        color: var(--guy-muted, #5f6f76);
      }
      .today-panel__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }
      .today-panel__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .today-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: #fff;
        border-radius: 999px;
        padding: 0.45rem 0.85rem;
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--guy-navy, #003366);
        cursor: pointer;
      }
      .today-chip mat-icon {
        font-size: 1.15rem;
        width: 1.15rem;
        height: 1.15rem;
      }
      .today-chip__hours {
        font-size: 0.8rem;
        font-weight: 700;
        opacity: 0.85;
      }
      .today-chip--present {
        background: color-mix(in srgb, var(--guy-green, #2e7d32) 18%, transparent);
        border-color: var(--guy-green, #2e7d32);
      }
      .today-chip:disabled {
        opacity: 0.7;
        cursor: default;
      }
      .att-table-wrap {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior-x: contain;
        scroll-behavior: smooth;
        touch-action: pan-x pan-y;
      }
      .att-table-wrap--locked {
        opacity: 0.92;
      }
      .att-table-wrap--locked .att-cell,
      .att-table-wrap--locked .att-table__day {
        pointer-events: none;
        touch-action: pan-x pan-y;
      }
      .att-board__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin-bottom: 0.65rem;
      }
      .att-board__title {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
      }
      .att-board__meta {
        margin: 0.15rem 0 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
      }
      .att-board__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .att-board__lock-hint {
        margin: 0 0 0.75rem;
        font-size: 0.82rem;
        color: var(--guy-muted, #5f6f76);
      }
      .att-table {
        border-collapse: collapse;
        width: max-content;
        min-width: 100%;
      }
      .att-table th,
      .att-table td {
        border: 1px solid var(--guy-border, #d7e0d9);
        text-align: center;
        padding: 0.25rem;
        font-size: 0.75rem;
      }
      .att-table thead .att-table__day--today {
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 12%, #fff);
        color: var(--guy-primary, #1d65a0);
        font-weight: 700;
      }
      .att-table__name {
        position: sticky;
        left: 0;
        z-index: 2;
        background: #fff;
        text-align: left !important;
        min-width: 9rem;
        max-width: 12rem;
        padding: 0.4rem 0.6rem !important;
        font-weight: 650;
      }
      .att-table thead .att-table__name {
        z-index: 3;
      }
      .att-table__day {
        min-width: 2.4rem;
      }
      .att-table__day-num {
        display: block;
      }
      .att-table__day-label {
        display: block;
        font-size: 0.6rem;
        font-weight: 600;
        opacity: 0.8;
      }
      .att-table__total {
        min-width: 3.2rem;
        font-weight: 700;
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 6%, #fff);
      }
      .att-cell {
        width: 2.2rem;
        height: 2.2rem;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }
      .att-cell--present {
        background: color-mix(in srgb, var(--guy-green, #2e7d32) 18%, transparent);
        border-color: var(--guy-green, #2e7d32);
      }
      .att-cell--closed {
        background: color-mix(in srgb, #9e9e9e 12%, transparent);
        cursor: default;
      }
      .att-cell--today:not(.att-cell--closed) {
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--guy-primary, #1d65a0) 45%, transparent);
      }
      .att-cell:disabled {
        cursor: default;
      }
      .att-cell__icon {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
        opacity: 0.7;
      }
      .att-cell__hours {
        font-size: 0.72rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
      }
      .att-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 1.25rem;
        margin: 0.85rem 0 0;
        font-size: 0.8rem;
        color: var(--guy-muted, #5f6f76);
      }
      .att-legend__item {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }
      @media (max-width: 720px) {
        .att-legend__item--desk {
          display: none;
        }
      }
      .att-cell {
        touch-action: manipulation;
        -webkit-user-select: none;
        user-select: none;
      }
      .today-chip {
        touch-action: manipulation;
        -webkit-user-select: none;
        user-select: none;
      }
    `,
  ],
})
export class ProductionAttendancePage {
  private readonly filtersUi = createFiltersCollapsed('production-attendance');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  readonly shops = inject(ShopContextService);
  private readonly live = inject(ShopLiveClient);

  readonly shopId = this.shops.selectedShopId;
  private readonly tableWrap = viewChild<ElementRef<HTMLElement>>('tableWrap');
  readonly months = MONTH_LABELS.map((label, idx) => ({ value: idx + 1, label }));
  readonly years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 3 + i);

  private shopTodayParts() {
    return zonedDateParts(new Date(), this.shops.selectedShop()?.timezone);
  }

  readonly todayParts = computed(() => this.shopTodayParts());
  readonly todayYear = computed(() => this.todayParts().year);
  readonly todayMonth = computed(() => this.todayParts().month);
  readonly todayDay = computed(() => this.todayParts().day);
  readonly todayIso = computed(() =>
    resolveShopCalendarDate(new Date(), { timezone: this.shops.selectedShop()?.timezone }),
  );

  readonly year = signal(this.shopTodayParts().year);
  readonly month = signal(this.shopTodayParts().month);
  readonly data = signal<ProdMonthResponse | null>(null);
  readonly summary = signal<ProdSummaryResponse | null>(null);
  readonly loading = signal(true);
  readonly todayMarks = signal<Record<string, number>>({});
  readonly saving = signal(false);
  readonly exporting = signal(false);
  readonly sharing = signal(false);
  readonly defaultHours = signal(8);
  /**
   * Solo el tablero del mes: siempre bloqueado por defecto.
   * La sección Hoy no usa este candado.
   */
  readonly markingUnlocked = signal(false);
  /** Día seleccionado en el panel rápido (por defecto hoy). */
  readonly quickDayIso = signal(resolveShopCalendarDate(new Date(), { timezone: undefined }));

  private monthLoadSeq = 0;
  private todayLoadSeq = 0;
  private summaryLoadSeq = 0;
  private lastSyncedShopId: string | null = null;

  readonly employees = computed(() => this.data()?.employees ?? []);
  readonly dayNumbers = computed(() => {
    const n = this.data()?.daysInMonth ?? 0;
    return Array.from({ length: n }, (_, i) => i + 1);
  });
  readonly monthHoursTotal = computed(() =>
    this.employees().reduce((sum, emp) => sum + this.monthTotal(emp), 0),
  );
  readonly monthLabel = computed(() => {
    const m = this.months.find((x) => x.value === this.month())?.label ?? '';
    return `${m} ${this.year()}`.trim();
  });
  readonly producerTotals = computed((): ProdProducerTotalsRow[] => {
    const emps = this.employees();
    const summary = this.summary();
    const weekMap = new Map(
      (summary?.week?.byEmployee ?? []).map((e) => [e.employeeId, Number(e.hours) || 0]),
    );
    const yearMap = new Map(
      (summary?.year?.byEmployee ?? []).map((e) => [e.employeeId, Number(e.hours) || 0]),
    );
    const names = new Map<string, string>();
    for (const e of emps) names.set(e.employeeId, e.fullName);
    for (const e of summary?.week?.byEmployee ?? []) names.set(e.employeeId, e.fullName);
    for (const e of summary?.year?.byEmployee ?? []) names.set(e.employeeId, e.fullName);

    const ids = new Set<string>([
      ...emps.map((e) => e.employeeId),
      ...weekMap.keys(),
      ...yearMap.keys(),
    ]);
    return [...ids]
      .map((employeeId) => ({
        employeeId,
        fullName: names.get(employeeId) ?? 'Productor',
        weekHours: weekMap.get(employeeId) ?? 0,
        monthHours: (() => {
          const emp = emps.find((e) => e.employeeId === employeeId);
          return emp ? this.monthTotal(emp) : 0;
        })(),
        yearHours: yearMap.get(employeeId) ?? 0,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  });

  constructor() {
    usePageRefresh(() => {
      void this.reload();
      void this.loadTodayMarks();
      void this.loadSummary();
    });
    this.live
      .watch(
        computed(() => this.shops.selectedShop()?.slug ?? null),
        ['attendance'],
      )
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        void this.reload();
        void this.loadTodayMarks();
        void this.loadSummary();
      });
    effect(() => {
      const shopId = this.shopId();
      this.todayIso();
      if (shopId && shopId !== this.lastSyncedShopId) {
        this.lastSyncedShopId = shopId;
        this.quickDayIso.set(this.todayIso());
        this.year.set(this.todayYear());
        this.month.set(this.todayMonth());
      }
    });
    effect(() => {
      const shopId = this.shopId();
      this.year();
      this.month();
      if (!shopId) {
        this.data.set(null);
        this.summary.set(null);
        this.loading.set(false);
        return;
      }
      void this.reload();
      void this.loadSummary();
    });
    effect(() => {
      const shopId = this.shopId();
      this.quickDayIso();
      if (!shopId) {
        this.todayMarks.set({});
        return;
      }
      void this.loadTodayMarks();
    });
  }

  canManage(): boolean {
    return hasShopPermission(
      this.auth.currentUser(),
      this.shopId(),
      'attendance.manage',
    );
  }

  exportExcel(): void {
    const shopId = this.shopId();
    const shop = this.shops.selectedShop();
    if (!shopId || this.exporting()) return;
    const year = this.year();
    const month = this.month();
    this.exporting.set(true);
    this.http
      .get(`${environment.apiUrl}/shops/${shopId}/production-attendance/export.xlsx`, {
        params: { year: String(year), month: String(month) },
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.exporting.set(false);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const monthPad = String(month).padStart(2, '0');
          a.download = `produccion-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${year}-${monthPad}.xlsx`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => {
          this.exporting.set(false);
          this.snack.open('No se pudo descargar el Excel', 'OK', { duration: 3000 });
        },
      });
  }

  openExcelImport(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.dialogTitle
      .track(
        this.dialog.open(ProductionAttendanceExcelImportDialogComponent, {
          width: '820px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            shopId,
            shopName: this.shops.selectedShop()?.name ?? 'Local',
          },
        }),
        'Importar producción',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) {
          void this.reload();
          void this.loadTodayMarks();
          void this.loadSummary();
        }
      });
  }

  private shopFileSlug(name?: string | null): string {
    const raw = (name ?? 'local')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    return raw || 'local';
  }

  isQuickDayToday(): boolean {
    return this.quickDayIso() === this.todayIso();
  }

  quickDayLabel(): string {
    const [y, m, d] = this.quickDayIso().split('-').map(Number);
    if (!y || !m || !d) return this.quickDayIso();
    return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  onQuickDayChange(raw: string): void {
    const next = String(raw ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
    if (next === this.quickDayIso()) return;
    this.quickDayIso.set(next);
  }

  shiftQuickDay(delta: number): void {
    const [y, m, d] = this.quickDayIso().split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    const ny = dt.getFullYear();
    const nm = String(dt.getMonth() + 1).padStart(2, '0');
    const nd = String(dt.getDate()).padStart(2, '0');
    this.quickDayIso.set(`${ny}-${nm}-${nd}`);
  }

  goQuickDayToday(): void {
    this.quickDayIso.set(this.todayIso());
  }

  isQuickDayClosed(): boolean {
    const closed = this.shops.selectedShop()?.closedWeekdays ?? [];
    if (!closed.length) return false;
    const [y, m, d] = this.quickDayIso().split('-').map(Number);
    if (!y || !m || !d) return false;
    return closed.includes(new Date(y, m - 1, d).getDay());
  }

  unlockMarking(): void {
    const ok = window.confirm(
      '¿Editar el tablero del mes?\n\nCada cambio te va a pedir confirmación antes de guardarse.',
    );
    if (!ok) return;
    this.markingUnlocked.set(true);
    this.snack.open('Tablero en edición. Tocá Listo cuando termines.', 'OK', {
      duration: 2200,
    });
  }

  lockMarking(): void {
    this.markingUnlocked.set(false);
  }

  /** Confirmación obligatoria antes de guardar un cambio del tablero. */
  private confirmBoardSave(summary: string): boolean {
    if (!this.markingUnlocked()) return false;
    return window.confirm(`${summary}\n\n¿Confirmás guardar este cambio?`);
  }

  async shareToday(): Promise<void> {
    const shopId = this.shopId();
    if (!shopId) return;
    const range = await firstValueFrom(
      this.dialogTitle
        .track(
          this.dialog.open(AttendanceShareRangeDialogComponent, {
            width: '440px',
            maxWidth: '96vw',
            panelClass: 'guy-dialog',
            data: { fromIso: this.quickDayIso(), toIso: this.quickDayIso() },
          }),
          'Compartir presentismo',
        )
        .afterClosed(),
    );
    if (!range) return;
    this.sharing.set(true);
    try {
      const payload = await this.buildSharePayload(shopId, range);
      const result = await shareText(payload);
      if (result === 'copied') {
        this.snack.open('Presentismo copiado al portapapeles', 'OK', { duration: 2200 });
      } else if (result === 'failed') {
        this.snack.open('No se pudo compartir', 'OK', { duration: 3000 });
      }
    } catch {
      this.snack.open('No se pudo armar el presentismo', 'OK', { duration: 3000 });
    } finally {
      this.sharing.set(false);
    }
  }

  private async buildSharePayload(
    shopId: string,
    range: AttendanceShareRangeResult,
  ): Promise<{ title: string; text: string }> {
    const shop = this.shops.selectedShop();
    const months = await this.loadMonthsForRange(shopId, range.fromIso, range.toIso);
    const byId = new Map<string, ProdEmployeeRow>();
    for (const month of months) {
      for (const emp of month.employees ?? []) {
        const prev = byId.get(emp.employeeId);
        byId.set(emp.employeeId, prev ? { ...emp, days: { ...prev.days, ...emp.days } } : emp);
      }
    }
    const employees = [...byId.values()];
    const closed = shop?.closedWeekdays ?? [];
    let dates = isoDatesInRange(range.fromIso, range.toIso);
    const openDates = dates.filter((iso) => {
      const [y, m, d] = iso.split('-').map(Number);
      return !closed.includes(new Date(y, m - 1, d).getDay());
    });
    if (openDates.length) dates = openDates;
    const quick = this.quickDayIso();
    const marks = this.todayMarks();
    return attendanceRangeSharePayload({
      shopName: shop?.name ?? 'Local',
      fromLabel: formatIsoShareLabel(range.fromIso),
      toLabel: formatIsoShareLabel(range.toIso),
      kind: 'produccion',
      days: dates.map((iso) => ({
        dateLabel: formatIsoShareLabel(iso),
        employees: employees.map((emp) => {
          const hours =
            iso === quick
              ? Number(marks[emp.employeeId] ?? emp.days[iso]?.hours ?? 0) || 0
              : Number(emp.days[iso]?.hours ?? 0) || 0;
          return {
            fullName: emp.fullName,
            present: hours > 0,
            hours,
          };
        }),
      })),
    });
  }

  private async loadMonthsForRange(
    shopId: string,
    fromIso: string,
    toIso: string,
  ): Promise<ProdMonthResponse[]> {
    const keys = monthKeysInRange(fromIso, toIso);
    return Promise.all(
      keys.map((key) => {
        if (this.year() === key.year && this.month() === key.month && this.data()) {
          return Promise.resolve(this.data()!);
        }
        return firstValueFrom(
          this.http.get<ProdMonthResponse>(
            `${environment.apiUrl}/shops/${shopId}/production-attendance`,
            {
              params: {
                year: String(key.year),
                month: String(key.month),
                _: String(Date.now()),
              },
              headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
            },
          ),
        );
      }),
    );
  }

  formatHours(h: number): string {
    const n = Number(h) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  weekRangeLabel(from: string, to: string): string {
    return `${formatIsoShort(from)} – ${formatIsoShort(to)}`;
  }

  onMonthChange(value: number): void {
    this.month.set(value);
  }

  onYearChange(value: number): void {
    this.year.set(value);
  }

  goToTodayMonth(): void {
    this.year.set(this.todayYear());
    this.month.set(this.todayMonth());
  }

  isTodayColumn(day: number): boolean {
    return (
      this.year() === this.todayYear() &&
      this.month() === this.todayMonth() &&
      day === this.todayDay()
    );
  }

  isClosedDay(day: number): boolean {
    const closed = this.shops.selectedShop()?.closedWeekdays ?? [];
    const d = new Date(this.year(), this.month() - 1, day);
    return closed.includes(d.getDay());
  }

  hoursOf(emp: ProdEmployeeRow, day: number): number {
    const iso = this.isoForDay(day);
    return Number(emp.days?.[iso]?.hours ?? 0) || 0;
  }

  hoursToday(emp: ProdEmployeeRow): number {
    return Number(this.todayMarks()[emp.employeeId] ?? 0) || 0;
  }

  monthTotal(emp: ProdEmployeeRow): number {
    return this.dayNumbers().reduce((sum, d) => sum + this.hoursOf(emp, d), 0);
  }

  cellTooltip(emp: ProdEmployeeRow, day: number): string {
    if (this.isClosedDay(day)) return 'Franco del local';
    if (!this.markingUnlocked()) return 'Activá Editar tablero para marcar celdas';
    const h = this.hoursOf(emp, day);
    if (h > 0) {
      return `${this.formatHours(h)} h · Toque: quitar · Mantener: editar`;
    }
    return `Toque: marcar ${this.defaultHours()} h · Mantener: ingresar horas`;
  }

  chipHint(emp: ProdEmployeeRow): string {
    if (this.hoursToday(emp) > 0) {
      return 'Toque: quitar · Mantener: editar horas';
    }
    return `Toque: marcar ${this.defaultHours()} h · Mantener: ingresar horas`;
  }

  onChipClick(emp: ProdEmployeeRow): void {
    if (this.consumeLongPressClick()) return;
    this.togglePresentToday(emp);
  }

  onCellClick(emp: ProdEmployeeRow, day: number): void {
    if (this.consumeLongPressClick()) return;
    this.togglePresent(emp, day);
  }

  onPressStart(event: PointerEvent, onLongPress: () => void): void {
    if (!this.canManage()) return;
    // Solo touch / pen: el mouse usa click derecho
    if (event.pointerType === 'mouse') return;
    this.pressMoved = false;
    this.pressOrigin = { x: event.clientX, y: event.clientY };
    this.clearPressTimer();
    this.pressTimer = window.setTimeout(() => {
      this.pressTimer = null;
      if (this.pressMoved) return;
      this.skipNextClick = true;
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(12);
        }
      } catch {
        // ignore
      }
      onLongPress();
    }, 480);
  }

  onPressMove(event: PointerEvent): void {
    if (!this.pressOrigin) return;
    const dx = event.clientX - this.pressOrigin.x;
    const dy = event.clientY - this.pressOrigin.y;
    if (dx * dx + dy * dy > 144) {
      this.pressMoved = true;
      this.skipNextClick = true;
      this.clearPressTimer();
    }
  }

  onPressEnd(): void {
    this.clearPressTimer();
    this.pressOrigin = null;
  }

  togglePresentToday(emp: ProdEmployeeRow): void {
    if (!this.canManage() || this.isQuickDayClosed()) return;
    const cur = this.hoursToday(emp);
    this.upsertToday(emp, cur > 0 ? 0 : this.defaultHours());
  }

  editHoursToday(event: Event, emp: ProdEmployeeRow): void {
    event.preventDefault();
    this.clearPressTimer();
    if (!this.canManage() || this.isQuickDayClosed()) return;
    const next = this.askHours(this.hoursToday(emp) || this.defaultHours());
    if (next === null) return;
    this.upsertToday(emp, next);
  }

  togglePresent(emp: ProdEmployeeRow, day: number): void {
    if (!this.canManage() || this.isClosedDay(day) || !this.markingUnlocked()) return;
    const cur = this.hoursOf(emp, day);
    const next = cur > 0 ? 0 : this.defaultHours();
    const label = next > 0 ? `presente (${this.formatHours(next)} h)` : 'ausente (0 h)';
    if (!this.confirmBoardSave(`${emp.fullName} · día ${day}: marcar ${label}`)) return;
    this.upsert(emp, day, next);
  }

  editHours(event: Event, emp: ProdEmployeeRow, day: number): void {
    event.preventDefault();
    this.clearPressTimer();
    if (!this.canManage() || this.isClosedDay(day) || !this.markingUnlocked()) return;
    const next = this.askHours(this.hoursOf(emp, day) || this.defaultHours());
    if (next === null) return;
    if (
      !this.confirmBoardSave(
        `${emp.fullName} · día ${day}: ${this.formatHours(next)} h`,
      )
    ) {
      return;
    }
    this.upsert(emp, day, next);
  }

  private pressTimer: number | null = null;
  private skipNextClick = false;
  private pressOrigin: { x: number; y: number } | null = null;
  private pressMoved = false;

  private clearPressTimer(): void {
    if (this.pressTimer != null) {
      window.clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }

  private consumeLongPressClick(): boolean {
    if (!this.skipNextClick && !this.pressMoved) return false;
    this.skipNextClick = false;
    this.pressMoved = false;
    return true;
  }

  markAllPresentToday(): void {
    const shopId = this.shopId();
    if (!shopId || !this.canManage() || this.isQuickDayClosed()) return;
    const hours = this.defaultHours();
    const date = this.quickDayIso();
    const items = this.employees().map((e) => ({
      employeeId: e.employeeId,
      date,
      hours,
    }));
    if (!items.length) return;
    this.saving.set(true);
    this.http
      .post(`${environment.apiUrl}/shops/${shopId}/production-attendance/bulk`, { items })
      .subscribe({
        next: () => {
          this.saving.set(false);
          const next = { ...this.todayMarks() };
          for (const e of this.employees()) next[e.employeeId] = hours;
          this.todayMarks.set(next);
          const [y, m] = date.split('-').map(Number);
          if (this.year() === y && this.month() === m) {
            void this.reload();
          }
          void this.loadSummary();
          this.snack.open(`Productores marcados con ${this.formatHours(hours)} h`, 'OK', {
            duration: 2500,
          });
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudo marcar la producción';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  private askHours(current: number): number | null {
    const raw = window.prompt('Horas de producción', this.formatHours(current));
    if (raw === null) return null;
    const parsed = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      this.snack.open('Horas inválidas', 'OK', { duration: 2500 });
      return null;
    }
    return Math.round(parsed * 100) / 100;
  }

  private upsertToday(emp: ProdEmployeeRow, hours: number): void {
    const shopId = this.shopId();
    if (!shopId || this.isQuickDayClosed()) return;
    const date = this.quickDayIso();
    this.saving.set(true);
    this.http
      .post<{ hours: number }>(`${environment.apiUrl}/shops/${shopId}/production-attendance`, {
        employeeId: emp.employeeId,
        date,
        hours,
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.todayMarks.update((m) => ({ ...m, [emp.employeeId]: Number(res.hours) || 0 }));
          const [y, m] = date.split('-').map(Number);
          if (this.year() === y && this.month() === m) {
            this.patchLocalDay(emp.employeeId, date, Number(res.hours) || 0);
          }
          void this.loadSummary();
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  private upsert(emp: ProdEmployeeRow, day: number, hours: number): void {
    const shopId = this.shopId();
    if (!shopId) return;
    const iso = this.isoForDay(day);
    this.saving.set(true);
    this.http
      .post<{ hours: number }>(`${environment.apiUrl}/shops/${shopId}/production-attendance`, {
        employeeId: emp.employeeId,
        date: iso,
        hours,
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          const h = Number(res.hours) || 0;
          this.patchLocalDay(emp.employeeId, iso, h);
          if (iso === this.quickDayIso()) {
            this.todayMarks.update((m) => ({ ...m, [emp.employeeId]: h }));
          }
          void this.loadSummary();
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  private patchLocalDay(employeeId: string, iso: string, hours: number): void {
    this.data.update((cur) => {
      if (!cur) return cur;
      return {
        ...cur,
        employees: cur.employees.map((e) => {
          if (e.employeeId !== employeeId) return e;
          return {
            ...e,
            days: {
              ...e.days,
              [iso]: { hours, isPresent: hours > 0 },
            },
          };
        }),
      };
    });
  }

  private isoForDay(day: number): string {
    const m = String(this.month()).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${this.year()}-${m}-${d}`;
  }

  private async reload(): Promise<void> {
    const shopId = this.shopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    const seq = ++this.monthLoadSeq;
    this.loading.set(true);
    try {
      const data = await firstValueFrom(
        this.http.get<ProdMonthResponse>(
          `${environment.apiUrl}/shops/${shopId}/production-attendance`,
          {
            params: {
              year: String(this.year()),
              month: String(this.month()),
              _: String(Date.now()),
            },
            headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
          },
        ),
      );
      if (seq !== this.monthLoadSeq) return;
      this.data.set(data);
      this.loading.set(false);
      if (data.defaultHours) this.defaultHours.set(Number(data.defaultHours) || 8);
      requestAnimationFrame(() => this.scrollMatrixToToday());
    } catch {
      if (seq !== this.monthLoadSeq) return;
      this.data.set(null);
      this.loading.set(false);
      this.snack.open('No se pudo cargar la asistencia de producción', 'OK', { duration: 3000 });
    }
  }

  private async loadTodayMarks(): Promise<void> {
    const shopId = this.shopId();
    if (!shopId) return;
    const iso = this.quickDayIso();
    const [y, m] = iso.split('-').map(Number);
    if (!y || !m) return;
    const seq = ++this.todayLoadSeq;
    try {
      const data = await firstValueFrom(
        this.http.get<ProdMonthResponse>(
          `${environment.apiUrl}/shops/${shopId}/production-attendance`,
          {
            params: {
              year: String(y),
              month: String(m),
              _: String(Date.now()),
            },
            headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
          },
        ),
      );
      if (seq !== this.todayLoadSeq) return;
      if (data.defaultHours) this.defaultHours.set(Number(data.defaultHours) || 8);
      const marks: Record<string, number> = {};
      for (const e of data.employees ?? []) {
        marks[e.employeeId] = Number(e.days?.[iso]?.hours ?? 0) || 0;
      }
      this.todayMarks.set(marks);
      if (!this.data()) this.data.set(data);
    } catch {
      if (seq !== this.todayLoadSeq) return;
      this.todayMarks.set({});
    }
  }

  private async loadSummary(): Promise<void> {
    const shopId = this.shopId();
    if (!shopId) {
      this.summary.set(null);
      return;
    }
    const seq = ++this.summaryLoadSeq;
    try {
      const data = await firstValueFrom(
        this.http.get<ProdSummaryResponse>(
          `${environment.apiUrl}/shops/${shopId}/production-attendance/summary`,
          {
            params: {
              year: String(this.year()),
              _: String(Date.now()),
            },
            headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
          },
        ),
      );
      if (seq !== this.summaryLoadSeq) return;
      this.summary.set(data);
    } catch {
      if (seq !== this.summaryLoadSeq) return;
      this.summary.set(null);
    }
  }

  private scrollMatrixToToday(attempt = 0): void {
    if (this.year() !== this.todayYear() || this.month() !== this.todayMonth()) return;
    const wrap = this.tableWrap()?.nativeElement;
    if (!wrap) return;
    const todayHeader = wrap.querySelector(
      `th.att-table__day[data-day="${this.todayDay()}"]`,
    ) as HTMLElement | null;
    if (!todayHeader) {
      if (attempt < 5) requestAnimationFrame(() => this.scrollMatrixToToday(attempt + 1));
      return;
    }
    const wrapRect = wrap.getBoundingClientRect();
    const dayRect = todayHeader.getBoundingClientRect();
    const delta = dayRect.left - wrapRect.left - wrapRect.width / 2 + dayRect.width / 2;
    wrap.scrollBy({ left: delta, behavior: attempt === 0 ? 'auto' : 'smooth' });
  }
}
