import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type CustomerOrderFulfillment = 'TAKEAWAY' | 'DELIVERY' | 'COUNTER';
export type CustomerOrderPaymentMethod = 'CASH' | 'TRANSFER';
export type CustomerOrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'COMPLETED'
  | 'CANCELLED';

export interface PublicOrderingShop {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  accentSecondary?: string | null;
  phone?: string | null;
  instagramHandle?: string | null;
  currency?: string;
  shopMode?: string;
}

export interface PublicOrderingMenuItem {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  priceLabel?: string | null;
  imageUrl?: string | null;
  removableIngredients?: string[];
}

export interface PublicOrderingExtra {
  id: string;
  name: string;
  price: number;
  menuItemIds: string[];
}

export interface PublicOrderingSection {
  name: string;
  items: PublicOrderingMenuItem[];
}

export interface PublicOrderingMenu {
  id: string;
  slug: string;
  title?: string | null;
  note?: string | null;
  sections: PublicOrderingSection[];
}

export interface PublicDeliveryZone {
  id: string;
  name: string;
  fee: number;
  note?: string | null;
}

export interface PublicOrderingConfig {
  enabled: boolean;
  shop: PublicOrderingShop;
  takeawayEnabled: boolean;
  deliveryEnabled: boolean;
  tableOrderingEnabled?: boolean;
  orderingForceClosed?: boolean;
  takeawayOpen: boolean;
  deliveryOpen: boolean;
  tableOrderingOpen?: boolean;
  anyChannelOpen: boolean;
  takeawayHoursSummary: string[];
  deliveryHoursSummary: string[];
  payments: {
    methods: CustomerOrderPaymentMethod[];
    transferInstructions?: string | null;
    whatsapp?: string | null;
  };
  deliveryZones: PublicDeliveryZone[];
  eta: { takeaway?: string | null; delivery?: string | null } | null;
  extras: PublicOrderingExtra[];
  menus: PublicOrderingMenu[];
}

export interface CreatePublicCustomerOrderBody {
  fulfillment: CustomerOrderFulfillment;
  items: Array<{
    menuItemId: string;
    qty: number;
    notes?: string | null;
    removedIngredients?: string[];
  }>;
  extras?: Array<{ extraId: string; qty: number; attachedToMenuItemId?: string | null }>;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: string | null;
  deliveryZoneId?: string | null;
  paymentMethod: CustomerOrderPaymentMethod;
  cashAmount?: number | null;
  customerNotes?: string | null;
  discountPercent?: number | null;
  discountFixed?: number | null;
  /** Solo mostrador: imprimir ticket del cliente (default true). */
  printCustomerTicket?: boolean;
}

export interface PublicCustomerOrder {
  code: string;
  status: CustomerOrderStatus;
  fulfillment: CustomerOrderFulfillment;
  items: Array<{
    menuItemId: string;
    name: string;
    unitPrice: number;
    qty: number;
    notes?: string | null;
    removedIngredients?: string[];
    kind?: 'ITEM' | 'EXTRA';
  }>;
  subtotal: number;
  deliveryFee: number;
  discountAmount?: number;
  discountLabel?: string | null;
  total: number;
  firstName: string;
  lastName: string;
  paymentMethod: CustomerOrderPaymentMethod;
  deliveryZoneName?: string | null;
  address?: string | null;
  /** WhatsApp (solo dígitos) para enviar comprobante si pagó por transferencia. */
  receiptWhatsapp?: string | null;
  /** Datos CBU/alias para transferir (si el pago es transferencia). */
  transferInstructions?: string | null;
  createdAt?: string;
  acceptedAt?: string | null;
  preparingAt?: string | null;
  readyAt?: string | null;
  outForDeliveryAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
}

export interface StaffCustomerOrder extends PublicCustomerOrder {
  id: string;
  shopId: string;
  phone: string;
  cashAmount?: number | null;
  customerNotes?: string | null;
  deliveryZoneId?: string | null;
  updatedAt?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CustomerOrdersApiService {
  private readonly http = inject(HttpClient);

  getPublicOrdering(slug: string) {
    return this.http.get<PublicOrderingConfig>(
      `${environment.apiUrl}/public/shops/${encodeURIComponent(slug)}/ordering`,
    );
  }

  createPublicOrder(slug: string, body: CreatePublicCustomerOrderBody) {
    return this.http.post<PublicCustomerOrder>(
      `${environment.apiUrl}/public/shops/${encodeURIComponent(slug)}/customer-orders`,
      body,
    );
  }

  createStaffOrder(shopId: string, body: CreatePublicCustomerOrderBody) {
    return this.http.post<StaffCustomerOrder>(
      `${environment.apiUrl}/shops/${encodeURIComponent(shopId)}/customer-orders`,
      body,
    );
  }

  lookupPublicOrder(slug: string, phone: string, code: string) {
    const params = new HttpParams().set('phone', phone).set('code', code);
    return this.http.get<PublicCustomerOrder>(
      `${environment.apiUrl}/public/shops/${encodeURIComponent(slug)}/customer-orders/lookup`,
      { params },
    );
  }

  listStaff(shopId: string, status?: string) {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<StaffCustomerOrder[]>(
      `${environment.apiUrl}/shops/${encodeURIComponent(shopId)}/customer-orders`,
      { params },
    );
  }

  pendingCount(shopId: string) {
    return this.http.get<{ count: number }>(
      `${environment.apiUrl}/shops/${encodeURIComponent(shopId)}/customer-orders/pending-count`,
    );
  }

  updateStatus(shopId: string, id: string, status: CustomerOrderStatus) {
    return this.http.patch<StaffCustomerOrder>(
      `${environment.apiUrl}/shops/${encodeURIComponent(shopId)}/customer-orders/${encodeURIComponent(id)}/status`,
      { status },
    );
  }
}
