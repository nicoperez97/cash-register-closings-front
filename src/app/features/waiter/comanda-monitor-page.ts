import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { debounceTime, filter, interval, of, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { ShopContextService } from '../../core/shop/shop-context.service';
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

@Component({
  selector: 'app-comanda-monitor-page',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatSnackBarModule],
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

  readonly data = signal<ComandaMonitorPayload | null>(null);
  readonly loading = signal(false);
  readonly now = signal(Date.now());

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

  readonly summary = computed(() => {
    const d = this.data();
    const s = d?.summary;
    const tables = d?.tables ?? [];
    const counters = d?.counters ?? [];
    const closedTables = d?.closedTables ?? [];
    const closedCounters = d?.closedCounters ?? [];
    const sends = d?.recentOrders ?? [];
    const audits = d?.recentAudits ?? [];
    const openTotal =
      s?.openTotal ??
      [...tables, ...counters].reduce((n, t) => n + (Number(t.total) || 0), 0);
    const closedTotal =
      s?.closedTotal ??
      [...closedTables, ...closedCounters].reduce(
        (n, t) => n + (Number(t.total) || 0),
        0,
      );
    return {
      openTables: s?.openTables ?? tables.length,
      openCovers:
        s?.openCovers ?? tables.reduce((n, t) => n + (Number(t.covers) || 0), 0),
      openCounter: s?.openCounter ?? counters.length,
      closedTables: s?.closedTables ?? closedTables.length,
      closedCovers:
        s?.closedCovers ??
        closedTables.reduce((n, t) => n + (Number(t.covers) || 0), 0),
      closedCounter: s?.closedCounter ?? closedCounters.length,
      tablesWithChanges: s?.tablesWithChanges ?? 0,
      openTotal,
      closedTotal,
      shiftTotal: s?.shiftTotal ?? openTotal + closedTotal,
      sends: s?.sends ?? sends.length,
      sendsTotal:
        s?.sendsTotal ?? sends.reduce((n, o) => n + (Number(o.total) || 0), 0),
      ticketsPrinted:
        s?.ticketsPrinted ??
        [...tables, ...counters, ...closedTables, ...closedCounters].filter(
          (t) => t.customerTicketPrinted,
        ).length,
      audits: s?.audits ?? audits.length,
    };
  });

  readonly changedSessions = computed((): ComandaMonitorTable[] => {
    const d = this.data();
    if (!d) return [];
    const ids = new Set(
      (d.recentAudits ?? [])
        .map((a) => String(a.tableSessionId ?? '').trim())
        .filter(Boolean),
    );
    if (!ids.size) return [];
    const seen = new Set<string>();
    const rows: ComandaMonitorTable[] = [];
    for (const t of [
      ...(d.tables ?? []),
      ...(d.counters ?? []),
      ...(d.closedTables ?? []),
      ...(d.closedCounters ?? []),
    ]) {
      if (!ids.has(t.sessionId) || seen.has(t.sessionId)) continue;
      seen.add(t.sessionId);
      rows.push(t);
    }
    return rows;
  });

  readonly boardColumns = computed((): BoardCol[] => {
    const d = this.data();
    if (!d) return [];
    const cols: BoardCol[] = [];
    if (d.tables?.length) {
      cols.push({ id: 'tables', title: 'Mesas abiertas', rows: d.tables });
    }
    const counters = [...(d.counters ?? []), ...(d.closedCounters ?? [])];
    if (counters.length) {
      cols.push({ id: 'counters', title: 'Mostrador', rows: counters });
    }
    if (d.closedTables?.length) {
      cols.push({ id: 'closed', title: 'Mesas cerradas', rows: d.closedTables });
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
    const d = this.data();
    if (d?.recentOrders?.length) cols.push('sends');
    if (d?.recentAudits?.length) cols.push('audits');
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

  constructor() {
    usePageRefresh(() => this.reload());
    interval(20_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.now.set(Date.now()));

    toObservable(this.shops.selectedShopId)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.reload());

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
    this.loading.set(true);
    this.api.staffMonitor(shopId).subscribe({
      next: (payload) => {
        this.data.set(payload);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudo cargar el monitor', 'OK', { duration: 3000 });
      },
    });
  }
}
