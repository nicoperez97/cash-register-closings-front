import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { forkJoin } from 'rxjs';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { EmployeesApiService } from '../employees/employees-api.service';
import { LedgerAccount } from '../movements/movements-api.service';
import { environment } from '../../../environments/environment';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import {
  Vacation,
  VacationPersonType,
  VacationsApiService,
} from './vacations-api.service';
import { VacationDialogComponent } from './vacation-dialog';

@Component({
  selector: 'app-vacations-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    PageHeaderComponent,
    DataTableComponent,
    FiltersCollapseBtnComponent,
  ],
  template: `
    <app-page-header
      title="Vacaciones"
      [subtitle]="shops.selectedShop()?.name ?? ''"
      [actionLabel]="canManage() ? 'Cargar vacaciones' : ''"
      [actionDisabled]="!canManage()"
      actionIcon="add"
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
          <p class="guy-filters__subtitle">Opcional: filtrá por período que se solape</p>
        </div>
        <div class="guy-filters__tools">
          <app-filters-collapse-btn
            [collapsed]="filtersCollapsed()"
            (toggle)="toggleFilters()"
          />
        </div>
      </div>
      <div class="guy-filters__body">
        <form class="guy-filters__grid guy-filters__grid--dense" [formGroup]="range">
          <mat-form-field appearance="outline" class="guy-filters__span-2" subscriptSizing="dynamic">
            <mat-label>Período</mat-label>
            <mat-date-range-input [rangePicker]="picker">
              <input matStartDate formControlName="start" placeholder="Desde" />
              <input matEndDate formControlName="end" placeholder="Hasta" />
            </mat-date-range-input>
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-date-range-picker #picker />
          </mat-form-field>
        </form>
        <div class="guy-filters__actions">
          <button mat-stroked-button type="button" (click)="clearRange()">Limpiar</button>
          <button mat-flat-button color="primary" type="button" (click)="reload()">
            <mat-icon>search</mat-icon>
            Buscar
          </button>
        </div>
      </div>
    </div>

    <mat-tab-group
      animationDuration="0ms"
      class="mb-3"
      [selectedIndex]="tabIndex()"
      (selectedIndexChange)="onTabChange($event)"
    >
      <mat-tab label="Empleados">
        <div class="panel-card panel-card--flush mt-3">
          <div class="panel-card__body">
            <app-data-table
              [columns]="columns"
              [rows]="employeeRows()"
              [loading]="loading()"
              [sortable]="true"
              [showActions]="canManage()"
              [canRemove]="canDelete"
              removeLabel="Eliminar"
              removeIcon="delete"
              (edit)="openEdit($event)"
              (remove)="onRemove($event)"
            />
          </div>
        </div>
      </mat-tab>
      <mat-tab label="Socios">
        <div class="panel-card panel-card--flush mt-3">
          <div class="panel-card__body">
            <app-data-table
              [columns]="columns"
              [rows]="partnerRows()"
              [loading]="loading()"
              [sortable]="true"
              [showActions]="canManage()"
              [canRemove]="canDelete"
              removeLabel="Eliminar"
              removeIcon="delete"
              (edit)="openEdit($event)"
              (remove)="onRemove($event)"
            />
          </div>
        </div>
      </mat-tab>
    </mat-tab-group>
  `,
})
export class VacationsPage {
  private readonly filtersUi = createFiltersCollapsed('vacations');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  private readonly api = inject(VacationsApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  private readonly http = inject(HttpClient);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly tabIndex = signal(0);
  readonly loading = signal(true);
  readonly allRows = signal<Vacation[]>([]);
  readonly employees = signal<Array<{ id: string; name: string }>>([]);
  readonly partners = signal<Array<{ id: string; name: string }>>([]);

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });

  readonly personType = computed<VacationPersonType>(() =>
    this.tabIndex() === 0 ? 'EMPLOYEE' : 'PARTNER',
  );

  readonly employeeRows = computed(() =>
    this.allRows().filter((r) => r.personType === 'EMPLOYEE'),
  );
  readonly partnerRows = computed(() =>
    this.allRows().filter((r) => r.personType === 'PARTNER'),
  );

  readonly columns: DataTableColumn[] = [
    { key: 'personName', label: 'Nombre', format: (r) => r['personName'] || '—' },
    {
      key: 'fromDate',
      label: 'Desde',
      format: (r) => this.formatDisplayDate(String(r['fromDate'] ?? '')),
    },
    {
      key: 'toDate',
      label: 'Hasta',
      format: (r) => this.formatDisplayDate(String(r['toDate'] ?? '')),
    },
    { key: 'businessDays', label: 'Días' },
    {
      key: 'unpaid',
      label: 'Sin goce',
      format: (r) => (r['unpaid'] ? 'Sí' : 'No'),
    },
    {
      key: 'notes',
      label: 'Notas',
      format: (r) => (r['notes'] ? String(r['notes']) : '—'),
    },
  ];

  readonly canDelete = (_row: Vacation) => this.canManage();

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.allRows.set([]);
        this.employees.set([]);
        this.partners.set([]);
        this.loading.set(false);
        return;
      }
      this.loadPersons(shopId);
      this.reload();
    });
  }

  canManage(): boolean {
    return hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'vacations.manage',
    );
  }

  onTabChange(index: number): void {
    this.tabIndex.set(index);
  }

  clearRange(): void {
    this.range.reset({ start: null, end: null });
    this.reload();
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    const from = this.formatIso(this.range.controls.start.value);
    const to = this.formatIso(this.range.controls.end.value);
    this.loading.set(true);
    this.api.list(shopId, { from: from ?? undefined, to: to ?? undefined }).subscribe({
      next: (rows) => {
        this.allRows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar las vacaciones', 'OK', { duration: 3000 });
      },
    });
  }

  openCreate(): void {
    this.openDialog({ mode: 'create' });
  }

  openEdit(row: Vacation): void {
    this.openDialog({ mode: 'edit', vacation: row });
  }

  async onRemove(row: Vacation): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const ok = await this.confirmDialog.confirm(
      'Eliminar vacaciones',
      `¿Eliminar el período de ${row.personName ?? 'esta persona'} (${this.formatDisplayDate(row.fromDate)} – ${this.formatDisplayDate(row.toDate)})?`,
    );
    if (!ok) return;
    this.api.remove(shopId, row.id).subscribe({
      next: () => {
        this.snack.open('Vacaciones eliminadas', 'OK', { duration: 2500 });
        this.reload();
      },
      error: () => this.snack.open('No se pudo eliminar', 'OK', { duration: 3500 }),
    });
  }

  private loadPersons(shopId: string): void {
    forkJoin({
      employees: this.employeesApi.list(shopId),
      accounts: this.http.get<LedgerAccount[]>(`${environment.apiUrl}/shops/${shopId}/accounts`),
    }).subscribe({
      next: ({ employees, accounts }) => {
        this.employees.set(
          employees
            .filter((e) => e.active)
            .map((e) => ({ id: e.id, name: e.fullName })),
        );
        this.partners.set(
          accounts
            .filter((a) => a.active && a.type === 'PARTNER')
            .map((a) => ({ id: a.id, name: a.name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'es')),
        );
      },
      error: () => {
        this.employees.set([]);
        this.partners.set([]);
      },
    });
  }

  private openDialog(
    mode: { mode: 'create' } | { mode: 'edit'; vacation: Vacation },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;

    const personType: VacationPersonType =
      mode.mode === 'edit' ? mode.vacation.personType : this.personType();

    if (mode.mode === 'edit') {
      this.tabIndex.set(personType === 'EMPLOYEE' ? 0 : 1);
    }

    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    this.dialogTitle
      .track(
        this.dialog.open(VacationDialogComponent, {
          width: '480px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { ...mode, shopId, shopName, personType },
        }),
        mode.mode === 'edit' ? 'Editar vacaciones' : 'Cargar vacaciones',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }

  private formatIso(d: Date | null): string | null {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private formatDisplayDate(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso || '—';
    return `${m[3]}/${m[2]}/${m[1]}`;
  }
}
