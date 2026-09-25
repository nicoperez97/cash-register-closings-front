import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { FilterChipsComponent, SegmentTabsComponent } from '../../shared/components/filter-bar';
import {
  SelectSearchComponent,
  filterBySelectQuery,
  normalizeSelectQuery,
  onSelectSearchOpened,
} from '../../shared/components/select-search';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { environment } from '../../../environments/environment';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { accountTypeLabel, activeLabel, conceptKindLabel } from '../../core/i18n/labels';
import { AdminAccountDialogComponent, AdminAccountRow } from './admin-account-dialog';
import { AdminAccountDeleteService } from './admin-account-delete-dialog';
import { usePageRefresh } from '../../core/page-refresh.service';
import { formatMoney } from '../../shared/utils/money';

type AccountTypeTab = 'all' | 'CHANNEL' | 'PARTNER' | 'SYSTEM' | 'DIVIDENDS';
type AccountStatusFilter = 'all' | 'active' | 'inactive';
type AccountWithdrawFilter = 'all' | 'visible' | 'hidden';

type ConceptOption = { id: string; name: string; kind: string };

const TYPE_TABS: Array<{ id: AccountTypeTab; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'CHANNEL', label: 'Canales' },
  { id: 'PARTNER', label: 'Socios' },
  { id: 'SYSTEM', label: 'Sistema' },
  { id: 'DIVIDENDS', label: 'Dividendos' },
];

