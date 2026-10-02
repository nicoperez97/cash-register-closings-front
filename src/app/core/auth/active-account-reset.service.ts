import { Injectable, Injector, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Subject, distinctUntilChanged, map, skip } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ShopLiveClient } from '../live/shop-live.service';
import { PageRefreshService } from '../page-refresh.service';
import { DemoOverlayStore } from '../demo/demo-overlay.store';
import { NotificationsInboxService } from '../../features/payments/notifications-inbox.service';
import { PaymentsInboxService } from '../../features/payments/payments-inbox.service';
import { CashWithdrawalsInboxService } from '../../features/cash-withdrawals/cash-withdrawals-inbox.service';
import { SettlementsInboxService } from '../../features/settlements/settlements-inbox.service';
import { TipsInboxService } from '../../features/tips/tips-inbox.service';
import { ReimbursementsInboxService } from '../../features/reimbursements/reimbursements-inbox.service';
import { CustomerOrdersInboxService } from '../../features/customer-orders/customer-orders-inbox.service';
import { ReservationsInboxService } from '../../features/reservations/reservations-inbox.service';
import { PushNotificationsService } from '../../features/payments/push-notifications.service';
import { StaffOrderOutboxService } from '../../features/customer-orders/staff-order-outbox.service';

/**
 * Al cambiar la cuenta activa (switch / agregar / salir parcial), limpia
 * caches de UI y fuerza refresh de badges, live SSE y pantalla.
 */
@Injectable({ providedIn: 'root' })
export class ActiveAccountResetService {
  private readonly injector = inject(Injector);
  private readonly auth = inject(AuthService);
  private readonly live = inject(ShopLiveClient);
  private readonly pageRefresh = inject(PageRefreshService);
  private readonly demoOverlay = inject(DemoOverlayStore);
  private readonly notifsInbox = inject(NotificationsInboxService);
  private readonly paymentsInbox = inject(PaymentsInboxService);
  private readonly withdrawalsInbox = inject(CashWithdrawalsInboxService);
  private readonly settlementsInbox = inject(SettlementsInboxService);
  private readonly tipsInbox = inject(TipsInboxService);
  private readonly reimbursementsInbox = inject(ReimbursementsInboxService);
  private readonly ordersInbox = inject(CustomerOrdersInboxService);
  private readonly reservationsInbox = inject(ReservationsInboxService);
  private readonly push = inject(PushNotificationsService);

  private readonly changed$ = new Subject<string | null>();
  /** Emite el userId activo tras un cambio (null si quedó sin sesión). */
  readonly accountChanged$ = this.changed$.asObservable();

  private started = false;

  /** Llamar una vez desde el layout autenticado. */
  start(): void {
    if (this.started) return;
    this.started = true;
    toObservable(this.auth.currentUser, { injector: this.injector })
      .pipe(
        map((u) => u?.id ?? null),
        distinctUntilChanged(),
        skip(1),
      )
      .subscribe((userId) => {
        this.run(userId);
      });
  }

  private run(userId: string | null): void {
    this.live.invalidateAuthStreams();
    this.demoOverlay.clear();

    if (!userId) {
      this.notifsInbox.clear();
      this.paymentsInbox.refresh();
      this.withdrawalsInbox.refresh();
      this.settlementsInbox.refresh();
      this.tipsInbox.refresh();
      this.reimbursementsInbox.refresh();
      this.ordersInbox.refresh();
      this.reservationsInbox.refresh();
      this.changed$.next(null);
      return;
    }

    this.notifsInbox.refresh();
    this.paymentsInbox.refresh();
    this.withdrawalsInbox.refresh();
    this.settlementsInbox.refresh();
    this.tipsInbox.refresh();
    this.reimbursementsInbox.refresh();
    this.ordersInbox.refresh();
    this.reservationsInbox.refresh();
    void this.push.refreshStatus().catch(() => undefined);

    try {
      this.injector.get(StaffOrderOutboxService).onActiveUserChanged(userId);
    } catch {
      // ignore
    }

    this.changed$.next(userId);
    // Badges/listas se refrescan arriba; la pantalla la remonta el navigate + pageRefresh del layout.
    queueMicrotask(() => this.pageRefresh.refreshFromInbox());
  }
}
