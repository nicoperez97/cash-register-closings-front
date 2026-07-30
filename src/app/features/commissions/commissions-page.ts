import { Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { KpiStripComponent, KpiItem } from '../../shared/components/kpi-strip';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { environment } from '../../../environments/environment';
import {
  CommissionCalculateResult,
  CommissionRule,
  CommissionsApiService,
} from './commissions-api.service';
import { CommissionRuleDialogComponent } from './commission-rule-dialog';

@Component({
  selector: 'app-commissions-page',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatTabsModule,
    MatDialogModule,
    MatSnackBarModule,
    PageHeaderComponent,
    KpiStripComponent,
    DataTableComponent,
  ],
  template: `
    <app-page-header
      title="Comisiones"
      [subtitle]="shops.selectedShop()?.name ?? ''"
      [actionLabel]="canExport() && hasResult() ? 'Descargar Excel' : ''"
      [actionDisabled]="!canExport() || !hasResult()"
      actionIcon="download"
      (action)="export()"
    />

    <mat-tab-group animationDuration="0ms" class="mb-3">
      <mat-tab label="Calcular">
        <div class="panel-card guy-filters mb-3 mt-3">
          <div class="guy-filters__head">
            <div>
              <h2 class="guy-filters__title">Período</h2>
              <p class="guy-filters__subtitle">
                Usa ventas POS por rubro × % de cada empleado (ej. COMIDA 1%, PIZZA 2,5%)
              </p>
            </div>
          </div>
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
            <button
              mat-flat-button
              color="primary"
              type="button"
              [disabled]="!hasRange() || busy()"
              (click)="calculate()"
            >
              <mat-icon>calculate</mat-icon>
              Calcular
            </button>
          </div>
        </div>

        <app-kpi-strip class="mb-3" [items]="kpis()" />

        @if (unmatched().length) {
          <div class="panel-card mb-3">
            <p class="comm-warn">
              Hay reglas sin ventas en el período (revisá rubros en Admin → Platos):
              {{ unmatchedLabel() }}
            </p>
          </div>
        }

        <div class="panel-card panel-card--flush mb-3">
          <div class="panel-card__body">
            <div class="guy-list-head">
              <div>
                <h2 class="guy-list-head__title">Comisiones por empleado / rubro</h2>
                <p class="guy-list-head__meta">
                  {{ result()?.employees?.length ?? 0 }} empleados con reglas
                </p>
              </div>
            </div>
            <app-data-table
              [columns]="calcColumns"
              [rows]="calcRows()"
              [sortable]="true"
              [showActions]="false"
              [canRemove]="never"
            />
          </div>
        </div>

        <div class="panel-card panel-card--flush">
          <div class="panel-card__body">
            <div class="guy-list-head">
              <div>
                <h2 class="guy-list-head__title">Ventas del período por rubro</h2>
              </div>
            </div>
            <app-data-table
              [columns]="salesColumns"
              [rows]="salesRows()"
              [sortable]="true"
              [showActions]="false"
              [canRemove]="never"
            />
          </div>
        </div>
      </mat-tab>

      <mat-tab label="Reglas">
        <div class="mt-3">
          <app-page-header
            title="Reglas de comisión"
            subtitle="% por empleado y rubro"
            [actionLabel]="canManage() ? 'Nueva regla' : ''"
            [actionDisabled]="!canManage()"
            actionIcon="add"
            [actionLarge]="true"
            (action)="openCreateRule()"
          />
          <div class="panel-card panel-card--flush">
            <div class="panel-card__body">
              <app-data-table
                [columns]="ruleColumns"
                [rows]="rules()"
                [sortable]="true"
                [showActions]="canManage()"
                [canRemove]="canManageFn"
                (edit)="openEditRule($event)"
                (remove)="onRemoveRule($event)"
              />
            </div>
          </div>
        </div>
      </mat-tab>
    </mat-tab-group>
  `,
  styles: `
    .comm-warn {
      margin: 0;
      font-size: 0.875rem;
      color: var(--guy-muted);
    }
    .mt-3 {
      margin-top: 1rem;
    }
  `,
})
export class CommissionsPage {
  readonly shops = inject(ShopContextService);
  private readonly api = inject(CommissionsApiService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly http = inject(HttpClient);

  readonly never = () => false;
  readonly canManageFn = () => this.canManage();
  readonly busy = signal(false);
  readonly result = signal<CommissionCalculateResult | null>(null);
  readonly kpis = signal<KpiItem[]>([]);
  readonly calcRows = signal<Record<string, unknown>[]>([]);
  readonly salesRows = signal<Record<string, unknown>[]>([]);
  readonly unmatched = signal<CommissionCalculateResult['unmatchedRules']>([]);
  readonly rules = signal<CommissionRule[]>([]);
  readonly employees = signal<Array<{ id: string; fullName: string }>>([]);
  readonly categories = signal<string[]>([]);

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    end: new FormControl<Date | null>(new Date()),
  });

  readonly calcColumns: DataTableColumn[] = [
    { key: 'employeeName', label: 'Empleado' },
    { key: 'category', label: 'Rubro' },
    {
      key: 'salesAmount',
      label: 'Ventas',
      format: (r) => `$ ${Number(r['salesAmount'] ?? 0).toLocaleString('es-AR')}`,
    },
    {
      key: 'ratePercent',
      label: '%',
      format: (r) =>
        `${Number(r['ratePercent'] ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`,
    },
    {
      key: 'commissionAmount',
      label: 'Comisión',
      format: (r) => `$ ${Number(r['commissionAmount'] ?? 0).toLocaleString('es-AR')}`,
    },
  ];

  readonly salesColumns: DataTableColumn[] = [
    { key: 'category', label: 'Rubro' },
    {
      key: 'qty',
      label: 'Cantidad',
      format: (r) => Number(r['qty'] ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 1 }),
    },
    {
      key: 'amount',
      label: 'Importe',
      format: (r) => `$ ${Number(r['amount'] ?? 0).toLocaleString('es-AR')}`,
    },
  ];

  readonly ruleColumns: DataTableColumn[] = [
    { key: 'employeeName', label: 'Empleado' },
    { key: 'category', label: 'Rubro' },
    {
      key: 'ratePercent',
      label: '%',
      format: (r) =>
        `${Number(r['ratePercent'] ?? 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`,
    },
    { key: 'notes', label: 'Notas' },
  ];

  constructor() {
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) return;
      this.loadRules();
      this.loadEmployees();
      this.loadCategories();
      this.calculate();
    });
  }

  canManage(): boolean {
    return hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'commissions.manage',
    );
  }

  canExport(): boolean {
    return hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'commissions.read',
    );
  }

  hasRange(): boolean {
    return !!this.range.controls.start.value && !!this.range.controls.end.value;
  }

  hasResult(): boolean {
    return !!this.result();
  }

  unmatchedLabel(): string {
    return this.unmatched()
      .map((u) => `${u.employeeName ?? '?'} / ${u.category}`)
      .join(', ');
  }

  private formatDate(d: Date | null): string | null {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  calculate(): void {
    const shopId = this.shops.selectedShopId();
    const from = this.formatDate(this.range.controls.start.value);
    const to = this.formatDate(this.range.controls.end.value);
    if (!shopId || !from || !to) return;
    this.busy.set(true);
    this.api.calculate(shopId, from, to).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.result.set(res);
        this.unmatched.set(res.unmatchedRules ?? []);
        this.salesRows.set((res.salesByCategory ?? []) as Record<string, unknown>[]);
        const rows: Record<string, unknown>[] = [];
        for (const emp of res.employees ?? []) {
          for (const line of emp.lines) {
            rows.push({
              employeeName: emp.employeeName,
              category: line.category,
              salesAmount: line.salesAmount,
              ratePercent: line.ratePercent,
              commissionAmount: line.commissionAmount,
            });
          }
          rows.push({
            employeeName: emp.employeeName,
            category: 'TOTAL',
            salesAmount: null,
            ratePercent: null,
            commissionAmount: emp.total,
          });
        }
        this.calcRows.set(rows);
        this.kpis.set([
          {
            label: 'Ventas POS',
            value: `$ ${Number(res.salesTotal).toLocaleString('es-AR')}`,
          },
          {
            label: 'Total comisiones',
            value: `$ ${Number(res.grandTotal).toLocaleString('es-AR')}`,
          },
          { label: 'Empleados', value: String(res.employees?.length ?? 0) },
          { label: 'Rubros con venta', value: String(res.salesByCategory?.length ?? 0) },
        ]);
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('Error al calcular comisiones', 'OK', { duration: 3000 });
      },
    });
  }

  export(): void {
    const shopId = this.shops.selectedShopId();
    const shop = this.shops.selectedShop();
    const from = this.formatDate(this.range.controls.start.value);
    const to = this.formatDate(this.range.controls.end.value);
    if (!shopId || !from || !to) return;
    this.api.exportExcel(shopId, from, to).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comisiones-${this.shopFileSlug(shop?.name)}-${from}_${to}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open('No se pudo exportar', 'OK', { duration: 3000 }),
    });
  }

  loadRules(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.listRules(shopId).subscribe({
      next: (rows) => this.rules.set(rows),
      error: () => this.rules.set([]),
    });
  }

  private loadEmployees(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.http
      .get<Array<{ id: string; fullName: string }>>(
        `${environment.apiUrl}/shops/${shopId}/employees`,
      )
      .subscribe({
        next: (rows) => this.employees.set(rows),
        error: () => this.employees.set([]),
      });
  }

  private loadCategories(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.http
      .get<Array<{ category?: string | null }>>(
        `${environment.apiUrl}/shops/${shopId}/pos-products`,
      )
      .subscribe({
        next: (rows) => {
          const set = new Set<string>();
          for (const r of rows) {
            const c = r.category?.trim();
            if (c) set.add(c);
          }
          this.categories.set([...set].sort((a, b) => a.localeCompare(b, 'es')));
        },
        error: () => this.categories.set([]),
      });
  }

  openCreateRule(): void {
    this.openRuleDialog({ mode: 'create' });
  }

  openEditRule(row: Record<string, unknown>): void {
    this.openRuleDialog({ mode: 'edit', rule: row as unknown as CommissionRule });
  }

  private openRuleDialog(
    mode: { mode: 'create' } | { mode: 'edit'; rule: CommissionRule },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.dialogTitle
      .track(
        this.dialog.open(CommissionRuleDialogComponent, {
          width: '480px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            ...mode,
            shopId,
            shopName: this.shops.selectedShop()?.name ?? '',
            employees: this.employees(),
            categories: this.categories(),
          },
        }),
        mode.mode === 'edit' ? 'Editar regla' : 'Nueva regla',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) {
          this.loadRules();
          this.calculate();
        }
      });
  }

  async onRemoveRule(row: Record<string, unknown>): Promise<void> {
    const shopId = this.shops.selectedShopId();
    const rule = row as unknown as CommissionRule;
    if (!shopId || !rule.id) return;
    const ok = await this.confirm.confirm(
      'Eliminar regla',
      `¿Quitar comisión de ${rule.employeeName} / ${rule.category}?`,
    );
    if (!ok) return;
    this.api.removeRule(shopId, rule.id).subscribe({
      next: () => {
        this.snack.open('Regla eliminada', 'OK', { duration: 2500 });
        this.loadRules();
        this.calculate();
      },
      error: () => this.snack.open('No se pudo eliminar', 'OK', { duration: 3000 }),
    });
  }

  private shopFileSlug(name?: string | null): string {
    const raw = (name || 'local')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return raw || 'local';
  }
}
