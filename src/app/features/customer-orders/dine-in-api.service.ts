import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type DineInFloorTable = {
  id: string;
  sectorId?: string | null;
  sectorName?: string;
  area: string;
  label: string;
  seats: number;
  sortOrder: number;
  mapX?: number | null;
  mapY?: number | null;
  occupied: boolean;
  covers?: number | null;
  orderCount?: number;
};

export type DineInMapObject = {
  id: string;
  sectorId: string;
  kind: string;
  name: string;
  mapX: number;
  mapY: number;
};

export type DineInFloor = {
  shop: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
    accentColor?: string | null;
    accentSecondary?: string | null;
    currency?: string;
  };
  sectors: Array<{ id: string; name: string }>;
  tables: DineInFloorTable[];
  mapObjects: DineInMapObject[];
};

export type DineInSession = {
  id: string;
  status: 'OPEN' | 'CLOSED';
  covers: number;
  orderCount: number;
  openedAt: string;
  closedAt?: string | null;
  table: { id: string; label: string; area: string; seats: number } | null;
  orders: Array<{
    id: string;
    code: string;
    status: string;
    items: Array<{ name: string; qty: number; unitPrice: number }>;
    subtotal: number;
    total: number;
    customerNotes?: string | null;
    createdAt: string;
  }>;
};

@Injectable({ providedIn: 'root' })
export class DineInApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private authHeaders(token: string) {
    return { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) };
  }

  getFloor(slug: string) {
    return this.http.get<DineInFloor>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/dine-in/floor`,
    );
  }

  openSession(slug: string, salonTableId: string, covers: number) {
    return this.http.post<{ token: string; session: DineInSession }>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/dine-in/sessions`,
      { salonTableId, covers },
    );
  }

  resume(slug: string, token: string) {
    return this.http.get<DineInSession>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/dine-in/session`,
      this.authHeaders(token),
    );
  }

  discard(slug: string, token: string) {
    return this.http.post<{ ok: boolean }>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/dine-in/session/discard`,
      {},
      this.authHeaders(token),
    );
  }

  createOrder(
    slug: string,
    token: string,
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
    },
  ) {
    return this.http.post(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/dine-in/session/orders`,
      body,
      this.authHeaders(token),
    );
  }
}
