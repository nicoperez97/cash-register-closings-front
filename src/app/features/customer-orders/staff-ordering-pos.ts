import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { prettySection } from '../menu/menu-display';
import {
  CreatePublicCustomerOrderBody,
  CustomerOrderFulfillment,
  CustomerOrderPaymentMethod,
  CustomerOrdersApiService,
  PublicOrderingConfig,
  PublicOrderingExtra,
  PublicOrderingMenuItem,
  StaffCustomerOrder,
} from './customer-orders-api.service';
import { apiErrorMessage, orderingMoney, paymentLabel } from './ordering-ui.util';

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
  imports: [FormsModule, MatSnackBarModule],
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
  readonly paymentMethod = signal<CustomerOrderPaymentMethod | ''>('');
  readonly fulfillment = signal<CustomerOrderFulfillment>('COUNTER');

  guestName = '';
  phone = '';
  cashAmount: number | null = null;
  notes = '';
  printCustomerTicket = true;

  readonly shopId = computed(() => String(this.shops.selectedShopId() ?? '').trim());
  readonly slug = computed(() => String(this.shops.selectedShop()?.slug ?? '').trim());

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
    Math.max(0, Math.round((this.subtotal() - this.discountAmount()) * 100) / 100),
  );

  readonly paymentMethods = computed(() => this.config()?.payments?.methods ?? []);

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
        const methods = cfg.payments?.methods ?? [];
        if (methods.length === 1) this.paymentMethod.set(methods[0]);
        else if (methods.includes('CASH')) this.paymentMethod.set('CASH');
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

  payLabel(p: CustomerOrderPaymentMethod): string {
    return paymentLabel(p);
  }

  setSection(sec: string | null): void {
    this.sectionFilter.set(this.sectionFilter() === sec ? null : sec);
  }

  setDiscountMode(mode: 'none' | 'percent' | 'fixed'): void {
    this.discountMode.set(mode);
    if (mode === 'none') this.discountValue.set(null);
  }

  setPayment(m: CustomerOrderPaymentMethod): void {
    this.paymentMethod.set(m);
    if (m === 'CASH' && (this.cashAmount == null || this.cashAmount < this.total())) {
      this.cashAmount = this.total();
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
    if (this.paymentMethod() === 'CASH') this.cashAmount = this.total();
  }

  itemExtras(itemId: string): PublicOrderingExtra[] {
    return this.extras().filter((e) => {
      const ids = e.menuItemIds ?? [];
      return !ids.length || ids.includes(itemId);
    });
  }

  addExtra(extra: PublicOrderingExtra, itemId: string): void {
    const key = `e:${extra.id}:${itemId}`;
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
          kind: 'EXTRA',
          menuItemId: itemId,
          name: extra.name,
          unitPrice: Number(extra.price) || 0,
          qty: 1,
          extraId: extra.id,
          attachedToMenuItemId: itemId,
        },
      ];
    });
    if (this.paymentMethod() === 'CASH') this.cashAmount = this.total();
  }

  bump(line: PosLine, delta: number): void {
    this.lines.update((list) =>
      list
        .map((l) =>
          l.key === line.key ? { ...l, qty: Math.max(0, Math.min(99, l.qty + delta)) } : l,
        )
        .filter((l) => l.qty > 0),
    );
    if (this.paymentMethod() === 'CASH') this.cashAmount = this.total();
  }

  clearTicket(): void {
    this.lines.set([]);
    this.discountMode.set('none');
    this.discountValue.set(null);
  }

  submit(): void {
    const shopId = this.shopId();
    const lines = this.lines();
    const paymentMethod = this.paymentMethod();
    if (!shopId) {
      this.snack.open('Seleccioná un local', 'OK', { duration: 2500 });
      return;
    }
    if (!lines.length) {
      this.snack.open('Agregá al menos un ítem', 'OK', { duration: 2500 });
      return;
    }
    if (!paymentMethod) {
      this.snack.open('Elegí el medio de pago', 'OK', { duration: 2500 });
      return;
    }
    if (paymentMethod === 'CASH') {
      const cash = Number(this.cashAmount);
      if (!Number.isFinite(cash) || cash < this.total()) {
        this.snack.open('El efectivo debe cubrir el total', 'OK', { duration: 3000 });
        return;
      }
    }

    const name = this.guestName.trim() || 'Cliente Mostrador';
    const parts = name.split(/\s+/);
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || 'Cliente';
    const lastName = parts.length > 1 ? parts[parts.length - 1] : 'Mostrador';
    const phone = this.phone.replace(/\D/g, '');
    if (phone.length > 0 && phone.length < 6) {
      this.snack.open('Celular inválido', 'OK', { duration: 2500 });
      return;
    }

    const body: CreatePublicCustomerOrderBody = {
      fulfillment: 'COUNTER',
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
      customerNotes: this.notes.trim() || null,
      printCustomerTicket: this.printCustomerTicket,
    };
    if (paymentMethod === 'CASH') body.cashAmount = Number(this.cashAmount);
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
