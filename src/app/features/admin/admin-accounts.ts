import { Component, effect, inject, signal } from '@angular/core';
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

    <div class="panel-card panel-card--flush">
      <div class="panel-card__body">
        <app-data-table
          [columns]="columns"
          [rows]="rows()"
          [loading]="loading()"
          [sortable]="true"
          [canRemove]="canRemove"
          (edit)="openEdit($event)"
          (remove)="onRemove($event)"
        />
      </div>
    </div>
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

  readonly columns: DataTableColumn[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'code', label: 'Código' },
    { key: 'type', label: 'Tipo', format: (r) => accountTypeLabel(String(r['type'] ?? '')) },
    {
      key: 'userFullName',
      label: 'Usuarios',
      format: (r) => String(r['userFullName'] ?? '—'),
    },
    {
      key: 'hideFromCashWithdraw',
      label: 'Retiro',
      format: (r) => (r['hideFromCashWithdraw'] ? 'Oculta' : 'Visible'),
    },
    { key: 'active', label: 'Estado', format: (r) => activeLabel(!!r['active']) },
  ];

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
      .get<AdminAccountRow[]>(`${environment.apiUrl}/shops/${shopId}/accounts`)
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
    this.openDialog({ mode: 'create' });
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
    mode: { mode: 'create' } | { mode: 'edit'; account: AdminAccountRow },
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
