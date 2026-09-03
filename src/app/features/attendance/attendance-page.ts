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
import { MatCheckboxModule } from '@angular/material/checkbox';
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { ExportMenuComponent, ExportFormat } from '../../shared/components/export-menu';
import { downloadTablePdf } from '../../shared/pdf/html-pdf';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import {
  attendanceRangeSharePayload,
  formatIsoShareLabel,
  isoDatesInRange,
  monthKeysInRange,
} from '../../shared/utils/attendance-share';
import { copyText, shareText } from '../../shared/utils/share-text';
import { LoadingStateComponent } from '../../shared/components/loading-state';
import {
  AttendanceShareRangeDialogComponent,
  AttendanceShareRangeResult,
} from './attendance-share-range-dialog';
import {
  parseIsoDateParts,
  resolveShopBusinessDate,
  zonedDateParts,
} from '../../core/shop/business-date';
import {
  formatShiftHint,
  resolveCurrentShift,
  shopBusinessOpening,
  shopHasMultipleShifts,
  shopShiftsOf,
  shiftsOnIsoDate,
  shiftHoursLabel,
} from '../../core/shop/shop-shifts';

interface AttendanceDayCell {
  id?: string;
  isPresent: boolean;
  isHoliday: boolean;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  overtimeHours: number;
}

interface AttendanceEmployeeRow {
  employeeId: string;
  fullName: string;
  baseSalary: number;
  overtimeHourRate?: number;
  serviceCheckIn?: string | null;
  serviceCheckOut?: string | null;
  shiftAssignments?: Array<{
    shiftId: string;
    type: 'FIXED' | 'ROTATING';
    serviceCheckIn?: string | null;
    serviceCheckOut?: string | null;
  }>;
  type?: 'FIXED' | 'ROTATING';
  worksThisShift?: boolean;
  countsForAttendanceBonus?: boolean;
  days: Record<string, AttendanceDayCell>;
}

type AttendancePatch = {
  isPresent?: boolean;
  isHoliday?: boolean;
  checkInAt?: string | null;
  checkOutAt?: string | null;
};

type TodayMark = {
  isPresent: boolean;
  isHoliday: boolean;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  overtimeHours: number;
};

