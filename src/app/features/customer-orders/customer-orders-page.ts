import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
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
import { CustomerOrdersInboxService } from './customer-orders-inbox.service';

const STATUS_LABEL: Record<CustomerOrderStatus, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptado',
  PREPARING: 'En preparación',
  READY: 'Listo',
  OUT_FOR_DELIVERY: 'En camino',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

const STATUS_CHIP: Record<CustomerOrderStatus, string> = {
  PENDING: 'guy-chip--warning',
  ACCEPTED: 'guy-chip--primary',
  PREPARING: 'guy-chip--primary',
  READY: 'guy-chip--success',
  OUT_FOR_DELIVERY: 'guy-chip--success',
  COMPLETED: 'guy-chip--muted',
  CANCELLED: 'guy-chip--muted',
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

type FilterValue = 'open' | 'all' | CustomerOrderStatus;

@Component({
  selector: 'app-customer-orders-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    PageHeaderComponent,
  ],
  templateUrl: './customer-orders-page.html',
  styleUrl: './customer-orders-page.scss',
})
export class CustomerOrdersPage {
  private readonly api = inject(CustomerOrdersApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly live = inject(ShopLiveClient);
  private readonly auth = inject(AuthService);
  private readonly inbox = inject(CustomerOrdersInboxService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly shops = inject(ShopContextService);

  readonly filter = signal<FilterValue>('open');
  readonly orders = signal<StaffCustomerOrder[]>([]);
  readonly loading = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly focusOrderId = signal<string | null>(null);
  private lastKnownIds = new Set<string>();
  private skipNewToast = true;

  readonly filters: Array<{ value: FilterValue; label: string }> = [
    { value: 'open', label: 'Activos' },
    { value: 'PENDING', label: 'Pendientes' },
    { value: 'all', label: 'Todos' },
    { value: 'COMPLETED', label: 'Completados' },
    { value: 'CANCELLED', label: 'Cancelados' },
  ];

  readonly pendingCount = this.inbox.pendingCount;

  readonly canManage = computed(() =>
    hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'customerOrders.manage',
    ),
  );

  readonly sortedOrders = computed(() => {
    const rows = [...this.orders()];
    const rank = (s: CustomerOrderStatus) => {
      if (s === 'PENDING') return 0;
      if (s === 'ACCEPTED') return 1;
      if (s === 'PREPARING') return 2;
      if (s === 'READY' || s === 'OUT_FOR_DELIVERY') return 3;
      return 4;
    };
    rows.sort((a, b) => {
      const dr = rank(a.status) - rank(b.status);
      if (dr) return dr;
      return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
    });
    return rows;
  });

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
      .subscribe(() => {
        this.lastKnownIds = new Set();
        this.skipNewToast = true;
        this.focusOrderId.set(null);
        this.reload();
      });

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

  setFilter(value: FilterValue): void {
    this.filter.set(value);
    this.reload();
  }

  statusLabel(s: CustomerOrderStatus): string {
    return STATUS_LABEL[s] ?? s;
  }

  statusChip(s: CustomerOrderStatus): string {
    return STATUS_CHIP[s] ?? 'guy-chip--muted';
  }

  nextActions(order: StaffCustomerOrder) {
    const actions = [...(NEXT_ACTIONS[order.status] ?? [])];
    if (order.status === 'READY' && order.fulfillment === 'TAKEAWAY') {
      return actions.filter((a) => a.status !== 'OUT_FOR_DELIVERY');
    }
    return actions;
  }

  primaryAction(order: StaffCustomerOrder) {
    return this.nextActions(order).find((a) => a.status !== 'CANCELLED') ?? null;
  }

  cancelAction(order: StaffCustomerOrder) {
    return this.nextActions(order).find((a) => a.status === 'CANCELLED') ?? null;
  }

  money(n: number): string {
    return formatMoney(n);
  }

  phoneHref(phone: string): string {
    const digits = String(phone ?? '').replace(/\D/g, '');
    return digits ? `tel:+${digits}` : '';
  }

  async copyCode(code: string): Promise<void> {
    const ok = await copyText(code);
    this.snack.open(ok ? `Código ${code} copiado` : 'No se pudo copiar', 'OK', {
      duration: 2000,
    });
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.orders.set([]);
      this.lastKnownIds = new Set();
      this.skipNewToast = true;
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
        const nextIds = new Set(rows.map((r) => r.id));
        if (!this.skipNewToast && this.lastKnownIds.size) {
          const fresh = rows.filter((r) => !this.lastKnownIds.has(r.id));
          if (fresh.length === 1) {
            this.snack.open(`Nuevo pedido #${fresh[0].code}`, 'Ver', { duration: 4000 });
          } else if (fresh.length > 1) {
            this.snack.open(`${fresh.length} pedidos nuevos`, 'OK', { duration: 3500 });
          }
        }
        this.skipNewToast = false;
        this.lastKnownIds = nextIds;
        this.orders.set(rows);
        this.loading.set(false);
        this.focusOrderFromQuery();
        this.inbox.refresh();
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

  private focusOrderFromQuery(): void {
    const id = (this.route.snapshot.queryParamMap.get('order') || '').trim();
    if (!id) return;
    const found = this.orders().some((o) => o.id === id);
    if (!found) {
      if (this.filter() !== 'all') {
        this.filter.set('all');
        this.reload();
      }
      return;
    }
    this.focusOrderId.set(id);
    queueMicrotask(() => {
      document.getElementById(`co-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { order: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
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
        this.inbox.refresh();
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
