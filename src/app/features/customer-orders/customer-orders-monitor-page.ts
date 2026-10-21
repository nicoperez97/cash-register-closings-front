import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, HostListener, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule, MatDateRangePicker } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { catchError, debounceTime, filter, forkJoin, interval, merge, of, switchMap } from 'rxjs';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { formatIsoDateDisplay, resolveShopBusinessDate } from '../../core/shop/business-date';
import {
  resolveCurrentShift,
  shiftHoursLabel,
  shopShiftsOf,
  type ShopShift,
} from '../../core/shop/shop-shifts';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import { usePageRefresh } from '../../core/page-refresh.service';
import { HelpDialogComponent } from '../../shared/components/help-dialog';
import { topicById } from '../../core/help/module-help';
import { formatMoney } from '../../shared/utils/money';
import { copyText } from '../../shared/utils/share-text';
import { MatDialog } from '@angular/material/dialog';
import { environment } from '../../../environments/environment';
import {
  CustomerOrderAudit,
  CustomerOrderFulfillment,
  CustomerOrderPaymentMethod,
  CustomerOrderStatus,
  CustomerOrdersApiService,
  StaffCustomerOrder,
} from './customer-orders-api.service';
import { formatCustomerOrderAuditLabel } from './customer-order-audit.util';
import { isOrderAccredited, orderPaymentText, STATUS_LABEL } from './customer-orders-status.util';
import {
  fulfillmentLabel,
  groupOrderLines,
  paymentLabel,
  OrderLineGroup,
} from './ordering-ui.util';
import { playCustomerOrderPendingSound, bindReservationAlertSoundUnlock } from '../reservations/reservation-alert-sound';

type BoardColumnId = 'pending' | 'kitchen' | 'ready' | 'delivery' | 'done' | 'cancelled';
const BOARD_COLUMNS: Array<{
  id: BoardColumnId;
  title: string;
  statuses: CustomerOrderStatus[];
}> = [
  { id: 'pending', title: 'Pendientes', statuses: ['PENDING'] },
  { id: 'kitchen', title: 'En cocina', statuses: ['ACCEPTED', 'PREPARING'] },
  { id: 'ready', title: 'Listos', statuses: ['READY'] },
  { id: 'delivery', title: 'En camino', statuses: ['OUT_FOR_DELIVERY'] },
  { id: 'done', title: 'Completados', statuses: ['COMPLETED'] },
  { id: 'cancelled', title: 'Cancelados', statuses: ['CANCELLED'] },
];

