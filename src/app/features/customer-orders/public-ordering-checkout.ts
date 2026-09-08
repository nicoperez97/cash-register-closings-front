import { Component, HostBinding, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
import {
  CreatePublicCustomerOrderBody,
  CustomerOrderFulfillment,
  CustomerOrderPaymentMethod,
  CustomerOrdersApiService,
  PublicCustomerOrder,
  PublicOrderingConfig,
} from './customer-orders-api.service';
import { OrderingCartService } from './ordering-cart.service';
import {
  apiErrorMessage,
  fulfillmentLabel,
  onAccentColor,
  orderingLogoUrl,
  orderingMoney,
  paymentLabel,
} from './ordering-ui.util';

@Component({
  selector: 'app-public-ordering-checkout',
  imports: [FormsModule, RouterLink],
  templateUrl: './public-ordering-checkout.html',
  styleUrl: './public-ordering-checkout.scss',
})
export class PublicOrderingCheckoutComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(CustomerOrdersApiService);
  readonly cart = inject(OrderingCartService);
  private readonly title = inject(Title);

  readonly slug = computed(() => String(this.route.snapshot.paramMap.get('slug') ?? '').trim());
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly config = signal<PublicOrderingConfig | null>(null);
  readonly success = signal<PublicCustomerOrder | null>(null);
  readonly pickingFulfillment = signal(false);

  readonly fulfillment = signal<CustomerOrderFulfillment | ''>('');
  readonly deliveryZoneId = signal('');
  readonly paymentMethod = signal<CustomerOrderPaymentMethod | ''>('');

  address = '';
  cashAmount: number | null = null;
  firstName = '';
  lastName = '';
  phone = '';
  customerNotes = '';

  readonly shop = computed(() => this.config()?.shop ?? null);
  readonly accent = computed(() => this.shop()?.accentColor?.trim() || '#2e7d32');
  readonly onAccent = computed(() => onAccentColor(this.accent()));

  @HostBinding('style.--accent')
  get hostAccent(): string {
    return this.accent();
  }

  @HostBinding('style.--on-accent')
  get hostOnAccent(): string {
    return this.onAccent();
  }
  readonly logoUrl = computed(() => orderingLogoUrl(this.shop()?.logoUrl, this.shop()?.id));

  readonly openChannels = computed(() => {
    const c = this.config();
    if (!c) return [] as CustomerOrderFulfillment[];
    const out: CustomerOrderFulfillment[] = [];
    if (c.takeawayEnabled && c.takeawayOpen) out.push('TAKEAWAY');
    if (c.deliveryEnabled && c.deliveryOpen) out.push('DELIVERY');
    return out;
  });

  readonly paymentMethods = computed(() => this.config()?.payments?.methods ?? []);

  readonly selectedZone = computed(() => {
    const id = this.deliveryZoneId();
    return (this.config()?.deliveryZones ?? []).find((z) => z.id === id) ?? null;
  });

  readonly deliveryFee = computed(() =>
    this.fulfillment() === 'DELIVERY' ? Number(this.selectedZone()?.fee ?? 0) : 0,
  );

  readonly total = computed(() => this.cart.subtotal() + this.deliveryFee());

  ngOnInit(): void {
    applyStatusBar('#eef1ee', 'light');
    const slug = this.slug();
    this.cart.bindSlug(slug);
    this.load();
  }

  ngOnDestroy(): void {
    resetStatusBar();
  }

  load(): void {
    const slug = this.slug();
    if (!slug) {
      this.loading.set(false);
      this.error.set('Local no encontrado');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api.getPublicOrdering(slug).subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.loading.set(false);
        this.title.setTitle(`Checkout · ${cfg.shop?.name ?? slug}`);
        const channels: CustomerOrderFulfillment[] = [];
        if (cfg.takeawayEnabled && cfg.takeawayOpen) channels.push('TAKEAWAY');
        if (cfg.deliveryEnabled && cfg.deliveryOpen) channels.push('DELIVERY');
        if (channels.length === 1) this.fulfillment.set(channels[0]);
        else if (channels.length > 1) this.pickingFulfillment.set(true);
        const methods = cfg.payments?.methods ?? [];
        if (methods.length === 1) this.paymentMethod.set(methods[0]);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'No pudimos cargar el checkout.'));
      },
    });
  }

  money(n: number): string {
    return orderingMoney(n);
  }

  channelLabel(f: CustomerOrderFulfillment | ''): string {
    if (!f) return '';
    return fulfillmentLabel(f);
  }

  payLabel(p: CustomerOrderPaymentMethod): string {
    return paymentLabel(p);
  }

  chooseFulfillment(f: CustomerOrderFulfillment): void {
    this.fulfillment.set(f);
    this.pickingFulfillment.set(false);
    if (f !== 'DELIVERY') {
      this.deliveryZoneId.set('');
      this.address = '';
    }
  }

  changeFulfillment(): void {
    this.pickingFulfillment.set(true);
  }

  setPayment(m: CustomerOrderPaymentMethod): void {
    this.paymentMethod.set(m);
  }

  onZoneChange(id: string): void {
    this.deliveryZoneId.set(id);
  }

  bumpLine(menuItemId: string, notes: string, delta: number): void {
    const line = this.cart.lines().find((l) => l.menuItemId === menuItemId && l.notes === notes);
    if (!line) return;
    this.cart.updateQty(menuItemId, notes, line.qty + delta);
  }

  removeLine(menuItemId: string, notes: string): void {
    this.cart.remove(menuItemId, notes);
  }

  submit(ev: Event): void {
    ev.preventDefault();
    this.formError.set(null);
    const slug = this.slug();
    const lines = this.cart.lines();
    const fulfillment = this.fulfillment();
    const paymentMethod = this.paymentMethod();
    if (!slug || !lines.length) {
      this.formError.set('Tu carrito está vacío.');
      return;
    }
    if (!this.openChannels().length) {
      this.formError.set('Estamos cerrados en este momento.');
      return;
    }
    if (!fulfillment || !this.openChannels().includes(fulfillment)) {
      this.formError.set('Elegí cómo querés recibir el pedido.');
      this.pickingFulfillment.set(true);
      return;
    }
    if (fulfillment === 'DELIVERY') {
      if (!this.deliveryZoneId()) {
        this.formError.set('Seleccioná una zona de entrega.');
        return;
      }
      if (this.address.trim().length < 5) {
        this.formError.set('Ingresá la dirección de entrega.');
        return;
      }
    }
    if (!paymentMethod || !this.paymentMethods().includes(paymentMethod)) {
      this.formError.set('Elegí un medio de pago.');
      return;
    }
    if (paymentMethod === 'CASH') {
      const cash = Number(this.cashAmount);
      if (!Number.isFinite(cash) || cash < this.total()) {
        this.formError.set('Indicá con cuánto abonás (debe cubrir el total).');
        return;
      }
    }
    if (!this.firstName.trim() || !this.lastName.trim()) {
      this.formError.set('Completá nombre y apellido.');
      return;
    }
    if (this.phone.replace(/\D/g, '').length < 6) {
      this.formError.set('Ingresá un celular válido.');
      return;
    }

    const body: CreatePublicCustomerOrderBody = {
      fulfillment,
      items: lines.map((l) => ({
        menuItemId: l.menuItemId,
        qty: l.qty,
        notes: l.notes || null,
      })),
      firstName: this.firstName.trim(),
      lastName: this.lastName.trim(),
      phone: this.phone.trim(),
      paymentMethod,
      customerNotes: this.customerNotes.trim() || null,
    };
    if (fulfillment === 'DELIVERY') {
      body.deliveryZoneId = this.deliveryZoneId();
      body.address = this.address.trim();
    }
    if (paymentMethod === 'CASH') {
      body.cashAmount = Number(this.cashAmount);
    }

    this.submitting.set(true);
    this.api.createPublicOrder(slug, body).subscribe({
      next: (order) => {
        this.submitting.set(false);
        this.cart.clear();
        this.success.set(order);
        this.title.setTitle(`Pedido ${order.code}`);
      },
      error: (err) => {
        this.submitting.set(false);
        this.formError.set(apiErrorMessage(err, 'No pudimos enviar el pedido.'));
      },
    });
  }

  onLogoError(): void {
    const c = this.config();
    if (!c) return;
    this.config.set({ ...c, shop: { ...c.shop, logoUrl: null } });
  }
}
