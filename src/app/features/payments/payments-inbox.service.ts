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
import { PaymentsApiService, ShopPayment } from './payments-api.service';

function isPending(p: ShopPayment): boolean {
  return p.status === 'PENDING_VALIDATION' || p.status === 'VALIDATED';
}

/** Contador de pagos pendientes (validar / abonar) para badges de menú. */
@Injectable({ providedIn: 'root' })
export class PaymentsInboxService {
  private readonly api = inject(PaymentsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);

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
          return interval(45000).pipe(
            startWith(0),
            switchMap(() =>
              this.api.list(shopId).pipe(
                map((rows) => this.countsFrom(rows)),
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
    this.api.list(shopId).subscribe({
      next: (rows) => this.apply(this.countsFrom(rows)),
      error: () => this.clear(),
    });
  }

  private countsFrom(rows: ShopPayment[]) {
    const pending = rows.filter(isPending);
    return {
      total: pending.length,
      suppliers: pending.filter((p) => !!p.supplierId).length,
      services: pending.filter((p) => !!p.serviceId).length,
      employees: pending.filter((p) => !p.supplierId && !p.serviceId && !p.toAccountId).length,
      partners: pending.filter((p) => !!p.toAccountId).length,
    };
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
