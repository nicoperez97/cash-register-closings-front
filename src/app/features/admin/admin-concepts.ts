import { Component, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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

    @if (selectedIds().length) {
      <div class="bulk-bar mb-3">
        <span class="bulk-bar__count">
          {{ selectedIds().length }} seleccionado{{ selectedIds().length === 1 ? '' : 's' }}
        </span>
        <button
          mat-flat-button
          color="warn"
          type="button"
          [disabled]="bulkBusy()"
          (click)="removeSelected()"
        >
          <mat-icon>delete</mat-icon>
          {{ bulkBusy() ? 'Eliminando…' : 'Eliminar seleccionados' }}
        </button>
        <button mat-button type="button" [disabled]="bulkBusy()" (click)="clearSelection()">
          Limpiar
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
          [selectable]="true"
          [selection]="selectedIds()"
          (selectionChange)="selectedIds.set($event)"
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
    .bulk-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 0.75rem;
      padding: 0.65rem 0.85rem;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--guy-danger, #c62828) 22%, var(--guy-border, #e6ebf0));
      background: color-mix(in srgb, var(--guy-danger, #c62828) 6%, #fff);
    }
    .bulk-bar__count {
      font-weight: 700;
      color: var(--guy-navy, #003366);
      margin-right: 0.25rem;
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
  readonly selectedIds = signal<string[]>([]);
  readonly bulkBusy = signal(false);

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
        this.selectedIds.set([]);
        this.loading.set(false);
        return;
      }
      this.reload();
    });
  }

  clearSelection(): void {
    this.selectedIds.set([]);
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
          const alive = new Set(rows.map((r) => r.id));
          this.selectedIds.update((ids) => ids.filter((id) => alive.has(id)));
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
    const ok = await this.confirmDialog.confirm('Eliminar concepto', `¿Eliminar "${row.name}"?`, {
      confirmLabel: 'Eliminar',
      icon: 'delete',
    });
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

  async removeSelected(): Promise<void> {
    const ids = this.selectedIds();
    const shopId = this.shops.selectedShopId();
    if (!ids.length || !shopId || this.bulkBusy()) return;
    const ok = await this.confirmDialog.confirm(
      'Eliminar conceptos',
      `¿Eliminar ${ids.length} concepto${ids.length === 1 ? '' : 's'}? Esta acción no se puede deshacer desde acá.`,
      { confirmLabel: 'Eliminar', icon: 'delete' },
    );
    if (!ok) return;

    this.bulkBusy.set(true);
    const results = await Promise.allSettled(
      ids.map((id) =>
        firstValueFrom(this.http.delete(`${environment.apiUrl}/shops/${shopId}/concepts/${id}`)),
      ),
    );
    this.bulkBusy.set(false);
    const done = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - done;
    if (failed === 0) {
      this.snack.open(
        done === 1 ? 'Concepto eliminado' : `Se eliminaron ${done} conceptos`,
        'OK',
        { duration: 2800 },
      );
    } else if (done === 0) {
      this.snack.open('No se pudieron eliminar los conceptos', 'OK', { duration: 3500 });
    } else {
      this.snack.open(`Se eliminaron ${done}; fallaron ${failed}`, 'OK', { duration: 4000 });
    }
    this.selectedIds.set([]);
    this.reload();
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
