import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { formatMoney } from '../../shared/utils/money';
import { applyMenuBulkPrice, type MenuBulkPriceMode } from './menu-bulk-price-dialog';
import {
  accountPriceOf,
  formatAccountPriceRuleLabel,
  type MenuAccountPriceRule,
} from './menu-account-price.util';

export type MenuAccountPriceAccount = {
  id: string;
  name: string;
};

export type MenuAccountPricesItem = {
  key: string;
  sectionName: string;
  name: string;
  basePrice: number | null;
  accountPrices?: Array<{ accountId: string; price: number }> | null;
};

export type MenuAccountPricesDialogData = {
  accounts: MenuAccountPriceAccount[];
  items: MenuAccountPricesItem[];
  /** Último ajuste masivo por cuenta (fijo / sumar / %). */
  rules?: MenuAccountPriceRule[];
  preselectedKeys?: string[];
  /** Cuenta preseleccionada si hay una sola o la última usada. */
  initialAccountId?: string | null;
};

export type MenuAccountPricesDialogResult =
  | {
      action: 'apply';
      accountId: string;
      mode: MenuBulkPriceMode;
      value: number;
      keys: string[];
    }
  | { action: 'delete'; accountId: string };

function moneyLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return formatMoney(Number(n), { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

@Component({
  selector: 'app-menu-account-prices-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>account_balance_wallet</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Precios por cuenta</strong>
        <span>Elegí la cuenta y cargá precios (no se ven en la carta pública)</span>
      </span>
    </h2>

    <mat-dialog-content>
      @if (!data.accounts.length) {
        <p class="map__empty">
          No hay cuentas enlazadas a medios de pago de pedidos o comanda. Enlazá una cuenta en
          Configuración del local → Pedidos / Comanda.
        </p>
      } @else {
        @if (pricedAccounts().length) {
          <div class="map__rules" role="list" aria-label="Cuentas con precio">
            <div class="map__rules-title">Cuentas con precio</div>
            @for (row of pricedAccounts(); track row.accountId) {
              <div class="map__rule" role="listitem">
                <div class="map__rule-main">
                  <strong>{{ row.name }}</strong>
                  <span class="map__rule-label">{{ row.label }}</span>
                  <span class="map__muted">{{ row.itemCount }} ítem(s)</span>
                </div>
                <button
                  type="button"
                  mat-icon-button
                  class="map__rule-del"
                  (click)="deleteAccount(row.accountId, row.name)"
                  [attr.aria-label]="'Quitar precios de ' + row.name"
                  title="Quitar precios de esta cuenta"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </div>
        }

        <div class="map__accounts" role="group" aria-label="Cuenta">
          @for (a of data.accounts; track a.id) {
            <button
              type="button"
              class="map__chip"
              [class.map__chip--on]="accountId() === a.id"
              (click)="accountId.set(a.id)"
            >
              {{ a.name }}
            </button>
          }
        </div>

        <div class="map__mode" role="group" aria-label="Tipo de ajuste">
          <button
            type="button"
            class="map__chip"
            [class.map__chip--on]="mode() === 'fixed'"
            (click)="mode.set('fixed')"
          >
            Fijar precio
          </button>
          <button
            type="button"
            class="map__chip"
            [class.map__chip--on]="mode() === 'add'"
            (click)="mode.set('add')"
          >
            Sumar monto
          </button>
          <button
            type="button"
            class="map__chip"
            [class.map__chip--on]="mode() === 'percent'"
            (click)="mode.set('percent')"
          >
            Porcentaje
          </button>
        </div>

        <label class="map__value">
          <span class="map__label">{{ valueLabel() }}</span>
          <input
            type="number"
            [ngModel]="amount()"
            (ngModelChange)="onAmountChange($event)"
            name="accountBulkValue"
            [step]="mode() === 'percent' ? 0.5 : 1"
            [placeholder]="valuePlaceholder()"
          />
          <span class="map__hint">{{ valueHint() }}</span>
        </label>

        <label class="map__search">
          <mat-icon>search</mat-icon>
          <input
            type="search"
            [ngModel]="query()"
            (ngModelChange)="query.set($event ?? '')"
            name="accountBulkQuery"
            placeholder="Buscar ítem o sección…"
            autocomplete="off"
          />
        </label>

        <div class="map__bulk">
          <button type="button" mat-stroked-button (click)="selectFiltered(true)">
            Marcar filtrados
          </button>
          <button type="button" mat-stroked-button (click)="selectFiltered(false)">
            Desmarcar
          </button>
          <span class="map__summary">{{ selectedCount() }} seleccionado(s)</span>
        </div>

        @for (group of grouped(); track group.sectionName) {
          <article class="map__section">
            <header class="map__section-head">
              <button
                type="button"
                class="map__section-toggle"
                (click)="toggleSection(group.sectionName)"
              >
                <mat-icon>{{
                  sectionOpen(group.sectionName) ? 'expand_more' : 'chevron_right'
                }}</mat-icon>
                <strong>{{ group.sectionName }}</strong>
                <span>{{ sectionSelected(group) }}/{{ group.items.length }}</span>
              </button>
              <div class="map__section-links">
                <button type="button" class="map__link" (click)="selectSection(group, true)">
                  Todos
                </button>
                <button type="button" class="map__link" (click)="selectSection(group, false)">
                  Ninguno
                </button>
              </div>
            </header>
            @if (sectionOpen(group.sectionName)) {
              @for (it of group.items; track it.key) {
                <label class="map__row">
                  <input
                    type="checkbox"
                    [checked]="selected().has(it.key)"
                    (change)="toggleKey(it.key, $any($event.target).checked)"
                  />
                  <span class="map__row-name">{{ it.name || 'Sin nombre' }}</span>
                  <span class="map__row-price">
                    <span class="map__muted" title="Precio fijo">{{ money(it.basePrice) }}</span>
                    @if (currentAccountPrice(it); as cur) {
                      <span class="map__arrow">·</span>
                      <span title="Precio de esta cuenta">{{ money(cur) }}</span>
                    }
                    @if (previewOf(it); as next) {
                      @if (next !== currentAccountPrice(it)) {
                        <span class="map__arrow">→</span>
                        <strong>{{ money(next) }}</strong>
                      }
                    }
                  </span>
                </label>
              }
            }
          </article>
        } @empty {
          <p class="map__empty">No hay ítems para ajustar.</p>
        }
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
    .map__rules {
      display: grid;
      gap: 0.35rem;
      margin: 0 0 0.95rem;
      padding: 0.65rem 0.75rem;
      border: 1px solid var(--guy-border, #e6ebf0);
      border-radius: 12px;
      background: #f6f8f6;
    }
    .map__rules-title {
      font-size: 0.78rem;
      font-weight: 750;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
      margin-bottom: 0.15rem;
    }
    .map__rule {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      min-height: 2.35rem;
      padding: 0.15rem 0.15rem 0.15rem 0.35rem;
      border-radius: 10px;
      background: #fff;
      border: 1px solid var(--guy-border, #e6ebf0);
    }
    .map__rule-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.35rem 0.65rem;
      font-size: 0.9rem;
    }
    .map__rule-main strong {
      color: var(--guy-navy, #003366);
      font-weight: 700;
    }
    .map__rule-label {
      font-weight: 650;
      color: var(--guy-green, #2e7d32);
      font-variant-numeric: tabular-nums;
    }
    .map__rule-del {
      flex-shrink: 0;
      color: #b71c1c;
    }
    .map__accounts,
    .map__mode {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0 0 0.85rem;
    }
    .map__chip {
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
    .map__chip--on {
      background: var(--guy-green, #2e7d32);
      border-color: var(--guy-green, #2e7d32);
      color: #fff;
    }
    .map__value {
      display: grid;
      gap: 0.3rem;
      margin: 0 0 0.85rem;
    }
    .map__label {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--guy-muted, #5f6f76);
    }
    .map__value input {
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
    .map__hint {
      font-size: 0.78rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.35;
    }
    .map__search {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 10px;
      padding: 0.2rem 0.65rem;
      background: #fff;
      margin: 0 0 0.65rem;
    }
    .map__search mat-icon {
      color: var(--guy-muted, #5f6f76);
      font-size: 1.15rem;
      width: 1.15rem;
      height: 1.15rem;
      flex-shrink: 0;
    }
    .map__search input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: 0;
      font: inherit;
      padding: 0.5rem 0;
      background: transparent;
    }
    .map__bulk {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.45rem;
      margin: 0 0 0.85rem;
    }
    .map__summary {
      font-size: 0.85rem;
      font-weight: 650;
      color: var(--guy-navy, #003366);
      margin-left: auto;
    }
    .map__section {
      border: 1px solid var(--guy-border, #e6ebf0);
      border-radius: 12px;
      background: #fff;
      margin: 0 0 0.55rem;
    }
    .map__section-head {
      display: grid;
      gap: 0.15rem;
      padding: 0.55rem 0.65rem 0.35rem;
      background: #f6f8f6;
      border-radius: 12px 12px 0 0;
    }
    .map__section-toggle {
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
    .map__section-toggle mat-icon {
      flex-shrink: 0;
    }
    .map__section-toggle strong {
      flex: 1;
      min-width: 0;
      font-size: 0.95rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .map__section-toggle span {
      flex-shrink: 0;
      font-size: 0.8rem;
      color: var(--guy-muted, #5f6f76);
    }
    .map__section-links {
      display: flex;
      gap: 0.75rem;
      padding: 0 0 0.25rem 1.85rem;
    }
    .map__link {
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
    .map__row {
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
    .map__row-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.92rem;
    }
    .map__row-price {
      font-size: 0.84rem;
      color: var(--guy-muted, #5f6f76);
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-variant-numeric: tabular-nums;
    }
    .map__muted {
      opacity: 0.75;
    }
    .map__arrow {
      opacity: 0.65;
    }
    .map__row-price strong {
      color: var(--guy-green, #2e7d32);
    }
    .map__empty {
      margin: 0.5rem 0 0;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }
  `,
})
export class MenuAccountPricesDialogComponent {
  readonly data = inject<MenuAccountPricesDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(
    MatDialogRef<MenuAccountPricesDialogComponent, MenuAccountPricesDialogResult | null>,
  );

  readonly accountId = signal(
    this.data.initialAccountId || this.data.accounts[0]?.id || '',
  );
  readonly mode = signal<MenuBulkPriceMode>('fixed');
  readonly amount = signal<number | null>(null);
  readonly query = signal('');

  private readonly selectedKeys = signal<Set<string>>(
    new Set(this.data.preselectedKeys?.length ? this.data.preselectedKeys : []),
  );
  private readonly openSections = signal<Set<string>>(
    new Set([this.data.items[0]?.sectionName || 'Sin sección']),
  );

  readonly selected = computed(() => this.selectedKeys());
  readonly selectedCount = computed(() => this.selectedKeys().size);

  /** Cuentas que ya tienen precio en al menos un ítem (o regla guardada). */
  readonly pricedAccounts = computed(() => {
    const names = new Map(this.data.accounts.map((a) => [a.id, a.name]));
    const rules = new Map(
      (this.data.rules ?? []).map((r) => [String(r.accountId).trim(), r] as const),
    );
    const counts = new Map<string, number>();
    for (const it of this.data.items) {
      for (const row of it.accountPrices ?? []) {
        const id = String(row.accountId ?? '').trim();
        if (!id) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    const ids = new Set<string>([...counts.keys(), ...rules.keys()]);
    return [...ids]
      .map((accountId) => {
        const rule = rules.get(accountId);
        const itemCount = counts.get(accountId) ?? 0;
        return {
          accountId,
          name: names.get(accountId) || 'Cuenta',
          label: rule ? formatAccountPriceRuleLabel(rule) : 'Precio cargado',
          itemCount,
        };
      })
      .filter((r) => r.itemCount > 0 || rules.has(r.accountId))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  });

  valueLabel(): string {
    if (this.mode() === 'fixed') return 'Nuevo precio de cuenta ($)';
    if (this.mode() === 'add') return 'Monto a sumar ($)';
    return 'Variación (%)';
  }

  valuePlaceholder(): string {
    if (this.mode() === 'fixed') return 'ej. 13500';
    if (this.mode() === 'add') return 'ej. 500 o -200';
    return 'ej. 10 o -5';
  }

  valueHint(): string {
    if (this.mode() === 'fixed') {
      return 'Se guarda solo para esta cuenta. El precio fijo de la carta no cambia.';
    }
    if (this.mode() === 'add') {
      return 'Suma/resta sobre el precio de esta cuenta (si no hay, sobre el fijo).';
    }
    return 'Porcentaje sobre el precio de esta cuenta (si no hay, sobre el fijo).';
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
    const map = new Map<string, MenuAccountPricesItem[]>();
    for (const it of this.filtered()) {
      const sec = it.sectionName || 'Sin sección';
      const list = map.get(sec) ?? [];
      list.push(it);
      map.set(sec, list);
    }
    return [...map.entries()].map(([sectionName, items]) => ({ sectionName, items }));
  });

  money(n: number | null | undefined): string {
    return moneyLabel(n);
  }

  currentAccountPrice(it: MenuAccountPricesItem): number | null {
    return accountPriceOf(it, this.accountId());
  }

  /** Base para sumar/%: precio de cuenta si existe, si no el fijo. */
  private baseForAdjust(it: MenuAccountPricesItem): number | null {
    return this.currentAccountPrice(it) ?? it.basePrice;
  }

  onAmountChange(raw: unknown): void {
    if (raw === '' || raw == null) {
      this.amount.set(null);
      return;
    }
    const n = typeof raw === 'number' ? raw : Number(raw);
    this.amount.set(Number.isFinite(n) ? n : null);
  }

  previewOf(it: MenuAccountPricesItem): number | null {
    const v = Number(this.amount());
    if (!Number.isFinite(v) || !this.selectedKeys().has(it.key)) return null;
    return applyMenuBulkPrice(this.baseForAdjust(it), this.mode(), v);
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

  sectionSelected(group: { items: MenuAccountPricesItem[] }): number {
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

  selectSection(group: { items: MenuAccountPricesItem[] }, on: boolean): void {
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
    if (!this.accountId()) return false;
    const v = Number(this.amount());
    if (!Number.isFinite(v)) return false;
    if (this.mode() === 'fixed' && v < 0) return false;
    if (this.mode() === 'add' && v === 0) return false;
    return this.selectedCount() > 0;
  }

  apply(): void {
    if (!this.canApply()) return;
    this.ref.close({
      action: 'apply',
      accountId: this.accountId(),
      mode: this.mode(),
      value: Number(this.amount()),
      keys: [...this.selectedKeys()],
    });
  }

  deleteAccount(accountId: string, name: string): void {
    const id = String(accountId ?? '').trim();
    if (!id) return;
    if (!window.confirm(`¿Quitar todos los precios de «${name}» en esta carta?`)) return;
    this.ref.close({ action: 'delete', accountId: id });
  }
}
