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
import {
  MenuPosBringDialogComponent,
  type MenuPosBringDialogResult,
} from './menu-pos-bring-dialog';
import { downloadColumnsPdf } from '../../shared/utils/table-pdf';
import type { PdfDonutChart } from '../../shared/pdf/pdf-donut';
import type { ExportFormat } from '../../shared/components/export-menu';
import { KpiStripComponent, KpiItem } from '../../shared/components/kpi-strip';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { LoadingStateComponent } from '../../shared/components/loading-state';
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
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { parseIsoDateParts } from '../../core/shop/business-date';
import { formatMoney, formatNumber } from '../../shared/utils/money';

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
  selector: 'app-sales-menu-page',
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
    LoadingStateComponent,
    HBarChartComponent,
    DonutChartComponent,
    LineChartComponent,
    FiltersCollapseBtnComponent,
  ],
  template: `
    <app-page-header
      title="Ventas"
      [subtitle]="shops.selectedShop()?.name ?? ''"
      [actionLabel]="canDownload() ? 'Descargar' : ''"
      [actionDisabled]="!canDownload() || !hasRange()"
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
            @if (includePosSales()) {
              Pedidos online, mostrador y comanda · incluye ventas POS enlazadas
            } @else {
              Pedidos online, mostrador y comanda · platos enlazados a Restosoft
            }
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
          <mat-label>Forma de pago</mat-label>
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
        <button
          mat-stroked-button
          type="button"
          [disabled]="!hasRange() || loading()"
          (click)="openBringFromPos()"
          matTooltip="Sumar en este reporte las ventas Restosoft de platos enlazados a la carta"
        >
          <mat-icon>restaurant_menu</mat-icon>
          Traer de ventas POS
        </button>
        @if (includePosSales()) {
          <button mat-stroked-button type="button" (click)="clearPosMerge()" [disabled]="loading()">
            <mat-icon>link_off</mat-icon>
            Quitar POS
          </button>
        }
      </div>
      </div>
    </div>

    @if (loading() && !summary()) {
      <app-loading-state
        [loading]="true"
        [skeleton]="true"
        title="Cargando ventas"
        message="Pedidos online, mostrador y comanda"
      />
    } @else {
      @if (loading()) {
        <app-loading-state
          [refreshing]="true"
          refreshTitle="Actualizando ventas"
          refreshMessage="Recalculando el período"
        />
      }
      <app-kpi-strip class="mb-3" [items]="kpis()" [loading]="loading()" />

      <div class="charts-grid mb-3">
        <app-line-chart
          class="charts-grid__wide"
          title="Importe por día"
          subtitle="Evolución del período filtrado"
          [points]="dayAmountPoints()"
        />
        <app-donut-chart
          title="Mix por rubro"
          subtitle="% del importe (rubro Restosoft si está enlazado)"
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
          subtitle="Cobro del pedido / mesa"
          [items]="paymentSlices()"
        />
        <app-hbar-chart
          title="Pareto 80/20"
          subtitle="Acumulado de platos por importe"
          [items]="paretoSlices()"
          [maxItems]="15"
        />
        <app-line-chart
          title="Pedidos por día"
          subtitle="Cantidad de pedidos / tickets"
          [points]="dayTicketPoints()"
        />
      </div>

      <div class="panel-card panel-card--flush mb-3">
        <mat-tab-group animationDuration="200ms" class="sales-tabs">
          <mat-tab label="Por plato">
            <div class="panel-card__body">
              <div class="guy-list-head">
                <div>
                  <h2 class="guy-list-head__title">Ventas por plato</h2>
                  <p class="guy-list-head__meta">
                    {{ summary()?.totals?.productCount ?? 0 }} platos · enlazados a Restosoft aparecen siempre
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
                    Rubro del catálogo POS cuando el plato está enlazado a la carta.
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
                  <p class="guy-list-head__meta">Datos por fecha de negocio del local</p>
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
    }
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
export class SalesMenuPage {
  private readonly filtersUi = createFiltersCollapsed('sales-menu');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  readonly shops = inject(ShopContextService);
  private readonly api = inject(ClosingsApiService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  /** Merge de ventas POS enlazadas (sesión de esta pantalla). */
  readonly includePosSales = signal(false);
  readonly posMenuItemIds = signal<string[] | null>(null);

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
  readonly loading = signal(true);
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
      format: (r) => formatNumber(r['qty'] ?? 0, { maximumFractionDigits: 3 }),
    },
    {
      key: 'amount',
      label: 'Importe',
      format: (r) => formatMoney(r['amount'] ?? 0, { spaced: true }),
    },
    { key: 'ticketCount', label: 'Pedidos' },
    {
      key: 'share',
      label: '%',
      format: (r) =>
        `${(Number(r['share'] ?? 0) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`,
    },
  ];

  readonly categoryColumns: DataTableColumn[] = [
    { key: 'category', label: 'Rubro' },
    { key: 'productCount', label: 'Platos' },
    {
      key: 'qty',
      label: 'Cantidad',
      format: (r) => formatNumber(r['qty'] ?? 0, { maximumFractionDigits: 3 }),
    },
    {
      key: 'amount',
      label: 'Importe',
      format: (r) => formatMoney(r['amount'] ?? 0, { spaced: true }),
    },
    { key: 'ticketCount', label: 'Pedidos' },
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
      format: (r) => formatNumber(r['qty'] ?? 0, { maximumFractionDigits: 3 }),
    },
    {
      key: 'amount',
      label: 'Importe',
      format: (r) => formatMoney(r['amount'] ?? 0, { spaced: true }),
    },
    { key: 'ticketCount', label: 'Pedidos' },
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

  canDownload(): boolean {
    return (
      hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'reports.export') ||
      hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'reportsSales.read')
    );
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
    this.includePosSales.set(false);
    this.posMenuItemIds.set(null);
    this.load();
  }

  clearPosMerge(): void {
    this.includePosSales.set(false);
    this.posMenuItemIds.set(null);
    this.load();
  }

  openBringFromPos(): void {
    const shopId = this.shops.selectedShopId();
    const filters = this.currentFilters();
    if (!shopId || !filters) return;
    const ref = this.dialog.open(MenuPosBringDialogComponent, {
      width: 'min(640px, 96vw)',
      maxHeight: '90vh',
      data: {
        shopId,
        shopName: this.shops.selectedShop()?.name ?? '',
        filters: { ...filters, includePosSales: false, posMenuItemIds: null },
      },
    });
    ref.afterClosed().subscribe((result: MenuPosBringDialogResult | undefined) => {
      if (!result?.menuItemIds?.length) return;
      this.includePosSales.set(true);
      this.posMenuItemIds.set(result.menuItemIds);
      this.load();
      this.snack.open(
        `Se sumaron ${result.menuItemIds.length} platos desde Ventas POS`,
        'OK',
        { duration: 3000 },
      );
    });
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
      includePosSales: this.includePosSales() || undefined,
      posMenuItemIds: this.includePosSales() ? this.posMenuItemIds() : null,
    };
  }

  load(): void {
    const shopId = this.shops.selectedShopId();
    const filters = this.currentFilters();
    if (!shopId || !filters) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.salesMenuSummary(shopId, filters).subscribe({
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
        const t = s.totals ?? {
          qty: 0,
          amount: 0,
          lineCount: 0,
          productCount: 0,
          categoryCount: 0,
          ticketCount: 0,
          avgTicketAmount: 0,
          dishesPerTicket: 0,
          top10Share: 0,
        };
        this.kpis.set([
          {
            label: 'Importe total',
            value: formatMoney(t.amount, { spaced: true }),
          },
          {
            label: 'Unidades',
            value: formatNumber(t.qty, { maximumFractionDigits: 1 }),
          },
          { label: 'Pedidos', value: String(t.ticketCount) },
          { label: 'Platos', value: String(t.productCount) },
          { label: 'Rubros', value: String(t.categoryCount) },
          {
            label: 'Ticket prom.',
            value: formatMoney(t.avgTicketAmount, {
              spaced: true,
              maximumFractionDigits: 0,
              minimumFractionDigits: 0,
            }),
          },
          {
            label: 'Platos / pedido',
            value: formatNumber(t.dishesPerTicket ?? 0, { maximumFractionDigits: 2 }),
          },
          {
            label: '% top 10',
            value: `${((t.top10Share ?? 0) * 100).toLocaleString('es-AR', {
              maximumFractionDigits: 1,
            })}%`,
          },
        ]);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('Error al cargar ventas', 'OK', { duration: 3000 });
      },
    });
  }

  async onExport(format: ExportFormat): Promise<void> {
    if (!this.canDownload()) return;
    const shop = this.shops.selectedShop();
    const filters = this.currentFilters();
    if (format === 'xlsx') {
      this.snack.open('Por ahora descargá PDF; Excel de Ventas llega en una próxima versión', 'OK', {
        duration: 3500,
      });
      return;
    }
    const chart: PdfDonutChart = {
      title: 'Mix por rubro',
      subtitle: '% del importe en el período',
      items: this.categorySlices(),
    };
    await downloadColumnsPdf({
      title: 'Ventas',
      subtitle: `${shop?.name ?? ''} · ${filters?.from ?? ''} a ${filters?.to ?? ''}`,
      filename: `ventas-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${filters?.from}_${filters?.to}.pdf`,
      columns: this.productColumns,
      rows: this.products(),
      chart,
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
