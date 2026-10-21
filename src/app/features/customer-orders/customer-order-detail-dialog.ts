import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { debounceTime, filter } from 'rxjs';
import { formatMoney } from '../../shared/utils/money';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import {
  resolveDiscountPresets,
  type DiscountPreset,
} from '../../core/shop/discount-presets';
import { IntegrationsApiService } from '../integrations/integrations-api.service';
import {
  CustomerOrderAudit,
  CustomerOrderStatus,
  CustomerOrdersApiService,
  PublicOrderingConfig,
  PublicOrderingMenuItem,
  StaffCustomerOrder,
} from './customer-orders-api.service';
import {
  canAcreditOrder,
  canCompleteOrder,
  canDesacreditOrder,
  fulfillmentLabelFull,
  isOrderAccredited,
  orderPaymentText,
  orderPhoneHref,
  previousStatusAction,
  primaryForwardAction,
  STATUS_LABEL,
} from './customer-orders-status.util';
import { formatCustomerOrderAuditLabel } from './customer-order-audit.util';
import { groupOrderLines, OrderLineGroup } from './ordering-ui.util';

export type CustomerOrderDetailDialogData = {
  order: StaffCustomerOrder;
  shopId: string;
  canManage: boolean;
};

export type CustomerOrderDetailDialogResult =
  | { kind: 'updated'; order: StaffCustomerOrder }
  | null;

/** App del comercio Deliverate (panel para ver / gestionar envíos). */
export const DELIVERATE_APP_URL = 'https://app.deliverate.io/';

const DELIVERATE_STATE_LABEL: Record<number, string> = {
  0: 'Solicitado',
  1: 'Repartidor asignado',
  2: 'Retirado',
  3: 'Entregado',
  4: 'Cancelado (cliente)',
  5: 'Cancelado (Deliverate)',
  6: 'Cancelado (comercio)',
  7: 'Espera comercio',
  8: 'Espera consumidor',
};

type DraftLine = {
  key: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  qty: number;
  notes?: string | null;
  kind?: 'ITEM' | 'EXTRA' | 'PROMO';
  extraId?: string | null;
  attachedToMenuItemId?: string | null;
  promoId?: string | null;
  promoBundleKey?: string | null;
  removedIngredients?: string[];
  isEntrada?: boolean;
  combinesWithNames?: string[];
};

