/** Reporte de movimientos agrupados por concepto. */
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
import { conceptKindLabel } from '../../core/i18n/labels';
import {
  ClosingsApiService,
  ConceptsReportFilters,
  ConceptsReportSummary,
} from '../closings/closings-api.service';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { parseIsoDateParts } from '../../core/shop/business-date';

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

function formatDelta(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
}

function money(value: unknown): string {
  return `$ ${Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function percent(share: unknown): string {
  return `${(Number(share || 0) * 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function kindBannerLabel(kind?: string | null): string {
  if (kind === 'EXPENSE') return 'Egresos';
  if (kind === 'INCOME') return 'Ingresos';
  if (kind === 'TRANSFER') return 'Transferencias';
  return 'Conceptos';
}

function periodBanner(kind: string | null | undefined, from?: string | null, to?: string | null): string {
  const label = kindBannerLabel(kind).toUpperCase();
  const a = parseIsoDateParts(from ?? '');
  const b = parseIsoDateParts(to ?? '');
  if (!a || !b) return label;
  if (a.year === b.year && a.month === b.month) {
    return `${label} ${MONTHS_ES[a.month - 1]?.toUpperCase() ?? ''} ${a.year}`.trim();
  }
  const fmt = (p: { year: number; month: number; day: number }) =>
    `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year}`;
  return `${label} ${fmt(a)} – ${fmt(b)}`;
}

@Component({
  selector: 'app-concepts-report-page',
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
      title="Conceptos"
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
          <p class="guy-filters__subtitle">Importe por concepto validado, con participación sobre el total</p>
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
            <mat-label>Tipo</mat-label>
            <mat-select formControlName="kind">
              <mat-option value="">Todos</mat-option>
              <mat-option value="EXPENSE">Egreso</mat-option>
              <mat-option value="INCOME">Ingreso</mat-option>
              <mat-option value="TRANSFER">Transferencia</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Concepto</mat-label>
            <mat-select formControlName="conceptId">
              <mat-option value="">Todos</mat-option>
              @for (c of conceptOptions(); track c.id ?? c.name) {
                <mat-option [value]="c.id || '__none'">{{ c.name }}</mat-option>
              }
            </mat-select>
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

    <p class="hint mb-3">
      Se arma con los movimientos del local en el período. El tipo se toma del concepto;
      si no hay concepto, se infiere por las cuentas.
      @if (comparisonHint()) {
        <span> · {{ comparisonHint() }}</span>
      }
    </p>

    <div class="panel-card panel-card--flush concept-report mb-3">
      <div class="concept-report__banner">{{ tableTitle() }}</div>
      <div class="concept-report__wrap">
        @if (!conceptRows().length) {
          <div class="guy-empty">
            <mat-icon>inbox</mat-icon>
            <div>
              <strong>Sin movimientos en el período</strong>
              <div class="small">Probá otro rango o tipo.</div>
            </div>
          </div>
        } @else {
          <table class="concept-report__table">
            <thead>
              <tr>
                <th>Concepto validado</th>
                <th class="num">SUM de Importe $</th>
                <th class="num">%</th>
              </tr>
            </thead>
            <tbody>
              @for (row of conceptRows(); track row['conceptId'] ?? row['name']) {
                <tr>
                  <td>{{ row['name'] }}</td>
                  <td class="num">{{ money(row['amount'] ?? 0) }}</td>
                  <td class="num">{{ percent(row['share'] ?? 0) }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <th>Suma total</th>
                <th class="num">{{ money(conceptTotal()) }}</th>
                <th class="num">100,00%</th>
              </tr>
            </tfoot>
          </table>
        }
      </div>
    </div>

    <app-kpi-strip class="mb-3" [items]="kpis()" />

    <div class="charts-grid mb-3">
      <app-donut-chart
        title="Mix por tipo"
        subtitle="% del importe"
        [items]="kindSlices()"
      />
      <app-hbar-chart
        title="Top conceptos"
        subtitle="Por importe"
        [items]="topConceptBars()"
        [maxItems]="10"
      />
      @if (expenseDayPoints().length) {
        <app-line-chart
          class="charts-grid__wide"
          title="Egresos por día"
          subtitle="Importe de conceptos de egreso"
          [points]="expenseDayPoints()"
        />
      }
      @if (incomeDayPoints().length) {
        <app-line-chart
          title="Ingresos por día"
          subtitle="Importe de conceptos de ingreso"
          [points]="incomeDayPoints()"
        />
      }
    </div>

    <div class="panel-card panel-card--flush mb-3">
      <mat-tab-group animationDuration="0ms" class="sales-tabs">
        <mat-tab label="Detalle por concepto">
          <div class="panel-card__body">
            <div class="guy-list-head">
              <div>
                <h2 class="guy-list-head__title">Movimientos por concepto</h2>
                <p class="guy-list-head__meta">
                  {{ summary()?.byConcept?.length ?? 0 }} conceptos · cantidad, promedio y tipo
                </p>
              </div>
            </div>
            <app-data-table
              [columns]="conceptColumns"
              [rows]="conceptRows()"
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
                <p class="guy-list-head__meta">Ingresos, egresos y transferencias por fecha</p>
              </div>
            </div>
            <app-data-table
              [columns]="dayColumns"
              [rows]="dayRows()"
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
    .hint {
      margin: 0;
      color: var(--guy-muted, #5f6f66);
      font-size: 0.9rem;
    }
    .concept-report__banner {
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 18%, #e8f1f8);
      color: var(--guy-navy, #003366);
      font-weight: 800;
      font-size: 1.05rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 0.7rem 1rem;
      border-bottom: 1px solid var(--guy-border, #d5dee6);
    }
    .concept-report__wrap {
      overflow-x: auto;
    }
    .concept-report__table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.92rem;
    }
    .concept-report__table th,
    .concept-report__table td {
      padding: 0.45rem 0.85rem;
      border-bottom: 1px solid var(--guy-border, #e6ebf0);
      text-align: left;
    }
    .concept-report__table thead th {
      background: #eef2f6;
      font-weight: 700;
      color: var(--guy-navy, #003366);
    }
    .concept-report__table tbody tr:nth-child(even) {
      background: #f7f9fb;
    }
    .concept-report__table .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .concept-report__table tfoot th {
      border-top: 2px solid var(--guy-navy, #003366);
      font-weight: 800;
      background: #fff;
    }
    html[data-theme='dark'] .concept-report__banner {
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 28%, #17212b);
      color: var(--guy-text, #e8eef3);
    }
    html[data-theme='dark'] .concept-report__table thead th {
      background: #1c2833;
      color: var(--guy-text, #e8eef3);
    }
    html[data-theme='dark'] .concept-report__table tbody tr:nth-child(even) {
      background: #1a242e;
    }
    html[data-theme='dark'] .concept-report__table tfoot th {
      background: var(--guy-card, #17212b);
    }
  `,
})
export class ConceptsReportPage {
  private readonly filtersUi = createFiltersCollapsed('reports-concepts');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  readonly shops = inject(ShopContextService);
  private readonly api = inject(ClosingsApiService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);

  readonly never = () => false;
  readonly money = money;
  readonly percent = percent;

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    end: new FormControl<Date | null>(new Date()),
  });

  readonly filters = new FormGroup({
    kind: new FormControl('EXPENSE', { nonNullable: true }),
    conceptId: new FormControl('', { nonNullable: true }),
  });

  readonly summary = signal<ConceptsReportSummary | null>(null);
  readonly reportKind = signal('EXPENSE');
  readonly kpis = signal<KpiItem[]>([]);

  readonly conceptOptions = computed(() => this.summary()?.conceptOptions ?? []);

  readonly comparisonHint = computed(() => {
    const c = this.summary()?.comparison;
    if (!c) return '';
    return `Vs período anterior: ingresos ${formatDelta(c.incomeDeltaPct)} · egresos ${formatDelta(c.expenseDeltaPct)}`;
  });

  readonly kindSlices = computed<ChartSlice[]>(() =>
    (this.summary()?.byKind ?? []).map((k) => ({
      label: conceptKindLabel(k.kind),
      value: k.amount,
    })),
  );

  readonly topConceptBars = computed<ChartSlice[]>(() =>
    (this.summary()?.byConcept ?? []).slice(0, 10).map((c) => ({
      label: c.name,
      value: c.amount,
    })),
  );

  readonly expenseDayPoints = computed<ChartPoint[]>(() =>
    (this.summary()?.byDay ?? [])
      .filter((d) => d.expense > 0)
      .map((d) => ({ label: formatDayLabelEs(d.businessDate), value: d.expense })),
  );

  readonly incomeDayPoints = computed<ChartPoint[]>(() =>
    (this.summary()?.byDay ?? [])
      .filter((d) => d.income > 0)
      .map((d) => ({ label: formatDayLabelEs(d.businessDate), value: d.income })),
  );

  readonly conceptRows = computed(() =>
    (this.summary()?.byConcept ?? []).map((c) => ({ ...c }) as Record<string, unknown>),
  );

  readonly conceptTotal = computed(() =>
    (this.summary()?.byConcept ?? []).reduce((s, c) => s + Number(c.amount || 0), 0),
  );

  readonly tableTitle = computed(() => {
    const s = this.summary();
    return periodBanner(this.reportKind(), s?.from ?? null, s?.to ?? null);
  });

  readonly dayRows = computed(() =>
    (this.summary()?.byDay ?? []).map((d) => ({ ...d }) as Record<string, unknown>),
  );

  readonly conceptColumns: DataTableColumn[] = [
    { key: 'name', label: 'Concepto' },
    { key: 'kind', label: 'Tipo', format: (r) => conceptKindLabel(String(r['kind'] ?? '')) },
    { key: 'count', label: 'Movimientos' },
    { key: 'amount', label: 'Importe', format: (r) => money(Number(r['amount'] ?? 0)) },
    { key: 'avgAmount', label: 'Promedio', format: (r) => money(Number(r['avgAmount'] ?? 0)) },
    {
      key: 'share',
      label: '%',
      format: (r) => percent(Number(r['share'] ?? 0)),
    },
  ];

  readonly dayColumns: DataTableColumn[] = [
    {
      key: 'businessDate',
      label: 'Fecha',
      format: (r) => formatDayLabelEs(String(r['businessDate'] ?? '')),
    },
    { key: 'count', label: 'Mov.' },
    { key: 'income', label: 'Ingresos', format: (r) => money(Number(r['income'] ?? 0)) },
    { key: 'expense', label: 'Egresos', format: (r) => money(Number(r['expense'] ?? 0)) },
    {
      key: 'transfer',
      label: 'Transferencias',
      format: (r) => money(Number(r['transfer'] ?? 0)),
    },
  ];

  constructor() {
    usePageRefresh(() => this.load());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) return;
      this.filters.setValue({ kind: 'EXPENSE', conceptId: '' });
      this.load();
    });
  }

  hasRange(): boolean {
    return !!this.range.controls.start.value && !!this.range.controls.end.value;
  }

  canExport(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'reports.export');
  }

  clearFilters(): void {
    this.range.setValue({
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      end: new Date(),
    });
    this.filters.setValue({ kind: 'EXPENSE', conceptId: '' });
    this.load();
  }

  private formatDate(d: Date | null): string | null {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private currentFilters(): ConceptsReportFilters | null {
    const from = this.formatDate(this.range.controls.start.value);
    const to = this.formatDate(this.range.controls.end.value);
    if (!from || !to) return null;
    const f = this.filters.getRawValue();
    return {
      from,
      to,
      kind: f.kind || null,
      conceptId: f.conceptId || null,
    };
  }

  load(): void {
    const shopId = this.shops.selectedShopId();
    const filters = this.currentFilters();
    if (!shopId || !filters) return;
    this.api.conceptsReport(shopId, filters).subscribe({
      next: (data) => {
        this.summary.set(data);
        this.reportKind.set(filters.kind || '');
        const t = data.totals;
        const cmp = data.comparison;
        this.kpis.set([
          {
            label: 'Egresos',
            value: money(t.expense),
            hint: cmp ? formatDelta(cmp.expenseDeltaPct) : undefined,
            icon: 'south_west',
          },
          {
            label: 'Ingresos',
            value: money(t.income),
            hint: cmp ? formatDelta(cmp.incomeDeltaPct) : undefined,
            icon: 'north_east',
          },
          {
            label: 'Resultado',
            value: money(t.net),
            hint: 'Ingresos − egresos',
            tone: t.net >= 0 ? 'ok' : 'warn',
          },
          {
            label: 'Movimientos',
            value: Number(t.movementCount).toLocaleString('es-AR'),
            hint: cmp ? formatDelta(cmp.countDeltaPct) : `${money(t.avgAmount)} promedio`,
          },
          {
            label: 'Transferencias',
            value: money(t.transfer),
          },
          {
            label: 'Sin concepto',
            value: money(t.withoutConceptAmount),
            hint: `${Number(t.withoutConceptCount).toLocaleString('es-AR')} movimientos`,
            tone: t.withoutConceptCount > 0 ? 'warn' : 'muted',
          },
        ]);
      },
      error: (err) => {
        this.summary.set(null);
        this.kpis.set([]);
        const msg = err?.error?.message ?? 'No se pudieron cargar las estadísticas de conceptos';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  async onExport(format: ExportFormat): Promise<void> {
    if (format === 'pdf') {
      const shop = this.shops.selectedShop();
      const filters = this.currentFilters();
      await downloadColumnsPdf({
        title: 'Conceptos',
        subtitle: `${shop?.name ?? ''} · ${filters?.from ?? ''} a ${filters?.to ?? ''}`,
        filename: `conceptos-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${filters?.from}_${filters?.to}.pdf`,
        columns: this.conceptColumns,
        rows: this.conceptRows(),
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
    this.api.conceptsReportExport(shopId, filters).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `conceptos-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${filters.from}_${filters.to}.xlsx`;
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