const ALL_STATUSES =
  'PENDING,ACCEPTED,PREPARING,READY,OUT_FOR_DELIVERY,COMPLETED,CANCELLED';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoDate(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseIsoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

type MenuMaps = {
  countsAsUnits: Map<string, boolean>;
  categoryByItem: Map<string, string>;
};

function buildMenuMaps(menus: unknown): MenuMaps {
  const countsAsUnits = new Map<string, boolean>();
  const categoryByItem = new Map<string, string>();
  const list = Array.isArray(menus) ? menus : [];
  for (const menu of list) {
    const sections = (menu as { sections?: unknown })?.sections;
    if (!Array.isArray(sections)) continue;
    for (const sec of sections) {
      const sectionCounts =
        (sec as { countsAsUnits?: unknown })?.countsAsUnits === undefined ||
        (sec as { countsAsUnits?: unknown })?.countsAsUnits === null
          ? true
          : !!(sec as { countsAsUnits?: unknown }).countsAsUnits;
      const items = (sec as { items?: unknown })?.items;
      if (!Array.isArray(items)) continue;
      for (const it of items) {
        const id = String((it as { id?: unknown })?.id ?? '').trim();
        if (!id) continue;
        const raw = (it as { countsAsUnits?: unknown })?.countsAsUnits;
        const counts =
          raw === undefined || raw === null ? sectionCounts : !!raw;
        countsAsUnits.set(id, counts);
        const categoryId = String((it as { categoryId?: unknown })?.categoryId ?? '').trim();
        if (categoryId) categoryByItem.set(id, categoryId);
      }
    }
  }
  return { countsAsUnits, categoryByItem };
}

@Component({
  selector: 'app-customer-orders-monitor-page',
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './customer-orders-monitor-page.html',
  styleUrl: './customer-orders-monitor-page.scss',
})
export class CustomerOrdersMonitorPage {
  private readonly api = inject(CustomerOrdersApiService);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly live = inject(ShopLiveClient);
  private readonly dialog = inject(MatDialog);
  readonly shops = inject(ShopContextService);
  private readonly datePicker = viewChild<MatDateRangePicker<Date>>('picker');

  readonly orders = signal<StaffCustomerOrder[]>([]);
  readonly loading = signal(false);
  readonly now = signal(Date.now());
  readonly filterFrom = signal<string | null>(null);
  readonly filterTo = signal<string | null>(null);
  readonly filterShiftIds = signal<string[]>([]);
  readonly filterCategoryId = signal('');
  readonly filterEditedOnly = signal(false);
  readonly filterFulfillment = signal<CustomerOrderFulfillment | ''>('');
  readonly filterPaymentMethod = signal<CustomerOrderPaymentMethod | ''>('');
  readonly shiftMenuOpen = signal(false);
  readonly categoryMenuOpen = signal(false);
  readonly fulfillmentMenuOpen = signal(false);
  readonly paymentMenuOpen = signal(false);
  readonly posCategories = signal<Array<{ id: string; name: string }>>([]);

  readonly fulfillmentOptions: Array<{ value: CustomerOrderFulfillment; label: string }> = [
    { value: 'TAKEAWAY', label: fulfillmentLabel('TAKEAWAY') },
    { value: 'DELIVERY', label: fulfillmentLabel('DELIVERY') },
    { value: 'COUNTER', label: fulfillmentLabel('COUNTER') },
  ];

  readonly paymentOptions: Array<{ value: CustomerOrderPaymentMethod; label: string }> = [
    { value: 'CASH', label: paymentLabel('CASH') },
    { value: 'TRANSFER', label: paymentLabel('TRANSFER') },
    { value: 'CARD', label: paymentLabel('CARD') },
  ];
  private readonly countsAsUnitsByItem = signal<Map<string, boolean>>(new Map());
  private readonly categoryByItem = signal<Map<string, string>>(new Map());
  private lastKnownIds = new Set<string>();
  private skipChime = true;
  private loadGen = 0;

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });
  readonly shiftIdsCtrl = new FormControl<string[]>([], { nonNullable: true });

  readonly shiftOptions = computed(() => shopShiftsOf(this.shops.selectedShop()));

  readonly selectedCategoryLabel = computed(() => {
    const id = this.filterCategoryId();
    if (!id) return 'Rubro';
    return this.posCategories().find((c) => c.id === id)?.name || 'Rubro';
  });

  readonly selectedFulfillmentLabel = computed(() => {
    const v = this.filterFulfillment();
    if (!v) return 'Tipo';
    return this.fulfillmentOptions.find((o) => o.value === v)?.label || 'Tipo';
  });

  readonly selectedPaymentLabel = computed(() => {
    const v = this.filterPaymentMethod();
    if (!v) return 'Pago';
    return this.paymentOptions.find((o) => o.value === v)?.label || 'Pago';
  });

  /** Pedidos visibles según filtros de rubro / editados / canal / pago. */
  readonly visibleOrders = computed(() => {
    let rows = this.orders();
    const cat = this.filterCategoryId();
    if (cat) {
      const map = this.categoryByItem();
      rows = rows.filter((o) =>
        (o.items ?? []).some((line) => {
          if (String(line.kind || 'ITEM').toUpperCase() === 'EXTRA') return false;
          const mid = String(line.menuItemId ?? '').trim();
          return !!mid && map.get(mid) === cat;
        }),
      );
    }
    if (this.filterEditedOnly()) {
      rows = rows.filter((o) => (o.editCount ?? 0) > 0 || (o.edits?.length ?? 0) > 0);
    }
    const fulfillment = this.filterFulfillment();
    if (fulfillment) {
      rows = rows.filter((o) => o.fulfillment === fulfillment);
    }
    const payment = this.filterPaymentMethod();
    if (payment) {
      rows = rows.filter((o) => o.paymentMethod === payment);
    }
    return rows;
  });

  readonly isLiveView = computed(() => {
    this.now();
    this.shops.selectedShop();
    const from = this.filterFrom();
    const to = this.filterTo();
    const selected = this.filterShiftIds();
    const live = this.liveDefaults();
    if (!from || !to || !live) return false;
    return (
      from === live.date &&
      to === live.date &&
      selected.length === 1 &&
      selected[0] === live.shiftId
    );
  });

  readonly periodLabel = computed(() => {
    const from = this.filterFrom();
    const to = this.filterTo();
    if (!from || !to) return 'Día';
    if (from === to) return formatIsoDateDisplay(from);
    return `${formatIsoDateDisplay(from)} – ${formatIsoDateDisplay(to)}`;
  });

  readonly selectedShiftLabel = computed(() => {
    const ids = this.filterShiftIds();
    const opts = this.shiftOptions();
    if (!ids.length) return 'Turnos';
    const names = ids
      .map((id) => opts.find((s) => s.id === id)?.name)
      .filter((n): n is string => !!n);
    if (!names.length) return `${ids.length} turno${ids.length === 1 ? '' : 's'}`;
    if (names.length === 1) return names[0];
    if (names.length === 2) return names.join(', ');
    return `${names.length} turnos`;
  });

  readonly countPill = computed(() => {
    const n = this.summary().totalCount;
    if (this.isLiveView()) return `${n} del turno`;
    if (this.filterShiftIds().length === 1 && this.filterFrom() === this.filterTo()) {
      return `${n} del turno`;
    }
    return `${n} pedido${n === 1 ? '' : 's'}`;
  });

  readonly summaryTitle = computed(() =>
    this.isLiveView() ||
    (this.filterShiftIds().length === 1 && this.filterFrom() === this.filterTo())
      ? 'Resumen del turno'
      : 'Resumen',
  );

  readonly emptyMessage = computed(() => {
    if (!this.filterShiftIds().length && !this.isLiveView()) {
      return 'Elegí al menos un turno para ver pedidos.';
    }
    if (
      this.filterEditedOnly() ||
      this.filterFulfillment() ||
      this.filterPaymentMethod() ||
      this.filterCategoryId()
    ) {
      return 'No hay pedidos con esos filtros.';
    }
    if (this.isLiveView()) {
      return 'No hay pedidos en este turno. Cuando confirmen en /pedir, aparecen acá.';
    }
    return 'No hay pedidos para el día y los turnos elegidos.';
  });

  /** Solo columnas con al menos un pedido. */
  readonly boardColumns = computed(() => {
    const rows = this.visibleOrders();
    return BOARD_COLUMNS.map((col) => ({
      ...col,
      orders: rows
        .filter((o) => col.statuses.includes(o.status))
        .sort((a, b) => {
          const aKey =
            col.id === 'done'
              ? String(a.completedAt ?? a.createdAt ?? '')
              : col.id === 'cancelled'
                ? String(a.cancelledAt ?? a.createdAt ?? '')
                : String(a.createdAt ?? '');
          const bKey =
            col.id === 'done'
              ? String(b.completedAt ?? b.createdAt ?? '')
              : col.id === 'cancelled'
                ? String(b.cancelledAt ?? b.createdAt ?? '')
                : String(b.createdAt ?? '');
          return aKey.localeCompare(bKey);
        }),
    })).filter((col) => col.orders.length > 0);
  });

  readonly unitsLabel = computed(() => {
    const label = String(this.shops.selectedShop()?.unitsLabel ?? '').trim();
    return label || 'Unidades';
  });

  readonly summary = computed(() => {
    const rows = this.visibleOrders();
    const countsMap = this.countsAsUnitsByItem();
    const catFilter = this.filterCategoryId();
    const catMap = this.categoryByItem();
    const count = (pred: (o: StaffCustomerOrder) => boolean) => rows.filter(pred).length;
    const open = count(
      (o) =>
        o.status !== 'COMPLETED' &&
        o.status !== 'CANCELLED',
    );
    const done = count((o) => o.status === 'COMPLETED');
    const cancelled = count((o) => o.status === 'CANCELLED');
    const takeaway = count((o) => o.fulfillment === 'TAKEAWAY');
    const delivery = count((o) => o.fulfillment === 'DELIVERY');
    const counter = count((o) => o.fulfillment === 'COUNTER');
    const accredited = count((o) => isOrderAccredited(o));
    const total = rows
      .filter((o) => o.status !== 'CANCELLED')
      .reduce((s, o) => s + (Number(o.total) || 0), 0);
    // Misma regla que el cierre: COMPLETED + countsAsUnits (y rubro si hay filtro).
    const unitsSold = rows
      .filter((o) => o.status === 'COMPLETED')
      .reduce((sum, o) => {
        for (const line of o.items ?? []) {
          if (String(line.kind || 'ITEM').toUpperCase() === 'EXTRA') continue;
          const mid = String(line.menuItemId ?? '').trim();
          if (mid && countsMap.has(mid) && countsMap.get(mid) === false) continue;
          if (catFilter && mid && catMap.get(mid) !== catFilter) continue;
          if (catFilter && !mid) continue;
          sum += Math.max(0, Number(line.qty) || 0);
        }
        return sum;
      }, 0);
    return {
      totalCount: rows.length,
      open,
      done,
      cancelled,
      takeaway,
      delivery,
      counter,
      accredited,
      pendingPay: Math.max(0, rows.length - accredited),
      total,
      unitsSold,
    };
  });

  readonly clockLabel = computed(() =>
    new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(
      this.now(),
    ),
  );

  constructor() {
    bindReservationAlertSoundUnlock();
    usePageRefresh(() => this.reload());
    this.resetToLive();

    interval(20_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.now.set(Date.now()));

    toObservable(this.shops.selectedShopId)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.lastKnownIds = new Set();
        this.skipChime = true;
        this.filterCategoryId.set('');
        this.filterEditedOnly.set(false);
        this.filterFulfillment.set('');
        this.filterPaymentMethod.set('');
        this.resetToLive();
        this.loadMenuMaps();
        this.reload();
      });

    merge(this.range.valueChanges, this.shiftIdsCtrl.valueChanges)
      .pipe(debounceTime(200), takeUntilDestroyed())
      .subscribe(() => {
        this.syncFilterSignals();
        this.lastKnownIds = new Set();
        this.skipChime = true;
        this.reload();
      });

    toObservable(this.shops.selectedShopId)
      .pipe(
        switchMap((id) => {
          const shopId = String(id ?? '').trim();
          if (!shopId) return of(null);
          return this.live.connectAuth(shopId).pipe(
            filter((t) => t.domain === 'customer-orders'),
            debounceTime(250),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((tick) => {
        if (tick) this.reload();
      });
  }

  shiftHours(shift: ShopShift): string {
    return shiftHoursLabel(shift);
  }

  private closeAllFilterMenus(): void {
    this.shiftMenuOpen.set(false);
    this.categoryMenuOpen.set(false);
    this.fulfillmentMenuOpen.set(false);
    this.paymentMenuOpen.set(false);
  }

  openDatePicker(): void {
    this.closeAllFilterMenus();
    this.datePicker()?.open();
  }

  toggleShiftMenu(event?: Event): void {
    event?.stopPropagation();
    const next = !this.shiftMenuOpen();
    this.closeAllFilterMenus();
    this.shiftMenuOpen.set(next);
  }

  toggleCategoryMenu(event?: Event): void {
    event?.stopPropagation();
    const next = !this.categoryMenuOpen();
    this.closeAllFilterMenus();
    this.categoryMenuOpen.set(next);
  }

  toggleFulfillmentMenu(event?: Event): void {
    event?.stopPropagation();
    const next = !this.fulfillmentMenuOpen();
    this.closeAllFilterMenus();
    this.fulfillmentMenuOpen.set(next);
  }

  togglePaymentMenu(event?: Event): void {
    event?.stopPropagation();
    const next = !this.paymentMenuOpen();
    this.closeAllFilterMenus();
    this.paymentMenuOpen.set(next);
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.closeAllFilterMenus();
  }

  isShiftSelected(id: string): boolean {
    return this.filterShiftIds().includes(id);
  }

  toggleShift(id: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const cur = this.shiftIdsCtrl.value;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    this.filterShiftIds.set(next);
    this.shiftIdsCtrl.setValue(next);
  }

  selectCategory(id: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.filterCategoryId.set(id);
    this.categoryMenuOpen.set(false);
  }

  toggleEditedOnly(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.closeAllFilterMenus();
    this.filterEditedOnly.update((v) => !v);
  }

  selectFulfillment(value: CustomerOrderFulfillment | '', event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.filterFulfillment.set(value);
    this.fulfillmentMenuOpen.set(false);
  }

  selectPayment(value: CustomerOrderPaymentMethod | '', event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.filterPaymentMethod.set(value);
    this.paymentMenuOpen.set(false);
  }

  auditLabel(a: CustomerOrderAudit): string {
    return formatCustomerOrderAuditLabel(a);
  }

  orderEdits(order: StaffCustomerOrder): CustomerOrderAudit[] {
    return order.edits ?? [];
  }

  resetToLive(): void {
    const live = this.liveDefaults();
    if (!live) {
      const today = new Date();
      this.range.setValue({ start: today, end: today }, { emitEvent: false });
      this.shiftIdsCtrl.setValue([], { emitEvent: false });
      this.syncFilterSignals();
      return;
    }
    const day = parseIsoToLocalDate(live.date);
    this.range.setValue({ start: day, end: day }, { emitEvent: false });
    this.shiftIdsCtrl.setValue([live.shiftId], { emitEvent: false });
    this.syncFilterSignals();
  }

  goLive(): void {
    this.lastKnownIds = new Set();
    this.skipChime = true;
    this.resetToLive();
    this.reload();
  }

  private syncFilterSignals(): void {
    this.filterFrom.set(toIsoDate(this.range.controls.start.value));
    this.filterTo.set(toIsoDate(this.range.controls.end.value));
    this.filterShiftIds.set([...this.shiftIdsCtrl.value.filter(Boolean)]);
  }

  statusLabel(s: CustomerOrderStatus): string {
    return STATUS_LABEL[s] ?? s;
  }

  isAccredited(order: StaffCustomerOrder): boolean {
    return isOrderAccredited(order);
  }

  paymentText(order: StaffCustomerOrder): string {
    return orderPaymentText(order);
  }

  money(n: number): string {
    return formatMoney(n);
  }

  itemGroups(order: StaffCustomerOrder): OrderLineGroup[] {
    return groupOrderLines(order.items);
  }

  channel(order: StaffCustomerOrder): string {
    if (order.fulfillment === 'DELIVERY') return 'Delivery';
    if (order.fulfillment === 'COUNTER') return 'Mostrador';
    return 'Take away';
  }

  ageLabel(iso?: string | null): string {
    if (!iso) return '';
    const min = Math.max(0, Math.floor((this.now() - new Date(iso).getTime()) / 60_000));
    if (min < 1) return 'ahora';
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)} h`;
  }

  cardTime(order: StaffCustomerOrder): string | null {
    if (order.status === 'COMPLETED') return order.completedAt ?? order.createdAt ?? null;
    if (order.status === 'CANCELLED') return order.cancelledAt ?? order.createdAt ?? null;
    return order.createdAt ?? null;
  }

  async copyCode(code: string): Promise<void> {
    const ok = await copyText(code);
    this.snack.open(ok ? `Código ${code} copiado` : 'No se pudo copiar', 'OK', { duration: 2000 });
  }

  openHelp(): void {
    const topic = topicById('customer-orders-monitor');
    if (!topic) return;
    this.dialog.open(HelpDialogComponent, {
      data: { topic, blocks: topic.blocks },
      autoFocus: 'dialog',
      width: 'min(560px, 94vw)',
    });
  }

  private loadMenuMaps(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.countsAsUnitsByItem.set(new Map());
      this.categoryByItem.set(new Map());
      this.posCategories.set([]);
      return;
    }
    forkJoin({
      menu: this.http
        .get<{ menus?: unknown }>(`${environment.apiUrl}/shops/${shopId}/menu`)
        .pipe(catchError(() => of({ menus: [] as unknown[] }))),
      categories: this.http
        .get<Array<{ id?: string; name?: string; active?: boolean }>>(
          `${environment.apiUrl}/shops/${shopId}/pos-categories`,
        )
        .pipe(catchError(() => of([] as Array<{ id?: string; name?: string; active?: boolean }>))),
    }).subscribe(({ menu, categories }) => {
      const maps = buildMenuMaps(menu?.menus);
      this.countsAsUnitsByItem.set(maps.countsAsUnits);
      this.categoryByItem.set(maps.categoryByItem);
      this.posCategories.set(
        (categories ?? [])
          .filter((r) => r.active !== false)
          .map((r) => ({
            id: String(r.id ?? '').trim(),
            name: String(r.name ?? '').trim(),
          }))
          .filter((r) => r.id && r.name)
          .sort((a, b) => a.name.localeCompare(b.name, 'es')),
      );
    });
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.orders.set([]);
      this.loading.set(false);
      return;
    }
    const from = this.filterFrom();
    const to = this.filterTo();
    const shiftIds = this.filterShiftIds();
    if (!from || !to) return;

    const gen = ++this.loadGen;
    this.loading.set(true);
    const live = this.isLiveView();

    if (!live && !shiftIds.length) {
      this.orders.set([]);
      this.loading.set(false);
      this.skipChime = false;
      this.lastKnownIds = new Set();
      return;
    }

    const req$ = live
      ? this.api.listStaff(shopId, { status: ALL_STATUSES, scope: 'current-shift' })
      : this.api.listStaff(shopId, {
          status: ALL_STATUSES,
          from,
          to,
          shiftIds,
        });

    req$.pipe(catchError(() => of([] as StaffCustomerOrder[]))).subscribe({
      next: (rows) => {
        if (gen !== this.loadGen) return;
        const nextIds = new Set(rows.map((r) => r.id));
        if (live && !this.skipChime && this.lastKnownIds.size) {
          const fresh = rows.filter(
            (r) => !this.lastKnownIds.has(r.id) && r.status === 'PENDING',
          );
          if (fresh.length) playCustomerOrderPendingSound();
        }
        this.skipChime = false;
        this.lastKnownIds = nextIds;
        this.orders.set(rows);
        this.loading.set(false);
      },
      error: () => {
        if (gen !== this.loadGen) return;
        this.loading.set(false);
        this.snack.open('No se pudo cargar el monitor', 'OK', { duration: 3000 });
      },
    });
  }

  private liveDefaults(): { date: string; shiftId: string } | null {
    const shop = this.shops.selectedShop();
    if (!shop) return null;
    const date = resolveShopBusinessDate(new Date(), {
      timezone: shop.timezone,
      openingTime: shop.openingTime,
    });
    const shiftId = resolveCurrentShift(shop).id;
    if (!shiftId) return null;
    return { date, shiftId };
  }
}
