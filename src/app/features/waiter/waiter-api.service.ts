import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';

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
};

export type WaiterTable = {
  id: string;
  sectorId?: string | null;
  sectorName?: string;
  area: string;
  label: string;
  seats: number;
  sortOrder: number;
  openSession: {
    id: string;
    waiterEmployeeId: string;
    openedAt: string;
    covers?: number;
    orderCount?: number;
    customerTicketPrinted?: boolean;
  } | null;
};

export type WaiterSessionOrder = {
  id: string;
  code: string;
  status: string;
  items: Array<{ name: string; qty: number; unitPrice: number; kind?: string }>;
  subtotal: number;
  total: number;
  customerNotes?: string | null;
  createdAt: string;
};

export type WaiterSession = {
  id: string;
  status: 'OPEN' | 'CLOSED';
  covers: number;
  customerTicketPrinted: boolean;
  orderCount: number;
  openedAt: string;
  closedAt?: string | null;
  table: { id: string; label: string; area: string; seats: number } | null;
  waiter: { id: string; fullName: string };
  orders: WaiterSessionOrder[];
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

  login(slug: string, pin: string) {
    return this.http.post<WaiterLoginResult>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/login`,
      { pin },
    );
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
    return this.http.get<WaiterTable[]>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/tables`,
      this.authHeaders(token),
    );
  }

  openSession(slug: string, token: string, salonTableId: string, covers: number) {
    return this.http.post<WaiterSession>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/sessions`,
      { salonTableId, covers },
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
      items: Array<{
        menuItemId: string;
        qty: number;
        notes?: string | null;
        removedIngredients?: string[];
      }>;
      extras?: Array<{
        extraId: string;
        qty: number;
        attachedToMenuItemId?: string | null;
      }>;
      customerNotes?: string | null;
      printKitchen?: boolean;
      printCustomerTicket?: boolean;
    },
  ) {
    return this.http.post(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/sessions/${sessionId}/orders`,
      body,
      this.authHeaders(token),
    );
  }

  closeSession(
    slug: string,
    token: string,
    sessionId: string,
    body?: { printCustomerTicket?: boolean },
  ) {
    return this.http.post<WaiterSession>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/sessions/${sessionId}/close`,
      body ?? {},
      this.authHeaders(token),
    );
  }

  printCustomerTicket(slug: string, token: string, sessionId: string) {
    return this.http.post<WaiterSession>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiter/sessions/${sessionId}/print-customer-ticket`,
      {},
      this.authHeaders(token),
    );
  }
}
