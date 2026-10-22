import { DatePipe } from '@angular/common';
import { Component, computed, HostListener, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule, MatDateRangePicker } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { debounceTime, filter, interval, merge, of, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { formatIsoDateDisplay, resolveShopBusinessDate } from '../../core/shop/business-date';
import { ShopContextService } from '../../core/shop/shop-context.service';
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
import {
  ComandaMonitorPayload,
  ComandaMonitorTable,
  WaiterApiService,
  WaiterLineAudit,
} from './waiter-api.service';
import { comandaReasonLabel } from './comanda-line-reason-dialog';

type MonitorColId =
  | 'tables'
  | 'counters'
  | 'closed'
  | 'changes'
  | 'sends'
  | 'audits';

type BoardCol = {
  id: MonitorColId;
  title: string;
  rows: ComandaMonitorTable[];
};

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

function matchesWaiter(
  waiterEmployeeId: string | null | undefined,
  filter: string,
): boolean {
  const wid = String(waiterEmployeeId ?? '').trim();
  if (filter === 'all') return true;
  if (filter === 'none') return !wid;
  return wid === filter;
}

@Component({
  selector: 'app-comanda-monitor-page',
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './comanda-monitor-page.html',
  styleUrl: './comanda-monitor-page.scss',
})
export class ComandaMonitorPage {
  private readonly api = inject(WaiterApiService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly live = inject(ShopLiveClient);
  private readonly dialog = inject(MatDialog);
  readonly shops = inject(ShopContextService);
  private readonly datePicker = viewChild<MatDateRangePicker<Date>>('picker');
  private loadGen = 0;
  private waiterFilterInitialized = false;

  readonly data = signal<ComandaMonitorPayload | null>(null);
  readonly loading = signal(false);
  readonly now = signal(Date.now());
  readonly filterFrom = signal<string | null>(null);
  readonly filterTo = signal<string | null>(null);
  readonly filterShiftIds = signal<string[]>([]);
  /** all | none (Caja) | employeeId */
  readonly filterWaiterId = signal<string>('all');
  readonly shiftMenuOpen = signal(false);

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(null),
    end: new FormControl<Date | null>(null),
  });
  readonly shiftIdsCtrl = new FormControl<string[]>([], { nonNullable: true });

  readonly shiftOptions = computed(() => shopShiftsOf(this.shops.selectedShop()));

  readonly clockLabel = computed(() =>
    new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(
      this.now(),
    ),
  );

  /** Montos del monitor: permiso de rol o flag del payload. */
  readonly canSeeAmounts = computed(() => {
    const d = this.data();
    if (d?.showAmounts === false) return false;
    if (d?.showAmounts === true) return true;
    const shopId = this.shops.selectedShopId();
    return (
      hasShopPermission(this.auth.currentUser(), shopId, 'comandaMonitor.amounts') ||
      hasShopPermission(this.auth.currentUser(), shopId, 'shops.manage')
    );
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

  readonly summaryTitle = computed(() =>
    this.isLiveView() ||
    (this.filterShiftIds().length === 1 && this.filterFrom() === this.filterTo())
      ? 'Resumen del turno'
      : 'Resumen',
  );

  readonly waiterOptions = computed(() => this.data()?.waiters ?? []);

  readonly hasCajaSessions = computed(() => {
    const d = this.data();
    if (!d) return false;
    const rows = [
      ...(d.tables ?? []),
      ...(d.counters ?? []),
      ...(d.closedTables ?? []),
      ...(d.closedCounters ?? []),
      ...(d.recentOrders ?? []),
    ];
    return rows.some((r) => !String(r.waiterEmployeeId ?? '').trim());
  });

  readonly filteredTables = computed(() =>
    (this.data()?.tables ?? []).filter((t) =>
      matchesWaiter(t.waiterEmployeeId, this.filterWaiterId()),
    ),
  );
  readonly filteredCounters = computed(() =>
    (this.data()?.counters ?? []).filter((t) =>
      matchesWaiter(t.waiterEmployeeId, this.filterWaiterId()),
    ),
  );
  readonly filteredClosedTables = computed(() =>
    (this.data()?.closedTables ?? []).filter((t) =>
      matchesWaiter(t.waiterEmployeeId, this.filterWaiterId()),
    ),
  );
  readonly filteredClosedCounters = computed(() =>
    (this.data()?.closedCounters ?? []).filter((t) =>
      matchesWaiter(t.waiterEmployeeId, this.filterWaiterId()),
    ),
  );
  readonly filteredOrders = computed(() =>
    (this.data()?.recentOrders ?? []).filter((o) =>
      matchesWaiter(o.waiterEmployeeId, this.filterWaiterId()),
    ),
  );

  readonly filteredAudits = computed((): WaiterLineAudit[] => {
    const d = this.data();
    if (!d) return [];
    const filter = this.filterWaiterId();
    if (filter === 'all') return d.recentAudits ?? [];
    const sessionIds = new Set(
      [
        ...this.filteredTables(),
        ...this.filteredCounters(),
        ...this.filteredClosedTables(),
        ...this.filteredClosedCounters(),
      ].map((t) => t.sessionId),
    );
    return (d.recentAudits ?? []).filter((a) => {
      const sid = String(a.tableSessionId ?? '').trim();
      return sid ? sessionIds.has(sid) : false;
    });
  });

  readonly summary = computed(() => {
    const d = this.data();
    const s = d?.summary;
    const tables = this.filteredTables();
    const counters = this.filteredCounters();
    const closedTables = this.filteredClosedTables();
    const closedCounters = this.filteredClosedCounters();
    const sends = this.filteredOrders();
    const audits = this.filteredAudits();
    const waiterFilter = this.filterWaiterId() !== 'all';
    const openTotal = waiterFilter
      ? [...tables, ...counters].reduce((n, t) => n + (Number(t.total) || 0), 0)
      : (s?.openTotal ??
        [...tables, ...counters].reduce((n, t) => n + (Number(t.total) || 0), 0));
    const closedTotal = waiterFilter
      ? [...closedTables, ...closedCounters].reduce(
          (n, t) => n + (Number(t.total) || 0),
          0,
        )
      : (s?.closedTotal ??
        [...closedTables, ...closedCounters].reduce(
          (n, t) => n + (Number(t.total) || 0),
          0,
        ));
    const openCovers = tables.reduce((n, t) => n + (Number(t.covers) || 0), 0);
    const closedCovers = closedTables.reduce(
      (n, t) => n + (Number(t.covers) || 0),
      0,
    );
    const coversTotal = waiterFilter
      ? openCovers + closedCovers
      : (s?.coversTotal ?? openCovers + closedCovers);
    return {
      openTables: tables.length,
      openCovers,
      closedCovers,
      coversTotal,
      openCounter: counters.length,
      closedTables: closedTables.length,
      closedCounter: closedCounters.length,
      tablesWithChanges: waiterFilter
        ? new Set(
            audits
              .map((a) => String(a.tableSessionId ?? '').trim())
              .filter(Boolean),
          ).size
        : (s?.tablesWithChanges ?? 0),
      openTotal,
      closedTotal,
      shiftTotal: openTotal + closedTotal,
      sends: waiterFilter ? sends.length : (s?.sends ?? sends.length),
      sendsTotal: waiterFilter
        ? sends.reduce((n, o) => n + (Number(o.total) || 0), 0)
        : (s?.sendsTotal ?? sends.reduce((n, o) => n + (Number(o.total) || 0), 0)),
      ticketsPrinted: [
        ...tables,
        ...counters,
        ...closedTables,
        ...closedCounters,
      ].filter((t) => t.customerTicketPrinted).length,
      audits: audits.length,
    };
  });

  readonly changedSessions = computed((): ComandaMonitorTable[] => {
    const ids = new Set(
      this.filteredAudits()
        .map((a) => String(a.tableSessionId ?? '').trim())
        .filter(Boolean),
    );
    if (!ids.size) return [];
    const seen = new Set<string>();
    const rows: ComandaMonitorTable[] = [];
    for (const t of [
      ...this.filteredTables(),
      ...this.filteredCounters(),
      ...this.filteredClosedTables(),
      ...this.filteredClosedCounters(),
    ]) {
      if (!ids.has(t.sessionId) || seen.has(t.sessionId)) continue;
      seen.add(t.sessionId);
      rows.push(t);
    }
    return rows;
  });

  readonly boardColumns = computed((): BoardCol[] => {
    const cols: BoardCol[] = [];
    const tables = this.filteredTables();
    if (tables.length) {
      cols.push({ id: 'tables', title: 'Mesas abiertas', rows: tables });
    }
    const counters = [...this.filteredCounters(), ...this.filteredClosedCounters()];
    if (counters.length) {
      cols.push({ id: 'counters', title: 'Mostrador', rows: counters });
    }
    const closed = this.filteredClosedTables();
    if (closed.length) {
      cols.push({ id: 'closed', title: 'Mesas cerradas', rows: closed });
    }
    const changed = this.changedSessions();
    if (changed.length) {
      cols.push({ id: 'changes', title: 'Con recambio', rows: changed });
    }
    return cols;
  });

  /** Solo columnas con datos del turno. */
  readonly visibleColumns = computed((): MonitorColId[] => {
    const cols: MonitorColId[] = this.boardColumns().map((c) => c.id);
    if (this.filteredOrders().length) cols.push('sends');
    if (this.filteredAudits().length) cols.push('audits');
    return cols;
  });

  readonly countPill = computed(() => {
    const s = this.summary();
    const bits: string[] = [];
    if (s.sends) bits.push(`${s.sends} envío${s.sends === 1 ? '' : 's'}`);
    if (s.openTables) bits.push(`${s.openTables} mesa${s.openTables === 1 ? '' : 's'}`);
    if (s.openCounter + s.closedCounter) {
      const n = s.openCounter + s.closedCounter;
      bits.push(`${n} mostrador`);
    }
    if (s.closedTables) {
      bits.push(`${s.closedTables} cerrada${s.closedTables === 1 ? '' : 's'}`);
    }
    return bits.join(' · ') || 'Sin actividad';
  });

  readonly emptyMessage = computed(() => {
    if (!this.filterShiftIds().length && !this.isLiveView()) {
      return 'Elegí al menos un turno para ver la comanda.';
    }
    if (this.filterWaiterId() !== 'all') {
      return 'No hay actividad de comanda con ese filtro de mozo.';
    }
    if (this.isLiveView()) {
      return 'No hay actividad de comanda en este turno.';
    }
    return 'No hay actividad de comanda para el día y los turnos elegidos.';
  });

  constructor() {
    usePageRefresh(() => this.reload());
    this.resetToLive();

    interval(20_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.now.set(Date.now()));

    toObservable(this.shops.selectedShopId)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.waiterFilterInitialized = false;
        this.filterWaiterId.set('all');
        this.resetToLive();
        this.reload();
      });

    merge(this.range.valueChanges, this.shiftIdsCtrl.valueChanges)
      .pipe(debounceTime(200), takeUntilDestroyed())
      .subscribe(() => {
        this.syncFilterSignals();
        this.reload();
      });

    toObservable(this.shops.selectedShopId)
      .pipe(
        switchMap((id) => {
          const shopId = String(id ?? '').trim();
          if (!shopId) return of(null);
          return this.live.connectAuth(shopId).pipe(
            filter((t) => t.domain === 'customer-orders'),
            debounceTime(300),
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

  setWaiterFilter(id: string): void {
    this.filterWaiterId.set(id);
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
    this.resetToLive();
    this.reload();
  }

  private syncFilterSignals(): void {
    this.filterFrom.set(toIsoDate(this.range.controls.start.value));
    this.filterTo.set(toIsoDate(this.range.controls.end.value));
    this.filterShiftIds.set([...this.shiftIdsCtrl.value.filter(Boolean)]);
  }

  money(n: number): string {
    return formatMoney(n);
  }

  ageLabel(iso?: string | null): string {
    if (!iso) return '';
    const min = Math.max(0, Math.floor((this.now() - new Date(iso).getTime()) / 60_000));
    if (min < 1) return 'ahora';
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)} h`;
  }

  waiterLabel(name: string | null | undefined, waiterEmployeeId?: string | null): string {
    const wid = String(waiterEmployeeId ?? '').trim();
    const n = String(name ?? '').trim();
    if (!wid) return 'Caja';
    if (!n || n === '—') return 'Caja';
    return n;
  }

  auditText(a: WaiterLineAudit): string {
    const name = a.itemName || 'Ítem';
    const extras = (a.relatedLines ?? [])
      .map((r) => r.name)
      .filter(Boolean)
      .join(', ');
    const extraBit = extras ? ` (+ ${extras})` : '';
    const reasonBit = (() => {
      const label = comandaReasonLabel(a.reason);
      if (!label) return '';
      const note = String(a.reasonNote ?? '').trim();
      return note ? ` · ${label}: ${note}` : ` · ${label}`;
    })();
    if (a.action === 'REMOVE') {
      const qty = a.qtyBefore ?? 1;
      let s = `Quitó ${qty}× ${name}${extraBit}${reasonBit}`;
      if (a.orderRemoved) s += ` · se borró el envío #${a.orderCode}`;
      return s;
    }
    if (a.action === 'PRICE') {
      if (!this.canSeeAmounts()) return `Cambió el precio de ${name}`;
      return `Precio de ${name}: ${this.money(a.unitPriceBefore ?? 0)} → ${this.money(a.unitPriceAfter ?? 0)}`;
    }
    if (a.action === 'QTY') {
      return `Cantidad de ${name}: ${a.qtyBefore ?? '—'} → ${a.qtyAfter ?? '—'}${extraBit}${reasonBit}`;
    }
    if (!this.canSeeAmounts()) {
      return `${name}: ${a.qtyBefore ?? '—'} → ${a.qtyAfter ?? '—'}${reasonBit}`;
    }
    return `${name}: ${a.qtyBefore ?? '—'}× ${this.money(a.unitPriceBefore ?? 0)} → ${a.qtyAfter ?? '—'}× ${this.money(a.unitPriceAfter ?? 0)}${reasonBit}`;
  }

  placeHeading(label: string | null | undefined): string {
    const t = String(label ?? '').trim();
    if (!t || t.toLowerCase() === 'mostrador') return 'Mostrador';
    return `Mesa ${t}`;
  }

  openHelp(): void {
    const topic = topicById('comanda-monitor');
    if (!topic) return;
    this.dialog.open(HelpDialogComponent, {
      data: { topic, blocks: topic.blocks },
      autoFocus: 'dialog',
      width: 'min(560px, 94vw)',
    });
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.data.set(null);
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
      this.data.set(null);
      this.loading.set(false);
      return;
    }

    const params = live
      ? undefined
      : { from, to, shiftIds };

    this.api.staffMonitor(shopId, params).subscribe({
      next: (payload) => {
        if (gen !== this.loadGen) return;
        this.data.set(payload);
        if (!this.waiterFilterInitialized) {
          const self = String(payload.selfWaiterEmployeeId ?? '').trim();
          this.filterWaiterId.set(self || 'all');
          this.waiterFilterInitialized = true;
        }
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
