import { Injectable, Injector, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  Subject,
  catchError,
  debounceTime,
  forkJoin,
  interval,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { NotificationsApiService } from './notifications-api.service';

/**
 * Estado compartido de notificaciones (badge toolbar + badge por local).
 * Se refresca con polling, al cambiar de local y tras cualquier llamada a la API.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsInboxService {
  private readonly api = inject(NotificationsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);

  readonly unreadCount = signal(0);
  readonly unreadByShop = signal<Record<string, number>>({});

  private readonly refresh$ = new Subject<void>();
  private started = false;

  /** Arranca listeners una sola vez (evita trabajo antes del login). */
  ensureStarted(): void {
    if (this.started) return;
    this.started = true;

    this.refresh$
      .pipe(
        debounceTime(350),
        switchMap(() => {
          if (!this.auth.getToken()) {
            this.clear();
            return of(null);
          }
          const shopId = this.shops.selectedShopId();
          return forkJoin({
            count: this.api.unreadCount(shopId).pipe(
              catchError(() => of({ count: 0 })),
            ),
            byShop: this.api.unreadCountsByShop().pipe(
              catchError(() => of({ counts: {} as Record<string, number> })),
            ),
          });
        }),
      )
      .subscribe((res) => {
        if (!res) return;
        this.unreadCount.set(Math.max(0, Number(res.count?.count) || 0));
        this.unreadByShop.set(res.byShop?.counts ?? {});
      });

    toObservable(this.shops.selectedShopId, { injector: this.injector }).subscribe(() => {
      this.refresh();
    });

    toObservable(this.auth.currentUser, { injector: this.injector }).subscribe((user) => {
      if (!user) {
        this.clear();
        return;
      }
      this.refresh();
    });

    // Backup si no hay tráfico de API (p. ej. app abierta en idle).
    interval(45000)
      .pipe(startWith(0))
      .subscribe(() => {
        if (this.auth.getToken()) this.refresh();
      });
  }

  refresh(): void {
    this.ensureStarted();
    if (!this.auth.getToken()) {
      this.clear();
      return;
    }
    this.refresh$.next();
  }

  clear(): void {
    this.unreadCount.set(0);
    this.unreadByShop.set({});
  }
}
