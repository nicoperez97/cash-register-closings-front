import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  forkJoin,
  interval,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { resolveShopCalendarDate } from '../../core/shop/business-date';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import { ReservationsApiService } from './reservations-api.service';
import { isActiveReservationStatus } from './reservation-status';
import {
  bindReservationAlertSoundUnlock,
  playReservationPendingSound,
} from './reservation-alert-sound';

/** Comensales del día y solicitudes pendientes para badge de menú «Reservas». */
@Injectable({ providedIn: 'root' })
export class ReservationsInboxService {
  private readonly api = inject(ReservationsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly live = inject(ShopLiveClient);

  /** Total de comensales del día calendario del local. */
  readonly todayGuests = signal(0);
  /** Solicitudes públicas pendientes de aceptar/rechazar. */
  readonly pendingRequests = signal(0);
  readonly menuBadge = computed(() => this.pendingRequests() || this.todayGuests());

  private lastShopId: string | null = null;
  private lastPending: number | null = null;
  private lastChimeAt = 0;

  constructor() {
    bindReservationAlertSoundUnlock();
    combineLatest([
      toObservable(this.shops.selectedShopId),
      toObservable(this.shops.selectedShop),
      toObservable(this.auth.currentUser),
    ])
      .pipe(
        map(([shopId, shop, user]) => ({
          shopId,
          enabled: !!shop?.reservationsEnabled,
          allowed: !!shopId && hasShopPermission(user, shopId, 'reservations.read'),
          timezone: shop?.timezone ?? null,
        })),
        distinctUntilChanged(
          (a, b) =>
            a.shopId === b.shopId &&
            a.enabled === b.enabled &&
            a.allowed === b.allowed &&
            a.timezone === b.timezone,
        ),
        switchMap(({ shopId, enabled, allowed, timezone }) => {
          if (!shopId || !enabled || !allowed) {
            this.lastShopId = shopId;
            this.lastPending = null;
            this.todayGuests.set(0);
            this.pendingRequests.set(0);
            return EMPTY;
          }
          return interval(60_000).pipe(
            startWith(0),
            switchMap(() => this.fetchInbox(shopId, timezone)),
          );
        }),
        distinctUntilChanged((a, b) => a.guests === b.guests && a.pending === b.pending),
      )
      .subscribe((inbox) => this.applyInbox(inbox));

    this.live
      .watch(
        computed(() => this.shops.selectedShop()?.slug ?? null),
        ['reservations'],
      )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.refresh());
  }

  refresh(): void {
    const shopId = this.shops.selectedShopId();
    const user = this.auth.currentUser();
    const shop = this.shops.selectedShop();
    if (
      !shopId ||
      !shop?.reservationsEnabled ||
      !hasShopPermission(user, shopId, 'reservations.read')
    ) {
      this.lastPending = null;
      this.todayGuests.set(0);
      this.pendingRequests.set(0);
      return;
    }
    this.fetchInbox(shopId, shop.timezone).subscribe((inbox) => this.applyInbox(inbox));
  }

  private applyInbox(inbox: { guests: number; pending: number }): void {
    const shopId = this.shops.selectedShopId();
    if (shopId !== this.lastShopId) {
      this.lastShopId = shopId;
      this.lastPending = null;
    }
    const pending = inbox.pending;
    if (this.lastPending != null && pending > this.lastPending) {
      const now = Date.now();
      if (now - this.lastChimeAt > 2500) {
        this.lastChimeAt = now;
        playReservationPendingSound();
      }
    }
    this.lastPending = pending;
    this.todayGuests.set(inbox.guests);
    this.pendingRequests.set(pending);
  }

  private fetchInbox(shopId: string, timezone?: string | null) {
    const today = resolveShopCalendarDate(new Date(), { timezone });
    return forkJoin({
      guests: this.api.listReservations(shopId, today).pipe(
        map((res) =>
          (res.reservations ?? [])
            .filter((r) => isActiveReservationStatus(r.status))
            .reduce((s, r) => s + Number(r.partySize || 0), 0),
        ),
        catchError(() => of(0)),
      ),
      pending: this.api.pendingReservationRequestsCount(shopId).pipe(
        map((r) => Number(r.count || 0)),
        catchError(() => of(0)),
      ),
    });
  }
}
