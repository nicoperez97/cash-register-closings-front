import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { SpinnerComponent } from '../../shared/components/spinner';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { usePageRefresh } from '../../core/page-refresh.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import {
  StockApiService,
  StockCategory,
  StockKind,
  StockProduct,
  stockKindLabel,
  stockManagePermission,
} from './stock-api.service';
import { StockProductDialogComponent } from './stock-product-dialog';
import { StockShareDialogComponent } from './stock-share-dialog';
import { shareText } from '../../shared/utils/share-text';

const TAB_ALL = '__all__';
const TAB_UNCATEGORIZED = '__none__';

type CategoryTab = {
  id: string;
  label: string;
  count: number;
  lowCount: number;
};

type LetterGroup = {
  key: string;
  letter: string | null;
  items: StockProduct[];
};

type SortMode = 'name' | 'qty';
type ViewMode = 'cards' | 'list';

const SORT_KEY = 'crc_stock_sort';

function viewStorageKey(kind: StockKind): string {
  return `crc_stock_view_${kind}`;
}

function letterOf(name: string): string {
  const raw = String(name ?? '')
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .charAt(0)
    .toUpperCase();
  if (!raw) return '#';
  return /[A-Z]/.test(raw) ? raw : '#';
}

function loadSortMode(): SortMode {
  try {
    const v = localStorage.getItem(SORT_KEY);
    return v === 'qty' || v === 'name' ? v : 'name';
  } catch {
    return 'name';
  }
}

function loadViewMode(kind: StockKind): ViewMode {
  try {
    const v = localStorage.getItem(viewStorageKey(kind));
    return v === 'list' || v === 'cards' ? v : 'cards';
  } catch {
    return 'cards';
  }
}

