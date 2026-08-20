import { Component, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { environment } from '../../../environments/environment';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { activeLabel, conceptKindLabel, yesNoLabel } from '../../core/i18n/labels';
import { formatConceptCategories } from '../../shared/concept-categories';
import { AdminConceptDialogComponent, AdminConceptRow } from './admin-concept-dialog';
import { AdminConceptsExcelDialogComponent } from './admin-concepts-excel-dialog';
import { usePageRefresh } from '../../core/page-refresh.service';

@Component({
  selector: 'app-admin-concepts',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    PageHeaderComponent,
    DataTableComponent,
  ],
  template: `
    <app-page-header
      title="Conceptos"
      [subtitle]="shops.selectedShop()?.name ?? 'Administración'"
      actionLabel="Nuevo concepto"
      actionIcon="add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    @if (shops.selectedShopId()) {
      <div class="xl-toolbar mb-3">
        <button mat-stroked-button type="button" (click)="downloadTemplate()">
          <mat-icon>download</mat-icon>
          Descargar plantilla
        </button>
        <button mat-stroked-button type="button" (click)="openExcelImport()">
          <mat-icon>upload_file</mat-icon>
          Importar Excel
        </button>
      </div>
    }

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
  styles: `
    .xl-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
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
    {
      key: 'description',
      label: 'Descripción',
      format: (r) => {
        const s = String(r['description'] ?? '').trim();
        if (!s) return '—';
        return s.length > 72 ? `${s.slice(0, 69)}…` : s;
      },
    },
    { key: 'kind', label: 'Tipo', format: (r) => conceptKindLabel(String(r['kind'] ?? '')) },
    {
      key: 'categories',
      label: 'Categorías',
      format: (r) => formatConceptCategories(r['categories'] as string[] | undefined),
    },
    { key: 'validated', label: 'Validado', format: (r) => yesNoLabel(!!r['validated']) },
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
      .get<AdminConceptRow[]>(`${environment.apiUrl}/shops/${shopId}/concepts`, {
        params: { includeInactive: 'true', includeUnvalidated: 'true' },
      })
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

  downloadTemplate(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.http
      .get(`${environment.apiUrl}/shops/${shopId}/concepts/import-template.xlsx`, {
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'plantilla-conceptos.xlsx';
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => this.snack.open('No se pudo descargar la plantilla', 'OK', { duration: 3000 }),
      });
  }

  openExcelImport(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.dialogTitle
      .track(
        this.dialog.open(AdminConceptsExcelDialogComponent, {
          width: '860px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            shopId,
            shopName: this.shops.selectedShop()?.name ?? 'Local',
          },
        }),
        'Importar conceptos',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
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