function emptyCell(): AttendanceDayCell {
  return {
    isPresent: false,
    isHoliday: false,
    checkInAt: null,
    checkOutAt: null,
    overtimeHours: 0,
  };
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
    MatCheckboxModule,
    MatDialogModule,
    MatSnackBarModule,
    PageHeaderComponent,
    FiltersCollapseBtnComponent,
    ExportMenuComponent,
    LoadingStateComponent,
  ],
  templateUrl: './attendance-page.html',
  styleUrl: './attendance-page.scss',
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
  private readonly live = inject(ShopLiveClient);

  readonly shopId = this.shops.selectedShopId;
  readonly shopShifts = computed(() =>
    shiftsOnIsoDate(this.shops.selectedShop(), this.todayIso()),
  );
  readonly showShiftSelect = computed(() => this.shopShifts().length > 1);
  readonly selectedShiftId = signal('');
  private readonly tableWrap = viewChild<ElementRef<HTMLElement>>('tableWrap');
  readonly months = MONTH_LABELS.map((label, idx) => ({ value: idx + 1, label }));
  readonly years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 3 + i);

  private shopBusinessDateIso(): string {
    const shop = this.shops.selectedShop();
    return resolveShopBusinessDate(new Date(), {
      timezone: shop?.timezone,
      openingTime: shopBusinessOpening(shop, new Date()),
    });
  }

  private shopTodayParts() {
    const iso = this.shopBusinessDateIso();
    const parsed = parseIsoDateParts(iso);
    if (parsed) return parsed;
    return zonedDateParts(new Date(), this.shops.selectedShop()?.timezone);
  }

  readonly todayParts = computed(() => this.shopTodayParts());
  readonly todayIso = computed(() => this.shopBusinessDateIso());
  readonly businessDayHint = computed(() => {
    const shop = this.shops.selectedShop();
    const shifts = shopShiftsOf(shop);
    const shiftId = this.selectedShiftId();
    const shift = shifts.find((s) => s.id === shiftId) ?? resolveCurrentShift(shop);
    return formatShiftHint(this.todayIso(), shift, shifts);
  });
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
  readonly todayMarks = signal<Record<string, TodayMark>>({});
  /** Día seleccionado en el panel rápido (por defecto hoy). */
  readonly quickDayIso = signal(this.shopBusinessDateIso());
  private overtimeSaveTimers = new Map<string, number>();
  readonly otFrom = signal(
    `${this.shopTodayParts().year}-${String(this.shopTodayParts().month).padStart(2, '0')}-01`,
  );
  readonly otTo = signal(this.todayIso());
  readonly otCountLate = signal(false);
  readonly otCountEarly = signal(false);
  readonly excelFrom = signal(
    `${this.shopTodayParts().year}-${String(this.shopTodayParts().month).padStart(2, '0')}-01`,
  );
  readonly excelTo = signal(this.todayIso());
  readonly otSummary = signal<{
    items: Array<{
      employeeId: string;
      fullName: string;
      presentDays: number;
      overtimeHours: number;
      overtimeHourRate: number;
      overtimeCost: number;
    }>;
    totals: { presentDays: number; overtimeHours: number; overtimeCost: number };
  } | null>(null);
  readonly otLoading = signal(false);
  readonly otExporting = signal(false);

  readonly employees = computed(() =>
    (this.data()?.employees ?? []).filter((e) => e.worksThisShift !== false),
  );
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
              shiftId: this.selectedShiftId(),
              _: String(Date.now()),
            },
            headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
          }),
        );
      }),
    );
  }

  constructor() {
    effect(() => {
      const shop = this.shops.selectedShop();
      const todayShifts = this.shopShifts();
      const current = resolveCurrentShift(shop).id;
      const ids = todayShifts.map((s) => s.id);
      const next = ids.includes(current) ? current : (ids[0] ?? current);
      const selected = this.selectedShiftId();
      if (!selected || !ids.includes(selected)) {
        this.selectedShiftId.set(next);
        void this.reload();
        void this.loadTodayMarks();
      }
    });
    usePageRefresh(async () => {
      await Promise.all([this.reload(), this.loadTodayMarks()]);
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

  publicAttendanceUrl(): string {
    const shop = this.shops.selectedShop();
    if (!shop?.publicAttendanceEnabled || !shop.slug) return '';
    return `${window.location.origin}/p/${encodeURIComponent(shop.slug)}`;
  }

  async copyPublicAttendanceUrl(): Promise<void> {
    const url = this.publicAttendanceUrl();
    if (!url) return;
    const ok = await copyText(url);
    this.snack.open(ok ? 'Link de presentismo copiado' : 'No se pudo copiar la URL', 'OK', {
      duration: 2500,
    });
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

  async onExport(format: ExportFormat): Promise<void> {
    if (format === 'pdf') {
      const shop = this.shops.selectedShop();
      const from = String(this.excelFrom() ?? '').trim();
      const to = String(this.excelTo() ?? '').trim();
      await downloadTablePdf({
        title: 'Presentismo',
        subtitle: `${shop?.name ?? ''} · ${from} a ${to}`,
        filename: `presentismo-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${from}_${to}.pdf`,
        headers: ['Empleado', 'Días presentes'],
        rows: this.employees().map((emp) => [
          emp.fullName,
          this.dayNumbers().filter((d) => this.isPresent(emp, d)).length,
        ]),
      });
      return;
    }
    this.exportExcel();
  }

  exportExcel(): void {
    const shopId = this.shopId();
    const shop = this.shops.selectedShop();
    if (!shopId || this.exporting()) return;
    const from = String(this.excelFrom() ?? '').trim();
    const to = String(this.excelTo() ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      this.snack.open('Indicá un rango de fechas válido', 'OK', { duration: 2500 });
      return;
    }
    if (from > to) {
      this.snack.open('La fecha desde no puede ser posterior a hasta', 'OK', { duration: 2500 });
      return;
    }
    this.exporting.set(true);
    this.http
      .get(`${environment.apiUrl}/shops/${shopId}/attendance/export.xlsx`, {
        params: { from, to },
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.exporting.set(false);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `presentismo-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${from}_${to}.xlsx`;
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
    const cur = this.todayMarks()[emp.employeeId] ?? emptyCell();
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
    const cur = this.todayMarks()[emp.employeeId] ?? emptyCell();
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
      shiftId: this.selectedShiftId() || undefined,
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
          void this.loadTodayMarks();
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
      shiftId: this.selectedShiftId() || undefined,
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
          void this.loadTodayMarks();
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
      shiftId: this.selectedShiftId() || undefined,
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
          shiftId: this.selectedShiftId(),
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
        const marks: Record<string, TodayMark> = {};
        for (const e of data.employees ?? []) {
          const cell = e.days[iso];
          marks[e.employeeId] = {
            isPresent: !!cell?.isPresent,
            isHoliday: !!cell?.isHoliday,
            checkInAt: cell?.checkInAt ?? null,
            checkOutAt: cell?.checkOutAt ?? null,
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
    patch: AttendancePatch,
  ): void {
    const shopId = this.shopId();
    if (!shopId || this.isQuickDayClosed()) return;
    const date = this.quickDayIso();
    this.saving.set(true);
    this.http
      .post<AttendanceDayCell>(
        `${environment.apiUrl}/shops/${shopId}/attendance`,
        {
          employeeId: emp.employeeId,
          date,
          shiftId: this.selectedShiftId() || undefined,
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
              checkInAt: result.checkInAt ?? null,
              checkOutAt: result.checkOutAt ?? null,
              overtimeHours: Number(result.overtimeHours ?? 0),
            },
          }));
          this.patchBoardDay(emp.employeeId, date, {
            isPresent: !!result.isPresent,
            isHoliday: !!result.isHoliday,
            checkInAt: result.checkInAt ?? null,
            checkOutAt: result.checkOutAt ?? null,
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
          shiftId: this.selectedShiftId(),
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
    return emp.days[this.dateFor(day)] ?? emptyCell();
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

  shiftTimesEnabled(): boolean {
    return this.shops.selectedShop()?.serviceAttendanceWithHours !== false;
  }

  onShiftChange(shiftId: string): void {
    this.selectedShiftId.set(shiftId);
    void this.reload();
    void this.loadTodayMarks();
  }

  shiftHoursLabel = shiftHoursLabel;

  /** Horario de servicio del turno (asignación → empleado → ventana del turno). */
  private empShiftDefaults(emp: AttendanceEmployeeRow) {
    const shiftId = this.selectedShiftId();
    const shift =
      this.shopShifts().find((s) => s.id === shiftId) ?? this.shopShifts()[0] ?? null;
    const hit = emp.shiftAssignments?.find((a) => a.shiftId === shiftId);
    return {
      checkIn: hit?.serviceCheckIn || emp.serviceCheckIn || shift?.opensAt || '18:00',
      checkOut: hit?.serviceCheckOut || emp.serviceCheckOut || shift?.closesAt || '00:00',
    };
  }

  checkInToday(emp: AttendanceEmployeeRow): string {
    return this.todayMarks()[emp.employeeId]?.checkInAt || this.empShiftDefaults(emp).checkIn;
  }

  checkOutToday(emp: AttendanceEmployeeRow): string {
    return this.todayMarks()[emp.employeeId]?.checkOutAt || this.empShiftDefaults(emp).checkOut;
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

  onShiftTodayChange(emp: AttendanceEmployeeRow, checkInAt: string, checkOutAt: string): void {
    if (!this.canManage() || this.isQuickDayClosed() || !this.isPresentToday(emp) || !this.shiftTimesEnabled()) return;
    this.todayMarks.update((m) => ({
      ...m,
      [emp.employeeId]: {
        isPresent: true,
        isHoliday: !!m[emp.employeeId]?.isHoliday,
        checkInAt,
        checkOutAt,
        overtimeHours: Number(m[emp.employeeId]?.overtimeHours ?? 0),
      },
    }));
    const prev = this.overtimeSaveTimers.get(emp.employeeId);
    if (prev != null) window.clearTimeout(prev);
    const timer = window.setTimeout(() => {
      this.overtimeSaveTimers.delete(emp.employeeId);
      this.upsertToday(emp, { isPresent: true, checkInAt, checkOutAt });
    }, 450);
    this.overtimeSaveTimers.set(emp.employeeId, timer);
  }

  money(value: number): string {
    return `$ ${Number(value || 0).toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }

  loadOvertimeSummary(): void {
    const shopId = this.shopId();
    const from = this.otFrom();
    const to = this.otTo();
    if (!shopId || !from || !to) return;
    this.otLoading.set(true);
    this.http
      .get<{
        items: Array<{
          employeeId: string;
          fullName: string;
          presentDays: number;
          overtimeHours: number;
          overtimeHourRate: number;
          overtimeCost: number;
        }>;
        totals: { presentDays: number; overtimeHours: number; overtimeCost: number };
      }>(`${environment.apiUrl}/shops/${shopId}/attendance/overtime-summary`, {
        params: {
          from,
          to,
          countLate: this.otCountLate() ? 'true' : 'false',
          countEarly: this.otCountEarly() ? 'true' : 'false',
        },
      })
      .subscribe({
        next: (data) => {
          this.otLoading.set(false);
          this.otSummary.set(data);
        },
        error: () => {
          this.otLoading.set(false);
          this.snack.open('No se pudo cargar el resumen de horas extra', 'OK', { duration: 3500 });
        },
      });
  }

  otSubtitle(): string {
    const late = this.otCountLate();
    const early = this.otCountEarly();
    if (late && early) {
      return 'Suma llegadas tarde, retiros temprano y lo que se quedó después de la retirada.';
    }
    if (late) {
      return 'Suma llegadas tarde y lo que se quedó después de la retirada.';
    }
    if (early) {
      return 'Suma retiros temprano y lo que se quedó después de la retirada.';
    }
    return 'Suma de horas después de la retirada, con costo por empleado.';
  }

  onOtCountLateChange(value: boolean): void {
    this.otCountLate.set(!!value);
    if (this.otSummary()) this.loadOvertimeSummary();
  }

  onOtCountEarlyChange(value: boolean): void {
    this.otCountEarly.set(!!value);
    if (this.otSummary()) this.loadOvertimeSummary();
  }

  async onOtExport(format: ExportFormat): Promise<void> {
    if (format === 'pdf') {
      const sum = this.otSummary();
      if (!sum) return;
      await downloadTablePdf({
        title: 'Horas extra',
        subtitle: `${this.otFrom()} a ${this.otTo()}`,
        filename: `horas-extra-${this.otFrom()}_${this.otTo()}.pdf`,
        headers: ['Empleado', 'Días', 'Hs extra', '$/hora', 'Costo'],
        rows: sum.items.map((row) => [
          row.fullName,
          row.presentDays,
          row.overtimeHours,
          row.overtimeHourRate,
          row.overtimeCost,
        ]),
      });
      return;
    }
    this.exportOvertimeSummary();
  }

  exportOvertimeSummary(): void {
    const shopId = this.shopId();
    const from = this.otFrom();
    const to = this.otTo();
    if (!shopId || !from || !to) return;
    this.otExporting.set(true);
    this.http
      .get(`${environment.apiUrl}/shops/${shopId}/attendance/overtime-summary.xlsx`, {
        params: {
          from,
          to,
          countLate: this.otCountLate() ? 'true' : 'false',
          countEarly: this.otCountEarly() ? 'true' : 'false',
        },
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.otExporting.set(false);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const tag =
            this.otCountLate() || this.otCountEarly()
              ? `${this.otCountLate() ? 'tarde-' : ''}${this.otCountEarly() ? 'temprano-' : ''}`
              : '';
          a.download = `horas-extra-${tag}${from}_${to}.xlsx`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => {
          this.otExporting.set(false);
          this.snack.open('No se pudo exportar', 'OK', { duration: 3000 });
        },
      });
  }

  openOvertimeEditor(event: Event, emp: AttendanceEmployeeRow, day: number): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.canManage() || this.isClosedDay(day) || this.saving() || !this.shiftTimesEnabled()) return;
    const cell = this.cellFor(emp, day);
    const defaults = this.empShiftDefaults(emp);
    this.dialogTitle
      .track(
        this.dialog.open(AttendanceOvertimeDialogComponent, {
          width: '420px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            employeeName: emp.fullName,
            dateLabel: this.dateFor(day),
            checkInAt: cell.checkInAt ?? defaults.checkIn,
            checkOutAt: cell.checkOutAt ?? defaults.checkOut,
            defaultCheckIn: defaults.checkIn,
            defaultCheckOut: defaults.checkOut,
          },
        }),
        'Horario de servicio',
      )
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        if (
          !this.confirmBoardSave(
            `Horario de ${emp.fullName} el ${this.dateFor(day)}: ${result.checkInAt}–${result.checkOutAt}`,
          )
        ) {
          return;
        }
        this.upsert(
          emp,
          day,
          { isPresent: true, checkInAt: result.checkInAt, checkOutAt: result.checkOutAt },
          true,
        );
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
    if (cell.checkInAt || cell.checkOutAt) {
      parts.push(`${cell.checkInAt ?? '—'}–${cell.checkOutAt ?? '—'}`);
    }
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
    patch: AttendancePatch,
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
        shiftId: this.selectedShiftId() || undefined,
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
                checkInAt: result.checkInAt ?? m[emp.employeeId]?.checkInAt ?? null,
                checkOutAt: result.checkOutAt ?? m[emp.employeeId]?.checkOutAt ?? null,
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
