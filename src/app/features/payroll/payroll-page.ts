import { Component, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { KpiStripComponent, KpiItem } from '../../shared/components/kpi-strip';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { environment } from '../../../environments/environment';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { downloadColumnsPdf } from '../../shared/utils/table-pdf';
import { ExportMenuComponent, ExportFormat } from '../../shared/components/export-menu';

const moneyAlways = (value: unknown) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '$ 0';
  return `$ ${n.toLocaleString('es-AR')}`;
};
import {
  SalariesApiService,
  SalaryEmployee,
  SalaryHistoryRow,
} from './salaries-api.service';
import { SalaryEditDialogComponent } from './salary-edit-dialog';

interface PayrollLine {
  id: string;
  employeeId: string;
  employeeName: string | null;
  shiftId?: string | null;
  shiftName?: string | null;
  daysWorked: number;
  holidayDays: number;
  baseSalarySnapshot: number;
  holidayMultiplierSnapshot: number | null;
  overtimeAmount: number;
  attendanceBonus: number;
  total: number;
  notes: string | null;
}

interface PayrollPeriod {
  id: string | null;
  shopId: string;
  year: number;
  month: number;
  fromDate?: string;
  toDate?: string;
  status: 'DRAFT' | 'LOCKED';
  attendanceBonusAmount?: number;
  splitByShift?: boolean;
  lines: PayrollLine[];
}

interface SacEmployee {
  employeeId: string;
  fullName: string;
  bestSalary: number;
  monthsWorked: number;
  sacAmount: number;
}

interface SacResponse {
  shopId: string;
  year: number;
  semester: 1 | 2;
  employees: SacEmployee[];
}

const SOURCE_LABEL: Record<string, string> = {
  CREATE: 'Alta',
  UPDATE: 'Cambio',
  MIGRATE_DAILY: 'Conversión ÷21',
};

