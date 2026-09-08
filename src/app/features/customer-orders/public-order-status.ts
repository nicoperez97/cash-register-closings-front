import {
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, filter } from 'rxjs';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import {
  CustomerOrderStatus,
  CustomerOrdersApiService,
  PublicCustomerOrder,
} from './customer-orders-api.service';
import { recallOrderPhone, rememberOrderPhone } from './public-order-session';
import {
  apiErrorMessage,
  fulfillmentLabel,
  orderingMoney,
  paymentLabel,
  statusLabel,
} from './ordering-ui.util';

type StatusStep = {
  status: CustomerOrderStatus;
  label: string;
  at: string | null | undefined;
};

@Component({
  selector: 'app-public-order-status',
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './public-order-status.html',
  styleUrl: './public-order-status.scss',
})
export class PublicOrderStatusComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CustomerOrdersApiService);
  private readonly live = inject(ShopLiveClient);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  readonly slug = computed(() =>
    String(this.route.snapshot.paramMap.get('slug') ?? '').trim(),
  );
  readonly code = computed(() =>
    String(this.route.snapshot.paramMap.get('code') ?? '')
      .trim()
      .toUpperCase(),
  );

  readonly loading = signal(false);
  readonly unlocking = signal(false);
  readonly error = signal<string | null>(null);
  readonly order = signal<PublicCustomerOrder | null>(null);
  readonly justCreated = signal(false);
  readonly needsPhone = signal(false);

  phone = '';

  readonly steps = computed(() => {
    const o = this.order();
    if (!o) return [] as Array<StatusStep & { state: 'done' | 'current' | 'todo' }>;
    const flow =
      o.fulfillment === 'DELIVERY'
        ? ([
            { status: 'PENDING', label: 'Recibido', at: o.createdAt },
            { status: 'ACCEPTED', label: 'Aceptado', at: o.acceptedAt },
            { status: 'PREPARING', label: 'Preparando', at: o.preparingAt },
            { status: 'READY', label: 'Listo', at: o.readyAt },
            {
              status: 'OUT_FOR_DELIVERY',
              label: 'En camino',
              at: o.outForDeliveryAt,
            },
            { status: 'COMPLETED', label: 'Entregado', at: o.completedAt },
          ] as StatusStep[])
        : ([
            { status: 'PENDING', label: 'Recibido', at: o.createdAt },
            { status: 'ACCEPTED', label: 'Aceptado', at: o.acceptedAt },
            { status: 'PREPARING', label: 'Preparando', at: o.preparingAt },
            { status: 'READY', label: 'Listo para retirar', at: o.readyAt },
            { status: 'COMPLETED', label: 'Retirado', at: o.completedAt },
          ] as StatusStep[]);

    if (o.status === 'CANCELLED') {
      return [
        {
          status: 'CANCELLED' as CustomerOrderStatus,
          label: 'Cancelado',
          at: o.cancelledAt,
          state: 'current' as const,
        },
      ];
    }

    const idx = flow.findIndex((s) => s.status === o.status);
    const current = idx < 0 ? 0 : idx;
    return flow.map((s, i) => ({
      ...s,
      state: (i < current ? 'done' : i === current ? 'current' : 'todo') as
        | 'done'
        | 'current'
        | 'todo',
    }));
  });

  ngOnInit(): void {
    applyStatusBar('#eef1ee', 'light');
    const fromNav = this.router.getCurrentNavigation()?.extras?.state as
      | { justCreated?: boolean }
      | undefined;
    const fromHistory = history.state as { justCreated?: boolean } | null;
    if (fromNav?.justCreated || fromHistory?.justCreated) {
      this.justCreated.set(true);
    }

    const slug = this.slug();
    const code = this.code();
    this.title.setTitle(code ? `Pedido ${code}` : 'Tu pedido');

    const remembered = recallOrderPhone(slug, code);
    if (remembered) {
      this.phone = remembered;
      this.fetch(true);
    } else {
      this.needsPhone.set(true);
    }

    if (slug) {
      this.live
        .connect(slug)
        .pipe(
          filter((t) => t.domain === 'customer-orders'),
          debounceTime(280),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          if (this.order() || recallOrderPhone(this.slug(), this.code())) {
            this.fetch(false);
          }
        });
    }
  }

  ngOnDestroy(): void {
    resetStatusBar();
  }

  unlock(ev: Event): void {
    ev.preventDefault();
    if (!this.phone.trim()) return;
    this.fetch(true);
  }

  private fetch(showLoading: boolean): void {
    const slug = this.slug();
    const code = this.code();
    const phone = this.phone.trim() || recallOrderPhone(slug, code) || '';
    if (!slug || !code || !phone) {
      this.needsPhone.set(true);
      return;
    }
    this.phone = phone;
    if (showLoading) this.loading.set(true);
    this.unlocking.set(true);
    this.error.set(null);
    this.api.lookupPublicOrder(slug, phone, code).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.unlocking.set(false);
        this.needsPhone.set(false);
        this.order.set(res);
        rememberOrderPhone(slug, code, phone);
        this.title.setTitle(`Pedido ${res.code}`);
      },
      error: (err) => {
        this.loading.set(false);
        this.unlocking.set(false);
        this.order.set(null);
        this.needsPhone.set(true);
        this.error.set(apiErrorMessage(err, 'No encontramos ese pedido.'));
      },
    });
  }

  statusText(status: PublicCustomerOrder['status']): string {
    return statusLabel(status);
  }

  fulfillmentText(f: PublicCustomerOrder['fulfillment']): string {
    return fulfillmentLabel(f);
  }

  paymentText(p: PublicCustomerOrder['paymentMethod']): string {
    return paymentLabel(p);
  }

  money(n: number): string {
    return orderingMoney(n);
  }

  readonly receiptWhatsappHref = computed(() => {
    const o = this.order();
    if (!o || o.paymentMethod !== 'TRANSFER') return '';
    const digits = String(o.receiptWhatsapp ?? '').replace(/\D/g, '');
    if (digits.length < 8) return '';
    const text = encodeURIComponent(
      `Hola! Te envío el comprobante del pedido ${o.code} (total ${orderingMoney(o.total)}).`,
    );
    return `https://wa.me/${digits}?text=${text}`;
  });
}
