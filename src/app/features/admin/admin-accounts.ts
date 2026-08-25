import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { FilterChipsComponent, SegmentTabsComponent } from '../../shared/components/filter-bar';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { environment } from '../../../environments/environment';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { accountTypeLabel, activeLabel } from '../../core/i18n/labels';
import { AdminAccountDialogComponent, AdminAccountRow } from './admin-account-dialog';
import { AdminAccountDeleteService } from './admin-account-delete-dialog';
import { usePageRefresh } from '../../core/page-refresh.service';

type AccountTypeTab = 'all' | 'CHANNEL' | 'PARTNER' | 'SYSTEM';
type AccountStatusFilter = 'all' | 'active' | 'inactive';
type AccountWithdrawFilter = 'all' | 'visible' | 'hidden';

const TYPE_TABS: Array<{ id: AccountTypeTab; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'CHANNEL', label: 'Canales' },
  { id: 'PARTNER', label: 'Socios' },
  { id: 'SYSTEM', label: 'Sistema' },
];

@Component({
  selector: 'app-admin-accounts',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule,
    PageHeaderComponent,
    DataTableComponent,
    SegmentTabsComponent,
    FilterChipsComponent,
  ],
  template: `
    <app-page-header
      title="Cuentas contables"
      [subtitle]="shops.selectedShop()?.name ?? 'Administración'"
      actionLabel="Nueva cuenta"
      actionIcon="add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    <app-segment-tabs
      ariaLabel="Tipo de cuenta"
      [fill]="true"
      [options]="typeTabs"
      [(value)]="typeTab"
    />

    <div class="acc-filters">
      <app-filter-chips label="Estado" [options]="statusOptions" [(value)]="statusFilter" />
      <app-filter-chips label="Retiro" [options]="withdrawOptions" [(value)]="withdrawFilter" />
    </div>

    <div class="panel-card panel-card--flush">
      <div class="panel-card__body">
        <app-data-table
          [columns]="columns()"
          [rows]="visibleRows()"
          [loading]="loading()"
          [sortable]="true"
          [canRemove]="canRemove"
          (edit)="openEdit($event)"
          (remove)="onRemove($event)"
        />
      </div>
    </div>
  `,
  styles: `
    app-segment-tabs {
      margin: 0 0 0.75rem;
    }
    .acc-filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
      margin: 0 0 0.85rem;
    }
  `,
})
export class AdminAccountsPage {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly accountDelete = inject(AdminAccountDeleteService);
  readonly shops = inject(ShopContextService);

  readonly rows = signal<AdminAccountRow[]>([]);
  readonly loading = signal(true);
  readonly typeTab = signal<AccountTypeTab>('all');
  readonly statusFilter = signal<AccountStatusFilter>('active');
  readonly withdrawFilter = signal<AccountWithdrawFilter>('all');
  readonly typeTabs = TYPE_TABS;
  readonly statusOptions = [
    { id: 'all' as const, label: 'Todas' },
    { id: 'active' as const, label: 'Activas' },
    { id: 'inactive' as const, label: 'Inactivas' },
  ];
  readonly withdrawOptions = [
    { id: 'all' as const, label: 'Todos' },
    { id: 'visible' as const, label: 'Visible' },
    { id: 'hidden' as const, label: 'Oculta' },
  ];

  readonly visibleRows = computed(() => {
    const tab = this.typeTab();
    const status = this.statusFilter();
    const withdraw = this.withdrawFilter();
    return this.rows().filter((row) => {
      if (row.type === 'SUPPLIER' || row.type === 'SERVICE') return false;
      if (tab !== 'all' && row.type !== tab) return false;
      if (status === 'active' && !row.active) return false;
      if (status === 'inactive' && row.active) return false;
      if (withdraw === 'visible' && row.hideFromCashWithdraw) return false;
      if (withdraw === 'hidden' && !row.hideFromCashWithdraw) return false;
      return true;
    });
  });

  readonly columns = computed((): DataTableColumn[] => {
    const showType = this.typeTab() === 'all';
    const cols: DataTableColumn[] = [
      { key: 'name', label: 'Nombre' },
      { key: 'code', label: 'Código' },
    ];
    if (showType) {
      cols.push({
        key: 'type',
        label: 'Tipo',
        format: (r) => accountTypeLabel(String(r['type'] ?? '')),
      });
    }
    cols.push(
      {
        key: 'userFullName',
        label: 'Usuarios',
        format: (r) => String(r['userFullName'] ?? '—'),
      },
      {
        key: 'openingBalance',
        label: 'Saldo inicial',
        format: (r) => {
          const n = Number(r['openingBalance'] ?? 0);
          return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },
      },
      {
        key: 'hideFromCashWithdraw',
        label: 'Retiro',
        format: (r) => (r['hideFromCashWithdraw'] ? 'Oculta' : 'Visible'),
      },
      { key: 'active', label: 'Estado', format: (r) => activeLabel(!!r['active']) },
    );
    return cols;
  });

  readonly canRemove = (row: AdminAccountRow) => row.type !== 'SYSTEM';

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.rows.set([]);
        this.loading.set(false);
        return;
      }
      this.reload();
    });
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.http
      .get<AdminAccountRow[]>(`${environment.apiUrl}/shops/${shopId}/accounts`, {
        params: { includeInactive: '1' },
      })
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snack.open('No se pudieron cargar las cuentas', 'OK', { duration: 3000 });
        },
      });
  }

  openCreate(): void {
    const tab = this.typeTab();
    this.openDialog({
      mode: 'create',
      ...(tab === 'all' ? {} : { defaultType: tab }),
    });
  }

  openEdit(row: AdminAccountRow): void {
    this.openDialog({ mode: 'edit', account: row });
  }

  async onRemove(row: AdminAccountRow): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const deleted = await this.accountDelete.remove(shopId, row);
    if (deleted) this.reload();
  }

  private openDialog(
    mode:
      | { mode: 'create'; defaultType?: AdminAccountRow['type'] }
      | { mode: 'edit'; account: AdminAccountRow },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.dialogTitle
      .track(
        this.dialog.open(AdminAccountDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { ...mode, shopId },
        }),
        mode.mode === 'edit' ? 'Editar cuenta' : 'Nueva cuenta',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }
}
