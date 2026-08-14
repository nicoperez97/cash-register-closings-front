import { Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { usePageRefresh } from '../../core/page-refresh.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { SpinnerComponent } from '../../shared/components/spinner';
import { SalonApiService } from './salon-api.service';
import {
  formatSlots,
  formatTableInventory,
  nextRuleSize,
  remainingAfterJoining,
  shopRuleHint as formatShopRuleHint,
  suggestedRuleSizes,
} from './salon-combine.util';
import { SalonArea, SalonAreaRule, SalonRuleSlot, SalonTable } from './salon.models';

type SalonView = 'diagrama' | 'reglas';
type RuleRow = { key: string; partySize: number | ''; maxCount: number | '' };
type RuleDraft = Record<SalonArea, RuleRow[]>;

const AREAS: Array<{ id: SalonArea; label: string; hint: string; icon: string }> = [
  { id: 'INSIDE', label: 'Adentro', hint: 'Salón', icon: 'home' },
  { id: 'OUTSIDE', label: 'Afuera', hint: 'Vereda / patio', icon: 'deck' },
];

@Component({
  selector: 'app-salon-page',
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    BusyLabelComponent,
    PageHeaderComponent,
    SpinnerComponent,
  ],
  template: `
    <app-page-header
      eyebrow="Salón"
      [title]="view() === 'reglas' ? 'Reglas' : 'Diagrama'"
      [subtitle]="shops.selectedShop()?.name ?? 'Local'"
    />

    <nav class="salon-tabs" aria-label="Diagrama y reglas">
      <a
        routerLink="/salon/diagrama"
        class="salon-tabs__link"
        [class.salon-tabs__link--on]="view() === 'diagrama'"
      >
        <mat-icon>grid_view</mat-icon>
        Diagrama
      </a>
      <a
        routerLink="/salon/reglas"
        class="salon-tabs__link"
        [class.salon-tabs__link--on]="view() === 'reglas'"
      >
        <mat-icon>tune</mat-icon>
        Reglas
      </a>
    </nav>

    @if (loading()) {
      <div class="panel-card guy-empty guy-empty--loading" role="status" aria-live="polite">
        <app-spinner [size]="28" tone="accent" />
        <div>
          <strong>Cargando salón</strong>
          <p class="text-muted small mb-0">Mesas y reglas de este local</p>
        </div>
      </div>
    } @else if (view() === 'diagrama') {
      <p class="salon-lead text-muted">
        Mesas físicas por sector. Máximo 3 personas; según el lugar a veces solo entran 2.
        Esto no cambia reservas ni cupos.
      </p>
      <div class="salon-sectors">
        @for (sector of areas; track sector.id) {
          <section class="salon-sector panel-card" [attr.data-area]="sector.id">
            <header class="salon-sector__head">
              <span class="salon-sector__icon" aria-hidden="true">
                <mat-icon>{{ sector.icon }}</mat-icon>
              </span>
              <div>
                <h2>{{ sector.label }}</h2>
                <p>{{ inventoryLabel(sector.id) }}</p>
              </div>
              @if (canManage()) {
                <button
                  type="button"
                  class="salon-add"
                  [disabled]="addingArea() === sector.id"
                  (click)="addTable(sector.id)"
                >
                  <app-busy-label
                    [busy]="addingArea() === sector.id"
                    busyLabel="…"
                    [spinnerSize]="16"
                    spinnerTone="inherit"
                  >
                    <mat-icon>add</mat-icon>
                    Mesa
                  </app-busy-label>
                </button>
              }
            </header>

            <div class="salon-grid">
              @for (table of tablesOf(sector.id); track table.id) {
                <article class="salon-table" [class.salon-table--two]="table.seats === 2">
                  <div class="salon-table__top">
                    <input
                      class="salon-table__label"
                      [ngModel]="labelDrafts()[table.id] ?? table.label"
                      [disabled]="!canManage()"
                      (ngModelChange)="onLabelDraft(table.id, $event)"
                      (blur)="saveLabel(table)"
                      maxlength="8"
                      aria-label="Número de mesa"
                    />
                    @if (canManage()) {
                      <button
                        type="button"
                        class="salon-table__del"
                        aria-label="Quitar mesa"
                        (click)="removeTable(table)"
                      >
                        <mat-icon>close</mat-icon>
                      </button>
                    }
                  </div>
                  <div class="salon-table__seats" aria-hidden="true">
                    @for (dot of seatDots(table.seats); track $index) {
                      <span class="salon-dot"></span>
                    }
                  </div>
                  <p class="salon-table__cap">{{ table.seats }} pers.</p>
                  @if (canManage()) {
                    <div class="salon-table__toggle" role="group" [attr.aria-label]="'Cubiertos mesa ' + table.label">
                      <button
                        type="button"
                        [class.salon-table__opt--on]="table.seats === 2"
                        (click)="setSeats(table, 2)"
                      >
                        2
                      </button>
                      <button
                        type="button"
                        [class.salon-table__opt--on]="table.seats === 3"
                        (click)="setSeats(table, 3)"
                      >
                        3
                      </button>
                    </div>
                  }
                </article>
              } @empty {
                <p class="salon-empty">Todavía no hay mesas en este sector.</p>
              }
            </div>
          </section>
        }
      </div>
    } @else {
      <p class="salon-lead text-muted">
        Hasta cuántas mesas armadas de cada tamaño, según el local
        ({{ shopRuleHint('INSIDE') }} · {{ shopRuleHint('OUTSIDE') }}).
        Si falta uno, sumalo: por ejemplo 1 de 8. Tamaño y cantidad se pueden cambiar.
        Juntar mesas grandes descuenta de estas cantidades.
      </p>
      <div class="salon-sectors">
        @for (sector of areas; track sector.id) {
          <section class="salon-sector panel-card">
            <header class="salon-sector__head">
              <span class="salon-sector__icon" aria-hidden="true">
                <mat-icon>{{ sector.icon }}</mat-icon>
              </span>
              <div>
                <h2>{{ sector.label }}</h2>
                <p>{{ sector.hint }} · {{ shopRuleHint(sector.id) }} · {{ inventoryLabel(sector.id) }}</p>
              </div>
              @if (canManage()) {
                <button
                  type="button"
                  class="salon-save"
                  [disabled]="savingArea() === sector.id || !rulesDirty(sector.id)"
                  (click)="saveRules(sector.id)"
                >
                  <app-busy-label
                    [busy]="savingArea() === sector.id"
                    busyLabel="Guardando…"
                    [spinnerSize]="16"
                    spinnerTone="on-primary"
                  >
                    Guardar
                  </app-busy-label>
                </button>
              }
            </header>

            <div class="salon-rules">
              @for (row of rulesOf(sector.id); track row.key) {
                <label class="salon-num">
                  <span>de</span>
                  <input
                    class="salon-num__size"
                    type="number"
                    min="2"
                    max="20"
                    inputmode="numeric"
                    [ngModel]="row.partySize"
                    (ngModelChange)="setRowSize(sector.id, row.key, $event)"
                    [disabled]="!canManage()"
                    placeholder="8"
                    [attr.aria-label]="'Personas por mesa ' + sector.label"
                  />
                  <input
                    class="salon-num__count"
                    type="number"
                    min="0"
                    max="99"
                    inputmode="numeric"
                    [ngModel]="row.maxCount"
                    (ngModelChange)="setRowCount(sector.id, row.key, $event)"
                    [disabled]="!canManage()"
                    placeholder="0"
                    [attr.aria-label]="'Cantidad de mesas de ' + (row.partySize || '?')"
                  />
                  @if (canManage()) {
                    <button
                      type="button"
                      class="salon-num__del"
                      aria-label="Quitar tamaño"
                      (click)="removeRuleRow(sector.id, row.key)"
                    >
                      <mat-icon>close</mat-icon>
                    </button>
                  }
                </label>
              }
              @if (canManage()) {
                <button type="button" class="salon-num-add" (click)="addRuleRow(sector.id)">
                  <mat-icon>add</mat-icon>
                  tamaño
                </button>
              }
            </div>

            <p class="salon-preview">
              @if (joinHint(sector.id); as hint) {
                {{ hint }}
              } @else {
                Cargá cantidades para ver cómo queda al armar una mesa más grande.
              }
            </p>
          </section>
        }
      </div>
    }
  `,
  styleUrl: './salon-page.scss',
})
export class SalonPage {
  private readonly api = inject(SalonApiService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(ConfirmDialogService);
  readonly shops = inject(ShopContextService);
  private readonly router = inject(Router);

  readonly areas = AREAS;
  readonly loading = signal(true);
  readonly tables = signal<SalonTable[]>([]);
  readonly savedRules = signal<SalonAreaRule[]>([]);
  readonly rulesDraft = signal<RuleDraft>({ INSIDE: [], OUTSIDE: [] });
  readonly addingArea = signal<SalonArea | null>(null);
  readonly savingArea = signal<SalonArea | null>(null);
  readonly labelDrafts = signal<Record<string, string>>({});
  private rowSeq = 0;

  readonly view = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.parseView()),
      startWith(this.parseView()),
    ),
    { requireSync: true },
  );

  constructor() {
    usePageRefresh(() => this.load());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      untracked(() => {
        if (shopId) this.load();
      });
    });
  }

  canManage(): boolean {
    const shopId = this.shops.selectedShopId();
    return hasShopPermission(this.auth.currentUser(), shopId, 'reservations.manage');
  }

  tablesOf(area: SalonArea): SalonTable[] {
    return this.tables().filter((t) => t.area === area);
  }

  inventoryLabel(area: SalonArea): string {
    return formatTableInventory(this.tablesOf(area).map((t) => t.seats));
  }

  seatDots(seats: number): number[] {
    return Array.from({ length: seats }, (_, i) => i);
  }

  shopRuleHint(area: SalonArea): string {
    return formatShopRuleHint(area, this.shops.selectedShop());
  }

  rulesOf(area: SalonArea): RuleRow[] {
    return this.rulesDraft()[area];
  }

  setRowSize(area: SalonArea, key: string, raw: string | number): void {
    const text = String(raw ?? '').trim();
    const partySize: number | '' =
      text === '' ? '' : Math.max(2, Math.min(20, Math.round(Number(text)) || 2));
    this.patchRow(area, key, { partySize });
  }

  setRowCount(area: SalonArea, key: string, raw: string | number): void {
    const text = String(raw ?? '').trim();
    const maxCount: number | '' =
      text === '' ? '' : Math.max(0, Math.min(99, Math.round(Number(text)) || 0));
    this.patchRow(area, key, { maxCount });
  }

  addRuleRow(area: SalonArea): void {
    const existing = this.rulesDraft()[area]
      .map((r) => Number(r.partySize))
      .filter((n) => Number.isFinite(n) && n >= 2);
    const partySize = nextRuleSize(existing);
    this.rulesDraft.update((draft) => ({
      ...draft,
      [area]: [...draft[area], { key: this.nextRowKey(), partySize, maxCount: '' }],
    }));
  }

  removeRuleRow(area: SalonArea, key: string): void {
    this.rulesDraft.update((draft) => ({
      ...draft,
      [area]: draft[area].filter((r) => r.key !== key),
    }));
  }

  rulesDirty(area: SalonArea): boolean {
    return JSON.stringify(this.slotsFromDraft(area)) !== JSON.stringify(this.slotsFromSaved(area));
  }

  joinHint(area: SalonArea): string | null {
    const slots = this.slotsFromDraft(area);
    if (!slots.length) return null;
    const joinSize =
      slots.map((s) => s.partySize).find((n) => n >= 6) ??
      (Math.max(...slots.map((s) => s.partySize)) > 3
        ? Math.max(...slots.map((s) => s.partySize))
        : 6);
    const pool = slots.filter((s) => s.partySize < joinSize);
    const left = pool.length ? remainingAfterJoining(pool, joinSize, 1) : null;
    if (!left) {
      return `Hasta ${formatSlots(slots)}.`;
    }
    return `Hasta ${formatSlots(slots)}. Si armás 1 de ${joinSize}, quedan ${formatSlots(left)}.`;
  }

  onLabelDraft(id: string, value: string): void {
    this.labelDrafts.update((m) => ({ ...m, [id]: value }));
  }

  addTable(area: SalonArea): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.addingArea()) return;
    this.addingArea.set(area);
    this.api.createTable(shopId, { area, seats: 2 }).subscribe({
      next: (row) => {
        this.tables.update((list) => [...list, row]);
        this.addingArea.set(null);
      },
      error: (err) => {
        this.addingArea.set(null);
        this.fail(err, 'No se pudo agregar la mesa');
      },
    });
  }

  setSeats(table: SalonTable, seats: 2 | 3): void {
    if (!this.canManage() || table.seats === seats) return;
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.tables.update((list) => list.map((t) => (t.id === table.id ? { ...t, seats } : t)));
    this.api.updateTable(shopId, table.id, { seats }).subscribe({
      error: (err) => {
        this.fail(err, 'No se pudieron guardar los cubiertos');
        void this.load();
      },
    });
  }

  saveLabel(table: SalonTable): void {
    const shopId = this.shops.selectedShopId();
    const next = (this.labelDrafts()[table.id] ?? table.label).trim();
    if (!shopId) return;
    if (!next) {
      this.labelDrafts.update((m) => {
        const copy = { ...m };
        delete copy[table.id];
        return copy;
      });
      return;
    }
    if (next === table.label) return;
    this.api.updateTable(shopId, table.id, { label: next }).subscribe({
      next: (row) => {
        this.tables.update((list) => list.map((t) => (t.id === row.id ? row : t)));
        this.labelDrafts.update((m) => {
          const copy = { ...m };
          delete copy[table.id];
          return copy;
        });
      },
      error: (err) => this.fail(err, 'No se pudo guardar el número de mesa'),
    });
  }

  async removeTable(table: SalonTable): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const ok = await this.confirm.confirm(
      'Quitar mesa',
      `¿Sacar la mesa ${table.label || ''} de ${table.area === 'OUTSIDE' ? 'afuera' : 'adentro'}?`,
      { confirmLabel: 'Quitar', icon: 'chair' },
    );
    if (!ok) return;
    this.api.removeTable(shopId, table.id).subscribe({
      next: () => this.tables.update((list) => list.filter((t) => t.id !== table.id)),
      error: (err) => this.fail(err, 'No se pudo quitar la mesa'),
    });
  }

  saveRules(area: SalonArea): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.savingArea()) return;
    const slots = this.slotsFromDraft(area);
    const sizes = slots.map((s) => s.partySize);
    if (new Set(sizes).size !== sizes.length) {
      this.snack.open('Hay dos reglas con el mismo tamaño de mesa', 'OK', { duration: 3200 });
      return;
    }
    this.savingArea.set(area);
    this.api.replaceRules(shopId, area, slots).subscribe({
      next: (rows) => {
        this.savedRules.update((list) => [...list.filter((r) => r.area !== area), ...rows]);
        this.rulesDraft.update((draft) => ({
          ...draft,
          [area]: this.rowsForArea(area, rows),
        }));
        this.savingArea.set(null);
        this.snack.open('Reglas guardadas', 'OK', { duration: 2200 });
      },
      error: (err) => {
        this.savingArea.set(null);
        this.fail(err, 'No se pudieron guardar las reglas');
      },
    });
  }

  private parseView(): SalonView {
    return this.router.url.includes('/salon/reglas') ? 'reglas' : 'diagrama';
  }

  private slotsFromDraft(area: SalonArea): SalonRuleSlot[] {
    return this.rulesDraft()[area]
      .map((r) => ({
        partySize: r.partySize === '' ? 0 : Number(r.partySize),
        maxCount: r.maxCount === '' ? 0 : Number(r.maxCount),
      }))
      .filter((s) => s.partySize >= 2 && s.maxCount > 0)
      .sort((a, b) => a.partySize - b.partySize);
  }

  private slotsFromSaved(area: SalonArea): SalonRuleSlot[] {
    return this.savedRules()
      .filter((r) => r.area === area && r.maxCount > 0)
      .map((r) => ({ partySize: r.partySize, maxCount: r.maxCount }))
      .sort((a, b) => a.partySize - b.partySize);
  }

  private load(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.getFloor(shopId).subscribe({
      next: (floor) => {
        this.tables.set(floor.tables);
        this.savedRules.set(floor.rules);
        this.rulesDraft.set({
          INSIDE: this.rowsForArea('INSIDE', floor.rules),
          OUTSIDE: this.rowsForArea('OUTSIDE', floor.rules),
        });
        this.labelDrafts.set({});
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.fail(err, 'No se pudo cargar el salón');
      },
    });
  }

  private rowsForArea(area: SalonArea, rules: SalonAreaRule[]): RuleRow[] {
    const saved = rules.filter((r) => r.area === area);
    const counts = new Map(saved.map((r) => [r.partySize, r.maxCount]));
    const sizes = new Set<number>([
      ...suggestedRuleSizes(area, this.shops.selectedShop()),
      ...saved.map((r) => r.partySize),
    ]);
    return [...sizes]
      .sort((a, b) => a - b)
      .map((partySize) => ({
        key: this.nextRowKey(),
        partySize,
        maxCount: counts.get(partySize) ?? '',
      }));
  }

  private patchRow(area: SalonArea, key: string, patch: Partial<RuleRow>): void {
    this.rulesDraft.update((draft) => ({
      ...draft,
      [area]: draft[area].map((r) => (r.key === key ? { ...r, ...patch } : r)),
    }));
  }

  private nextRowKey(): string {
    this.rowSeq += 1;
    return `r${this.rowSeq}`;
  }

  private fail(err: { error?: { message?: string | string[] } }, fallback: string): void {
    const raw = err?.error?.message;
    const msg = Array.isArray(raw) ? raw[0] : raw;
    this.snack.open(msg || fallback, 'OK', { duration: 3600 });
  }
}
