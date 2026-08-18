import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { startWith } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { SpinnerComponent } from '../../shared/components/spinner';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { formatIsoDateDisplay } from '../../core/shop/business-date';
import { usePageRefresh } from '../../core/page-refresh.service';
import { closingSourceKindLabel } from '../closings/closings-api.service';
import { LedgerAccount, MovementsApiService } from '../movements/movements-api.service';
import {
  PendingSettlement,
  SettlementHistoryGroup,
  SettlementsApiService,
} from './settlements-api.service';
import { SettlementsInboxService } from './settlements-inbox.service';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

type SettlementGroup = {
  name: string;
  kind: PendingSettlement['kind'];
  items: PendingSettlement[];
  total: number;
};

@Component({
  selector: 'app-settlements-page',
  imports: [
    PageHeaderComponent,
    SpinnerComponent,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  template: `
    <app-page-header title="Rendiciones" [subtitle]="shopLabel()" />

    @if (!shopId()) {
      <div class="panel-card guy-empty">
        <mat-icon>store</mat-icon>
        <div>
          <strong>Seleccioná un local</strong>
          <div class="small">Para ver los montos pendientes de rendir.</div>
        </div>
      </div>
    } @else {
      @if (loading()) {
        <div class="panel-card guy-loading" aria-live="polite" aria-busy="true">
          <app-spinner [size]="28" tone="accent" />
          <div>
            <strong>Cargando…</strong>
            <div class="small">Obteniendo rendiciones pendientes</div>
          </div>
        </div>
      } @else if (!rows().length) {
        <div class="panel-card guy-empty">
          <mat-icon>account_balance_wallet</mat-icon>
          <div>
            <strong>Nada pendiente</strong>
            <div class="small">
              Cuando un cierre tiene una cuenta aparte que rinde después (en efectivo o a una
              cuenta), el monto aparece acá agrupado por nombre.
            </div>
          </div>
        </div>
      } @else {
        <div class="settle-toolbar panel-card">
          <div class="settle-toolbar__select">
            <mat-checkbox
              [checked]="allSelected()"
              [indeterminate]="someSelected() && !allSelected()"
              (change)="toggleAll($event.checked)"
            >
              {{ selectedCount() }} seleccionado{{ selectedCount() === 1 ? '' : 's' }}
              · {{ money(selectedTotal()) }}
            </mat-checkbox>
          </div>
          @if (canSettle()) {
            <div class="settle-toolbar__pick">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Ingreso a la cuenta</mat-label>
                <mat-select [formControl]="accountIdCtrl">
                  <mat-option value="">— Elegir —</mat-option>
                  @for (acc of accountOptions(); track acc.id) {
                    <mat-option [value]="acc.id">{{ acc.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="!canConfirm() || settling()"
                (click)="confirmSettle()"
              >
                <mat-icon>south</mat-icon>
                Agregar como ingreso
              </button>
            </div>
          }
        </div>

        <div class="settle-groups">
          @for (group of groups(); track group.name) {
            <section class="settle-group">
              <header class="settle-group__head">
                <mat-checkbox
                  [checked]="groupAllSelected(group)"
                  [indeterminate]="groupSomeSelected(group) && !groupAllSelected(group)"
                  (change)="toggleGroup(group, $event.checked)"
                />
                <div class="settle-group__title">
                  <h2>{{ group.name }}</h2>
                  <p>
                    {{ kindLabel(group.kind) }}
                    · {{ group.items.length }} pendiente{{ group.items.length === 1 ? '' : 's' }}
                  </p>
                </div>
                <strong class="settle-group__total">{{ money(group.total) }}</strong>
              </header>
              <div class="settle-list">
                @for (row of group.items; track row.id) {
                  <article
                    class="panel-card settle-card"
                    [class.settle-card--selected]="isSelected(row.id)"
                    (click)="toggleSelect(row.id)"
                  >
                    <mat-checkbox
                      [checked]="isSelected(row.id)"
                      (click)="$event.stopPropagation()"
                      (change)="toggleSelect(row.id)"
                    />
                    <div class="settle-card__main">
                      <div>
                        <h3 class="settle-card__date">{{ formatDate(row.businessDate) }}</h3>
                        @if (row.lines.length > 1) {
                          <p class="settle-card__lines">{{ linesLabel(row) }}</p>
                        }
                        <a
                          class="settle-card__link"
                          [routerLink]="['/closings', row.closingId]"
                          (click)="$event.stopPropagation()"
                        >
                          Ver cierre
                          <mat-icon>open_in_new</mat-icon>
                        </a>
                      </div>
                      <strong class="settle-card__amount">{{ money(row.amount) }}</strong>
                    </div>
                  </article>
                }
              </div>
            </section>
          }
        </div>
      }

      @if (!loading()) {
        <section class="history" aria-label="Historial de rendiciones">
          <header class="history__head">
            <div>
              <p class="history__eyebrow">Cuentas aparte</p>
              <h2 class="history__title">Historial de rendiciones</h2>
              <p class="history__sub">Ingresos registrados al confirmar montos pendientes</p>
            </div>
          </header>
          @if (historyLoading()) {
            <div class="panel-card guy-loading" aria-live="polite" aria-busy="true">
              <app-spinner [size]="24" tone="accent" />
              <div>
                <strong>Cargando historial…</strong>
                <div class="small">Rendiciones confirmadas de este local</div>
              </div>
            </div>
          } @else if (!history().length) {
            <div class="panel-card guy-empty">
              <mat-icon>history</mat-icon>
              <div>
                <strong>Todavía no hay rendiciones</strong>
                <div class="small">Cuando confirmes pendientes, quedan acá con la cuenta destino.</div>
              </div>
            </div>
          } @else {
            <div class="settle-list">
              @for (group of history(); track group.id) {
                <article class="panel-card history-card">
                  <div class="history-card__main">
                    <div>
                      <h3 class="settle-card__date">{{ formatDateTime(group.settledAt) }}</h3>
                      <p class="history-card__who">
                        {{ group.settledByName }}
                        @if (group.accountName) {
                          <span> → {{ group.accountName }}</span>
                        }
                      </p>
                      <p class="history-card__meta">
                        {{ group.itemsCount }} monto{{ group.itemsCount === 1 ? '' : 's' }}
                      </p>
                    </div>
                    <strong class="settle-card__amount">{{ money(group.totalAmount) }}</strong>
                  </div>
                  <ul class="history-card__items">
                    @for (item of group.items; track item.id) {
                      <li>
                        <span>
                          {{ item.name }}
                          · {{ formatDate(item.businessDate) }}
                        </span>
                        <a [routerLink]="['/closings', item.closingId]">Ver cierre</a>
                        <strong>{{ money(item.amount) }}</strong>
                      </li>
                    }
                  </ul>
                </article>
              }
            </div>
          }
        </section>
      }
    }
  `,
  styles: [
    `
      .settle-toolbar {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        margin-bottom: 1rem;
      }
      .settle-toolbar__pick {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
      }
      .settle-toolbar__pick mat-form-field {
        min-width: 220px;
        flex: 1 1 220px;
      }
      .settle-groups {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
      }
      .settle-group__head {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        margin: 0 0 0.55rem;
      }
      .settle-group__title {
        flex: 1;
        min-width: 0;
      }
      .settle-group__title h2 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 800;
      }
      .settle-group__title p {
        margin: 0.1rem 0 0;
        font-size: 0.82rem;
        color: var(--guy-muted, #5a6b5e);
      }
      .settle-group__total {
        font-size: 1.05rem;
        white-space: nowrap;
      }
      .settle-list {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }
      .settle-card {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        cursor: pointer;
        transition: border-color 160ms ease, background 160ms ease;
      }
      .settle-card--selected {
        border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 45%, var(--guy-border, #d7e0d9));
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 8%, var(--guy-card, #fff));
      }
      .settle-card__main {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        min-width: 0;
      }
      .settle-card__date {
        margin: 0 0 0.2rem;
        font-size: 1.05rem;
      }
      .settle-card__lines {
        margin: 0 0 0.2rem;
        font-size: 0.82rem;
        color: var(--guy-muted, #5a6b5e);
      }
      .settle-card__link {
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
        font-size: 0.85rem;
        color: var(--guy-primary, #0b5cab);
        text-decoration: none;
      }
      .settle-card__link mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
      .settle-card__amount {
        font-size: 1.15rem;
        white-space: nowrap;
      }
      .guy-empty,
      .guy-loading {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1.25rem;
      }
      .guy-empty mat-icon {
        font-size: 2rem;
        width: 2rem;
        height: 2rem;
        color: var(--guy-muted, #5a6b5e);
      }
      .small {
        font-size: 0.85rem;
        color: var(--guy-muted, #5a6b5e);
      }
      .history {
        margin-top: 1.75rem;
      }
      .history__head {
        margin: 0 0 0.85rem;
      }
      .history__eyebrow {
        margin: 0 0 0.15rem;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--guy-primary, #0b5cab);
      }
      .history__title {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 800;
        color: var(--guy-navy, #1a2b22);
      }
      .history__sub {
        margin: 0.2rem 0 0;
        font-size: 0.9rem;
        color: var(--guy-muted, #5a6b5e);
      }
      .history-card {
        display: grid;
        gap: 0.75rem;
      }
      .history-card__main {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
      }
      .history-card__who {
        margin: 0.15rem 0 0;
        font-size: 0.95rem;
        font-weight: 650;
      }
      .history-card__meta {
        margin: 0.15rem 0 0;
        font-size: 0.82rem;
        color: var(--guy-muted, #5a6b5e);
      }
      .history-card__items {
        list-style: none;
        margin: 0;
        padding: 0.55rem 0 0;
        border-top: 1px solid var(--guy-border, #d7e0d9);
        display: grid;
        gap: 0.4rem;
      }
      .history-card__items li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 0.75rem;
        align-items: center;
        font-size: 0.88rem;
      }
      .history-card__items a {
        color: var(--guy-primary, #0b5cab);
        text-decoration: none;
        font-size: 0.82rem;
      }
    `,
  ],
})
export class SettlementsPage {
  private readonly api = inject(SettlementsApiService);
  private readonly movementsApi = inject(MovementsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly inbox = inject(SettlementsInboxService);

  readonly shopId = computed(() => this.shops.selectedShopId());
  readonly shopLabel = computed(() => {
    const shop = this.shops.selectedShop();
    return shop?.name ?? 'Montos pendientes de rendir';
  });
  readonly canSettle = computed(() => {
    const shopId = this.shopId();
    const user = this.auth.currentUser();
    return !!(shopId && user && hasShopPermission(user, shopId, 'closings.update'));
  });

  readonly loading = signal(true);
  readonly settling = signal(false);
  readonly rows = signal<PendingSettlement[]>([]);
  readonly history = signal<SettlementHistoryGroup[]>([]);
  readonly historyLoading = signal(false);
  readonly accounts = signal<LedgerAccount[]>([]);
  readonly selectedIds = signal<Set<string>>(new Set());

  readonly accountIdCtrl = new FormControl('', { nonNullable: true });
  private readonly selectedAccountId = toSignal(
    this.accountIdCtrl.valueChanges.pipe(startWith(this.accountIdCtrl.value)),
    { initialValue: '' },
  );

  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly someSelected = computed(() => this.selectedCount() > 0);
  readonly allSelected = computed(() => {
    const rows = this.rows();
    return rows.length > 0 && rows.every((r) => this.selectedIds().has(r.id));
  });
  readonly selectedTotal = computed(() =>
    this.rows()
      .filter((r) => this.selectedIds().has(r.id))
      .reduce((s, r) => s + (r.amount || 0), 0),
  );

  readonly groups = computed((): SettlementGroup[] => {
    const map = new Map<string, SettlementGroup>();
    for (const row of this.rows()) {
      const name = row.name.trim() || 'Cuenta';
      const existing = map.get(name);
      if (existing) {
        existing.items.push(row);
        existing.total += row.amount || 0;
        continue;
      }
      map.set(name, {
        name,
        kind: row.kind,
        items: [row],
        total: row.amount || 0,
      });
    }
    return [...map.values()];
  });

  readonly accountOptions = computed(() =>
    this.accounts().filter((a) => a.active && a.type !== 'SYSTEM'),
  );

  readonly canConfirm = computed(
    () => this.canSettle() && this.someSelected() && !!this.selectedAccountId(),
  );

  constructor() {
    usePageRefresh(() => this.reload());

    effect(() => {
      const shopId = this.shopId();
      if (!shopId) {
        this.rows.set([]);
        this.history.set([]);
        this.accounts.set([]);
        this.loading.set(false);
        return;
      }
      this.reload();
    });
  }

  money(value: number): string {
    return formatMoney(value);
  }

  linesLabel(row: PendingSettlement): string {
    return row.lines.map((v) => this.money(v)).join(' + ');
  }

  kindLabel(kind: PendingSettlement['kind']): string {
    return closingSourceKindLabel(kind);
  }

  formatDate(iso: string): string {
    return formatIsoDateDisplay(iso);
  }

  formatDateTime(iso: string): string {
    const raw = String(iso ?? '').trim();
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return new Intl.DateTimeFormat('es-AR', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  groupAllSelected(group: SettlementGroup): boolean {
    return group.items.length > 0 && group.items.every((r) => this.selectedIds().has(r.id));
  }

  groupSomeSelected(group: SettlementGroup): boolean {
    return group.items.some((r) => this.selectedIds().has(r.id));
  }

  toggleSelect(id: string): void {
    this.selectedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleGroup(group: SettlementGroup, checked: boolean): void {
    this.selectedIds.update((set) => {
      const next = new Set(set);
      for (const row of group.items) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  toggleAll(checked: boolean): void {
    if (!checked) {
      this.selectedIds.set(new Set());
      return;
    }
    this.selectedIds.set(new Set(this.rows().map((r) => r.id)));
  }

  reload(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.loading.set(true);
    this.historyLoading.set(true);
    this.selectedIds.set(new Set());
    this.api.listPending(shopId).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        this.inbox.refresh();
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar las rendiciones pendientes', 'OK', {
          duration: 3000,
        });
      },
    });
    this.api.listHistory(shopId).subscribe({
      next: (rows) => {
        this.history.set(rows);
        this.historyLoading.set(false);
      },
      error: () => {
        this.historyLoading.set(false);
        this.history.set([]);
      },
    });
    this.movementsApi.accounts(shopId).subscribe({
      next: (accounts) => this.accounts.set(accounts),
      error: () => undefined,
    });
  }

  confirmSettle(): void {
    const shopId = this.shopId();
    if (!shopId || !this.canConfirm()) return;
    const ids = [...this.selectedIds()];
    const accountId = this.accountIdCtrl.value;
    if (!accountId) {
      this.snack.open('Seleccioná la cuenta destino', 'OK', { duration: 3000 });
      return;
    }

    this.settling.set(true);
    this.api.settle(shopId, { ids, accountId }).subscribe({
      next: (res) => {
        this.settling.set(false);
        this.snack.open(
          res.settled === 1
            ? 'Rendición registrada como ingreso'
            : `${res.settled} rendiciones registradas como ingreso`,
          'OK',
          { duration: 2500 },
        );
        this.accountIdCtrl.setValue('');
        this.reload();
      },
      error: (err) => {
        this.settling.set(false);
        const msg =
          err?.error?.message ||
          (Array.isArray(err?.error?.message) ? err.error.message[0] : null) ||
          'No se pudo registrar la rendición';
        this.snack.open(String(msg), 'OK', { duration: 4000 });
      },
    });
  }
}
