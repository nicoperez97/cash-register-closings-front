import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { debounceTime, merge } from 'rxjs';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { usePageRefresh } from '../../core/page-refresh.service';
import { formatMoney } from '../../shared/utils/money';
import {
  CustomerOrderFulfillment,
  CustomerOrderPaymentMethod,
  CustomerOrderStatus,
  CustomerOrdersApiService,
  StaffCustomerOrder,
} from './customer-orders-api.service';
import {
  CustomerOrderDetailDialogComponent,
  CustomerOrderDetailDialogResult,
} from './customer-order-detail-dialog';
import { STATUS_LABEL } from './customer-orders-status.util';
import { fulfillmentLabel, paymentLabel } from './ordering-ui.util';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoDate(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDateTime(iso?: string | null): string {
  const raw = String(iso ?? '').trim();
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

@Component({
  selector: 'app-customer-orders-history-page',
  imports: [
    PageHeaderComponent,
    DataTableComponent,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatDialogModule,
    MatSnackBarModule,
    FiltersCollapseBtnComponent,
  ],
  template: `
    <app-page-header
      title="Historial de pedidos"
      [subtitle]="shops.selectedShop()?.name ?? 'Pedidos de take away y delivery'"
    />

    <div
      class="panel-card guy-filters mb-3"
      [class.guy-filters--collapsed]="filtersCollapsed()"
    >
      <div class="guy-filters__head">
        <div>
          <h2 class="guy-filters__title">Filtros</h2>
          <p class="guy-filters__subtitle">Período, estado, canal y cobro</p>
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
              <mat-option value="">Todos</mat-option>
              @for (opt of statusOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Canal</mat-label>
            <mat-select formControlName="fulfillment">
              <mat-option value="">Todos</mat-option>
              @for (opt of fulfillmentOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Pago</mat-label>
            <mat-select formControlName="paymentMethod">
              <mat-option value="">Todos</mat-option>
              @for (opt of paymentOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Acreditado</mat-label>
            <mat-select formControlName="accredited">
              <mat-option value="">Todos</mat-option>
              <mat-option value="yes">Sí</mat-option>
              <mat-option value="no">No</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="guy-filters__span-2" subscriptSizing="dynamic">
            <mat-label>Buscar</mat-label>
            <input matInput formControlName="q" placeholder="Código, nombre o celular" />
          </mat-form-field>
        </form>
      </div>
    </div>

    <div class="panel-card panel-card--flush">
      <div class="panel-card__body">
        <app-data-table
          [columns]="columns"
          [rows]="rows()"
          [loading]="loading()"
          [sortable]="true"
          [showSearch]="false"
          editLabel="Abrir"
          editIcon="open_in_new"
          (edit)="openOrder($event)"
        />
      </div>
    </div>
  `,
})
export class CustomerOrdersHistoryPage {
  private readonly api = inject(CustomerOrdersApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);
  readonly shops = inject(ShopContextService);

  private readonly filtersUi = createFiltersCollapsed('customer-orders-history');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = () => this.filtersUi.toggleFilters();

  readonly loading = signal(false);
  readonly rows = signal<StaffCustomerOrder[]>([]);

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(this.defaultStart()),
    end: new FormControl<Date | null>(new Date()),
  });

  readonly filters = new FormGroup({
    status: new FormControl('', { nonNullable: true }),
    fulfillment: new FormControl('', { nonNullable: true }),
    paymentMethod: new FormControl('', { nonNullable: true }),
    accredited: new FormControl('', { nonNullable: true }),
    q: new FormControl('', { nonNullable: true }),
  });

  readonly statusOptions: Array<{ value: CustomerOrderStatus; label: string }> = [
    { value: 'COMPLETED', label: STATUS_LABEL.COMPLETED },
    { value: 'CANCELLED', label: STATUS_LABEL.CANCELLED },
    { value: 'PENDING', label: STATUS_LABEL.PENDING },
    { value: 'ACCEPTED', label: STATUS_LABEL.ACCEPTED },
    { value: 'PREPARING', label: STATUS_LABEL.PREPARING },
    { value: 'READY', label: STATUS_LABEL.READY },
    { value: 'OUT_FOR_DELIVERY', label: STATUS_LABEL.OUT_FOR_DELIVERY },
  ];

  readonly fulfillmentOptions: Array<{ value: CustomerOrderFulfillment; label: string }> = [
    { value: 'TAKEAWAY', label: fulfillmentLabel('TAKEAWAY') },
    { value: 'DELIVERY', label: fulfillmentLabel('DELIVERY') },
    { value: 'COUNTER', label: fulfillmentLabel('COUNTER') },
  ];

  readonly paymentOptions: Array<{ value: CustomerOrderPaymentMethod; label: string }> = [
    { value: 'CASH', label: paymentLabel('CASH') },
    { value: 'TRANSFER', label: paymentLabel('TRANSFER') },
    { value: 'CARD', label: paymentLabel('CARD') },
  ];

  readonly columns: DataTableColumn[] = [
    {
      key: 'createdAt',
      label: 'Fecha',
      format: (r) => formatDateTime(r.createdAt),
    },
    { key: 'code', label: 'Código', format: (r) => `#${r.code}` },
    {
      key: 'guest',
      label: 'Cliente',
      format: (r) => `${r.lastName}, ${r.firstName}`,
    },
    {
      key: 'fulfillment',
      label: 'Canal',
      format: (r) => fulfillmentLabel(r.fulfillment),
    },
    {
      key: 'status',
      label: 'Estado',
      format: (r) => STATUS_LABEL[r.status as CustomerOrderStatus] ?? r.status,
    },
    {
      key: 'paymentMethod',
      label: 'Pago',
      format: (r) => r.paymentMethodName?.trim() || paymentLabel(r.paymentMethod),
    },
    {
      key: 'accredited',
      label: 'Acreditado',
      format: (r) => (r.paymentAccreditedAt ? 'Sí' : 'No'),
    },
    {
      key: 'total',
      label: 'Total',
      format: (r) => formatMoney(Number(r.total) || 0, { spaced: true }),
      totalize: true,
      totalValue: (r) => Number(r.total) || 0,
      totalFormat: (sum) => formatMoney(sum, { spaced: true, compact: false }),
    },
  ];

  readonly canManage = computed(() =>
    hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'customerOrders.manage',
    ),
  );

  constructor() {
    usePageRefresh(() => this.load());

    effect(() => {
      this.shops.selectedShopId();
      this.load();
    });

    merge(this.range.valueChanges, this.filters.valueChanges)
      .pipe(debounceTime(250), takeUntilDestroyed())
      .subscribe(() => this.load());
  }

  clearFilters(): void {
    this.range.setValue({ start: this.defaultStart(), end: new Date() });
    this.filters.reset({
      status: '',
      fulfillment: '',
      paymentMethod: '',
      accredited: '',
      q: '',
    });
  }

  openOrder(order: StaffCustomerOrder): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const ref = this.dialog.open(CustomerOrderDetailDialogComponent, {
      data: {
        order,
        shopId,
        canManage: this.canManage(),
      },
      autoFocus: 'dialog',
      width: 'min(440px, 96vw)',
      maxHeight: '92vh',
      panelClass: 'guy-dialog',
    });
    ref.afterClosed().subscribe((result: CustomerOrderDetailDialogResult) => {
      if (!result || result.kind !== 'updated') return;
      this.rows.update((list) =>
        list.map((o) => (o.id === result.order.id ? { ...o, ...result.order } : o)),
      );
    });
  }

  private defaultStart(): Date {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d;
  }

  private loadGen = 0;

  private load(): void {
    const shopId = this.shops.selectedShopId();
    const from = toIsoDate(this.range.controls.start.value);
    const to = toIsoDate(this.range.controls.end.value);
    if (!shopId) {
      this.rows.set([]);
      this.loading.set(false);
      return;
    }
    if (!from || !to) return;
    const gen = ++this.loadGen;
    this.loading.set(true);
    const f = this.filters.getRawValue();
    this.api
      .listStaff(shopId, {
        from,
        to,
        status: f.status || undefined,
        fulfillment: (f.fulfillment || undefined) as CustomerOrderFulfillment | undefined,
        paymentMethod: (f.paymentMethod || undefined) as CustomerOrderPaymentMethod | undefined,
        accredited: f.accredited === 'yes' || f.accredited === 'no' ? f.accredited : undefined,
        q: f.q.trim() || undefined,
      })
      .subscribe({
        next: (rows) => {
          if (gen !== this.loadGen) return;
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: (err) => {
          if (gen !== this.loadGen) return;
          this.loading.set(false);
          const msg = err?.error?.message ?? 'No se pudo cargar el historial';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', {
            duration: 3500,
          });
        },
      });
  }
}
