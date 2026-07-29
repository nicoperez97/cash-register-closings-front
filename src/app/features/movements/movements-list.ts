import { Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import {
  BalanceAccountRow,
  BalancesTableComponent,
} from '../../shared/components/balances-table';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { EmployeesApiService } from '../employees/employees-api.service';
import {
  Concept,
  LedgerAccount,
  Movement,
  MovementFilters,
  MovementsApiService,
} from './movements-api.service';
import { MovementDialogComponent, MovementEmployeeOption } from './movement-dialog';
import { MovementsExcelImportDialogComponent } from './movements-excel-import-dialog';

@Component({
  selector: 'app-movements-list',
  imports: [
    PageHeaderComponent,
    DataTableComponent,
    BalancesTableComponent,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  template: `
    <app-page-header
      title="Movimientos"
      [subtitle]="shops.selectedShop()?.name ?? 'Sin local'"
      [actionLabel]="canManage() ? 'Nuevo movimiento' : ''"
      [actionDisabled]="!canManage()"
      actionIcon="add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    @if (shopId() && canManage()) {
      <div class="xl-toolbar mb-3">
        <button mat-stroked-button type="button" (click)="openExcelImport()">
          <mat-icon>upload_file</mat-icon>
          Importar Excel
        </button>
      </div>
    }
    @if (shopId()) {
      <div class="panel-card guy-filters mb-3">
        <div class="guy-filters__head">
          <div>
            <h2 class="guy-filters__title">Filtros</h2>
            <p class="guy-filters__subtitle">Buscá por período, concepto y texto</p>
          </div>
          <button mat-stroked-button type="button" class="guy-filters__clear" (click)="clearFilters()">
            <mat-icon>filter_alt_off</mat-icon>
            Limpiar
          </button>
        </div>

        <form class="guy-filters__grid guy-filters__grid--dense" [formGroup]="filters">
          <mat-form-field appearance="outline" class="guy-filters__span-2" subscriptSizing="dynamic">
            <mat-label>Período</mat-label>
            <mat-date-range-input [formGroup]="range" [rangePicker]="picker">
              <input matStartDate formControlName="start" placeholder="Desde" />
              <input matEndDate formControlName="end" placeholder="Hasta" />
            </mat-date-range-input>
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-date-range-picker #picker />
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Concepto</mat-label>
            <mat-select formControlName="conceptId">
              <mat-option value="">Todos</mat-option>
              @for (c of concepts(); track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="guy-filters__span-2" subscriptSizing="dynamic">
            <mat-label>Buscar en descripción</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput formControlName="q" placeholder="Texto libre" />
          </mat-form-field>
        </form>

        <div class="guy-filters__actions">
          <button mat-flat-button color="primary" type="button" (click)="applyFilter()">
            <mat-icon>filter_alt</mat-icon>
            Filtrar
          </button>
        </div>
      </div>
    }

    @if (!shopId()) {
      <div class="panel-card">Seleccioná un local en el menú lateral.</div>
    } @else {
      <div class="movements-layout mb-3">
        <div class="panel-card panel-card--flush movements-layout__saldos">
          <app-balances-table [accounts]="balanceRows()" />
          <p class="movements-layout__hint">Saldos acumulados (todas las cuentas activas)</p>
        </div>

        <div class="panel-card panel-card--flush movements-layout__table">
          <div class="panel-card__body">
            <app-data-table
              [columns]="columns"
              [rows]="rows()"
              [sortable]="true"
              [canEdit]="canEditRow"
              [canRemove]="canEditRow"
              editDisabledLabel="Generado por un cierre"
              (edit)="openEdit($event)"
              (remove)="onRemove($event)"
            />
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .movements-layout {
      display: grid;
      gap: 1rem;
      align-items: start;
    }

    @media (min-width: 960px) {
      .movements-layout {
        grid-template-columns: minmax(16rem, 22rem) minmax(0, 1fr);
      }
    }

    .movements-layout__hint {
      margin: 0;
      padding: 0.55rem 1rem 0.75rem;
      font-size: 0.75rem;
      color: var(--guy-muted);
    }
  `,
})
export class MovementsListPage {
  private readonly api = inject(MovementsApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly shopId = this.shops.selectedShopId;
  readonly rows = signal<Movement[]>([]);
  readonly balanceRows = signal<BalanceAccountRow[]>([]);
  readonly accounts = signal<LedgerAccount[]>([]);
  readonly concepts = signal<Concept[]>([]);
  readonly employees = signal<MovementEmployeeOption[]>([]);

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    end: new FormControl<Date | null>(new Date()),
  });

  readonly filters = new FormGroup({
    conceptId: new FormControl('', { nonNullable: true }),
    q: new FormControl('', { nonNullable: true }),
  });

  readonly columns: DataTableColumn[] = [
    { key: 'businessDate', label: 'Fecha' },
    { key: 'fromAccountName', label: 'Origen' },
    { key: 'toAccountName', label: 'Destino' },
    { key: 'conceptName', label: 'Concepto', format: (r) => r['conceptName'] ?? '—' },
    { key: 'description', label: 'Descripción' },
    {
      key: 'amountUyu',
      label: 'Monto',
      format: (r) => `$ ${Number(r['amountUyu']).toLocaleString('es-UY')}`,
    },
    { key: 'invoiced', label: 'Facturado', format: (r) => (r['invoiced'] ? 'Sí' : 'No') },
    {
      key: 'closingId',
      label: 'Origen',
      format: (r) => (r['closingId'] ? 'Cierre' : 'Manual'),
    },
  ];

  readonly canEditRow = (row: Movement) => !row.closingId && this.canManage();

  private reloadToken = signal(0);

  constructor() {
    effect(() => {
      const shopId = this.shopId();
      this.reloadToken();
      if (!shopId) {
        this.rows.set([]);
        this.balanceRows.set([]);
        this.accounts.set([]);
        this.concepts.set([]);
        this.employees.set([]);
        return;
      }
      this.api.accounts(shopId).subscribe({
        next: (rows) => this.accounts.set(rows),
        error: () => this.accounts.set([]),
      });
      this.api.concepts(shopId).subscribe({
        next: (rows) => this.concepts.set(rows),
        error: () => this.concepts.set([]),
      });
      this.employeesApi.list(shopId).subscribe({
        next: (rows) => this.employees.set(rows.map((e) => ({ id: e.id, fullName: e.fullName }))),
        error: () => this.employees.set([]),
      });
      this.load();
    });
  }

  canManage(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'movements.manage');
  }

  applyFilter(): void {
    this.reloadToken.update((n) => n + 1);
  }

  clearFilters(): void {
    this.range.setValue({
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      end: new Date(),
    });
    this.filters.reset({ conceptId: '', q: '' });
    this.applyFilter();
  }

  private currentFilters(): MovementFilters {
    const f = this.filters.getRawValue();
    return {
      from: this.formatDate(this.range.controls.start.value),
      to: this.formatDate(this.range.controls.end.value),
      conceptId: f.conceptId || null,
      q: f.q || null,
    };
  }

  private load(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.list(shopId, this.currentFilters()).subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.snack.open('No se pudieron cargar los movimientos', 'OK', { duration: 3000 }),
    });
    // Saldos al estilo del contador: acumulados (sin filtrar por período de la grilla).
    this.api.balances(shopId).subscribe({
      next: (res) =>
        this.balanceRows.set(
          (res.accounts ?? []).map((a) => ({ name: a.name, balance: Number(a.balance ?? 0) })),
        ),
      error: () => this.balanceRows.set([]),
    });
  }

  private formatDate(d: Date | null): string | null {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  openCreate(): void {
    this.openDialog({ mode: 'create' });
  }

  openExcelImport(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.dialogTitle
      .track(
        this.dialog.open(MovementsExcelImportDialogComponent, {
          width: '860px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            shopId,
            shopName: this.shops.selectedShop()?.name ?? 'Local',
          },
        }),
        'Importar movimientos',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.applyFilter();
      });
  }

  openEdit(row: Movement): void {
    if (row.closingId) return;
    this.openDialog({ mode: 'edit', movement: row });
  }

  async onRemove(row: Movement): Promise<void> {
    if (row.closingId) return;
    const ok = await this.confirmDialog.confirm(
      'Eliminar movimiento',
      `¿Eliminar el movimiento del ${row.businessDate}?`,
    );
    if (!ok) return;
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.remove(shopId, row.id).subscribe({
      next: () => {
        this.snack.open('Movimiento eliminado', 'OK', { duration: 2500 });
        this.applyFilter();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo eliminar el movimiento';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
      },
    });
  }

  private openDialog(mode: { mode: 'create' } | { mode: 'edit'; movement: Movement }): void {
    const shopId = this.shopId();
    if (!shopId) return;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    this.dialogTitle
      .track(
        this.dialog.open(MovementDialogComponent, {
          width: '640px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            ...mode,
            shopId,
            shopName,
            accounts: this.accounts(),
            concepts: this.concepts(),
            employees: this.employees(),
          },
        }),
        mode.mode === 'edit' ? 'Editar movimiento' : 'Nuevo movimiento',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.applyFilter();
      });
  }
}
