import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import type { WaiterCapProfile } from '../admin/waiter-capabilities';

export type WaiterLoginResult = {
  token: string;
  waiter: { id: string; fullName: string };
  shop: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
    accentColor?: string | null;
  };
  capabilities?: WaiterCapProfile;
};

export type WaiterTable = {
  id: string;
  sectorId?: string | null;
  sectorName?: string;
  area: string;
  label: string;
  seats: number;
  sortOrder: number;
  mapX?: number | null;
  mapY?: number | null;
  openSession: {
    id: string;
    waiterEmployeeId: string | null;
    openedAt: string;
    covers?: number;
    orderCount?: number;
    customerTicketPrinted?: boolean;
  } | null;
};

export type WaiterMapObject = {
  id: string;
  sectorId: string;
  kind: string;
  name: string;
  mapX: number;
  mapY: number;
};

export type WaiterFloor = {
  tables: WaiterTable[];
  mapObjects: WaiterMapObject[];
};

export type WaiterSessionOrder = {
  id: string;
  code: string;
  status: string;
  items: Array<{
    menuItemId?: string;
    name: string;
    qty: number;
    unitPrice: number;
    kind?: string;
    extraId?: string | null;
    attachedToMenuItemId?: string | null;
    notes?: string | null;
    removedIngredients?: string[];
  }>;
  subtotal: number;
  total: number;
  customerNotes?: string | null;
  createdAt: string;
};

export type TablePaymentMethod = {
  id: string;
  name: string;
  accountId?: string | null;
  active?: boolean;
};

export type WaiterPromoBreakdown = {
  promoId: string;
  promoName: string;
  packs: number;
  packPrice: number;
  packsTotal: number;
  applied?: Array<{
    promoId: string;
    promoName: string;
    packs: number;
    packPrice: number;
    packsTotal: number;
  }>;
  outside: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    amount: number;
    kind: string;
  }>;
  outsideTotal: number;
  soldPromoTotal: number;
  baseTotal: number;
};

export type WaiterSessionPromo = {
  promoId: string;
  maxCount: number | null;
  name: string;
};

export type WaiterLineAudit = {
  id: string;
  action: 'REMOVE' | 'QTY' | 'PRICE' | 'EDIT';
  orderCode: string;
  itemName: string;
  lineKind?: string;
  qtyBefore?: number | null;
  qtyAfter?: number | null;
  unitPriceBefore?: number | null;
  unitPriceAfter?: number | null;
  relatedLines?: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    kind?: string;
    qtyAfter?: number | null;
    unitPriceAfter?: number | null;
  }>;
  actorName: string;
  actorTyp?: 'waiter' | 'waiter_staff';
  orderRemoved?: boolean;
  reason?: string | null;
  reasonNote?: string | null;
  createdAt: string;
  tableLabel?: string | null;
};

export type ComandaMonitorLine = { qty: number; name: string; extra?: boolean };

export type ComandaMonitorTable = {
  sessionId: string;
  tableId: string;
  tableLabel: string;
  sectorName: string;
  covers: number;
  waiterName: string;
  openedAt: string;
  orderCount: number;
  customerTicketPrinted: boolean;
  lastOrderAt?: string | null;
  lastOrderCode?: string | null;
  total: number;
  lines: ComandaMonitorLine[];
};

export type ComandaMonitorOrder = {
  id: string;
  code: string;
  tableLabel: string;
  waiterName: string;
  createdAt: string;
  total: number;
  items: ComandaMonitorLine[];
};

export type ComandaMonitorPayload = {
  shopName: string;
  shiftName?: string | null;
  tables: ComandaMonitorTable[];
  recentOrders: ComandaMonitorOrder[];
  recentAudits: WaiterLineAudit[];
};

