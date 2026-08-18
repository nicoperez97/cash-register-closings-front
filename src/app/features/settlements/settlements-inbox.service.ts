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
  tap,
} from 'rxjs';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { closingSourceKindEnablesSettlements } from '../closings/closings-api.service';
import { ClosingsApiService } from '../closings/closings-api.service';
import { SettlementsApiService } from './settlements-api.service';

/** Contador de rendiciones pendientes y visibilidad del módulo. */
@Injectable({ providedIn: 'root' })
export class SettlementsInboxService {
  private readonly api = inject(SettlementsApiService);
  private readonly closingsApi = inject(ClosingsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);

  readonly enabled = signal(false);
  readonly pendingCount = signal(0);

  constructor() {
    toObservable(this.shops.selectedShopId)
      .pipe(
        switchMap((shopId) => {
          const user = this.auth.currentUser();
          const shop = this.shops.selectedShop();
          const canRead = !!(shopId && hasShopPermission(user, shopId, 'closings.read'));
          this.enabled.set(canRead && !!shop?.settlementsEnabled);
          if (!shopId || !canRead) {
            this.pendingCount.set(0);
            return of(0);
          }
          return this.closingsApi.listClosingSources(shopId, true).pipe(
            catchError(() => of([])),
            tap((rows) =>
              this.enabled.set(rows.some((s) => closingSourceKindEnablesSettlements(s.kind))),
            ),
            switchMap(() => {
              if (!this.enabled()) {
                this.pendingCount.set(0);
                return of(0);
              }
              return interval(45000).pipe(
                startWith(0),
                switchMap(() =>
                  this.api.listPending(shopId).pipe(
                    map((rows) => rows.length),
                    catchError(() => of(0)),
                  ),
                ),
              );
            }),
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
      this.enabled.set(false);
      this.pendingCount.set(0);
      return;
    }
    this.closingsApi.listClosingSources(shopId, true).subscribe({
      next: (rows) => {
        const on = rows.some((s) => closingSourceKindEnablesSettlements(s.kind));
        this.enabled.set(on);
        if (!on) {
          this.pendingCount.set(0);
          return;
        }
        this.api.listPending(shopId).subscribe({
          next: (pending) => this.pendingCount.set(pending.length),
          error: () => this.pendingCount.set(0),
        });
      },
      error: () => {
        this.enabled.set(!!this.shops.selectedShop()?.settlementsEnabled);
        this.pendingCount.set(0);
      },
    });
  }
}