function isEgresoAccount(a: {
  type?: string | null;
  code?: string | null;
  name?: string | null;
}): boolean {
  const code = String(a.code ?? '')
    .trim()
    .toUpperCase();
  const name = String(a.name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (code === 'EGRESO' || code.endsWith('_EGRESO') || code.endsWith('-EGRESO')) {
    return true;
  }
  // Nombre típico del seed: "2. Egreso"
  if (a.type === 'SYSTEM' && /(^|[^a-z])egreso([^a-z]|$)/.test(name)) {
    return true;
  }
  return false;
}

function isAllowedDividendDest(a: AdminAccountRow): boolean {
  if (a.active === false) return false;
  if (a.type === 'SUPPLIER' || a.type === 'SERVICE') return false;
  if (a.type === 'SYSTEM') return isEgresoAccount(a);
  return true;
}

@Component({
  selector: 'app-admin-accounts',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSnackBarModule,
    PageHeaderComponent,
    DataTableComponent,
    SegmentTabsComponent,
    FilterChipsComponent,
    SelectSearchComponent,
    BusyLabelComponent,
  ],
  template: `
    <app-page-header
      title="Cuentas contables"
      [subtitle]="shops.selectedShop()?.name ?? 'Administración'"
      actionLabel="Nueva cuenta"
      actionIcon="add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    <section class="panel-card split-cfg">
      <header class="split-cfg__head">
        <div>
          <h2 class="split-cfg__title">División de socios</h2>
          <p class="split-cfg__lead">
            Cuenta y concepto de Equilibrar, Enviar división y transferencias marcadas como
            dividendo. Por defecto: Egreso + concepto División. El armado clásico (socio ↔ socio)
            solo toma el concepto.
          </p>
        </div>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="splitBusy() || splitForm.pristine"
          (click)="saveSplitConfig()"
        >
          <app-busy-label [busy]="splitBusy()" busyLabel="Guardando…">Guardar</app-busy-label>
        </button>
      </header>
      <form [formGroup]="splitForm" class="split-cfg__fields">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Cuenta destino</mat-label>
          <mat-select
            formControlName="partnerDividendAccountId"
            panelClass="guy-select-search-panel"
            (openedChange)="onSelectSearchOpened($event, accountQuery)"
          >
            <mat-option disabled class="select-search-opt">
              <app-select-search [(query)]="accountQuery" placeholder="Buscar cuenta…" />
            </mat-option>
            <mat-option value="">Automático (Egreso)</mat-option>
            @if (egresoAccount(); as eg) {
              <mat-option [value]="eg.id">{{ eg.name }} · Sistema</mat-option>
            }
            @for (a of filteredSplitAccounts(); track a.id) {
              <mat-option [value]="a.id">
                {{ a.name }} · {{ accountTypeLabel(a.type) }}
              </mat-option>
            }
            @if (accountQuery() && !filteredSplitAccounts().length && !egresoAccount()) {
              <mat-option disabled>Sin resultados</mat-option>
            }
          </mat-select>
          <mat-hint>Ahí entra la plata al equilibrar o marcar Es dividendo.</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Concepto</mat-label>
          <mat-select
            formControlName="partnerDividendConceptId"
            panelClass="guy-select-search-panel"
            (openedChange)="onSelectSearchOpened($event, conceptQuery)"
          >
            <mat-option disabled class="select-search-opt">
              <app-select-search [(query)]="conceptQuery" placeholder="Buscar concepto…" />
            </mat-option>
            <mat-option [value]="null">Automático (División)</mat-option>
            @for (c of filteredConcepts(); track c.id) {
              <mat-option [value]="c.id">{{ c.name }} · {{ kindLabel(c.kind) }}</mat-option>
            }
            @if (conceptQuery() && !filteredConcepts().length) {
              <mat-option disabled>Sin resultados</mat-option>
            }
          </mat-select>
          <mat-hint>Se usa en Transacciones y en el reporte de conceptos.</mat-hint>
        </mat-form-field>
      </form>
    </section>

    <app-segment-tabs
      ariaLabel="Tipo de cuenta"
      [fill]="true"
      [options]="typeTabs"
      [(value)]="typeTab"
    />

    <div class="acc-filters">
      <app-filter-chips label="Estado" [options]="statusOptions" [(value)]="statusFilter" />
      <app-filter-chips label="Retiro" [options]="withdrawOptions" [(value)]="withdrawFilter" />
    </div>

    <div class="panel-card panel-card--flush">
      <div class="panel-card__body">
        <app-data-table
          [columns]="columns()"
          [rows]="visibleRows()"
          [loading]="loading()"
          [sortable]="true"
          [canRemove]="canRemove"
          (edit)="openEdit($event)"
          (remove)="onRemove($event)"
        />
      </div>
    </div>
  `,
  styles: `
    .split-cfg {
      margin: 0 0 1rem;
      padding: 1rem 1.1rem 1.15rem;
    }
    .split-cfg__head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem 1rem;
      margin-bottom: 0.85rem;
    }
    .split-cfg__title {
      margin: 0 0 0.25rem;
      font-size: 1.05rem;
      font-weight: 650;
    }
    .split-cfg__lead {
      margin: 0;
      max-width: 42rem;
      font-size: 0.9rem;
      line-height: 1.4;
      color: var(--guy-muted, #5a6b7d);
    }
    .split-cfg__fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 0.75rem 1rem;
    }
    app-segment-tabs {
      margin: 0 0 0.75rem;
    }
    .acc-filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
      margin: 0 0 0.85rem;
    }
  `,
})
export class AdminAccountsPage {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly accountDelete = inject(AdminAccountDeleteService);
  private readonly fb = inject(FormBuilder);
  readonly shops = inject(ShopContextService);

  readonly rows = signal<AdminAccountRow[]>([]);
  readonly concepts = signal<ConceptOption[]>([]);
  readonly loading = signal(true);
  readonly splitBusy = signal(false);
  readonly typeTab = signal<AccountTypeTab>('all');
  readonly statusFilter = signal<AccountStatusFilter>('active');
  readonly withdrawFilter = signal<AccountWithdrawFilter>('all');
  readonly typeTabs = TYPE_TABS;
  readonly statusOptions = [
    { id: 'all' as const, label: 'Todas' },
    { id: 'active' as const, label: 'Activas' },
    { id: 'inactive' as const, label: 'Inactivas' },
  ];
  readonly withdrawOptions = [
    { id: 'all' as const, label: 'Todos' },
    { id: 'visible' as const, label: 'Visible' },
    { id: 'hidden' as const, label: 'Oculta' },
  ];

