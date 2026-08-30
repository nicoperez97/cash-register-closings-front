import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { downloadColumnsPdf } from '../../shared/utils/table-pdf';
import type { ExportFormat } from '../../shared/components/export-menu';
import { KpiStripComponent, KpiItem } from '../../shared/components/kpi-strip';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import {
  DonutChartComponent,
  HBarChartComponent,
  LineChartComponent,
  ChartPoint,
  ChartSlice,
} from '../../shared/components/sales-charts';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import {
  ClosingsApiService,
  SalesProductsFilters,
  SalesProductsSummary,
} from '../closings/closings-api.service';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { PosSalesImportDialogComponent } from './pos-sales-import-dialog';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { parseIsoDateParts } from '../../core/shop/business-date';

/** Fecha corta es-AR: mié. 18 mar. */
function formatDayLabelEs(isoDate: string): string {
  const p = parseIsoDateParts(String(isoDate ?? ''));
  if (!p) return String(isoDate ?? '');
  const dt = new Date(Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0));
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(dt);
}

@Component({
  selector: 'app-sales-products-page',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDatepickerModule,
    MatTabsModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    PageHeaderComponent,
    KpiStripComponent,
    DataTableComponent,
    HBarChartComponent,
    DonutChartComponent,
    LineChartComponent,
    FiltersCollapseBtnComponent,
  ],
  template: `
    <app-page-header
      title="Ventas POS"
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
          <p class="guy-filters__subtitle">
            Ventas POS: platos, rubros y evolución diaria
          </p>
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
          <mat-label>Rubro</mat-label>
          <mat-select formControlName="category" (selectionChange)="onCategoryChange()">
            <mat-option value="">Todos</mat-option>
            @for (c of categoryOptions(); track c) {
              <mat-option [value]="c">{{ c }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Forma de pago POS</mat-label>
          <mat-select formControlName="paymentCode">
            <mat-option value="">Todas</mat-option>
            @for (p of paymentOptions(); track p) {
              <mat-option [value]="p">{{ p }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="guy-filters__span-2" subscriptSizing="dynamic">
          <mat-label>Buscar plato / código / rubro</mat-label>
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
        @if (canExport()) {
          <button
            mat-stroked-button
            type="button"
            matTooltip="Solo estadísticas de platos y mesas. No afecta movimientos, cuentas ni cierres."
            (click)="openPosSalesImport()"
          >
            <mat-icon>upload_file</mat-icon>
            Importar Restosoft / POS
          </button>
        }
      </div>
      </div>
    </div>

    <app-kpi-strip class="mb-3" [items]="kpis()" />

    <div class="charts-grid mb-3">
      <app-line-chart
        class="charts-grid__wide"
        title="Importe por día"
        subtitle="Evolución del período filtrado"
        [points]="dayAmountPoints()"
      />
      <app-donut-chart
        title="Mix por rubro"
        subtitle="% del importe"
        [items]="categorySlices()"
      />
      <app-hbar-chart
        title="Top platos"
        subtitle="Por importe"
        [items]="topProductSlices()"
        [maxItems]="10"
      />
      <app-donut-chart
        title="Forma de pago"
        subtitle="Importe POS"
        [items]="paymentSlices()"
      />
      <app-line-chart
        title="Tickets por día"
        subtitle="Cantidad de tickets"
        [points]="dayTicketPoints()"
      />
      <app-hbar-chart
        title="Pareto 80/20"
        subtitle="Acumulado de platos por importe"
        [items]="paretoSlices()"
        [maxItems]="15"
      />
      <app-line-chart
        class="charts-grid__wide"
        title="Vs mismo día semana anterior"
        subtitle="Δ % importe"
        [points]="weekdayDeltaPoints()"
      />
    </div>

    <div class="panel-card panel-card--flush mb-3">
      <mat-tab-group animationDuration="0ms" class="sales-tabs">
        <mat-tab label="Por plato">
          <div class="panel-card__body">
            <div class="guy-list-head">
              <div>
                <h2 class="guy-list-head__title">Ventas por plato</h2>
                <p class="guy-list-head__meta">
                  {{ summary()?.totals?.productCount ?? 0 }} platos · ordenados por importe
                </p>
              </div>
            </div>
            <app-data-table
              [columns]="productColumns"
              [rows]="products()"
              [sortable]="true"
              [showActions]="false"
              [canRemove]="never"
            />
          </div>
        </mat-tab>
        <mat-tab label="Por rubro">
          <div class="panel-card__body">
            <div class="guy-list-head">
              <div>
                <h2 class="guy-list-head__title">Ventas por rubro</h2>
                <p class="guy-list-head__meta">
                  Asigná rubros en Admin → Platos y rubros. Sin rubro aparecen como “Sin rubro”.
                </p>
              </div>
            </div>
            <app-data-table
              [columns]="categoryColumns"
              [rows]="categories()"
              [sortable]="true"
              [showActions]="false"
              [canRemove]="never"
            />
          </div>
        </mat-tab>
        <mat-tab label="Por día">
          <div class="panel-card__body">
            <div class="guy-list-head">
              <div>
                <h2 class="guy-list-head__title">Serie diaria</h2>
                <p class="guy-list-head__meta">Importe, unidades y tickets por fecha de negocio</p>
              </div>
            </div>
            <app-data-table
              [columns]="dayColumns"
              [rows]="byDay()"
              [sortable]="true"
              [showActions]="false"
              [canRemove]="never"
            />
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `
    .sales-tabs {
      display: block;
    }
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.85rem;
    }
    .charts-grid__wide {
      grid-column: 1 / -1;
    }
    @media (max-width: 900px) {
      .charts-grid {
        grid-template-columns: 1fr;
      }
      .charts-grid__wide {
        grid-column: auto;
      }
    }
  `,
})
export class SalesProductsPage {
  private readonly filtersUi = createFiltersCollapsed('sales-products');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  readonly shops = inject(ShopContextService);
  private readonly api = inject(ClosingsApiService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);

  readonly never = () => false;

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    end: new FormControl<Date | null>(new Date()),
  });

  readonly filters = new FormGroup({
    category: new FormControl('', { nonNullable: true }),
    subcategory: new FormControl('', { nonNullable: true }),
    paymentCode: new FormControl('', { nonNullable: true }),
    q: new FormControl('', { nonNullable: true }),
  });

  readonly summary = signal<SalesProductsSummary | null>(null);
  readonly kpis = signal<KpiItem[]>([]);
  readonly products = signal<Record<string, unknown>[]>([]);
  readonly categories = signal<Record<string, unknown>[]>([]);
  readonly subcategories = signal<Record<string, unknown>[]>([]);
  readonly byDay = signal<Record<string, unknown>[]>([]);
  readonly byPayment = signal<Record<string, unknown>[]>([]);
  readonly categoryOptions = signal<string[]>([]);
  readonly allSubcategoryOptions = signal<string[]>([]);
  readonly paymentOptions = signal<string[]>([]);
  /** Para que el filtro de subrubro reaccione al cambio de rubro. */
  readonly selectedCategory = signal('');

  readonly subcategoryOptions = computed(() => {
    const cat = this.selectedCategory();
    const all = this.allSubcategoryOptions();
    if (!cat) return all;
    const fromRows = this.subcategories()
      .filter((r) => String(r['category'] ?? '') === cat)
      .map((r) => String(r['subcategory'] ?? ''))
      .filter(Boolean);
    // Si aún no hay filas filtradas (antes del reload), usar opciones globales
    if (fromRows.length) return [...new Set(fromRows)].sort((a, b) => a.localeCompare(b, 'es'));
    return all;
  });

  readonly dayAmountPoints = computed<ChartPoint[]>(() =>
    this.byDay().map((r) => ({
      label: formatDayLabelEs(String(r['date'] ?? '')),
      value: Number(r['amount'] ?? 0),
    })),
  );

  readonly dayTicketPoints = computed<ChartPoint[]>(() =>
    this.byDay().map((r) => ({
      label: formatDayLabelEs(String(r['date'] ?? '')),
      value: Number(r['ticketCount'] ?? 0),
    })),
  );

  readonly categorySlices = computed<ChartSlice[]>(() =>
    this.categories().map((r) => ({
      label: String(r['category'] ?? 'Sin rubro'),
      value: Number(r['amount'] ?? 0),
    })),
  );

  readonly subcategorySlices = computed<ChartSlice[]>(() => {
    const cat = this.selectedCategory();
    const rows = this.subcategories();
    return rows.map((r) => ({
      label:
        cat || rows.length <= 8
          ? String(r['subcategory'] ?? '')
          : `${r['category']} · ${r['subcategory']}`,
      value: Number(r['amount'] ?? 0),
    }));
  });

  readonly topProductSlices = computed<ChartSlice[]>(() =>
    this.products()
      .slice(0, 10)
      .map((r) => ({
        label: String(r['productName'] || r['productCode'] || '—'),
        value: Number(r['amount'] ?? 0),
      })),
  );

  readonly paymentSlices = computed<ChartSlice[]>(() =>
    this.byPayment().map((r) => ({
      label: String(r['paymentCode'] ?? 'Sin pago'),
      value: Number(r['amount'] ?? 0),
    })),
  );

  readonly paretoSlices = computed<ChartSlice[]>(() =>
    (this.summary()?.pareto ?? []).map((p) => ({
      label: `${p.label} (${(p.cumulativeShare * 100).toFixed(0)}%)`,
      value: p.amount,
    })),
  );

  readonly weekdayDeltaPoints = computed<ChartPoint[]>(() =>
    (this.summary()?.sameWeekdayCompare ?? []).map((d) => ({
      label: formatDayLabelEs(d.date),
      value: d.deltaPct ?? 0,
    })),
  );

  readonly productColumns: DataTableColumn[] = [
    { key: 'productCode', label: 'Código' },
    { key: 'productName', label: 'Plato' },
    {
      key: 'category',
      label: 'Rubro',
      format: (r) => String(r['category'] || 'Sin rubro'),
    },
    {
      key: 'qty',
      label: 'Cantidad',
      format: (r) => Number(r['qty'] ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 3 }),
    },
    {
      key: 'amount',
      label: 'Importe',
      format: (r) => `$ ${Number(r['amount'] ?? 0).toLocaleString('es-AR')}`,
    },
    { key: 'ticketCount', label: 'Tickets' },
    {
      key: 'share',
      label: '%',
      format: (r) =>
        `${(Number(r['share'] ?? 0) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`,
    },
    {
      key: 'ticketContribution',
      label: '$/ticket',
      format: (r) =>
        `$ ${Number(r['ticketContribution'] ?? 0).toLocaleString('es-AR', {
          maximumFractionDigits: 0,
        })}`,
    },
    {
      key: 'trendPct',
      label: 'Tendencia',
      format: (r) => {
        const v = r['trendPct'];
        if (v == null || !Number.isFinite(Number(v))) return '—';
        const n = Number(v);
        return `${n > 0 ? '+' : ''}${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
      },
    },
  ];

  readonly categoryColumns: DataTableColumn[] = [
    { key: 'category', label: 'Rubro' },
    { key: 'productCount', label: 'Platos' },
    {
      key: 'qty',
      label: 'Cantidad',
      format: (r) => Number(r['qty'] ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 3 }),
    },
    {
      key: 'amount',
      label: 'Importe',
      format: (r) => `$ ${Number(r['amount'] ?? 0).toLocaleString('es-AR')}`,
    },
    { key: 'ticketCount', label: 'Tickets' },
    {
      key: 'share',
      label: '%',
      format: (r) =>
        `${(Number(r['share'] ?? 0) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`,
    },
  ];

  readonly subcategoryColumns: DataTableColumn[] = [
    { key: 'category', label: 'Rubro' },
    { key: 'subcategory', label: 'Subrubro' },
    { key: 'productCount', label: 'Platos' },
    {
      key: 'qty',
      label: 'Cantidad',
      format: (r) => Number(r['qty'] ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 3 }),
    },
    {
      key: 'amount',
      label: 'Importe',
      format: (r) => `$ ${Number(r['amount'] ?? 0).toLocaleString('es-AR')}`,
    },
    { key: 'ticketCount', label: 'Tickets' },
    {
      key: 'share',
      label: '%',
      format: (r) =>
        `${(Number(r['share'] ?? 0) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`,
    },
  ];

  readonly dayColumns: DataTableColumn[] = [
    {
      key: 'date',
      label: 'Fecha',
      format: (r) => formatDayLabelEs(String(r['date'] ?? '')),
    },
    {
      key: 'qty',
      label: 'Cantidad',
      format: (r) => Number(r['qty'] ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 3 }),
    },
    {
      key: 'amount',
      label: 'Importe',
      format: (r) => `$ ${Number(r['amount'] ?? 0).toLocaleString('es-AR')}`,
    },
    { key: 'ticketCount', label: 'Tickets' },
  ];

  constructor() {
    usePageRefresh(() => this.load());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) return;
      this.load();
    });
  }

  onCategoryChange(): void {
    this.selectedCategory.set(this.filters.controls.category.value);
    this.filters.controls.subcategory.setValue('');
  }

  canExport(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'reports.export');
  }

  openPosSalesImport(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const shop = this.shops.selectedShop();
    if (!shop?.salesSystemId) {
      this.snack.open(
        'Configurá el sistema de ventas (Restosoft / WeMenu) en Configuración del local → Operación',
        'OK',
        { duration: 4500 },
      );
      return;
    }
    this.api.listSalesSystems().subscribe({
      next: (systems) => {
        const sys = systems.find((s) => s.id === shop.salesSystemId);
        this.openImportDialog(shopId, shop.name ?? 'Local', sys?.name ?? null);
      },
      error: () => {
        this.openImportDialog(shopId, shop.name ?? 'Local', null);
      },
    });
  }

  private openImportDialog(
    shopId: string,
    shopName: string,
    salesSystemName: string | null,
  ): void {
    this.dialogTitle
      .track(
        this.dialog.open(PosSalesImportDialogComponent, {
          width: '780px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { shopId, shopName, salesSystemName },
        }),
        'Importar ventas POS',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.load();
      });
  }

  hasRange(): boolean {
    return !!this.range.controls.start.value && !!this.range.controls.end.value;
  }

  clearFilters(): void {
    this.range.setValue({
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      end: new Date(),
    });
    this.filters.reset({ category: '', subcategory: '', paymentCode: '', q: '' });
    this.selectedCategory.set('');
    this.load();
  }

  private formatDate(d: Date | null): string | null {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private currentFilters(): SalesProductsFilters | null {
    const from = this.formatDate(this.range.controls.start.value);
    const to = this.formatDate(this.range.controls.end.value);
    if (!from || !to) return null;
    const f = this.filters.getRawValue();
    return {
      from,
      to,
      category: f.category || null,
      subcategory: null,
      paymentCode: f.paymentCode || null,
      q: f.q || null,
    };
  }

  load(): void {
    const shopId = this.shops.selectedShopId();
    const filters = this.currentFilters();
    if (!shopId || !filters) return;
    this.api.salesProductsSummary(shopId, filters).subscribe({
      next: (s) => {
        this.selectedCategory.set(filters.category ?? '');
        this.summary.set(s);
        this.products.set((s.products ?? []) as Record<string, unknown>[]);
        this.categories.set((s.categories ?? []) as Record<string, unknown>[]);
        this.subcategories.set((s.subcategories ?? []) as Record<string, unknown>[]);
        this.byDay.set((s.byDay ?? []) as Record<string, unknown>[]);
        this.byPayment.set((s.byPayment ?? []) as Record<string, unknown>[]);
        this.categoryOptions.set(s.filterOptions?.categories ?? []);
        this.allSubcategoryOptions.set(s.filterOptions?.subcategories ?? []);
        this.paymentOptions.set(s.filterOptions?.paymentCodes ?? []);
        const t = s.totals;
        const delta =
          t.amountDeltaPct != null && Number.isFinite(t.amountDeltaPct)
            ? `${t.amountDeltaPct > 0 ? '+' : ''}${t.amountDeltaPct.toLocaleString('es-AR', {
                maximumFractionDigits: 1,
              })}%`
            : undefined;
        this.kpis.set([
          {
            label: 'Importe total',
            value: `$ ${Number(t.amount).toLocaleString('es-AR')}`,
            hint: delta,
          },
          {
            label: 'Unidades',
            value: Number(t.qty).toLocaleString('es-AR', { maximumFractionDigits: 1 }),
          },
          { label: 'Tickets', value: String(t.ticketCount) },
          { label: 'Platos', value: String(t.productCount) },
          { label: 'Rubros', value: String(t.categoryCount) },
          {
            label: 'Ticket prom.',
            value: `$ ${Number(t.avgTicketAmount).toLocaleString('es-AR', {
              maximumFractionDigits: 0,
            })}`,
          },
          {
            label: 'Ticket máx / mín',
            value: `$ ${Number(t.maxTicketAmount ?? 0).toLocaleString('es-AR', {
              maximumFractionDigits: 0,
            })} / $ ${Number(t.minTicketAmount ?? 0).toLocaleString('es-AR', {
              maximumFractionDigits: 0,
            })}`,
          },
          {
            label: 'Platos / ticket',
            value: Number(t.dishesPerTicket ?? 0).toLocaleString('es-AR', {
              maximumFractionDigits: 2,
            }),
          },
          {
            label: '% top 10',
            value: `${((t.top10Share ?? 0) * 100).toLocaleString('es-AR', {
              maximumFractionDigits: 1,
            })}%`,
          },
        ]);
      },
      error: () => this.snack.open('Error al cargar ventas por plato', 'OK', { duration: 3000 }),
    });
  }

  async onExport(format: ExportFormat): Promise<void> {
    if (format === 'pdf') {
      const shop = this.shops.selectedShop();
      const filters = this.currentFilters();
      await downloadColumnsPdf({
        title: 'Ventas POS',
        subtitle: `${shop?.name ?? ''} · ${filters?.from ?? ''} a ${filters?.to ?? ''}`,
        filename: `ventas-platos-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${filters?.from}_${filters?.to}.pdf`,
        columns: this.productColumns,
        rows: this.products(),
      });
      return;
    }
    this.export();
  }

  export(): void {
    const shopId = this.shops.selectedShopId();
    const shop = this.shops.selectedShop();
    const filters = this.currentFilters();
    if (!shopId || !filters) return;
    this.api.salesProductsExport(shopId, filters).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ventas-platos-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${filters.from}_${filters.to}.xlsx`;
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
