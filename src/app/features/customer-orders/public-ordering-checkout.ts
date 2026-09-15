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
  DeliveryMapPickerComponent,
  DeliveryMapSelection,
} from './delivery-map-picker';
import { composeDeliveryAddress, LatLng } from './delivery-geo.util';
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
  imports: [FormsModule, RouterLink, MatSnackBarModule, DeliveryMapPickerComponent],
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
  readonly mapOpen = signal(false);
  readonly addressSheetOpen = signal(false);

  readonly fulfillment = signal<CustomerOrderFulfillment | ''>('');
  readonly deliveryZoneId = signal('');
  readonly paymentMethod = signal<CustomerOrderPaymentMethod | ''>('');
  readonly mapPoint = signal<LatLng | null>(null);

  addressStreet = '';
  addressNumber = '';
  addressBetween = '';
  addressDetails = '';
  addressLabel = '';
  cashAmount: number | null = null;
  firstName = '';
  lastName = '';
  phone = '';
  customerNotes = '';

  /** Borrador del sheet post-mapa. */
  sheetStreet = '';
  sheetNumber = '';
  sheetBetween = '';
  sheetDetails = '';

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

  /** Grupos del resumen: cada ítem con sus extras (una unidad para +/-). */
  readonly summaryGroups = computed(() => {
    const lines = this.cart.lines();
    const items = lines.filter((l) => l.kind !== 'EXTRA');
    const extras = lines.filter((l) => l.kind === 'EXTRA');
    const used = new Set<string>();
    type Line = (typeof lines)[number];
    const groups: Array<{
      item: Line | null;
      extras: Array<{ line: Line; parentName: string | null; nested: boolean }>;
    }> = [];
    for (const item of items) {
      const groupExtras: Array<{ line: Line; parentName: string | null; nested: boolean }> = [];
      for (const ex of extras) {
        if (ex.attachedToMenuItemId !== item.menuItemId) continue;
        const key = `${ex.extraId}|${ex.attachedToMenuItemId}|${ex.notes}`;
        if (used.has(key)) continue;
        used.add(key);
        groupExtras.push({ line: ex, parentName: item.name, nested: true });
      }
      groups.push({ item, extras: groupExtras });
    }
    for (const ex of extras) {
      const key = `${ex.extraId}|${ex.attachedToMenuItemId}|${ex.notes}`;
      if (used.has(key)) continue;
      const parent = items.find((i) => i.menuItemId === ex.attachedToMenuItemId);
      groups.push({
        item: null,
        extras: [{ line: ex, parentName: parent?.name ?? null, nested: false }],
      });
    }
    return groups;
  });

  readonly hasMapZones = computed(() =>
    (this.config()?.deliveryZones ?? []).some((z) => (z.polygon?.length ?? 0) >= 3),
  );

  deliveryAddressText(): string {
    return composeDeliveryAddress({
      street: this.addressStreet,
      number: this.addressNumber,
      betweenStreets: this.addressBetween,
      details: this.addressDetails,
    });
  }

  readonly helpWhatsappUrl = computed(() => {
    const raw =
      this.config()?.payments?.whatsapp?.trim() ||
      this.config()?.shop?.phone?.trim() ||
      '';
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 8) return null;
    const text = encodeURIComponent(
      `Hola, necesito ayuda para cargar mi domicilio en el pedido de ${this.config()?.shop?.name ?? 'su local'}.`,
    );
    return `https://wa.me/${digits}?text=${text}`;
  });

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
          this.fulfillment.set('');
          this.pickingFulfillment.set(true);
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
      this.clearDeliveryAddress();
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

  openMapPicker(): void {
    this.addressSheetOpen.set(false);
    this.mapOpen.set(true);
    queueMicrotask(() => {
      document.querySelector('app-delivery-map-picker')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  }

  closeMapPicker(): void {
    this.mapOpen.set(false);
  }

  onMapSelected(sel: DeliveryMapSelection): void {
    this.mapOpen.set(false);
    this.mapPoint.set(sel.point);
    if (sel.zone) this.deliveryZoneId.set(sel.zone.id);
    this.sheetStreet = sel.street || '';
    this.sheetNumber = sel.number || '';
    this.sheetBetween = this.addressBetween;
    this.sheetDetails = this.addressDetails;
    this.addressLabel = sel.label;
    this.addressSheetOpen.set(true);
  }

  backToMapFromSheet(): void {
    this.addressSheetOpen.set(false);
    this.mapOpen.set(true);
  }

  confirmAddressSheet(): void {
    const street = this.sheetStreet.trim();
    const number = this.sheetNumber.trim();
    if (street.length < 2) {
      this.snack.open('Completá la calle', 'OK', { duration: 2500 });
      return;
    }
    if (!number) {
      this.snack.open('Completá el número', 'OK', { duration: 2500 });
      return;
    }
    this.addressStreet = street;
    this.addressNumber = number;
    this.addressBetween = this.sheetBetween.trim();
    this.addressDetails = this.sheetDetails.trim();
    this.addressSheetOpen.set(false);
  }

  private clearDeliveryAddress(): void {
    this.addressStreet = '';
    this.addressNumber = '';
    this.addressBetween = '';
    this.addressDetails = '';
    this.addressLabel = '';
    this.mapPoint.set(null);
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
    const nextQty = line.qty + delta;
    if (line.kind !== 'EXTRA' && nextQty <= 0) {
      this.removeLine(line);
      return;
    }
    this.cart.updateQty(
      line.menuItemId,
      line.notes,
      nextQty,
      line.kind === 'EXTRA' ? 'EXTRA' : 'ITEM',
      line.extraId,
      line.attachedToMenuItemId,
      line.removedIngredients,
    );
    if (line.kind === 'EXTRA') return;
    // Ítem + extras van juntos: la cantidad del plato manda.
    for (const ex of this.cart.lines()) {
      if (ex.kind !== 'EXTRA' || ex.attachedToMenuItemId !== line.menuItemId) continue;
      this.cart.updateQty(
        ex.menuItemId,
        ex.notes,
        nextQty,
        'EXTRA',
        ex.extraId,
        ex.attachedToMenuItemId,
        ex.removedIngredients,
      );
    }
  }

  removeLine(line: {
    menuItemId: string;
    notes: string;
    kind?: 'ITEM' | 'EXTRA';
    extraId?: string;
    attachedToMenuItemId?: string;
    removedIngredients?: string[];
  }): void {
    if (line.kind !== 'EXTRA') {
      for (const ex of this.cart.lines()) {
        if (ex.kind !== 'EXTRA' || ex.attachedToMenuItemId !== line.menuItemId) continue;
        this.cart.remove(
          ex.menuItemId,
          ex.notes,
          'EXTRA',
          ex.extraId,
          ex.attachedToMenuItemId,
          ex.removedIngredients,
        );
      }
    }
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
        this.formError.set('Seleccioná una zona de entrega (podés hacerlo desde el mapa).');
        return;
      }
      if (this.deliveryAddressText().trim().length < 5) {
        this.formError.set('Completá el domicilio de entrega.');
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
      body.address = composeDeliveryAddress({
        street: this.addressStreet,
        number: this.addressNumber,
        betweenStreets: this.addressBetween,
        details: this.addressDetails,
      });
      body.deliveryStreetNumber = this.addressNumber.trim() || null;
      const point = this.mapPoint();
      if (point) {
        body.deliveryLat = point.lat;
        body.deliveryLng = point.lng;
      }
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
