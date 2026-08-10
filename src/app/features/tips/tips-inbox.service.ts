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
import { TipsApiService } from './tips-api.service';

/** Contador de propinas pendientes de entrega para badges de menú. */
@Injectable({ providedIn: 'root' })
export class TipsInboxService {
  private readonly api = inject(TipsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);

  readonly pendingCount = signal(0);

  constructor() {
    toObservable(this.shops.selectedShopId)
      .pipe(
        switchMap((shopId) => {
          const user = this.auth.currentUser();
          const shop = this.shops.selectedShop();
          if (
            !shopId ||
            !shop?.tipsEnabled ||
            !hasShopPermission(user, shopId, 'tips.read')
          ) {
            this.pendingCount.set(0);
            return of(0);
          }
          return interval(45000).pipe(
            startWith(0),
            switchMap(() =>
              this.api.pendingCount(shopId).pipe(
                map((r) => r.count ?? 0),
                catchError(() => of(0)),
              ),
            ),
          );
        }),
        distinctUntilChanged(),
      )
      .subscribe((count) => this.pendingCount.set(count));
  }

  refresh(): void {
    const shopId = this.shops.selectedShopId();
    const user = this.auth.currentUser();
    const shop = this.shops.selectedShop();
    if (
      !shopId ||
      !shop?.tipsEnabled ||
      !hasShopPermission(user, shopId, 'tips.read')
    ) {
      this.pendingCount.set(0);
      return;
    }
    this.api.pendingCount(shopId).subscribe({
      next: (r) => this.pendingCount.set(r.count ?? 0),
      error: () => this.pendingCount.set(0),
    });
  }
}
