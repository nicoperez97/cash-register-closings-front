import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export type MenuAssignCategoryOption = {
  id: string;
  name: string;
};

export type MenuAssignCategoryItem = {
  key: string;
  sectionName: string;
  name: string;
  categoryId: string | null;
};

export type MenuAssignCategoriesDialogData = {
  categories: MenuAssignCategoryOption[];
  items: MenuAssignCategoryItem[];
};

export type MenuAssignCategoriesDialogResult = {
  /** null = quitar rubro */
  categoryId: string | null;
  keys: string[];
};

@Component({
  selector: 'app-menu-assign-categories-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>category</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Asignar rubro</strong>
        <span>Elegí un rubro y marcá los ítems</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="mac__label">Rubro a aplicar</p>
      <div class="mac__cats" role="radiogroup" aria-label="Rubro">
        <label class="mac__cat">
          <input
            type="radio"
            name="assignCategory"
            [checked]="picked() === null"
            (change)="picked.set(null)"
          />
          <span>Sin rubro</span>
        </label>
        @for (c of data.categories; track c.id) {
          <label class="mac__cat">
            <input
              type="radio"
              name="assignCategory"
              [checked]="picked() === c.id"
              (change)="picked.set(c.id)"
            />
            <span>{{ c.name }}</span>
          </label>
        } @empty {
          <p class="mac__empty">No hay rubros. Creá uno en la pestaña Rubros.</p>
        }
      </div>

      <label class="mac__search">
        <mat-icon>search</mat-icon>
        <input
          type="search"
          [ngModel]="query()"
          (ngModelChange)="query.set($event ?? '')"
          name="assignCategoryQuery"
          placeholder="Buscar ítem o sección…"
          autocomplete="off"
        />
      </label>

      <div class="mac__bulk">
        <button type="button" mat-stroked-button (click)="selectFiltered(true)">
          Marcar filtrados
        </button>
        <button type="button" mat-stroked-button (click)="selectFiltered(false)">
          Desmarcar
        </button>
        <span class="mac__summary">{{ selectedCount() }} seleccionado(s)</span>
      </div>

      @for (group of grouped(); track group.sectionName) {
        <article class="mac__section">
          <header class="mac__section-head">
            <button
              type="button"
              class="mac__section-toggle"
              (click)="toggleSection(group.sectionName)"
            >
              <mat-icon>{{ sectionOpen(group.sectionName) ? 'expand_more' : 'chevron_right' }}</mat-icon>
              <strong>{{ group.sectionName }}</strong>
              <span>{{ sectionSelected(group) }}/{{ group.items.length }}</span>
            </button>
            <div class="mac__section-links">
              <button type="button" class="mac__link" (click)="selectSection(group, true)">
                Todos
              </button>
              <button type="button" class="mac__link" (click)="selectSection(group, false)">
                Ninguno
              </button>
            </div>
          </header>
          @if (sectionOpen(group.sectionName)) {
            @for (it of group.items; track it.key) {
              <label class="mac__row">
                <input
                  type="checkbox"
                  [checked]="selected().has(it.key)"
                  (change)="toggleKey(it.key, $any($event.target).checked)"
                />
                <span class="mac__row-name">{{ it.name || 'Sin nombre' }}</span>
                <span class="mac__row-cat">{{ categoryLabel(it) }}</span>
              </label>
            }
          }
        </article>
      } @empty {
        <p class="mac__empty">No hay ítems para asignar.</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(null)">Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="!canApply()"
        (click)="apply()"
      >
        Aplicar ({{ selectedCount() }})
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .mac__label {
      margin: 0 0 0.35rem;
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--guy-muted, #5f6f76);
    }
    .mac__cats {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem 0.85rem;
      margin: 0 0 0.75rem;
      padding: 0.55rem 0.65rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 10px;
      background: #fff;
    }
    .mac__cat {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin: 0;
      cursor: pointer;
      font-size: 0.9rem;
      color: var(--guy-ink, #1b2a33);
    }
    .mac__search {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 10px;
      padding: 0.2rem 0.65rem;
      background: #fff;
      margin: 0 0 0.65rem;
    }
    .mac__search mat-icon {
      color: var(--guy-muted, #5f6f76);
      font-size: 1.15rem;
      width: 1.15rem;
      height: 1.15rem;
      flex-shrink: 0;
    }
    .mac__search input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: 0;
      font: inherit;
      padding: 0.5rem 0;
      background: transparent;
    }
    .mac__bulk {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.45rem;
      margin: 0 0 0.85rem;
    }
    .mac__summary {
      font-size: 0.85rem;
      font-weight: 650;
      color: var(--guy-navy, #003366);
      margin-left: auto;
    }
    .mac__section {
      border: 1px solid var(--guy-border, #e6ebf0);
      border-radius: 12px;
      background: #fff;
      margin: 0 0 0.55rem;
    }
    .mac__section-head {
      display: grid;
      gap: 0.15rem;
      padding: 0.55rem 0.65rem 0.35rem;
      background: #f6f8f6;
      border-radius: 12px 12px 0 0;
    }
    .mac__section-toggle {
      appearance: none;
      border: 0;
      background: transparent;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      width: 100%;
      padding: 0.15rem 0;
      font: inherit;
      color: var(--guy-navy, #003366);
      cursor: pointer;
      text-align: left;
      min-height: 2rem;
    }
    .mac__section-toggle mat-icon {
      flex-shrink: 0;
    }
    .mac__section-toggle strong {
      flex: 1;
      min-width: 0;
      font-size: 0.95rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mac__section-toggle span {
      flex-shrink: 0;
      font-size: 0.8rem;
      color: var(--guy-muted, #5f6f76);
    }
    .mac__section-links {
      display: flex;
      gap: 0.75rem;
      padding: 0 0 0.25rem 1.85rem;
    }
    .mac__link {
      appearance: none;
      border: 0;
      background: none;
      color: var(--guy-green, #2e7d32);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      padding: 0;
    }
    .mac__row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 0.55rem;
      align-items: center;
      margin: 0;
      padding: 0.55rem 0.75rem;
      border-top: 1px solid var(--guy-border, #e6ebf0);
      cursor: pointer;
      min-height: 2.5rem;
      box-sizing: border-box;
    }
    .mac__row-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--guy-ink, #1b2a33);
      font-size: 0.92rem;
    }
    .mac__row-cat {
      font-size: 0.78rem;
      color: var(--guy-muted, #5f6f76);
      white-space: nowrap;
      max-width: 12rem;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mac__empty {
      margin: 0.35rem 0 0;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }
  `,
})
export class MenuAssignCategoriesDialogComponent {
  readonly data = inject<MenuAssignCategoriesDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(
    MatDialogRef<MenuAssignCategoriesDialogComponent, MenuAssignCategoriesDialogResult | null>,
  );

  readonly query = signal('');
  /** null = sin rubro; string = id */
  readonly picked = signal<string | null>(
    this.data.categories.length === 1 ? this.data.categories[0].id : null,
  );
  private readonly selectedKeys = signal<Set<string>>(new Set());
  private readonly openSections = signal<Set<string>>(
    new Set([this.data.items[0]?.sectionName || 'Sin sección']),
  );

  private readonly categoryNameById = new Map<string, string>();

  readonly selected = computed(() => this.selectedKeys());
  readonly selectedCount = computed(() => this.selectedKeys().size);

  constructor() {
    for (const c of this.data.categories ?? []) {
      const id = String(c.id ?? '').trim();
      const name = String(c.name ?? '').trim();
      if (id && name) this.categoryNameById.set(id, name);
    }
  }

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.data.items;
    return this.data.items.filter((it) => {
      const hay = `${it.sectionName} ${it.name}`.toLowerCase();
      return hay.includes(q);
    });
  });

  readonly grouped = computed(() => {
    const map = new Map<string, MenuAssignCategoryItem[]>();
    for (const it of this.filtered()) {
      const sec = it.sectionName || 'Sin sección';
      const list = map.get(sec) ?? [];
      list.push(it);
      map.set(sec, list);
    }
    return [...map.entries()].map(([sectionName, items]) => ({ sectionName, items }));
  });

  categoryLabel(it: MenuAssignCategoryItem): string {
    const id = String(it.categoryId ?? '').trim();
    if (!id) return 'Sin rubro';
    return this.categoryNameById.get(id) || 'Rubro';
  }

  sectionOpen(name: string): boolean {
    if (this.query().trim()) return true;
    return this.openSections().has(name);
  }

  toggleSection(name: string): void {
    this.openSections.update((set) => {
      const next = new Set(set);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  sectionSelected(group: { items: MenuAssignCategoryItem[] }): number {
    const sel = this.selectedKeys();
    return group.items.filter((i) => sel.has(i.key)).length;
  }

  toggleKey(key: string, on: boolean): void {
    this.selectedKeys.update((set) => {
      const next = new Set(set);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  selectSection(group: { items: MenuAssignCategoryItem[] }, on: boolean): void {
    this.selectedKeys.update((set) => {
      const next = new Set(set);
      for (const it of group.items) {
        if (on) next.add(it.key);
        else next.delete(it.key);
      }
      return next;
    });
  }

  selectFiltered(on: boolean): void {
    this.selectedKeys.update((set) => {
      const next = new Set(set);
      for (const it of this.filtered()) {
        if (on) next.add(it.key);
        else next.delete(it.key);
      }
      return next;
    });
  }

  canApply(): boolean {
    return this.selectedCount() > 0;
  }

  apply(): void {
    if (!this.canApply()) return;
    this.ref.close({
      categoryId: this.picked(),
      keys: [...this.selectedKeys()],
    });
  }
}
