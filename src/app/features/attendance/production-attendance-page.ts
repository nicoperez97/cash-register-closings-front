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
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { ProductionAttendanceExcelImportDialogComponent } from './production-attendance-excel-import-dialog';
import { attendanceDaySharePayload } from '../../shared/utils/attendance-share';
import { shareText } from '../../shared/utils/share-text';

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

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function localIsoDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
            <h2 class="today-panel__title">Hoy</h2>
            <p class="today-panel__date">
              {{ todayLabel() }} · Default {{ defaultHours() }} h
            </p>
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
              [class.today-chip--present]="hoursToday(emp) > 0"
              [disabled]="!canManage() || saving()"
              [matTooltip]="chipHint(emp)"
              (click)="onChipClick(emp)"
              (contextmenu)="editHoursToday($event, emp)"
              (pointerdown)="onPressStart($event, () => editHoursToday($event, emp))"
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
      <div class="panel-card">
        No hay productores activos. Marcá “Produce comida” en Empleados para que aparezcan acá.
      </div>
    } @else {
      <div class="panel-card panel-card--flush">
        <div class="panel-card__body">
          <div class="att-table-wrap" #tableWrap>
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
                          [disabled]="!canManage() || saving() || isClosedDay(d)"
                          [matTooltip]="cellTooltip(emp, d)"
                          (click)="onCellClick(emp, d)"
                          (contextmenu)="editHours($event, emp, d)"
                          (pointerdown)="onPressStart($event, () => editHours($event, emp, d))"
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
          </p>
        </div>
      </div>
    }
  `,
  styles: [
    `
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

  readonly shopId = this.shops.selectedShopId;
  private readonly tableWrap = viewChild<ElementRef<HTMLElement>>('tableWrap');
  readonly months = MONTH_LABELS.map((label, idx) => ({ value: idx + 1, label }));
  readonly years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 3 + i);

  private readonly now = new Date();
  readonly todayYear = this.now.getFullYear();
  readonly todayMonth = this.now.getMonth() + 1;
  readonly todayIso = localIsoDate(this.now);

  readonly year = signal(this.todayYear);
  readonly month = signal(this.todayMonth);
  readonly data = signal<ProdMonthResponse | null>(null);
  readonly todayMarks = signal<Record<string, number>>({});
  readonly saving = signal(false);
  readonly exporting = signal(false);
  readonly sharing = signal(false);
  readonly defaultHours = signal(8);

  private monthLoadSeq = 0;
  private todayLoadSeq = 0;

  readonly employees = computed(() => this.data()?.employees ?? []);
  readonly dayNumbers = computed(() => {
    const n = this.data()?.daysInMonth ?? 0;
    return Array.from({ length: n }, (_, i) => i + 1);
  });

  constructor() {
    usePageRefresh(() => {
      void this.reload();
      void this.loadTodayMarks();
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

  todayLabel(): string {
    return this.now.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  async shareToday(): Promise<void> {
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    const payload = attendanceDaySharePayload({
      shopName,
      dateLabel: this.todayLabel(),
      kind: 'produccion',
      employees: this.employees().map((emp) => {
        const hours = this.hoursToday(emp);
        return {
          fullName: emp.fullName,
          present: hours > 0,
          hours,
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

  formatHours(h: number): string {
    const n = Number(h) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  onMonthChange(value: number): void {
    this.month.set(value);
  }

  onYearChange(value: number): void {
    this.year.set(value);
  }

  goToTodayMonth(): void {
    this.year.set(this.todayYear);
    this.month.set(this.todayMonth);
  }

  isTodayColumn(day: number): boolean {
    return (
      this.year() === this.todayYear &&
      this.month() === this.todayMonth &&
      day === this.now.getDate()
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

  togglePresentToday(emp: ProdEmployeeRow): void {
    if (!this.canManage()) return;
    const cur = this.hoursToday(emp);
    this.upsertToday(emp, cur > 0 ? 0 : this.defaultHours());
  }

  editHoursToday(event: Event, emp: ProdEmployeeRow): void {
    event.preventDefault();
    this.clearPressTimer();
    if (!this.canManage()) return;
    const next = this.askHours(this.hoursToday(emp) || this.defaultHours());
    if (next === null) return;
    this.upsertToday(emp, next);
  }

  togglePresent(emp: ProdEmployeeRow, day: number): void {
    if (!this.canManage() || this.isClosedDay(day)) return;
    const cur = this.hoursOf(emp, day);
    this.upsert(emp, day, cur > 0 ? 0 : this.defaultHours());
  }

  editHours(event: Event, emp: ProdEmployeeRow, day: number): void {
    event.preventDefault();
    this.clearPressTimer();
    if (!this.canManage() || this.isClosedDay(day)) return;
    const next = this.askHours(this.hoursOf(emp, day) || this.defaultHours());
    if (next === null) return;
    this.upsert(emp, day, next);
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

  markAllPresentToday(): void {
    const shopId = this.shopId();
    if (!shopId || !this.canManage()) return;
    const hours = this.defaultHours();
    const items = this.employees().map((e) => ({
      employeeId: e.employeeId,
      date: this.todayIso,
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
          if (this.year() === this.todayYear && this.month() === this.todayMonth) {
            void this.reload();
          }
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
    if (!shopId) return;
    this.saving.set(true);
    this.http
      .post<{ hours: number }>(`${environment.apiUrl}/shops/${shopId}/production-attendance`, {
        employeeId: emp.employeeId,
        date: this.todayIso,
        hours,
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.todayMarks.update((m) => ({ ...m, [emp.employeeId]: Number(res.hours) || 0 }));
          if (this.year() === this.todayYear && this.month() === this.todayMonth) {
            this.patchLocalDay(emp.employeeId, this.todayIso, Number(res.hours) || 0);
          }
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
          if (iso === this.todayIso) {
            this.todayMarks.update((m) => ({ ...m, [emp.employeeId]: h }));
          }
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
    if (!shopId) return;
    const seq = ++this.monthLoadSeq;
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
      if (data.defaultHours) this.defaultHours.set(Number(data.defaultHours) || 8);
      requestAnimationFrame(() => this.scrollMatrixToToday());
    } catch {
      if (seq !== this.monthLoadSeq) return;
      this.data.set(null);
      this.snack.open('No se pudo cargar la asistencia de producción', 'OK', { duration: 3000 });
    }
  }

  private async loadTodayMarks(): Promise<void> {
    const shopId = this.shopId();
    if (!shopId) return;
    const seq = ++this.todayLoadSeq;
    try {
      const data = await firstValueFrom(
        this.http.get<ProdMonthResponse>(
          `${environment.apiUrl}/shops/${shopId}/production-attendance`,
          {
            params: {
              year: String(this.todayYear),
              month: String(this.todayMonth),
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
        marks[e.employeeId] = Number(e.days?.[this.todayIso]?.hours ?? 0) || 0;
      }
      this.todayMarks.set(marks);
      // Si el mes visible no es el de hoy, igual necesitamos la lista de productores
      if (this.year() !== this.todayYear || this.month() !== this.todayMonth) {
        // keep month data; chips use todayMarks + employees from month if same list
      }
      // Si no hay data de mes aún, setear empleados del mes de hoy para el panel
      if (!this.data()) this.data.set(data);
    } catch {
      if (seq !== this.todayLoadSeq) return;
      this.todayMarks.set({});
    }
  }

  private scrollMatrixToToday(attempt = 0): void {
    if (this.year() !== this.todayYear || this.month() !== this.todayMonth) return;
    const wrap = this.tableWrap()?.nativeElement;
    if (!wrap) return;
    const todayHeader = wrap.querySelector(
      `th.att-table__day[data-day="${this.now.getDate()}"]`,
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
