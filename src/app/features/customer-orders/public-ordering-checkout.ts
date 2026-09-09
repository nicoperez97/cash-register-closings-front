import { Component, HostBinding, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
import { ShopContextService } from '../../core/shop/shop-context.service';
import {
  CreatePublicCustomerOrderBody,
  CustomerOrderFulfillment,
  CustomerOrderPaymentMethod,
  CustomerOrdersApiService,
  PublicOrderingConfig,
} from './customer-orders-api.service';
import { OrderingCartService } from './ordering-cart.service';
import { rememberOrderPhone } from './public-order-session';
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
  imports: [FormsModule, RouterLink, MatSnackBarModule],
  templateUrl: './public-ordering-checkout.html',
  styleUrl: './public-ordering-checkout.scss',
})
export class PublicOrderingCheckoutComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CustomerOrdersApiService);
  readonly cart = inject(OrderingCartService);
  private readonly title = inject(Title);
  private readonly shops = inject(ShopContextService);
  private readonly snack = inject(MatSnackBar);

  readonly staffMode = computed(
    () => this.route.snapshot.data['staffOrdering'] === true,
  );

  readonly slug = computed(() => {
    if (this.staffMode()) {
      return String(this.shops.selectedShop()?.slug ?? '').trim();
    }
    return String(this.route.snapshot.paramMap.get('slug') ?? '').trim();
  });

  readonly cartKey = computed(() => {
    const slug = this.slug();
    return this.staffMode() ? `staff:${slug}` : slug;
  });

  readonly shopId = computed(() => String(this.shops.selectedShopId() ?? '').trim());

  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly config = signal<PublicOrderingConfig | null>(null);
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

  @HostBinding('class.staff-ordering')
  get hostStaff(): boolean {
    return this.staffMode();
  }

  readonly logoUrl = computed(() => orderingLogoUrl(this.shop()?.logoUrl, this.shop()?.id));

  readonly openChannels = computed(() => {
    const c = this.config();
    if (!c) return [] as CustomerOrderFulfillment[];
    const out: CustomerOrderFulfillment[] = [];
    if (this.staffMode()) {
      if (c.takeawayEnabled) out.push('TAKEAWAY');
      if (c.deliveryEnabled) out.push('DELIVERY');
      return out;
    }
    if (c.takeawayEnabled && c.takeawayOpen) out.push('TAKEAWAY');
    if (c.deliveryEnabled && c.deliveryOpen) out.push('DELIVERY');
    return out;
  });

  readonly menuLink = computed(() =>
    this.staffMode() ? ['/customer-orders/nuevo'] : ['/pedir', this.slug(), 'menu'],
  );

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
    this.cart.bindSlug(this.cartKey());
    this.load();
  }

  ngOnDestroy(): void {
    resetStatusBar();
  }

  load(): void {
    const slug = this.slug();
    if (!slug) {
      this.loading.set(false);
      this.error.set(this.staffMode() ? 'Seleccioná un local' : 'Local no encontrado');
      return;
    }
    this.cart.bindSlug(this.cartKey());
    this.loading.set(true);
    this.error.set(null);
        this.api.getPublicOrdering(slug).subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.loading.set(false);
        this.title.setTitle(
          this.staffMode()
            ? `Confirmar mostrador · ${cfg.shop?.name ?? slug}`
            : `Checkout · ${cfg.shop?.name ?? slug}`,
        );
        this.pruneUnavailableCart(cfg);
        const channels: CustomerOrderFulfillment[] = [];
        if (this.staffMode()) {
          if (cfg.takeawayEnabled) channels.push('TAKEAWAY');
          if (cfg.deliveryEnabled) channels.push('DELIVERY');
        } else {
          if (cfg.takeawayEnabled && cfg.takeawayOpen) channels.push('TAKEAWAY');
          if (cfg.deliveryEnabled && cfg.deliveryOpen) channels.push('DELIVERY');
        }
        if (channels.length === 1) this.fulfillment.set(channels[0]);
        else if (channels.length > 1) {
          if (channels.includes('TAKEAWAY')) this.fulfillment.set('TAKEAWAY');
          else this.pickingFulfillment.set(true);
        }
        const methods = cfg.payments?.methods ?? [];
        if (methods.length === 1) this.paymentMethod.set(methods[0]);
        if (this.staffMode() && !this.phone.trim() && cfg.shop?.phone) {
          this.phone = String(cfg.shop.phone);
        }
        if (this.staffMode() && this.cashAmount == null) {
          this.cashAmount = this.total();
        }
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

  bumpLine(
    line: {
      menuItemId: string;
      notes: string;
      kind?: 'ITEM' | 'EXTRA';
      qty: number;
      extraId?: string;
      attachedToMenuItemId?: string;
      removedIngredients?: string[];
    },
    delta: number,
  ): void {
    this.cart.updateQty(
      line.menuItemId,
      line.notes,
      line.qty + delta,
      line.kind === 'EXTRA' ? 'EXTRA' : 'ITEM',
      line.extraId,
      line.attachedToMenuItemId,
      line.removedIngredients,
    );
  }

  removeLine(line: {
    menuItemId: string;
    notes: string;
    kind?: 'ITEM' | 'EXTRA';
    extraId?: string;
    attachedToMenuItemId?: string;
    removedIngredients?: string[];
  }): void {
    this.cart.remove(
      line.menuItemId,
      line.notes,
      line.kind === 'EXTRA' ? 'EXTRA' : 'ITEM',
      line.extraId,
      line.attachedToMenuItemId,
      line.removedIngredients,
    );
  }

  private pruneUnavailableCart(cfg: PublicOrderingConfig): void {
    const itemIds = new Set<string>();
    for (const m of cfg.menus ?? []) {
      for (const sec of m.sections ?? []) {
        for (const it of sec.items ?? []) {
          if (it?.id) itemIds.add(String(it.id));
        }
      }
    }
    const extraIds = new Set((cfg.extras ?? []).map((e) => String(e.id)));
    const removedQty = this.cart.reconcileAvailable({ itemIds, extraIds });
    if (removedQty > 0) {
      this.snack.open(
        removedQty === 1
          ? 'Sacamos 1 ítem del pedido porque ya no está disponible'
          : `Sacamos ${removedQty} ítems del pedido porque ya no están disponibles`,
        'OK',
        { duration: 4000 },
      );
    }
  }

  submit(ev: Event): void {
    ev.preventDefault();
    this.formError.set(null);
    const slug = this.slug();
    const lines = this.cart.lines();
    const fulfillment = this.fulfillment();
    const paymentMethod = this.paymentMethod();
    if (!slug || !lines.length) {
      this.formError.set('El carrito está vacío.');
      return;
    }
    if (!this.openChannels().length) {
      this.formError.set(
        this.staffMode()
          ? 'No hay take away ni delivery habilitados.'
          : 'Estamos cerrados en este momento.',
      );
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
      items: lines
        .filter((l) => l.kind !== 'EXTRA')
        .map((l) => ({
          menuItemId: l.menuItemId,
          qty: l.qty,
          notes: l.notes || null,
          removedIngredients: l.removedIngredients?.length ? l.removedIngredients : undefined,
        })),
      extras: lines
        .filter((l) => l.kind === 'EXTRA' && l.extraId)
        .map((l) => ({
          extraId: l.extraId!,
          qty: l.qty,
          attachedToMenuItemId: l.attachedToMenuItemId || null,
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
    const req$ = this.staffMode()
      ? this.api.createStaffOrder(this.shopId(), body)
      : this.api.createPublicOrder(slug, body);

    req$.subscribe({
      next: (order) => {
        this.submitting.set(false);
        this.cart.clear();
        if (this.staffMode()) {
          const staffOrder = order as { id?: string; code: string };
          void this.router.navigate(['/customer-orders'], {
            queryParams: staffOrder.id ? { order: staffOrder.id } : {},
            replaceUrl: true,
          });
          return;
        }
        if (body.phone) rememberOrderPhone(slug, order.code, body.phone);
        void this.router.navigate(['/mi-pedido', slug, order.code], {
          state: { justCreated: true },
          replaceUrl: true,
        });
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
