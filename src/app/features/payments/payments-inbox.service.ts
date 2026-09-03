import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  distinctUntilChanged,
  of,
  switchMap,
} from 'rxjs';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { InboxPollService } from '../../core/inbox/inbox-poll.service';
import { PaymentsApiService } from './payments-api.service';

/** Contador de pagos pendientes (validar / abonar) para badges de menú. */
@Injectable({ providedIn: 'root' })
export class PaymentsInboxService {
  private readonly api = inject(PaymentsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly poll = inject(InboxPollService);

  readonly pendingCount = signal(0);
  readonly pendingSupplierCount = signal(0);
  readonly pendingServiceCount = signal(0);
  readonly pendingEmployeeCount = signal(0);
  readonly pendingPartnerCount = signal(0);

  constructor() {
    toObservable(this.shops.selectedShopId)
      .pipe(
        switchMap((shopId) => {
          const user = this.auth.currentUser();
          if (!shopId || !hasShopPermission(user, shopId, 'payments.read')) {
            this.clear();
            return of({ total: 0, suppliers: 0, services: 0, employees: 0, partners: 0 });
          }
          return this.poll.tick$.pipe(
            switchMap(() =>
              this.api.pendingCounts(shopId).pipe(
                catchError(() =>
                  of({ total: 0, suppliers: 0, services: 0, employees: 0, partners: 0 }),
                ),
              ),
            ),
          );
        }),
        distinctUntilChanged(
          (a, b) =>
            a.total === b.total &&
            a.suppliers === b.suppliers &&
            a.services === b.services &&
            a.employees === b.employees &&
            a.partners === b.partners,
        ),
      )
      .subscribe((c) => this.apply(c));
  }

  refresh(): void {
    const shopId = this.shops.selectedShopId();
    const user = this.auth.currentUser();
    if (!shopId || !hasShopPermission(user, shopId, 'payments.read')) {
      this.clear();
      return;
    }
    this.api.pendingCounts(shopId).subscribe({
      next: (c) => this.apply(c),
      error: () => this.clear(),
    });
  }

  private apply(c: {
    total: number;
    suppliers: number;
    services: number;
    employees: number;
    partners: number;
  }) {
    this.pendingCount.set(c.total);
    this.pendingSupplierCount.set(c.suppliers);
    this.pendingServiceCount.set(c.services);
    this.pendingEmployeeCount.set(c.employees);
    this.pendingPartnerCount.set(c.partners);
  }

  private clear() {
    this.apply({ total: 0, suppliers: 0, services: 0, employees: 0, partners: 0 });
  }
}
