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
import { CashWithdrawalsApiService } from './cash-withdrawals-api.service';

/** Contador de retiros pendientes para badge de menú «A Retirar». */
@Injectable({ providedIn: 'root' })
export class CashWithdrawalsInboxService {
  private readonly api = inject(CashWithdrawalsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);

  readonly pendingCount = signal(0);

  constructor() {
    toObservable(this.shops.selectedShopId)
      .pipe(
        switchMap((shopId) => {
          const user = this.auth.currentUser();
          if (!shopId || !hasShopPermission(user, shopId, 'closings.read')) {
            this.pendingCount.set(0);
            return of(0);
          }
          return interval(45000).pipe(
            startWith(0),
            switchMap(() =>
              this.api.listPending(shopId).pipe(
                map((res) => res.items.length),
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
    if (!shopId || !hasShopPermission(user, shopId, 'closings.read')) {
      this.pendingCount.set(0);
      return;
    }
    this.api.listPending(shopId).subscribe({
      next: (res) => this.pendingCount.set(res.items.length),
      error: () => this.pendingCount.set(0),
    });
  }
}