@Component({
  selector: 'app-salaries-page',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatSlideToggleModule,
    MatDatepickerModule,
    MatInputModule,
    MatDialogModule,
    MatSnackBarModule,
    PageHeaderComponent,
    DataTableComponent,
    KpiStripComponent,
    BusyLabelComponent,
    FiltersCollapseBtnComponent,
    ExportMenuComponent,
  ],
  styles: `
    .payroll-filters__fields {
      display: grid;
      grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
      gap: 0.75rem 1rem;
      max-width: 100%;
      min-width: 0;
    }
    .payroll-filters__fields > mat-form-field {
      min-width: 0;
      width: 100%;
    }
    .payroll-filters__bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem 1rem;
      margin-top: 0.85rem;
      padding-top: 0.85rem;
      border-top: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 85%, transparent);
    }
    .payroll-filters__toggles {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.55rem 1.15rem;
    }
    .payroll-filters__toggles mat-slide-toggle {
      margin: 0;
    }
    .payroll-filters__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      margin-left: auto;
    }
    @media (max-width: 720px) {
      .payroll-filters__fields {
        grid-template-columns: 1fr;
      }
      .payroll-filters__bar {
        flex-direction: column;
        align-items: stretch;
      }
      .payroll-filters__actions {
        margin-left: 0;
        width: 100%;
      }
      .payroll-filters__actions > * {
        flex: 1 1 auto;
      }
    }
  `,
  template: `
    <app-page-header
      title="Sueldos"
      [subtitle]="shops.selectedShop()?.name ?? 'Sin local'"
    />

    @if (!shopId()) {
      <div class="panel-card">Seleccioná un local en el menú lateral.</div>
    } @else {
      <mat-tab-group
        animationDuration="0ms"
        class="mb-3"
        [selectedIndex]="tabIndex()"
        (selectedIndexChange)="onTabChange($event)"
      >
        <mat-tab label="Sueldos">
          <div class="panel-card guy-filters mt-3 mb-3">
            <div class="guy-filters__body">
              <mat-slide-toggle
                [ngModel]="includeInactive()"
                (ngModelChange)="onToggleInactive($event)"
              >
                Incluir ocultos
              </mat-slide-toggle>
              <div class="guy-filters__actions">
                <button mat-stroked-button type="button" (click)="exportSalariesPdf()">
                  <mat-icon>picture_as_pdf</mat-icon>
                  PDF
                </button>
                <button mat-stroked-button type="button" (click)="exportSalariesExcel()">
                  <mat-icon>download</mat-icon>
                  Excel
                </button>
              </div>
            </div>
          </div>

          <div class="panel-card panel-card--flush">
            <div class="panel-card__body">
              <div class="guy-list-head">
                <div>
                  <h3 class="guy-list-head__title">Sueldos vigentes</h3>
                  <p class="guy-list-head__meta">
                    Mult. feriado del local: ×{{ shopHolidayMult() }}
                  </p>
                </div>
              </div>
              <app-data-table
                [columns]="salaryColumns"
                [rows]="salaryRows()"
                [loading]="salariesLoading()"
                [sortable]="true"
                [showActions]="canManage()"
                [canRemove]="neverRemove"
                (edit)="openSalaryEdit($event)"
              />
            </div>
          </div>
        </mat-tab>

        <mat-tab label="Historial">
          <div
            class="panel-card guy-filters mt-3 mb-3"
            [class.guy-filters--collapsed]="histFiltersCollapsed()"
          >
            <div class="guy-filters__head">
              <div>
                <h3 class="guy-filters__title">Filtros</h3>
              </div>
              <div class="guy-filters__tools">
                <app-filters-collapse-btn
                  [collapsed]="histFiltersCollapsed()"
                  (toggle)="toggleHistFilters()"
                />
              </div>
            </div>
            <div class="guy-filters__body">
              <div class="guy-filters__grid guy-filters__grid--dense">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Empleado</mat-label>
                  <mat-select
                    [ngModel]="histEmployeeId()"
                    (ngModelChange)="histEmployeeId.set($event); reloadHistory()"
                  >
                    <mat-option [value]="''">Todos</mat-option>
                    @for (e of salaryRows(); track e.id) {
                      <mat-option [value]="e.id">{{ e.fullName }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              </div>
            </div>
          </div>
          <div class="panel-card panel-card--flush">
            <div class="panel-card__body">
              <app-data-table
                [columns]="historyColumns"
                [rows]="historyRows()"
                [loading]="historyLoading()"
                [sortable]="true"
                [showActions]="false"
              />
            </div>
          </div>
        </mat-tab>

        <mat-tab label="Liquidación">
          <app-kpi-strip class="mt-3 mb-3" [items]="payrollKpis()" />

          <div
            class="panel-card guy-filters mb-3"
            [class.guy-filters--collapsed]="filtersCollapsed()"
          >
            <div class="guy-filters__head">
              <div>
                <h2 class="guy-filters__title">Período</h2>
              </div>
              <div class="guy-filters__tools">
                <app-filters-collapse-btn
                  [collapsed]="filtersCollapsed()"
                  (toggle)="toggleFilters()"
                />
              </div>
            </div>
            <div class="guy-filters__body">
              <div class="payroll-filters__fields">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Desde — hasta</mat-label>
                  <mat-date-range-input [rangePicker]="payrollPicker" [formGroup]="payrollRange">
                    <input matStartDate formControlName="start" placeholder="Desde" />
                    <input matEndDate formControlName="end" placeholder="Hasta" />
                  </mat-date-range-input>
                  <mat-datepicker-toggle matIconSuffix [for]="payrollPicker" />
                  <mat-date-range-picker #payrollPicker />
                </mat-form-field>

                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Presentismo $/semana</mat-label>
                  <input
                    matInput
                    type="number"
                    min="0"
                    step="1000"
                    [ngModel]="attendanceBonusAmount()"
                    (ngModelChange)="attendanceBonusAmount.set(asNumber($event))"
                  />
                </mat-form-field>
              </div>

              @if (canManage()) {
                <div class="payroll-filters__bar">
                  <div class="payroll-filters__toggles">
                    <mat-slide-toggle
                      [ngModel]="payrollIncludeInactive()"
                      (ngModelChange)="payrollIncludeInactive.set($event)"
                    >
                      Incluir ocultos
                    </mat-slide-toggle>
                    <mat-slide-toggle
                      [ngModel]="splitByShift()"
                      (ngModelChange)="splitByShift.set($event)"
                    >
                      Separar por turnos
                    </mat-slide-toggle>
                  </div>
                  <div class="payroll-filters__actions">
                    <button
                      mat-flat-button
                      color="primary"
                      type="button"
                      [disabled]="busy() || !hasPayrollRange()"
                      (click)="generate()"
                    >
                      <app-busy-label [busy]="busy()" busyLabel="Generando…">
                        <mat-icon>calculate</mat-icon>
                        Generar
                      </app-busy-label>
                    </button>
                    <app-export-menu
                      label="Descargar"
                      [disabled]="!hasPayrollRange() || !lines().length"
                      (pick)="onPayrollExport($event)"
                    />
                  </div>
                </div>
              }
            </div>
          </div>

          <div class="panel-card panel-card--flush mb-3">
            <div class="panel-card__body">
              <div class="guy-list-head">
                <div>
                  <h3 class="guy-list-head__title">Líneas de liquidación</h3>
                  <p class="guy-list-head__meta">
                    {{ periodLabel() }}
                    · Presentismo: $ {{ attendanceBonusAmount().toLocaleString('es-AR') }}/semana
                    @if (splitByShift()) {
                      · Separado por turnos
                    }
                  </p>
                </div>
              </div>
              <app-data-table
                [columns]="lineColumns()"
                [rows]="lines()"
                [loading]="payrollLoading()"
                [sortable]="true"
                [showActions]="false"
              />
            </div>
          </div>

          <div class="panel-card panel-card--flush">
            <div class="panel-card__body">
              <div class="guy-list-head">
                <div>
                  <h3 class="guy-list-head__title">Aguinaldo (SAC)</h3>
                  <p class="guy-list-head__meta">
                    Mitad del mejor sueldo del semestre · Total {{ sacTotalLabel() }}
                  </p>
                </div>
              </div>
              <div class="guy-filters__grid guy-filters__grid--dense mb-2">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Semestre</mat-label>
                  <mat-select [ngModel]="semester()" (ngModelChange)="onSemesterChange($event)">
                    <mat-option [value]="1">1° · Ene – jun</mat-option>
                    <mat-option [value]="2">2° · Jul – dic</mat-option>
                  </mat-select>
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Año</mat-label>
                  <mat-select [ngModel]="sacYear()" (ngModelChange)="onSacYearChange($event)">
                    @for (y of years; track y) {
                      <mat-option [value]="y">{{ y }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              </div>
              <app-data-table
                [columns]="sacColumns"
                [rows]="sacEmployees()"
                [sortable]="true"
                [showActions]="false"
              />
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    }
  `,
})
export class SalariesPage {
  private readonly filtersUi = createFiltersCollapsed('salaries-payroll');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;
  private readonly histFiltersUi = createFiltersCollapsed('salaries-history');
  readonly histFiltersCollapsed = this.histFiltersUi.collapsed;
  readonly toggleHistFilters = this.histFiltersUi.toggleFilters;

