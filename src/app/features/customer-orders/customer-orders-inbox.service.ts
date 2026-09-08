import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  distinctUntilChanged,
  map,
  of,
  switchMap,
} from 'rxjs';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { InboxPollService } from '../../core/inbox/inbox-poll.service';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import { CustomerOrdersApiService } from './customer-orders-api.service';
import {
  bindReservationAlertSoundUnlock,
  playCustomerOrderPendingSound,
} from '../reservations/reservation-alert-sound';

/** Contador de pedidos online pendientes + chime al subir. */
@Injectable({ providedIn: 'root' })
export class CustomerOrdersInboxService {
  private readonly api = inject(CustomerOrdersApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly poll = inject(InboxPollService);
  private readonly live = inject(ShopLiveClient);

  readonly pendingCount = signal(0);

  private readonly shopSlug = computed(
    () => this.shops.selectedShop()?.slug ?? null,
  );

  private lastShopId: string | null = null;
  private lastPending: number | null = null;
  private lastChimeAt = 0;

  constructor() {
    bindReservationAlertSoundUnlock();

    toObservable(this.shops.selectedShopId)
      .pipe(
        switchMap((shopId) => {
          const user = this.auth.currentUser();
          const shop = this.shops.selectedShop();
          if (
            !shopId ||
            !shop?.onlineOrderingEnabled ||
            !hasShopPermission(user, shopId, 'customerOrders.read')
          ) {
            this.lastShopId = shopId;
            this.lastPending = null;
            this.pendingCount.set(0);
            return of(0);
          }
          return this.poll.tick$.pipe(
            switchMap(() =>
              this.api.pendingCount(shopId).pipe(
                map((r: { count: number }) => r.count ?? 0),
                catchError(() => of(0)),
              ),
            ),
          );
        }),
        distinctUntilChanged(),
      )
      .subscribe((count) => this.applyCount(count));

    this.live
      .watch(this.shopSlug, ['customer-orders'])
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.refresh());
  }

  refresh(): void {
    const shopId = this.shops.selectedShopId();
    const user = this.auth.currentUser();
    const shop = this.shops.selectedShop();
    if (
      !shopId ||
      !shop?.onlineOrderingEnabled ||
      !hasShopPermission(user, shopId, 'customerOrders.read')
    ) {
      this.lastPending = null;
      this.pendingCount.set(0);
      return;
    }
    this.api.pendingCount(shopId).subscribe({
      next: (r: { count: number }) => this.applyCount(r.count ?? 0),
      error: () => {
        this.lastPending = null;
        this.pendingCount.set(0);
      },
    });
  }

  private applyCount(count: number): void {
    const shopId = this.shops.selectedShopId();
    if (shopId !== this.lastShopId) {
      this.lastShopId = shopId;
      this.lastPending = null;
    }
    if (this.lastPending != null && count > this.lastPending) {
      const now = Date.now();
      if (now - this.lastChimeAt > 2500) {
        this.lastChimeAt = now;
        playCustomerOrderPendingSound();
      }
    }
    this.lastPending = count;
    this.pendingCount.set(count);
  }
}
