import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
import {
  NotifyConfirmDialogComponent,
  NotifyConfirmDialogResult,
} from '../../shared/components/notify-confirm-dialog';
import { firstValueFrom } from 'rxjs';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { canEditShopExpenses, hasShopPermission } from '../../core/auth/auth.models';
import { EmployeesApiService } from '../employees/employees-api.service';
import { ClosingsApiService } from '../closings/closings-api.service';
import { isUserVisible } from '../../shared/user-visibility';
import {
  Concept,
  LedgerAccount,
  Movement,
  MovementFilters,
  MovementsApiService,
  expensePaymentMethodLabel,
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
import { ExportMenuComponent, ExportFormat } from '../../shared/components/export-menu';
import { downloadColumnsPdf } from '../../shared/utils/table-pdf';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { RecordSavedDialogComponent } from '../../shared/components/record-saved-dialog';
import { PaymentFilePreviewDialogComponent } from '../payments/payment-file-preview-dialog';
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
    ExportMenuComponent,
  ],
  template: `
    <app-page-header
      [title]="pageTitle()"
      [subtitle]="shops.selectedShop()?.name ?? 'Sin local'"
      [actionLabel]="canManage() ? actionLabel() : ''"
      [actionDisabled]="!canManage()"
      [actionIcon]="kind() === 'transfer' ? 'swap_horiz' : 'payments'"
      [actionLarge]="true"
      (action)="onPrimaryAction()"
    />

    @if (shopId()) {
      <div class="xl-toolbar mb-3">
        @if (canManage()) {
          <button
            mat-stroked-button
            type="button"
            [disabled]="!shopId() || templateBusy()"
            (click)="downloadTemplate()"
          >
            <mat-icon>download</mat-icon>
            Descargar plantilla
          </button>
          <button mat-stroked-button type="button" (click)="openExcelImport()">
            <mat-icon>upload_file</mat-icon>
            Importar Excel
          </button>
        }
        <app-export-menu
          [disabled]="exporting()"
          [busy]="exporting()"
          (pick)="onExport($event)"
        />
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
            <p class="guy-filters__subtitle">
              {{
                kind() === 'transfer'
                  ? 'Buscá por período y texto'
                  : 'Buscá por período, origen, tipo, concepto y texto'
              }}
            </p>
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

            @if (kind() === 'expense') {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Origen</mat-label>
                <mat-select formControlName="source">
                  <mat-option value="">Todos</mat-option>
                  <mat-option value="closing">Cierre</mat-option>
                  <mat-option value="payment">Pago</mat-option>
                  <mat-option value="manual">Manual</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Tipo de pago</mat-label>
                <mat-select formControlName="partyType">
                  <mat-option value="">Todos</mat-option>
                  <mat-option value="supplier">A proveedores</mat-option>
                  <mat-option value="service">A servicios</mat-option>
                  <mat-option value="employee">A empleados</mat-option>
                </mat-select>
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

              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Facturado</mat-label>
                <mat-select formControlName="invoiced">
                  <mat-option value="">Todos</mat-option>
                  <mat-option value="true">Sí</mat-option>
                  <mat-option value="false">No</mat-option>
                </mat-select>
              </mat-form-field>
            }

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
            [shopId]="shopId()"
            [fileSlug]="shops.selectedShop()?.name ?? shops.selectedShop()?.slug ?? 'local'"
          />
        </div>

        <div class="panel-card panel-card--flush movements-layout__table">
          <div class="panel-card__body">
            <app-data-table
              [columns]="columns()"
              [rows]="rows()"
              [loading]="loading()"
              [sortable]="true"
              [canEdit]="canEditRow"
              [canRemove]="canRemoveRow"
              [canShare]="canShareRow"
              [canPreview]="canPreviewRow"
              previewLabel="Ver comprobante"
              previewIcon="attach_file"
              [editLabelFor]="editLabelFor"
              [editIconFor]="editIconFor"
              editDisabledLabel="Generado por un cierre"
              (edit)="openEdit($event)"
              (remove)="onRemove($event)"
              (share)="shareMovement($event)"
              (preview)="viewReceipt($event)"
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
  /** `expense` = Gastos · `transfer` = Movimientos entre cuentas */
  readonly kind = input<'expense' | 'transfer'>('expense');

  private readonly api = inject(MovementsApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  private readonly closingsApi = inject(ClosingsApiService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly filtersUi = createFiltersCollapsed('movements');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  /** Foco desde “Ver en gastos” de un pago. */
  readonly focusPaymentId = signal<string | null>(null);

  readonly shopId = this.shops.selectedShopId;
  readonly rows = signal<Movement[]>([]);
  readonly loading = signal(true);
  readonly balanceRows = signal<BalanceAccountRow[]>([]);
  readonly accounts = signal<LedgerAccount[]>([]);
  readonly concepts = signal<Concept[]>([]);
  readonly employees = signal<MovementEmployeeOption[]>([]);
  readonly users = signal<MovementUserOption[]>([]);
  readonly exporting = signal(false);
  readonly templateBusy = signal(false);

  readonly pageTitle = computed(() =>
    this.kind() === 'transfer' ? 'Movimientos entre cuentas' : 'Gastos',
  );
  readonly actionLabel = computed(() =>
    this.kind() === 'transfer' ? 'Nueva transferencia' : 'Gasto rápido',
  );

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    end: new FormControl<Date | null>(new Date()),
  });

  readonly filters = new FormGroup({
    conceptId: new FormControl('', { nonNullable: true }),
    source: new FormControl('', { nonNullable: true }),
    partyType: new FormControl('', { nonNullable: true }),
    invoiced: new FormControl('', { nonNullable: true }),
    q: new FormControl('', { nonNullable: true }),
  });

  readonly columns = computed((): DataTableColumn[] => {
    const base: DataTableColumn[] = [
      { key: 'businessDate', label: 'Fecha' },
      {
        key: 'fromAccountName',
        label: 'Cuenta',
        format: (r) => String(r['fromAccountName'] || r['fromUserName'] || '—'),
      },
      {
        key: 'toAccountName',
        label: 'Destino',
        format: (r) => String(r['toAccountName'] || r['toUserName'] || '—'),
      },
    ];
    if (this.kind() === 'expense') {
      base.push(
        {
          key: 'conceptName',
          label: 'Concepto',
          format: (r) => r['conceptName'] ?? '—',
        },
        {
          key: 'paymentMethod',
          label: 'Forma de pago',
          format: (r) => expensePaymentMethodLabel(r['paymentMethod'] as string | null),
        },
      );
    }
    base.push(
      { key: 'description', label: 'Descripción' },
      {
        key: 'amountUyu',
        label: 'Monto',
        format: (r) => `$ ${Number(r['amountUyu']).toLocaleString('es-AR')}`,
      },
      { key: 'invoiced', label: 'Facturado', format: (r) => (r['invoiced'] ? 'Sí' : 'No') },
      ...(this.kind() === 'expense'
        ? [
            {
              key: 'hasReceiptFile',
              label: 'Comprobante',
              format: (r) => (r['hasReceiptFile'] ? 'Sí' : '—'),
            } satisfies DataTableColumn,
          ]
        : []),
      {
        key: 'source',
        label: 'Origen',
        format: (r) => {
          const source = r['source'] as string | null | undefined;
          if (source === 'payment') {
            const party = r['paymentPartyType'] as string | null | undefined;
            if (party === 'supplier') return 'Pago · Proveedor';
            if (party === 'service') return 'Pago · Servicio';
            if (party === 'employee') return 'Pago · Empleado';
            return 'Pago';
          }
          if (source === 'closing' || r['closingId']) return 'Cierre';
          return 'Manual';
        },
      },
    );
    return base;
  });

  readonly canEditRow = (row: Movement) => {
    if (this.kind() === 'expense' && row.source === 'payment' && row.paymentId) {
      return true;
    }
    if (this.kind() === 'expense') {
      return this.canEditExpense() && (!row.closingId || this.auth.isAdmin());
    }
    return this.canManage() && (!row.closingId || this.auth.isAdmin());
  };

  readonly canRemoveRow = (row: Movement) => {
    if (this.kind() === 'expense') {
      return (
        this.canEditExpense() &&
        row.source !== 'payment' &&
        (!row.closingId || this.auth.isAdmin())
      );
    }
    return this.canManage() && row.source !== 'payment' && (!row.closingId || this.auth.isAdmin());
  };

  readonly editLabelFor = (row: Movement) =>
    row.source === 'payment' ? 'Ver en pagos' : 'Editar';

  readonly editIconFor = (row: Movement) =>
    row.source === 'payment' ? 'receipt_long' : 'edit';

  readonly canShareRow = (_row: Movement) => true;

  readonly canPreviewRow = (row: Movement) =>
    this.kind() === 'expense' && !!row.hasReceiptFile;

  private reloadToken = signal(0);

  constructor() {
    usePageRefresh(() => this.applyFilter());
    this.applyExpenseDeepLink();
    effect(() => {
      const shopId = this.shopId();
      this.kind();
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
      if (this.kind() === 'expense') {
        this.api.concepts(shopId, { kind: 'EXPENSE' }).subscribe({
          next: (rows) => this.concepts.set(rows),
          error: () => this.concepts.set([]),
        });
      } else {
        this.concepts.set([]);
      }
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
              visibility: u.visibility,
              hideFromCashWithdraw: u.hideFromCashWithdraw,
            })),
          ),
        error: () => this.users.set([]),
      });
      this.load();
    });
  }

  /** Query de un pago abonado: /expenses?paymentId=&from=&to=&source=payment&partyType=&conceptId= */
  private applyExpenseDeepLink(): void {
    if (this.kind() !== 'expense') return;
    const qp = this.route.snapshot.queryParamMap;
    const paymentId = (qp.get('paymentId') || '').trim();
    if (!paymentId) return;

    const from = (qp.get('from') || '').trim();
    const to = (qp.get('to') || '').trim();
    const source = (qp.get('source') || 'payment').trim();
    const partyType = (qp.get('partyType') || '').trim();
    const conceptId = (qp.get('conceptId') || '').trim();

    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      this.range.controls.start.setValue(this.parseIsoDate(from), { emitEvent: false });
    }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      this.range.controls.end.setValue(this.parseIsoDate(to), { emitEvent: false });
    }
    this.filters.patchValue(
      {
        source: source === 'payment' || source === 'closing' || source === 'manual' ? source : 'payment',
        partyType:
          partyType === 'supplier' || partyType === 'service' || partyType === 'employee'
            ? partyType
            : '',
        conceptId: conceptId || '',
        invoiced: '',
        q: '',
      },
      { emitEvent: false },
    );
    this.focusPaymentId.set(paymentId);
    this.filtersCollapsed.set(false);

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        paymentId: null,
        from: null,
        to: null,
        source: null,
        partyType: null,
        conceptId: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private parseIsoDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  canEditExpense(): boolean {
    return canEditShopExpenses(this.auth.currentUser(), this.shopId());
  }

  canManage(): boolean {
    const perm = this.kind() === 'transfer' ? 'accountTransfers.manage' : 'expenses.manage';
    return hasShopPermission(this.auth.currentUser(), this.shopId(), perm);
  }

  onPrimaryAction(): void {
    if (this.kind() === 'transfer') {
      this.openCreate();
      return;
    }
    this.openQuickExpense();
  }

  openQuickExpense(): void {
    const shopId = this.shopId();
    if (!shopId || !this.canManage() || this.kind() !== 'expense') return;
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

  async onExport(format: ExportFormat): Promise<void> {
    if (format === 'pdf') {
      const shop = this.shops.selectedShop();
      const from = this.formatDate(this.range.controls.start.value);
      const to = this.formatDate(this.range.controls.end.value);
      await downloadColumnsPdf({
        title: this.pageTitle(),
        subtitle: `${shop?.name ?? ''} · ${from ?? ''} a ${to ?? ''}`,
        filename: `${this.kind() === 'transfer' ? 'transferencias' : 'gastos'}-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${from || 'inicio'}_${to || 'hoy'}.pdf`,
        columns: this.columns(),
        rows: this.rows(),
      });
      return;
    }
    this.exportExcel();
  }

  exportExcel(): void {
    const shopId = this.shopId();
    const shop = this.shops.selectedShop();
    if (!shopId || this.exporting()) return;
    const from = this.formatDate(this.range.controls.start.value) ?? undefined;
    const to = this.formatDate(this.range.controls.end.value) ?? undefined;
    this.exporting.set(true);
    this.api.exportExcel(shopId, { from, to, kind: this.kind() }).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.kind() === 'transfer' ? 'transferencias' : 'gastos'}-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${from || 'inicio'}_${to || 'hoy'}.xlsx`;
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
    this.filters.reset({
      conceptId: '',
      source: '',
      partyType: '',
      invoiced: '',
      q: '',
    });
    this.focusPaymentId.set(null);
    this.applyFilter();
  }

  private currentFilters(): MovementFilters {
    const f = this.filters.getRawValue();
    const expense = this.kind() === 'expense';
    return {
      from: this.formatDate(this.range.controls.start.value),
      to: this.formatDate(this.range.controls.end.value),
      conceptId: expense ? f.conceptId || null : null,
      source: expense
        ? ((f.source || null) as MovementFilters['source'])
        : null,
      partyType: expense
        ? ((f.partyType || null) as MovementFilters['partyType'])
        : null,
      invoiced: expense
        ? ((f.invoiced || null) as MovementFilters['invoiced'])
        : null,
      q: f.q || null,
      kind: this.kind(),
      paymentId: expense ? this.focusPaymentId() : null,
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
        const focusPay = this.focusPaymentId();
        if (focusPay && this.kind() === 'expense') {
          if (!rows.length) {
            this.snack.open(
              'No encontramos el gasto de ese pago. Si lo marcás como no pagado y lo volvés a abonar, se recrea.',
              'OK',
              { duration: 4500 },
            );
          } else {
            this.snack.open('Mostrando el gasto de ese pago', 'OK', { duration: 2200 });
          }
        }
      },
      error: () => {
        this.loading.set(false);
        this.snack.open(
          this.kind() === 'transfer'
            ? 'No se pudieron cargar las transferencias'
            : 'No se pudieron cargar los gastos',
          'OK',
          { duration: 3000 },
        );
      },
    });
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
    if (!shopId || !this.canManage()) return;
    const kind = this.kind();
    this.dialogTitle
      .track(
        this.dialog.open(MovementsExcelImportDialogComponent, {
          width: '860px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            shopId,
            shopName: this.shops.selectedShop()?.name ?? 'Local',
            kind,
          },
        }),
        kind === 'transfer' ? 'Importar transferencias' : 'Importar gastos',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.applyFilter();
      });
  }

  downloadTemplate(): void {
    const shopId = this.shopId();
    if (!shopId || !this.canManage() || this.templateBusy()) return;
    const kind = this.kind();
    this.templateBusy.set(true);
    this.api.downloadImportTemplate(shopId, kind).subscribe({
      next: (blob) => {
        this.templateBusy.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download =
          kind === 'transfer' ? 'plantilla-transferencias.xlsx' : 'plantilla-gastos.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.templateBusy.set(false);
        this.snack.open('No se pudo descargar la plantilla', 'OK', { duration: 3500 });
      },
    });
  }

  openEdit(row: Movement): void {
    if (this.kind() === 'expense' && row.source === 'payment' && row.paymentId) {
      this.viewInPayments(row);
      return;
    }
    if (row.closingId && !this.auth.isAdmin()) return;
    this.openDialog({ mode: 'edit', movement: row });
  }

  private viewInPayments(row: Movement): void {
    const paymentId = row.paymentId;
    if (!paymentId) return;
    const shopId = row.shopId || this.shopId();
    const party = row.paymentPartyType;
    const path =
      party === 'service'
        ? '/payments/services'
        : party === 'employee'
          ? '/payments/employees'
          : '/payments/suppliers';
    void this.router.navigate([path], {
      queryParams: {
        payment: paymentId,
        shop: shopId || null,
      },
    });
  }

  async onRemove(row: Movement): Promise<void> {
    if (row.closingId && !this.auth.isAdmin()) return;
    if (row.source === 'payment') {
      this.snack.open(
        'Este gasto viene de un pago abonado. Revertí el pago en Pagos (de Abonado a Validado) para sacarlo.',
        'OK',
        { duration: 4500 },
      );
      return;
    }
    const noun = this.kind() === 'transfer' ? 'transferencia' : 'gasto';
    const shopId = this.shopId();
    if (!shopId) return;
    let notifyUserIds: string[] = [];
    if (this.kind() === 'expense') {
      const result = await firstValueFrom(
        this.dialogTitle
          .track(
            this.dialog.open(NotifyConfirmDialogComponent, {
              width: '480px',
              maxWidth: '96vw',
              panelClass: 'guy-dialog',
              data: {
                title: `Eliminar ${noun}`,
                message: `¿Eliminar el ${noun} del ${row.businessDate}?`,
                shopId,
                excludeUserId: this.auth.currentUser()?.id ?? null,
              },
            }),
            `Eliminar ${noun}`,
          )
          .afterClosed(),
      );
      if (!result || result === false) return;
      notifyUserIds = (result as NotifyConfirmDialogResult).notifyUserIds ?? [];
    } else {
      const ok = await this.confirmDialog.confirm(
        `Eliminar ${noun}`,
        `¿Eliminar el ${noun} del ${row.businessDate}?`,
      );
      if (!ok) return;
    }
    this.api.remove(shopId, row.id, notifyUserIds.length ? { notifyUserIds } : undefined).subscribe({
      next: () => {
        this.snack.open(
          this.kind() === 'transfer' ? 'Transferencia eliminada' : 'Gasto eliminado',
          'OK',
          { duration: 2500 },
        );
        this.applyFilter();
      },
      error: (err) => {
        const msg = err?.error?.message ?? `No se pudo eliminar el ${noun}`;
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
      },
    });
  }

  /** Al editar, incluye el concepto actual aunque no esté validado. */
  private dialogConcepts(movement?: Movement): Concept[] {
    const list = [...this.concepts()];
    if (!movement?.conceptId || list.some((c) => c.id === movement.conceptId)) return list;
    list.unshift({
      id: movement.conceptId,
      shopId: movement.shopId,
      name: movement.conceptName || 'Concepto',
      kind: (movement.conceptKind as Concept['kind']) || 'EXPENSE',
      description: null,
      validated: false,
      active: true,
    });
    return list;
  }

  private openDialog(mode: { mode: 'create' } | { mode: 'edit'; movement: Movement }): void {
    const shopId = this.shopId();
    if (!shopId) return;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    const kind = this.kind();
    const keepIds = new Set(
      mode.mode === 'edit'
        ? [mode.movement.fromUserId, mode.movement.toUserId].filter(Boolean)
        : [],
    );
    const title =
      mode.mode === 'edit'
        ? kind === 'transfer'
          ? 'Editar transferencia'
          : 'Editar gasto'
        : kind === 'transfer'
          ? 'Nueva transferencia'
          : 'Nuevo gasto';
    this.dialogTitle
      .track(
        this.dialog.open(MovementDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          autoFocus: 'first-tabbable',
          data: {
            ...mode,
            kind,
            shopId,
            shopName,
            accounts: this.accounts(),
            concepts: this.dialogConcepts(mode.mode === 'edit' ? mode.movement : undefined),
            employees: this.employees(),
            users: this.users().filter(
              (u) => isUserVisible(u, 'movements') || keepIds.has(u.id),
            ),
          },
        }),
        title,
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
                visibility: u.visibility,
                hideFromCashWithdraw: u.hideFromCashWithdraw,
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
      this.kind() === 'transfer' ? 'Transferencia guardada' : 'Gasto guardado',
    );
  }

  viewReceipt(row: Movement): void {
    const shopId = this.shopId();
    if (!shopId || !row.hasReceiptFile) return;
    this.api.downloadReceiptFile(shopId, row.id).subscribe({
      next: (blob) => {
        this.dialogTitle.track(
          this.dialog.open(PaymentFilePreviewDialogComponent, {
            width: '920px',
            maxWidth: '96vw',
            maxHeight: '92vh',
            panelClass: 'guy-dialog',
            data: {
              title: 'Comprobante',
              fileName: row.receiptFileName || 'comprobante',
              blob,
            },
          }),
          'Comprobante',
        );
      },
      error: () => {
        this.snack.open('No se pudo abrir el comprobante', 'OK', { duration: 3500 });
      },
    });
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
