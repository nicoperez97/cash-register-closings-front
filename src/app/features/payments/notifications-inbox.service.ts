import { Injectable, Injector, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  Subject,
  catchError,
  debounceTime,
  forkJoin,
  of,
  switchMap,
} from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { PageRefreshService } from '../../core/page-refresh.service';
import { InboxPollService } from '../../core/inbox/inbox-poll.service';
import { NotificationsApiService } from './notifications-api.service';
import { syncAppBadge } from '../../shared/utils/app-badge';

/**
 * Estado compartido de notificaciones (badge toolbar + badge por local + ícono PWA).
 * Se refresca con polling, al cambiar de local y tras cualquier llamada a la API.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsInboxService {
  private readonly api = inject(NotificationsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly pageRefresh = inject(PageRefreshService);
  private readonly poll = inject(InboxPollService);

  readonly unreadCount = signal(0);
  readonly unreadByShop = signal<Record<string, number>>({});

  private readonly refresh$ = new Subject<void>();
  private started = false;
  /** -1 = todavía no hay baseline (login / cambio de local). */
  private lastShopUnread = -1;

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
            // Total global para el número del ícono en el celular (todos los locales).
            total: this.api.unreadCount().pipe(
              catchError(() => of({ count: 0 })),
            ),
          });
        }),
      )
      .subscribe((res) => {
        if (!res) return;
        const next = Math.max(0, Number(res.count?.count) || 0);
        const prev = this.lastShopUnread;
        this.unreadCount.set(next);
        this.unreadByShop.set(res.byShop?.counts ?? {});
        void syncAppBadge(Math.max(0, Number(res.total?.count) || 0));
        if (prev >= 0 && next > prev) {
          this.pageRefresh.refreshFromInbox();
        }
        this.lastShopUnread = next;
      });

    toObservable(this.shops.selectedShopId, { injector: this.injector }).subscribe(() => {
      this.lastShopUnread = -1;
      this.refresh();
    });

    toObservable(this.auth.currentUser, { injector: this.injector }).subscribe((user) => {
      if (!user) {
        this.clear();
        return;
      }
      this.refresh();
    });

    this.poll.tick$.subscribe(() => {
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
    this.lastShopUnread = -1;
    this.unreadCount.set(0);
    this.unreadByShop.set({});
    void syncAppBadge(0);
  }
}
