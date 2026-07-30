import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
  ],
  template: `
    <app-page-header
      title="Asistencia"
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
        <div class="today-panel__chips">
          @for (emp of employees(); track emp.employeeId) {
            <button
              type="button"
              class="today-chip"
              [class.today-chip--present]="isPresentToday(emp)"
              [disabled]="!canManage() || saving()"
              (click)="togglePresentToday(emp)"
            >
              <mat-icon>{{ isPresentToday(emp) ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>
              {{ emp.fullName }}
            </button>
          }
        </div>
      </div>
    }

    <div class="panel-card guy-filters mb-3">
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
      </div>
    </div>

    @if (!shopId()) {
      <div class="panel-card">Seleccioná un local en el menú lateral.</div>
    } @else if (!employees().length) {
      <div class="panel-card">No hay empleados activos para mostrar.</div>
    } @else {
      <div class="panel-card panel-card--flush">
        <div class="panel-card__body">
          <div class="att-table-wrap">
            <table class="att-table">
              <thead>
                <tr>
                  <th class="att-table__name">Empleado</th>
                  @for (d of dayNumbers(); track d) {
                    <th>{{ d }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (emp of employees(); track emp.employeeId) {
                  <tr>
                    <td class="att-table__name">{{ emp.fullName }}</td>
                    @for (d of dayNumbers(); track d) {
                      <td>
                        <button
                          type="button"
                          class="att-cell"
                          [class.att-cell--present]="isPresent(emp, d)"
                          [class.att-cell--holiday]="isHoliday(emp, d)"
                          [disabled]="!canManage() || saving()"
                          [matTooltip]="cellTooltip(emp, d)"
                          (click)="togglePresent(emp, d)"
                          (contextmenu)="toggleHoliday($event, emp, d)"
                        >
                          @if (isHoliday(emp, d)) {
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
            <span class="att-legend__hint">Click: presente/ausente · Click derecho: feriado</span>
          </p>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .att-table-wrap {
        overflow-x: auto;
      }
      .att-table {
        border-collapse: collapse;
        width: 100%;
      }
      .att-table th,
      .att-table td {
        border: 1px solid var(--guy-border, #d7e0d9);
        text-align: center;
        padding: 0.25rem;
        font-size: 0.75rem;
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
        border-radius: 6px;
        background: transparent;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }
      .att-cell:disabled {
        cursor: default;
        opacity: 0.7;
      }
      .att-cell--present {
        background: color-mix(in srgb, var(--guy-green, #2e7d32) 20%, transparent);
        border-color: var(--guy-green, #2e7d32);
      }
      .att-cell--holiday {
        background: color-mix(in srgb, #e65100 20%, transparent);
        border-color: #e65100;
      }
      .att-cell__icon {
        font-size: 1.1rem;
        width: 1.1rem;
        height: 1.1rem;
        color: var(--guy-navy, #003366);
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
      .att-legend__swatch {
        width: 1rem;
        height: 1rem;
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
      .today-chip:disabled {
        opacity: 0.7;
        cursor: default;
      }
    `,
  ],
})
export class AttendancePage {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  readonly shops = inject(ShopContextService);

  readonly shopId = this.shops.selectedShopId;
  readonly months = MONTH_LABELS.map((label, idx) => ({ value: idx + 1, label }));
  readonly years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 3 + i);

  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);
  readonly data = signal<AttendanceMonthResponse | null>(null);
  readonly saving = signal(false);
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

  constructor() {
    effect(() => {
      const shopId = this.shopId();
      this.year();
      this.month();
      if (!shopId) {
        this.data.set(null);
        this.todayMarks.set({});
        return;
      }
      this.reload();
      this.loadTodayMarks();
    });
  }

  canManage(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'attendance.manage');
  }

  goToTodayMonth(): void {
    this.year.set(this.todayYear);
    this.month.set(this.todayMonth);
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
    const items = this.employees().map((e) => ({
      employeeId: e.employeeId,
      date: this.todayIso,
      isPresent: true,
    }));
    if (!items.length) return;
    this.saving.set(true);
    this.http
      .post(`${environment.apiUrl}/shops/${shopId}/attendance/bulk`, { items })
      .subscribe({
        next: () => {
          this.saving.set(false);
          const next = { ...this.todayMarks() };
          for (const e of this.employees()) {
            next[e.employeeId] = {
              isPresent: true,
              isHoliday: next[e.employeeId]?.isHoliday ?? false,
            };
          }
          this.todayMarks.set(next);
          if (this.year() === this.todayYear && this.month() === this.todayMonth) {
            this.reload();
          }
          this.snack.open('Todos marcados presentes hoy', 'OK', { duration: 2500 });
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudo marcar el presentismo';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  private loadTodayMarks(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.http
      .get<AttendanceMonthResponse>(`${environment.apiUrl}/shops/${shopId}/attendance`, {
        params: { year: String(this.todayYear), month: String(this.todayMonth) },
      })
      .subscribe({
        next: (data) => {
          const marks: Record<string, { isPresent: boolean; isHoliday: boolean }> = {};
          for (const e of data.employees ?? []) {
            const cell = e.days[this.todayIso];
            marks[e.employeeId] = {
              isPresent: !!cell?.isPresent,
              isHoliday: !!cell?.isHoliday,
            };
          }
          this.todayMarks.set(marks);
        },
        error: () => this.todayMarks.set({}),
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
          this.reload();
          this.loadTodayMarks();
        }
      });
  }

  onMonthChange(value: number): void {
    this.month.set(value);
  }

  onYearChange(value: number): void {
    this.year.set(value);
  }

  reload(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.http
      .get<AttendanceMonthResponse>(`${environment.apiUrl}/shops/${shopId}/attendance`, {
        params: { year: String(this.year()), month: String(this.month()) },
      })
      .subscribe({
        next: (data) => this.data.set(data),
        error: () => this.snack.open('No se pudo cargar la asistencia', 'OK', { duration: 3000 }),
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

  cellTooltip(emp: AttendanceEmployeeRow, day: number): string {
    const cell = this.cellFor(emp, day);
    const parts = [cell.isPresent ? 'Presente' : 'Ausente'];
    if (cell.isHoliday) parts.push('Feriado');
    return parts.join(' · ');
  }

  togglePresent(emp: AttendanceEmployeeRow, day: number): void {
    if (!this.canManage()) return;
    const cell = this.cellFor(emp, day);
    this.upsert(emp, day, { isPresent: !cell.isPresent });
  }

  toggleHoliday(event: Event, emp: AttendanceEmployeeRow, day: number): void {
    event.preventDefault();
    if (!this.canManage()) return;
    const cell = this.cellFor(emp, day);
    this.upsert(emp, day, { isHoliday: !cell.isHoliday });
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
