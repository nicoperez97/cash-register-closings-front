import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { environment } from '../../../environments/environment';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { canManageShop } from '../../core/auth/auth.models';
import { activeLabel } from '../../core/i18n/labels';
import {
  AdminSalesSystemDialogComponent,
  AdminSalesSystemRow,
  ParserOption,
} from './admin-sales-system-dialog';

@Component({
  selector: 'app-admin-sales-systems',
  imports: [MatButtonModule, MatDialogModule, MatSnackBarModule, PageHeaderComponent, DataTableComponent],
  template: `
    <app-page-header
      title="Sistemas de ventas"
      subtitle="POS / reportes de comprobantes (Restosoft, etc.)"
      actionLabel="Nuevo sistema"
      actionIcon="add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    <div class="panel-card panel-card--flush">
      <div class="panel-card__body">
        <app-data-table
          [columns]="columns"
          [rows]="rows()"
          [sortable]="true"
          (edit)="openEdit($event)"
          (remove)="onRemove($event)"
        />
      </div>
    </div>
  `,
})
export class AdminSalesSystemsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly shops = inject(ShopContextService);

  readonly rows = signal<AdminSalesSystemRow[]>([]);
  readonly parsers = signal<ParserOption[]>([]);

  readonly columns: DataTableColumn[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'code', label: 'Código' },
    { key: 'parserKey', label: 'Parser' },
    {
      key: 'parserAvailable',
      label: 'Parser OK',
      format: (r) => (r['parserAvailable'] ? 'Sí' : 'No'),
    },
    { key: 'active', label: 'Estado', format: (r) => activeLabel(!!r['active']) },
  ];

  ngOnInit(): void {
    const shopId = this.shops.selectedShopId();
    if (!canManageShop(this.auth.currentUser(), shopId)) {
      void this.router.navigate(['/']);
      return;
    }
    this.http.get<ParserOption[]>(`${environment.apiUrl}/sales-systems/parsers`).subscribe({
      next: (rows) => this.parsers.set(rows),
      error: () => this.parsers.set([{ key: 'restosoft', label: 'Restosoft' }]),
    });
    this.reload();
  }

  reload(): void {
    this.http
      .get<AdminSalesSystemRow[]>(`${environment.apiUrl}/sales-systems`, {
        params: { all: '1' },
      })
      .subscribe({
        next: (rows) => this.rows.set(rows),
        error: () =>
          this.snack.open('No se pudieron cargar los sistemas', 'OK', { duration: 3000 }),
      });
  }

  openCreate(): void {
    this.openDialog({ mode: 'create' });
  }

  openEdit(row: AdminSalesSystemRow): void {
    this.openDialog({ mode: 'edit', system: row });
  }

  async onRemove(row: AdminSalesSystemRow): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      'Eliminar sistema',
      `¿Eliminar "${row.name}"? Los locales no deben tenerlo asignado.`,
    );
    if (!ok) return;
    this.http.delete(`${environment.apiUrl}/sales-systems/${row.id}`).subscribe({
      next: () => {
        this.snack.open('Sistema eliminado', 'OK', { duration: 2500 });
        this.reload();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo eliminar el sistema';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  private openDialog(
    mode: { mode: 'create' } | { mode: 'edit'; system: AdminSalesSystemRow },
  ): void {
    this.dialogTitle
      .track(
        this.dialog.open(AdminSalesSystemDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { ...mode, parsers: this.parsers() },
        }),
        mode.mode === 'edit' ? 'Editar sistema' : 'Nuevo sistema',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }
}
