import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
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

/** Comensales del día actual para badge de menú «Reservas». */
@Injectable({ providedIn: 'root' })
export class ReservationsInboxService {
  private readonly api = inject(ReservationsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);

  /** Total de comensales del día calendario del local. */
  readonly todayGuests = signal(0);

  constructor() {
    toObservable(this.shops.selectedShopId)
      .pipe(
        switchMap((shopId) => {
          const user = this.auth.currentUser();
          const shop = this.shops.selectedShop();
          if (
            !shopId ||
            !shop?.reservationsEnabled ||
            !hasShopPermission(user, shopId, 'reservations.read')
          ) {
            this.todayGuests.set(0);
            return of(0);
          }
          return interval(45000).pipe(
            startWith(0),
            switchMap(() => this.fetchTodayGuests(shopId)),
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
    this.fetchTodayGuests(shopId).subscribe((count) => this.todayGuests.set(count));
  }

  private todayIso(): string {
    const shop = this.shops.selectedShop();
    return resolveShopCalendarDate(new Date(), { timezone: shop?.timezone });
  }

  private fetchTodayGuests(shopId: string) {
    const today = this.todayIso();
    return this.api.listReservations(shopId, today).pipe(
      map((res) =>
        (res.reservations ?? [])
          .filter((r) => r.status !== 'CANCELLED')
          .reduce((s, r) => s + Number(r.partySize || 0), 0),
      ),
      catchError(() => of(0)),
    );
  }
}