@Component({
  selector: 'app-stock-page',
  imports: [
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatIconModule,
    MatDialogModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    PageHeaderComponent,
    SpinnerComponent,
    BusyLabelComponent,
  ],
  template: `
    <app-page-header
      [title]="pageTitle()"
      [subtitle]="shops.selectedShop()?.name ?? 'Local'"
      [actionLabel]="canManage() ? 'Nuevo producto' : ''"
      [actionDisabled]="!canManage() || restockMode()"
      actionIcon="add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    <div class="stock-sticky">
      <div class="stock-search panel-card">
        <mat-form-field appearance="outline" class="stock-search__field" subscriptSizing="dynamic">
          <mat-icon matPrefix>search</mat-icon>
          <input
            matInput
            type="search"
            [ngModel]="searchQuery()"
            (ngModelChange)="onSearch($event)"
            [placeholder]="'Buscar ' + kindLabel() + '…'"
            autocomplete="off"
          />
          @if (searchQuery()) {
            <button
              matSuffix
              mat-icon-button
              type="button"
              aria-label="Limpiar búsqueda"
              (click)="onSearch('')"
            >
              <mat-icon>close</mat-icon>
            </button>
          }
        </mat-form-field>
      </div>

      <div class="stock-tabs-bar panel-card">
        <div class="stock-tabs-row">
          @if (tabsOverflow()) {
            <button
              type="button"
              class="stock-tabs-arrow"
              [disabled]="!tabsCanPrev()"
              (click)="scrollTabs(-1)"
              aria-label="Categorías anteriores"
            >
              <mat-icon>chevron_left</mat-icon>
            </button>
          }
          <div
            class="stock-tabs"
            #tabsScroller
            role="tablist"
            aria-label="Categorías de stock"
            (scroll)="syncTabsScrollState()"
          >
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
          @if (tabsOverflow()) {
            <button
              type="button"
              class="stock-tabs-arrow"
              [disabled]="!tabsCanNext()"
              (click)="scrollTabs(1)"
              aria-label="Categorías siguientes"
            >
              <mat-icon>chevron_right</mat-icon>
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
    </div>

    @if (canManage() || rows().length || products().length) {
      <div class="stock-toolbar mb-3">
        <mat-button-toggle-group
          class="stock-sort"
          hideSingleSelectionIndicator
          [value]="sortMode()"
          (change)="onSortMode($event.value)"
          aria-label="Ordenar productos"
        >
          <mat-button-toggle value="name" matTooltip="Orden alfabético">
            <mat-icon>sort_by_alpha</mat-icon>
            Nombre
          </mat-button-toggle>
          <mat-button-toggle value="qty" matTooltip="Más cerca del mínimo primero">
            <mat-icon>trending_down</mat-icon>
            Menor stock
          </mat-button-toggle>
        </mat-button-toggle-group>

        <mat-button-toggle-group
          class="stock-view guy-icon-toggle"
          hideSingleSelectionIndicator
          [value]="viewMode()"
          (change)="onViewMode($event.value)"
          aria-label="Vista de productos"
        >
          <mat-button-toggle value="cards" matTooltip="Vista tarjetas">
            <mat-icon>grid_view</mat-icon>
          </mat-button-toggle>
          <mat-button-toggle value="list" matTooltip="Vista lista">
            <mat-icon>view_list</mat-icon>
          </mat-button-toggle>
        </mat-button-toggle-group>

        @if (canManage()) {
          @if (!restockMode()) {
            <button mat-stroked-button type="button" (click)="openSendStock()">
              <mat-icon>send</mat-icon>
              Enviar stock
            </button>
            <button mat-stroked-button type="button" (click)="shareStock()">
              <mat-icon>share</mat-icon>
              Compartir stock
            </button>
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
        } @else {
          <button mat-stroked-button type="button" (click)="openSendStock()">
            <mat-icon>send</mat-icon>
            Enviar stock
          </button>
          <button mat-stroked-button type="button" (click)="shareStock()">
            <mat-icon>share</mat-icon>
            Compartir stock
          </button>
          <span class="stock-toolbar__meta"
            >{{ rows().length }} producto{{ rows().length === 1 ? '' : 's' }}</span
          >
        }
      </div>
    }

    <div class="stock-body">
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
              <div class="small">Obteniendo stock de {{ kindLabel() }}</div>
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
            <mat-icon>{{ searchQuery() ? 'search_off' : 'category' }}</mat-icon>
            <div>
              <strong>{{
                searchQuery() ? 'Sin resultados' : 'Sin productos en esta categoría'
              }}</strong>
              <div class="small">
                @if (searchQuery()) {
                  Probá otro nombre o limpiá la búsqueda.
                } @else {
                  Probá otra pestaña o “Todos”.
                }
              </div>
            </div>
          </div>
        } @else {
          @for (group of displayGroups(); track group.key) {
            <section
              class="stock-letter"
              [attr.id]="group.letter ? 'stock-letter-' + group.letter : null"
            >
              @if (group.letter && viewMode() === 'cards') {
                <header class="stock-letter__head">{{ group.letter }}</header>
              }
              <div
                class="stock-letter__list"
                [class.stock-letter__list--compact]="viewMode() === 'list'"
              >
                @for (row of group.items; track row.id) {
                  <article
                    class="panel-card stock-card"
                    [class.stock-card--list]="viewMode() === 'list'"
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
                        @if (viewMode() === 'cards') {
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
                            @if (row.belowMinimum) {
                              · Bajo mínimo
                            }
                          </p>
                        } @else {
                          <p class="stock-card__meta stock-card__meta--list">
                            mín. {{ row.minQuantity | number: '1.0-2' }}
                            @if (selectedTab() === TAB_ALL && row.categoryName) {
                              · {{ row.categoryName }}
                            }
                            @if (row.belowMinimum) {
                              · Bajo mínimo
                            }
                          </p>
                        }
                      </div>
                      @if (canManage() && !restockMode() && viewMode() === 'cards') {
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
                            <mat-icon>{{
                              row.active ? 'visibility_off' : 'visibility'
                            }}</mat-icon>
                          </button>
                        </div>
                      }
                    </div>

                    @if (!restockMode()) {
                      <div class="stock-card__qty">
                        <button
                          mat-icon-button
                          type="button"
                          [disabled]="
                            !canManage() || adjustingId() === row.id || row.quantity <= 0
                          "
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
                      @if (canManage() && viewMode() === 'list') {
                        <div class="stock-card__actions stock-card__actions--list">
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
                            <mat-icon>{{
                              row.active ? 'visibility_off' : 'visibility'
                            }}</mat-icon>
                          </button>
                        </div>
                      }
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

      @if (sortMode() === 'name' && viewMode() === 'cards' && indexLetters().length > 1) {
        <nav
          class="stock-index"
          aria-label="Índice alfabético"
          (pointermove)="onIndexPointer($event)"
          (pointerdown)="onIndexPointer($event)"
        >
          @for (letter of indexLetters(); track letter) {
            <button
              type="button"
              class="stock-index__letter"
              [class.stock-index__letter--active]="activeLetter() === letter"
              (click)="jumpToLetter(letter)"
            >
              {{ letter }}
            </button>
          }
        </nav>
      }
    </div>
  `,
  styles: [
    `
      .stock-sticky {
        position: sticky;
        top: 0;
        z-index: 5;
        margin-bottom: 0.85rem;
        padding-bottom: 0.15rem;
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        background: linear-gradient(
          to bottom,
          var(--guy-bg, #f3f6f4) 70%,
          color-mix(in srgb, var(--guy-bg, #f3f6f4) 0%, transparent)
        );
      }
      .stock-search {
        padding: 0.55rem 0.75rem;
        margin: 0;
      }
      .stock-search__field {
        width: 100%;
      }
      .stock-tabs-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem 1rem;
        padding: 0.75rem 0.9rem;
        margin: 0;
      }
      .stock-tabs-row {
        display: flex;
        flex: 1;
        align-items: center;
        gap: 0.25rem;
        min-width: 0;
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
        scroll-snap-type: x mandatory;
        scroll-padding-inline: 0.25rem;
        overscroll-behavior-x: contain;
      }
      .stock-tabs-arrow {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 999px;
        background: var(--guy-surface, #fff);
        color: var(--guy-navy, #003366);
        cursor: pointer;
        padding: 0;
      }
      .stock-tabs-arrow:disabled {
        opacity: 0.35;
        cursor: default;
      }
      .stock-tabs-arrow mat-icon {
        font-size: 1.25rem;
        width: 1.25rem;
        height: 1.25rem;
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
        scroll-snap-align: start;
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
      .stock-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
      }
      .stock-sort,
      .stock-view {
        flex: 0 0 auto;
        border-radius: 999px;
        overflow: hidden;
      }
      .stock-sort .mat-button-toggle {
        font-size: 0.82rem;
      }
      .stock-sort mat-icon {
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
        margin-right: 0.15rem;
        vertical-align: middle;
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
      .stock-body {
        position: relative;
        display: flex;
        gap: 0.25rem;
        align-items: flex-start;
      }
      .stock-list {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 0.85rem;
        min-width: 0;
      }
      .stock-body:has(.stock-index) .stock-list {
        padding-right: 1.35rem;
      }
      .stock-letter__head {
        position: sticky;
        top: 8.5rem;
        z-index: 3;
        margin-bottom: 0.4rem;
        padding: 0.25rem 0.55rem;
        width: fit-content;
        min-width: 1.75rem;
        text-align: center;
        border-radius: 8px;
        font-size: 0.95rem;
        font-weight: 800;
        color: var(--guy-navy, #003366);
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 12%, #fff);
        border: 1px solid color-mix(in srgb, var(--guy-accent, #2e7d32) 30%, var(--guy-border, #d7e0d9));
      }
      .stock-letter__list {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }
      .stock-letter__list--compact {
        gap: 0.35rem;
      }
      .stock-index {
        position: sticky;
        top: 9.25rem;
        align-self: flex-start;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0;
        padding: 0.2rem 0;
        max-height: calc(100vh - 8rem);
        overflow: hidden;
        user-select: none;
        touch-action: none;
        z-index: 6;
      }
      .stock-index__letter {
        border: 0;
        background: transparent;
        color: var(--guy-muted, #5f6f76);
        font: inherit;
        font-size: 0.68rem;
        font-weight: 700;
        line-height: 1.15;
        padding: 0.05rem 0.2rem;
        cursor: pointer;
        min-width: 1.1rem;
      }
      .stock-index__letter--active,
      .stock-index__letter:hover {
        color: var(--guy-accent, #2e7d32);
      }
      .stock-card {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
      }
      .stock-card--list {
        flex-wrap: nowrap;
        gap: 0.5rem 0.65rem;
        padding: 0.45rem 0.65rem;
      }
      .stock-card--list .stock-card__main {
        min-width: 0;
        flex: 1 1 auto;
      }
      .stock-card--list .stock-card__name {
        font-size: 0.95rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .stock-card--list .stock-card__meta--list {
        margin-top: 0.05rem;
        font-size: 0.78rem;
      }
      .stock-card--list .stock-card__qty-value {
        min-width: 2.75rem;
        font-size: 1.05rem;
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
      .stock-card__actions--list {
        flex: 0 0 auto;
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
      .small {
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
      }
    `,
  ],
})
export class StockPage {
  readonly TAB_ALL = TAB_ALL;

