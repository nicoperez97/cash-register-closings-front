import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { formatMoney } from '../../shared/utils/money';
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

export type CustomerOrderDetailDialogData = {
  order: StaffCustomerOrder;
  shopId: string;
  canManage: boolean;
};

export type CustomerOrderDetailDialogResult =
  | { kind: 'updated'; order: StaffCustomerOrder }
  | null;

@Component({
  selector: 'app-customer-order-detail-dialog',
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './customer-order-detail-dialog.html',
  styleUrl: './customer-order-detail-dialog.scss',
})
export class CustomerOrderDetailDialogComponent {
  private readonly api = inject(CustomerOrdersApiService);
  readonly ref = inject(MatDialogRef<CustomerOrderDetailDialogComponent, CustomerOrderDetailDialogResult>);
  readonly data = inject<CustomerOrderDetailDialogData>(MAT_DIALOG_DATA);

  readonly order = signal<StaffCustomerOrder>(this.data.order);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private dirty = false;

  readonly statusLabel = STATUS_LABEL;
  readonly canManage = this.data.canManage;

  money(n: number): string {
    return formatMoney(n);
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
