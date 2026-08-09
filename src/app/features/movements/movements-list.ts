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
import { ClosingsApiService } from '../closings/closings-api.service';
import {
  Concept,
  LedgerAccount,
  Movement,
  MovementFilters,
  MovementsApiService,
} from './movements-api.service';
import {
  MovementDialogComponent,
  MovementEmployeeOption,
  MovementUserOption,
} from './movement-dialog';
import { QuickExpenseDialogComponent } from './quick-expense-dialog';
import { MovementsExcelImportDialogComponent } from './movements-excel-import-dialog';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { RecordSavedDialogComponent } from '../../shared/components/record-saved-dialog';
import {
  movementSavedDialogData,
  movementSharePayload,
} from '../../shared/components/record-share-builders';
import { shareText } from '../../shared/utils/share-text';

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
    FiltersCollapseBtnComponent,
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

    @if (shopId()) {
      <div class="xl-toolbar mb-3">
        @if (canManage()) {
          <button mat-flat-button color="primary" type="button" (click)="openQuickExpense()">
            <mat-icon>payments</mat-icon>
            Gasto rápido
          </button>
          <button mat-stroked-button type="button" (click)="openExcelImport()">
            <mat-icon>upload_file</mat-icon>
            Importar Excel
          </button>
        }
        <button
          mat-stroked-button
          type="button"
          [disabled]="exporting()"
          (click)="exportExcel()"
        >
          <mat-icon>download</mat-icon>
          Descargar Excel
        </button>
      </div>
    }
    @if (shopId()) {
      <div
        class="panel-card guy-filters mb-3"
        [class.guy-filters--collapsed]="filtersCollapsed()"
      >
        <div class="guy-filters__head">
          <div>
            <h2 class="guy-filters__title">Filtros</h2>
            <p class="guy-filters__subtitle">Buscá por período, concepto y texto</p>
          </div>
          <div class="guy-filters__tools">
            <button mat-stroked-button type="button" class="guy-filters__clear" (click)="clearFilters()">
              <mat-icon>filter_alt_off</mat-icon>
              Limpiar
            </button>
            <app-filters-collapse-btn
              [collapsed]="filtersCollapsed()"
              (toggle)="toggleFilters()"
            />
          </div>
        </div>

        <div class="guy-filters__body">
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
      </div>
    }

    @if (!shopId()) {
      <div class="panel-card">Seleccioná un local en el menú lateral.</div>
    } @else {
      <div class="movements-layout mb-3">
        <div class="panel-card panel-card--flush movements-layout__saldos">
          <app-balances-table
            title="Saldos"
            subtitle="Acumulados · canales y socios"
            [accounts]="balanceRows()"
          />
        </div>

        <div class="panel-card panel-card--flush movements-layout__table">
          <div class="panel-card__body">
            <app-data-table
              [columns]="columns"
              [rows]="rows()"
              [loading]="loading()"
              [sortable]="true"
              [canEdit]="canEditRow"
              [canRemove]="canEditRow"
              [canShare]="canShareRow"
              editDisabledLabel="Generado por un cierre"
              (edit)="openEdit($event)"
              (remove)="onRemove($event)"
              (share)="shareMovement($event)"
            />
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .xl-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

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

  `,
})
export class MovementsListPage {
  private readonly api = inject(MovementsApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  private readonly closingsApi = inject(ClosingsApiService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  private readonly filtersUi = createFiltersCollapsed('movements');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  readonly shopId = this.shops.selectedShopId;
  readonly rows = signal<Movement[]>([]);
  readonly loading = signal(true);
  readonly balanceRows = signal<BalanceAccountRow[]>([]);
  readonly accounts = signal<LedgerAccount[]>([]);
  readonly concepts = signal<Concept[]>([]);
  readonly employees = signal<MovementEmployeeOption[]>([]);
  readonly users = signal<MovementUserOption[]>([]);
  readonly exporting = signal(false);

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
    {
      key: 'fromAccountName',
      label: 'Origen',
      format: (r) =>
        String(r['fromAccountName'] || r['fromUserName'] || '—'),
    },
    {
      key: 'toAccountName',
      label: 'Destino',
      format: (r) => String(r['toAccountName'] || r['toUserName'] || '—'),
    },
    { key: 'conceptName', label: 'Concepto', format: (r) => r['conceptName'] ?? '—' },
    { key: 'description', label: 'Descripción' },
    {
      key: 'amountUyu',
      label: 'Monto',
      format: (r) => `$ ${Number(r['amountUyu']).toLocaleString('es-AR')}`,
    },
    { key: 'invoiced', label: 'Facturado', format: (r) => (r['invoiced'] ? 'Sí' : 'No') },
    {
      key: 'closingId',
      label: 'Origen',
      format: (r) => (r['closingId'] ? 'Cierre' : 'Manual'),
    },
  ];

  readonly canEditRow = (row: Movement) =>
    this.canManage() && (!row.closingId || this.auth.isAdmin());

  readonly canShareRow = (_row: Movement) => true;

  private reloadToken = signal(0);

  constructor() {
    usePageRefresh(() => this.applyFilter());
    effect(() => {
      const shopId = this.shopId();
      this.reloadToken();
      if (!shopId) {
        this.rows.set([]);
        this.balanceRows.set([]);
        this.accounts.set([]);
        this.concepts.set([]);
        this.employees.set([]);
        this.users.set([]);
        this.loading.set(false);
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
      this.closingsApi.shopUsers(shopId).subscribe({
        next: (rows) =>
          this.users.set(
            rows.map((u) => ({
              id: u.id,
              fullName: u.fullName,
              email: u.email,
              ledgerAccounts: u.ledgerAccounts ?? [],
            })),
          ),
        error: () => this.users.set([]),
      });
      this.load();
    });
  }

  canManage(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'movements.manage');
  }

  openQuickExpense(): void {
    const shopId = this.shopId();
    if (!shopId || !this.canManage()) return;
    this.dialogTitle
      .track(
        this.dialog.open(QuickExpenseDialogComponent, {
          width: '440px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            shopId,
            shopName: this.shops.selectedShop()?.name ?? 'Local',
            accounts: this.accounts(),
            concepts: this.concepts(),
          },
        }),
        'Gasto rápido',
      )
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.load();
      });
  }

  exportExcel(): void {
    const shopId = this.shopId();
    const shop = this.shops.selectedShop();
    if (!shopId || this.exporting()) return;
    const from = this.formatDate(this.range.controls.start.value) ?? undefined;
    const to = this.formatDate(this.range.controls.end.value) ?? undefined;
    this.exporting.set(true);
    this.api.exportExcel(shopId, { from, to }).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `movimientos-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${from || 'inicio'}_${to || 'hoy'}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.exporting.set(false);
        this.snack.open('No se pudo descargar el Excel', 'OK', { duration: 3000 });
      },
    });
  }

  private shopFileSlug(name?: string | null): string {
    const raw = (name ?? 'local')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    return raw || 'local';
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
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.list(shopId, this.currentFilters()).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar los movimientos', 'OK', { duration: 3000 });
      },
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
    if (row.closingId && !this.auth.isAdmin()) return;
    this.openDialog({ mode: 'edit', movement: row });
  }

  async onRemove(row: Movement): Promise<void> {
    if (row.closingId && !this.auth.isAdmin()) return;
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
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          autoFocus: 'first-tabbable',
          data: {
            ...mode,
            shopId,
            shopName,
            accounts: this.accounts(),
            concepts: this.concepts(),
            employees: this.employees(),
            users: this.users(),
          },
        }),
        mode.mode === 'edit' ? 'Editar movimiento' : 'Nuevo movimiento',
      )
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        if (typeof result === 'object' && result.id) {
          this.openMovementSaved(result, shopName);
        }
        this.api.accounts(shopId).subscribe({
          next: (rows) => this.accounts.set(rows),
          error: () => undefined,
        });
        this.closingsApi.shopUsers(shopId).subscribe({
          next: (rows) =>
            this.users.set(
              rows.map((u) => ({
                id: u.id,
                fullName: u.fullName,
                email: u.email,
                ledgerAccounts: u.ledgerAccounts ?? [],
              })),
            ),
          error: () => undefined,
        });
        this.applyFilter();
      });
  }

  private openMovementSaved(movement: Movement, shopName: string): void {
    this.dialogTitle.track(
      this.dialog.open(RecordSavedDialogComponent, {
        width: '440px',
        maxWidth: '95vw',
        panelClass: 'guy-dialog',
        data: movementSavedDialogData(movement, shopName),
      }),
      'Movimiento guardado',
    );
  }

  async shareMovement(row: Movement): Promise<void> {
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    const payload = movementSharePayload(row, shopName);
    const result = await shareText(payload);
    if (result === 'copied') {
      this.snack.open('Copiado al portapapeles', 'OK', { duration: 2200 });
    } else if (result === 'failed') {
      this.snack.open('No se pudo compartir', 'OK', { duration: 3000 });
    }
  }
}
