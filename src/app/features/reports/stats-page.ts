import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { KpiStripComponent, KpiItem } from '../../shared/components/kpi-strip';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { LineChartComponent, ChartPoint } from '../../shared/components/sales-charts';
import { ShopContextService } from '../../core/shop/shop-context.service';
import {
  ClosingsApiService,
  ReportsDashboard,
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

@Component({
  selector: 'app-stats-page',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatSnackBarModule,
    PageHeaderComponent,
    KpiStripComponent,
    DataTableComponent,
    LineChartComponent,
    FiltersCollapseBtnComponent,
  ],
  template: `
    <app-page-header
      title="Estadísticas"
      [subtitle]="shops.selectedShop()?.name ?? ''"
    />

    <div
      class="panel-card guy-filters mb-3"
      [class.guy-filters--collapsed]="filtersCollapsed()"
    >
      <div class="guy-filters__head">
        <div>
          <h2 class="guy-filters__title">Filtros</h2>
          <p class="guy-filters__subtitle">
            Vista mixta: reservas, ventas POS y cierres de caja
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
        <form class="guy-filters__grid guy-filters__grid--dense">
          <mat-form-field appearance="outline" class="guy-filters__span-2" subscriptSizing="dynamic">
            <mat-label>Período</mat-label>
            <mat-date-range-input [formGroup]="range" [rangePicker]="picker">
              <input matStartDate formControlName="start" placeholder="Desde" />
              <input matEndDate formControlName="end" placeholder="Hasta" />
            </mat-date-range-input>
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-date-range-picker #picker />
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
      Las ventas POS vienen del import Restosoft/POS; no modifican cierres ni saldos.
      Los totales de caja salen de los cierres cargados por separado.
    </p>

    <app-kpi-strip class="mb-3" [items]="kpis()" />

    <div class="charts-grid mb-3">
      <app-line-chart
        class="charts-grid__wide"
        title="Reservas por día"
        subtitle="Grupos confirmados / marcados"
        [points]="reservationPartyPoints()"
      />
      <app-line-chart
        title="Covers reservados"
        subtitle="Comensales por día"
        [points]="reservationGuestPoints()"
      />
      <app-line-chart
        class="charts-grid__wide"
        title="Ventas POS por día"
        subtitle="Importe importado (no afecta caja)"
        [points]="posAmountPoints()"
      />
      <app-line-chart
        title="Tickets POS"
        subtitle="Cantidad de tickets"
        [points]="posTicketPoints()"
      />
      <app-line-chart
        class="charts-grid__wide"
        title="Cierres por día"
        subtitle="Total declarado (caja)"
        [points]="closingAmountPoints()"
      />
    </div>

    <div class="panel-card panel-card--flush mb-3">
      <div class="panel-card__body">
        <div class="guy-list-head">
          <div>
            <h2 class="guy-list-head__title">Detalle diario</h2>
            <p class="guy-list-head__meta">
              Cruce reservas · POS · caja en el período
            </p>
          </div>
        </div>
        <app-data-table
          [columns]="dayColumns"
          [rows]="mergedDays()"
          [sortable]="true"
          [showActions]="false"
          [canRemove]="never"
        />
      </div>
    </div>
  `,
  styles: [
    `
      .hint {
        margin: 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #5a6b5e);
        line-height: 1.4;
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
  ],
})
export class StatsPage {
  private readonly filtersUi = createFiltersCollapsed('reports-stats');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  readonly shops = inject(ShopContextService);
  private readonly api = inject(ClosingsApiService);
  private readonly snack = inject(MatSnackBar);

  readonly never = () => false;

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    end: new FormControl<Date | null>(new Date()),
  });

  readonly dashboard = signal<ReportsDashboard | null>(null);
  readonly kpis = signal<KpiItem[]>([]);

  readonly reservationPartyPoints = computed<ChartPoint[]>(() =>
    (this.dashboard()?.reservations?.byDay ?? []).map((d) => ({
      label: formatDayLabelEs(d.businessDate),
      value: d.parties,
    })),
  );

  readonly reservationGuestPoints = computed<ChartPoint[]>(() =>
    (this.dashboard()?.reservations?.byDay ?? []).map((d) => ({
      label: formatDayLabelEs(d.businessDate),
      value: d.guests,
    })),
  );

  readonly posAmountPoints = computed<ChartPoint[]>(() =>
    (this.dashboard()?.pos?.byDay ?? []).map((d) => ({
      label: formatDayLabelEs(d.businessDate),
      value: d.amount,
    })),
  );

  readonly posTicketPoints = computed<ChartPoint[]>(() =>
    (this.dashboard()?.pos?.byDay ?? []).map((d) => ({
      label: formatDayLabelEs(d.businessDate),
      value: d.ticketCount,
    })),
  );

  readonly closingAmountPoints = computed<ChartPoint[]>(() =>
    (this.dashboard()?.closings?.byDay ?? []).map((d) => ({
      label: formatDayLabelEs(d.businessDate),
      value: d.declaredTotal,
    })),
  );

  readonly mergedDays = computed<Record<string, unknown>[]>(() => {
    const data = this.dashboard();
    if (!data) return [];
    const map = new Map<string, Record<string, unknown>>();
    const ensure = (date: string) => {
      let row = map.get(date);
      if (!row) {
        row = {
          businessDate: date,
          parties: 0,
          guests: 0,
          posAmount: 0,
          posTickets: 0,
          declaredTotal: 0,
          closingStatus: '—',
        };
        map.set(date, row);
      }
      return row;
    };
    for (const d of data.reservations?.byDay ?? []) {
      const row = ensure(d.businessDate);
      row['parties'] = d.parties;
      row['guests'] = d.guests;
    }
    for (const d of data.pos?.byDay ?? []) {
      const row = ensure(d.businessDate);
      row['posAmount'] = d.amount;
      row['posTickets'] = d.ticketCount;
    }
    for (const d of data.closings?.byDay ?? []) {
      const row = ensure(d.businessDate);
      row['declaredTotal'] = d.declaredTotal;
      row['closingStatus'] = d.status;
    }
    return [...map.values()].sort((a, b) =>
      String(a['businessDate']).localeCompare(String(b['businessDate'])),
    );
  });

  readonly dayColumns: DataTableColumn[] = [
    {
      key: 'businessDate',
      label: 'Fecha',
      format: (r) => formatDayLabelEs(String(r['businessDate'] ?? '')),
    },
    { key: 'parties', label: 'Reservas' },
    { key: 'guests', label: 'Covers res.' },
    {
      key: 'posAmount',
      label: 'POS $',
      format: (r) => `$ ${Number(r['posAmount'] ?? 0).toLocaleString('es-AR')}`,
    },
    { key: 'posTickets', label: 'Tickets' },
    {
      key: 'declaredTotal',
      label: 'Caja $',
      format: (r) => `$ ${Number(r['declaredTotal'] ?? 0).toLocaleString('es-AR')}`,
    },
    { key: 'closingStatus', label: 'Estado caja' },
  ];

  constructor() {
    usePageRefresh(() => this.load());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) return;
      this.load();
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
    this.load();
  }

  private formatDate(d: Date | null): string | null {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  load(): void {
    const shopId = this.shops.selectedShopId();
    const from = this.formatDate(this.range.controls.start.value);
    const to = this.formatDate(this.range.controls.end.value);
    if (!shopId || !from || !to) return;

    this.api.reportsDashboard(shopId, { from, to }).subscribe({
      next: (data) => {
        this.dashboard.set(data);
        const res = data.reservations?.totals;
        const pos = data.pos?.totals;
        const box = data.closings?.totals;
        const items: KpiItem[] = [
          {
            label: 'Reservas (grupos)',
            value: Number(res?.parties ?? 0).toLocaleString('es-AR'),
          },
          {
            label: 'Covers reservados',
            value: Number(res?.guests ?? 0).toLocaleString('es-AR'),
          },
          {
            label: 'Ventas POS',
            value: `$ ${Number(pos?.amount ?? 0).toLocaleString('es-AR')}`,
          },
          {
            label: 'Tickets POS',
            value: Number(pos?.ticketCount ?? 0).toLocaleString('es-AR'),
          },
          {
            label: 'Caja declarada',
            value: `$ ${Number(box?.declared ?? 0).toLocaleString('es-AR')}`,
          },
          {
            label: 'Comensales caja',
            value: Number(box?.covers ?? 0).toLocaleString('es-AR'),
          },
        ];
        if (data.reservations && !data.reservations.enabled) {
          items[0] = { label: 'Reservas', value: 'Deshabilitado' };
          items[1] = { label: 'Covers reservados', value: '—' };
        }
        this.kpis.set(items);
      },
      error: (err) => {
        this.dashboard.set(null);
        this.kpis.set([]);
        const msg = err?.error?.message ?? 'No se pudieron cargar las estadísticas';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', {
          duration: 4000,
        });
      },
    });
  }
}
