import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
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
import { CashWithdrawalsApiService } from './cash-withdrawals-api.service';

/** Contador de retiros pendientes para badge de menú «A Retirar». */
@Injectable({ providedIn: 'root' })
export class CashWithdrawalsInboxService {
  private readonly api = inject(CashWithdrawalsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly poll = inject(InboxPollService);

  readonly pendingCount = signal(0);

  constructor() {
    toObservable(this.shops.selectedShopId)
      .pipe(
        switchMap((shopId) => {
          const user = this.auth.currentUser();
          if (!shopId || !hasShopPermission(user, shopId, 'cashWithdrawals.read')) {
            this.pendingCount.set(0);
            return of(0);
          }
          return this.poll.tick$.pipe(
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
    if (!shopId || !hasShopPermission(user, shopId, 'cashWithdrawals.read')) {
      this.pendingCount.set(0);
      return;
    }
    this.api.pendingCount(shopId).subscribe({
      next: (r) => this.pendingCount.set(r.count ?? 0),
      error: () => this.pendingCount.set(0),
    });
  }
}
