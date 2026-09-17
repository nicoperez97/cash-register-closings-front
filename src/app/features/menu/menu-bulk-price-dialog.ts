import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { formatMoney } from '../../shared/utils/money';

export type MenuBulkPriceMode = 'fixed' | 'percent';

export type MenuBulkPriceItem = {
  key: string;
  sectionName: string;
  name: string;
  price: number | null;
};

export type MenuBulkPriceDialogData = {
  items: MenuBulkPriceItem[];
  /** Keys premarcadas (selección del editor). */
  preselectedKeys?: string[];
};

export type MenuBulkPriceDialogResult = {
  mode: MenuBulkPriceMode;
  value: number;
  keys: string[];
};

export function applyMenuBulkPrice(
  current: number | null | undefined,
  mode: MenuBulkPriceMode,
  value: number,
): number | null {
  const v = Number(value);
  if (!Number.isFinite(v)) return current == null ? null : Number(current);
  if (mode === 'fixed') {
    return Math.max(0, Math.round(v));
  }
  const base = Number(current);
  if (!Number.isFinite(base) || base < 0) return null;
  return Math.max(0, Math.round(base * (1 + v / 100)));
}

function moneyLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return formatMoney(Number(n), { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

@Component({
  selector: 'app-menu-bulk-price-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>sell</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Ajustar precios</strong>
        <span>Elegí ítems y aplicá un monto fijo o un porcentaje</span>
      </span>
    </h2>

    <mat-dialog-content>
      <div class="mbp__mode" role="group" aria-label="Tipo de ajuste">
        <button
          type="button"
          class="mbp__chip"
          [class.mbp__chip--on]="mode() === 'fixed'"
          (click)="mode.set('fixed')"
        >
          Monto fijo
        </button>
        <button
          type="button"
          class="mbp__chip"
          [class.mbp__chip--on]="mode() === 'percent'"
          (click)="mode.set('percent')"
        >
          Porcentaje
        </button>
      </div>

      <label class="mbp__value">
        <span class="mbp__label">{{ mode() === 'fixed' ? 'Nuevo precio ($)' : 'Variación (%)' }}</span>
        <input
          type="number"
          [ngModel]="amount()"
          (ngModelChange)="onAmountChange($event)"
          name="bulkValue"
          [step]="mode() === 'fixed' ? 1 : 0.5"
          [placeholder]="mode() === 'fixed' ? 'ej. 12000' : 'ej. 10 o -5'"
        />
        <span class="mbp__hint">
          {{
            mode() === 'percent'
              ? 'Positivo sube, negativo baja (ej. 10 = +10%).'
              : 'Se aplica el mismo monto a todos los ítems marcados.'
          }}
        </span>
      </label>

      <label class="mbp__search">
        <mat-icon>search</mat-icon>
        <input
          type="search"
          [ngModel]="query()"
          (ngModelChange)="query.set($event ?? '')"
          name="bulkQuery"
          placeholder="Buscar ítem o sección…"
          autocomplete="off"
        />
      </label>

      <div class="mbp__bulk">
        <button type="button" mat-stroked-button (click)="selectFiltered(true)">
          Marcar filtrados
        </button>
        <button type="button" mat-stroked-button (click)="selectFiltered(false)">
          Desmarcar
        </button>
        <span class="mbp__summary">{{ selectedCount() }} seleccionado(s)</span>
      </div>

      @for (group of grouped(); track group.sectionName) {
        <article class="mbp__section">
          <header class="mbp__section-head">
            <button type="button" class="mbp__section-toggle" (click)="toggleSection(group.sectionName)">
              <mat-icon>{{ sectionOpen(group.sectionName) ? 'expand_more' : 'chevron_right' }}</mat-icon>
              <strong>{{ group.sectionName }}</strong>
              <span>{{ sectionSelected(group) }}/{{ group.items.length }}</span>
            </button>
            <div class="mbp__section-links">
              <button type="button" class="mbp__link" (click)="selectSection(group, true)">Todos</button>
              <button type="button" class="mbp__link" (click)="selectSection(group, false)">Ninguno</button>
            </div>
          </header>
          @if (sectionOpen(group.sectionName)) {
            @for (it of group.items; track it.key) {
              <label class="mbp__row">
                <input
                  type="checkbox"
                  [checked]="selected().has(it.key)"
                  (change)="toggleKey(it.key, $any($event.target).checked)"
                />
                <span class="mbp__row-name">{{ it.name || 'Sin nombre' }}</span>
                <span class="mbp__row-price">
                  {{ money(it.price) }}
                  @if (previewOf(it); as next) {
                    @if (next !== it.price) {
                      <span class="mbp__arrow">→</span>
                      <strong>{{ money(next) }}</strong>
                    }
                  }
                </span>
              </label>
            }
          }
        </article>
      } @empty {
        <p class="mbp__empty">No hay ítems para ajustar.</p>
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
    .mbp__mode {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0 0 0.85rem;
    }

    .mbp__chip {
      appearance: none;
      border: 1px solid var(--guy-border, #d7e0d9);
      background: #fff;
      color: var(--guy-navy, #003366);
      border-radius: 999px;
      padding: 0.45rem 0.95rem;
      font: inherit;
      font-size: 0.9rem;
      font-weight: 650;
      cursor: pointer;
      line-height: 1.25;
    }

    .mbp__chip--on {
      background: var(--guy-green, #2e7d32);
      border-color: var(--guy-green, #2e7d32);
      color: #fff;
    }

    .mbp__value {
      display: grid;
      gap: 0.3rem;
      margin: 0 0 0.85rem;
    }

    .mbp__label {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--guy-muted, #5f6f76);
    }

    .mbp__value input {
      font: inherit;
      font-size: 1rem;
      font-weight: 650;
      padding: 0.6rem 0.75rem;
      border-radius: 10px;
      border: 1px solid var(--guy-border, #d7e0d9);
      background: #fff;
      color: var(--guy-ink, #1b2a33);
      width: 100%;
      box-sizing: border-box;
    }

    .mbp__hint {
      font-size: 0.78rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.35;
    }

    .mbp__search {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 10px;
      padding: 0.2rem 0.65rem;
      background: #fff;
      margin: 0 0 0.65rem;
    }

    .mbp__search mat-icon {
      color: var(--guy-muted, #5f6f76);
      font-size: 1.15rem;
      width: 1.15rem;
      height: 1.15rem;
      flex-shrink: 0;
    }

    .mbp__search input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: 0;
      font: inherit;
      padding: 0.5rem 0;
      background: transparent;
    }

    .mbp__bulk {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.45rem;
      margin: 0 0 0.85rem;
    }

    .mbp__summary {
      font-size: 0.85rem;
      font-weight: 650;
      color: var(--guy-navy, #003366);
      margin-left: auto;
    }

    .mbp__section {
      border: 1px solid var(--guy-border, #e6ebf0);
      border-radius: 12px;
      background: #fff;
      margin: 0 0 0.55rem;
      flex-shrink: 0;
    }

    .mbp__section-head {
      display: grid;
      gap: 0.15rem;
      padding: 0.55rem 0.65rem 0.35rem;
      background: #f6f8f6;
      border-radius: 12px 12px 0 0;
    }

    .mbp__section-toggle {
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

    .mbp__section-toggle mat-icon {
      flex-shrink: 0;
    }

    .mbp__section-toggle strong {
      flex: 1;
      min-width: 0;
      font-size: 0.95rem;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .mbp__section-toggle span {
      flex-shrink: 0;
      font-size: 0.8rem;
      color: var(--guy-muted, #5f6f76);
    }

    .mbp__section-links {
      display: flex;
      gap: 0.75rem;
      padding: 0 0 0.25rem 1.85rem;
    }

    .mbp__link {
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

    .mbp__row {
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
      flex-shrink: 0;
    }

    .mbp__row-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--guy-ink, #1b2a33);
      font-size: 0.92rem;
      line-height: 1.3;
    }

    .mbp__row-price {
      font-size: 0.84rem;
      color: var(--guy-muted, #5f6f76);
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-variant-numeric: tabular-nums;
    }

    .mbp__arrow {
      opacity: 0.65;
    }

    .mbp__row-price strong {
      color: var(--guy-green, #2e7d32);
    }

    .mbp__empty {
      margin: 0.5rem 0 0;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }
  `,
})
export class MenuBulkPriceDialogComponent {
  readonly data = inject<MenuBulkPriceDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<MenuBulkPriceDialogComponent, MenuBulkPriceDialogResult | null>);

  readonly mode = signal<MenuBulkPriceMode>('percent');
  readonly amount = signal<number | null>(10);
  readonly query = signal('');

  private readonly selectedKeys = signal<Set<string>>(
    new Set(this.data.preselectedKeys?.length ? this.data.preselectedKeys : []),
  );
  private readonly openSections = signal<Set<string>>(
    new Set([this.data.items[0]?.sectionName || 'Sin sección']),
  );

  readonly selected = computed(() => this.selectedKeys());

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.data.items;
    return this.data.items.filter((it) => {
      const hay = `${it.sectionName} ${it.name}`.toLowerCase();
      return hay.includes(q);
    });
  });

  readonly grouped = computed(() => {
    const map = new Map<string, MenuBulkPriceItem[]>();
    for (const it of this.filtered()) {
      const sec = it.sectionName || 'Sin sección';
      const list = map.get(sec) ?? [];
      list.push(it);
      map.set(sec, list);
    }
    return [...map.entries()].map(([sectionName, items]) => ({ sectionName, items }));
  });

  readonly selectedCount = computed(() => this.selectedKeys().size);

  money(n: number | null | undefined): string {
    return moneyLabel(n);
  }

  onAmountChange(raw: unknown): void {
    if (raw === '' || raw == null) {
      this.amount.set(null);
      return;
    }
    const n = typeof raw === 'number' ? raw : Number(raw);
    this.amount.set(Number.isFinite(n) ? n : null);
  }

  previewOf(it: MenuBulkPriceItem): number | null {
    const v = Number(this.amount());
    if (!Number.isFinite(v) || !this.selectedKeys().has(it.key)) return null;
    return applyMenuBulkPrice(it.price, this.mode(), v);
  }

  sectionOpen(name: string): boolean {
    // Con búsqueda activa, mostrar resultados abiertos.
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

  sectionSelected(group: { items: MenuBulkPriceItem[] }): number {
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

  selectSection(group: { items: MenuBulkPriceItem[] }, on: boolean): void {
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
    const v = Number(this.amount());
    if (!Number.isFinite(v)) return false;
    if (this.mode() === 'fixed' && v < 0) return false;
    return this.selectedCount() > 0;
  }

  apply(): void {
    if (!this.canApply()) return;
    this.ref.close({
      mode: this.mode(),
      value: Number(this.amount()),
      keys: [...this.selectedKeys()],
    });
  }
}
