import { Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { KpiStripComponent, KpiItem } from '../../shared/components/kpi-strip';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import {
  BalanceAccountRow,
  BalancesTableComponent,
} from '../../shared/components/balances-table';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { ClosingsApiService, ShopUserOption } from '../closings/closings-api.service';
import {
  CLOSING_DIFFERENCE_FILTERS,
  CLOSING_PAYMENT_FILTERS,
  CLOSING_SOURCE_FILTERS,
  CLOSING_STATUS_FILTERS,
  ClosingQueryFilters,
} from '../closings/closing-filters';
import { closingMoneyColumns } from '../closings/closing-list-columns';
import { downloadColumnsPdf } from '../../shared/utils/table-pdf';
import type { ExportFormat } from '../../shared/components/export-menu';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { isUserVisible } from '../../shared/user-visibility';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { UserAvatarComponent } from '../../shared/components/user-avatar';

@Component({
  selector: 'app-reports-page',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDatepickerModule,
    MatSnackBarModule,
    PageHeaderComponent,
    KpiStripComponent,
    DataTableComponent,
    BalancesTableComponent,
    FiltersCollapseBtnComponent,
    UserAvatarComponent,
  ],
  template: `
    <app-page-header
      title="Reportes"
      [subtitle]="shops.selectedShop()?.name ?? ''"
      [actionLabel]="canExport() ? 'Descargar' : ''"
      [actionDisabled]="!canExport() || !hasRange()"
      actionIcon="download"
      [exportMenu]="true"
      (exportPick)="onExport($event)"
    />

    <div
      class="panel-card guy-filters mb-3"
      [class.guy-filters--collapsed]="filtersCollapsed()"
    >
      <div class="guy-filters__head">
        <div>
          <h2 class="guy-filters__title">Filtros</h2>
          <p class="guy-filters__subtitle">Acotá el período y el resto de criterios del reporte</p>
        </div>
        <div class="guy-filters__tools">
          <button mat-stroked-button type="button" class="guy-filters__clear" (click)="clearFilters()">
            <mat-icon>filter_alt_off</mat-icon>
            Limpiar
          </button>
          <app-filters-collapse-btn
            [collapsed]="filtersCollapsed()"
            (toggle)="toggleFilters()"
          />
        </div>
      </div>

      <div class="guy-filters__body">
      <form class="guy-filters__grid guy-filters__grid--dense" [formGroup]="filters">
        <mat-form-field appearance="outline" class="guy-filters__span-2" subscriptSizing="dynamic">
          <mat-label>Período</mat-label>
          <mat-date-range-input [formGroup]="range" [rangePicker]="picker">
            <input matStartDate formControlName="start" placeholder="Desde" />
            <input matEndDate formControlName="end" placeholder="Hasta" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-date-range-picker #picker />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Estado</mat-label>
          <mat-select formControlName="status">
            @for (opt of statusOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Quién se lo lleva</mat-label>
          <mat-select formControlName="withdrawnByUserId">
            <mat-option value="">Todos</mat-option>
            @for (u of users(); track u.id) {
              <mat-option [value]="u.id">
                <span class="guy-user-opt">
                  <app-user-avatar
                    [userId]="u.id"
                    [avatarUrl]="u.avatarUrl ?? null"
                    [hasAvatar]="!!u.hasAvatar || !!u.avatarUrl"
                    size="sm"
                    [alt]="u.fullName"
                  />
                  <span>{{ u.fullName }}</span>
                </span>
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Creado por</mat-label>
          <mat-select formControlName="createdByUserId">
            <mat-option value="">Todos</mat-option>
            @for (u of users(); track u.id) {
              <mat-option [value]="u.id">
                <span class="guy-user-opt">
                  <app-user-avatar
                    [userId]="u.id"
                    [avatarUrl]="u.avatarUrl ?? null"
                    [hasAvatar]="!!u.hasAvatar || !!u.avatarUrl"
                    size="sm"
                    [alt]="u.fullName"
                  />
                  <span>{{ u.fullName }}</span>
                </span>
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Medio de pago</mat-label>
          <mat-select formControlName="paymentMethod">
            @for (opt of paymentOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Diferencia</mat-label>
          <mat-select formControlName="hasDifference">
            @for (opt of differenceOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Origen</mat-label>
          <mat-select formControlName="source">
            @for (opt of sourceOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Total desde</mat-label>
          <input matInput type="number" min="0" inputmode="decimal" formControlName="minTotal" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Total hasta</mat-label>
          <input matInput type="number" min="0" inputmode="decimal" formControlName="maxTotal" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="guy-filters__span-2" subscriptSizing="dynamic">
          <mat-label>Buscar en notas / retiro</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput formControlName="q" placeholder="Texto libre" />
        </mat-form-field>
      </form>

      <div class="guy-filters__actions">
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="!hasRange()"
          (click)="load()"
        >
          <mat-icon>refresh</mat-icon>
          Actualizar
        </button>
      </div>
      </div>
    </div>

    <app-kpi-strip class="mb-3" [items]="kpis()" />

    <div class="panel-card panel-card--flush mb-3">
      <div class="panel-card__body">
        <div class="guy-list-head">
          <div>
            <h2 class="guy-list-head__title">Detalle del período</h2>
            <p class="guy-list-head__meta">{{ summary()?.count ?? 0 }} cierres con los filtros aplicados</p>
          </div>
        </div>
        <app-data-table
          [columns]="columns"
          [rows]="days()"
          [loading]="loading()"
          [sortable]="true"
          [showActions]="canOpenClosing()"
          editLabel="Abrir"
          editIcon="open_in_new"
          [canRemove]="never"
          (edit)="openClosing($event)"
        />
      </div>
    </div>

    <div class="reports-extra mb-3">
      @if (balanceRows().length) {
        <div class="panel-card panel-card--flush">
          <app-balances-table
            title="Saldos"
            subtitle="Período filtrado · movimientos"
            [accounts]="balanceRows()"
            [shopId]="shops.selectedShopId()"
            [from]="formatDate(range.controls.start.value)"
            [to]="formatDate(range.controls.end.value)"
            [fileSlug]="shops.selectedShop()?.name ?? shops.selectedShop()?.slug ?? 'local'"
          />
        </div>
      }

      @if (expenseRows().length) {
        <div class="panel-card panel-card--flush">
          <div class="panel-card__body">
            <div class="guy-list-head">
              <div>
                <h2 class="guy-list-head__title">Egresos por concepto</h2>
                <p class="guy-list-head__meta">Distribución de egresos del período filtrado</p>
              </div>
            </div>
            <app-data-table
              [columns]="expenseColumns"
              [rows]="expenseRows()"
              [sortable]="true"
              [showActions]="false"
              [canRemove]="never"
            />
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .guy-user-opt {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .reports-extra {
      display: grid;
      gap: 1rem;
      align-items: start;
    }

    @media (min-width: 960px) {
      .reports-extra {
        grid-template-columns: minmax(16rem, 22rem) minmax(0, 1fr);
      }
    }
  `,
})
export class ReportsPage {
  private readonly filtersUi = createFiltersCollapsed('reports');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  readonly shops = inject(ShopContextService);
  private readonly api = inject(ClosingsApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly statusOptions = CLOSING_STATUS_FILTERS;
  readonly paymentOptions = CLOSING_PAYMENT_FILTERS;
  readonly differenceOptions = CLOSING_DIFFERENCE_FILTERS;
  readonly sourceOptions = CLOSING_SOURCE_FILTERS;
  readonly never = () => false;

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    end: new FormControl<Date | null>(new Date()),
  });

  readonly filters = new FormGroup({
    status: new FormControl('', { nonNullable: true }),
    withdrawnByUserId: new FormControl('', { nonNullable: true }),
    createdByUserId: new FormControl('', { nonNullable: true }),
    paymentMethod: new FormControl('', { nonNullable: true }),
    hasDifference: new FormControl('', { nonNullable: true }),
    source: new FormControl('', { nonNullable: true }),
    minTotal: new FormControl<number | null>(null),
    maxTotal: new FormControl<number | null>(null),
    q: new FormControl('', { nonNullable: true }),
  });

  readonly summary = signal<any>(null);
  readonly kpis = signal<KpiItem[]>([]);
  readonly days = signal<any[]>([]);
  readonly loading = signal(true);
  readonly users = signal<ShopUserOption[]>([]);
  readonly expenseRows = signal<any[]>([]);
  readonly balanceRows = signal<BalanceAccountRow[]>([]);

  readonly columns: DataTableColumn[] = [
    ...closingMoneyColumns(),
    {
      key: 'cashWithdrawn',
      label: 'Monto retiro',
      format: (r) => `$ ${Number(r['cashWithdrawn'] ?? 0).toLocaleString('es-AR')}`,
    },
  ];

  readonly expenseColumns: DataTableColumn[] = [
    { key: 'conceptName', label: 'Concepto' },
    {
      key: 'total',
      label: 'Total',
      format: (r) => `$ ${Number(r['total'] ?? 0).toLocaleString('es-AR')}`,
    },
    {
      key: 'share',
      label: 'Porcentaje',
      format: (r) => `${(Number(r['share'] ?? 0) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`,
    },
  ];

  constructor() {
    usePageRefresh(() => this.load());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) return;
      this.api.shopUsers(shopId).subscribe({
        next: (rows) =>
          this.users.set(rows.filter((u) => isUserVisible(u, 'closingsFilters'))),
        error: () => this.users.set([]),
      });
      this.load();
    });
  }

  canExport(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'reports.export');
  }

  canOpenClosing(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'closings.read');
  }

  openClosing(row: { id?: string }): void {
    if (!row?.id) return;
    void this.router.navigate(['/closings', row.id]);
  }

  hasRange(): boolean {
    return !!this.range.controls.start.value && !!this.range.controls.end.value;
  }

  clearFilters(): void {
    this.range.setValue({
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      end: new Date(),
    });
    this.filters.reset({
      status: '',
      withdrawnByUserId: '',
      createdByUserId: '',
      paymentMethod: '',
      hasDifference: '',
      source: '',
      minTotal: null,
      maxTotal: null,
      q: '',
    });
    this.load();
  }

  formatDate(d: Date | null): string | null {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private currentFilters(): ClosingQueryFilters {
    const f = this.filters.getRawValue();
    return {
      from: this.formatDate(this.range.controls.start.value),
      to: this.formatDate(this.range.controls.end.value),
      status: f.status || null,
      withdrawnByUserId: f.withdrawnByUserId || null,
      createdByUserId: f.createdByUserId || null,
      paymentMethod: f.paymentMethod || null,
      hasDifference: f.hasDifference || null,
      source: f.source || null,
      minTotal: f.minTotal,
      maxTotal: f.maxTotal,
      q: f.q || null,
    };
  }

  load(): void {
    const shopId = this.shops.selectedShopId();
    const filters = this.currentFilters();
    if (!shopId || !filters.from || !filters.to) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.summary(shopId, filters).subscribe({
      next: (s) => {
        this.summary.set(s);
        this.days.set(s.days ?? []);
        this.expenseRows.set(s.expensesByConcept ?? []);
        this.balanceRows.set(
          (s.accountBalances ?? []).map((a: { name: string; balance: number }) => ({
            name: a.name,
            balance: Number(a.balance ?? 0),
          })),
        );
        this.kpis.set([
          { label: 'Total declarado', value: `$ ${Number(s.totals.declared).toLocaleString('es-AR')}` },
          { label: 'PVS', value: `$ ${Number(s.totals.card).toLocaleString('es-AR')}` },
          { label: 'Efectivo', value: `$ ${Number(s.totals.cash).toLocaleString('es-AR')}` },
          { label: 'Retiros', value: `$ ${Number(s.totals.withdrawn).toLocaleString('es-AR')}` },
          { label: 'Egresos', value: `$ ${Number(s.expensesTotal ?? 0).toLocaleString('es-AR')}` },
        ]);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('Error al cargar reporte', 'OK', { duration: 3000 });
      },
    });
  }

  async onExport(format: ExportFormat): Promise<void> {
    if (format === 'pdf') {
      const shop = this.shops.selectedShop();
      const filters = this.currentFilters();
      await downloadColumnsPdf({
        title: 'Cierres',
        subtitle: `${shop?.name ?? ''} · ${filters.from ?? ''} a ${filters.to ?? ''}`,
        filename: `cierres-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${filters.from}_${filters.to}.pdf`,
        columns: this.columns,
        rows: this.days(),
      });
      return;
    }
    this.export();
  }

  export(): void {
    const shopId = this.shops.selectedShopId();
    const shop = this.shops.selectedShop();
    const filters = this.currentFilters();
    if (!shopId || !filters.from || !filters.to) return;
    this.api.exportExcel(shopId, filters).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cierres-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${filters.from}_${filters.to}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open('No se pudo exportar', 'OK', { duration: 3000 }),
    });
  }

  private shopFileSlug(name?: string | null): string {
    const raw = (name || 'local')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return raw || 'local';
  }
}
