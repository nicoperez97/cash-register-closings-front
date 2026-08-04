import { Component, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { environment } from '../../../environments/environment';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { activeLabel, conceptKindLabel } from '../../core/i18n/labels';
import { AdminConceptDialogComponent, AdminConceptRow } from './admin-concept-dialog';
import { usePageRefresh } from '../../core/page-refresh.service';

@Component({
  selector: 'app-admin-concepts',
  imports: [MatButtonModule, MatDialogModule, MatSnackBarModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Conceptos"
      [subtitle]="shops.selectedShop()?.name ?? 'Administración'"
      actionLabel="Nuevo concepto"
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
          (edit)="openEdit($event)"
          (remove)="onRemove($event)"
        />
      </div>
    </div>
  `,
})
export class AdminConceptsPage {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  readonly shops = inject(ShopContextService);

  readonly rows = signal<AdminConceptRow[]>([]);
  readonly loading = signal(true);

  readonly columns: DataTableColumn[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'kind', label: 'Tipo', format: (r) => conceptKindLabel(String(r['kind'] ?? '')) },
    { key: 'active', label: 'Estado', format: (r) => activeLabel(!!r['active']) },
  ];

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
      .get<AdminConceptRow[]>(`${environment.apiUrl}/shops/${shopId}/concepts`)
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snack.open('No se pudieron cargar los conceptos', 'OK', { duration: 3000 });
        },
      });
  }

  openCreate(): void {
    this.openDialog({ mode: 'create' });
  }

  openEdit(row: AdminConceptRow): void {
    this.openDialog({ mode: 'edit', concept: row });
  }

  async onRemove(row: AdminConceptRow): Promise<void> {
    const ok = await this.confirmDialog.confirm('Eliminar concepto', `¿Eliminar "${row.name}"?`);
    if (!ok) return;
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.http.delete(`${environment.apiUrl}/shops/${shopId}/concepts/${row.id}`).subscribe({
      next: () => {
        this.snack.open('Concepto eliminado', 'OK', { duration: 2500 });
        this.reload();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo eliminar el concepto';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
      },
    });
  }

  private openDialog(
    mode: { mode: 'create' } | { mode: 'edit'; concept: AdminConceptRow },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.dialogTitle
      .track(
        this.dialog.open(AdminConceptDialogComponent, {
          width: '480px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { ...mode, shopId },
        }),
        mode.mode === 'edit' ? 'Editar concepto' : 'Nuevo concepto',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }
}
