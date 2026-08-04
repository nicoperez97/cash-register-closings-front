import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
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
import { usePageRefresh } from '../../core/page-refresh.service';

function accountTypeLabel(row: Record<string, unknown>): string {
  const role = String(row['globalRole'] ?? '');
  if (role === 'OWNER') return userRoleLabel(role);
  if (role === 'ADMIN') return userRoleLabel(role);
  return 'Empleado';
}

@Component({
  selector: 'app-admin-users',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatSnackBarModule,
    PageHeaderComponent,
    DataTableComponent,
  ],
  template: `
    <app-page-header
      title="Usuarios"
      [subtitle]="headerSubtitle()"
      actionLabel="Nuevo usuario"
      actionIcon="person_add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    @if (isSuperAdmin()) {
      <div class="panel-card mb-3" style="padding: 0.75rem 1rem">
        <mat-button-toggle-group
          [value]="scope()"
          (change)="scope.set($event.value); reload()"
          aria-label="Alcance de usuarios"
        >
          <mat-button-toggle value="all">Todos los locales</mat-button-toggle>
          <mat-button-toggle value="shop">Solo {{ shops.selectedShop()?.name ?? 'local' }}</mat-button-toggle>
        </mat-button-toggle-group>
      </div>
    }

    <div class="panel-card panel-card--flush">
      <div class="panel-card__body">
        <app-data-table
          [columns]="columns()"
          [rows]="rows()"
          [loading]="loading()"
          [showActions]="true"
          [canRemove]="canRemoveRow"
          [removeLabel]="removeActionLabel()"
          [removeIcon]="removeActionIcon()"
          [canDuplicate]="always"
          editLabel="Editar datos"
          duplicateLabel="Editar roles"
          duplicateIcon="shield"
          (edit)="openEdit($event)"
          (duplicate)="openRoles($event)"
          (remove)="onRemove($event)"
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
  readonly loading = signal(true);
  readonly allShops = signal<Array<{ id: string; name: string }>>([]);
  readonly scope = signal<'all' | 'shop'>('all');
  readonly always = () => true;
  readonly canRemoveRow = (row: AdminUserRow) =>
    row.id !== this.auth.currentUser()?.id;

  readonly isOwner = () => this.auth.isSuperAdmin();
  /** Scope multi-local: Super admin, o admin con más de un local asignado. */
  readonly isSuperAdmin = () =>
    this.auth.isSuperAdmin() || this.shops.shops().length > 1;

  removeActionLabel(): string {
    return this.isOwner() ? 'Eliminar' : 'Activar / desactivar';
  }

  removeActionIcon(): string {
    return this.isOwner() ? 'delete' : 'person_off';
  }

  headerSubtitle(): string {
    if (this.isSuperAdmin() && this.scope() === 'all') return 'Todos los locales';
    return this.shops.selectedShop()?.name ?? 'Administración';
  }

  columns(): DataTableColumn[] {
    const shopNames = new Map(this.allShops().map((s) => [s.id, s.name]));
    const cols: DataTableColumn[] = [
      { key: 'fullName', label: 'Nombre' },
      { key: 'email', label: 'Correo' },
      { key: 'globalRole', label: 'Tipo', format: (r) => accountTypeLabel(r) },
    ];
    if (this.isSuperAdmin() && this.scope() === 'all') {
      cols.push({
        key: 'shopIds',
        label: 'Locales',
        format: (r) => {
          const ids = (r['shopIds'] as string[] | undefined) ?? [];
          if (!ids.length) return '—';
          return ids.map((id) => shopNames.get(id) ?? id.slice(0, 8)).join(', ');
        },
      });
    } else {
      cols.push({
        key: 'ledgerAccountName',
        label: 'Cuentas',
        format: (r) => String(r['ledgerAccountName'] ?? '—'),
      });
      cols.push({
        key: 'hideFromCashWithdraw',
        label: 'Retiro',
        format: (r) => (r['hideFromCashWithdraw'] ? 'Oculto' : 'Visible'),
      });
    }
    cols.push({ key: 'active', label: 'Estado', format: (r) => activeLabel(!!r['active']) });
    return cols;
  }

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!canManageShopUsers(this.auth.currentUser(), shopId) && !this.auth.isAdmin()) {
        void this.router.navigate(['/']);
        return;
      }
      if (!shopId && !this.auth.isAdmin()) return;
      if (!shopId && this.scope() === 'shop') {
        this.scope.set('all');
      }
      this.reload();
    });
  }

  ngOnInit(): void {
    const shopId = this.shops.selectedShopId();
    if (!canManageShopUsers(this.auth.currentUser(), shopId) && !this.auth.isAdmin()) {
      void this.router.navigate(['/']);
      return;
    }
    if (this.auth.isAdmin()) {
      this.http.get<Array<{ id: string; name: string }>>(`${environment.apiUrl}/shops`).subscribe({
        next: (rows) => this.allShops.set(rows.map((s) => ({ id: s.id, name: s.name }))),
        error: () => this.allShops.set(this.shops.shops().map((s) => ({ id: s.id, name: s.name }))),
      });
    } else {
      this.allShops.set(this.shops.shops().map((s) => ({ id: s.id, name: s.name })));
    }
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId && !this.auth.isAdmin()) {
      this.loading.set(false);
      return;
    }

    const opts =
      this.auth.isAdmin() && this.scope() === 'all'
        ? {}
        : { params: { shopId: shopId! } };

    this.loading.set(true);
    this.http.get<AdminUserRow[]>(`${environment.apiUrl}/users`, opts).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar los usuarios', 'OK', { duration: 3000 });
      },
    });
  }

  onRemove(row: AdminUserRow): void {
    if (this.isOwner()) {
      this.deleteUser(row);
      return;
    }
    this.toggleActive(row);
  }

  deleteUser(row: AdminUserRow): void {
    if (row.id === this.auth.currentUser()?.id) {
      this.snack.open('No podés eliminar tu propio usuario', 'OK', { duration: 3000 });
      return;
    }
    const ok = window.confirm(
      `¿Eliminar a “${row.fullName}” (${row.email})? Se quitará de todos los locales y no podrá iniciar sesión.`,
    );
    if (!ok) return;
    this.http.delete(`${environment.apiUrl}/users/${row.id}`).subscribe({
      next: () => {
        this.snack.open('Usuario eliminado', 'OK', { duration: 3000 });
        this.reload();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo eliminar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  toggleActive(row: AdminUserRow): void {
    if (row.id === this.auth.currentUser()?.id) {
      this.snack.open('No podés desactivar tu propio usuario', 'OK', { duration: 3000 });
      return;
    }
    const next = !row.active;
    const shopId = this.shops.selectedShopId();
    const qs = shopId ? `?shopId=${shopId}` : '';
    this.http.patch(`${environment.apiUrl}/users/${row.id}${qs}`, { active: next }).subscribe({
      next: () => {
        this.snack.open(
          next ? 'Usuario activado' : 'Usuario desactivado · no podrá iniciar sesión',
          'OK',
          { duration: 3000 },
        );
        this.reload();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo cambiar el estado';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
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
            canAssignSuperAdmin: this.auth.isSuperAdmin(),
            canAssignShops: this.auth.isAdmin(),
            allShops: this.allShops(),
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