  readonly accountQuery = signal('');
  readonly conceptQuery = signal('');
  readonly onSelectSearchOpened = onSelectSearchOpened;
  readonly kindLabel = conceptKindLabel;
  readonly accountTypeLabel = accountTypeLabel;

  readonly splitForm = this.fb.nonNullable.group({
    partnerDividendAccountId: this.fb.nonNullable.control(''),
    partnerDividendConceptId: this.fb.control<string | null>(null),
  });

  /** Egreso siempre visible arriba del listado (aunque el filtro de búsqueda lo oculte). */
  readonly egresoAccount = computed(() => {
    const q = this.accountQuery().trim();
    const eg =
      this.rows().find((a) => a.active !== false && isEgresoAccount(a)) ?? null;
    if (!eg) return null;
    if (!q) return eg;
    const label = `${eg.name} ${eg.code ?? ''} Sistema`;
    const keep = this.splitForm.controls.partnerDividendAccountId.value === eg.id;
    if (keep) return eg;
    return normalizeSelectQuery(label).includes(normalizeSelectQuery(q)) ? eg : null;
  });

  readonly filteredSplitAccounts = computed(() => {
    const egresoId = this.egresoAccount()?.id;
    const base = this.rows().filter(
      (a) => isAllowedDividendDest(a) && a.id !== egresoId,
    );
    // Destinos útiles primero: Egreso ya está fijado arriba; acá Dividendos legacy al final.
    const sorted = [...base].sort((a, b) => {
      const rank = (x: AdminAccountRow) => {
        if (isEgresoAccount(x)) return 0;
        if (x.type === 'DIVIDENDS' || String(x.code ?? '').toUpperCase() === 'DIVIDENDOS') {
          return 2;
        }
        return 1;
      };
      const d = rank(a) - rank(b);
      if (d) return d;
      return String(a.name).localeCompare(String(b.name), 'es');
    });
    return filterBySelectQuery(
      sorted,
      this.accountQuery(),
      (a) => `${a.name} ${a.code ?? ''} ${accountTypeLabel(a.type)}`,
      this.splitForm.controls.partnerDividendAccountId.value || null,
    );
  });

  readonly filteredConcepts = computed(() =>
    filterBySelectQuery(
      this.concepts(),
      this.conceptQuery(),
      (c) => `${c.name} ${this.kindLabel(c.kind)}`,
      this.splitForm.controls.partnerDividendConceptId.value,
    ),
  );

  readonly visibleRows = computed(() => {
    const tab = this.typeTab();
    const status = this.statusFilter();
    const withdraw = this.withdrawFilter();
    return this.rows().filter((row) => {
      if (row.type === 'SUPPLIER' || row.type === 'SERVICE') return false;
      if (tab !== 'all' && row.type !== tab) return false;
      if (status === 'active' && !row.active) return false;
      if (status === 'inactive' && row.active) return false;
      if (withdraw === 'visible' && row.hideFromCashWithdraw) return false;
      if (withdraw === 'hidden' && !row.hideFromCashWithdraw) return false;
      return true;
    });
  });

  readonly columns = computed((): DataTableColumn[] => {
    const showType = this.typeTab() === 'all';
    const cols: DataTableColumn[] = [
      { key: 'name', label: 'Nombre' },
      { key: 'code', label: 'Código' },
    ];
    if (showType) {
      cols.push({
        key: 'type',
        label: 'Tipo',
        format: (r) => accountTypeLabel(String(r['type'] ?? '')),
      });
    }
    cols.push(
      {
        key: 'userFullName',
        label: 'Usuarios',
        format: (r) => String(r['userFullName'] ?? '—'),
      },
      {
        key: 'openingBalance',
        label: 'Saldo inicial',
        format: (r) => formatMoney(r['openingBalance'] ?? 0, { currency: false }),
      },
      {
        key: 'commissionPercent',
        label: 'Comisión',
        format: (r) => {
          const n = Number(r['commissionPercent'] ?? 0);
          if (n <= 0) return '—';
          return `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })} %`;
        },
      },
      {
        key: 'hideFromCashWithdraw',
        label: 'Retiro',
        format: (r) => (r['hideFromCashWithdraw'] ? 'Oculta' : 'Visible'),
      },
      { key: 'active', label: 'Estado', format: (r) => activeLabel(!!r['active']) },
    );
    return cols;
  });

