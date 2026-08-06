import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
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
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { StockApiService, StockCategory, StockProduct } from './stock-api.service';
import { StockProductDialogComponent } from './stock-product-dialog';

const TAB_ALL = '__all__';
const TAB_UNCATEGORIZED = '__none__';

type CategoryTab = {
  id: string;
  label: string;
  count: number;
  lowCount: number;
};

type StockSectionId = 'low' | 'at' | 'ok';

type StockSection = {
  id: StockSectionId;
  label: string;
  items: StockProduct[];
};

@Component({
  selector: 'app-stock-page',
  imports: [
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatDialogModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
    PageHeaderComponent,
    SpinnerComponent,
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

    <div class="stock-sticky">
      <div class="stock-tabs-bar panel-card">
        <div class="stock-tabs" role="tablist" aria-label="Categorías de stock">
          @for (tab of categoryTabs(); track tab.id) {
            <button
              type="button"
              role="tab"
              class="stock-tab"
              [class.stock-tab--active]="selectedTab() === tab.id"
              [attr.aria-selected]="selectedTab() === tab.id"
              (click)="selectTab(tab.id)"
            >
              <span class="stock-tab__label">{{ tab.label }}</span>
              <span class="stock-tab__count">{{ tab.count }}</span>
              @if (tab.lowCount > 0) {
                <span class="stock-tab__low" [matTooltip]="tab.lowCount + ' bajo mínimo'">
                  {{ tab.lowCount }}
                </span>
              }
            </button>
          }
        </div>
        <div class="stock-tabs-bar__tools">
          <mat-slide-toggle
            [ngModel]="includeInactive()"
            (ngModelChange)="onToggleInactive($event)"
          >
            Ocultos
          </mat-slide-toggle>
        </div>
      </div>

      @if (sections().length > 1) {
        <nav class="stock-jump" aria-label="Ir a sección de stock">
          @for (sec of sections(); track sec.id) {
            <button
              type="button"
              class="stock-jump__btn"
              [class.stock-jump__btn--low]="sec.id === 'low'"
              (click)="scrollToSection(sec.id)"
            >
              {{ sec.label }}
              <span>{{ sec.items.length }}</span>
            </button>
          }
        </nav>
      }
    </div>

    @if (canManage()) {
      <div class="stock-toolbar mb-3">
        @if (!restockMode()) {
          <button mat-stroked-button type="button" (click)="enterRestockMode()">
            <mat-icon>replay</mat-icon>
            Reponer
          </button>
          <span class="stock-toolbar__meta"
            >{{ rows().length }} producto{{ rows().length === 1 ? '' : 's' }}</span
          >
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
      } @else if (!products().length) {
        <div class="panel-card guy-empty">
          <mat-icon>inventory_2</mat-icon>
          <div>
            <strong>Sin productos</strong>
            <div class="small">
              @if (canManage()) {
                Creá el primero con “Nuevo producto”.
              } @else {
                No hay productos cargados.
              }
            </div>
          </div>
        </div>
      } @else if (!rows().length) {
        <div class="panel-card guy-empty">
          <mat-icon>category</mat-icon>
          <div>
            <strong>Sin productos en esta categoría</strong>
            <div class="small">Probá otra pestaña o “Todos”.</div>
          </div>
        </div>
      } @else {
        @for (sec of sections(); track sec.id) {
          <section class="stock-section" [attr.id]="'stock-sec-' + sec.id">
            <header class="stock-section__head" [attr.data-tone]="sec.id">
              <strong>{{ sec.label }}</strong>
              <span>{{ sec.items.length }}</span>
            </header>
            <div class="stock-section__list">
              @for (row of sec.items; track row.id) {
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
                        @if (selectedTab() === TAB_ALL) {
                          {{ row.categoryName || 'Sin categoría' }} ·
                        }
                        mín. {{ row.minQuantity | number: '1.0-2' }}
                        @if (row.maxQuantity > 0) {
                          · máx. {{ row.maxQuantity | number: '1.0-2' }}
                        }
                        @if (!row.active) {
                          · Oculto
                        }
                      </p>
                    </div>
                    @if (canManage() && !restockMode()) {
                      <div class="stock-card__actions">
                        <button
                          mat-icon-button
                          type="button"
                          matTooltip="Editar"
                          (click)="openEdit(row)"
                        >
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
            </div>
          </section>
        }
      }
    </div>

    @if (showScrollFab()) {
      <div class="stock-fabs" aria-label="Navegación rápida">
        <button
          type="button"
          class="stock-fab"
          matTooltip="Ir arriba"
          (click)="scrollToTop()"
        >
          <mat-icon>keyboard_arrow_up</mat-icon>
        </button>
        <button
          type="button"
          class="stock-fab"
          matTooltip="Ir abajo"
          (click)="scrollToBottom()"
        >
          <mat-icon>keyboard_arrow_down</mat-icon>
        </button>
      </div>
    }
  `,
  styles: [
    `
      .stock-sticky {
        position: sticky;
        top: 0;
        z-index: 5;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 0.85rem;
        padding-bottom: 0.15rem;
        background: linear-gradient(
          to bottom,
          var(--guy-bg, #f3f6f4) 70%,
          color-mix(in srgb, var(--guy-bg, #f3f6f4) 0%, transparent)
        );
      }
      .stock-tabs-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem 1rem;
        padding: 0.75rem 0.9rem;
        margin: 0;
      }
      .stock-tabs {
        display: flex;
        flex: 1;
        gap: 0.4rem;
        overflow-x: auto;
        padding-bottom: 0.15rem;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: thin;
        min-width: 0;
      }
      .stock-tab {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        flex: 0 0 auto;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: var(--guy-surface, #fff);
        color: var(--guy-navy, #003366);
        border-radius: 999px;
        padding: 0.4rem 0.75rem;
        font: inherit;
        font-size: 0.88rem;
        font-weight: 600;
        cursor: pointer;
      }
      .stock-tab--active {
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 12%, #fff);
        border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 55%, var(--guy-border, #d7e0d9));
        color: color-mix(in srgb, var(--guy-accent, #2e7d32) 75%, #1b2a33);
      }
      .stock-tab__count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.35rem;
        padding: 0 0.3rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 700;
        background: color-mix(in srgb, var(--guy-navy, #003366) 8%, #fff);
        color: var(--guy-muted, #5f6f76);
      }
      .stock-tab--active .stock-tab__count {
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 18%, #fff);
        color: inherit;
      }
      .stock-tab__low {
        display: inline-flex;
        min-width: 1.2rem;
        padding: 0 0.28rem;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 700;
        background: #fdecea;
        color: #c62828;
        justify-content: center;
      }
      .stock-tabs-bar__tools {
        flex: 0 0 auto;
      }
      .stock-jump {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .stock-jump__btn {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        border: 1px dashed var(--guy-border, #d7e0d9);
        background: color-mix(in srgb, var(--guy-surface, #fff) 88%, var(--guy-bg, #f3f6f4));
        color: var(--guy-navy, #003366);
        border-radius: 8px;
        padding: 0.35rem 0.65rem;
        font: inherit;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
      }
      .stock-jump__btn span {
        font-size: 0.72rem;
        color: var(--guy-muted, #5f6f76);
      }
      .stock-jump__btn--low {
        border-color: color-mix(in srgb, #c62828 40%, var(--guy-border, #d7e0d9));
        color: #c62828;
      }
      .stock-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
      }
      .stock-toolbar__meta {
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
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
        gap: 1rem;
        padding-bottom: 4.5rem;
      }
      .stock-section__head {
        position: sticky;
        top: 5.5rem;
        z-index: 3;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.45rem;
        padding: 0.4rem 0.65rem;
        border-radius: 8px;
        font-size: 0.82rem;
        background: color-mix(in srgb, var(--guy-navy, #003366) 6%, var(--guy-bg, #f3f6f4));
        color: var(--guy-navy, #003366);
        border: 1px solid var(--guy-border, #d7e0d9);
      }
      .stock-section__head[data-tone='low'] {
        background: #fdecea;
        border-color: color-mix(in srgb, #c62828 35%, #fdecea);
        color: #c62828;
      }
      .stock-section__head[data-tone='at'] {
        background: #fff8e1;
        border-color: color-mix(in srgb, #f9a825 35%, #fff8e1);
        color: #f57f17;
      }
      .stock-section__list {
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
      .stock-fabs {
        position: fixed;
        right: 1rem;
        bottom: 5.5rem;
        z-index: 20;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .stock-fab {
        width: 2.6rem;
        height: 2.6rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 999px;
        background: var(--guy-surface, #fff);
        color: var(--guy-navy, #003366);
        box-shadow: 0 6px 18px rgba(0, 51, 102, 0.14);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .stock-fab mat-icon {
        font-size: 1.4rem;
        width: 1.4rem;
        height: 1.4rem;
      }
      .small {
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
      }
      @media (min-width: 961px) {
        .stock-fabs {
          bottom: 1.5rem;
        }
      }
    `,
  ],
})
export class StockPage {
  readonly TAB_ALL = TAB_ALL;

  private readonly api = inject(StockApiService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);

  readonly products = signal<StockProduct[]>([]);
  readonly categories = signal<StockCategory[]>([]);
  readonly loading = signal(true);
  readonly includeInactive = signal(false);
  readonly selectedTab = signal<string>(TAB_ALL);
  readonly adjustingId = signal<string | null>(null);
  readonly restockMode = signal(false);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly restocking = signal(false);
  readonly showScrollFab = signal(false);

  readonly categoryTabs = computed((): CategoryTab[] => {
    const products = this.products();
    const categories = this.categories();
    const byCat = new Map<string, { count: number; low: number }>();
    let uncategorized = 0;
    let uncategorizedLow = 0;
    for (const p of products) {
      if (!p.categoryId) {
        uncategorized += 1;
        if (p.belowMinimum) uncategorizedLow += 1;
        continue;
      }
      const cur = byCat.get(p.categoryId) ?? { count: 0, low: 0 };
      cur.count += 1;
      if (p.belowMinimum) cur.low += 1;
      byCat.set(p.categoryId, cur);
    }

    const tabs: CategoryTab[] = [
      {
        id: TAB_ALL,
        label: 'Todos',
        count: products.length,
        lowCount: products.filter((p) => p.belowMinimum).length,
      },
    ];

    for (const c of categories) {
      const stats = byCat.get(c.id);
      tabs.push({
        id: c.id,
        label: c.name,
        count: stats?.count ?? 0,
        lowCount: stats?.low ?? 0,
      });
    }

    if (uncategorized > 0) {
      tabs.push({
        id: TAB_UNCATEGORIZED,
        label: 'Sin categoría',
        count: uncategorized,
        lowCount: uncategorizedLow,
      });
    }
    return tabs;
  });

  readonly rows = computed(() => {
    const tab = this.selectedTab();
    const list = this.products();
    let filtered: StockProduct[];
    if (tab === TAB_ALL) filtered = [...list];
    else if (tab === TAB_UNCATEGORIZED) filtered = list.filter((r) => !r.categoryId);
    else filtered = list.filter((r) => r.categoryId === tab);

    return filtered.sort((a, b) => {
      const marginA = Number(a.quantity) - Number(a.minQuantity);
      const marginB = Number(b.quantity) - Number(b.minQuantity);
      if (marginA !== marginB) return marginA - marginB;
      return a.name.localeCompare(b.name, 'es');
    });
  });

  readonly sections = computed((): StockSection[] => {
    const low: StockProduct[] = [];
    const at: StockProduct[] = [];
    const ok: StockProduct[] = [];
    for (const row of this.rows()) {
      const qty = Number(row.quantity);
      const min = Number(row.minQuantity);
      if (qty < min) low.push(row);
      else if (qty === min) at.push(row);
      else ok.push(row);
    }
    const out: StockSection[] = [];
    if (low.length) out.push({ id: 'low', label: 'Bajo mínimo', items: low });
    if (at.length) out.push({ id: 'at', label: 'En el mínimo', items: at });
    if (ok.length) out.push({ id: 'ok', label: 'Con holgura', items: ok });
    return out;
  });

  readonly selectedCount = computed(() => this.selectedIds().size);

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.products.set([]);
        this.categories.set([]);
        this.selectedTab.set(TAB_ALL);
        this.loading.set(false);
        this.cancelRestockMode();
        return;
      }
      this.selectedTab.set(TAB_ALL);
      this.cancelRestockMode();
      this.reload();
    });

    const onScroll = () => this.showScrollFab.set(this.scrollTop() > 280);
    const root = this.scrollRoot();
    root.addEventListener('scroll', onScroll, { passive: true });
    this.destroyRef.onDestroy(() => root.removeEventListener('scroll', onScroll));
  }

  selectTab(id: string): void {
    this.selectedTab.set(id);
    if (this.restockMode()) this.selectedIds.set(new Set());
  }

  scrollToSection(id: StockSectionId): void {
    const el = document.getElementById(`stock-sec-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  scrollToTop(): void {
    this.scrollRoot().scrollTo({ top: 0, behavior: 'smooth' });
  }

  scrollToBottom(): void {
    const root = this.scrollRoot();
    root.scrollTo({ top: root.scrollHeight, behavior: 'smooth' });
  }

  private scrollRoot(): HTMLElement {
    return (
      (document.querySelector('.mat-drawer-content') as HTMLElement | null) ??
      (document.scrollingElement as HTMLElement) ??
      document.documentElement
    );
  }

  private scrollTop(): number {
    const root = this.scrollRoot();
    return root === document.documentElement || root === document.body
      ? window.scrollY || document.documentElement.scrollTop
      : root.scrollTop;
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
