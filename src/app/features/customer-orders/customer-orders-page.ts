import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { debounceTime, filter, of, switchMap } from 'rxjs';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import { formatMoney } from '../../shared/utils/money';
import { copyText } from '../../shared/utils/share-text';
import { usePageRefresh } from '../../core/page-refresh.service';
import {
  CustomerOrderStatus,
  CustomerOrdersApiService,
  StaffCustomerOrder,
} from './customer-orders-api.service';

const STATUS_LABEL: Record<CustomerOrderStatus, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptado',
  PREPARING: 'En preparación',
  READY: 'Listo',
  OUT_FOR_DELIVERY: 'En camino',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

const NEXT_ACTIONS: Partial<
  Record<CustomerOrderStatus, Array<{ status: CustomerOrderStatus; label: string }>>
> = {
  PENDING: [
    { status: 'ACCEPTED', label: 'Aceptar' },
    { status: 'CANCELLED', label: 'Cancelar' },
  ],
  ACCEPTED: [
    { status: 'PREPARING', label: 'Preparar' },
    { status: 'CANCELLED', label: 'Cancelar' },
  ],
  PREPARING: [
    { status: 'READY', label: 'Listo' },
    { status: 'CANCELLED', label: 'Cancelar' },
  ],
  READY: [
    { status: 'OUT_FOR_DELIVERY', label: 'En camino' },
    { status: 'COMPLETED', label: 'Completar' },
  ],
  OUT_FOR_DELIVERY: [{ status: 'COMPLETED', label: 'Completar' }],
};

