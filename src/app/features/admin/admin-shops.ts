import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { activeLabel } from '../../core/i18n/labels';
import { AdminShopDialogComponent, AdminShopRow } from './admin-shop-dialog';
import { ShopBackupDialogComponent } from './shop-backup-dialog';
import { usePageRefresh } from '../../core/page-refresh.service';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-admin-shops',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule,
    MatIconModule,
    PageHeaderComponent,
    DataTableComponent,
  ],
  template: `
    <app-page-header
      title="Locales"
      subtitle="Crear, editar y habilitar / deshabilitar locales"
      actionLabel="Nuevo local"
      actionIcon="add_business"
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
          [showActions]="true"
          [canDuplicate]="canBackupTools"
          duplicateLabel="Dump / reset"
          duplicateIcon="backup"
          [canRemove]="always"
          removeLabel="Habilitar / deshabilitar"
          removeIcon="storefront"
          editLabel="Editar"
          (edit)="openEdit($event)"
          (duplicate)="openBackupTools($event)"
          (remove)="toggleActive($event)"
        />
      </div>
    </div>
  `,
})
export class AdminShopsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly rows = signal<AdminShopRow[]>([]);
  readonly loading = signal(true);
  readonly never = () => false;
  readonly always = () => true;
  readonly canBackupTools = () => this.auth.isSuperAdmin();

  readonly columns: DataTableColumn[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'slug', label: 'Slug' },
    { key: 'currency', label: 'Moneda' },
    {
      key: 'unitsLabel',
      label: 'Unidades',
      format: (r) => String(r['unitsLabel'] ?? '—'),
    },
    { key: 'active', label: 'Estado', format: (r) => activeLabel(!!r['active']) },
  ];

  constructor() {
    usePageRefresh(() => this.reload());
  }

  ngOnInit(): void {
    if (!this.auth.isSuperAdmin()) {
      void this.router.navigate(['/']);
      return;
    }
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.http.get<AdminShopRow[]>(`${environment.apiUrl}/shops`).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar los locales', 'OK', { duration: 3000 });
      },
    });
  }

  openCreate(): void {
    this.openDialog({ mode: 'create' });
  }

  openEdit(row: AdminShopRow): void {
    this.openDialog({ mode: 'edit', shop: row });
  }

  openBackupTools(row: AdminShopRow): void {
    if (!this.auth.isSuperAdmin()) return;
    this.dialogTitle
      .track(
        this.dialog.open(ShopBackupDialogComponent, {
          width: '640px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { shopId: row.id, shopName: row.name, shopSlug: row.slug },
        }),
        'Dump y reset',
      )
      .afterClosed()
      .subscribe();
  }

  toggleActive(row: AdminShopRow): void {
    const next = !row.active;
    this.http.patch<AdminShopRow>(`${environment.apiUrl}/shops/${row.id}`, { active: next }).subscribe({
      next: () => {
        this.snack.open(
          next ? 'Local habilitado' : 'Local deshabilitado · no aparece en el selector',
          'OK',
          { duration: 3000 },
        );
        this.reload();
        void this.auth.refreshMe();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo cambiar el estado';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  private openDialog(mode: { mode: 'create' } | { mode: 'edit'; shop: AdminShopRow }): void {
    this.dialogTitle
      .track(
        this.dialog.open(AdminShopDialogComponent, {
          width: '560px',
          maxWidth: '96vw',
          maxHeight: '94vh',
          panelClass: 'guy-dialog',
          data: mode,
        }),
        mode.mode === 'edit' ? 'Editar local' : 'Nuevo local',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) {
          this.reload();
          void this.auth.refreshMe();
        }
      });
  }
}
