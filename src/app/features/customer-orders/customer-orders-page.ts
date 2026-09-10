import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { debounceTime, filter, of, switchMap } from 'rxjs';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission, canManageOrderingCatalog } from '../../core/auth/auth.models';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import { formatMoney } from '../../shared/utils/money';
import { copyText } from '../../shared/utils/share-text';
import { usePageRefresh } from '../../core/page-refresh.service';
import { HelpDialogComponent } from '../../shared/components/help-dialog';
import { topicById } from '../../core/help/module-help';
import {
  CustomerOrderStatus,
  CustomerOrdersApiService,
  StaffCustomerOrder,
} from './customer-orders-api.service';
import { CustomerOrdersInboxService } from './customer-orders-inbox.service';
import { OrderingCatalogPanelComponent } from './ordering-catalog-panel';
import { StaffOrderingPosComponent } from './staff-ordering-pos';
import {
  CustomerOrderDetailDialogComponent,
  CustomerOrderDetailDialogResult,
} from './customer-order-detail-dialog';
import {
  canAcreditOrder,
  canCompleteOrder,
  canDesacreditOrder,
  cancelActionFor,
  isOrderAccredited,
  nextActionsFor,
  orderPaymentText,
  orderPhoneHref,
  primaryForwardAction,
  STATUS_LABEL,
} from './customer-orders-status.util';

type BoardColumnId = 'pending' | 'kitchen' | 'ready' | 'delivery';
type ViewMode = 'board' | 'COMPLETED' | 'CANCELLED' | 'config' | 'nuevo';

type BoardColumn = {
  id: BoardColumnId;
  title: string;
  statuses: CustomerOrderStatus[];
};

const BOARD_COLUMNS: BoardColumn[] = [
  { id: 'pending', title: 'Pendientes', statuses: ['PENDING'] },
  { id: 'kitchen', title: 'En cocina', statuses: ['ACCEPTED', 'PREPARING'] },
  { id: 'ready', title: 'Listos', statuses: ['READY'] },
  { id: 'delivery', title: 'En camino', statuses: ['OUT_FOR_DELIVERY'] },
];

