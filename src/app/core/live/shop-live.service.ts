import { Injectable, Signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Observable,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  switchMap,
} from 'rxjs';
import { environment } from '../../../environments/environment';

export type ShopLiveDomain = 'reservations' | 'waiting' | 'attendance';

export type ShopLiveTick = { domain: ShopLiveDomain | 'hello'; at: number };

@Injectable({ providedIn: 'root' })
export class ShopLiveClient {
  connect(slug: string): Observable<ShopLiveTick> {
    const key = String(slug ?? '').trim();
    if (!key) return EMPTY;
    const url = `${environment.apiUrl}/public/shops/${encodeURIComponent(key)}/live`;
    return new Observable((subscriber) => {
      let source: EventSource | null = null;
      let retry: ReturnType<typeof setTimeout> | null = null;
      let closed = false;

      const open = () => {
        if (closed) return;
        source = new EventSource(url);
        source.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data) as ShopLiveTick;
            if (data?.domain && data.domain !== 'hello') subscriber.next(data);
          } catch {
            /* ignore */
          }
        };
        source.onerror = () => {
          if (closed) return;
          source?.close();
          source = null;
          retry = setTimeout(open, 3000);
        };
      };

      open();
      return () => {
        closed = true;
        if (retry) clearTimeout(retry);
        source?.close();
      };
    });
  }

  watch(
    slug: Signal<string | null | undefined>,
    domains: ShopLiveDomain[],
  ): Observable<ShopLiveTick> {
    const allowed = new Set(domains);
    return toObservable(slug).pipe(
      map((slug) => String(slug ?? '').trim()),
      distinctUntilChanged(),
      switchMap((slug) => (slug ? this.connect(slug) : EMPTY)),
      filter((tick) => allowed.has(tick.domain as ShopLiveDomain)),
      debounceTime(280),
    );
  }
}
