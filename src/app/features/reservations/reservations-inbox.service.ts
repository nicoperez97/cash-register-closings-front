import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
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
import { ReservationsApiService } from './reservations-api.service';
import { isActiveReservationStatus } from './reservation-status';

/** Comensales del día actual para badge de menú «Reservas». */
@Injectable({ providedIn: 'root' })
export class ReservationsInboxService {
  private readonly api = inject(ReservationsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);

  /** Total de comensales del día calendario del local. */
  readonly todayGuests = signal(0);

  constructor() {
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
            this.todayGuests.set(0);
            return of(0);
          }
          return interval(45000).pipe(
            startWith(0),
            switchMap(() => this.fetchTodayGuests(shopId, timezone)),
          );
        }),
        distinctUntilChanged(),
      )
      .subscribe((count) => this.todayGuests.set(count));
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
      this.todayGuests.set(0);
      return;
    }
    this.fetchTodayGuests(shopId, shop.timezone).subscribe((count) =>
      this.todayGuests.set(count),
    );
  }

  private fetchTodayGuests(shopId: string, timezone?: string | null) {
    const today = resolveShopCalendarDate(new Date(), { timezone });
    return this.api.listReservations(shopId, today).pipe(
      map((res) =>
        (res.reservations ?? [])
          .filter((r) => isActiveReservationStatus(r.status))
          .reduce((s, r) => s + Number(r.partySize || 0), 0),
      ),
      catchError(() => of(0)),
    );
  }
}
