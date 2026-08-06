import { Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { SpinnerComponent } from '../../shared/components/spinner';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { StockApiService, StockCategory, StockProduct } from './stock-api.service';
import { StockProductDialogComponent } from './stock-product-dialog';

@Component({
  selector: 'app-stock-page',
  imports: [
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
    PageHeaderComponent,
    SpinnerComponent,
    FiltersCollapseBtnComponent,
    BusyLabelComponent,
  ],
  template: `
    <app-page-header
      title="Administración de stock"
      [subtitle]="shops.selectedShop()?.name ?? 'Local'"
      [actionLabel]="canManage() ? 'Nuevo producto' : ''"
      [actionDisabled]="!canManage() || restockMode()"
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
          <p class="guy-filters__subtitle">
            @if (activeFilterCount() > 0) {
              {{ activeFilterCount() }} filtro{{ activeFilterCount() === 1 ? '' : 's' }} activo{{
                activeFilterCount() === 1 ? '' : 's'
              }}
            } @else {
              Categoría y ocultos
            }
          </p>
        </div>
        <div class="guy-filters__tools">
          <app-filters-collapse-btn
            [collapsed]="filtersCollapsed()"
            (toggle)="toggleFilters()"
          />
        </div>
      </div>
      <div class="guy-filters__body">
        <div class="guy-filters__grid guy-filters__grid--dense">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Categorías</mat-label>
            <mat-icon matPrefix>category</mat-icon>
            <mat-select
              multiple
              [ngModel]="categoryFilter()"
              (ngModelChange)="onCategoryFilter($event)"
            >
              @for (c of categories(); track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-slide-toggle [ngModel]="includeInactive()" (ngModelChange)="onToggleInactive($event)">
            Mostrar ocultos
          </mat-slide-toggle>
        </div>
      </div>
    </div>

    @if (canManage()) {
      <div class="stock-toolbar mb-3">
        @if (!restockMode()) {
          <button mat-stroked-button type="button" (click)="enterRestockMode()">
            <mat-icon>replay</mat-icon>
            Reponer
          </button>
        } @else {
          <div class="stock-toolbar__restock">
            <span class="stock-toolbar__hint">
              Seleccioná productos para llevarlos a su stock máximo
              @if (selectedCount() > 0) {
                ({{ selectedCount() }})
              }
            </span>
            <div class="stock-toolbar__actions">
              <button
                mat-button
                type="button"
                [disabled]="restocking()"
                (click)="cancelRestockMode()"
              >
                Cancelar
              </button>
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="restocking() || selectedCount() === 0"
                (click)="confirmRestock()"
              >
                <app-busy-label [busy]="restocking()" busyLabel="Reponiendo…">
                  <mat-icon>replay</mat-icon>
                  Reponer
                </app-busy-label>
              </button>
            </div>
          </div>
        }
      </div>
    }

    <div class="stock-list">
      @if (loading()) {
        <div
          class="panel-card guy-empty guy-empty--loading"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <app-spinner [size]="28" tone="accent" />
          <div>
            <strong>Cargando…</strong>
            <div class="small">Obteniendo stock</div>
          </div>
        </div>
      } @else if (!rows().length) {
        <div class="panel-card guy-empty">
          <mat-icon>inventory_2</mat-icon>
          <div>
            <strong>{{ products().length && categoryFilter().length ? 'Sin resultados' : 'Sin productos' }}</strong>
            <div class="small">
              @if (products().length && categoryFilter().length) {
                No hay productos en las categorías seleccionadas.
              } @else if (canManage()) {
                Creá el primero con “Nuevo producto”.
              } @else {
                No hay productos cargados.
              }
            </div>
          </div>
        </div>
      } @else {
        @for (row of rows(); track row.id) {
          <article
            class="panel-card stock-card"
            [class.stock-card--low]="row.belowMinimum"
            [class.stock-card--hidden]="!row.active"
            [class.stock-card--select]="restockMode()"
            (click)="restockMode() ? toggleSelect(row) : null"
          >
            @if (restockMode()) {
              <mat-checkbox
                [checked]="isSelected(row.id)"
                [disabled]="!canRestock(row) || restocking()"
                (click)="$event.stopPropagation()"
                (change)="toggleSelect(row)"
                [matTooltip]="
                  canRestock(row)
                    ? 'Reponer a ' + (row.maxQuantity | number: '1.0-2')
                    : 'Configurá un stock máximo mayor a 0'
                "
              />
            }
            <div class="stock-card__main">
              <div>
                <h3 class="stock-card__name">{{ row.name }}</h3>
                <p class="stock-card__meta">
                  {{ row.categoryName || 'Sin categoría' }}
                  · mín. {{ row.minQuantity | number: '1.0-2' }}
                  @if (row.maxQuantity > 0) {
                    · máx. {{ row.maxQuantity | number: '1.0-2' }}
                  }
                  @if (!row.active) {
                    · Oculto
                  }
                  @if (row.belowMinimum) {
                    · Bajo mínimo
                  }
                </p>
              </div>
              @if (canManage() && !restockMode()) {
                <div class="stock-card__actions">
                  <button mat-icon-button type="button" matTooltip="Editar" (click)="openEdit(row)">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    type="button"
                    [matTooltip]="row.active ? 'Ocultar' : 'Mostrar'"
                    (click)="onToggleVisibility(row)"
                  >
                    <mat-icon>{{ row.active ? 'visibility_off' : 'visibility' }}</mat-icon>
                  </button>
                </div>
              }
            </div>

            @if (!restockMode()) {
              <div class="stock-card__qty">
                <button
                  mat-icon-button
                  type="button"
                  [disabled]="!canManage() || adjustingId() === row.id || row.quantity <= 0"
                  (click)="adjust(row, -1)"
                  aria-label="Restar"
                >
                  <mat-icon>remove</mat-icon>
                </button>
                <strong
                  class="stock-card__qty-value"
                  [class.stock-card__qty-value--low]="row.belowMinimum"
                >
                  {{ row.quantity | number: '1.0-2' }}
                </strong>
                <button
                  mat-icon-button
                  type="button"
                  [disabled]="!canManage() || adjustingId() === row.id"
                  (click)="adjust(row, 1)"
                  aria-label="Sumar"
                >
                  <mat-icon>add</mat-icon>
                </button>
              </div>
            } @else {
              <div class="stock-card__qty stock-card__qty--readonly">
                <span class="small">Actual</span>
                <strong>{{ row.quantity | number: '1.0-2' }}</strong>
                @if (canRestock(row)) {
                  <mat-icon class="stock-card__arrow">arrow_forward</mat-icon>
                  <strong>{{ row.maxQuantity | number: '1.0-2' }}</strong>
                }
              </div>
            }
          </article>
        }
      }
    </div>
  `,
  styles: [
    `
      .stock-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
      }
      .stock-toolbar__restock {
        display: flex;
        flex: 1;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.65rem 0.85rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 10px;
        background: color-mix(in srgb, var(--guy-navy, #003366) 4%, var(--guy-surface, #fff));
      }
      .stock-toolbar__hint {
        font-size: 0.9rem;
        color: var(--guy-muted, #5f6f76);
      }
      .stock-toolbar__actions {
        display: flex;
        gap: 0.35rem;
        align-items: center;
      }
      .stock-list {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }
      .stock-card {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
      }
      .stock-card--select {
        cursor: pointer;
      }
      .stock-card--low {
        border-color: color-mix(in srgb, #c62828 55%, var(--guy-border, #d7e0d9));
        background: color-mix(in srgb, #c62828 6%, var(--guy-surface, #fff));
      }
      .stock-card--hidden {
        opacity: 0.65;
      }
      .stock-card__main {
        display: flex;
        flex: 1;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.5rem;
        min-width: 12rem;
      }
      .stock-card__name {
        margin: 0;
        font-size: 1.05rem;
        color: var(--guy-navy, #003366);
      }
      .stock-card__meta {
        margin: 0.2rem 0 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
      }
      .stock-card__actions {
        display: flex;
        gap: 0.15rem;
      }
      .stock-card__qty {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
      .stock-card__qty--readonly {
        gap: 0.4rem;
        color: var(--guy-navy, #003366);
      }
      .stock-card__arrow {
        font-size: 1rem;
        width: 1rem;
        height: 1rem;
        color: var(--guy-muted, #5f6f76);
      }
      .stock-card__qty-value {
        min-width: 3.5rem;
        text-align: center;
        font-size: 1.25rem;
        color: var(--guy-navy, #003366);
      }
      .stock-card__qty-value--low {
        color: #c62828;
      }
    `,
  ],
})
export class StockPage {
  private readonly filtersUi = createFiltersCollapsed('stock');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  private readonly api = inject(StockApiService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly products = signal<StockProduct[]>([]);
  readonly categories = signal<StockCategory[]>([]);
  readonly loading = signal(true);
  readonly includeInactive = signal(false);
  readonly categoryFilter = signal<string[]>([]);
  readonly adjustingId = signal<string | null>(null);
  readonly restockMode = signal(false);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly restocking = signal(false);

  readonly rows = computed(() => {
    const cats = this.categoryFilter();
    const list = this.products();
    if (!cats.length) return list;
    const set = new Set(cats);
    return list.filter((r) => set.has(r.categoryId));
  });

  readonly selectedCount = computed(() => this.selectedIds().size);

  readonly activeFilterCount = computed(() => {
    let n = 0;
    if (this.categoryFilter().length) n += 1;
    if (this.includeInactive()) n += 1;
    return n;
  });

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.products.set([]);
        this.categories.set([]);
        this.categoryFilter.set([]);
        this.loading.set(false);
        this.cancelRestockMode();
        return;
      }
      this.categoryFilter.set([]);
      this.cancelRestockMode();
      this.reload();
    });
  }

  canManage(): boolean {
    return hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'stock.manage',
    );
  }

  canRestock(row: StockProduct): boolean {
    return row.active && Number(row.maxQuantity) > 0;
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  enterRestockMode(): void {
    this.restockMode.set(true);
    this.selectedIds.set(new Set());
  }

  cancelRestockMode(): void {
    this.restockMode.set(false);
    this.selectedIds.set(new Set());
    this.restocking.set(false);
  }

  toggleSelect(row: StockProduct): void {
    if (!this.canRestock(row) || this.restocking()) return;
    this.selectedIds.update((set) => {
      const next = new Set(set);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }

  async confirmRestock(): Promise<void> {
    const shopId = this.shops.selectedShopId();
    const ids = [...this.selectedIds()];
    if (!shopId || !ids.length) return;

    const names = this.products()
      .filter((p) => ids.includes(p.id))
      .map((p) => p.name);
    const ok = await this.confirmDialog.confirm(
      'Reponer stock',
      `¿Llevar ${names.length === 1 ? `"${names[0]}"` : `${names.length} productos`} a su stock máximo?`,
    );
    if (!ok) return;

    this.restocking.set(true);
    this.api.restock(shopId, ids).subscribe({
      next: (res) => {
        this.restocking.set(false);
        const updatedMap = new Map(res.products.map((p) => [p.id, p]));
        this.products.update((list) => list.map((r) => updatedMap.get(r.id) ?? r));
        const msg =
          res.skipped?.length > 0
            ? `Repuestos ${res.products.length}. Omitidos: ${res.skipped.join(', ')}`
            : `Repuestos ${res.products.length} producto${res.products.length === 1 ? '' : 's'}`;
        this.snack.open(msg, 'OK', { duration: 3500 });
        this.cancelRestockMode();
      },
      error: (err) => {
        this.restocking.set(false);
        const msg = err?.error?.message ?? 'No se pudo reponer';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  onToggleInactive(value: boolean): void {
    this.includeInactive.set(value);
    this.reload();
  }

  onCategoryFilter(value: string[]): void {
    this.categoryFilter.set(Array.isArray(value) ? value : []);
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.listProducts(shopId, this.includeInactive()).subscribe({
      next: (rows) => {
        this.products.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudo cargar el stock', 'OK', { duration: 3000 });
      },
    });
    this.api.listCategories(shopId).subscribe({
      next: (cats) => this.categories.set(cats),
      error: () => this.categories.set([]),
    });
  }

  openCreate(): void {
    this.openDialog({ mode: 'create' });
  }

  openEdit(row: StockProduct): void {
    this.openDialog({ mode: 'edit', product: row });
  }

  adjust(row: StockProduct, delta: 1 | -1): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage()) return;
    this.adjustingId.set(row.id);
    this.api.adjust(shopId, row.id, delta).subscribe({
      next: (updated) => {
        this.adjustingId.set(null);
        this.products.update((list) => list.map((r) => (r.id === updated.id ? updated : r)));
      },
      error: (err) => {
        this.adjustingId.set(null);
        const msg = err?.error?.message ?? 'No se pudo ajustar la cantidad';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
      },
    });
  }

  async onToggleVisibility(row: StockProduct): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    if (row.active) {
      const ok = await this.confirmDialog.confirm(
        'Ocultar producto',
        `¿Ocultar "${row.name}" del stock?`,
      );
      if (!ok) return;
      this.api.removeProduct(shopId, row.id).subscribe({
        next: () => {
          this.snack.open('Producto oculto', 'OK', { duration: 2500 });
          this.reload();
        },
        error: () => this.snack.open('No se pudo ocultar', 'OK', { duration: 3500 }),
      });
      return;
    }
    this.api.updateProduct(shopId, row.id, { active: true }).subscribe({
      next: () => {
        this.snack.open('Producto visible de nuevo', 'OK', { duration: 2500 });
        this.reload();
      },
      error: () => this.snack.open('No se pudo mostrar', 'OK', { duration: 3500 }),
    });
  }

  private openDialog(
    mode: { mode: 'create' } | { mode: 'edit'; product: StockProduct },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    this.dialogTitle
      .track(
        this.dialog.open(StockProductDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            ...mode,
            shopId,
            shopName,
            categories: this.categories(),
          },
        }),
        mode.mode === 'edit' ? 'Editar producto' : 'Nuevo producto',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }
}
