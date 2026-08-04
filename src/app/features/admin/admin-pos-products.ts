import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { environment } from '../../../environments/environment';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { canManageShop } from '../../core/auth/auth.models';
import { activeLabel } from '../../core/i18n/labels';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import {
  AdminPosCategoryRow,
  AdminPosProductDialogComponent,
  AdminPosProductRow,
  AdminPosSubcategoryRow,
} from './admin-pos-product-dialog';
import {
  AdminPosCategoryDialogComponent,
  AdminPosSubcategoryDialogComponent,
} from './admin-pos-catalog-dialogs';

@Component({
  selector: 'app-admin-pos-products',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTabsModule,
    MatSnackBarModule,
    PageHeaderComponent,
    DataTableComponent,
    FiltersCollapseBtnComponent,
  ],
  template: `
    <app-page-header
      title="Platos, rubros y subrubros"
      subtitle="Catálogo POS · comisiones usan el rubro (COMIDA, PIZZA…)"
      [actionLabel]="canManage() ? 'Cargar desde reporte' : ''"
      actionIcon="upload_file"
      [actionLarge]="true"
      (action)="seedFromReport()"
    />

    <mat-tab-group animationDuration="0ms">
      <mat-tab label="Platos">
        <div
          class="panel-card guy-filters mb-3 mt-3"
          [class.guy-filters--collapsed]="filtersCollapsed()"
        >
          <div class="guy-filters__head">
            <div>
              <h2 class="guy-filters__title">Filtros</h2>
            </div>
            <div class="guy-filters__tools">
              <app-filters-collapse-btn
                [collapsed]="filtersCollapsed()"
                (toggle)="toggleFilters()"
              />
            </div>
          </div>
          <div class="guy-filters__body">
          <form
            class="guy-filters__grid guy-filters__grid--dense"
            (submit)="$event.preventDefault(); loadProducts()"
          >
            <mat-form-field appearance="outline" class="guy-filters__span-2" subscriptSizing="dynamic">
              <mat-label>Buscar</mat-label>
              <mat-icon matPrefix>search</mat-icon>
              <input matInput [formControl]="q" placeholder="Código, nombre, rubro o subrubro" />
            </mat-form-field>
            <div class="guy-filters__actions">
              <button mat-flat-button color="primary" type="button" (click)="loadProducts()">
                <mat-icon>search</mat-icon>
                Filtrar
              </button>
            </div>
          </form>
          </div>
        </div>

        <div class="panel-card panel-card--flush">
          <div class="panel-card__body">
            <app-data-table
              [columns]="productColumns"
              [rows]="products()"
              [sortable]="true"
              [canRemove]="never"
              (edit)="openEditProduct($event)"
            />
          </div>
        </div>
      </mat-tab>

      <mat-tab label="Rubros">
        <div class="mt-3">
          <app-page-header
            title="Rubros"
            subtitle="Nivel de comisión (COMIDA, PIZZA, EVENTO…)"
            [actionLabel]="canManage() ? 'Nuevo rubro' : ''"
            actionIcon="add"
            [actionLarge]="true"
            (action)="openCreateCategory()"
          />
          <div class="panel-card panel-card--flush">
            <div class="panel-card__body">
              <app-data-table
                [columns]="categoryColumns"
                [rows]="categories()"
                [sortable]="true"
                [showActions]="canManage()"
                [canRemove]="canManageFn"
                (edit)="openEditCategory($event)"
                (remove)="onRemoveCategory($event)"
              />
            </div>
          </div>
        </div>
      </mat-tab>

      <mat-tab label="Subrubros">
        <div class="mt-3">
          <app-page-header
            title="Subrubros"
            subtitle="Desglose interno (Pastas, Postres, Cervezas…)"
            [actionLabel]="canManage() ? 'Nuevo subrubro' : ''"
            actionIcon="add"
            [actionLarge]="true"
            (action)="openCreateSubcategory()"
          />
          <div class="panel-card panel-card--flush">
            <div class="panel-card__body">
              <app-data-table
                [columns]="subcategoryColumns"
                [rows]="subcategories()"
                [sortable]="true"
                [showActions]="canManage()"
                [canRemove]="canManageFn"
                (edit)="openEditSubcategory($event)"
                (remove)="onRemoveSubcategory($event)"
              />
            </div>
          </div>
        </div>
      </mat-tab>
    </mat-tab-group>
  `,
  styles: `
    .mt-3 {
      margin-top: 1rem;
    }
  `,
})
export class AdminPosProductsPage implements OnInit {
  private readonly filtersUi = createFiltersCollapsed('pos-products');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly shops = inject(ShopContextService);

