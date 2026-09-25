import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { catchError, debounceTime, filter, interval, of, switchMap } from 'rxjs';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import { usePageRefresh } from '../../core/page-refresh.service';
import { HelpDialogComponent } from '../../shared/components/help-dialog';
import { topicById } from '../../core/help/module-help';
import { formatMoney } from '../../shared/utils/money';
import { copyText } from '../../shared/utils/share-text';
import { MatDialog } from '@angular/material/dialog';
import {
  CustomerOrderStatus,
  CustomerOrdersApiService,
  StaffCustomerOrder,
} from './customer-orders-api.service';
import { isOrderAccredited, orderPaymentText, STATUS_LABEL } from './customer-orders-status.util';
import { groupOrderLines, OrderLineGroup } from './ordering-ui.util';
import { playCustomerOrderPendingSound, bindReservationAlertSoundUnlock } from '../reservations/reservation-alert-sound';

type BoardColumnId = 'pending' | 'kitchen' | 'ready' | 'delivery' | 'done' | 'cancelled';
const BOARD_COLUMNS: Array<{
  id: BoardColumnId;
  title: string;
  statuses: CustomerOrderStatus[];
}> = [
  { id: 'pending', title: 'Pendientes', statuses: ['PENDING'] },
  { id: 'kitchen', title: 'En cocina', statuses: ['ACCEPTED', 'PREPARING'] },
  { id: 'ready', title: 'Listos', statuses: ['READY'] },
  { id: 'delivery', title: 'En camino', statuses: ['OUT_FOR_DELIVERY'] },
  { id: 'done', title: 'Completados', statuses: ['COMPLETED'] },
  { id: 'cancelled', title: 'Cancelados', statuses: ['CANCELLED'] },
];

const ALL_STATUSES =
  'PENDING,ACCEPTED,PREPARING,READY,OUT_FOR_DELIVERY,COMPLETED,CANCELLED';

@Component({
  selector: 'app-customer-orders-monitor-page',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatSnackBarModule],
  templateUrl: './customer-orders-monitor-page.html',
  styleUrl: './customer-orders-monitor-page.scss',
})
export class CustomerOrdersMonitorPage {
  private readonly api = inject(CustomerOrdersApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly live = inject(ShopLiveClient);
  private readonly dialog = inject(MatDialog);
  readonly shops = inject(ShopContextService);

  readonly orders = signal<StaffCustomerOrder[]>([]);
  readonly loading = signal(false);
  readonly now = signal(Date.now());
  private lastKnownIds = new Set<string>();
  private skipChime = true;

  /** Solo columnas con al menos un pedido. */
  readonly boardColumns = computed(() => {
    const rows = this.orders();
    return BOARD_COLUMNS.map((col) => ({
      ...col,
      orders: rows
        .filter((o) => col.statuses.includes(o.status))
        .sort((a, b) => {
          const aKey =
            col.id === 'done'
              ? String(a.completedAt ?? a.createdAt ?? '')
              : col.id === 'cancelled'
                ? String(a.cancelledAt ?? a.createdAt ?? '')
                : String(a.createdAt ?? '');
          const bKey =
            col.id === 'done'
              ? String(b.completedAt ?? b.createdAt ?? '')
              : col.id === 'cancelled'
                ? String(b.cancelledAt ?? b.createdAt ?? '')
                : String(b.createdAt ?? '');
          return aKey.localeCompare(bKey);
        }),
    })).filter((col) => col.orders.length > 0);
  });

  readonly summary = computed(() => {
    const rows = this.orders();
    const count = (pred: (o: StaffCustomerOrder) => boolean) => rows.filter(pred).length;
    const open = count(
      (o) =>
        o.status !== 'COMPLETED' &&
        o.status !== 'CANCELLED',
    );
    const done = count((o) => o.status === 'COMPLETED');
    const cancelled = count((o) => o.status === 'CANCELLED');
    const takeaway = count((o) => o.fulfillment === 'TAKEAWAY');
    const delivery = count((o) => o.fulfillment === 'DELIVERY');
    const counter = count((o) => o.fulfillment === 'COUNTER');
    const accredited = count((o) => isOrderAccredited(o));
    const total = rows.reduce((s, o) => s + (Number(o.total) || 0), 0);
    return {
      totalCount: rows.length,
      open,
      done,
      cancelled,
      takeaway,
      delivery,
      counter,
      accredited,
      pendingPay: Math.max(0, rows.length - accredited),
      total,
    };
  });

  readonly clockLabel = computed(() =>
    new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(
      this.now(),
    ),
  );

  constructor() {
    bindReservationAlertSoundUnlock();
    usePageRefresh(() => this.reload());
    interval(20_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.now.set(Date.now()));

    toObservable(this.shops.selectedShopId)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.lastKnownIds = new Set();
        this.skipChime = true;
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

  statusLabel(s: CustomerOrderStatus): string {
    return STATUS_LABEL[s] ?? s;
  }

  isAccredited(order: StaffCustomerOrder): boolean {
    return isOrderAccredited(order);
  }

  paymentText(order: StaffCustomerOrder): string {
    return orderPaymentText(order);
  }

  money(n: number): string {
    return formatMoney(n);
  }

  itemGroups(order: StaffCustomerOrder): OrderLineGroup[] {
    return groupOrderLines(order.items);
  }

  channel(order: StaffCustomerOrder): string {
    if (order.fulfillment === 'DELIVERY') return 'Delivery';
    if (order.fulfillment === 'COUNTER') return 'Mostrador';
    return 'Take away';
  }

  ageLabel(iso?: string | null): string {
    if (!iso) return '';
    const min = Math.max(0, Math.floor((this.now() - new Date(iso).getTime()) / 60_000));
    if (min < 1) return 'ahora';
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)} h`;
  }

  cardTime(order: StaffCustomerOrder): string | null {
    if (order.status === 'COMPLETED') return order.completedAt ?? order.createdAt ?? null;
    if (order.status === 'CANCELLED') return order.cancelledAt ?? order.createdAt ?? null;
    return order.createdAt ?? null;
  }

  async copyCode(code: string): Promise<void> {
    const ok = await copyText(code);
    this.snack.open(ok ? `Código ${code} copiado` : 'No se pudo copiar', 'OK', { duration: 2000 });
  }

  openHelp(): void {
    const topic = topicById('customer-orders-monitor');
    if (!topic) return;
    this.dialog.open(HelpDialogComponent, {
      data: { topic, blocks: topic.blocks },
      autoFocus: 'dialog',
      width: 'min(560px, 94vw)',
    });
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.orders.set([]);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    // Solo pedidos del turno vigente (abiertos, completados y cancelados).
    this.api
      .listStaff(shopId, { status: ALL_STATUSES, scope: 'current-shift' })
      .pipe(catchError(() => of([] as StaffCustomerOrder[])))
      .subscribe({
        next: (rows) => {
          const nextIds = new Set(rows.map((r) => r.id));
          if (!this.skipChime && this.lastKnownIds.size) {
            const fresh = rows.filter(
              (r) => !this.lastKnownIds.has(r.id) && r.status === 'PENDING',
            );
            if (fresh.length) playCustomerOrderPendingSound();
          }
          this.skipChime = false;
          this.lastKnownIds = nextIds;
          this.orders.set(rows);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snack.open('No se pudo cargar el monitor', 'OK', { duration: 3000 });
        },
      });
  }
}