export type WaiterSession = {
  id: string;
  status: 'OPEN' | 'CLOSED';
  covers: number;
  promoId?: string | null;
  promoMaxCount?: number | null;
  promoName?: string | null;
  sessionPromos?: WaiterSessionPromo[];
  promoBreakdown?: WaiterPromoBreakdown | null;
  customerTicketPrinted: boolean;
  ticketDiscountAmount?: number;
  ticketDiscountLabel?: string | null;
  ticketTotal?: number | null;
  paymentMethodId?: string | null;
  paymentMethodName?: string | null;
  payments?: Array<{
    paymentMethodId: string;
    paymentMethodName: string;
    paymentAccountId?: string | null;
    amount: number;
  }>;
  tipAmount?: number;
  tipLabel?: string | null;
  paymentMethods?: TablePaymentMethod[];
  sessionSubtotal?: number;
  orderCount: number;
  pendingMainsCount?: number;
  openedAt: string;
  closedAt?: string | null;
  table: { id: string; label: string; area: string; seats: number } | null;
  waiter: { id: string; fullName: string };
  orders: WaiterSessionOrder[];
  lineAudits?: WaiterLineAudit[];
};

export type WaiterShiftTipsSummary = {
  businessDate: string;
  shift: { id: string; name: string };
  from: string;
  to: string;
  tipTotal: number;
  ticketTotal?: number;
  coversTotal?: number;
  tippedTables: number;
  closedTables: number;
  recent: Array<{
    sessionId: string;
    tableLabel: string;
    tipAmount: number;
    tipLabel?: string | null;
    closedAt?: string | null;
  }>;
  sessions?: Array<{
    sessionId: string;
    tableLabel: string;
    covers: number;
    openedAt?: string | null;
    closedAt?: string | null;
    ticketTotal: number;
    tipAmount: number;
    tipLabel?: string | null;
    payments: Array<{
      paymentMethodId: string;
      paymentMethodName: string;
      amount: number;
    }>;
    paymentLabel?: string;
  }>;
};

export type WaiterCatalog = {
  enabled: boolean;
  shop: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
    accentColor?: string | null;
    currency?: string;
  };
  extras: Array<{
    id: string;
    name: string;
    price: number;
    menuItemIds?: string[];
  }>;
  discountPresets?: Array<{
    id: string;
    label: string;
    mode: 'percent' | 'fixed';
    value: number;
  }>;
  promos?: Array<{
    id: string;
    name: string;
    description?: string | null;
    fixedPrice: number;
    sellable: boolean;
    tableMatchable: boolean;
    /** false = fuera de la ventana horaria de la promo. */
    inSchedule?: boolean;
    items: Array<{ menuItemId: string; qty: number }>;
    specialName?: string | null;
  }>;
  tablePaymentMethods?: TablePaymentMethod[];
  capabilities?: WaiterCapProfile;
  menus: Array<{
    id: string;
    slug: string;
    title?: string | null;
    note?: string | null;
    sections: Array<{
      name: string;
      items: Array<{
        id: string;
        name: string;
        description?: string | null;
        price: number;
        removableIngredients?: string[];
        imageUrl?: string | null;
      }>;
    }>;
  }>;
};