  readonly never = () => false;
  readonly canManageFn = () => this.canManage();
  readonly q = new FormControl('', { nonNullable: true });
  readonly products = signal<AdminPosProductRow[]>([]);
  readonly categories = signal<AdminPosCategoryRow[]>([]);
  readonly subcategories = signal<AdminPosSubcategoryRow[]>([]);

  readonly productColumns: DataTableColumn[] = [
    { key: 'productCode', label: 'Código' },
    { key: 'productName', label: 'Plato' },
    { key: 'category', label: 'Rubro', format: (r) => String(r['category'] || '—') },
    { key: 'subcategory', label: 'Subrubro', format: (r) => String(r['subcategory'] || '—') },
    { key: 'active', label: 'Estado', format: (r) => activeLabel(!!r['active']) },
  ];

  readonly categoryColumns: DataTableColumn[] = [
    { key: 'name', label: 'Rubro' },
    { key: 'sortOrder', label: 'Orden' },
    { key: 'notes', label: 'Notas' },
  ];

  readonly subcategoryColumns: DataTableColumn[] = [
    { key: 'categoryName', label: 'Rubro' },
    { key: 'name', label: 'Subrubro' },
    { key: 'sortOrder', label: 'Orden' },
    { key: 'notes', label: 'Notas' },
  ];

  constructor() {
    usePageRefresh(() => this.reloadAll());
  }

  ngOnInit(): void {
    const shopId = this.shops.selectedShopId();
    if (!canManageShop(this.auth.currentUser(), shopId)) {
      void this.router.navigate(['/']);
      return;
    }
    this.reloadAll();
  }

  canManage(): boolean {
    return canManageShop(this.auth.currentUser(), this.shops.selectedShopId());
  }

  reloadAll(): void {
    this.loadProducts();
    this.loadCategories();
    this.loadSubcategories();
  }

  loadProducts(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const params: Record<string, string> = {};
    const q = this.q.value.trim();
    if (q) params['q'] = q;
    this.http
      .get<AdminPosProductRow[]>(`${environment.apiUrl}/shops/${shopId}/pos-products`, { params })
      .subscribe({
        next: (rows) => this.products.set(rows),
        error: () => this.snack.open('Error al cargar platos', 'OK', { duration: 3000 }),
      });
  }

  loadCategories(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.http
      .get<AdminPosCategoryRow[]>(`${environment.apiUrl}/shops/${shopId}/pos-categories`)
      .subscribe({
        next: (rows) => this.categories.set(rows),
        error: () => this.categories.set([]),
      });
  }

  loadSubcategories(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.http
      .get<AdminPosSubcategoryRow[]>(`${environment.apiUrl}/shops/${shopId}/pos-subcategories`)
      .subscribe({
        next: (rows) => this.subcategories.set(rows),
        error: () => this.subcategories.set([]),
      });
  }

  seedFromReport(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.http
      .post<{
        categories: number;
        subcategories: number;
        productsAssigned: number;
        productsSkipped: number;
      }>(`${environment.apiUrl}/shops/${shopId}/pos-catalog/seed-from-report`, {})
      .subscribe({
        next: (r) => {
          this.snack.open(
            `Catálogo cargado: ${r.categories} rubros, ${r.subcategories} subrubros, ${r.productsAssigned} platos asignados`,
            'OK',
            { duration: 4500 },
          );
          this.reloadAll();
        },
        error: () => this.snack.open('No se pudo cargar el catálogo', 'OK', { duration: 3000 }),
      });
  }

