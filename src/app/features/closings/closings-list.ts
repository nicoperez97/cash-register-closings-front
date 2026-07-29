import { Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { ClosingsApiService, CashClosing, ShopUserOption } from './closings-api.service';
import { closingStatusLabel } from '../../core/i18n/labels';
import { WhatsappImportDialogComponent } from './whatsapp-import-dialog';
import { ExcelImportDialogComponent } from './excel-import-dialog';
import { PosSalesImportDialogComponent } from './pos-sales-import-dialog';
import {
  CLOSING_DIFFERENCE_FILTERS,
  CLOSING_PAYMENT_FILTERS,
  CLOSING_SOURCE_FILTERS,
  CLOSING_STATUS_FILTERS,
  ClosingQueryFilters,
} from './closing-filters';

@Component({
  selector: 'app-closings-list',
  imports: [
    PageHeaderComponent,
    DataTableComponent,
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
      title="Cierres de caja"
      [subtitle]="shopLabel()"
      [actionLabel]="canCreate() ? 'Nuevo cierre' : ''"
      [actionDisabled]="!canCreate()"
      actionIcon="add"
      [actionLarge]="true"
      (action)="goCreate()"
    />

    @if (shopId()) {
      <div class="panel-card guy-filters mb-3">
        <div class="guy-filters__head">
          <div>
            <h2 class="guy-filters__title">Filtros</h2>
            <p class="guy-filters__subtitle">Buscá por período, estado, montos y más</p>
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
            <mat-label>Estado</mat-label>
            <mat-select formControlName="status">
              @for (opt of statusOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Quién se lo lleva</mat-label>
            <mat-select formControlName="withdrawnByUserId">
              <mat-option value="">Todos</mat-option>
              @for (u of users(); track u.id) {
                <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Creado por</mat-label>
            <mat-select formControlName="createdByUserId">
              <mat-option value="">Todos</mat-option>
              @for (u of users(); track u.id) {
                <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Medio de pago</mat-label>
            <mat-select formControlName="paymentMethod">
              @for (opt of paymentOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Diferencia</mat-label>
            <mat-select formControlName="hasDifference">
              @for (opt of differenceOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Origen</mat-label>
            <mat-select formControlName="source">
              @for (opt of sourceOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Total desde</mat-label>
            <input matInput type="number" min="0" formControlName="minTotal" />
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Total hasta</mat-label>
            <input matInput type="number" min="0" formControlName="maxTotal" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="guy-filters__span-2" subscriptSizing="dynamic">
            <mat-label>Buscar en notas / retiro</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput formControlName="q" placeholder="Texto libre" />
          </mat-form-field>
        </form>

        <div class="guy-filters__actions">
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="!hasRange()"
            (click)="applyFilter()"
          >
            <mat-icon>filter_alt</mat-icon>
            Filtrar
          </button>
          @if (canCreate()) {
            <button mat-stroked-button type="button" (click)="downloadTemplate()">
              <mat-icon>download</mat-icon>
              Plantilla Excel
            </button>
            <button mat-stroked-button type="button" (click)="openExcelImport()">
              <mat-icon>upload_file</mat-icon>
              Importar Excel
            </button>
            <button mat-stroked-button type="button" (click)="openPosSalesImport()">
              <mat-icon>point_of_sale</mat-icon>
              Importar reporte POS
            </button>
            <button mat-stroked-button type="button" (click)="openWhatsappImport()">
              <mat-icon>folder_zip</mat-icon>
              Importar WhatsApp
            </button>
          }
        </div>
      </div>
    }

    @if (!shopId()) {
      <div class="panel-card">Seleccioná un local en el menú lateral.</div>
    } @else {
      <div class="panel-card panel-card--flush">
        <div class="panel-card__body">
          <app-data-table
            [columns]="columns"
            [rows]="rows()"
            [sortable]="true"
            [canRemove]="never"
            (edit)="goEdit($event)"
          />
        </div>
      </div>
    }
  `,
})
export class ClosingsListPage {
  private readonly api = inject(ClosingsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);

  readonly statusOptions = CLOSING_STATUS_FILTERS;
  readonly paymentOptions = CLOSING_PAYMENT_FILTERS;
  readonly differenceOptions = CLOSING_DIFFERENCE_FILTERS;
  readonly sourceOptions = CLOSING_SOURCE_FILTERS;

  readonly rows = signal<CashClosing[]>([]);
  readonly users = signal<ShopUserOption[]>([]);
  readonly shopId = this.shops.selectedShopId;
  readonly shopLabel = () => this.shops.selectedShop()?.name ?? 'Sin local';

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    end: new FormControl<Date | null>(new Date()),
  });

  readonly filters = new FormGroup({
    status: new FormControl('', { nonNullable: true }),
    withdrawnByUserId: new FormControl('', { nonNullable: true }),
    createdByUserId: new FormControl('', { nonNullable: true }),
    paymentMethod: new FormControl('', { nonNullable: true }),
    hasDifference: new FormControl('', { nonNullable: true }),
    source: new FormControl('', { nonNullable: true }),
    minTotal: new FormControl<number | null>(null),
    maxTotal: new FormControl<number | null>(null),
    q: new FormControl('', { nonNullable: true }),
  });

  readonly columns: DataTableColumn[] = [
    { key: 'businessDate', label: 'Fecha' },
    {
      key: 'declaredTotal',
      label: 'Total',
      format: (r) => `$ ${Number(r['declaredTotal']).toLocaleString('es-UY')}`,
    },
    {
      key: 'cardAmount',
      label: 'PVS',
      format: (r) => `$ ${Number(r['cardAmount']).toLocaleString('es-UY')}`,
    },
    {
      key: 'cashAmount',
      label: 'Efectivo',
      format: (r) => `$ ${Number(r['cashAmount']).toLocaleString('es-UY')}`,
    },
    { key: 'status', label: 'Estado', format: (r) => closingStatusLabel(String(r['status'] ?? '')) },
    { key: 'cashWithdrawnByName', label: 'Retiro' },
  ];

  readonly never = () => false;
  private reloadToken = signal(0);

  constructor() {
    effect(() => {
      const id = this.shopId();
      this.reloadToken();
      if (!id) {
        this.rows.set([]);
        this.users.set([]);
        return;
      }
      this.api.shopUsers(id).subscribe({
        next: (rows) => this.users.set(rows),
        error: () => this.users.set([]),
      });
      this.load();
    });
  }

  hasRange(): boolean {
    return !!this.range.controls.start.value && !!this.range.controls.end.value;
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
      status: '',
      withdrawnByUserId: '',
      createdByUserId: '',
      paymentMethod: '',
      hasDifference: '',
      source: '',
      minTotal: null,
      maxTotal: null,
      q: '',
    });
    this.applyFilter();
  }

  private currentFilters(): ClosingQueryFilters {
    const f = this.filters.getRawValue();
    return {
      from: this.formatDate(this.range.controls.start.value),
      to: this.formatDate(this.range.controls.end.value),
      status: f.status || null,
      withdrawnByUserId: f.withdrawnByUserId || null,
      createdByUserId: f.createdByUserId || null,
      paymentMethod: f.paymentMethod || null,
      hasDifference: f.hasDifference || null,
      source: f.source || null,
      minTotal: f.minTotal,
      maxTotal: f.maxTotal,
      q: f.q || null,
    };
  }

  private load(): void {
    const id = this.shopId();
    const filters = this.currentFilters();
    if (!id || !filters.from || !filters.to) return;
    this.api.list(id, filters).subscribe({
      next: (rows) => this.rows.set(rows),
      error: () => this.snack.open('No se pudieron cargar los cierres', 'OK', { duration: 3000 }),
    });
  }

  private formatDate(d: Date | null): string | null {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  canCreate(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'closings.create');
  }

  goCreate(): void {
    void this.router.navigate(['/closings/new']);
  }

  goEdit(row: CashClosing): void {
    void this.router.navigate(['/closings', row.id]);
  }

  openWhatsappImport(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.dialogTitle
      .track(
        this.dialog.open(WhatsappImportDialogComponent, {
          width: '720px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            shopId,
            shopName: this.shops.selectedShop()?.name ?? 'Local',
          },
        }),
        'Importar WhatsApp',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reloadToken.update((n) => n + 1);
      });
  }

  openExcelImport(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.dialogTitle
      .track(
        this.dialog.open(ExcelImportDialogComponent, {
          width: '720px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            shopId,
            shopName: this.shops.selectedShop()?.name ?? 'Local',
          },
        }),
        'Importar Excel',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reloadToken.update((n) => n + 1);
      });
  }

  openPosSalesImport(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    const shop = this.shops.selectedShop();
    if (!shop?.salesSystemId) {
      this.snack.open(
        'Configurá el sistema de ventas (Restosoft) en Administrar local',
        'OK',
        { duration: 4500 },
      );
      return;
    }
    this.api.listSalesSystems().subscribe({
      next: (systems) => {
        const sys = systems.find((s) => s.id === shop.salesSystemId);
        this.dialogTitle
          .track(
            this.dialog.open(PosSalesImportDialogComponent, {
              width: '780px',
              maxWidth: '96vw',
              panelClass: 'guy-dialog',
              data: {
                shopId,
                shopName: shop.name ?? 'Local',
                salesSystemName: sys?.name ?? null,
              },
            }),
            'Importar reporte POS',
          )
          .afterClosed()
          .subscribe((ok) => {
            if (ok) this.reloadToken.update((n) => n + 1);
          });
      },
      error: () => {
        this.dialogTitle
          .track(
            this.dialog.open(PosSalesImportDialogComponent, {
              width: '780px',
              maxWidth: '96vw',
              panelClass: 'guy-dialog',
              data: {
                shopId,
                shopName: shop.name ?? 'Local',
                salesSystemName: null,
              },
            }),
            'Importar reporte POS',
          )
          .afterClosed()
          .subscribe((ok) => {
            if (ok) this.reloadToken.update((n) => n + 1);
          });
      },
    });
  }

  downloadTemplate(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.downloadImportTemplate(shopId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plantilla-cierres.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open('No se pudo descargar la plantilla', 'OK', { duration: 3500 }),
    });
  }
}