@Component({
  selector: 'app-customer-order-detail-dialog',
  imports: [DatePipe, DecimalPipe, FormsModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './customer-order-detail-dialog.html',
  styleUrl: './customer-order-detail-dialog.scss',
})
export class CustomerOrderDetailDialogComponent implements OnInit {
  private readonly api = inject(CustomerOrdersApiService);
  private readonly integrationsApi = inject(IntegrationsApiService);
  private readonly auth = inject(AuthService);
  private readonly live = inject(ShopLiveClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly ref = inject(
    MatDialogRef<CustomerOrderDetailDialogComponent, CustomerOrderDetailDialogResult>,
  );
  readonly data = inject<CustomerOrderDetailDialogData>(MAT_DIALOG_DATA);

  readonly order = signal<StaffCustomerOrder>(this.data.order);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly deliverateEnabled = signal(false);
  readonly dboyLocation = signal<{ lat: number; lng: number; at: string | null } | null>(null);
  private dirty = false;

  readonly editing = signal(false);
  readonly draftLines = signal<DraftLine[]>([]);
  readonly discountMode = signal<'none' | 'percent' | 'fixed'>('none');
  readonly discountValue = signal<number | null>(null);
  readonly discountPresetId = signal<string | null>(null);
  readonly editNote = signal('');
  readonly audits = signal<CustomerOrderAudit[]>([]);
  readonly catalog = signal<PublicOrderingConfig | null>(null);
  readonly adding = signal(false);
  readonly addQuery = signal('');

  readonly statusLabel = STATUS_LABEL;
  readonly canManage = this.data.canManage;

  readonly canEdit = computed(
    () => this.canManage && this.order().status !== 'CANCELLED',
  );

  readonly discountPresets = computed(() =>
    resolveDiscountPresets(this.catalog()?.discountPresets),
  );

  readonly showDiscountInput = computed(
    () => this.discountMode() !== 'none' && !this.discountPresetId(),
  );

  readonly draftSubtotal = computed(() =>
    this.draftLines().reduce((s, l) => s + l.unitPrice * l.qty, 0),
  );

  readonly draftDiscountAmount = computed(() => {
    const mode = this.discountMode();
    const raw = Number(this.discountValue());
    const sub = this.draftSubtotal();
    if (mode === 'none' || !Number.isFinite(raw) || raw <= 0 || sub <= 0) return 0;
    if (mode === 'percent') {
      return Math.min(sub, Math.round(sub * (Math.min(100, raw) / 100) * 100) / 100);
    }
    return Math.min(sub, Math.round(raw * 100) / 100);
  });

  readonly draftTotal = computed(() =>
    Math.max(
      0,
      Math.round(
        (this.draftSubtotal() -
          this.draftDiscountAmount() +
          (Number(this.order().deliveryFee) || 0)) *
          100,
      ) / 100,
    ),
  );

  readonly catalogItems = computed((): Array<PublicOrderingMenuItem & { section: string }> => {
    const menus = this.catalog()?.menus ?? [];
    const out: Array<PublicOrderingMenuItem & { section: string }> = [];
    for (const m of menus) {
      for (const sec of m.sections ?? []) {
        const section =
          menus.length > 1 && m.title
            ? `${sec.name} · ${m.title}`
            : String(sec.name ?? 'Carta');
        for (const it of sec.items ?? []) {
          if (!it?.id || !it.name || it.price == null) continue;
          out.push({ ...it, section });
        }
      }
    }
    return out;
  });

  readonly filteredCatalogItems = computed(() => {
    const q = this.addQuery().trim().toLowerCase();
    if (!q) return this.catalogItems().slice(0, 40);
    return this.catalogItems()
      .filter((it) => `${it.name} ${it.description ?? ''}`.toLowerCase().includes(q))
      .slice(0, 40);
  });

  ngOnInit(): void {
    this.integrationsApi.getDeliverate(this.data.shopId).subscribe({
      next: (cfg) => this.deliverateEnabled.set(!!cfg.enabled && !!cfg.connected),
      error: () => this.deliverateEnabled.set(false),
    });

    this.loadAudits();

    this.live
      .connectAuth(this.data.shopId)
      .pipe(
        filter((t) => t.domain === 'customer-orders'),
        debounceTime(280),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.refreshFromServer());
  }

  private loadAudits(): void {
    this.api.listOrderAudits(this.data.shopId, this.order().id).subscribe({
      next: (rows) => this.audits.set(rows ?? []),
      error: () => this.audits.set([]),
    });
  }

  private refreshFromServer(): void {
    if (this.busy() || this.editing()) return;
    this.api.getStaffOrder(this.data.shopId, this.order().id).subscribe({
      next: (fresh) => {
        const prev = this.order();
        if (
          fresh.status !== prev.status ||
          fresh.externalId !== prev.externalId ||
          JSON.stringify(fresh.externalMeta ?? null) !== JSON.stringify(prev.externalMeta ?? null) ||
          fresh.paymentAccreditedAt !== prev.paymentAccreditedAt ||
          fresh.total !== prev.total
        ) {
          this.dirty = true;
        }
        this.order.set(fresh);
      },
      error: () => undefined,
    });
  }

  money(n: number): string {
    return formatMoney(n);
  }

  itemGroups(): OrderLineGroup[] {
    return groupOrderLines(this.order().items);
  }

  lineAmount(line: { unitPrice?: number; qty?: number }): number {
    return (Number(line.unitPrice) || 0) * (Number(line.qty) || 0);
  }

  fulfillmentText(): string {
    return fulfillmentLabelFull(this.order().fulfillment);
  }

  paymentText(): string {
    return orderPaymentText(this.order());
  }

  phoneHref(): string {
    return orderPhoneHref(this.order().phone);
  }

  isAccredited(): boolean {
    return isOrderAccredited(this.order());
  }

  canAcredit(): boolean {
    return this.canManage && canAcreditOrder(this.order());
  }

  canDesacredit(): boolean {
    return this.canManage && canDesacreditOrder(this.order());
  }

  backAction() {
    return previousStatusAction(this.order());
  }

  forwardAction() {
    return primaryForwardAction(this.order());
  }

  canForward(): boolean {
    const a = this.forwardAction();
    if (!a) return false;
    if (a.status === 'COMPLETED') return canCompleteOrder(this.order());
    return true;
  }

  canRequestDeliverate(): boolean {
    const o = this.order();
    if (!this.deliverateEnabled()) return false;
    if (o.fulfillment !== 'DELIVERY') return false;
    if (o.status === 'CANCELLED' || o.status === 'COMPLETED') return false;
    if (o.externalSource === 'deliverate' && o.externalId) return false;
    if (o.deliveryLat == null || o.deliveryLng == null) return false;
    const shopId = this.data.shopId;
    const user = this.auth.currentUser();
    return (
      this.canManage ||
      hasShopPermission(user, shopId, 'integrations.manage') ||
      hasShopPermission(user, shopId, 'customerOrders.manage')
    );
  }

  deliverateStateLabel(): string | null {
    const o = this.order();
    if (o.externalSource !== 'deliverate' || !o.externalId) return null;
    const state = Number(o.externalMeta?.['state']);
    return Number.isFinite(state)
      ? (DELIVERATE_STATE_LABEL[state] ?? `Estado ${state}`)
      : 'Solicitado';
  }

  /** Filas legibles con lo que Deliverate manda en externalMeta. */
  deliverateRows(): { label: string; value: string }[] {
    const o = this.order();
    if (o.externalSource !== 'deliverate' || !o.externalId) return [];
    const m = o.externalMeta ?? {};
    const rows: { label: string; value: string }[] = [];
    const push = (label: string, value: string | null | undefined) => {
      const v = String(value ?? '').trim();
      if (v) rows.push({ label, value: v });
    };

    push('ID envío', o.externalId);
    const orderNum = m['order_number'];
    if (orderNum != null && String(orderNum).trim()) {
      push('Nº Deliverate', String(orderNum));
    }
    const dboy = m['dboy_id'];
    if (dboy != null && String(dboy).trim() !== '') {
      push('Repartidor', `#${dboy}`);
    }
    const kitchen = m['is_kitchen_ready'];
    if (kitchen === true) push('Cocina', 'Lista (Deliverate)');
    else if (m['kitchenReadyPending'] === true) {
      push('Cocina', 'Pendiente en Deliverate (pasá a Listo / esperá su demora)');
    } else if (kitchen === false) push('Cocina', 'Pendiente');

    const delayStart = this.asFiniteNumber(m['delay_start_time'] ?? m['withdrawn_delay']);
    const delayEnd = this.asFiniteNumber(m['delay_end_time'] ?? m['confirmed_delay']);
    if (delayStart != null) push('Retiro est.', `${Math.round(delayStart)} min`);
    if (delayEnd != null) push('Entrega est.', `${Math.round(delayEnd)} min`);

    const distance = this.asFiniteNumber(m['distance']);
    if (distance != null) push('Distancia', `${distance.toFixed(1)} km`);
    const distancePrice = this.asFiniteNumber(m['distance_price']);
    if (distancePrice != null) push('Costo envío', this.money(distancePrice));

    if (m['is_payed_online'] === true) push('Cobro', 'Online (sin efectivo)');
    else if (m['is_payed_online'] === false) push('Cobro', 'Efectivo al entregar');

    const flags: string[] = [];
    if (m['is_high_demand'] === true) flags.push('Alta demanda');
    if (m['is_exclusive_order'] === true) flags.push('Exclusivo');
    if (m['is_getting_help'] === true) flags.push('Ayuda en curso');
    if (m['is_return_order'] === true) flags.push('Retorno al local');
    if (flags.length) push('Avisos', flags.join(' · '));

    return rows;
  }

  hasDeliverateDboy(): boolean {
    const dboy = this.order().externalMeta?.['dboy_id'];
    return dboy != null && String(dboy).trim() !== '';
  }

  openDeliverateApp(): void {
    window.open(DELIVERATE_APP_URL, '_blank', 'noopener,noreferrer');
  }

  loadDboyLocation(): void {
    if (!this.hasDeliverateDboy() || this.busy()) return;
    this.busy.set(true);
    this.dboyLocation.set(null);
    this.error.set(null);
    this.integrationsApi.dboyLocation(this.data.shopId, this.order().id).subscribe({
      next: (loc) => {
        this.busy.set(false);
        const coords = loc.location?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) {
          this.error.set('Deliverate no devolvió coordenadas del repartidor');
          return;
        }
        const [lat, lng] = coords;
        this.dboyLocation.set({
          lat: Number(lat),
          lng: Number(lng),
          at: loc.created_date ?? null,
        });
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.errMsg(err, 'No hay ubicación del repartidor todavía'));
      },
    });
  }

  openDboyOnMaps(): void {
    const loc = this.dboyLocation();
    if (!loc) return;
    const url = `https://www.google.com/maps?q=${encodeURIComponent(`${loc.lat},${loc.lng}`)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  private asFiniteNumber(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  requestDeliverate(): void {
    if (!this.canRequestDeliverate() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.integrationsApi.requestDeliverate(this.data.shopId, this.order().id).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.dirty = true;
        this.order.set({
          ...this.order(),
          status: res.status as CustomerOrderStatus,
          externalSource: res.externalSource,
          externalId: res.externalId,
          externalMeta: res.externalMeta,
          deliveryLat: res.deliveryLat,
          deliveryLng: res.deliveryLng,
          deliveryStreetNumber: res.deliveryStreetNumber,
        });
        this.openDeliverateApp();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.errMsg(err, 'No se pudo solicitar Deliverate'));
      },
    });
  }

  startEdit(): void {
    if (!this.canEdit() || this.busy()) return;
    this.error.set(null);
    this.editNote.set('');
    this.adding.set(false);
    this.addQuery.set('');
    this.draftLines.set(
      (this.order().items ?? []).map((it, i) => ({
        key: `d_${i}_${it.menuItemId}_${Math.random().toString(36).slice(2, 7)}`,
        menuItemId: String(it.menuItemId),
        name: String(it.name),
        unitPrice: Number(it.unitPrice) || 0,
        qty: Math.max(1, Number(it.qty) || 1),
        notes: it.notes ?? null,
        kind: it.kind ?? 'ITEM',
        extraId: it.extraId ?? null,
        attachedToMenuItemId: it.attachedToMenuItemId ?? null,
        promoId: (it as { promoId?: string | null }).promoId ?? null,
        promoBundleKey: (it as { promoBundleKey?: string | null }).promoBundleKey ?? null,
        removedIngredients: it.removedIngredients,
        isEntrada: !!(it as { isEntrada?: boolean }).isEntrada,
        combinesWithNames: (it as { combinesWithNames?: string[] }).combinesWithNames,
      })),
    );
    this.initDiscountFromOrder();
    this.editing.set(true);
    if (!this.catalog()) {
      this.api.getStaffOrderingCatalog(this.data.shopId).subscribe({
        next: (cfg) => this.catalog.set(cfg),
        error: () => undefined,
      });
    }
  }

  private initDiscountFromOrder(): void {
    const amount = Number(this.order().discountAmount ?? 0) || 0;
    const label = String(this.order().discountLabel ?? '').trim();
    this.discountPresetId.set(null);
    if (amount <= 0) {
      this.discountMode.set('none');
      this.discountValue.set(null);
      return;
    }
    if (/%\s*$/.test(label)) {
      const pct = Number(label.replace(/%/g, '').trim());
      this.discountMode.set('percent');
      this.discountValue.set(Number.isFinite(pct) && pct > 0 ? pct : null);
      return;
    }
    this.discountMode.set('fixed');
    this.discountValue.set(amount);
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.adding.set(false);
    this.error.set(null);
  }

  setDiscountMode(mode: 'none' | 'percent' | 'fixed'): void {
    this.discountPresetId.set(null);
    this.discountMode.set(mode);
    if (mode === 'none') this.discountValue.set(null);
  }

  applyDiscountPreset(preset: DiscountPreset): void {
    this.discountPresetId.set(preset.id);
    this.discountMode.set(preset.mode);
    this.discountValue.set(preset.value);
  }

  bumpDraft(line: DraftLine, delta: number): void {
    this.draftLines.update((rows) =>
      rows
        .map((r) => {
          if (r.key !== line.key) return r;
          const qty = Math.max(0, Math.min(99, r.qty + delta));
          return { ...r, qty };
        })
        .filter((r) => r.qty > 0),
    );
  }

  setDraftPrice(line: DraftLine, raw: string | number | null): void {
    const n = Math.max(0, Math.round(Number(raw) || 0));
    this.draftLines.update((rows) =>
      rows.map((r) => (r.key === line.key ? { ...r, unitPrice: n } : r)),
    );
  }

  removeDraft(line: DraftLine): void {
    this.draftLines.update((rows) => rows.filter((r) => r.key !== line.key));
  }

  openAddPicker(): void {
    this.adding.set(true);
    this.addQuery.set('');
    if (!this.catalog()) {
      this.api.getStaffOrderingCatalog(this.data.shopId).subscribe({
        next: (cfg) => this.catalog.set(cfg),
        error: () => this.error.set('No se pudo cargar la carta'),
      });
    }
  }

  addFromCatalog(item: PublicOrderingMenuItem): void {
    const price = Math.max(0, Math.round(Number(item.price) || 0));
    this.draftLines.update((rows) => [
      ...rows,
      {
        key: `add_${item.id}_${Date.now().toString(36)}`,
        menuItemId: String(item.id),
        name: String(item.name),
        unitPrice: price,
        qty: 1,
        kind: 'ITEM',
      },
    ]);
    this.adding.set(false);
  }

  saveEdit(): void {
    if (!this.canEdit() || this.busy()) return;
    const lines = this.draftLines();
    if (!lines.length) {
      this.error.set('El pedido necesita al menos un ítem');
      return;
    }
    const mode = this.discountMode();
    const val = Number(this.discountValue());
    const body = {
      items: lines.map((l) => ({
        menuItemId: l.menuItemId,
        name: l.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
        notes: l.notes ?? null,
        kind: l.kind ?? ('ITEM' as const),
        extraId: l.extraId ?? null,
        attachedToMenuItemId: l.attachedToMenuItemId ?? null,
        promoId: l.promoId ?? null,
        promoBundleKey: l.promoBundleKey ?? null,
        removedIngredients: l.removedIngredients,
        isEntrada: l.isEntrada,
        combinesWithNames: l.combinesWithNames,
      })),
      note: this.editNote().trim() || null,
      ...(mode === 'percent' && Number.isFinite(val) && val > 0
        ? { discountPercent: val }
        : mode === 'fixed' && Number.isFinite(val) && val > 0
          ? { discountFixed: val }
          : { clearDiscount: true }),
    };

    this.busy.set(true);
    this.error.set(null);
    this.api.patchOrder(this.data.shopId, this.order().id, body).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.dirty = true;
        this.order.set(res.order);
        this.audits.set(res.audits ?? []);
        this.editing.set(false);
        this.adding.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.errMsg(err, 'No se pudo guardar el pedido'));
      },
    });
  }

  auditLabel(a: CustomerOrderAudit): string {
    return formatCustomerOrderAuditLabel(a);
  }

  close(): void {
    if (this.editing()) {
      this.cancelEdit();
      return;
    }
    this.ref.close(this.dirty ? { kind: 'updated', order: this.order() } : null);
  }

  acredit(): void {
    if (!this.canAcredit() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.acreditPayment(this.data.shopId, this.order().id).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.dirty = true;
        this.order.set(updated);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.errMsg(err, 'No se pudo acreditar'));
      },
    });
  }

  desacredit(): void {
    if (!this.canDesacredit() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.desacreditPayment(this.data.shopId, this.order().id).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.dirty = true;
        this.order.set(updated);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.errMsg(err, 'No se pudo desacreditar'));
      },
    });
  }

  setStatus(status: CustomerOrderStatus): void {
    if (!this.canManage || this.busy()) return;
    if (status === 'COMPLETED' && !canCompleteOrder(this.order())) {
      this.error.set('Acreditá el pago antes de completar');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.updateStatus(this.data.shopId, this.order().id, status).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.dirty = true;
        this.order.set(updated);
        if (updated.status === 'COMPLETED' || updated.status === 'CANCELLED') {
          this.ref.close({ kind: 'updated', order: updated });
        }
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.errMsg(err, 'No se pudo actualizar'));
      },
    });
  }

  private errMsg(err: unknown, fallback: string): string {
    const e = err as { error?: { message?: string | string[] } };
    const msg = e?.error?.message;
    if (Array.isArray(msg) && msg.length) return String(msg[0]);
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
    return fallback;
  }
}
