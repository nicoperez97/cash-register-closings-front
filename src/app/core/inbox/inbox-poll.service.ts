import { Injectable } from '@angular/core';
import { fromEvent, interval, merge, of, filter, map, shareReplay, startWith } from 'rxjs';

const INTERVAL_MS = 45_000;

/**
 * Un solo reloj para badges de menú. Evita 5–6 `interval(45000)` desfasados
 * pegándole a la API al mismo tiempo.
 */
@Injectable({ providedIn: 'root' })
export class InboxPollService {
  readonly tick$ = merge(
    interval(INTERVAL_MS).pipe(startWith(0)),
    typeof document === 'undefined'
      ? of()
      : fromEvent(document, 'visibilitychange').pipe(
          filter(() => document.visibilityState === 'visible'),
          map(() => 0),
        ),
  ).pipe(shareReplay({ bufferSize: 1, refCount: true }));
}
