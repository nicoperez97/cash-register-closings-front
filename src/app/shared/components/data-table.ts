import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort } from '@angular/material/sort';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  paginateClient,
} from '../utils/pagination';

export interface DataTableColumn {
  key: string;
  label: string;
  format?: (row: any) => string | number;
  /** When true, the column stays fixed on horizontal scroll (Material sticky). */
  sticky?: boolean;
  /** When false, header is not sortable. Defaults to true if table `sortable` is on. */
  sortable?: boolean;
}

@Component({
  selector: 'app-data-table',
  imports: [
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatCheckboxModule,
    MatPaginatorModule,
    MatSortModule,
  ],
  template: `
    <div class="data-table-shell">
      @if (showSearch()) {
        <div class="data-table-search-wrap">
          <mat-form-field appearance="outline" class="data-table-search" subscriptSizing="dynamic">
            <mat-label>{{ searchLabel() }}</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input
              matInput
              [ngModel]="search()"
              (ngModelChange)="search.set($event)"
              [placeholder]="searchPlaceholder()"
            />
            @if (search()) {
              <button mat-icon-button matSuffix type="button" aria-label="Limpiar" (click)="search.set('')">
                <mat-icon>close</mat-icon>
              </button>
            }
          </mat-form-field>
        </div>
      }

      <div class="guy-table-wrap data-table" [class.data-table--dense]="dense()">
        @if (!pagedRows().length) {
          <div class="guy-empty">
            <mat-icon>{{ filteredRows().length || rows().length ? 'search_off' : 'inbox' }}</mat-icon>
            <div>
              @if (filteredRows().length || rows().length) {
                <strong>Sin resultados</strong>
                <div class="small">Probá con otro término de búsqueda.</div>
              } @else {
                <strong>Sin registros todavía</strong>
                <div class="small">Usá el botón de alta para crear el primero.</div>
              }
            </div>
          </div>
        } @else {
          <div class="table-responsive data-table__desktop">
            <table
              mat-table
              matSort
              [matSortDisabled]="!sortable()"
              [dataSource]="pagedRows()"
              [matSortActive]="sortActive()"
              [matSortDirection]="sortDirection()"
              [matSortDisableClear]="false"
              (matSortChange)="onSort($event)"
              [class.w-100]="!dense()"
              [class.data-table__table--fit]="dense()"
              [class.data-table__table--sticky]="hasStickyColumns()"
              [class.data-table__table--dense]="dense()"
            >
              @if (selectable()) {
                <ng-container matColumnDef="select" [sticky]="stickySelect()">
                  <th mat-header-cell *matHeaderCellDef class="data-table__select-col">
                    <mat-checkbox
                      [checked]="allPageSelected()"
                      [indeterminate]="somePageSelected() && !allPageSelected()"
                      [aria-label]="'Seleccionar todos'"
                      (change)="toggleAllPage($event.checked)"
                      (click)="$event.stopPropagation()"
                    />
                  </th>
                  <td
                    mat-cell
                    *matCellDef="let row"
                    class="data-table__select-col"
                    (click)="$event.stopPropagation()"
                  >
                    <mat-checkbox
                      [checked]="isSelected(row)"
                      [aria-label]="'Seleccionar fila'"
                      (change)="toggleRow(row, $event.checked)"
                    />
                  </td>
                </ng-container>
              }
              @for (col of columns(); track col.key; let i = $index) {
                <ng-container [matColumnDef]="col.key" [sticky]="!!col.sticky">
                  <th
                    mat-header-cell
                    *matHeaderCellDef
                    [mat-sort-header]="col.key"
                    [disabled]="!columnSortable(col)"
                  >
                    {{ col.label }}
                  </th>
                  <td
                    mat-cell
                    *matCellDef="let row"
                    [class.data-table__primary]="i === 0"
                  >
                    {{ cellValue(row, col) }}
                  </td>
                </ng-container>
              }
              @if (showActions()) {
                <ng-container matColumnDef="actions" [sticky]="stickyActions()">
                  <th mat-header-cell *matHeaderCellDef class="data-table__actions-head">Acciones</th>
                  <td
                    mat-cell
                    *matCellDef="let row"
                    class="text-nowrap data-table__actions"
                    (click)="$event.stopPropagation()"
                  >
                    <button
                      mat-icon-button
                      type="button"
                      class="data-table__edit"
                      [matTooltip]="
                        !actionsEnabled()
                          ? 'Requiere conexión'
                          : !rowCanEdit(row)
                            ? editDisabledLabel()
                            : rowEditLabel(row)
                      "
                      [attr.aria-label]="rowEditLabel(row)"
                      [disabled]="!actionsEnabled() || !rowCanEdit(row)"
                      (click)="edit.emit(row)"
                    >
                      <mat-icon>{{ rowEditIcon(row) }}</mat-icon>
                    </button>
                    @if (rowCanDuplicate(row)) {
                      <button
                        mat-icon-button
                        type="button"
                        class="data-table__edit"
                        [matTooltip]="actionsEnabled() ? duplicateLabel() : 'Requiere conexión'"
                        [attr.aria-label]="duplicateLabel()"
                        [disabled]="!actionsEnabled()"
                        (click)="duplicate.emit(row)"
                      >
                        <mat-icon>{{ duplicateIcon() }}</mat-icon>
                      </button>
                    }
                    @if (rowCanRemove(row)) {
                      <button
                        mat-icon-button
                        type="button"
                        class="data-table__delete"
                        [matTooltip]="actionsEnabled() ? removeLabel() : 'Requiere conexión'"
                        [attr.aria-label]="removeLabel()"
                        [disabled]="!actionsEnabled()"
                        (click)="remove.emit(row)"
                      >
                        <mat-icon>{{ removeIcon() }}</mat-icon>
                      </button>
                    }
                  </td>
                </ng-container>
              }
              <tr mat-header-row *matHeaderRowDef="displayed()"></tr>
              <tr
                mat-row
                *matRowDef="let row; columns: displayed()"
                class="data-table__row"
                [class.data-table__row--clickable]="rowIsClickable(row)"
                [class.data-table__row--selected]="selectable() && isSelected(row)"
                (click)="onRowClick(row)"
              ></tr>
            </table>
          </div>

          <div class="data-table__mobile">
            @for (row of pagedRows(); track trackRow(row, $index)) {
              <article
                class="guy-entity-card data-card"
                [class.data-card--clickable]="rowIsClickable(row)"
                [class.data-card--selected]="selectable() && isSelected(row)"
                (click)="onRowClick(row)"
              >
                <div class="data-card__body">
                  @if (selectable()) {
                    <div class="data-card__select" (click)="$event.stopPropagation()">
                      <mat-checkbox
                        [checked]="isSelected(row)"
                        [aria-label]="'Seleccionar fila'"
                        (change)="toggleRow(row, $event.checked)"
                      />
                    </div>
                  }
                  @for (col of columns(); track col.key; let i = $index) {
                    @if (i === 0) {
                      <h3 class="guy-entity-card__title data-card__title">
                        {{ cellValue(row, col) }}
                      </h3>
                    } @else {
                      <div class="data-card__field">
                        <span class="data-card__label">{{ col.label }}</span>
                        <span class="data-card__value">{{ cellValue(row, col) }}</span>
                      </div>
                    }
                  }
                </div>
                @if (showActions()) {
                  <div class="guy-entity-card__actions data-card__actions" (click)="$event.stopPropagation()">
                    <button
                      mat-icon-button
                      type="button"
                      class="data-table__edit"
                      [matTooltip]="
                        !actionsEnabled()
                          ? 'Requiere conexión'
                          : !rowCanEdit(row)
                            ? editDisabledLabel()
                            : rowEditLabel(row)
                      "
                      [attr.aria-label]="rowEditLabel(row)"
                      [disabled]="!actionsEnabled() || !rowCanEdit(row)"
                      (click)="edit.emit(row)"
                    >
                      <mat-icon>{{ rowEditIcon(row) }}</mat-icon>
                    </button>
                    @if (rowCanDuplicate(row)) {
                      <button
                        mat-icon-button
                        type="button"
                        class="data-table__edit"
                        [matTooltip]="actionsEnabled() ? duplicateLabel() : 'Requiere conexión'"
                        [attr.aria-label]="duplicateLabel()"
                        [disabled]="!actionsEnabled()"
                        (click)="duplicate.emit(row)"
                      >
                        <mat-icon>{{ duplicateIcon() }}</mat-icon>
                      </button>
                    }
                    @if (rowCanRemove(row)) {
                      <button
                        mat-icon-button
                        type="button"
                        class="data-table__delete"
                        [matTooltip]="actionsEnabled() ? removeLabel() : 'Requiere conexión'"
                        [attr.aria-label]="removeLabel()"
                        [disabled]="!actionsEnabled()"
                        (click)="remove.emit(row)"
                      >
                        <mat-icon>{{ removeIcon() }}</mat-icon>
                      </button>
                    }
                  </div>
                }
              </article>
            }
          </div>
        }
      </div>

      @if (pagedRows().length && showPaginator() && paginatorLength() > 0) {
        <mat-paginator
          class="data-table__paginator"
          [class.data-table__paginator--dense]="dense()"
          [length]="paginatorLength()"
          [pageIndex]="pageIndex()"
          [pageSize]="pageSize()"
          [pageSizeOptions]="pageSizeOptions()"
          (page)="onPage($event)"
          showFirstLastButtons
        />
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .data-table-search-wrap {
        margin-bottom: 0.85rem;
        padding: 0.65rem 0.75rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 12px;
        border-left: 3px solid color-mix(in srgb, var(--guy-green, #2e7d32) 55%, transparent);
        background:
          linear-gradient(135deg, color-mix(in srgb, var(--guy-accent, #2e7d32) 6%, transparent), transparent 60%),
          var(--guy-search-bg, #fafcfb);
        animation: guy-fade-up var(--guy-dur-slow, 380ms) var(--guy-ease, cubic-bezier(0.22, 1, 0.36, 1))
          both;
      }

      .data-table__row {
        transition: background-color var(--guy-dur-fast, 140ms) ease;
      }

      .data-table__row--selected {
        background: color-mix(in srgb, var(--guy-green, #2e7d32) 8%, transparent);
      }

      .data-table-search {
        width: 100%;
        margin-bottom: 0;
      }

      .data-table__primary {
        font-weight: 700;
        color: var(--guy-navy, #003366);
        min-width: 11rem;
        max-width: 16rem;
        white-space: nowrap;
      }

      .data-table__row--clickable {
        cursor: pointer;
      }

      .data-table__select-col {
        width: 48px;
        padding-right: 0;
      }

      .data-table__actions-head {
        width: 1%;
        white-space: nowrap;
      }

      .data-table__table--sticky {
        min-width: 96rem;
      }

      .data-table__table--sticky .mat-mdc-header-cell.mat-table-sticky,
      .data-table__table--sticky .mat-mdc-cell.mat-table-sticky,
      .data-table__table--sticky .mat-mdc-header-cell.mat-mdc-table-sticky,
      .data-table__table--sticky .mat-mdc-cell.mat-mdc-table-sticky {
        background: var(--guy-table-sticky, #eef3f1) !important;
        z-index: 2;
      }

      .data-table__table--sticky .mat-mdc-header-cell.mat-table-sticky,
      .data-table__table--sticky .mat-mdc-header-cell.mat-mdc-table-sticky {
        background: var(--guy-table-sticky-header, #e4ece8) !important;
        z-index: 3;
      }

      .data-table__table--sticky .data-table__row--selected .mat-mdc-cell.mat-table-sticky,
      .data-table__table--sticky .data-table__row--selected .mat-mdc-cell.mat-mdc-table-sticky {
        background: color-mix(in srgb, var(--guy-green, #2e7d32) 16%, var(--guy-card, #fff)) !important;
      }

      .data-table__table--sticky .mat-mdc-table-sticky-border-elem-right {
        border-right: 1px solid color-mix(in srgb, var(--guy-navy, #003366) 18%, transparent);
        box-shadow:
          1px 0 0 color-mix(in srgb, var(--guy-green, #2e7d32) 35%, transparent),
          10px 0 18px -8px rgba(0, 51, 102, 0.28);
      }

      .data-table--dense .mat-mdc-header-row {
        height: 34px;
      }

      .data-table--dense .mat-mdc-header-cell {
        font-size: 0.65rem !important;
        letter-spacing: 0.04em;
        padding-top: 0.35rem !important;
        padding-bottom: 0.35rem !important;
        padding-left: 0.55rem !important;
        padding-right: 0.55rem !important;
      }

      .data-table--dense .mat-mdc-cell {
        font-size: 0.8rem;
        padding-top: 0.28rem !important;
        padding-bottom: 0.28rem !important;
        padding-left: 0.55rem !important;
        padding-right: 0.55rem !important;
      }

      .data-table--dense .data-table__primary {
        min-width: 0;
        max-width: none;
        font-size: 0.8rem;
      }

      .data-table--dense .data-table__select-col {
        width: 36px;
        padding-left: 0.35rem !important;
        padding-right: 0 !important;
      }

      .data-table--dense .data-table__paginator {
        margin-top: 0.25rem;
      }

      .data-table__table--fit {
        width: max-content;
        max-width: 100%;
      }

      .data-table__paginator--dense {
        margin-top: 0.25rem;

        ::ng-deep .mat-mdc-paginator-container {
          flex-wrap: wrap;
          justify-content: flex-start;
          min-height: 2.25rem;
          padding: 0.15rem 0;
          gap: 0.15rem;
        }

        ::ng-deep .mat-mdc-paginator-page-size {
          margin-right: 0.35rem;
        }

        ::ng-deep .mat-mdc-paginator-range-label {
          margin: 0 0.5rem 0 0;
        }
      }

      .data-table__actions {
        display: flex;
        align-items: center;
        gap: 0.1rem;
      }

      .data-table__edit {
        color: var(--guy-navy, #003366);

        mat-icon {
          color: var(--guy-navy, #003366);
        }
      }

      .data-table__delete {
        color: #c62828;

        mat-icon {
          color: #c62828;
        }

        &:hover {
          background: rgba(198, 40, 40, 0.1);
        }
      }

      .data-table__mobile {
        display: none;
      }

      @media (max-width: 720px) {
        .data-table {
          border: none;
          box-shadow: none;
          background: transparent;
          overflow: visible;
        }

        .data-table__desktop {
          display: none;
        }

        .data-table__mobile {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .data-card--clickable {
          cursor: pointer;

          &:active {
            background: var(--guy-green-soft, #eef6f0);
            transform: scale(0.995);
          }
        }

        .data-card--selected {
          border-color: color-mix(in srgb, var(--guy-green, #2e7d32) 45%, var(--guy-border, #d7e0d9));
          background: color-mix(in srgb, var(--guy-green, #2e7d32) 6%, var(--guy-card, #fff));
        }

        .data-card__select {
          margin-bottom: 0.35rem;
        }

        .data-card__field {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.75rem;
          padding: 0.35rem 0;
          border-bottom: 1px solid var(--guy-border, #eef3ef);

          &:last-child {
            border-bottom: none;
          }
        }

        .data-card__label {
          flex-shrink: 0;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--guy-muted, #5f6f76);
        }

        .data-card__value {
          text-align: right;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--guy-text, #2c3a40);
          word-break: break-word;
        }

        .data-card__actions {
          justify-content: flex-end;
        }
      }

      .data-table__paginator {
        margin-top: 0.5rem;
        background: transparent;
      }

      .mat-sort-header-container {
        justify-content: flex-start;
      }

      .mat-sort-header-arrow {
        color: var(--guy-navy, #003366);
      }
    `,
  ],
})
export class DataTableComponent {
  readonly columns = input<DataTableColumn[]>([]);
  readonly rows = input<any[]>([]);
  readonly showActions = input(true);
  /** Compact row padding/typography (e.g. dual base list). */
  readonly dense = input(false);
  /** Enable click-to-sort on column headers. */
  readonly sortable = input(false);
  /** When false, action buttons stay visible but disabled (e.g. offline). */
  readonly actionsEnabled = input(true);
  readonly showSearch = input(true);
  readonly showPaginator = input(true);
  /** When true, `rows` is already one page; parent owns paging via `total` + `page`. */
  readonly serverPaging = input(false);
  readonly total = input(0);
  readonly pageIndexInput = input(0, { alias: 'pageIndex' });
  readonly pageSizeInput = input(DEFAULT_PAGE_SIZE, { alias: 'pageSize' });
  readonly searchLabel = input('Buscar');
  readonly searchPlaceholder = input('Nombre u otros datos…');
  readonly editLabel = input('Editar');
  readonly editIcon = input('edit');
  readonly removeLabel = input('Borrar');
  readonly removeIcon = input('delete');
  readonly duplicateLabel = input('Duplicar');
  readonly duplicateIcon = input('content_copy');
  readonly editDisabledLabel = input('No disponible');
  readonly pageSizeOptions = input<number[]>([...PAGE_SIZE_OPTIONS]);
  readonly canEdit = input<(row: any) => boolean>();
  readonly canRemove = input<(row: any) => boolean>();
  readonly canDuplicate = input<(row: any) => boolean>();
  readonly editLabelFor = input<(row: any) => string>();
  readonly editIconFor = input<(row: any) => string>();
  /** Opt-in row selection via checkboxes. */
  readonly selectable = input(false);
  readonly selection = input<string[]>([]);
  readonly rowIdKey = input('id');
  readonly edit = output<any>();
  readonly remove = output<any>();
  readonly duplicate = output<any>();
  readonly page = output<PageEvent>();
  readonly selectionChange = output<string[]>();

