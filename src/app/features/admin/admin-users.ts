import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { environment } from '../../../environments/environment';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import {
  GLOBAL_ROLE_OPTIONS,
  canManageShopUsers,
  userRoleLabel,
} from '../../core/auth/auth.models';
import { activeLabel } from '../../core/i18n/labels';
import { AdminUserDialogComponent, AdminUserRow } from './admin-user-dialog';

@Component({
  selector: 'app-admin-users',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule,
    PageHeaderComponent,
    DataTableComponent,
  ],
  template: `
    <app-page-header
      title="Usuarios"
      [subtitle]="shops.selectedShop()?.name ?? 'Administración'"
      actionLabel="Nuevo usuario"
      actionIcon="person_add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    <div class="panel-card panel-card--flush">
      <div class="panel-card__body">
        <app-data-table
          [columns]="columns"
          [rows]="rows()"
          [showActions]="true"
          [canRemove]="never"
          (edit)="openEdit($event)"
        />
      </div>
    </div>
  `,
})
export class AdminUsersPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  readonly shops = inject(ShopContextService);

  readonly roleOptions = GLOBAL_ROLE_OPTIONS.filter((o) => {
    if (o.value === 'OWNER') return false;
    const global = this.auth.currentUser()?.globalRole;
    if (global === 'OWNER' || global === 'ADMIN') return true;
    return (
      o.value === 'MANAGER' ||
      o.value === 'CASHIER' ||
      o.value === 'VIEWER' ||
      o.value === 'PARTNER'
    );
  });

  readonly rows = signal<AdminUserRow[]>([]);
  readonly never = () => false;

  readonly columns: DataTableColumn[] = [
    { key: 'fullName', label: 'Nombre' },
    { key: 'email', label: 'Correo' },
    { key: 'globalRole', label: 'Rol', format: (r) => userRoleLabel(String(r['globalRole'] ?? '')) },
    {
      key: 'ledgerAccountName',
      label: 'Cuentas',
      format: (r) => String(r['ledgerAccountName'] ?? '—'),
    },
    { key: 'active', label: 'Estado', format: (r) => activeLabel(!!r['active']) },
  ];

  constructor() {
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) return;
      if (!canManageShopUsers(this.auth.currentUser(), shopId)) {
        void this.router.navigate(['/']);
        return;
      }
      this.reload();
    });
  }

  ngOnInit(): void {
    const shopId = this.shops.selectedShopId();
    if (!canManageShopUsers(this.auth.currentUser(), shopId)) {
      void this.router.navigate(['/']);
    }
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.http.get<AdminUserRow[]>(`${environment.apiUrl}/users`, { params: { shopId } }).subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.snack.open('No se pudieron cargar los usuarios', 'OK', { duration: 3000 }),
    });
  }

  openCreate(): void {
    this.openDialog({ mode: 'create' });
  }

  openEdit(row: AdminUserRow): void {
    this.openDialog({ mode: 'edit', user: row });
  }

  private openDialog(
    mode:
      | { mode: 'create' }
      | { mode: 'edit'; user: AdminUserRow },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    this.dialogTitle
      .track(
        this.dialog.open(AdminUserDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            ...mode,
            shopId,
            shopName,
            roleOptions: this.roleOptions,
          },
        }),
        mode.mode === 'edit' ? 'Editar usuario' : 'Nuevo usuario',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }
}
