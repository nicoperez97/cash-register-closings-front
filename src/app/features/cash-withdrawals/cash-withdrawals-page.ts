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
import {
  ClosingsApiService,
  ShopUserAccountOption,
  ShopUserOption,
} from '../closings/closings-api.service';
import {
  CashWithdrawalsApiService,
  PendingCashWithdrawal,
} from './cash-withdrawals-api.service';
import { CashWithdrawalsInboxService } from './cash-withdrawals-inbox.service';
import { isUserVisible } from '../../shared/user-visibility';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

@Component({
  selector: 'app-cash-withdrawals-page',
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
    <app-page-header
      title="A Retirar"
      [subtitle]="shopLabel()"
    />

    @if (!shopId()) {
      <div class="panel-card guy-empty">
        <mat-icon>store</mat-icon>
        <div>
          <strong>Seleccioná un local</strong>
          <div class="small">Para ver los retiros pendientes de efectivo.</div>
        </div>
      </div>
    } @else if (loading()) {
      <div class="panel-card guy-loading" aria-live="polite" aria-busy="true">
        <app-spinner [size]="28" tone="accent" />
        <div>
          <strong>Cargando…</strong>
          <div class="small">Obteniendo retiros pendientes</div>
        </div>
      </div>
    } @else if (!rows().length) {
      <div class="panel-card guy-empty">
        <mat-icon>payments</mat-icon>
        <div>
          <strong>Nada pendiente</strong>
          <div class="small">
            Cuando un cierre se guarda sin quién se lleva el efectivo y hay monto a retirar
            (efectivo − lo dejado en caja − egresos), aparece acá.
          </div>
        </div>
      </div>
    } @else {
      <div class="withdrawals-toolbar panel-card">
        <div class="withdrawals-toolbar__select">
          <mat-checkbox
            [checked]="allSelected()"
            [indeterminate]="someSelected() && !allSelected()"
            (change)="toggleAll($event.checked)"
          >
            {{ selectedCount() }} seleccionado{{ selectedCount() === 1 ? '' : 's' }}
            · {{ money(selectedTotal()) }}
          </mat-checkbox>
        </div>
        @if (canPick()) {
          <div class="withdrawals-toolbar__pick">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Quién se lo lleva</mat-label>
              <mat-select [formControl]="userIdCtrl" (selectionChange)="onUserChange($event.value)">
                <mat-option value="">— Elegir —</mat-option>
                @for (u of withdrawUsers(); track u.id) {
                  <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            @if (needsAccountPick()) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Cuenta destino</mat-label>
                <mat-select [formControl]="accountIdCtrl">
                  @for (acc of accountOptions(); track acc.id) {
                    <mat-option [value]="acc.id">{{ acc.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            } @else if (accountHint()) {
              <p class="withdrawals-toolbar__hint">{{ accountHint() }}</p>
            }
            <button
              mat-flat-button
              color="primary"
              type="button"
              [disabled]="!canConfirm() || picking()"
              (click)="confirmPick()"
            >
              <mat-icon>check</mat-icon>
              Confirmar retiro
            </button>
          </div>
        }
      </div>

      <div class="withdrawals-list">
        @for (row of rows(); track row.id) {
          <article
            class="panel-card withdrawal-card"
            [class.withdrawal-card--selected]="isSelected(row.id)"
            (click)="toggleSelect(row.id)"
          >
            <mat-checkbox
              [checked]="isSelected(row.id)"
              (click)="$event.stopPropagation()"
              (change)="toggleSelect(row.id)"
            />
            <div class="withdrawal-card__main">
              <div>
                <h3 class="withdrawal-card__date">{{ formatDate(row.businessDate) }}</h3>
                <a
                  class="withdrawal-card__link"
                  [routerLink]="['/closings', row.closingId]"
                  (click)="$event.stopPropagation()"
                >
                  Ver cierre
                  <mat-icon>open_in_new</mat-icon>
                </a>
              </div>
              <strong class="withdrawal-card__amount">{{ money(row.amount) }}</strong>
            </div>
          </article>
        }
      </div>
    }
  `,
  styles: [
    `
      .withdrawals-toolbar {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        margin-bottom: 1rem;
      }
      .withdrawals-toolbar__pick {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
      }
      .withdrawals-toolbar__pick mat-form-field {
        min-width: 200px;
        flex: 1 1 200px;
      }
      .withdrawals-toolbar__hint {
        margin: 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #5a6b5e);
        flex: 1 1 180px;
      }
      .withdrawals-list {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }
      .withdrawal-card {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        cursor: pointer;
        transition: border-color 160ms ease, background 160ms ease;
      }
      .withdrawal-card--selected {
        border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 45%, var(--guy-border, #d7e0d9));
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 8%, var(--guy-card, #fff));
      }
      .withdrawal-card__main {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        min-width: 0;
      }
      .withdrawal-card__date {
        margin: 0 0 0.2rem;
        font-size: 1.05rem;
      }
      .withdrawal-card__link {
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
        font-size: 0.85rem;
        color: var(--guy-primary, #0b5cab);
        text-decoration: none;
      }
      .withdrawal-card__link mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
      .withdrawal-card__amount {
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
    `,
  ],
})
export class CashWithdrawalsPage {
  private readonly api = inject(CashWithdrawalsApiService);
  private readonly closingsApi = inject(ClosingsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly inbox = inject(CashWithdrawalsInboxService);

  readonly shopId = computed(() => this.shops.selectedShopId());
  readonly shopLabel = computed(() => {
    const shop = this.shops.selectedShop();
    return shop?.name ?? 'Retiros de efectivo pendientes';
  });
  readonly canPick = computed(() => {
    const shopId = this.shopId();
    const user = this.auth.currentUser();
    return !!(shopId && user && hasShopPermission(user, shopId, 'closings.update'));
  });

  readonly loading = signal(true);
  readonly picking = signal(false);
  readonly rows = signal<PendingCashWithdrawal[]>([]);
  readonly users = signal<ShopUserOption[]>([]);
  readonly selectedIds = signal<Set<string>>(new Set());

  readonly userIdCtrl = new FormControl('', { nonNullable: true });
  readonly accountIdCtrl = new FormControl('', { nonNullable: true });
  private readonly selectedUserId = toSignal(
    this.userIdCtrl.valueChanges.pipe(startWith(this.userIdCtrl.value)),
    { initialValue: '' },
  );
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

  readonly withdrawUsers = computed(() =>
    this.users().filter((u) => isUserVisible(u, 'cashWithdraw')),
  );

  readonly accountOptions = computed((): ShopUserAccountOption[] => {
    const userId = this.selectedUserId();
    if (!userId) return [];
    return this.users().find((u) => u.id === userId)?.ledgerAccounts ?? [];
  });

  readonly needsAccountPick = computed(() => this.accountOptions().length > 1);

  readonly accountHint = computed(() => {
    const userId = this.selectedUserId();
    if (!userId) return '';
    const accounts = this.accountOptions();
    if (accounts.length === 0) {
      return 'Sin cuenta asociada: al confirmar se crea una a su nombre.';
    }
    if (accounts.length === 1) {
      return `El efectivo va a la cuenta «${accounts[0].name}».`;
    }
    return '';
  });

  readonly canConfirm = computed(() => {
    if (!this.canPick() || !this.someSelected()) return false;
    const userId = this.selectedUserId();
    if (!userId) return false;
    if (this.needsAccountPick() && !this.selectedAccountId()) return false;
    return true;
  });

  constructor() {
    usePageRefresh(() => this.reload());

    effect(() => {
      const shopId = this.shopId();
      if (!shopId) {
        this.rows.set([]);
        this.users.set([]);
        this.loading.set(false);
        return;
      }
      this.reload();
    });
  }

  money(value: number): string {
    return formatMoney(value);
  }

  formatDate(iso: string): string {
    return formatIsoDateDisplay(iso);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleSelect(id: string): void {
    this.selectedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  onUserChange(userId: string): void {
    const accounts = this.users().find((u) => u.id === userId)?.ledgerAccounts ?? [];
    if (accounts.length === 1) {
      this.accountIdCtrl.setValue(accounts[0].id);
    } else {
      this.accountIdCtrl.setValue('');
    }
  }

  reload(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.loading.set(true);
    this.selectedIds.set(new Set());
    this.api.listPending(shopId).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        this.inbox.refresh();
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar los retiros pendientes', 'OK', {
          duration: 3000,
        });
      },
    });
    this.closingsApi.shopUsers(shopId).subscribe({
      next: (users) => this.users.set(users),
      error: () => undefined,
    });
  }

  confirmPick(): void {
    const shopId = this.shopId();
    if (!shopId || !this.canConfirm()) return;
    const ids = [...this.selectedIds()];
    const userId = this.userIdCtrl.value;
    const accounts = this.accountOptions();
    let accountId = this.accountIdCtrl.value || null;
    if (accounts.length === 1) accountId = accounts[0].id;
    if (accounts.length > 1 && !accountId) {
      this.snack.open('Seleccioná la cuenta destino del efectivo', 'OK', { duration: 3000 });
      return;
    }

    this.picking.set(true);
    this.api
      .pick(shopId, {
        ids,
        userId,
        accountId: accountId || undefined,
      })
      .subscribe({
        next: (res) => {
          this.picking.set(false);
          this.snack.open(
            res.picked === 1
              ? 'Retiro confirmado'
              : `${res.picked} retiros confirmados`,
            'OK',
            { duration: 2500 },
          );
          this.userIdCtrl.setValue('');
          this.accountIdCtrl.setValue('');
          this.reload();
        },
        error: (err) => {
          this.picking.set(false);
          const msg =
            err?.error?.message ||
            (Array.isArray(err?.error?.message) ? err.error.message[0] : null) ||
            'No se pudo confirmar el retiro';
          this.snack.open(String(msg), 'OK', { duration: 4000 });
        },
      });
  }
}