  readonly search = signal('');
  readonly pageIndex = signal(0);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly sortActive = signal('');
  readonly sortDirection = signal<'asc' | 'desc' | ''>('');

  readonly filteredRows = computed(() => {
    const q = this.normalize(this.search());
    const rows = this.rows();
    if (!q || this.serverPaging()) return rows;
    return rows.filter((row) =>
      this.columns().some((col) => this.normalize(String(this.cellValue(row, col))).includes(q)),
    );
  });

  readonly sortedRows = computed(() => {
    const rows = this.filteredRows();
    const active = this.sortActive();
    const dir = this.sortDirection();
    if (!this.sortable() || !active || !dir) return rows;
    const col = this.columns().find((c) => c.key === active);
    if (!col || !this.columnSortable(col)) return rows;
    const factor = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => factor * this.compareValues(this.cellValue(a, col), this.cellValue(b, col)));
  });

  readonly pagedRows = computed(() => {
    if (this.serverPaging()) return this.sortedRows();
    return paginateClient(this.sortedRows(), this.pageIndex(), this.pageSize());
  });

  readonly paginatorLength = computed(() =>
    this.serverPaging() ? this.total() : this.filteredRows().length,
  );

  readonly displayed = computed(() => {
    const stickyKeys = this.columns().filter((c) => c.sticky).map((c) => c.key);
    const scrollKeys = this.columns().filter((c) => !c.sticky).map((c) => c.key);
    const hasSticky = stickyKeys.length > 0;
    const cols: string[] = [
      ...(this.selectable() ? ['select'] : []),
      ...(this.showActions() && hasSticky ? ['actions'] : []),
      ...stickyKeys,
      ...scrollKeys,
      ...(this.showActions() && !hasSticky ? ['actions'] : []),
    ];
    return cols;
  });

  readonly hasStickyColumns = computed(() => this.columns().some((c) => c.sticky));

  /** Keep checkbox aligned with sticky data columns while scrolling. */
  readonly stickySelect = computed(() => this.selectable() && this.hasStickyColumns());

  /** Keep actions sticky before the name column (not at the far right). */
  readonly stickyActions = computed(() => this.showActions() && this.hasStickyColumns());

  readonly selectedSet = computed(() => new Set(this.selection()));

  readonly allPageSelected = computed(() => {
    const page = this.pagedRows();
    if (!page.length) return false;
    const selected = this.selectedSet();
    return page.every((row) => selected.has(this.rowId(row)));
  });

  readonly somePageSelected = computed(() => {
    const page = this.pagedRows();
    const selected = this.selectedSet();
    return page.some((row) => selected.has(this.rowId(row)));
  });

  constructor() {
    effect(() => {
      this.search();
      if (!this.serverPaging()) this.pageIndex.set(0);
    });
    effect(() => {
      if (!this.serverPaging()) return;
      this.pageIndex.set(this.pageIndexInput());
      this.pageSize.set(this.pageSizeInput());
    });
  }

  onPage(ev: PageEvent) {
    this.pageIndex.set(ev.pageIndex);
    this.pageSize.set(ev.pageSize);
    this.page.emit(ev);
  }

  onSort(ev: Sort) {
    this.sortActive.set(ev.active || '');
    this.sortDirection.set((ev.direction as 'asc' | 'desc' | '') || '');
    if (!this.serverPaging()) this.pageIndex.set(0);
  }

  columnSortable(col: DataTableColumn): boolean {
    if (!this.sortable()) return false;
    return col.sortable !== false;
  }

  private compareValues(a: string | number, b: string | number): number {
    const aEmpty = a === '—' || a === '' || a == null;
    const bEmpty = b === '—' || b === '' || b == null;
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    const aNum = typeof a === 'number' ? a : Number(String(a).replace(',', '.'));
    const bNum = typeof b === 'number' ? b : Number(String(b).replace(',', '.'));
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && String(a).trim() !== '' && String(b).trim() !== '') {
      const aIsNum = typeof a === 'number' || /^-?\d+(\.\d+)?$/.test(String(a).trim());
      const bIsNum = typeof b === 'number' || /^-?\d+(\.\d+)?$/.test(String(b).trim());
      if (aIsNum && bIsNum) return aNum - bNum;
    }
    return this.normalize(String(a)).localeCompare(this.normalize(String(b)), 'es', { numeric: true });
  }

  rowCanEdit(row: any): boolean {
    return this.canEdit()?.(row) ?? true;
  }

  rowCanRemove(row: any): boolean {
    return this.canRemove()?.(row) ?? true;
  }

  rowCanDuplicate(row: any): boolean {
    return this.canDuplicate()?.(row) ?? false;
  }

  rowEditLabel(row: any): string {
    return this.editLabelFor()?.(row) ?? this.editLabel();
  }

  rowEditIcon(row: any): string {
    return this.editIconFor()?.(row) ?? this.editIcon();
  }

  cellValue(row: any, col: DataTableColumn): string | number {
    return col.format ? col.format(row) : (row[col.key] ?? '—');
  }

  trackRow(row: any, index: number): string | number {
    return row?.id ?? index;
  }

  rowId(row: any): string {
    return String(row?.[this.rowIdKey()] ?? '');
  }

  isSelected(row: any): boolean {
    return this.selectedSet().has(this.rowId(row));
  }

  rowIsClickable(row: any): boolean {
    if (this.selectable()) return true;
    return this.showActions() && this.actionsEnabled() && this.rowCanEdit(row);
  }

  onRowClick(row: any) {
    if (this.selectable()) {
      this.toggleRow(row, !this.isSelected(row));
      return;
    }
    if (this.showActions() && this.actionsEnabled() && this.rowCanEdit(row)) {
      this.edit.emit(row);
    }
  }

  toggleRow(row: any, checked: boolean) {
    const id = this.rowId(row);
    if (!id) return;
    const next = new Set(this.selection());
    if (checked) next.add(id);
    else next.delete(id);
    this.selectionChange.emit([...next]);
  }

  toggleAllPage(checked: boolean) {
    const next = new Set(this.selection());
    for (const row of this.pagedRows()) {
      const id = this.rowId(row);
      if (!id) continue;
      if (checked) next.add(id);
      else next.delete(id);
    }
    this.selectionChange.emit([...next]);
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }
}

