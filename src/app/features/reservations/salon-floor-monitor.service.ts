import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  interval,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import {
  ReservationsApiService,
  SalonFloorMonitorPreview,
  SalonFloorMonitorSnapshot,
} from './reservations-api.service';
import {
  bindReservationAlertSoundUnlock,
  playReservationPendingSound,
} from './reservation-alert-sound';

export type SalonFloorPreview = SalonFloorMonitorPreview;

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
  /** Qué métricas mostrar (viene del snapshot / flags del local). */
  readonly showReservationsMetric = signal(false);
  readonly showWaitingMetric = signal(false);

  /** Contador del chip de reservas (= mesas sin marcar ni sentar). */
  readonly pendingReservations = computed(() => this.openReservations());

  readonly enabled = computed(() => {
    const shop = this.shops.selectedShop();
    return !!shop?.salonFloorMonitorEnabled;
  });

  /**
   * Visible si el admin (o el usuario) habilitó el monitor en este local
   * y el local tiene reservas y/o lista de espera. No exige permisos de módulo.
   */
  readonly visible = computed(() => {
    if (!this.enabled()) return false;
    const shopId = this.shops.selectedShopId();
    const shop = this.shops.selectedShop();
    const user = this.auth.currentUser();
    if (!shopId || !shop || !user) return false;
    return shop.reservationsEnabled !== false || shop.waitingListEnabled !== false;
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
          featuresOn:
            shop?.reservationsEnabled !== false || shop?.waitingListEnabled !== false,
          userId: user?.id ?? null,
        })),
        distinctUntilChanged(
          (a, b) =>
            a.shopId === b.shopId &&
            a.monitorOn === b.monitorOn &&
            a.featuresOn === b.featuresOn &&
            a.userId === b.userId,
        ),
        switchMap(({ shopId, monitorOn, featuresOn }) => {
          if (!shopId || !monitorOn || !featuresOn) {
            this.resetCounts(shopId);
            return EMPTY;
          }
          const shop = this.shops.selectedShop();
          this.showReservationsMetric.set(shop?.reservationsEnabled !== false);
          this.showWaitingMetric.set(shop?.waitingListEnabled !== false);
          return interval(60_000).pipe(
            startWith(0),
            switchMap(() => this.fetchSnapshot(shopId)),
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
    if (!shopId || !shop?.salonFloorMonitorEnabled) {
      this.resetCounts(shopId);
      return;
    }
    if (shop.reservationsEnabled === false && shop.waitingListEnabled === false) {
      this.resetCounts(shopId);
      return;
    }
    this.fetchSnapshot(shopId).subscribe((snap) => this.applySnapshot(snap));
  }

  private resetCounts(shopId: string | null): void {
    this.lastShopId = shopId;
    this.lastOpen = null;
    this.lastWaiting = null;
    this.openReservations.set(0);
    this.waitingParties.set(0);
    this.preview.set([]);
    this.lastBumpKind.set(null);
    const shop = this.shops.selectedShop();
    this.showReservationsMetric.set(shop?.reservationsEnabled !== false);
    this.showWaitingMetric.set(shop?.waitingListEnabled !== false);
  }

  clearBump(): void {
    this.lastBumpKind.set(null);
  }

  private applySnapshot(snap: {
    open: number;
    waiting: number;
    preview: SalonFloorPreview[];
    previewKey: string;
    reservationsEnabled: boolean;
    waitingListEnabled: boolean;
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
    this.showReservationsMetric.set(snap.reservationsEnabled);
    this.showWaitingMetric.set(snap.waitingListEnabled);
  }

  private fetchSnapshot(shopId: string) {
    return this.api.salonFloorMonitor(shopId).pipe(
      map((res: SalonFloorMonitorSnapshot) => ({
        open: res.openReservations ?? 0,
        waiting: res.waitingParties ?? 0,
        preview: res.preview ?? [],
        previewKey: (res.preview ?? [])
          .map((p) => `${p.kind}:${p.id}:${p.partySize}`)
          .join('|'),
        reservationsEnabled: !!res.reservationsEnabled,
        waitingListEnabled: !!res.waitingListEnabled,
      })),
      catchError(() =>
        of({
          open: 0,
          waiting: 0,
          preview: [] as SalonFloorPreview[],
          previewKey: '',
          reservationsEnabled: this.shops.selectedShop()?.reservationsEnabled !== false,
          waitingListEnabled: this.shops.selectedShop()?.waitingListEnabled !== false,
        }),
      ),
    );
  }
}