@Injectable({ providedIn: 'root' })
export class WaiterApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private authHeaders(token: string) {
    return { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) };
  }

  staffEnter(shopId: string) {
    return this.http.post<WaiterLoginResult>(
      `${this.base}/shops/${encodeURIComponent(shopId)}/comanda/enter`,
      {},
    );
  }

  staffWaiters(shopId: string) {
    return this.http.get<Array<{ id: string; fullName: string }>>(
      `${this.base}/shops/${encodeURIComponent(shopId)}/comanda/waiters`,
    );
  }

  staffMonitor(shopId: string) {
    return this.http.get<ComandaMonitorPayload>(
      `${this.base}/shops/${encodeURIComponent(shopId)}/comanda/monitor`,
    );
  }

  login(slug: string, pin: string) {
    return this.http.post<WaiterLoginResult>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/login`,
      { pin },
    );
  }

  bootstrap(slug: string) {
    return this.http.get<{
      shop: {
        id: string;
        name: string;
        slug: string;
        logoUrl?: string | null;
        accentColor?: string | null;
      };
    }>(`${this.base}/public/shops/${encodeURIComponent(slug)}/waiter`);
  }

  me(slug: string, token: string) {
    return this.http.get<Omit<WaiterLoginResult, 'token'>>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/me`,
      this.authHeaders(token),
    );
  }

  catalog(slug: string, token: string) {
    return this.http.get<WaiterCatalog>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/catalog`,
      this.authHeaders(token),
    );
  }

  tables(slug: string, token: string) {
    return this.http.get<WaiterFloor>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/tables`,
      this.authHeaders(token),
    );
  }

  openSession(
    slug: string,
    token: string,
    salonTableId: string,
    covers: number,
    waiterEmployeeId?: string | null,
  ) {
    return this.http.post<WaiterSession>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/sessions`,
      {
        salonTableId,
        covers,
        ...(waiterEmployeeId ? { waiterEmployeeId } : {}),
      },
      this.authHeaders(token),
    );
  }

  getSession(slug: string, token: string, sessionId: string) {
    return this.http.get<WaiterSession>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/sessions/${sessionId}`,
      this.authHeaders(token),
    );
  }

  discardSession(slug: string, token: string, sessionId: string) {
    return this.http.post<{ ok: boolean }>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/sessions/${sessionId}/discard`,
      {},
      this.authHeaders(token),
    );
  }

  createOrder(
    slug: string,
    token: string,
    sessionId: string,
    body: {
      items?: Array<{
        menuItemId: string;
        qty: number;
        notes?: string | null;
        removedIngredients?: string[];
        isEntrada?: boolean;
        combinesWithNames?: string[];
      }>;
      extras?: Array<{
        extraId: string;
        qty: number;
        attachedToMenuItemId?: string | null;
      }>;
      promos?: Array<{ promoId: string; qty: number }>;
      customerNotes?: string | null;
      printKitchen?: boolean;
      printCustomerTicket?: boolean;
    },
  ) {
    return this.http.post<{
      id?: string;
      print?: { kitchenQueued: boolean; kitchenWarning: string | null };
    }>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/sessions/${sessionId}/orders`,
      body,
      this.authHeaders(token),
    );
  }

  reprintKitchen(slug: string, token: string, sessionId: string, orderId: string) {
    return this.http.post<{ ok: boolean; id: string; status: string }>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/sessions/${sessionId}/orders/${orderId}/reprint-kitchen`,
      {},
      this.authHeaders(token),
    );
  }

  fireMains(slug: string, token: string, sessionId: string) {
    return this.http.post<WaiterSession & { ok: boolean; printedOrders?: number }>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/sessions/${sessionId}/fire-mains`,
      {},
      this.authHeaders(token),
    );
  }

  patchSessionPromo(
    slug: string,
    token: string,
    sessionId: string,
    body: {
      promoId?: string | null;
      promoMaxCount?: number | null;
      promos?: Array<{ promoId: string; maxCount?: number | null }> | null;
    },
  ) {
    return this.http.patch<WaiterSession>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/sessions/${sessionId}/promo`,
      body,
      this.authHeaders(token),
    );
  }

  closeSession(
    slug: string,
    token: string,
    sessionId: string,
    body: {
      paymentMethodId?: string;
      payments?: Array<{ paymentMethodId: string; amount: number }>;
      tipMode?: string;
      tipValue?: number | null;
    },
  ) {
    return this.http.post<WaiterSession>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/sessions/${sessionId}/close`,
      body,
      this.authHeaders(token),
    );
  }

  shiftTipsSummary(slug: string, token: string) {
    return this.http.get<WaiterShiftTipsSummary>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/tips-summary`,
      this.authHeaders(token),
    );
  }

  printCustomerTicket(
    slug: string,
    token: string,
    sessionId: string,
    body?: { discountMode?: string; discountValue?: number | null },
  ) {
    return this.http.post<WaiterSession>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/sessions/${sessionId}/print-customer-ticket`,
      body ?? {},
      this.authHeaders(token),
    );
  }

  patchSessionLine(
    slug: string,
    token: string,
    sessionId: string,
    body: {
      orderId: string;
      lineIndex: number;
      qty?: number | null;
      unitPrice?: number | null;
      remove?: boolean;
      reason?: string | null;
      reasonNote?: string | null;
    },
  ) {
    return this.http.patch<WaiterSession>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/sessions/${sessionId}/lines`,
      body,
      this.authHeaders(token),
    );
  }
}
