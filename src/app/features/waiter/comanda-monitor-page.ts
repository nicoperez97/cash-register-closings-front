import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { debounceTime, filter, interval, of, switchMap } from 'rxjs';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import { usePageRefresh } from '../../core/page-refresh.service';
import { HelpDialogComponent } from '../../shared/components/help-dialog';
import { topicById } from '../../core/help/module-help';
import { formatMoney } from '../../shared/utils/money';
import {
  ComandaMonitorPayload,
  WaiterApiService,
  WaiterLineAudit,
} from './waiter-api.service';
import { comandaReasonLabel } from './comanda-line-reason-dialog';

@Component({
  selector: 'app-comanda-monitor-page',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatSnackBarModule],
  templateUrl: './comanda-monitor-page.html',
  styleUrl: './comanda-monitor-page.scss',
})
export class ComandaMonitorPage {
  private readonly api = inject(WaiterApiService);
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
      return `Precio de ${name}: ${this.money(a.unitPriceBefore ?? 0)} → ${this.money(a.unitPriceAfter ?? 0)}`;
    }
    if (a.action === 'QTY') {
      return `Cantidad de ${name}: ${a.qtyBefore ?? '—'} → ${a.qtyAfter ?? '—'}${extraBit}${reasonBit}`;
    }
    return `${name}: ${a.qtyBefore ?? '—'}× ${this.money(a.unitPriceBefore ?? 0)} → ${a.qtyAfter ?? '—'}× ${this.money(a.unitPriceAfter ?? 0)}${reasonBit}`;
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
