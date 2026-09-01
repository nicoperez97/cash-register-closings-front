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
import { Employee, EmployeesApiService } from './employees-api.service';
import { EmployeeDialogComponent } from './employee-dialog';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { shopShiftsOf } from '../../core/shop/shop-shifts';
import type { EmployeeShiftAssignment } from './employees-api.service';

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
          [loading]="loading()"
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
  readonly loading = signal(true);
  readonly includeInactive = signal(false);

  readonly columns: DataTableColumn[] = [
    { key: 'fullName', label: 'Nombre' },
    {
      key: 'shiftAssignments',
      label: 'Turnos',
      format: (r) => this.formatShiftAssignments(r),
    },
    {
      key: 'countsForAttendanceBonus',
      label: 'Presentismo',
      format: (r) => (r['countsForAttendanceBonus'] === false ? 'No' : 'Sí'),
    },
    {
      key: 'producesFood',
      label: 'Produce',
      format: (r) => (r['producesFood'] ? 'Sí' : 'No'),
    },
    {
      key: 'supervisorEmployeeId',
      label: 'Supervisor',
      format: (r) => {
        const id = r['supervisorEmployeeId'] as string | null | undefined;
        if (!id) return '—';
        const found = this.rows().find((e) => e.id === id);
        return found?.fullName ?? '—';
      },
    },
    {
      key: 'id',
      label: 'A cargo',
      format: (r) => {
        const id = String(r['id'] ?? '');
        const n = this.rows().filter((e) => e.supervisorEmployeeId === id).length;
        return n > 0 ? String(n) : '—';
      },
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
        this.loading.set(false);
        return;
      }
      this.reload();
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
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.list(shopId, this.includeInactive()).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar los empleados', 'OK', { duration: 3000 });
      },
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

  private formatShiftAssignments(row: Record<string, unknown>): string {
    const shifts = shopShiftsOf(this.shops.selectedShop());
    const assignments = (row['shiftAssignments'] as EmployeeShiftAssignment[] | undefined) ?? [];
    if (!assignments.length) {
      const legacy = row['type'] === 'ROTATING' ? 'Rotativo' : 'Fijo';
      return shifts.length ? `${legacy} (todos)` : legacy;
    }
    return assignments
      .map((a) => {
        const shift = shifts.find((s) => s.id === a.shiftId);
        const name = shift?.name ?? 'Turno';
        const role = a.type === 'ROTATING' ? 'rotativo' : 'fijo';
        return `${name} ${role}`;
      })
      .join(', ');
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
            shopShifts: shopShiftsOf(this.shops.selectedShop()),
            serviceAttendanceWithHours:
              this.shops.selectedShop()?.serviceAttendanceWithHours !== false,
            serviceDefaultCheckIn:
              this.shops.selectedShop()?.serviceDefaultCheckIn || '18:00',
            serviceDefaultCheckOut:
              this.shops.selectedShop()?.serviceDefaultCheckOut || '00:00',
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
