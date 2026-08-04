import { Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { activeLabel } from '../../core/i18n/labels';
import { Employee, EmployeesApiService, ShopUserOption } from './employees-api.service';
import { EmployeeDialogComponent } from './employee-dialog';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';

@Component({
  selector: 'app-employees-list',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    PageHeaderComponent,
    DataTableComponent,
    FiltersCollapseBtnComponent,
  ],
  template: `
    <app-page-header
      title="Empleados"
      [subtitle]="shops.selectedShop()?.name ?? 'Administración'"
      [actionLabel]="canManage() ? 'Nuevo empleado' : ''"
      [actionDisabled]="!canManage()"
      actionIcon="person_add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    <div
      class="panel-card guy-filters mb-3"
      [class.guy-filters--collapsed]="filtersCollapsed()"
    >
      <div class="guy-filters__head">
        <div>
          <h3 class="guy-filters__title">Filtros</h3>
          <p class="guy-filters__subtitle">Incluí empleados ocultos</p>
        </div>
        <div class="guy-filters__tools">
          <app-filters-collapse-btn
            [collapsed]="filtersCollapsed()"
            (toggle)="toggleFilters()"
          />
        </div>
      </div>
      <div class="guy-filters__body">
      <mat-slide-toggle [ngModel]="includeInactive()" (ngModelChange)="onToggleInactive($event)">
        Mostrar ocultos
      </mat-slide-toggle>
      </div>
    </div>

    <div class="panel-card panel-card--flush">
      <div class="panel-card__body">
        <app-data-table
          [columns]="columns"
          [rows]="rows()"
          [sortable]="true"
          [showActions]="canManage()"
          [canRemove]="canToggleVisibility"
          removeLabel="Ocultar / mostrar"
          removeIcon="visibility_off"
          (edit)="openEdit($event)"
          (remove)="onToggleVisibility($event)"
        />
      </div>
    </div>
  `,
})
export class EmployeesListPage {
  private readonly filtersUi = createFiltersCollapsed('employees');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  private readonly api = inject(EmployeesApiService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly rows = signal<Employee[]>([]);
  readonly users = signal<ShopUserOption[]>([]);
  readonly includeInactive = signal(false);

  readonly columns: DataTableColumn[] = [
    { key: 'fullName', label: 'Nombre' },
    {
      key: 'type',
      label: 'Tipo',
      format: (r) => (r['type'] === 'ROTATING' ? 'Rotativo' : 'Fijo'),
    },
    {
      key: 'producesFood',
      label: 'Produce',
      format: (r) => (r['producesFood'] ? 'Sí' : 'No'),
    },
    {
      key: 'baseSalary',
      label: 'Sueldo base',
      format: (r) => `$ ${Number(r['baseSalary']).toLocaleString('es-AR')}`,
    },
    { key: 'hireDate', label: 'Ingreso' },
    {
      key: 'active',
      label: 'Estado',
      format: (r) => (r['active'] ? 'Visible' : 'Oculto'),
    },
  ];

  /** Arrow para conservar `this` al usarlo desde DataTable. */
  readonly canToggleVisibility = (_row: Employee) => this.canManage();

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.rows.set([]);
        this.users.set([]);
        return;
      }
      this.reload();
      this.api.shopUsers(shopId).subscribe({
        next: (users) => this.users.set(users),
        error: () => this.users.set([]),
      });
    });
  }

  canManage(): boolean {
    return hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'employees.manage',
    );
  }

  onToggleInactive(value: boolean): void {
    this.includeInactive.set(value);
    this.reload();
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.list(shopId, this.includeInactive()).subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.snack.open('No se pudieron cargar los empleados', 'OK', { duration: 3000 }),
    });
  }

  openCreate(): void {
    this.openDialog({ mode: 'create' });
  }

  openEdit(row: Employee): void {
    this.openDialog({ mode: 'edit', employee: row });
  }

  async onToggleVisibility(row: Employee): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;

    if (row.active) {
      const ok = await this.confirmDialog.confirm(
        'Ocultar empleado',
        `¿Ocultar a "${row.fullName}"? No aparecerá en presentismo ni liquidaciones.`,
      );
      if (!ok) return;
      this.api.remove(shopId, row.id).subscribe({
        next: () => {
          this.snack.open('Empleado oculto', 'OK', { duration: 2500 });
          this.reload();
        },
        error: () => this.snack.open('No se pudo ocultar al empleado', 'OK', { duration: 3500 }),
      });
      return;
    }

    this.api.update(shopId, row.id, { active: true }).subscribe({
      next: () => {
        this.snack.open('Empleado visible de nuevo', 'OK', { duration: 2500 });
        this.reload();
      },
      error: () => this.snack.open('No se pudo mostrar al empleado', 'OK', { duration: 3500 }),
    });
  }

  private openDialog(
    mode: { mode: 'create' } | { mode: 'edit'; employee: Employee },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    this.dialogTitle
      .track(
        this.dialog.open(EmployeeDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            ...mode,
            shopId,
            shopName,
            users: this.users(),
          },
        }),
        mode.mode === 'edit' ? 'Editar empleado' : 'Nuevo empleado',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }
}
