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
import { canManageShopUsers, userRoleLabel } from '../../core/auth/auth.models';
import { activeLabel } from '../../core/i18n/labels';
import { AdminUserDialogComponent, AdminUserRow } from './admin-user-dialog';

function accountTypeLabel(row: Record<string, unknown>): string {
  const role = String(row['globalRole'] ?? '');
  if (role === 'OWNER' || role === 'ADMIN') return userRoleLabel(role);
  return 'Empleado';
}

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
          [canDuplicate]="always"
          editLabel="Editar datos"
          duplicateLabel="Editar roles"
          duplicateIcon="shield"
          (edit)="openEdit($event)"
          (duplicate)="openRoles($event)"
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

  readonly rows = signal<AdminUserRow[]>([]);
  readonly never = () => false;
  readonly always = () => true;

  readonly columns: DataTableColumn[] = [
    { key: 'fullName', label: 'Nombre' },
    { key: 'email', label: 'Correo' },
    { key: 'globalRole', label: 'Tipo', format: (r) => accountTypeLabel(r) },
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

  openRoles(row: AdminUserRow): void {
    this.openDialog({ mode: 'roles', user: row });
  }

  private canAssignUsersModule(): boolean {
    const g = this.auth.currentUser()?.globalRole;
    return g === 'OWNER' || g === 'ADMIN';
  }

  private openDialog(
    mode:
      | { mode: 'create' }
      | { mode: 'edit'; user: AdminUserRow }
      | { mode: 'roles'; user: AdminUserRow },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    const title =
      mode.mode === 'roles'
        ? 'Editar roles'
        : mode.mode === 'edit'
          ? 'Editar usuario'
          : 'Nuevo usuario';
    this.dialogTitle
      .track(
        this.dialog.open(AdminUserDialogComponent, {
          width: mode.mode === 'roles' ? '640px' : '680px',
          maxWidth: '96vw',
          maxHeight: '94vh',
          panelClass: 'guy-dialog',
          data: {
            ...mode,
            shopId,
            shopName,
            canAssignUsersModule: this.canAssignUsersModule(),
          },
        }),
        title,
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }
}
