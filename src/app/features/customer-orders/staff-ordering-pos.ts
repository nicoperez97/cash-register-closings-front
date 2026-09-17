import { DecimalPipe } from '@angular/common';
import {
  Component,
  HostBinding,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { prettySection } from '../menu/menu-display';
import {
  CreatePublicCustomerOrderBody,
  CustomerOrderFulfillment,
  CustomerOrdersApiService,
  PublicOrderingConfig,
  PublicOrderingExtra,
  PublicOrderingMenuItem,
  StaffCustomerOrder,
} from './customer-orders-api.service';
import {
  DeliveryMapPickerComponent,
  DeliveryMapSelection,
} from './delivery-map-picker';
import { composeDeliveryAddress, LatLng } from './delivery-geo.util';
import {
  apiErrorMessage,
  onAccentColor,
  orderingMoney,
  orderingPayChoices,
  orderingPayNeedsCashTender,
  orderingPayToApiMethod,
  type OrderingPayChoice,
} from './ordering-ui.util';

type PosLine = {
  key: string;
  kind: 'ITEM' | 'EXTRA';
  menuItemId: string;
  name: string;
  unitPrice: number;
  qty: number;
  extraId?: string;
  attachedToMenuItemId?: string;
};

type CatalogItem = PublicOrderingMenuItem & { section: string };

@Component({
  selector: 'app-staff-ordering-pos',
  imports: [FormsModule, MatSnackBarModule, DeliveryMapPickerComponent, DecimalPipe],
  templateUrl: './staff-ordering-pos.html',
  styleUrl: './staff-ordering-pos.scss',
})
export class StaffOrderingPosComponent implements OnInit {
  private readonly api = inject(CustomerOrdersApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly title = inject(Title);
  readonly shops = inject(ShopContextService);

  /** Embebido en la card del tablero (sin navegar). */
  readonly embedded = input(false);
  readonly created = output<StaffCustomerOrder>();
  readonly cancelled = output<void>();

  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly config = signal<PublicOrderingConfig | null>(null);
  readonly lines = signal<PosLine[]>([]);
  readonly query = signal('');
  readonly sectionFilter = signal<string | null>(null);
  readonly discountMode = signal<'none' | 'percent' | 'fixed'>('none');
  readonly discountValue = signal<number | null>(null);
  readonly paymentChoiceId = signal<string>('');
  readonly fulfillment = signal<CustomerOrderFulfillment>('COUNTER');
  readonly deliveryZoneId = signal<string | null>(null);
  readonly mapPoint = signal<LatLng | null>(null);
  readonly mapOpen = signal(false);

  guestName = '';
  phone = '';
  cashAmount: number | null = null;
  notes = '';
  printCustomerTicket = true;
  addressStreet = '';
  addressNumber = '';
  addressBetween = '';
  addressDetails = '';

  readonly shopId = computed(() => String(this.shops.selectedShopId() ?? '').trim());
  readonly slug = computed(() => String(this.shops.selectedShop()?.slug ?? '').trim());

  readonly deliveryEnabled = computed(() => !!this.config()?.deliveryEnabled);
  readonly deliveryZones = computed(() => this.config()?.deliveryZones ?? []);

  readonly selectedZone = computed(() => {
    const id = this.deliveryZoneId();
    if (!id) return null;
    return this.deliveryZones().find((z) => z.id === id) ?? null;
  });

  readonly deliveryFee = computed(() =>
    this.fulfillment() === 'DELIVERY' ? Number(this.selectedZone()?.fee ?? 0) : 0,
  );

  readonly sections = computed(() => {
    const menus = this.config()?.menus ?? [];
    const names: string[] = [];
    const seen = new Set<string>();
    for (const m of menus) {
      for (const sec of m.sections ?? []) {
        const label =
          menus.length > 1 && m.title
            ? `${prettySection(sec.name)} · ${m.title}`
            : prettySection(sec.name);
        if (!seen.has(label)) {
          seen.add(label);
          names.push(label);
        }
      }
    }
    return names;
  });

  readonly catalog = computed((): CatalogItem[] => {
    const menus = this.config()?.menus ?? [];
    const out: CatalogItem[] = [];
    for (const m of menus) {
      for (const sec of m.sections ?? []) {
        const section =
          menus.length > 1 && m.title
            ? `${prettySection(sec.name)} · ${m.title}`
            : prettySection(sec.name);
        for (const it of sec.items ?? []) {
          if (!it?.id || !it.name || it.price == null) continue;
          out.push({ ...it, section });
        }
      }
    }
    return out;
  });

  readonly filteredCatalog = computed(() => {
    const q = this.query().trim().toLowerCase();
    const sec = this.sectionFilter();
    return this.catalog().filter((it) => {
      if (sec && it.section !== sec) return false;
      if (!q) return true;
      return `${it.name} ${it.description ?? ''}`.toLowerCase().includes(q);
    });
  });

  readonly extras = computed(() => this.config()?.extras ?? []);

  readonly subtotal = computed(() =>
    this.lines().reduce((s, l) => s + l.unitPrice * l.qty, 0),
  );

  readonly discountAmount = computed(() => {
    const mode = this.discountMode();
    const raw = Number(this.discountValue());
    const sub = this.subtotal();
    if (mode === 'none' || !Number.isFinite(raw) || raw <= 0 || sub <= 0) return 0;
    if (mode === 'percent') {
      return Math.min(sub, Math.round(sub * (Math.min(100, raw) / 100) * 100) / 100);
    }
    return Math.min(sub, Math.round(raw * 100) / 100);
  });

  readonly total = computed(() =>
    Math.max(
      0,
      Math.round((this.subtotal() - this.discountAmount() + this.deliveryFee()) * 100) / 100,
    ),
  );

  readonly paymentChoices = computed(() => orderingPayChoices(this.config()?.payments));
  readonly selectedPayment = computed(() => {
    const id = this.paymentChoiceId();
    return this.paymentChoices().find((c) => c.id === id) ?? null;
  });
  readonly needsCashTender = computed(() => orderingPayNeedsCashTender(this.selectedPayment()));
  readonly paymentMethod = computed(() => {
    const choice = this.selectedPayment();
    return choice ? orderingPayToApiMethod(choice) : ('' as const);
  });

  readonly accent = computed(
    () =>
      this.config()?.shop?.accentColor?.trim() ||
      this.shops.accentColor() ||
      '#2e7d32',
  );
  readonly onAccent = computed(() => onAccentColor(this.accent()));

  @HostBinding('style.--accent')
  get hostAccent(): string {
    return this.accent();
  }

  @HostBinding('style.--on-accent')
  get hostOnAccent(): string {
    return this.onAccent();
  }

  ngOnInit(): void {
    if (!this.embedded()) this.title.setTitle('Pedido mostrador');
    this.load();
  }

  load(): void {
    const slug = this.slug();
    if (!slug) {
      this.loading.set(false);
      this.error.set('Seleccioná un local');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api.getPublicOrdering(slug).subscribe({
      next: (cfg) => {
        this.config.set(cfg);
        this.loading.set(false);
        this.fulfillment.set('COUNTER');
        const choices = orderingPayChoices(cfg.payments);
        const cashLike =
          choices.find((c) => orderingPayNeedsCashTender(c)) ??
          choices.find((c) => c.kind === 'CASH') ??
          choices[0];
        if (cashLike) this.paymentChoiceId.set(cashLike.id);
        this.cashAmount = this.total();
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudo cargar la carta'));
      },
    });
  }

  money(n: number): string {
    return orderingMoney(n);
  }

  syncCashIfNeeded(): void {
    if (this.needsCashTender()) this.cashAmount = this.total();
  }

  setFulfillment(f: CustomerOrderFulfillment): void {
    this.fulfillment.set(f);
    if (f !== 'DELIVERY') {
      this.deliveryZoneId.set(null);
      this.mapPoint.set(null);
      this.mapOpen.set(false);
      this.addressStreet = '';
      this.addressNumber = '';
      this.addressBetween = '';
      this.addressDetails = '';
    }
    this.syncCashIfNeeded();
  }

  setDeliveryZone(id: string | null): void {
    this.deliveryZoneId.set(id);
    this.syncCashIfNeeded();
  }

  openMapPicker(): void {
    this.mapOpen.set(true);
  }

  closeMapPicker(): void {
    this.mapOpen.set(false);
  }

  onMapSelected(sel: DeliveryMapSelection): void {
    this.mapPoint.set(sel.point);
    if (sel.zone?.id) this.deliveryZoneId.set(sel.zone.id);
    if (sel.street) this.addressStreet = sel.street;
    if (sel.number) this.addressNumber = sel.number;
    this.mapOpen.set(false);
    this.syncCashIfNeeded();
  }

  setSection(sec: string | null): void {
    this.sectionFilter.set(this.sectionFilter() === sec ? null : sec);
  }

  setDiscountMode(mode: 'none' | 'percent' | 'fixed'): void {
    this.discountMode.set(mode);
    if (mode === 'none') this.discountValue.set(null);
    this.syncCashIfNeeded();
  }

  setPayment(choice: OrderingPayChoice): void {
    this.paymentChoiceId.set(choice.id);
    if (orderingPayNeedsCashTender(choice)) {
      if (this.cashAmount == null || this.cashAmount < this.total()) {
        this.cashAmount = this.total();
      }
    }
  }

  addItem(it: CatalogItem): void {
    const key = `i:${it.id}`;
    this.lines.update((list) => {
      const idx = list.findIndex((l) => l.key === key);
      if (idx >= 0) {
        return list.map((l, i) =>
          i === idx ? { ...l, qty: Math.min(99, l.qty + 1) } : l,
        );
      }
      return [
        ...list,
        {
          key,
          kind: 'ITEM',
          menuItemId: it.id,
          name: it.name,
          unitPrice: Number(it.price) || 0,
          qty: 1,
        },
      ];
    });
    this.syncCashIfNeeded();
  }

  itemExtras(itemId: string): PublicOrderingExtra[] {
    return this.extras().filter((e) => {
      const ids = e.menuItemIds ?? [];
      return !ids.length || ids.includes(itemId);
    });
  }

  addExtra(extra: PublicOrderingExtra, itemId: string): void {
    const parent = this.catalog().find((it) => it.id === itemId);
    if (!parent) return;
    const itemKey = `i:${itemId}`;
    const extraKey = `e:${extra.id}:${itemId}`;
    this.lines.update((list) => {
      let next = [...list];
      const itemIdx = next.findIndex((l) => l.key === itemKey);
      const exIdx = next.findIndex((l) => l.key === extraKey);

      if (itemIdx < 0) {
        next = [
          ...next,
          {
            key: itemKey,
            kind: 'ITEM',
            menuItemId: parent.id,
            name: parent.name,
            unitPrice: Number(parent.price) || 0,
            qty: 1,
          },
          {
            key: extraKey,
            kind: 'EXTRA',
            menuItemId: itemId,
            name: extra.name,
            unitPrice: Number(extra.price) || 0,
            qty: 1,
            extraId: extra.id,
            attachedToMenuItemId: itemId,
          },
        ];
        return next;
      }

      if (exIdx < 0) {
        const itemQty = next[itemIdx].qty;
        next.push({
          key: extraKey,
          kind: 'EXTRA',
          menuItemId: itemId,
          name: extra.name,
          unitPrice: Number(extra.price) || 0,
          qty: itemQty,
          extraId: extra.id,
          attachedToMenuItemId: itemId,
        });
        return next;
      }

      return next.map((l, i) => {
        if (i === itemIdx || i === exIdx) {
          return { ...l, qty: Math.min(99, l.qty + 1) };
        }
        return l;
      });
    });
    this.syncCashIfNeeded();
  }

  bump(line: PosLine, delta: number): void {
    this.lines.update((list) =>
      list
        .map((l) =>
          l.key === line.key ? { ...l, qty: Math.max(0, Math.min(99, l.qty + delta)) } : l,
        )
        .filter((l) => l.qty > 0),
    );
    this.syncCashIfNeeded();
  }

  clearTicket(): void {
    this.lines.set([]);
    this.discountMode.set('none');
    this.discountValue.set(null);
  }

  submit(): void {
    const shopId = this.shopId();
    const lines = this.lines();
    const fulfillment = this.fulfillment();
    if (!shopId) {
      this.snack.open('Seleccioná un local', 'OK', { duration: 2500 });
      return;
    }
    if (!lines.length) {
      this.snack.open('Agregá al menos un ítem', 'OK', { duration: 2500 });
      return;
    }
    if (!this.selectedPayment()) {
      this.snack.open('Elegí el medio de pago', 'OK', { duration: 2500 });
      return;
    }
    if (fulfillment === 'DELIVERY') {
      if (!this.deliveryEnabled()) {
        this.snack.open('Delivery no está habilitado en este local', 'OK', { duration: 3000 });
        return;
      }
      if (!this.deliveryZoneId()) {
        this.snack.open('Elegí la zona de entrega', 'OK', { duration: 3000 });
        return;
      }
      const addr = composeDeliveryAddress({
        street: this.addressStreet,
        number: this.addressNumber,
        betweenStreets: this.addressBetween,
        details: this.addressDetails,
      });
      if (addr.trim().length < 5) {
        this.snack.open('Completá el domicilio de entrega', 'OK', { duration: 3000 });
        return;
      }
      if (this.phone.replace(/\D/g, '').length < 6) {
        this.snack.open('Para delivery necesitás un celular válido', 'OK', { duration: 3000 });
        return;
      }
    }
    if (this.needsCashTender()) {
      const cash = Number(this.cashAmount);
      if (!Number.isFinite(cash) || cash < this.total()) {
        this.snack.open('El efectivo debe cubrir el total', 'OK', { duration: 3000 });
        return;
      }
    }

    const name = this.guestName.trim() || (fulfillment === 'DELIVERY' ? 'Cliente Delivery' : 'Cliente Mostrador');
    const parts = name.split(/\s+/);
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || 'Cliente';
    const lastName =
      parts.length > 1
        ? parts[parts.length - 1]
        : fulfillment === 'DELIVERY'
          ? 'Delivery'
          : 'Mostrador';
    const phone = this.phone.replace(/\D/g, '');
    if (phone.length > 0 && phone.length < 6) {
      this.snack.open('Celular inválido', 'OK', { duration: 2500 });
      return;
    }

    const pay = this.selectedPayment()!;
    const paymentMethod = orderingPayToApiMethod(pay);
    const body: CreatePublicCustomerOrderBody = {
      fulfillment,
      items: lines
        .filter((l) => l.kind !== 'EXTRA')
        .map((l) => ({ menuItemId: l.menuItemId, qty: l.qty })),
      extras: lines
        .filter((l) => l.kind === 'EXTRA' && l.extraId)
        .map((l) => ({
          extraId: l.extraId!,
          qty: l.qty,
          attachedToMenuItemId: l.attachedToMenuItemId || null,
        })),
      firstName,
      lastName,
      ...(phone ? { phone } : {}),
      paymentMethod,
      paymentMethodId: pay.id,
      customerNotes: this.notes.trim() || null,
      printCustomerTicket: this.printCustomerTicket,
    };
    if (fulfillment === 'DELIVERY') {
      body.phone = phone;
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
      body.cashAmount = this.needsCashTender()
        ? Number(this.cashAmount)
        : this.total();
    }
    if (this.discountMode() === 'percent' && Number(this.discountValue()) > 0) {
      body.discountPercent = Number(this.discountValue());
    }
    if (this.discountMode() === 'fixed' && Number(this.discountValue()) > 0) {
      body.discountFixed = Number(this.discountValue());
    }

    this.submitting.set(true);
    this.api.createStaffOrder(shopId, body).subscribe({
      next: (order) => {
        this.submitting.set(false);
        this.snack.open(`Pedido #${order.code} creado`, 'OK', { duration: 2500 });
        this.created.emit(order);
      },
      error: (err) => {
        this.submitting.set(false);
        this.snack.open(apiErrorMessage(err, 'No se pudo crear el pedido'), 'OK', {
          duration: 3500,
        });
      },
    });
  }
}