  openEditProduct(row: Record<string, unknown>): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const product = row as unknown as AdminPosProductRow;
    this.dialogTitle
      .track(
        this.dialog.open(AdminPosProductDialogComponent, {
          width: '480px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            shopId,
            product,
            categories: this.categories(),
            subcategories: this.subcategories(),
          },
        }),
        'Editar plato',
      )
      .afterClosed()
      .subscribe((updated) => {
        if (updated) this.loadProducts();
      });
  }

  openCreateCategory(): void {
    this.openCategoryDialog({ mode: 'create' });
  }

  openEditCategory(row: Record<string, unknown>): void {
    this.openCategoryDialog({
      mode: 'edit',
      category: row as unknown as AdminPosCategoryRow,
    });
  }

  private openCategoryDialog(
    mode: { mode: 'create' } | { mode: 'edit'; category: AdminPosCategoryRow },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.dialogTitle
      .track(
        this.dialog.open(AdminPosCategoryDialogComponent, {
          width: '480px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { shopId, ...mode },
        }),
        mode.mode === 'edit' ? 'Editar rubro' : 'Nuevo rubro',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) {
          this.loadCategories();
          this.loadProducts();
        }
      });
  }

  async onRemoveCategory(row: Record<string, unknown>): Promise<void> {
    const shopId = this.shops.selectedShopId();
    const cat = row as unknown as AdminPosCategoryRow;
    if (!shopId || !cat.id) return;
    const ok = await this.confirm.confirm('Eliminar rubro', `¿Quitar "${cat.name}"?`);
    if (!ok) return;
    this.http.delete(`${environment.apiUrl}/shops/${shopId}/pos-categories/${cat.id}`).subscribe({
      next: () => {
        this.snack.open('Rubro eliminado', 'OK', { duration: 2500 });
        this.loadCategories();
      },
      error: () => this.snack.open('No se pudo eliminar', 'OK', { duration: 3000 }),
    });
  }

  openCreateSubcategory(): void {
    this.openSubcategoryDialog({ mode: 'create' });
  }

  openEditSubcategory(row: Record<string, unknown>): void {
    this.openSubcategoryDialog({
      mode: 'edit',
      subcategory: row as unknown as AdminPosSubcategoryRow,
    });
  }

  private openSubcategoryDialog(
    mode: { mode: 'create' } | { mode: 'edit'; subcategory: AdminPosSubcategoryRow },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    if (!this.categories().length) {
      this.snack.open('Primero creá o cargá rubros', 'OK', { duration: 3000 });
      return;
    }
    this.dialogTitle
      .track(
        this.dialog.open(AdminPosSubcategoryDialogComponent, {
          width: '480px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { shopId, categories: this.categories(), ...mode },
        }),
        mode.mode === 'edit' ? 'Editar subrubro' : 'Nuevo subrubro',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) {
          this.loadSubcategories();
          this.loadProducts();
        }
      });
  }

  async onRemoveSubcategory(row: Record<string, unknown>): Promise<void> {
    const shopId = this.shops.selectedShopId();
    const sub = row as unknown as AdminPosSubcategoryRow;
    if (!shopId || !sub.id) return;
    const ok = await this.confirm.confirm('Eliminar subrubro', `¿Quitar "${sub.name}"?`);
    if (!ok) return;
    this.http
      .delete(`${environment.apiUrl}/shops/${shopId}/pos-subcategories/${sub.id}`)
      .subscribe({
        next: () => {
          this.snack.open('Subrubro eliminado', 'OK', { duration: 2500 });
          this.loadSubcategories();
        },
        error: () => this.snack.open('No se pudo eliminar', 'OK', { duration: 3000 }),
      });
  }
}
