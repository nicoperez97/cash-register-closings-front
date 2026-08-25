import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
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
  imports: [MatButtonModule, MatDialogModule, MatSnackBarModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Cuentas contables"
      [subtitle]="shops.selectedShop()?.name ?? 'Administración'"
      actionLabel="Nueva cuenta"
      actionIcon="add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    <nav class="acc-tabs" role="tablist" aria-label="Tipo de cuenta">
      @for (tab of typeTabs; track tab.id) {
        <button
          type="button"
          class="acc-tabs__btn"
          role="tab"
          [class.acc-tabs__btn--on]="typeTab() === tab.id"
          [attr.aria-selected]="typeTab() === tab.id"
          (click)="typeTab.set(tab.id)"
        >
          {{ tab.label }}
        </button>
      }
    </nav>

    <div class="acc-filters">
      <span class="acc-filters__label">Estado</span>
      <button type="button" class="acc-filters__chip" [class.acc-filters__chip--on]="statusFilter() === 'all'" (click)="statusFilter.set('all')">Todas</button>
      <button type="button" class="acc-filters__chip" [class.acc-filters__chip--on]="statusFilter() === 'active'" (click)="statusFilter.set('active')">Activas</button>
      <button type="button" class="acc-filters__chip" [class.acc-filters__chip--on]="statusFilter() === 'inactive'" (click)="statusFilter.set('inactive')">Inactivas</button>
      <span class="acc-filters__label">Retiro</span>
      <button type="button" class="acc-filters__chip" [class.acc-filters__chip--on]="withdrawFilter() === 'all'" (click)="withdrawFilter.set('all')">Todos</button>
      <button type="button" class="acc-filters__chip" [class.acc-filters__chip--on]="withdrawFilter() === 'visible'" (click)="withdrawFilter.set('visible')">Visible</button>
      <button type="button" class="acc-filters__chip" [class.acc-filters__chip--on]="withdrawFilter() === 'hidden'" (click)="withdrawFilter.set('hidden')">Oculta</button>
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
    .acc-tabs {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.35rem;
      margin: 0 0 0.75rem;
      padding: 0.28rem;
      border-radius: 14px;
      background: color-mix(in srgb, var(--guy-navy, #003366) 5%, var(--guy-card, #fff));
      border: 1px solid var(--guy-border, #d7e0d9);
    }
    .acc-tabs__btn {
      border: 0;
      background: transparent;
      color: var(--guy-muted, #5f6f76);
      border-radius: 11px;
      padding: 0.55rem 0.5rem;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .acc-tabs__btn--on {
      background: var(--guy-card, #fff);
      color: var(--guy-navy, #003366);
      box-shadow: 0 1px 3px rgba(0, 30, 50, 0.08);
    }
    .acc-filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
      margin: 0 0 0.85rem;
    }
    .acc-filters__label {
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
      margin-left: 0.25rem;
    }
    .acc-filters__label:first-child {
      margin-left: 0;
    }
    .acc-filters__chip {
      border: 1px solid var(--guy-border, #d7e0d9);
      background: var(--guy-card, #fff);
      color: var(--guy-text, #1b2a33);
      border-radius: 999px;
      padding: 0.28rem 0.75rem;
      font: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
    }
    .acc-filters__chip--on {
      border-color: var(--guy-green, #2e7d32);
      color: var(--guy-green, #2e7d32);
      background: color-mix(in srgb, var(--guy-green, #2e7d32) 10%, #fff);
    }
    @media (max-width: 720px) {
      .acc-tabs {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
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
