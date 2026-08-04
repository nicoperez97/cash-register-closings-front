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
import { AttendanceExcelImportDialogComponent } from './attendance-excel-import-dialog';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { attendanceDaySharePayload } from '../../shared/utils/attendance-share';
import { shareText } from '../../shared/utils/share-text';

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
    MatIconModule,
    MatTooltipModule,
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule,
    PageHeaderComponent,
    FiltersCollapseBtnComponent,
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
            <h2 class="today-panel__title">Hoy</h2>
            <p class="today-panel__date">{{ todayLabel() }}</p>
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
            @if (canManage()) {
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
        <div class="today-panel__chips">
          @for (emp of employees(); track emp.employeeId) {
            <button
              type="button"
              class="today-chip"
              [class.today-chip--present]="isPresentToday(emp)"
              [class.today-chip--rotating]="emp.type === 'ROTATING'"
              [disabled]="!canManage() || saving()"
              [matTooltip]="emp.type === 'ROTATING' ? 'Rotativo: no entra en Todos presentes' : ''"
              (click)="togglePresentToday(emp)"
            >
              <mat-icon>{{ isPresentToday(emp) ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
              {{ emp.fullName }}
            </button>
          }
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
    } @else if (!employees().length) {
      <div class="panel-card">No hay empleados activos para mostrar.</div>
    } @else {
      <div class="panel-card panel-card--flush">
        <div class="panel-card__body">
          <div class="att-table-wrap" #tableWrap>
            <table class="att-table">
              <thead>
                <tr>
                  <th class="att-table__name">Empleado</th>
                  @for (d of dayNumbers(); track d) {
                    <th
                      class="att-table__day"
                      [class.att-table__day--today]="isTodayColumn(d)"
                      [class.att-table__day--closed]="isClosedDay(d)"
                      [attr.data-day]="d"
                      [attr.title]="isClosedDay(d) ? 'Franco' : isTodayColumn(d) ? 'Hoy' : null"
                    >
                      <span class="att-table__day-num">{{ d }}</span>
                      @if (isClosedDay(d)) {
                        <span class="att-table__day-label">Franco</span>
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
                        <button
                          type="button"
                          class="att-cell"
                          [class.att-cell--present]="isPresent(emp, d)"
                          [class.att-cell--holiday]="isHoliday(emp, d)"
                          [class.att-cell--closed]="isClosedDay(d)"
                          [class.att-cell--today]="isTodayColumn(d)"
                          [disabled]="!canManage() || saving() || isClosedDay(d)"
                          [matTooltip]="cellTooltip(emp, d)"
                          (click)="onCellClick(emp, d)"
                          (contextmenu)="toggleHoliday($event, emp, d)"
                          (pointerdown)="onPressStart($event, () => toggleHoliday($event, emp, d))"
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
              Toque: presente/ausente · Mantener pulsado: feriado
            </span>
            <span class="att-legend__hint att-legend__hint--desk">
              En PC: click derecho también marca feriado
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
        scroll-behavior: smooth;
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
        width: 1.9rem;
        height: 1.9rem;
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
      .today-chip--present {
        background: color-mix(in srgb, var(--guy-green, #2e7d32) 18%, transparent);
        border-color: var(--guy-green, #2e7d32);
      }
      .today-chip--rotating:not(.today-chip--present) {
        border-style: dashed;
        opacity: 0.92;
      }
      .today-chip:disabled {
        opacity: 0.7;
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

  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);
  readonly data = signal<AttendanceMonthResponse | null>(null);
  readonly saving = signal(false);
  readonly exporting = signal(false);
  readonly sharing = signal(false);
  /** Evita que respuestas viejas pisen datos más nuevos al cambiar mes/refresco. */
  private monthLoadSeq = 0;
  private todayLoadSeq = 0;
  /** Estado rápido de hoy (independiente del mes en pantalla). */
  readonly todayMarks = signal<Record<string, { isPresent: boolean; isHoliday: boolean }>>({});

  readonly employees = computed(() => this.data()?.employees ?? []);
  readonly dayNumbers = computed(() =>
    Array.from({ length: this.data()?.daysInMonth ?? 0 }, (_, i) => i + 1),
  );

  readonly todayIso = this.toIsoDate(new Date());
  readonly todayDay = new Date().getDate();
  readonly todayYear = new Date().getFullYear();
  readonly todayMonth = new Date().getMonth() + 1;

  todayLabel(): string {
    return new Date().toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  async shareToday(): Promise<void> {
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    const marks = this.todayMarks();
    const payload = attendanceDaySharePayload({
      shopName,
      dateLabel: this.todayLabel(),
      kind: 'servicio',
      employees: this.employees().map((emp) => {
        const m = marks[emp.employeeId];
        return {
          fullName: emp.fullName,
          present: !!m?.isPresent,
          holiday: !!m?.isHoliday,
        };
      }),
    });
    this.sharing.set(true);
    const result = await shareText(payload);
    this.sharing.set(false);
    if (result === 'copied') {
      this.snack.open('Presentismo copiado al portapapeles', 'OK', { duration: 2200 });
    } else if (result === 'failed') {
      this.snack.open('No se pudo compartir', 'OK', { duration: 3000 });
    }
  }

  constructor() {
    usePageRefresh(async () => {
      await Promise.all([this.reload(), this.loadTodayMarks()]);
    });
    effect(() => {
      const shopId = this.shopId();
      this.year();
      this.month();
      if (!shopId) {
        this.data.set(null);
        this.todayMarks.set({});
        return;
      }
      void this.reload();
      void this.loadTodayMarks();
    });
  }

  canManage(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'attendance.manage');
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
    this.year.set(this.todayYear);
    this.month.set(this.todayMonth);
  }

  isTodayColumn(day: number): boolean {
    return (
      this.year() === this.todayYear &&
      this.month() === this.todayMonth &&
      day === this.todayDay
    );
  }

  private scrollMatrixToToday(attempt = 0): void {
    if (!this.isTodayColumn(this.todayDay)) return;
    const wrap = this.tableWrap()?.nativeElement;
    const todayHeader = wrap?.querySelector<HTMLElement>(
      `.att-table__day[data-day="${this.todayDay}"]`,
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
    if (!this.canManage()) return;
    const cur = this.todayMarks()[emp.employeeId] ?? {
      isPresent: false,
      isHoliday: false,
    };
    this.upsertToday(emp, { isPresent: !cur.isPresent });
  }

  markAllPresentToday(): void {
    const shopId = this.shopId();
    if (!shopId || !this.canManage()) return;
    const fixed = this.employees().filter((e) => e.type !== 'ROTATING');
    const items = fixed.map((e) => ({
      employeeId: e.employeeId,
      date: this.todayIso,
      isPresent: true,
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
              isHoliday: next[e.employeeId]?.isHoliday ?? false,
            };
          }
          this.todayMarks.set(next);
          if (this.year() === this.todayYear && this.month() === this.todayMonth) {
            void this.reload();
          }
          const skipped = this.employees().length - fixed.length;
          this.snack.open(
            skipped
              ? `Fijos marcados presentes (${skipped} rotativo${skipped === 1 ? '' : 's'} omitido${skipped === 1 ? '' : 's'})`
              : 'Todos marcados presentes hoy',
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

  private loadTodayMarks(): Promise<void> {
    const shopId = this.shopId();
    if (!shopId) return Promise.resolve();
    const seq = ++this.todayLoadSeq;
    return firstValueFrom(
      this.http.get<AttendanceMonthResponse>(`${environment.apiUrl}/shops/${shopId}/attendance`, {
        params: {
          year: String(this.todayYear),
          month: String(this.todayMonth),
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
        const marks: Record<string, { isPresent: boolean; isHoliday: boolean }> = {};
        for (const e of data.employees ?? []) {
          const cell = e.days[this.todayIso];
          marks[e.employeeId] = {
            isPresent: !!cell?.isPresent,
            isHoliday: !!cell?.isHoliday,
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
    patch: { isPresent?: boolean; isHoliday?: boolean },
  ): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.saving.set(true);
    this.http
      .post<{ isPresent: boolean; isHoliday: boolean; overtimeHours: number }>(
        `${environment.apiUrl}/shops/${shopId}/attendance`,
        {
          employeeId: emp.employeeId,
          date: this.todayIso,
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
            },
          }));
          if (this.year() === this.todayYear && this.month() === this.todayMonth) {
            this.data.update((current) => {
              if (!current) return current;
              return {
                ...current,
                employees: current.employees.map((e) =>
                  e.employeeId === emp.employeeId
                    ? {
                        ...e,
                        days: {
                          ...e.days,
                          [this.todayIso]: {
                            isPresent: !!result.isPresent,
                            isHoliday: !!result.isHoliday,
                            overtimeHours: result.overtimeHours ?? 0,
                          },
                        },
                      }
                    : e,
                ),
              };
            });
          }
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar la asistencia';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
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
    if (!shopId) return Promise.resolve();
    const seq = ++this.monthLoadSeq;
    const year = this.year();
    const month = this.month();
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
        this.scrollMatrixToToday();
      })
      .catch(() => {
        if (seq !== this.monthLoadSeq) return;
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

  isClosedDay(day: number): boolean {
    const closed = this.shops.selectedShop()?.closedWeekdays ?? [];
    if (!closed.length) return false;
    const d = new Date(this.year(), this.month() - 1, day);
    return closed.includes(d.getDay());
  }

  cellTooltip(emp: AttendanceEmployeeRow, day: number): string {
    if (this.isClosedDay(day)) return 'Franco del local';
    const cell = this.cellFor(emp, day);
    const parts = [cell.isPresent ? 'Presente' : 'Ausente'];
    if (cell.isHoliday) parts.push('Feriado');
    parts.push('Toque: presente · Mantener: feriado');
    return parts.join(' · ');
  }

  onCellClick(emp: AttendanceEmployeeRow, day: number): void {
    if (this.consumeLongPressClick()) return;
    this.togglePresent(emp, day);
  }

  onPressStart(event: PointerEvent, onLongPress: () => void): void {
    if (!this.canManage()) return;
    if (event.pointerType === 'mouse') return;
    this.clearPressTimer();
    this.pressTimer = window.setTimeout(() => {
      this.pressTimer = null;
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

  onPressEnd(): void {
    this.clearPressTimer();
  }

  togglePresent(emp: AttendanceEmployeeRow, day: number): void {
    if (!this.canManage() || this.isClosedDay(day)) return;
    const cell = this.cellFor(emp, day);
    this.upsert(emp, day, { isPresent: !cell.isPresent });
  }

  toggleHoliday(event: Event, emp: AttendanceEmployeeRow, day: number): void {
    event.preventDefault();
    this.clearPressTimer();
    if (!this.canManage() || this.isClosedDay(day)) return;
    const cell = this.cellFor(emp, day);
    this.upsert(emp, day, { isHoliday: !cell.isHoliday });
  }

  private pressTimer: number | null = null;
  private skipNextClick = false;

  private clearPressTimer(): void {
    if (this.pressTimer != null) {
      window.clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }

  private consumeLongPressClick(): boolean {
    if (!this.skipNextClick) return false;
    this.skipNextClick = false;
    return true;
  }

  private upsert(
    emp: AttendanceEmployeeRow,
    day: number,
    patch: { isPresent?: boolean; isHoliday?: boolean },
  ): void {
    const shopId = this.shopId();
    if (!shopId) return;
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
          if (date === this.todayIso) {
            this.todayMarks.update((m) => ({
              ...m,
              [emp.employeeId]: {
                isPresent: !!result.isPresent,
                isHoliday: !!result.isHoliday,
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
