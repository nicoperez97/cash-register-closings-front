import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PageHeaderComponent } from '../../shared/components/page-header';
import {
  BalancesTableComponent,
  BalanceAccountRow,
  mapBalanceAccount,
} from '../../shared/components/balances-table';
import { SegmentTabsComponent } from '../../shared/components/filter-bar';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { usePageRefresh } from '../../core/page-refresh.service';
import { MovementsApiService } from '../movements/movements-api.service';
import { accountTypeLabel } from '../../core/i18n/labels';

type BalanceTypeTab =
  | 'all'
  | 'CHANNEL'
  | 'PARTNER'
  | 'DIVIDENDS'
  | 'SYSTEM'
  | 'SUPPLIER'
  | 'SERVICE';

const TYPE_TABS: Array<{ id: BalanceTypeTab; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'CHANNEL', label: 'Canales' },
  { id: 'PARTNER', label: 'Socios' },
  { id: 'DIVIDENDS', label: 'Dividendos' },
  { id: 'SYSTEM', label: 'Sistema' },
  { id: 'SUPPLIER', label: 'Proveedores' },
  { id: 'SERVICE', label: 'Servicios' },
];

type BalanceRow = BalanceAccountRow & { listInBalances?: boolean };

@Component({
  selector: 'app-account-balances-page',
  imports: [
    MatProgressSpinnerModule,
    PageHeaderComponent,
    BalancesTableComponent,
    SegmentTabsComponent,
  ],
  template: `
    <app-page-header
      title="Saldos"
      [subtitle]="shops.selectedShop()?.name ?? 'Cuentas'"
    />

    <p class="bal-lead">
      Todas las cuentas activas del local (incluye las que no aparecen en el panel lateral de
      Saldos).
    </p>

    <app-segment-tabs
      ariaLabel="Tipo de cuenta"
      [fill]="true"
      [options]="typeTabs"
      [(value)]="typeTab"
    />

    @if (loading()) {
      <div class="bal-loading">
        <mat-spinner diameter="36" />
      </div>
    } @else {
      <div class="panel-card panel-card--flush">
        <div class="panel-card__body">
          <app-balances-table
            title="Saldos"
            [subtitle]="tableSubtitle()"
            [accounts]="visibleRows()"
            [shopId]="shops.selectedShopId()"
            [fileSlug]="shops.selectedShop()?.name ?? 'local'"
            [balancesScope]="'all'"
          />
        </div>
      </div>
    }
  `,
  styles: `
    .bal-lead {
      margin: 0 0 0.85rem;
      color: var(--guy-muted, #64748b);
      font-size: 0.92rem;
      line-height: 1.45;
      max-width: 46rem;
    }
    app-segment-tabs {
      margin: 0 0 0.75rem;
    }
    .bal-loading {
      display: flex;
      justify-content: center;
      padding: 2.5rem 1rem;
    }
  `,
})
export class AccountBalancesPage {
  readonly shops = inject(ShopContextService);
  private readonly api = inject(MovementsApiService);

  readonly typeTabs = TYPE_TABS;
  readonly typeTab = signal<BalanceTypeTab>('all');
  readonly loading = signal(false);
  readonly rows = signal<BalanceRow[]>([]);
  private readonly refreshTick = signal(0);

  readonly visibleRows = computed(() => {
    const tab = this.typeTab();
    const all = this.rows();
    if (tab === 'all') return all;
    return all.filter((r) => r.type === tab);
  });

  readonly tableSubtitle = computed(() => {
    const tab = this.typeTab();
    const n = this.visibleRows().length;
    if (tab === 'all') return `${n} cuenta${n === 1 ? '' : 's'} activas`;
    return `${accountTypeLabel(tab)} · ${n}`;
  });

  constructor() {
    usePageRefresh(() => this.refreshTick.update((n) => n + 1));
    effect(() => {
      this.refreshTick();
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.rows.set([]);
        return;
      }
      this.loading.set(true);
      this.api.balances(shopId, { scope: 'all' }).subscribe({
        next: (res) => {
          this.rows.set(
            (res.accounts ?? []).map((a) => ({
              ...mapBalanceAccount(a),
              listInBalances: a.listInBalances,
            })),
          );
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.loading.set(false);
        },
      });
    });
  }
}