  private readonly http = inject(HttpClient);
  private readonly salariesApi = inject(SalariesApiService);
  private readonly snack = inject(MatSnackBar);
  readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  readonly shops = inject(ShopContextService);

  readonly shopId = this.shops.selectedShopId;
  readonly years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 3 + i);

  readonly tabIndex = signal(0);
  readonly includeInactive = signal(true);
  readonly salaryRows = signal<SalaryEmployee[]>([]);
  readonly salariesLoading = signal(true);
  readonly shopHolidayMult = signal(2);

  readonly historyRows = signal<SalaryHistoryRow[]>([]);
  readonly historyLoading = signal(false);
  readonly histEmployeeId = signal('');

  readonly payrollRange = new FormGroup({
    start: new FormControl<Date | null>(this.defaultMonthStart()),
    end: new FormControl<Date | null>(this.defaultMonthEnd()),
  });
  readonly period = signal<PayrollPeriod | null>(null);
  readonly payrollLoading = signal(true);
  readonly busy = signal(false);
  readonly payrollIncludeInactive = signal(true);
  readonly attendanceBonusAmount = signal(50000);
  readonly splitByShift = signal(false);

  readonly semester = signal<1 | 2>(new Date().getMonth() < 6 ? 1 : 2);
  readonly sacYear = signal(new Date().getFullYear());
  readonly sac = signal<SacResponse | null>(null);

  readonly lines = () => this.period()?.lines ?? [];
  readonly sacEmployees = () => this.sac()?.employees ?? [];

  readonly periodLabel = () => {
    const start = this.payrollRange.controls.start.value;
    const end = this.payrollRange.controls.end.value;
    if (!start || !end) return 'Elegí un rango';
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    return `${start.toLocaleDateString('es-AR', opts)} → ${end.toLocaleDateString('es-AR', opts)}`;
  };

  readonly showShiftColumn = () =>
    !!this.period()?.splitByShift || this.lines().some((l) => !!l.shiftId);

  readonly payrollTotals = () => {
    const lines = this.lines();
    let total = 0;
    let overtime = 0;
    let presentismo = 0;
    let days = 0;
    for (const l of lines) {
      total += Number(l.total) || 0;
      overtime += Number(l.overtimeAmount) || 0;
      presentismo += Number(l.attendanceBonus) || 0;
      days += Number(l.daysWorked) || 0;
    }
    return { total, overtime, presentismo, days, count: lines.length };
  };

  readonly payrollKpis = (): KpiItem[] => {
    const t = this.payrollTotals();
    const people = new Set(this.lines().map((l) => l.employeeId)).size;
    return [
      {
        label: 'A pagar',
        value: moneyAlways(t.total),
        icon: 'payments',
        tone: t.total > 0 ? 'ok' : 'muted',
        hint: t.count ? `${t.count} línea${t.count === 1 ? '' : 's'}` : 'Sin liquidar',
      },
      {
        label: 'Empleados',
        value: people || '—',
        icon: 'groups',
        tone: people ? 'default' : 'muted',
        hint: t.days ? `${t.days} días trabajados` : undefined,
      },
      {
        label: 'Presentismo',
        value: moneyAlways(t.presentismo),
        icon: 'event_available',
        tone: t.presentismo > 0 ? 'ok' : 'muted',
        hint: `$ ${this.attendanceBonusAmount().toLocaleString('es-AR')}/semana`,
      },
      {
        label: 'Horas extra',
        value: moneyAlways(t.overtime),
        icon: 'schedule',
        tone: t.overtime > 0 ? 'default' : 'muted',
      },
    ];
  };

  readonly sacTotal = () =>
    this.sacEmployees().reduce((sum, e) => sum + (Number(e.sacAmount) || 0), 0);

  readonly sacTotalLabel = () => moneyAlways(this.sacTotal());

  readonly salaryColumns: DataTableColumn[] = [
    { key: 'fullName', label: 'Empleado' },
    {
      key: 'active',
      label: 'Estado',
      format: (r) => (r['active'] ? 'Visible' : 'Oculto'),
    },
    {
      key: 'baseSalary',
      label: '$ / hora',
      format: (r) => `$ ${Number(r['baseSalary']).toLocaleString('es-AR')}`,
    },
    {
      key: 'overtimeHourRate',
      label: '$ / hora extra',
      format: (r) => {
        const set = Number(r['overtimeHourRate'] ?? 0);
        if (set > 0) return `$ ${set.toLocaleString('es-AR')}`;
        return `Igual ($ ${Number(r['overtimeHourRateEffective'] ?? 0).toLocaleString('es-AR')})`;
      },
    },
    {
      key: 'holidayPayMultiplierEffective',
      label: 'Mult. feriado',
      format: (r) => {
        const own = r['holidayPayMultiplier'];
        const eff = Number(r['holidayPayMultiplierEffective'] ?? 2);
        return own == null ? `×${eff} (local)` : `×${eff}`;
      },
    },
  ];

  readonly historyColumns: DataTableColumn[] = [
    {
      key: 'createdAt',
      label: 'Fecha',
      format: (r) => {
        const d = new Date(String(r['createdAt'] ?? ''));
        return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-AR');
      },
    },
    { key: 'employeeName', label: 'Empleado' },
    {
      key: 'source',
      label: 'Origen',
      format: (r) => SOURCE_LABEL[String(r['source'])] ?? String(r['source']),
    },
    {
      key: 'previousBaseSalary',
      label: 'Antes → ahora',
      format: (r) => {
        const prev = r['previousBaseSalary'];
        const next = Number(r['baseSalary'] ?? 0);
        const prevLabel = prev == null ? '—' : `$ ${Number(prev).toLocaleString('es-AR')}`;
        return `${prevLabel} → $ ${next.toLocaleString('es-AR')}`;
      },
    },
    {
      key: 'overtimeHourRate',
      label: 'Hora extra',
      format: (r) => `$ ${Number(r['overtimeHourRate'] ?? 0).toLocaleString('es-AR')}`,
    },
    {
      key: 'holidayPayMultiplier',
      label: 'Mult. feriado',
      format: (r) =>
        r['holidayPayMultiplier'] == null ? 'Local' : `×${r['holidayPayMultiplier']}`,
    },
    { key: 'note', label: 'Nota' },
    { key: 'createdByName', label: 'Quién' },
  ];

  readonly lineColumns = (): DataTableColumn[] => {
    const cols: DataTableColumn[] = [
      { key: 'employeeName', label: 'Empleado' },
    ];
    if (this.showShiftColumn()) {
      cols.push({
        key: 'shiftName',
        label: 'Turno',
        format: (r) => String(r['shiftName'] || 'Todos'),
      });
    }
    cols.push(
      { key: 'daysWorked', label: 'Días trabajados' },
      { key: 'holidayDays', label: 'Feriados' },
      {
        key: 'baseSalarySnapshot',
        label: '$ / hora',
        format: (r) => `$ ${Number(r['baseSalarySnapshot']).toLocaleString('es-AR')}`,
      },
      {
        key: 'overtimeAmount',
        label: 'Horas extra',
        format: (r) => `$ ${Number(r['overtimeAmount']).toLocaleString('es-AR')}`,
      },
      {
        key: 'attendanceBonus',
        label: 'Presentismo',
        format: (r) => `$ ${Number(r['attendanceBonus']).toLocaleString('es-AR')}`,
      },
      {
        key: 'total',
        label: 'Total',
        format: (r) => `$ ${Number(r['total']).toLocaleString('es-AR')}`,
      },
    );
    return cols;
  };

  readonly sacColumns: DataTableColumn[] = [
    { key: 'fullName', label: 'Empleado' },
    { key: 'monthsWorked', label: 'Meses trabajados' },
    {
      key: 'bestSalary',
      label: 'Mejor sueldo',
      format: (r) => `$ ${Number(r['bestSalary']).toLocaleString('es-AR')}`,
    },
    {
      key: 'sacAmount',
      label: 'Aguinaldo',
      format: (r) => `$ ${Number(r['sacAmount']).toLocaleString('es-AR')}`,
    },
  ];

  constructor() {
    usePageRefresh(() => {
      this.reloadSalaries();
      this.reloadHistory();
      this.reloadPayroll();
      this.reloadSac();
    });
    effect(() => {
      const shopId = this.shopId();
      this.includeInactive();
      if (!shopId) {
        this.salaryRows.set([]);
        this.salariesLoading.set(false);
        return;
      }
      this.reloadSalaries();
    });
    effect(() => {
      const shopId = this.shopId();
      if (!shopId) {
        this.period.set(null);
        this.payrollLoading.set(false);
        return;
      }
      this.reloadPayroll();
    });
    this.payrollRange.valueChanges.subscribe(() => {
      if (this.shopId() && this.hasPayrollRange()) this.reloadPayroll();
    });
    effect(() => {
      const shopId = this.shopId();
      this.sacYear();
      this.semester();
      if (!shopId) {
        this.sac.set(null);
        return;
      }
      this.reloadSac();
    });
  }

  private defaultMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  private defaultMonthEnd(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }

  private formatIso(value: Date | null | undefined): string | null {
    if (!value) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  payrollFrom(): string | null {
    return this.formatIso(this.payrollRange.controls.start.value);
  }

  payrollTo(): string | null {
    return this.formatIso(this.payrollRange.controls.end.value);
  }

  hasPayrollRange(): boolean {
    return !!this.payrollFrom() && !!this.payrollTo();
  }

  canManage(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'payroll.manage');
  }

  neverRemove = (): boolean => false;

  onTabChange(index: number): void {
    this.tabIndex.set(index);
    if (index === 1) this.reloadHistory();
  }

  onToggleInactive(value: boolean): void {
    this.includeInactive.set(value);
  }

  openSalaryEdit(row: SalaryEmployee): void {
    const shopId = this.shopId();
    const shop = this.shops.selectedShop();
    if (!shopId || !shop) return;
    const ref = this.dialogTitle.track(
      this.dialog.open(SalaryEditDialogComponent, {
        width: '480px',
        data: {
          shopId,
          shopName: shop.name,
          shopHolidayMultiplier: this.shopHolidayMult(),
          employee: row,
        },
      }),
      'Editar sueldo',
    );
    ref.afterClosed().subscribe((ok) => {
      if (ok) {
        this.reloadSalaries();
        this.reloadHistory();
      }
    });
  }

  reloadSalaries(): void {
    const shopId = this.shopId();
    if (!shopId) {
      this.salariesLoading.set(false);
      return;
    }
    this.salariesLoading.set(true);
    this.salariesApi.list(shopId, this.includeInactive()).subscribe({
      next: (data) => {
        this.salaryRows.set(data.employees);
        this.shopHolidayMult.set(data.holidayPayMultiplier);
        this.salariesLoading.set(false);
      },
      error: () => {
        this.salariesLoading.set(false);
        this.snack.open('No se pudieron cargar los sueldos', 'OK', { duration: 3000 });
      },
    });
  }

  reloadHistory(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.historyLoading.set(true);
    const employeeId = this.histEmployeeId() || undefined;
    this.salariesApi.history(shopId, { employeeId }).subscribe({
      next: (rows) => {
        this.historyRows.set(rows);
        this.historyLoading.set(false);
      },
      error: () => {
        this.historyLoading.set(false);
        this.snack.open('No se pudo cargar el historial', 'OK', { duration: 3000 });
      },
    });
  }

  async exportSalariesPdf(): Promise<void> {
    const shop = this.shops.selectedShop();
    await downloadColumnsPdf({
      title: 'Sueldos',
      subtitle: shop?.name ?? '',
      filename: `sueldos-${this.shopFileSlug(shop?.name ?? shop?.slug)}.pdf`,
      columns: this.salaryColumns,
      rows: this.salaryRows(),
    });
  }

  exportSalariesExcel(): void {
    const shopId = this.shopId();
    const shop = this.shops.selectedShop();
    if (!shopId) return;
    this.salariesApi.exportXlsx(shopId, this.includeInactive()).subscribe({
      next: (blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sueldos-${this.shopFileSlug(shop?.name ?? shop?.slug)}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
      },
      error: () => this.snack.open('No se pudo descargar el Excel', 'OK', { duration: 3000 }),
    });
  }

  onSemesterChange(value: 1 | 2): void {
    this.semester.set(value);
  }

  onSacYearChange(value: number): void {
    this.sacYear.set(value);
  }

  reloadPayroll(): void {
    const shopId = this.shopId();
    const from = this.payrollFrom();
    const to = this.payrollTo();
    if (!shopId || !from || !to) {
      this.payrollLoading.set(false);
      if (!from || !to) this.period.set(null);
      return;
    }
    this.payrollLoading.set(true);
    this.http
      .get<PayrollPeriod>(`${environment.apiUrl}/shops/${shopId}/payroll`, {
        params: { from, to },
      })
      .subscribe({
        next: (data) => {
          this.applyPeriod(data);
          this.payrollLoading.set(false);
        },
        error: () => {
          this.payrollLoading.set(false);
          this.snack.open('No se pudo cargar la liquidación', 'OK', { duration: 3000 });
        },
      });
  }

  private applyPeriod(data: PayrollPeriod): void {
    this.period.set(data);
    if (data.attendanceBonusAmount != null) {
      this.attendanceBonusAmount.set(Number(data.attendanceBonusAmount) || 0);
    }
    this.splitByShift.set(!!data.splitByShift);
  }

  asNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  reloadSac(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.http
      .get<SacResponse>(`${environment.apiUrl}/shops/${shopId}/payroll/sac`, {
        params: { year: String(this.sacYear()), semester: String(this.semester()) },
      })
      .subscribe({
        next: (data) => this.sac.set(data),
        error: () => this.snack.open('No se pudo calcular el aguinaldo', 'OK', { duration: 3000 }),
      });
  }

  generate(): void {
    const shopId = this.shopId();
    const from = this.payrollFrom();
    const to = this.payrollTo();
    if (!shopId || !from || !to) return;
    this.busy.set(true);
    this.http
      .post<PayrollPeriod>(
        `${environment.apiUrl}/shops/${shopId}/payroll/generate`,
        {
          from,
          to,
          attendanceBonusAmount: this.attendanceBonusAmount(),
          splitByShift: this.splitByShift(),
        },
        {
          params: {
            includeInactive: this.payrollIncludeInactive() ? 'true' : 'false',
          },
        },
      )
      .subscribe({
        next: (data) => {
          this.busy.set(false);
          this.applyPeriod(data);
          this.snack.open('Liquidación generada', 'OK', { duration: 2500 });
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudo generar la liquidación';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  async exportPayrollPdf(): Promise<void> {
    const shop = this.shops.selectedShop();
    const from = this.payrollFrom();
    const to = this.payrollTo();
    if (!from || !to) return;
    await downloadColumnsPdf({
      title: 'Liquidación',
      subtitle: `${shop?.name ?? ''} · ${from} → ${to}`,
      filename: `liquidacion-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${from}_${to}.pdf`,
      columns: this.lineColumns(),
      rows: this.lines(),
    });
  }

  exportPayrollExcel(): void {
    const shopId = this.shopId();
    const shop = this.shops.selectedShop();
    const from = this.payrollFrom();
    const to = this.payrollTo();
    if (!shopId || !from || !to) return;
    this.salariesApi.exportPayrollXlsx(shopId, from, to).subscribe({
      next: (blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `liquidacion-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${from}_${to}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
      },
      error: () => this.snack.open('No se pudo descargar el Excel', 'OK', { duration: 3000 }),
    });
  }

  onPayrollExport(format: ExportFormat): void {
    if (format === 'pdf') void this.exportPayrollPdf();
    else this.exportPayrollExcel();
  }

  private shopFileSlug(nameOrSlug?: string | null): string {
    return String(nameOrSlug ?? 'local')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
