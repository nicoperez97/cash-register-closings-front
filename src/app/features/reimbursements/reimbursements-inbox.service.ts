import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  of,
  switchMap,
} from 'rxjs';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { InboxPollService } from '../../core/inbox/inbox-poll.service';
import { ReimbursementsApiService } from './reimbursements-api.service';

@Injectable({ providedIn: 'root' })
export class ReimbursementsInboxService {
  private readonly api = inject(ReimbursementsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly poll = inject(InboxPollService);

  readonly pendingCount = signal(0);

  constructor() {
    toObservable(this.shops.selectedShopId)
      .pipe(
        switchMap((shopId) => {
          const user = this.auth.currentUser();
          if (!shopId || !hasShopPermission(user, shopId, 'reimbursements.read')) {
            this.pendingCount.set(0);
            return of({ count: 0 });
          }
          return this.poll.tick$.pipe(
            switchMap(() =>
              this.api.pendingCount(shopId).pipe(catchError(() => of({ count: 0, amount: 0 }))),
            ),
          );
        }),
      )
      .subscribe((res) => this.pendingCount.set(res.count || 0));
  }

  refresh(): void {
    const shopId = this.shops.selectedShopId();
    const user = this.auth.currentUser();
    if (!shopId || !hasShopPermission(user, shopId, 'reimbursements.read')) {
      this.pendingCount.set(0);
      return;
    }
    this.api.pendingCount(shopId).subscribe({
      next: (res) => this.pendingCount.set(res.count || 0),
      error: () => this.pendingCount.set(0),
    });
  }
}
