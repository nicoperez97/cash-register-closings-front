import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  forkJoin,
  interval,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { resolveShopCalendarDate } from '../../core/shop/business-date';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import {
  ReservationRow,
  ReservationsApiService,
  WaitingListRow,
} from './reservations-api.service';
import {
  bindReservationAlertSoundUnlock,
  playReservationPendingSound,
} from './reservation-alert-sound';

export type SalonFloorPreview = {
  kind: 'reservation' | 'waiting';
  id: string;
  label: string;
  partySize: number;
};

/** Solo confirmadas: ni marcadas ni sentadas. */
function isUnmarkedUnseated(status: string | undefined | null): boolean {
  return status === 'CONFIRMED' || status == null || status === '';
}

/** Monitor flotante: mesas confirmadas (sin marcar/sentar) + lista de espera. */
@Injectable({ providedIn: 'root' })
export class SalonFloorMonitorService {
  private readonly api = inject(ReservationsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly live = inject(ShopLiveClient);

  /** Reservas de hoy confirmadas (no marcadas ni sentadas). */
  readonly openReservations = signal(0);
  readonly waitingParties = signal(0);
  readonly preview = signal<SalonFloorPreview[]>([]);
  readonly pulse = signal(0);
  /** Último tipo que subió (para destacar el chip). */
  readonly lastBumpKind = signal<'reservation' | 'waiting' | null>(null);

  /** Contador del chip de reservas (= mesas sin marcar ni sentar). */
  readonly pendingReservations = computed(() => this.openReservations());

  readonly enabled = computed(() => {
    const shop = this.shops.selectedShop();
    return !!shop?.salonFloorMonitorEnabled;
  });

  readonly visible = computed(() => {
    if (!this.enabled()) return false;
    const shopId = this.shops.selectedShopId();
    const shop = this.shops.selectedShop();
    const user = this.auth.currentUser();
    if (!shopId || !shop || !user) return false;
    const reservations =
      !!shop.reservationsEnabled && hasShopPermission(user, shopId, 'reservations.read');
    const waiting =
      !!shop.waitingListEnabled && hasShopPermission(user, shopId, 'waitingList.read');
    return reservations || waiting;
  });

  readonly totalAttention = computed(
    () => this.openReservations() + this.waitingParties(),
  );

  private lastShopId: string | null = null;
  private lastOpen: number | null = null;
  private lastWaiting: number | null = null;
  private lastChimeAt = 0;

  constructor() {
    bindReservationAlertSoundUnlock();
    combineLatest([
      toObservable(this.shops.selectedShopId),
      toObservable(this.shops.selectedShop),
      toObservable(this.auth.currentUser),
    ])
      .pipe(
        map(([shopId, shop, user]) => ({
          shopId,
          monitorOn: !!shop?.salonFloorMonitorEnabled,
          reservationsOn:
            !!shop?.reservationsEnabled &&
            !!shopId &&
            hasShopPermission(user, shopId, 'reservations.read'),
          waitingOn:
            !!shop?.waitingListEnabled &&
            !!shopId &&
            hasShopPermission(user, shopId, 'waitingList.read'),
          timezone: shop?.timezone ?? null,
        })),
        distinctUntilChanged(
          (a, b) =>
            a.shopId === b.shopId &&
            a.monitorOn === b.monitorOn &&
            a.reservationsOn === b.reservationsOn &&
            a.waitingOn === b.waitingOn &&
            a.timezone === b.timezone,
        ),
        switchMap(({ shopId, monitorOn, reservationsOn, waitingOn, timezone }) => {
          if (!shopId || !monitorOn || (!reservationsOn && !waitingOn)) {
            this.resetCounts(shopId);
            return EMPTY;
          }
          return interval(60_000).pipe(
            startWith(0),
            switchMap(() =>
              this.fetchSnapshot(shopId, reservationsOn, waitingOn, timezone),
            ),
          );
        }),
        distinctUntilChanged(
          (a, b) =>
            a.open === b.open && a.waiting === b.waiting && a.previewKey === b.previewKey,
        ),
      )
      .subscribe((snap) => this.applySnapshot(snap));

    this.live
      .watch(
        computed(() => this.shops.selectedShop()?.slug ?? null),
        ['reservations', 'waiting'],
      )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.refresh());
  }

