import { Component, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { environment } from '../../../environments/environment';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { payrollStatusLabel } from '../../core/i18n/labels';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { BusyLabelComponent } from '../../shared/components/busy-label';

interface PayrollLine {
  id: string;
  employeeId: string;
  employeeName: string | null;
  daysWorked: number;
  holidayDays: number;
  baseSalarySnapshot: number;
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
  status: 'DRAFT' | 'LOCKED';
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

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

@Component({
  selector: 'app-payroll-page',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    PageHeaderComponent,
    DataTableComponent,
    BusyLabelComponent,
    FiltersCollapseBtnComponent,
  ],
  template: `
    <app-page-header
      title="Liquidaciones"
      [subtitle]="shops.selectedShop()?.name ?? 'Sin local'"
    />

    @if (!shopId()) {
      <div class="panel-card">Seleccioná un local en el menú lateral.</div>
    } @else {
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
        </div>
        @if (canManage()) {
          <div class="guy-filters__actions">
            <button
              mat-flat-button
              color="primary"
              type="button"
              [disabled]="busy() || (isLocked() && !auth.isAdmin())"
              (click)="generate()"
            >
              <app-busy-label [busy]="busy()" busyLabel="Generando…">
                <mat-icon>calculate</mat-icon>
                Generar
              </app-busy-label>
            </button>
            @if (isLocked() && auth.isAdmin()) {
              <button
                mat-stroked-button
                type="button"
                [disabled]="busy() || !hasPeriod()"
                (click)="unlock()"
              >
                <mat-icon>lock_open</mat-icon>
                Reabrir liquidación
              </button>
            } @else {
              <button
                mat-stroked-button
                type="button"
                [disabled]="busy() || isLocked() || !hasPeriod()"
                (click)="lock()"
              >
                <mat-icon>lock</mat-icon>
                Cerrar liquidación
              </button>
            }
          </div>
        }
        </div>
      </div>

      <div class="panel-card panel-card--flush mb-3">
        <div class="panel-card__body">
          <div class="guy-list-head">
            <div>
              <h3 class="guy-list-head__title">Líneas de liquidación</h3>
              <p class="guy-list-head__meta">Estado: {{ statusLabel() }}</p>
            </div>
          </div>
          <app-data-table
            [columns]="lineColumns"
            [rows]="lines()"
            [loading]="loading()"
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
              <p class="guy-list-head__meta">Mitad del mejor sueldo del semestre</p>
            </div>
          </div>

          <div class="guy-filters__grid guy-filters__grid--dense mb-2">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Semestre</mat-label>
              <mat-select [ngModel]="semester()" (ngModelChange)="onSemesterChange($event)">
                <mat-option [value]="1">1° (Ene - Jun)</mat-option>
                <mat-option [value]="2">2° (Jul - Dic)</mat-option>
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
    }
  `,
})
export class PayrollPage {
  private readonly filtersUi = createFiltersCollapsed('payroll');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  readonly auth = inject(AuthService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  readonly shops = inject(ShopContextService);

  readonly shopId = this.shops.selectedShopId;
  readonly months = MONTH_LABELS.map((label, idx) => ({ value: idx + 1, label }));
  readonly years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 3 + i);

  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);
  readonly period = signal<PayrollPeriod | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);

  readonly semester = signal<1 | 2>(new Date().getMonth() < 6 ? 1 : 2);
  readonly sacYear = signal(new Date().getFullYear());
  readonly sac = signal<SacResponse | null>(null);

  readonly lines = () => this.period()?.lines ?? [];
  readonly sacEmployees = () => this.sac()?.employees ?? [];
  readonly hasPeriod = () => !!this.period()?.id;
  readonly isLocked = () => this.period()?.status === 'LOCKED';
  readonly statusLabel = () => payrollStatusLabel(this.period()?.status ?? 'DRAFT');

  readonly lineColumns: DataTableColumn[] = [
    { key: 'employeeName', label: 'Empleado' },
    { key: 'daysWorked', label: 'Días trabajados' },
    { key: 'holidayDays', label: 'Feriados' },
    {
      key: 'baseSalarySnapshot',
      label: 'Sueldo base',
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
  ];

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
      this.reload();
      this.reloadSac();
    });
    effect(() => {
      const shopId = this.shopId();
      this.year();
      this.month();
      if (!shopId) {
        this.period.set(null);
        this.loading.set(false);
        return;
      }
      this.reload();
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

  canManage(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'payroll.manage');
  }

  onMonthChange(value: number): void {
    this.month.set(value);
  }

  onYearChange(value: number): void {
    this.year.set(value);
  }

  onSemesterChange(value: 1 | 2): void {
    this.semester.set(value);
  }

  onSacYearChange(value: number): void {
    this.sacYear.set(value);
  }

  reload(): void {
    const shopId = this.shopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.http
      .get<PayrollPeriod>(`${environment.apiUrl}/shops/${shopId}/payroll/${this.year()}/${this.month()}`)
      .subscribe({
        next: (data) => {
          this.period.set(data);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snack.open('No se pudo cargar la liquidación', 'OK', { duration: 3000 });
        },
      });
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
    if (!shopId) return;
    this.busy.set(true);
    this.http
      .post<PayrollPeriod>(
        `${environment.apiUrl}/shops/${shopId}/payroll/${this.year()}/${this.month()}/generate`,
        {},
      )
      .subscribe({
        next: (data) => {
          this.busy.set(false);
          this.period.set(data);
          this.snack.open('Liquidación generada', 'OK', { duration: 2500 });
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudo generar la liquidación';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  async lock(): Promise<void> {
    const shopId = this.shopId();
    if (!shopId) return;
    const ok = await this.confirmDialog.confirm(
      'Cerrar liquidación',
      `¿Cerrar la liquidación de ${this.months[this.month() - 1].label} ${this.year()}? Ya no se podrá modificar.`,
    );
    if (!ok) return;
    this.busy.set(true);
    this.http
      .post<PayrollPeriod>(
        `${environment.apiUrl}/shops/${shopId}/payroll/${this.year()}/${this.month()}/lock`,
        {},
      )
      .subscribe({
        next: (data) => {
          this.busy.set(false);
          this.period.set(data);
          this.snack.open('Liquidación cerrada', 'OK', { duration: 2500 });
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudo cerrar la liquidación';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  async unlock(): Promise<void> {
    const shopId = this.shopId();
    if (!shopId || !this.auth.isAdmin()) return;
    const ok = await this.confirmDialog.confirm(
      'Reabrir liquidación',
      `¿Reabrir la liquidación de ${this.months[this.month() - 1].label} ${this.year()}?`,
    );
    if (!ok) return;
    this.busy.set(true);
    this.http
      .post<PayrollPeriod>(
        `${environment.apiUrl}/shops/${shopId}/payroll/${this.year()}/${this.month()}/unlock`,
        {},
      )
      .subscribe({
        next: (data) => {
          this.busy.set(false);
          this.period.set(data);
          this.snack.open('Liquidación reabierta', 'OK', { duration: 2500 });
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudo reabrir la liquidación';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }
}
