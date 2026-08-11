import { Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
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
import { AttendanceExcelImportDialogComponent } from './attendance-excel-import-dialog';
import { AttendanceOvertimeDialogComponent } from './attendance-overtime-dialog';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
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

interface AttendanceDayCell {
  id?: string;
  isPresent: boolean;
  isHoliday: boolean;
  overtimeHours: number;
}

interface AttendanceEmployeeRow {
  employeeId: string;
  fullName: string;
  baseSalary: number;
  type?: 'FIXED' | 'ROTATING';
  days: Record<string, AttendanceDayCell>;
}

interface AttendanceMonthResponse {
  shopId: string;
  year: number;
  month: number;
  daysInMonth: number;
  employees: AttendanceEmployeeRow[];
}

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

@Component({
  selector: 'app-attendance-page',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
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
      title="Asistencia · Servicio"
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
            <p class="today-panel__date">{{ quickDayLabel() }}</p>
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
              <button
                mat-stroked-button
                type="button"
                [disabled]="saving()"
                (click)="markAllHolidayToday()"
              >
                <mat-icon>star</mat-icon>
                Todos feriado
              </button>
            }
          </div>
        </div>
        @if (isQuickDayClosed()) {
          <p class="today-panel__closed">Franco del local. No se marca asistencia ese día.</p>
        } @else {
          <div class="today-panel__chips">
            @for (emp of employees(); track emp.employeeId) {
              <div
                class="today-chip-row"
                [class.today-chip-row--present]="isPresentToday(emp)"
                [class.today-chip-row--holiday]="isHolidayToday(emp)"
                [class.today-chip-row--rotating]="emp.type === 'ROTATING'"
              >
                <button
                  type="button"
                  class="today-chip"
                  [class.today-chip--present]="isPresentToday(emp)"
                  [class.today-chip--holiday]="isHolidayToday(emp)"
                  [class.today-chip--rotating]="emp.type === 'ROTATING'"
                  [disabled]="!canManage() || saving()"
                  [matTooltip]="emp.type === 'ROTATING' ? 'Rotativo: no entra en Todos presentes' : ''"
                  (click)="togglePresentToday(emp)"
                  (contextmenu)="toggleHolidayToday($event, emp)"
                  (pointerdown)="onPressStart($event, () => toggleHolidayToday($event, emp))"
                  (pointermove)="onPressMove($event)"
                  (pointerup)="onPressEnd()"
                  (pointerleave)="onPressEnd()"
                  (pointercancel)="onPressEnd()"
                >
                  <mat-icon>{{
                    isHolidayToday(emp)
                      ? 'star'
                      : isPresentToday(emp)
                        ? 'check_circle'
                        : 'radio_button_unchecked'
                  }}</mat-icon>
                  {{ emp.fullName }}
                </button>
                <label class="today-ot" [class.today-ot--disabled]="!canManage() || saving()">
                  <span>HS extra</span>
                  <input
                    type="number"
                    inputmode="decimal"
                    min="0"
                    step="0.5"
                    [disabled]="!canManage() || saving()"
                    [ngModel]="overtimeToday(emp)"
                    (ngModelChange)="onOvertimeTodayChange(emp, $event)"
                    (click)="$event.stopPropagation()"
                    aria-label="Horas extra de servicio"
                  />
                </label>
              </div>
            }
          </div>
        }
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
        message="Obteniendo asistencia del mes"
      />
    } @else if (!employees().length) {
      <div class="panel-card">No hay empleados activos para mostrar.</div>
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
                  <th class="att-table__name">Empleado</th>
                  @for (d of dayNumbers(); track d) {
                    <th
                      class="att-table__day"
                      [class.att-table__day--today]="isTodayColumn(d)"
                      [class.att-table__day--closed]="isClosedDay(d)"
                      [class.att-table__day--holiday]="isDayHoliday(d)"
                      [class.att-table__day--action]="canManage() && markingUnlocked() && !isClosedDay(d)"
                      [attr.data-day]="d"
                      [attr.title]="
                        isClosedDay(d)
                          ? 'Franco'
                          : isTodayColumn(d)
                            ? 'Hoy'
                            : canManage() && markingUnlocked()
                              ? 'Tocar para marcar/quitar feriado a todos'
                              : null
                      "
                      (click)="onDayHeaderClick(d)"
                    >
                      <span class="att-table__day-num">{{ d }}</span>
                      @if (isClosedDay(d)) {
                        <span class="att-table__day-label">Franco</span>
                      } @else if (isDayHoliday(d)) {
                        <span class="att-table__day-label att-table__day-label--holiday">Feriado</span>
                      } @else if (isTodayColumn(d)) {
                        <span class="att-table__day-label">Hoy</span>
                      }
                    </th>
                  }
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
                        <div class="att-cell-wrap">
                          <button
                            type="button"
                            class="att-cell"
                            [class.att-cell--present]="isPresent(emp, d)"
                            [class.att-cell--holiday]="isHoliday(emp, d)"
                            [class.att-cell--closed]="isClosedDay(d)"
                            [class.att-cell--today]="isTodayColumn(d)"
                            [class.att-cell--ot]="overtimeHours(emp, d) > 0"
                            [disabled]="!canManage() || saving() || isClosedDay(d) || !markingUnlocked()"
                            [matTooltip]="cellTooltip(emp, d)"
                            (click)="onCellClick(emp, d)"
                            (contextmenu)="toggleHoliday($event, emp, d)"
                            (pointerdown)="onPressStart($event, () => toggleHoliday($event, emp, d))"
                            (pointermove)="onPressMove($event)"
                            (pointerup)="onPressEnd()"
                            (pointerleave)="onPressEnd()"
                            (pointercancel)="onPressEnd()"
                          >
                            @if (isClosedDay(d)) {
                              <mat-icon class="att-cell__icon">hotel</mat-icon>
                            } @else if (isHoliday(emp, d)) {
                              <mat-icon class="att-cell__icon">star</mat-icon>
                            } @else if (isPresent(emp, d)) {
                              <mat-icon class="att-cell__icon">check</mat-icon>
                            }
                          </button>
                          @if (canManage() && !isClosedDay(d) && markingUnlocked()) {
                            <button
                              type="button"
                              class="att-ot-btn"
                              [class.att-ot-btn--set]="overtimeHours(emp, d) > 0"
                              [disabled]="saving()"
                              [matTooltip]="'Horas extra' + (overtimeHours(emp, d) > 0 ? ': ' + overtimeHours(emp, d) + 'h' : '')"
                              (click)="openOvertimeEditor($event, emp, d)"
                            >
                              @if (overtimeHours(emp, d) > 0) {
                                +{{ overtimeHours(emp, d) }}h
                              } @else {
                                hs
                              }
                            </button>
                          } @else if (overtimeHours(emp, d) > 0) {
                            <span class="att-ot-btn att-ot-btn--set att-ot-btn--ro"
                              >+{{ overtimeHours(emp, d) }}h</span
                            >
                          }
                        </div>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <p class="att-legend">
            <span class="att-legend__item">
              <span class="att-cell att-cell--present att-legend__swatch"></span> Presente
            </span>
            <span class="att-legend__item">
              <span class="att-cell att-cell--holiday att-legend__swatch"></span> Feriado
            </span>
            <span class="att-legend__item">
              <span class="att-cell att-cell--closed att-legend__swatch"></span> Franco
            </span>
            <span class="att-legend__item">
              <span class="att-legend__today-swatch"></span> Hoy
            </span>
            <span class="att-legend__hint">
              Tablero: Editar → marcar · Mantener: feriado · Encabezado del día: feriado a todos
            </span>
            <span class="att-legend__hint att-legend__hint--desk">
              En PC: click = presente · click derecho / encabezado = feriado · hs = horas extra
            </span>
          </p>
        </div>
      </div>
    }
  `,
  styles: [
    `
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
      /* Sin edición: no capturar touch en celdas/encabezados para poder scrollear */
      .att-table-wrap--locked .att-cell,
      .att-table-wrap--locked .att-ot-btn,
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
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--guy-primary, #1d65a0) 18%, #fff) 0%,
          color-mix(in srgb, var(--guy-primary, #1d65a0) 8%, #fff) 100%
        );
        border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 28%, var(--guy-border, #d7e0d9));
        border-bottom-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 45%, transparent);
        box-shadow: inset 0 -2px 0 var(--guy-primary, #1d65a0);
        color: var(--guy-primary, #1d65a0);
        font-weight: 700;
        vertical-align: middle;
        padding: 0.4rem 0.25rem 0.45rem;
        min-width: 2.6rem;
      }
      tbody td.att-table__day--today {
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 6%, #fff);
        border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 18%, var(--guy-border, #d7e0d9));
      }
      .att-table__day-num {
        display: block;
        font-size: 0.85rem;
        font-weight: 800;
        line-height: 1.15;
        letter-spacing: -0.02em;
      }
      .att-table__day-label {
        display: inline-block;
        margin-top: 0.2rem;
        padding: 0.12rem 0.4rem;
        border-radius: 999px;
        font-size: 0.55rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        line-height: 1;
        color: #fff;
        background: var(--guy-primary, #1d65a0);
      }
      .att-table__day-label--holiday {
        background: #e65100;
      }
      .att-table__day--holiday:not(.att-table__day--closed) .att-table__day-num {
        color: #e65100;
      }
      .att-table__day--action {
        cursor: pointer;
      }
      .att-table__day--action:hover {
        background: color-mix(in srgb, #e65100 10%, #fff);
      }
      .att-table__name {
        text-align: left;
        white-space: nowrap;
        width: 1%;
        max-width: max-content;
        padding-inline: 0.4rem;
        font-weight: 600;
        color: var(--guy-navy, #003366);
        position: sticky;
        left: 0;
        background: var(--guy-card, #fff);
        z-index: 1;
      }
      .att-cell {
        width: 2.35rem;
        height: 2.35rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 8px;
        background: linear-gradient(
          180deg,
          #fff 0%,
          color-mix(in srgb, var(--guy-border, #d7e0d9) 35%, #fff) 100%
        );
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          box-shadow 0.15s ease,
          transform 0.12s ease;
      }
      .att-cell:not(:disabled):hover {
        border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 40%, var(--guy-border, #d7e0d9));
        box-shadow: 0 1px 3px color-mix(in srgb, var(--guy-primary, #1d65a0) 18%, transparent);
        transform: translateY(-1px);
      }
      .att-cell:disabled {
        cursor: default;
        opacity: 0.75;
      }
      .att-cell--present {
        background: color-mix(in srgb, var(--guy-green, #2e7d32) 22%, #fff);
        border-color: color-mix(in srgb, var(--guy-green, #2e7d32) 70%, #fff);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--guy-green, #2e7d32) 25%, transparent);
      }
      .att-cell--present .att-cell__icon {
        color: var(--guy-green, #2e7d32);
      }
      .att-cell--holiday {
        background: color-mix(in srgb, #e65100 22%, #fff);
        border-color: color-mix(in srgb, #e65100 70%, #fff);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, #e65100 25%, transparent);
      }
      .att-cell--holiday .att-cell__icon {
        color: #e65100;
      }
      .att-cell--closed {
        background: color-mix(in srgb, #607d8b 16%, #fff);
        border-color: color-mix(in srgb, #607d8b 45%, #fff);
        cursor: default;
      }
      .att-cell--closed .att-cell__icon {
        color: #607d8b;
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
      }
      .att-table__day--closed {
        color: #607d8b;
      }
      .att-cell--today:not(.att-cell--present):not(.att-cell--holiday):not(.att-cell--closed) {
        border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 45%, var(--guy-border, #d7e0d9));
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 10%, #fff);
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--guy-primary, #1d65a0) 20%, transparent);
      }
      .att-cell--today.att-cell--present,
      .att-cell--today.att-cell--holiday {
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--guy-primary, #1d65a0) 22%, transparent);
      }
      .att-cell__icon {
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
      }
      .att-legend {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
        margin: 0.75rem 0 0;
        font-size: 0.8rem;
        color: var(--guy-muted, #5f6f76);
      }
      .att-legend__item {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }
      .att-legend__hint--desk {
        opacity: 0.85;
      }
      @media (max-width: 720px) {
        .att-legend__hint--desk {
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
      .att-legend__swatch {
        width: 1rem;
        height: 1rem;
      }
      .att-legend__today-swatch {
        width: 1rem;
        height: 1rem;
        border-radius: 4px;
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--guy-primary, #1d65a0) 18%, #fff),
          color-mix(in srgb, var(--guy-primary, #1d65a0) 8%, #fff)
        );
        box-shadow: inset 0 -2px 0 var(--guy-primary, #1d65a0);
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
      .today-chip-row {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: #fff;
        border-radius: 999px;
        padding-right: 0.35rem;
      }
      .today-chip-row--present {
        background: color-mix(in srgb, var(--guy-green, #2e7d32) 12%, transparent);
        border-color: var(--guy-green, #2e7d32);
      }
      .today-chip-row--holiday {
        background: color-mix(in srgb, #e65100 12%, transparent);
        border-color: #e65100;
      }
      .today-chip-row--rotating:not(.today-chip-row--present):not(.today-chip-row--holiday) {
        border-style: dashed;
        opacity: 0.92;
      }
      .today-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        border: 0;
        background: transparent;
        border-radius: 999px;
        padding: 0.55rem 0.65rem 0.55rem 0.85rem;
        min-height: 44px;
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
      .today-chip--holiday {
        color: #e65100;
      }
      .today-chip:disabled {
        opacity: 0.7;
        cursor: default;
      }
      .today-ot {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--guy-muted, #5f6f76);
        padding-right: 0.2rem;
      }
      .today-ot input {
        width: 3.1rem;
        min-height: 36px;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 8px;
        padding: 0.2rem 0.3rem;
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
        background: #fff;
      }
      .today-ot--disabled {
        opacity: 0.65;
      }
      .att-cell-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.28rem;
        min-width: 2.6rem;
        padding: 0.15rem 0;
      }
      .att-ot-btn {
        border: 0;
        background: color-mix(in srgb, var(--guy-muted, #5f6f76) 10%, #fff);
        color: var(--guy-muted, #5f6f76);
        border-radius: 6px;
        font-size: 0.58rem;
        font-weight: 800;
        letter-spacing: 0.02em;
        padding: 0.2rem 0.35rem;
        min-height: 28px;
        line-height: 1.2;
        cursor: pointer;
        text-transform: lowercase;
        touch-action: manipulation;
      }
      .att-ot-btn--set {
        background: color-mix(in srgb, #ef6c00 18%, #fff);
        color: #e65100;
      }
      .att-ot-btn--ro {
        cursor: default;
      }
      .att-ot-btn:disabled {
        opacity: 0.6;
        cursor: default;
      }
    `,
  ],
})
export class AttendancePage {
  private readonly filtersUi = createFiltersCollapsed('attendance');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  readonly shops = inject(ShopContextService);

  readonly shopId = this.shops.selectedShopId;
  private readonly tableWrap = viewChild<ElementRef<HTMLElement>>('tableWrap');
  readonly months = MONTH_LABELS.map((label, idx) => ({ value: idx + 1, label }));
  readonly years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 3 + i);

  private shopTodayParts() {
    return zonedDateParts(new Date(), this.shops.selectedShop()?.timezone);
  }

  readonly todayParts = computed(() => this.shopTodayParts());
  readonly todayIso = computed(() =>
    resolveShopCalendarDate(new Date(), { timezone: this.shops.selectedShop()?.timezone }),
  );
  readonly todayDay = computed(() => this.todayParts().day);
  readonly todayYear = computed(() => this.todayParts().year);
  readonly todayMonth = computed(() => this.todayParts().month);

  readonly year = signal(this.shopTodayParts().year);
  readonly month = signal(this.shopTodayParts().month);
  readonly data = signal<AttendanceMonthResponse | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly exporting = signal(false);
  readonly sharing = signal(false);
  /**
   * Solo el tablero del mes: siempre bloqueado por defecto.
   * La sección Hoy no usa este candado.
   */
  readonly markingUnlocked = signal(false);
  /** Evita que respuestas viejas pisen datos más nuevos al cambiar mes/refresco. */
  private monthLoadSeq = 0;
  private todayLoadSeq = 0;
  private lastSyncedShopId: string | null = null;
  /** Estado del panel rápido (día seleccionado). */
  readonly todayMarks = signal<
    Record<string, { isPresent: boolean; isHoliday: boolean; overtimeHours: number }>
  >({});
  /** Día seleccionado en el panel rápido (por defecto hoy). */
  readonly quickDayIso = signal(
    resolveShopCalendarDate(new Date(), { timezone: undefined }),
  );
  private overtimeSaveTimers = new Map<string, number>();

  readonly employees = computed(() => this.data()?.employees ?? []);
  readonly dayNumbers = computed(() =>
    Array.from({ length: this.data()?.daysInMonth ?? 0 }, (_, i) => i + 1),
  );

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
    this.quickDayIso.set(this.toIsoDate(dt));
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
    const byId = new Map<string, AttendanceEmployeeRow>();
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
      kind: 'servicio',
      days: dates.map((iso) => ({
        dateLabel: formatIsoShareLabel(iso),
        employees: employees.map((emp) => {
          const cell =
            iso === quick
              ? marks[emp.employeeId] ?? emp.days[iso]
              : emp.days[iso];
          return {
            fullName: emp.fullName,
            present: !!cell?.isPresent,
            holiday: !!cell?.isHoliday,
          };
        }),
      })),
    });
  }

  private async loadMonthsForRange(
    shopId: string,
    fromIso: string,
    toIso: string,
  ): Promise<AttendanceMonthResponse[]> {
    const keys = monthKeysInRange(fromIso, toIso);
    return Promise.all(
      keys.map((key) => {
        if (this.year() === key.year && this.month() === key.month && this.data()) {
          return Promise.resolve(this.data()!);
        }
        return firstValueFrom(
          this.http.get<AttendanceMonthResponse>(`${environment.apiUrl}/shops/${shopId}/attendance`, {
            params: {
              year: String(key.year),
              month: String(key.month),
              _: String(Date.now()),
            },
            headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
          }),
        );
      }),
    );
  }

  constructor() {
    usePageRefresh(async () => {
      await Promise.all([this.reload(), this.loadTodayMarks()]);
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
        return;
      }
      void this.reload();
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
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'attendance.manage');
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

  isHolidayToday(emp: AttendanceEmployeeRow): boolean {
    return !!this.todayMarks()[emp.employeeId]?.isHoliday;
  }

  isDayHoliday(day: number): boolean {
    if (this.isClosedDay(day)) return false;
    return this.employees().some((e) => this.isHoliday(e, day));
  }

  isTodayHolidayDay(): boolean {
    return Object.values(this.todayMarks()).some((m) => m.isHoliday);
  }

  exportExcel(): void {
    const shopId = this.shopId();
    const shop = this.shops.selectedShop();
    if (!shopId || this.exporting()) return;
    const year = this.year();
    const month = this.month();
    this.exporting.set(true);
    this.http
      .get(`${environment.apiUrl}/shops/${shopId}/attendance/export.xlsx`, {
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
          a.download = `presentismo-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${year}-${monthPad}.xlsx`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => {
          this.exporting.set(false);
          this.snack.open('No se pudo descargar el Excel', 'OK', { duration: 3000 });
        },
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

  private scrollMatrixToToday(attempt = 0): void {
    if (!this.isTodayColumn(this.todayDay())) return;
    const wrap = this.tableWrap()?.nativeElement;
    const todayHeader = wrap?.querySelector<HTMLElement>(
      `.att-table__day[data-day="${this.todayDay()}"]`,
    );
    if (!wrap || !todayHeader) {
      if (attempt < 12) {
        requestAnimationFrame(() => this.scrollMatrixToToday(attempt + 1));
      }
      return;
    }
    const wrapRect = wrap.getBoundingClientRect();
    const dayRect = todayHeader.getBoundingClientRect();
    const delta =
      dayRect.left - wrapRect.left - wrapRect.width / 2 + dayRect.width / 2;
    wrap.scrollBy({ left: delta, behavior: attempt === 0 ? 'auto' : 'smooth' });
  }

  isPresentToday(emp: AttendanceEmployeeRow): boolean {
    return !!this.todayMarks()[emp.employeeId]?.isPresent;
  }

  togglePresentToday(emp: AttendanceEmployeeRow): void {
    if (!this.canManage() || this.isQuickDayClosed()) return;
    if (this.consumeLongPressClick()) return;
    const cur = this.todayMarks()[emp.employeeId] ?? {
      isPresent: false,
      isHoliday: false,
      overtimeHours: 0,
    };
    const nextPresent = !cur.isPresent;
    const patch: { isPresent: boolean; isHoliday?: boolean } = { isPresent: nextPresent };
    if (nextPresent && (cur.isHoliday || this.isTodayHolidayDay())) {
      patch.isHoliday = true;
    }
    this.upsertToday(emp, patch);
  }

  toggleHolidayToday(event: Event, emp: AttendanceEmployeeRow): void {
    event.preventDefault();
    this.clearPressTimer();
    if (!this.canManage() || this.isQuickDayClosed()) return;
    const cur = this.todayMarks()[emp.employeeId] ?? {
      isPresent: false,
      isHoliday: false,
      overtimeHours: 0,
    };
    this.upsertToday(emp, { isHoliday: !cur.isHoliday });
  }

  markAllPresentToday(): void {
    const shopId = this.shopId();
    if (!shopId || !this.canManage() || this.isQuickDayClosed()) return;
    const fixed = this.employees().filter((e) => e.type !== 'ROTATING');
    const holiday = this.isTodayHolidayDay();
    const date = this.quickDayIso();
    const items = fixed.map((e) => ({
      employeeId: e.employeeId,
      date,
      isPresent: true,
      ...(holiday ? { isHoliday: true } : {}),
    }));
    if (!items.length) {
      this.snack.open('No hay empleados fijos para marcar', 'OK', { duration: 2500 });
      return;
    }
    this.saving.set(true);
    this.http
      .post(`${environment.apiUrl}/shops/${shopId}/attendance/bulk`, { items })
      .subscribe({
        next: () => {
          this.saving.set(false);
          const next = { ...this.todayMarks() };
          for (const e of fixed) {
            next[e.employeeId] = {
              isPresent: true,
              isHoliday: holiday ? true : (next[e.employeeId]?.isHoliday ?? false),
              overtimeHours: next[e.employeeId]?.overtimeHours ?? 0,
            };
          }
          this.todayMarks.set(next);
          this.syncBoardFromQuickDay(date);
          const skipped = this.employees().length - fixed.length;
          this.snack.open(
            skipped
              ? `Fijos marcados presentes (${skipped} rotativo${skipped === 1 ? '' : 's'} omitido${skipped === 1 ? '' : 's'})`
              : holiday
                ? 'Todos presentes (feriado)'
                : 'Todos marcados presentes',
            'OK',
            { duration: 2500 },
          );
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudo marcar el presentismo';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  markAllHolidayToday(): void {
    const shopId = this.shopId();
    if (!shopId || !this.canManage() || this.isQuickDayClosed()) return;
    const emps = this.employees();
    if (!emps.length) return;
    const allHoliday = emps.every((e) => this.isHolidayToday(e));
    const nextHoliday = !allHoliday;
    const date = this.quickDayIso();
    const items = emps.map((e) => ({
      employeeId: e.employeeId,
      date,
      isHoliday: nextHoliday,
    }));
    this.saving.set(true);
    this.http
      .post(`${environment.apiUrl}/shops/${shopId}/attendance/bulk`, { items })
      .subscribe({
        next: () => {
          this.saving.set(false);
          const next = { ...this.todayMarks() };
          for (const e of emps) {
            next[e.employeeId] = {
              isPresent: next[e.employeeId]?.isPresent ?? false,
              isHoliday: nextHoliday,
              overtimeHours: next[e.employeeId]?.overtimeHours ?? 0,
            };
          }
          this.todayMarks.set(next);
          this.syncBoardFromQuickDay(date);
          this.snack.open(
            nextHoliday ? 'Todos marcados feriado' : 'Feriado quitado a todos',
            'OK',
            { duration: 2500 },
          );
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudo marcar el feriado';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  onDayHeaderClick(day: number): void {
    if (!this.canManage() || !this.markingUnlocked() || this.isClosedDay(day) || this.saving()) {
      return;
    }
    this.markHolidayForDay(day);
  }

  markHolidayForDay(day: number): void {
    const shopId = this.shopId();
    if (!shopId) return;
    const emps = this.employees();
    if (!emps.length) return;
    const allHoliday = emps.every((e) => this.isHoliday(e, day));
    const nextHoliday = !allHoliday;
    if (
      !this.confirmBoardSave(
        nextHoliday
          ? `Marcar feriado el día ${day} para todos`
          : `Quitar feriado el día ${day} a todos`,
      )
    ) {
      return;
    }
    const date = this.dateFor(day);
    const items = emps.map((e) => ({
      employeeId: e.employeeId,
      date,
      isHoliday: nextHoliday,
    }));
    this.saving.set(true);
    this.http
      .post(`${environment.apiUrl}/shops/${shopId}/attendance/bulk`, { items })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.data.update((current) => {
            if (!current) return current;
            return {
              ...current,
              employees: current.employees.map((e) => {
                const prev = e.days[date] ?? {
                  isPresent: false,
                  isHoliday: false,
                  overtimeHours: 0,
                };
                return {
                  ...e,
                  days: {
                    ...e.days,
                    [date]: { ...prev, isHoliday: nextHoliday },
                  },
                };
              }),
            };
          });
          if (date === this.quickDayIso()) {
            const next = { ...this.todayMarks() };
            for (const e of emps) {
              next[e.employeeId] = {
                isPresent: next[e.employeeId]?.isPresent ?? false,
                isHoliday: nextHoliday,
                overtimeHours: next[e.employeeId]?.overtimeHours ?? 0,
              };
            }
            this.todayMarks.set(next);
          }
          this.snack.open(
            nextHoliday
              ? `Feriado marcado el día ${day} para todos`
              : `Feriado quitado el día ${day}`,
            'OK',
            { duration: 2500 },
          );
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudo marcar el feriado';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  private loadTodayMarks(): Promise<void> {
    const shopId = this.shopId();
    if (!shopId) return Promise.resolve();
    const iso = this.quickDayIso();
    const [y, m] = iso.split('-').map(Number);
    if (!y || !m) return Promise.resolve();
    const seq = ++this.todayLoadSeq;
    return firstValueFrom(
      this.http.get<AttendanceMonthResponse>(`${environment.apiUrl}/shops/${shopId}/attendance`, {
        params: {
          year: String(y),
          month: String(m),
          _: String(Date.now()),
        },
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      }),
    )
      .then((data) => {
        if (seq !== this.todayLoadSeq) return;
        const marks: Record<
          string,
          { isPresent: boolean; isHoliday: boolean; overtimeHours: number }
        > = {};
        for (const e of data.employees ?? []) {
          const cell = e.days[iso];
          marks[e.employeeId] = {
            isPresent: !!cell?.isPresent,
            isHoliday: !!cell?.isHoliday,
            overtimeHours: Number(cell?.overtimeHours ?? 0),
          };
        }
        this.todayMarks.set(marks);
      })
      .catch(() => {
        if (seq !== this.todayLoadSeq) return;
        this.todayMarks.set({});
      });
  }

  private upsertToday(
    emp: AttendanceEmployeeRow,
    patch: { isPresent?: boolean; isHoliday?: boolean; overtimeHours?: number },
  ): void {
    const shopId = this.shopId();
    if (!shopId || this.isQuickDayClosed()) return;
    const date = this.quickDayIso();
    this.saving.set(true);
    this.http
      .post<{ isPresent: boolean; isHoliday: boolean; overtimeHours: number }>(
        `${environment.apiUrl}/shops/${shopId}/attendance`,
        {
          employeeId: emp.employeeId,
          date,
          ...patch,
        },
      )
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          this.todayMarks.update((m) => ({
            ...m,
            [emp.employeeId]: {
              isPresent: !!result.isPresent,
              isHoliday: !!result.isHoliday,
              overtimeHours: Number(result.overtimeHours ?? 0),
            },
          }));
          this.patchBoardDay(emp.employeeId, date, {
            isPresent: !!result.isPresent,
            isHoliday: !!result.isHoliday,
            overtimeHours: result.overtimeHours ?? 0,
          });
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar la asistencia';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  private syncBoardFromQuickDay(date: string): void {
    const [y, m] = date.split('-').map(Number);
    if (this.year() === y && this.month() === m) {
      void this.reload();
    }
  }

  private patchBoardDay(
    employeeId: string,
    date: string,
    cell: AttendanceDayCell,
  ): void {
    const [y, m] = date.split('-').map(Number);
    if (this.year() !== y || this.month() !== m) return;
    this.data.update((current) => {
      if (!current) return current;
      return {
        ...current,
        employees: current.employees.map((e) =>
          e.employeeId === employeeId
            ? { ...e, days: { ...e.days, [date]: cell } }
            : e,
        ),
      };
    });
  }

  private toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  openExcelImport(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.dialogTitle
      .track(
        this.dialog.open(AttendanceExcelImportDialogComponent, {
          width: '820px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            shopId,
            shopName: this.shops.selectedShop()?.name ?? 'Local',
          },
        }),
        'Importar presentismo',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) {
          void this.reload();
          void this.loadTodayMarks();
        }
      });
  }

  onMonthChange(value: number): void {
    this.month.set(value);
  }

  onYearChange(value: number): void {
    this.year.set(value);
  }

  reload(): Promise<void> {
    const shopId = this.shopId();
    if (!shopId) {
      this.loading.set(false);
      return Promise.resolve();
    }
    const seq = ++this.monthLoadSeq;
    const year = this.year();
    const month = this.month();
    this.loading.set(true);
    return firstValueFrom(
      this.http.get<AttendanceMonthResponse>(`${environment.apiUrl}/shops/${shopId}/attendance`, {
        params: {
          year: String(year),
          month: String(month),
          _: String(Date.now()),
        },
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      }),
    )
      .then((data) => {
        if (seq !== this.monthLoadSeq) return;
        this.data.set(data);
        this.loading.set(false);
        this.scrollMatrixToToday();
      })
      .catch(() => {
        if (seq !== this.monthLoadSeq) return;
        this.loading.set(false);
        this.snack.open('No se pudo cargar la asistencia', 'OK', { duration: 3000 });
      });
  }

  private dateFor(day: number): string {
    return `${this.year()}-${String(this.month()).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private cellFor(emp: AttendanceEmployeeRow, day: number): AttendanceDayCell {
    return emp.days[this.dateFor(day)] ?? { isPresent: false, isHoliday: false, overtimeHours: 0 };
  }

  isPresent(emp: AttendanceEmployeeRow, day: number): boolean {
    return this.cellFor(emp, day).isPresent;
  }

  isHoliday(emp: AttendanceEmployeeRow, day: number): boolean {
    return this.cellFor(emp, day).isHoliday;
  }

  overtimeHours(emp: AttendanceEmployeeRow, day: number): number {
    return Number(this.cellFor(emp, day).overtimeHours ?? 0);
  }

  overtimeToday(emp: AttendanceEmployeeRow): number {
    const mark = this.todayMarks()[emp.employeeId];
    if (mark) return Number(mark.overtimeHours ?? 0);
    const iso = this.quickDayIso();
    const [y, m, d] = iso.split('-').map(Number);
    if (this.year() === y && this.month() === m && d) {
      return this.overtimeHours(emp, d);
    }
    return 0;
  }

  onOvertimeTodayChange(emp: AttendanceEmployeeRow, raw: number | string): void {
    if (!this.canManage() || this.isQuickDayClosed()) return;
    const n = Number(raw);
    const hours = Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
    this.todayMarks.update((m) => ({
      ...m,
      [emp.employeeId]: {
        isPresent: !!m[emp.employeeId]?.isPresent,
        isHoliday: !!m[emp.employeeId]?.isHoliday,
        overtimeHours: hours,
      },
    }));
    const prev = this.overtimeSaveTimers.get(emp.employeeId);
    if (prev != null) window.clearTimeout(prev);
    const timer = window.setTimeout(() => {
      this.overtimeSaveTimers.delete(emp.employeeId);
      this.upsertToday(emp, { overtimeHours: hours });
    }, 450);
    this.overtimeSaveTimers.set(emp.employeeId, timer);
  }

  openOvertimeEditor(event: Event, emp: AttendanceEmployeeRow, day: number): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.canManage() || this.isClosedDay(day) || this.saving()) return;
    const current = this.overtimeHours(emp, day);
    this.dialogTitle
      .track(
        this.dialog.open(AttendanceOvertimeDialogComponent, {
          width: '360px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            employeeName: emp.fullName,
            dateLabel: this.dateFor(day),
            overtimeHours: current,
          },
        }),
        'Horas extra',
      )
      .afterClosed()
      .subscribe((hours) => {
        if (hours == null || hours === current) return;
        if (
          !this.confirmBoardSave(
            `Horas extra de ${emp.fullName} el ${this.dateFor(day)}: ${hours}h`,
          )
        ) {
          return;
        }
        this.upsert(emp, day, { overtimeHours: hours }, true);
      });
  }

  isClosedDay(day: number): boolean {
    const closed = this.shops.selectedShop()?.closedWeekdays ?? [];
    if (!closed.length) return false;
    const d = new Date(this.year(), this.month() - 1, day);
    return closed.includes(d.getDay());
  }

  cellTooltip(emp: AttendanceEmployeeRow, day: number): string {
    if (this.isClosedDay(day)) return 'Franco del local';
    if (!this.markingUnlocked()) return 'Activá Editar tablero para marcar celdas';
    const cell = this.cellFor(emp, day);
    const parts = [cell.isPresent ? 'Presente' : 'Ausente'];
    if (cell.isHoliday) parts.push('Feriado');
    if (Number(cell.overtimeHours) > 0) parts.push(`${cell.overtimeHours} hs extra`);
    parts.push('Toque: presente · Mantener: feriado · Encabezado: feriado a todos');
    return parts.join(' · ');
  }

  onCellClick(emp: AttendanceEmployeeRow, day: number): void {
    if (this.consumeLongPressClick()) return;
    this.togglePresent(emp, day);
  }

  onPressStart(event: PointerEvent, onLongPress: () => void): void {
    if (!this.canManage() || !this.markingUnlocked()) return;
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
    }, 550);
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

  togglePresent(emp: AttendanceEmployeeRow, day: number): void {
    if (!this.canManage() || this.isClosedDay(day) || !this.markingUnlocked()) return;
    const cell = this.cellFor(emp, day);
    const nextPresent = !cell.isPresent;
    const patch: { isPresent: boolean; isHoliday?: boolean } = { isPresent: nextPresent };
    if (nextPresent && (cell.isHoliday || this.isDayHoliday(day))) {
      patch.isHoliday = true;
    }
    const label = nextPresent ? 'presente' : 'ausente';
    if (
      !this.confirmBoardSave(
        `${emp.fullName} · día ${day}: marcar ${label}${patch.isHoliday ? ' (feriado)' : ''}`,
      )
    ) {
      return;
    }
    this.upsert(emp, day, patch, true);
  }

  toggleHoliday(event: Event, emp: AttendanceEmployeeRow, day: number): void {
    event.preventDefault();
    this.clearPressTimer();
    if (!this.canManage() || this.isClosedDay(day) || !this.markingUnlocked()) return;
    const cell = this.cellFor(emp, day);
    const next = !cell.isHoliday;
    if (
      !this.confirmBoardSave(
        `${emp.fullName} · día ${day}: ${next ? 'marcar feriado' : 'quitar feriado'}`,
      )
    ) {
      return;
    }
    this.upsert(emp, day, { isHoliday: next }, true);
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

  private upsert(
    emp: AttendanceEmployeeRow,
    day: number,
    patch: { isPresent?: boolean; isHoliday?: boolean; overtimeHours?: number },
    alreadyConfirmed = false,
  ): void {
    const shopId = this.shopId();
    if (!shopId) return;
    if (!alreadyConfirmed && !this.confirmBoardSave(`${emp.fullName} · día ${day}`)) return;
    const date = this.dateFor(day);
    this.saving.set(true);
    this.http
      .post<AttendanceDayCell>(`${environment.apiUrl}/shops/${shopId}/attendance`, {
        employeeId: emp.employeeId,
        date,
        ...patch,
      })
      .subscribe({
        next: (result) => {
          this.saving.set(false);
          this.data.update((current) => {
            if (!current) return current;
            return {
              ...current,
              employees: current.employees.map((e) =>
                e.employeeId === emp.employeeId
                  ? { ...e, days: { ...e.days, [date]: result } }
                  : e,
              ),
            };
          });
          if (date === this.quickDayIso()) {
            this.todayMarks.update((m) => ({
              ...m,
              [emp.employeeId]: {
                isPresent: !!result.isPresent,
                isHoliday: !!result.isHoliday,
                overtimeHours: Number(result.overtimeHours ?? m[emp.employeeId]?.overtimeHours ?? 0),
              },
            }));
          }
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar la asistencia';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }
}
