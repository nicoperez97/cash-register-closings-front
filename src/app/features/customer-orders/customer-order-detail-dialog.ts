import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { formatMoney } from '../../shared/utils/money';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { IntegrationsApiService } from '../integrations/integrations-api.service';
import {
  CustomerOrderStatus,
  CustomerOrdersApiService,
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
import { groupOrderLines, OrderLineGroup } from './ordering-ui.util';

export type CustomerOrderDetailDialogData = {
  order: StaffCustomerOrder;
  shopId: string;
  canManage: boolean;
};

export type CustomerOrderDetailDialogResult =
  | { kind: 'updated'; order: StaffCustomerOrder }
  | null;

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

@Component({
  selector: 'app-customer-order-detail-dialog',
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './customer-order-detail-dialog.html',
  styleUrl: './customer-order-detail-dialog.scss',
})
export class CustomerOrderDetailDialogComponent implements OnInit {
  private readonly api = inject(CustomerOrdersApiService);
  private readonly integrationsApi = inject(IntegrationsApiService);
  private readonly auth = inject(AuthService);
  readonly ref = inject(
    MatDialogRef<CustomerOrderDetailDialogComponent, CustomerOrderDetailDialogResult>,
  );
  readonly data = inject<CustomerOrderDetailDialogData>(MAT_DIALOG_DATA);

  readonly order = signal<StaffCustomerOrder>(this.data.order);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly deliverateEnabled = signal(false);
  private dirty = false;

  readonly statusLabel = STATUS_LABEL;
  readonly canManage = this.data.canManage;

  ngOnInit(): void {
    this.integrationsApi.getDeliverate(this.data.shopId).subscribe({
      next: (cfg) => this.deliverateEnabled.set(!!cfg.enabled && !!cfg.connected),
      error: () => this.deliverateEnabled.set(false),
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
    const base = Number.isFinite(state)
      ? (DELIVERATE_STATE_LABEL[state] ?? `Estado ${state}`)
      : 'Solicitado';
    const dboy = o.externalMeta?.['dboy_id'];
    return dboy != null ? `${base} · repartidor #${dboy}` : base;
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
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(this.errMsg(err, 'No se pudo solicitar Deliverate'));
      },
    });
  }

  close(): void {
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