  readonly canRemove = (row: AdminAccountRow) => row.type !== 'SYSTEM';

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.rows.set([]);
        this.concepts.set([]);
        this.loading.set(false);
        return;
      }
      this.reload();
    });
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.http
      .get<AdminAccountRow[]>(`${environment.apiUrl}/shops/${shopId}/accounts`, {
        params: { includeInactive: '1' },
      })
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.loading.set(false);
          this.syncSplitFormFromShop();
        },
        error: () => {
          this.loading.set(false);
          this.snack.open('No se pudieron cargar las cuentas', 'OK', { duration: 3000 });
        },
      });
    this.http.get<Array<ConceptOption & { active?: boolean }>>(
      `${environment.apiUrl}/shops/${shopId}/concepts`,
    ).subscribe({
      next: (rows) =>
        this.concepts.set(
          (rows ?? [])
            .filter((c) => c.active !== false)
            .map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
        ),
      error: () => this.concepts.set([]),
    });
  }

  syncSplitFormFromShop(): void {
    const shop = this.shops.selectedShop();
    this.splitForm.reset(
      {
        partnerDividendAccountId: shop?.partnerDividendAccountId ?? '',
        partnerDividendConceptId: shop?.partnerDividendConceptId ?? null,
      },
      { emitEvent: false },
    );
  }

  saveSplitConfig(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const raw = this.splitForm.getRawValue();
    this.splitBusy.set(true);
    this.http
      .put<{
        partnerDividendAccountId?: string | null;
        partnerDividendConceptId?: string | null;
      }>(`${environment.apiUrl}/shops/${shopId}/accounts/partner-dividend-config`, {
        partnerDividendAccountId: raw.partnerDividendAccountId?.trim() || null,
        partnerDividendConceptId: raw.partnerDividendConceptId || null,
      })
      .subscribe({
        next: (cfg) => {
          this.splitBusy.set(false);
          const current = this.shops.selectedShop();
          if (current) {
            this.shops.upsertShop({
              ...current,
              partnerDividendAccountId: cfg.partnerDividendAccountId ?? null,
              partnerDividendConceptId: cfg.partnerDividendConceptId ?? null,
            });
          }
          this.splitForm.patchValue(
            {
              partnerDividendAccountId: cfg.partnerDividendAccountId ?? '',
              partnerDividendConceptId: cfg.partnerDividendConceptId ?? null,
            },
            { emitEvent: false },
          );
          this.splitForm.markAsPristine();
          this.snack.open('Configuración de división guardada', 'OK', { duration: 2500 });
        },
        error: (err) => {
          this.splitBusy.set(false);
          const msg =
            err?.error?.message ||
            (Array.isArray(err?.error?.message) ? err.error.message.join(' · ') : null) ||
            'No se pudo guardar';
          this.snack.open(String(msg), 'OK', { duration: 4000 });
        },
      });
  }

  openCreate(): void {
    const tab = this.typeTab();
    if (tab === 'DIVIDENDS') {
      this.snack.open(
        'Dividendos ya no se usa: configurá Egreso + concepto División arriba',
        'OK',
        { duration: 4000 },
      );
      return;
    }
    this.openDialog({
      mode: 'create',
      ...(tab === 'all' ? {} : { defaultType: tab }),
    });
  }

  openEdit(row: AdminAccountRow): void {
    this.openDialog({ mode: 'edit', account: row });
  }

  async onRemove(row: AdminAccountRow): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const deleted = await this.accountDelete.remove(shopId, row);
    if (deleted) this.reload();
  }

  private openDialog(
    mode:
      | { mode: 'create'; defaultType?: AdminAccountRow['type'] }
      | { mode: 'edit'; account: AdminAccountRow },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.dialogTitle
      .track(
        this.dialog.open(AdminAccountDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { ...mode, shopId },
        }),
        mode.mode === 'edit' ? 'Editar cuenta' : 'Nueva cuenta',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }
}