@Component({
  selector: 'app-customer-orders-page',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    OrderingCatalogPanelComponent,
    StaffOrderingPosComponent,
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
  private readonly dialog = inject(MatDialog);
  readonly shops = inject(ShopContextService);

  readonly view = signal<ViewMode>('board');
  readonly orders = signal<StaffCustomerOrder[]>([]);
  readonly loading = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly focusOrderId = signal<string | null>(null);
  private lastKnownIds = new Set<string>();
  private skipNewToast = true;

  readonly pendingCount = this.inbox.pendingCount;

  readonly canManage = computed(() =>
    hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'customerOrders.manage',
    ),
  );

  readonly canReadOrders = computed(() =>
    hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'customerOrders.read',
    ) ||
    hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'customerOrders.manage',
    ),
  );

  readonly canConfigure = computed(() =>
    canManageOrderingCatalog(this.auth.currentUser(), this.shops.selectedShopId()),
  );

  readonly boardColumns = computed(() => {
    const rows = this.orders();
    return BOARD_COLUMNS.map((col) => {
      const list = rows
        .filter((o) => col.statuses.includes(o.status))
        .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
      return { ...col, orders: list };
    });
  });

  readonly archiveOrders = computed(() => {
    const rows = [...this.orders()];
    rows.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    return rows;
  });

  readonly openTotal = computed(() =>
    this.boardColumns().reduce((n, c) => n + c.orders.length, 0),
  );

  constructor() {
    usePageRefresh(() => this.reload());

    toObservable(this.shops.selectedShopId)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.lastKnownIds = new Set();
        this.skipNewToast = true;
        this.focusOrderId.set(null);
        if (this.canConfigure() && !this.canReadOrders()) {
          this.view.set('config');
        } else if (this.view() === 'config' && !this.canConfigure()) {
          this.view.set('board');
        }
        this.reload();
      });

    toObservable(this.shops.selectedShopId)
      .pipe(
        switchMap((id) => {
          const shopId = String(id ?? '').trim();
          if (!shopId || !this.canReadOrders()) return of(null);
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

  setView(mode: ViewMode): void {
    this.view.set(mode);
    if (mode !== 'config' && mode !== 'nuevo') this.reload();
  }

  openNuevo(): void {
    if (!this.canManage()) return;
    this.setView('nuevo');
  }

  onPosCreated(order: StaffCustomerOrder): void {
    this.focusOrderId.set(order.id);
    this.view.set('board');
    this.reload();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { order: order.id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  onPosCancelled(): void {
    this.setView('board');
  }

  statusLabel(s: CustomerOrderStatus): string {
    return STATUS_LABEL[s] ?? s;
  }

  nextActions(order: StaffCustomerOrder) {
    return nextActionsFor(order);
  }

  primaryAction(order: StaffCustomerOrder) {
    return primaryForwardAction(order);
  }

  cancelAction(order: StaffCustomerOrder) {
    return cancelActionFor(order);
  }

  isAccredited(order: StaffCustomerOrder): boolean {
    return isOrderAccredited(order);
  }

  canAcredit(order: StaffCustomerOrder): boolean {
    return canAcreditOrder(order);
  }

  canDesacredit(order: StaffCustomerOrder): boolean {
    return canDesacreditOrder(order);
  }

  canComplete(order: StaffCustomerOrder): boolean {
    return canCompleteOrder(order);
  }

  paymentText(order: StaffCustomerOrder): string {
    return orderPaymentText(order);
  }

  money(n: number): string {
    return formatMoney(n);
  }

  phoneHref(phone: string): string {
    return orderPhoneHref(phone);
  }

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

  async copyCode(code: string): Promise<void> {
    const ok = await copyText(code);
    this.snack.open(ok ? `Código ${code} copiado` : 'No se pudo copiar', 'OK', {
      duration: 2000,
    });
  }

  openHelp(): void {
    const topic = topicById('customer-orders');
    if (!topic) return;
    const user = this.auth.currentUser();
    const shopId = this.shops.selectedShopId();
    const blocks = topic.blocks.filter(
      (b) =>
        !b.anyOf?.length ||
        b.anyOf.some((p) => hasShopPermission(user, shopId, p)),
    );
    this.dialog.open(HelpDialogComponent, {
      data: { topic, blocks },
      autoFocus: 'dialog',
      width: 'min(560px, 94vw)',
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
    if (!this.canReadOrders() || this.view() === 'config' || this.view() === 'nuevo') {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    const v = this.view();
    let statusParam: string | undefined;
    if (v === 'board') {
      statusParam = 'PENDING,ACCEPTED,PREPARING,READY,OUT_FOR_DELIVERY';
    } else {
      statusParam = v;
    }
    this.api.listStaff(shopId, statusParam).subscribe({
      next: (rows) => {
        const nextIds = new Set(rows.map((r) => r.id));
        if (!this.skipNewToast && this.lastKnownIds.size && v === 'board') {
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
      if (this.view() !== 'board') {
        this.view.set('board');
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

  openOrder(order: StaffCustomerOrder, event?: Event): void {
    const target = event?.target as HTMLElement | null;
    if (target?.closest('button, a, .co-card__actions')) return;
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const ref = this.dialog.open(CustomerOrderDetailDialogComponent, {
      data: {
        order,
        shopId,
        canManage: this.canManage(),
      },
      autoFocus: 'dialog',
      width: 'min(440px, 96vw)',
      maxHeight: '92vh',
      panelClass: 'guy-dialog',
    });
    ref.afterClosed().subscribe((result: CustomerOrderDetailDialogResult) => {
      if (!result || result.kind !== 'updated') return;
      this.applyOrderUpdate(result.order);
      this.snack.open(
        `Pedido #${result.order.code}: ${STATUS_LABEL[result.order.status]}`,
        'OK',
        { duration: 2200 },
      );
      this.inbox.refresh();
    });
  }

  private applyOrderUpdate(updated: StaffCustomerOrder): void {
    const view = this.view();
    if (view === 'board') {
      if (updated.status === 'COMPLETED' || updated.status === 'CANCELLED') {
        this.orders.update((list) => list.filter((o) => o.id !== updated.id));
        return;
      }
      const exists = this.orders().some((o) => o.id === updated.id);
      if (exists) {
        this.orders.update((list) =>
          list.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
        );
      } else {
        this.reload();
      }
      return;
    }
    if (view === 'COMPLETED' || view === 'CANCELLED') {
      if (updated.status !== view) {
        this.orders.update((list) => list.filter((o) => o.id !== updated.id));
        return;
      }
      this.orders.update((list) =>
        list.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
      );
    }
  }

  setStatus(order: StaffCustomerOrder, status: CustomerOrderStatus): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    if (status === 'COMPLETED' && !this.isAccredited(order)) {
      this.snack.open('Acreditá el pago antes de completar', 'OK', { duration: 3000 });
      return;
    }
    this.busyId.set(order.id);
    this.api.updateStatus(shopId, order.id, status).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.applyOrderUpdate(updated);
        this.snack.open(`Pedido #${updated.code}: ${STATUS_LABEL[updated.status]}`, 'OK', {
          duration: 2200,
        });
        this.inbox.refresh();
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

  acredit(order: StaffCustomerOrder): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canAcredit(order)) return;
    this.busyId.set(order.id);
    this.api.acreditPayment(shopId, order.id).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.orders.update((list) =>
          list.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
        );
        this.snack.open(`Pedido #${updated.code}: pago acreditado`, 'OK', {
          duration: 2200,
        });
      },
      error: (err) => {
        this.busyId.set(null);
        const msg = err?.error?.message ?? 'No se pudo acreditar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', {
          duration: 3500,
        });
      },
    });
  }

  desacredit(order: StaffCustomerOrder): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canDesacredit(order)) return;
    this.busyId.set(order.id);
    this.api.desacreditPayment(shopId, order.id).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.orders.update((list) =>
          list.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)),
        );
        this.snack.open(`Pedido #${updated.code}: pago desacreditado`, 'OK', {
          duration: 2200,
        });
      },
      error: (err) => {
        this.busyId.set(null);
        const msg = err?.error?.message ?? 'No se pudo desacreditar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', {
          duration: 3500,
        });
      },
    });
  }
}
