import { Injectable, inject } from '@angular/core';
import {
  fromEvent,
  interval,
  merge,
  of,
  filter,
  map,
  shareReplay,
} from 'rxjs';
import { ShopContextService } from '../shop/shop-context.service';
import { ShopLiveClient } from '../live/shop-live.service';

const BACKUP_INTERVAL_MS = 120_000;

/**
 * Un solo reloj para badges de menú.
 * Preferencia: SSE autenticado del local; respaldo cada 2 min + al volver a la pestaña.
 */
@Injectable({ providedIn: 'root' })
export class InboxPollService {
  private readonly shops = inject(ShopContextService);
  private readonly live = inject(ShopLiveClient);

  readonly tick$ = merge(
    of(0),
    this.live.watchInbox(this.shops.selectedShopId).pipe(map(() => 0)),
    interval(BACKUP_INTERVAL_MS),
    typeof document === 'undefined'
      ? of()
      : fromEvent(document, 'visibilitychange').pipe(
          filter(() => document.visibilityState === 'visible'),
          map(() => 0),
        ),
  ).pipe(shareReplay({ bufferSize: 1, refCount: true }));
}