@Component({
  selector: 'app-customer-orders-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header
      title="Pedidos online"
      [subtitle]="shops.selectedShop()?.name ?? ''"
    />

    @if (publicOrderingUrl()) {
      <div class="co-public">
        <a class="co-public__btn" [href]="publicOrderingUrl()" target="_blank" rel="noopener">
          <mat-icon>open_in_new</mat-icon>
          Página pública
        </a>
        <button type="button" class="co-public__btn co-public__btn--ghost" (click)="copyPublicOrderingUrl()">
          <mat-icon>content_copy</mat-icon>
          Copiar link
        </button>
      </div>
    }

    <div class="co-filters panel-card">
      <div class="panel-card__body co-filters__row">
        @for (f of filters; track f.value) {
          <button
            type="button"
            mat-stroked-button
            [class.co-filters__on]="filter() === f.value"
            (click)="filter.set(f.value); reload()"
          >
            {{ f.label }}
          </button>
        }
        <button type="button" mat-button (click)="reload()">
          <mat-icon>refresh</mat-icon>
          Actualizar
        </button>
      </div>
    </div>

    @if (loading()) {
      <p class="co-empty">Cargando pedidos…</p>
    } @else if (!orders().length) {
      <p class="co-empty">No hay pedidos en este filtro.</p>
    } @else {
      <div class="co-list">
        @for (o of orders(); track o.id) {
          <article class="panel-card co-card">
            <div class="panel-card__body">
              <header class="co-card__head">
                <div>
                  <strong class="co-card__code">#{{ o.code }}</strong>
                  <span class="co-card__status">{{ statusLabel(o.status) }}</span>
                </div>
                <time>{{ o.createdAt | date: 'dd/MM HH:mm' }}</time>
              </header>
              <p class="co-card__guest">
                {{ o.lastName }}, {{ o.firstName }} · {{ o.phone }}
              </p>
              <p class="co-card__meta">
                {{ o.fulfillment === 'DELIVERY' ? 'Delivery' : 'Take away' }}
                ·
                {{ o.paymentMethod === 'CASH' ? 'Efectivo' : 'Transferencia' }}
                @if (o.fulfillment === 'DELIVERY' && o.deliveryZoneName) {
                  · {{ o.deliveryZoneName }}
                }
              </p>
              @if (o.address) {
                <p class="co-card__addr">{{ o.address }}</p>
              }
              <ul class="co-card__items">
                @for (it of o.items; track $index) {
                  <li>
                    {{ it.qty }} × {{ it.name }}
                    <span>{{ money(it.unitPrice * it.qty) }}</span>
                    @if (it.notes) {
                      <em>{{ it.notes }}</em>
                    }
                  </li>
                }
              </ul>
              <p class="co-card__total">
                Total {{ money(o.total) }}
                @if (o.deliveryFee) {
                  <span>(envío {{ money(o.deliveryFee) }})</span>
                }
              </p>
              @if (canManage() && nextActions(o).length) {
                <div class="co-card__actions">
                  @for (a of nextActions(o); track a.status) {
                    <button
                      mat-flat-button
                      [color]="a.status === 'CANCELLED' ? 'warn' : 'primary'"
                      type="button"
                      [disabled]="busyId() === o.id"
                      (click)="setStatus(o, a.status)"
                    >
                      {{ a.label }}
                    </button>
                  }
                </div>
              }
            </div>
          </article>
        }
      </div>
    }
  `,
  styles: `
    .co-public {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 0 0 1rem;
    }
    .co-public__btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.4rem 0.85rem;
      border-radius: 999px;
      border: 1px solid var(--guy-border, #d7e0d9);
      background: var(--guy-green, #2e7d32);
      color: #fff;
      text-decoration: none;
      font-weight: 650;
      font-size: 0.86rem;
      cursor: pointer;
    }
    .co-public__btn mat-icon {
      font-size: 1.05rem;
      width: 1.05rem;
      height: 1.05rem;
    }
    .co-public__btn--ghost {
      background: #fff;
      color: var(--guy-navy, #003366);
    }
    .co-filters {
      margin-bottom: 1rem;
    }
    .co-filters__row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
    .co-filters__on {
      background: color-mix(in srgb, var(--guy-primary, #1565c0) 14%, white);
      border-color: var(--guy-primary, #1565c0);
    }
    .co-empty {
      color: var(--guy-muted, #5f6f76);
      padding: 1rem;
    }
    .co-list {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }
    .co-card__head {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      align-items: baseline;
    }
    .co-card__code {
      font-size: 1.1rem;
      margin-right: 0.5rem;
    }
    .co-card__status {
      font-size: 0.85rem;
      color: var(--guy-muted, #5f6f76);
    }
    .co-card__guest,
    .co-card__meta,
    .co-card__addr {
      margin: 0.35rem 0 0;
      font-size: 0.92rem;
    }
    .co-card__addr {
      color: var(--guy-muted, #5f6f76);
    }
    .co-card__items {
      list-style: none;
      padding: 0.6rem 0 0;
      margin: 0.5rem 0 0;
      border-top: 1px solid #e8eef2;
    }
    .co-card__items li {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.25rem 0.75rem;
      padding: 0.25rem 0;
      font-size: 0.9rem;
    }
    .co-card__items em {
      grid-column: 1 / -1;
      font-size: 0.8rem;
      color: var(--guy-muted, #5f6f76);
    }
    .co-card__total {
      margin: 0.5rem 0 0;
      font-weight: 700;
    }
    .co-card__total span {
      font-weight: 500;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.85rem;
    }
    .co-card__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.75rem;
    }
  `,
})
export class CustomerOrdersPage {
  private readonly api = inject(CustomerOrdersApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly live = inject(ShopLiveClient);
  private readonly auth = inject(AuthService);
  readonly shops = inject(ShopContextService);

  readonly filter = signal<'open' | 'all' | CustomerOrderStatus>('open');
  readonly orders = signal<StaffCustomerOrder[]>([]);
  readonly loading = signal(false);
  readonly busyId = signal<string | null>(null);

  readonly filters = [
    { value: 'open' as const, label: 'Activos' },
    { value: 'all' as const, label: 'Todos' },
    { value: 'PENDING' as const, label: 'Pendientes' },
    { value: 'COMPLETED' as const, label: 'Completados' },
    { value: 'CANCELLED' as const, label: 'Cancelados' },
  ];

  readonly canManage = computed(() =>
    hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'customerOrders.manage',
    ),
  );

  publicOrderingUrl(): string {
    const shop = this.shops.selectedShop();
    if (!shop?.onlineOrderingEnabled || !shop.slug) return '';
    return `${window.location.origin}/pedir/${encodeURIComponent(shop.slug)}`;
  }

  async copyPublicOrderingUrl(): Promise<void> {
    const url = this.publicOrderingUrl();
    if (!url) return;
    const ok = await copyText(url);
    this.snack.open(ok ? 'Link de pedidos online copiado' : 'No se pudo copiar la URL', 'OK', {
      duration: 2500,
    });
  }

  constructor() {
    usePageRefresh(() => this.reload());

    toObservable(this.shops.selectedShopId)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.reload());

    toObservable(this.shops.selectedShopId)
      .pipe(
        switchMap((id) => {
          const shopId = String(id ?? '').trim();
          if (!shopId) return of(null);
          return this.live.connectAuth(shopId).pipe(
            filter((t) => t.domain === 'customer-orders'),
            debounceTime(250),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((tick) => {
        if (tick) this.reload();
      });
  }

  statusLabel(s: CustomerOrderStatus): string {
    return STATUS_LABEL[s] ?? s;
  }

  nextActions(order: StaffCustomerOrder) {
    const actions = [...(NEXT_ACTIONS[order.status] ?? [])];
    if (order.status === 'READY' && order.fulfillment === 'TAKEAWAY') {
      return actions.filter((a) => a.status !== 'OUT_FOR_DELIVERY');
    }
    return actions;
  }

  money(n: number): string {
    return formatMoney(n);
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.orders.set([]);
      return;
    }
    this.loading.set(true);
    const f = this.filter();
    let statusParam: string | undefined;
    if (f === 'open') {
      statusParam = 'PENDING,ACCEPTED,PREPARING,READY,OUT_FOR_DELIVERY';
    } else if (f !== 'all') {
      statusParam = f;
    }
    this.api.listStaff(shopId, statusParam).subscribe({
      next: (rows) => {
        this.orders.set(rows);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err?.error?.message ?? 'No se pudieron cargar los pedidos';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', {
          duration: 3500,
        });
      },
    });
  }

  setStatus(order: StaffCustomerOrder, status: CustomerOrderStatus): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.busyId.set(order.id);
    this.api.updateStatus(shopId, order.id, status).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.orders.update((list) =>
          list.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
        );
        this.snack.open(`Pedido #${updated.code}: ${STATUS_LABEL[updated.status]}`, 'OK', {
          duration: 2200,
        });
        if (this.filter() === 'open' && (status === 'COMPLETED' || status === 'CANCELLED')) {
          this.reload();
        }
      },
      error: (err) => {
        this.busyId.set(null);
        const msg = err?.error?.message ?? 'No se pudo actualizar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', {
          duration: 3500,
        });
      },
    });
  }
}
