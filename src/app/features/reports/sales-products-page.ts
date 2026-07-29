import { Component, effect, inject, signal } from '@angular/core';
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
import { KpiStripComponent, KpiItem } from '../../shared/components/kpi-strip';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import {
  ClosingsApiService,
  SalesProductsFilters,
  SalesProductsSummary,
} from '../closings/closings-api.service';

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
    PageHeaderComponent,
    KpiStripComponent,
    DataTableComponent,
  ],
  template: `
    <app-page-header
      title="Platos y rubros"
      [subtitle]="shops.selectedShop()?.name ?? ''"
      [actionLabel]="canExport() ? 'Descargar Excel' : ''"
      [actionDisabled]="!canExport() || !hasRange()"
      actionIcon="download"
      (action)="export()"
    />

    <div class="panel-card guy-filters mb-3">
      <div class="guy-filters__head">
        <div>
          <h2 class="guy-filters__title">Filtros</h2>
          <p class="guy-filters__subtitle">Ventas POS importadas: cantidades e importes por plato y rubro</p>
        </div>
        <button mat-stroked-button type="button" class="guy-filters__clear" (click)="clearFilters()">
          <mat-icon>filter_alt_off</mat-icon>
          Limpiar
        </button>
      </div>

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
          <mat-select formControlName="category">
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
      </div>
    </div>

    <app-kpi-strip class="mb-3" [items]="kpis()" />

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
                  Asigná rubros en Admin → Platos. Sin rubro aparecen como “Sin rubro”.
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
      </mat-tab-group>
    </div>
  `,
  styles: `
    .sales-tabs {
      display: block;
    }
  `,
})
export class SalesProductsPage {
  readonly shops = inject(ShopContextService);
  private readonly api = inject(ClosingsApiService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);

  readonly never = () => false;

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    end: new FormControl<Date | null>(new Date()),
  });

  readonly filters = new FormGroup({
    category: new FormControl('', { nonNullable: true }),
    paymentCode: new FormControl('', { nonNullable: true }),
    q: new FormControl('', { nonNullable: true }),
  });

  readonly summary = signal<SalesProductsSummary | null>(null);
  readonly kpis = signal<KpiItem[]>([]);
  readonly products = signal<Record<string, unknown>[]>([]);
  readonly categories = signal<Record<string, unknown>[]>([]);
  readonly categoryOptions = signal<string[]>([]);
  readonly paymentOptions = signal<string[]>([]);

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
      format: (r) => Number(r['qty'] ?? 0).toLocaleString('es-UY', { maximumFractionDigits: 3 }),
    },
    {
      key: 'amount',
      label: 'Importe',
      format: (r) => `$ ${Number(r['amount'] ?? 0).toLocaleString('es-UY')}`,
    },
    { key: 'ticketCount', label: 'Tickets' },
    {
      key: 'share',
      label: '%',
      format: (r) =>
        `${(Number(r['share'] ?? 0) * 100).toLocaleString('es-UY', { maximumFractionDigits: 1 })}%`,
    },
  ];

  readonly categoryColumns: DataTableColumn[] = [
    { key: 'category', label: 'Rubro' },
    { key: 'productCount', label: 'Platos' },
    {
      key: 'qty',
      label: 'Cantidad',
      format: (r) => Number(r['qty'] ?? 0).toLocaleString('es-UY', { maximumFractionDigits: 3 }),
    },
    {
      key: 'amount',
      label: 'Importe',
      format: (r) => `$ ${Number(r['amount'] ?? 0).toLocaleString('es-UY')}`,
    },
    { key: 'ticketCount', label: 'Tickets' },
    {
      key: 'share',
      label: '%',
      format: (r) =>
        `${(Number(r['share'] ?? 0) * 100).toLocaleString('es-UY', { maximumFractionDigits: 1 })}%`,
    },
  ];

  constructor() {
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) return;
      this.load();
    });
  }

  canExport(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'reports.export');
  }

  hasRange(): boolean {
    return !!this.range.controls.start.value && !!this.range.controls.end.value;
  }

  clearFilters(): void {
    this.range.setValue({
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      end: new Date(),
    });
    this.filters.reset({ category: '', paymentCode: '', q: '' });
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
        this.summary.set(s);
        this.products.set((s.products ?? []) as Record<string, unknown>[]);
        this.categories.set((s.categories ?? []) as Record<string, unknown>[]);
        this.categoryOptions.set(s.filterOptions?.categories ?? []);
        this.paymentOptions.set(s.filterOptions?.paymentCodes ?? []);
        const t = s.totals;
        this.kpis.set([
          { label: 'Importe total', value: `$ ${Number(t.amount).toLocaleString('es-UY')}` },
          {
            label: 'Unidades',
            value: Number(t.qty).toLocaleString('es-UY', { maximumFractionDigits: 1 }),
          },
          { label: 'Tickets', value: String(t.ticketCount) },
          { label: 'Platos', value: String(t.productCount) },
          { label: 'Rubros', value: String(t.categoryCount) },
          {
            label: 'Ticket prom.',
            value: `$ ${Number(t.avgTicketAmount).toLocaleString('es-UY', { maximumFractionDigits: 0 })}`,
          },
        ]);
      },
      error: () => this.snack.open('Error al cargar ventas por plato', 'OK', { duration: 3000 }),
    });
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