  refresh(): void {
    const shopId = this.shops.selectedShopId();
    const shop = this.shops.selectedShop();
    const user = this.auth.currentUser();
    if (!shopId || !shop?.salonFloorMonitorEnabled || !user) {
      this.resetCounts(shopId);
      return;
    }
    const reservationsOn =
      !!shop.reservationsEnabled && hasShopPermission(user, shopId, 'reservations.read');
    const waitingOn =
      !!shop.waitingListEnabled && hasShopPermission(user, shopId, 'waitingList.read');
    if (!reservationsOn && !waitingOn) {
      this.resetCounts(shopId);
      return;
    }
    this.fetchSnapshot(shopId, reservationsOn, waitingOn, shop.timezone).subscribe((snap) =>
      this.applySnapshot(snap),
    );
  }

  private resetCounts(shopId: string | null): void {
    this.lastShopId = shopId;
    this.lastOpen = null;
    this.lastWaiting = null;
    this.openReservations.set(0);
    this.waitingParties.set(0);
    this.preview.set([]);
    this.lastBumpKind.set(null);
  }

  clearBump(): void {
    this.lastBumpKind.set(null);
  }

  private applySnapshot(snap: {
    open: number;
    waiting: number;
    preview: SalonFloorPreview[];
    previewKey: string;
  }): void {
    const shopId = this.shops.selectedShopId();
    if (shopId !== this.lastShopId) {
      this.lastShopId = shopId;
      this.lastOpen = null;
      this.lastWaiting = null;
    }
    const openUp = this.lastOpen != null && snap.open > this.lastOpen;
    const waitingUp = this.lastWaiting != null && snap.waiting > this.lastWaiting;
    if (openUp || waitingUp) {
      this.lastBumpKind.set(openUp ? 'reservation' : 'waiting');
      this.pulse.update((n) => n + 1);
      const now = Date.now();
      if (now - this.lastChimeAt > 2500) {
        this.lastChimeAt = now;
        playReservationPendingSound();
      }
    }
    this.lastOpen = snap.open;
    this.lastWaiting = snap.waiting;
    this.openReservations.set(snap.open);
    this.waitingParties.set(snap.waiting);
    this.preview.set(snap.preview);
  }

  private fetchSnapshot(
    shopId: string,
    reservationsOn: boolean,
    waitingOn: boolean,
    timezone?: string | null,
  ) {
    const today = resolveShopCalendarDate(new Date(), { timezone });
    return forkJoin({
      dayRows: reservationsOn
        ? this.api.listReservations(shopId, today).pipe(
            map((res) => res.reservations ?? []),
            catchError(() => of([] as ReservationRow[])),
          )
        : of([] as ReservationRow[]),
      waitingRows: waitingOn
        ? this.api.listWaiting(shopId).pipe(catchError(() => of([] as WaitingListRow[])))
        : of([] as WaitingListRow[]),
    }).pipe(
      map(({ dayRows, waitingRows }) => {
        const openRows = dayRows.filter((r) => isUnmarkedUnseated(r.status));
        const waitingActive = waitingRows.filter(
          (r) => r.status === 'WAITING' || r.status === 'READY',
        );
        const preview: SalonFloorPreview[] = [];
        for (const row of openRows.slice(0, 5)) {
          preview.push({
            kind: 'reservation',
            id: row.id,
            label: row.guestName?.trim() || 'Sin nombre',
            partySize: Number(row.partySize || 0) || 1,
          });
        }
        for (const row of waitingActive.slice(0, 3)) {
          preview.push({
            kind: 'waiting',
            id: row.id,
            label: row.guestName?.trim() || 'Sin nombre',
            partySize: Number(row.partySize || 0) || 1,
          });
        }
        return {
          open: openRows.length,
          waiting: waitingActive.length,
          preview,
          previewKey: preview
            .map((p) => `${p.kind}:${p.id}:${p.partySize}`)
            .join('|'),
        };
      }),
    );
  }
}
