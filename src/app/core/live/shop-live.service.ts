import { Injectable, Signal, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Observable,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  share,
  switchMap,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export type ShopLiveDomain = 'reservations' | 'waiting' | 'attendance' | 'inbox';

export type ShopLiveTick = { domain: ShopLiveDomain | 'hello'; at: number };

/**
 * Una sola EventSource por URL. Varios watch()/connect() al mismo slug
 * reutilizan el socket (HTTP/1.1 solo admite ~6 conexiones por host).
 */
@Injectable({ providedIn: 'root' })
export class ShopLiveClient {
  private readonly auth = inject(AuthService);
  private readonly sharedStreams = new Map<string, Observable<ShopLiveTick>>();

  /** Salón / presentismo públicos (por slug). */
  connect(slug: string): Observable<ShopLiveTick> {
    const key = String(slug ?? '').trim();
    if (!key) return EMPTY;
    const url = `${environment.apiUrl}/public/shops/${encodeURIComponent(key)}/live`;
    return this.shared(url);
  }

  /** Badges autenticados (JWT en query; EventSource no manda Authorization). */
  connectAuth(shopId: string): Observable<ShopLiveTick> {
    const id = String(shopId ?? '').trim();
    const token = this.auth.getToken();
    if (!id || !token) return EMPTY;
    const url = `${environment.apiUrl}/shops/${encodeURIComponent(id)}/live?access_token=${encodeURIComponent(token)}`;
    return this.shared(url);
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

  watchInbox(shopId: Signal<string | null | undefined>): Observable<ShopLiveTick> {
    return toObservable(shopId).pipe(
      map((id) => String(id ?? '').trim()),
      distinctUntilChanged(),
      switchMap((id) => (id ? this.connectAuth(id) : EMPTY)),
      filter((tick) => tick.domain === 'inbox'),
      debounceTime(200),
    );
  }

  private shared(url: string): Observable<ShopLiveTick> {
    let stream = this.sharedStreams.get(url);
    if (!stream) {
      stream = this.openEventSource(url).pipe(share({ resetOnRefCountZero: true }));
      this.sharedStreams.set(url, stream);
    }
    return stream;
  }

  private openEventSource(url: string): Observable<ShopLiveTick> {
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
}
