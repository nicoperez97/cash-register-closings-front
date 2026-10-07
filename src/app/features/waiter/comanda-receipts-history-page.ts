import { Component, Inject, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { debounceTime, merge } from 'rxjs';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { usePageRefresh } from '../../core/page-refresh.service';
import { formatMoney } from '../../shared/utils/money';
import { paymentLabel } from '../customer-orders/ordering-ui.util';
import {
  ComandaReceiptRow,
  WaiterApiService,
  WaiterSession,
} from './waiter-api.service';

import { apiErrorMessage } from '../../core/http/api-error-message';
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

function placeHeading(label: string | null | undefined, channel?: string): string {
  const t = String(label ?? '').trim();
  if (!t || t.toLowerCase() === 'mostrador' || channel === 'COUNTER') return 'Mostrador';
  return `Mesa ${t}`;
}

@Component({
  selector: 'app-comanda-receipt-detail-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>{{ title }}</h2>
    <mat-dialog-content class="receipt-detail">
      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else if (error(); as err) {
        <p class="err">{{ err }}</p>
      } @else if (session(); as s) {
        <p class="muted">
          Cerrado {{ formatDateTime(s.closedAt) }}
          @if (s.covers && s.table) {
            · {{ s.covers }} comensales
          }
          @if (s.waiter?.fullName) {
            · {{ s.waiter.fullName }}
          }
        </p>
        <div class="receipt-detail__totals">
          <div>
            <span>Ticket</span>
            <strong>{{ money(ticketTotal(s)) }}</strong>
          </div>
          @if ((s.tipAmount ?? 0) > 0) {
            <div>
              <span>Propina</span>
              <strong>{{ money(s.tipAmount ?? 0) }}</strong>
            </div>
          }
        </div>
        @if (s.payments?.length) {
          <h3>Pagos</h3>
          <ul>
            @for (p of s.payments!; track p.paymentMethodId + p.amount) {
              <li>
                <span>{{ p.paymentMethodName }}</span>
                <strong>{{ money(p.amount) }}</strong>
              </li>
            }
          </ul>
        }
        <h3>Envíos</h3>
        @if (!(s.orders?.length)) {
          <p class="muted">Sin envíos.</p>
        } @else {
          @for (o of s.orders; track o.id) {
            <div class="receipt-detail__order">
              <header>
                <strong>#{{ o.code }}</strong>
                <span>{{ money(o.total) }}</span>
              </header>
              <ul>
                @for (it of o.items; track $index) {
                  <li>
                    {{ it.qty }}× {{ it.name }}
                    <span>{{ money((it.unitPrice || 0) * (it.qty || 0)) }}</span>
                  </li>
                }
              </ul>
            </div>
          }
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .receipt-detail {
      display: grid;
      gap: 0.75rem;
      min-width: min(22rem, 86vw);
    }
    .muted {
      margin: 0;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }
    .err {
      margin: 0;
      color: #b3261e;
    }
    .receipt-detail__totals {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .receipt-detail__totals div {
      display: grid;
      gap: 0.15rem;
    }
    .receipt-detail__totals span {
      font-size: 0.75rem;
      color: var(--guy-muted, #5f6f76);
    }
    h3 {
      margin: 0.35rem 0 0;
      font-size: 0.85rem;
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.35rem;
    }
    li,
    .receipt-detail__order header {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      font-size: 0.9rem;
    }
    .receipt-detail__order {
      display: grid;
      gap: 0.35rem;
      padding: 0.55rem 0;
      border-top: 1px solid var(--guy-border, #d7e0d9);
    }
  `,
})
export class ComandaReceiptDetailDialog {
  private readonly api = inject(WaiterApiService);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly session = signal<WaiterSession | null>(null);
  readonly title: string;
  readonly formatDateTime = formatDateTime;

  constructor(@Inject(MAT_DIALOG_DATA) data: { shopId: string; row: ComandaReceiptRow }) {
    this.title = placeHeading(data.row.tableLabel, data.row.channel);
    this.api.staffReceipt(data.shopId, data.row.sessionId).subscribe({
      next: (session) => {
        this.session.set(session);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = apiErrorMessage(err, 'No se pudo cargar el comprobante');
        this.error.set(Array.isArray(msg) ? msg.join(', ') : msg);
      },
    });
  }

  money(n: number): string {
    return formatMoney(Number(n) || 0, { spaced: true });
  }

  ticketTotal(s: WaiterSession): number {
    if (s.ticketTotal != null) return Number(s.ticketTotal) || 0;
    if (s.sessionSubtotal != null) return Number(s.sessionSubtotal) || 0;
    return (s.orders ?? []).reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  }
}

@Component({
  selector: 'app-comanda-receipts-history-page',
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
      title="Historial de comprobantes"
      [subtitle]="shops.selectedShop()?.name ?? 'Mesas y mostrador cerrados'"
    />

    <div
      class="panel-card guy-filters mb-3"
      [class.guy-filters--collapsed]="filtersCollapsed()"
    >
      <div class="guy-filters__head">
        <div>
          <h2 class="guy-filters__title">Filtros</h2>
          <p class="guy-filters__subtitle">Período, canal, pago, mozo y propina</p>
        </div>
        <div class="guy-filters__tools">
          <button
            mat-stroked-button
            type="button"
            class="guy-filters__clear"
            (click)="exportExcel()"
            [disabled]="loading() || exporting()"
          >
            <mat-icon>download</mat-icon>
            {{ exporting() ? 'Excel…' : 'Excel' }}
          </button>
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
            <mat-label>Canal</mat-label>
            <mat-select formControlName="channel">
              <mat-option value="">Todos</mat-option>
              <mat-option value="TABLE">Mesa</mat-option>
              <mat-option value="COUNTER">Mostrador</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Pago</mat-label>
            <mat-select formControlName="paymentKind">
              <mat-option value="">Todos</mat-option>
              @for (opt of paymentOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Mozo</mat-label>
            <mat-select formControlName="waiterEmployeeId">
              <mat-option value="">Todos</mat-option>
              @for (w of waiters(); track w.id) {
                <mat-option [value]="w.id">{{ w.fullName }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Propina</mat-label>
            <mat-select formControlName="hasTip">
              <mat-option value="">Todas</mat-option>
              <mat-option value="yes">Con propina</mat-option>
              <mat-option value="no">Sin propina</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="guy-filters__span-2" subscriptSizing="dynamic">
            <mat-label>Buscar</mat-label>
            <input matInput formControlName="q" placeholder="Mesa, mostrador, mozo o pago" />
          </mat-form-field>
        </form>
      </div>
    </div>

    @if (summary(); as sum) {
      <p class="muted mb-2">
        {{ sum.count }} comprobante{{ sum.count === 1 ? '' : 's' }}
        · Ticket {{ money(sum.ticketTotal) }}
        @if (sum.tipTotal > 0) {
          · Propinas {{ money(sum.tipTotal) }}
        }
      </p>
    }

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
          (edit)="openReceipt($event)"
        />
      </div>
    </div>
  `,
})
export class ComandaReceiptsHistoryPage {
  private readonly api = inject(WaiterApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  readonly shops = inject(ShopContextService);

  private readonly filtersUi = createFiltersCollapsed('comanda-receipts-history');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = () => this.filtersUi.toggleFilters();

  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly rows = signal<ComandaReceiptRow[]>([]);
  readonly waiters = signal<Array<{ id: string; fullName: string }>>([]);
  readonly summary = signal<{ count: number; ticketTotal: number; tipTotal: number } | null>(
    null,
  );

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(this.defaultStart()),
    end: new FormControl<Date | null>(new Date()),
  });

  readonly filters = new FormGroup({
    channel: new FormControl('', { nonNullable: true }),
    paymentKind: new FormControl('', { nonNullable: true }),
    waiterEmployeeId: new FormControl('', { nonNullable: true }),
    hasTip: new FormControl('', { nonNullable: true }),
    q: new FormControl('', { nonNullable: true }),
  });

  readonly paymentOptions = [
    { value: 'CASH' as const, label: paymentLabel('CASH') },
    { value: 'CARD' as const, label: paymentLabel('CARD') },
    { value: 'TRANSFER' as const, label: paymentLabel('TRANSFER') },
  ];

  readonly columns: DataTableColumn[] = [
    {
      key: 'closedAt',
      label: 'Cierre',
      format: (r) => formatDateTime((r as ComandaReceiptRow).closedAt),
    },
    {
      key: 'tableLabel',
      label: 'Lugar',
      format: (r) => {
        const row = r as ComandaReceiptRow;
        return placeHeading(row.tableLabel, row.channel);
      },
    },
    {
      key: 'channel',
      label: 'Canal',
      format: (r) => ((r as ComandaReceiptRow).channel === 'COUNTER' ? 'Mostrador' : 'Mesa'),
    },
    {
      key: 'covers',
      label: 'Pers.',
      format: (r) => {
        const row = r as ComandaReceiptRow;
        return row.channel === 'COUNTER' ? '—' : String(row.covers || '—');
      },
    },
    {
      key: 'waiterName',
      label: 'Mozo',
      format: (r) => (r as ComandaReceiptRow).waiterName?.trim() || '—',
    },
    {
      key: 'paymentLabel',
      label: 'Pago',
      format: (r) => (r as ComandaReceiptRow).paymentLabel || '—',
    },
    {
      key: 'tipAmount',
      label: 'Propina',
      format: (r) => {
        const n = Number((r as ComandaReceiptRow).tipAmount) || 0;
        return n > 0 ? formatMoney(n, { spaced: true }) : '—';
      },
      totalize: true,
      totalValue: (r) => Number((r as ComandaReceiptRow).tipAmount) || 0,
      totalFormat: (sum) => formatMoney(sum, { spaced: true, compact: false }),
    },
    {
      key: 'ticketTotal',
      label: 'Ticket',
      format: (r) => formatMoney(Number((r as ComandaReceiptRow).ticketTotal) || 0, { spaced: true }),
      totalize: true,
      totalValue: (r) => Number((r as ComandaReceiptRow).ticketTotal) || 0,
      totalFormat: (sum) => formatMoney(sum, { spaced: true, compact: false }),
    },
  ];

  constructor() {
    usePageRefresh(() => this.load());

    effect(() => {
      const shopId = this.shops.selectedShopId();
      this.loadWaiters(shopId);
      this.load();
    });

    merge(this.range.valueChanges, this.filters.valueChanges)
      .pipe(debounceTime(250), takeUntilDestroyed())
      .subscribe(() => this.load());
  }

  money(n: number): string {
    return formatMoney(Number(n) || 0, { spaced: true });
  }

  clearFilters(): void {
    this.range.setValue({ start: this.defaultStart(), end: new Date() });
    this.filters.reset({
      channel: '',
      paymentKind: '',
      waiterEmployeeId: '',
      hasTip: '',
      q: '',
    });
  }

  exportExcel(): void {
    const shopId = this.shops.selectedShopId();
    const shop = this.shops.selectedShop();
    const from = toIsoDate(this.range.controls.start.value);
    const to = toIsoDate(this.range.controls.end.value);
    if (!shopId || !from || !to || this.exporting()) return;
    const f = this.filters.getRawValue();
    this.exporting.set(true);
    this.api
      .exportStaffReceiptsExcel(shopId, {
        from,
        to,
        q: f.q.trim() || undefined,
        channel: (f.channel || undefined) as 'TABLE' | 'COUNTER' | undefined,
        paymentKind: (f.paymentKind || undefined) as 'CASH' | 'CARD' | 'TRANSFER' | undefined,
        waiterEmployeeId: f.waiterEmployeeId || undefined,
        hasTip: (f.hasTip || undefined) as 'yes' | 'no' | undefined,
      })
      .subscribe({
        next: (blob) => {
          this.exporting.set(false);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `comprobantes-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${from}_${to}.xlsx`;
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
    return (
      String(name ?? 'local')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'local'
    );
  }

  openReceipt(row: ComandaReceiptRow): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.dialog.open(ComandaReceiptDetailDialog, {
      data: { shopId, row },
      autoFocus: 'dialog',
      width: 'min(440px, 96vw)',
      maxHeight: '92vh',
      panelClass: 'guy-dialog',
    });
  }

  private defaultStart(): Date {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d;
  }

  private loadWaiters(shopId: string | null): void {
    if (!shopId) {
      this.waiters.set([]);
      return;
    }
    this.api.staffWaiters(shopId).subscribe({
      next: (rows) => this.waiters.set(rows ?? []),
      error: () => this.waiters.set([]),
    });
  }

  private loadGen = 0;

  private load(): void {
    const shopId = this.shops.selectedShopId();
    const from = toIsoDate(this.range.controls.start.value);
    const to = toIsoDate(this.range.controls.end.value);
    if (!shopId) {
      this.rows.set([]);
      this.summary.set(null);
      this.loading.set(false);
      return;
    }
    if (!from || !to) return;
    const gen = ++this.loadGen;
    this.loading.set(true);
    const f = this.filters.getRawValue();
    this.api
      .staffReceipts(shopId, {
        from,
        to,
        q: f.q.trim() || undefined,
        channel: (f.channel || undefined) as 'TABLE' | 'COUNTER' | undefined,
        paymentKind: (f.paymentKind || undefined) as 'CASH' | 'CARD' | 'TRANSFER' | undefined,
        waiterEmployeeId: f.waiterEmployeeId || undefined,
        hasTip: (f.hasTip || undefined) as 'yes' | 'no' | undefined,
      })
      .subscribe({
        next: (payload) => {
          if (gen !== this.loadGen) return;
          this.rows.set(payload.rows ?? []);
          this.summary.set({
            count: payload.count ?? 0,
            ticketTotal: payload.ticketTotal ?? 0,
            tipTotal: payload.tipTotal ?? 0,
          });
          this.loading.set(false);
        },
        error: (err) => {
          if (gen !== this.loadGen) return;
          this.loading.set(false);
          const msg = apiErrorMessage(err, 'No se pudo cargar el historial');
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', {
            duration: 3500,
          });
        },
      });
  }
}