  private readonly api = inject(StockApiService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tabsScroller = viewChild<ElementRef<HTMLElement>>('tabsScroller');

  private readonly routeData = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });

  readonly kind = computed<StockKind>(() =>
    this.routeData()['stockKind'] === 'beverage' ? 'beverage' : 'food',
  );
  readonly kindLabel = computed(() => stockKindLabel(this.kind()));
  readonly pageTitle = computed(() =>
    this.kind() === 'beverage' ? 'Stock bebidas' : 'Stock alimentos',
  );

  readonly products = signal<StockProduct[]>([]);
  readonly categories = signal<StockCategory[]>([]);
  readonly loading = signal(true);
  readonly includeInactive = signal(false);
  readonly selectedTab = signal<string>(TAB_ALL);
  readonly adjustingId = signal<string | null>(null);
  readonly restockMode = signal(false);
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly restocking = signal(false);
  readonly activeLetter = signal<string | null>(null);
  readonly sortMode = signal<SortMode>(loadSortMode());
  readonly viewMode = signal<ViewMode>('cards');
  readonly searchQuery = signal('');
  readonly tabsOverflow = signal(false);
  readonly tabsCanPrev = signal(false);
  readonly tabsCanNext = signal(false);

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

  /** Orden según sortMode: nombre A–Z o margen vs mínimo (menor primero). */
  readonly rows = computed(() => {
    const tab = this.selectedTab();
    const list = this.products();
    let filtered: StockProduct[];
    if (tab === TAB_ALL) filtered = [...list];
    else if (tab === TAB_UNCATEGORIZED) filtered = list.filter((r) => !r.categoryId);
    else filtered = list.filter((r) => r.categoryId === tab);

    const q = this.searchQuery().trim().toLocaleLowerCase('es');
    if (q) {
      filtered = filtered.filter((r) =>
        r.name.toLocaleLowerCase('es').includes(q),
      );
    }

    const mode = this.sortMode();
    return filtered.sort((a, b) => {
      if (mode === 'qty') {
        const marginA = Number(a.quantity) - Number(a.minQuantity);
        const marginB = Number(b.quantity) - Number(b.minQuantity);
        if (marginA !== marginB) return marginA - marginB;
        return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      }
      const byName = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      if (byName !== 0) return byName;
      const marginA = Number(a.quantity) - Number(a.minQuantity);
      const marginB = Number(b.quantity) - Number(b.minQuantity);
      return marginA - marginB;
    });
  });

  readonly letterGroups = computed((): LetterGroup[] => {
    const map = new Map<string, StockProduct[]>();
    for (const row of this.rows()) {
      const letter = letterOf(row.name);
      const bucket = map.get(letter);
      if (bucket) bucket.push(row);
      else map.set(letter, [row]);
    }
    const letters = [...map.keys()].sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b, 'es');
    });
    return letters.map((letter) => ({ key: letter, letter, items: map.get(letter)! }));
  });

  readonly displayGroups = computed((): LetterGroup[] => {
    if (this.sortMode() === 'name') return this.letterGroups();
    return [{ key: 'qty', letter: null, items: this.rows() }];
  });

  readonly indexLetters = computed(() =>
    this.sortMode() === 'name' ? this.letterGroups().map((g) => g.letter!).filter(Boolean) : [],
  );

  readonly selectedCount = computed(() => this.selectedIds().size);

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      const kind = this.kind(); // recargar al cambiar food/beverage (misma página reutilizada)
      this.viewMode.set(loadViewMode(kind));
      this.searchQuery.set('');
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

    effect(() => {
      this.categoryTabs();
      this.tabsScroller();
      queueMicrotask(() => this.syncTabsScrollState());
    });

    const onScroll = () => this.syncActiveLetterFromScroll();
    const onResize = () => this.syncTabsScrollState();
    const root = this.scrollRoot();
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    this.destroyRef.onDestroy(() => {
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    });
  }

  selectTab(id: string): void {
    this.selectedTab.set(id);
    if (this.restockMode()) this.selectedIds.set(new Set());
    this.activeLetter.set(null);
  }

  onSearch(value: string): void {
    this.searchQuery.set(value ?? '');
    this.activeLetter.set(null);
  }

  onSortMode(value: SortMode | null | undefined): void {
    const mode: SortMode = value === 'qty' ? 'qty' : 'name';
    this.sortMode.set(mode);
    this.activeLetter.set(null);
    try {
      localStorage.setItem(SORT_KEY, mode);
    } catch {
      // ignore
    }
  }

  onViewMode(value: ViewMode | null | undefined): void {
    const mode: ViewMode = value === 'list' ? 'list' : 'cards';
    this.viewMode.set(mode);
    this.activeLetter.set(null);
    try {
      localStorage.setItem(viewStorageKey(this.kind()), mode);
    } catch {
      // ignore
    }
  }

  scrollTabs(dir: -1 | 1): void {
    const el = this.tabsScroller()?.nativeElement;
    if (!el) return;
    const delta = Math.max(140, Math.round(el.clientWidth * 0.65)) * dir;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  }

  syncTabsScrollState(): void {
    const el = this.tabsScroller()?.nativeElement;
    if (!el) {
      this.tabsOverflow.set(false);
      this.tabsCanPrev.set(false);
      this.tabsCanNext.set(false);
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    const overflow = max > 4;
    this.tabsOverflow.set(overflow);
    this.tabsCanPrev.set(overflow && el.scrollLeft > 2);
    this.tabsCanNext.set(overflow && max - el.scrollLeft > 2);
  }

  jumpToLetter(letter: string): void {
    this.activeLetter.set(letter);
    const el = document.getElementById(`stock-letter-${letter}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onIndexPointer(event: PointerEvent): void {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const btn = target?.closest('.stock-index__letter') as HTMLElement | null;
    const letter = btn?.textContent?.trim();
    if (!letter) return;
    if (this.activeLetter() === letter) return;
    this.jumpToLetter(letter);
  }

  private syncActiveLetterFromScroll(): void {
    if (this.sortMode() !== 'name') {
      this.activeLetter.set(null);
      return;
    }
    const groups = this.letterGroups();
    if (!groups.length) {
      this.activeLetter.set(null);
      return;
    }
    const stickyOffset = 120;
    let current = groups[0].letter!;
    for (const g of groups) {
      const el = document.getElementById(`stock-letter-${g.letter}`);
      if (!el) continue;
      const top = el.getBoundingClientRect().top;
      if (top <= stickyOffset) current = g.letter!;
      else break;
    }
    this.activeLetter.set(current);
  }

  private scrollRoot(): HTMLElement {
    return (
      (document.querySelector('.mat-drawer-content') as HTMLElement | null) ??
      (document.scrollingElement as HTMLElement) ??
      document.documentElement
    );
  }

  canManage(): boolean {
    return hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      stockManagePermission(this.kind()),
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
    this.api.restock(shopId, this.kind(), ids).subscribe({
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
    const kind = this.kind();
    this.loading.set(true);
    this.api.listProducts(shopId, kind, this.includeInactive()).subscribe({
      next: (rows) => {
        this.products.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open(`No se pudo cargar el stock de ${stockKindLabel(kind)}`, 'OK', {
          duration: 3000,
        });
      },
    });
    this.api.listCategories(shopId, kind).subscribe({
      next: (cats) => this.categories.set(cats),
      error: () => this.categories.set([]),
    });
  }

  openCreate(): void {
    this.openDialog({ mode: 'create' });
  }

  openSendStock(): void {
    const shopId = this.shops.selectedShopId();
    const shop = this.shops.selectedShop();
    if (!shopId || !shop) return;
    if (!this.products().length) {
      this.snack.open('No hay productos para enviar', 'OK', { duration: 3000 });
      return;
    }
    this.dialog
      .open(StockShareDialogComponent, {
        width: 'min(440px, 96vw)',
        data: { shopId, shopName: shop.name, kind: this.kind() },
      })
      .afterClosed()
      .subscribe((res) => {
        if (!res || !res.ok) return;
        this.snack.open(
          `Notificación enviada a ${res.notified} administrador${res.notified === 1 ? '' : 'es'}`,
          'OK',
          { duration: 3500 },
        );
      });
  }

  shareStock(): void {
    const shop = this.shops.selectedShop();
    const products = this.products().filter((p) => p.active !== false);
    if (!shop || !products.length) {
      this.snack.open('No hay productos para compartir', 'OK', { duration: 3000 });
      return;
    }
    const { title, text } = this.buildShareText(shop.name, products);
    void this.shareNative(title, text);
  }

  private buildShareText(
    shopName: string,
    products: StockProduct[],
  ): { title: string; text: string } {
    const fmt = (v: number) =>
      Number(v).toLocaleString('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    const actor = this.auth.currentUser()?.fullName?.trim() || 'Alguien';
    const below = products.filter((p) => p.belowMinimum);
    const kindLabel = this.kindLabel();
    const title = `Stock de ${kindLabel} · ${shopName}`;
    const header = `${actor} compartió el stock de ${kindLabel} de ${shopName}`;
    const summary = `${products.length} producto${products.length === 1 ? '' : 's'}${
      below.length ? ` · ${below.length} bajo mínimo` : ''
    }`;
    const sorted = [...products].sort((a, b) => {
      const qtyDiff = Number(a.quantity) - Number(b.quantity);
      if (qtyDiff !== 0) return qtyDiff;
      const marginA = Number(a.quantity) - Number(a.minQuantity);
      const marginB = Number(b.quantity) - Number(b.minQuantity);
      if (marginA !== marginB) return marginA - marginB;
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    });
    const lines = sorted.map((p) => {
      const cat = p.categoryName ? ` (${p.categoryName})` : '';
      const low = p.belowMinimum ? ' ⚠' : '';
      return `• ${p.name}${cat}: ${fmt(p.quantity)} (mín. ${fmt(p.minQuantity)})${low}`;
    });
    return { title, text: [header, summary, '', ...lines].join('\n') };
  }

  private async shareNative(title: string, text: string): Promise<void> {
    const result = await shareText({ title, text });
    if (result === 'copied') {
      this.snack.open('Listado copiado al portapapeles', 'OK', { duration: 3000 });
      return;
    }
    if (result === 'failed') {
      this.snack.open('No se pudo copiar el listado', 'OK', { duration: 3500 });
    }
  }

  openEdit(row: StockProduct): void {
    this.openDialog({ mode: 'edit', product: row });
  }

  adjust(row: StockProduct, delta: 1 | -1): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage()) return;
    this.adjustingId.set(row.id);
    this.api.adjust(shopId, this.kind(), row.id, delta).subscribe({
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
        `¿Ocultar "${row.name}" del stock de ${this.kindLabel()}?`,
      );
      if (!ok) return;
      this.api.removeProduct(shopId, this.kind(), row.id).subscribe({
        next: () => {
          this.snack.open('Producto oculto', 'OK', { duration: 2500 });
          this.reload();
        },
        error: () => this.snack.open('No se pudo ocultar', 'OK', { duration: 3500 }),
      });
      return;
    }
    this.api.updateProduct(shopId, this.kind(), row.id, { active: true }).subscribe({
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
            kind: this.kind(),
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
