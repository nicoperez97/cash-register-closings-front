import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type StockKind = 'food' | 'beverage';

export interface StockCategory {
  id: string;
  shopId: string;
  name: string;
  active: boolean;
  kind?: StockKind;
}

export interface StockProduct {
  id: string;
  shopId: string;
  categoryId: string;
  categoryName?: string | null;
  minQuantity: number;
  maxQuantity: number;
  name: string;
  quantity: number;
  belowMinimum: boolean;
  active: boolean;
  kind?: StockKind;
}

export interface StockShareAdmin {
  id: string;
  fullName: string;
  email: string;
}

export interface StockShareResult {
  ok: boolean;
  notified: number;
  title: string;
  shareText: string;
}

export function stockKindLabel(kind: StockKind): string {
  return kind === 'beverage' ? 'bebidas' : 'alimentos';
}

export function stockManagePermission(kind: StockKind): 'stock.manage' | 'beverageStock.manage' {
  return kind === 'beverage' ? 'beverageStock.manage' : 'stock.manage';
}

export function stockReadPermission(kind: StockKind): 'stock.read' | 'beverageStock.read' {
  return kind === 'beverage' ? 'beverageStock.read' : 'stock.read';
}

@Injectable({ providedIn: 'root' })
export class StockApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private params(kind: StockKind, extra?: Record<string, string>): HttpParams {
    let p = new HttpParams().set('kind', kind);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) p = p.set(k, v);
    }
    return p;
  }

  listCategories(shopId: string, kind: StockKind, includeInactive = false) {
    return this.http.get<StockCategory[]>(`${this.base}/shops/${shopId}/stock/categories`, {
      params: this.params(kind, includeInactive ? { includeInactive: 'true' } : undefined),
    });
  }

  createCategory(shopId: string, kind: StockKind, body: { name: string }) {
    return this.http.post<StockCategory>(
      `${this.base}/shops/${shopId}/stock/categories`,
      body,
      { params: this.params(kind) },
    );
  }

  updateCategory(
    shopId: string,
    kind: StockKind,
    id: string,
    body: Partial<{ name: string; active: boolean }>,
  ) {
    return this.http.patch<StockCategory>(
      `${this.base}/shops/${shopId}/stock/categories/${id}`,
      body,
      { params: this.params(kind) },
    );
  }

  listProducts(shopId: string, kind: StockKind, includeInactive = false) {
    return this.http.get<StockProduct[]>(`${this.base}/shops/${shopId}/stock/products`, {
      params: this.params(kind, includeInactive ? { includeInactive: 'true' } : undefined),
    });
  }

  createProduct(
    shopId: string,
    kind: StockKind,
    body: {
      name: string;
      categoryId?: string | null;
      newCategory?: { name: string } | null;
      quantity?: number;
      minQuantity?: number;
      maxQuantity?: number;
    },
  ) {
    return this.http.post<StockProduct>(`${this.base}/shops/${shopId}/stock/products`, body, {
      params: this.params(kind),
    });
  }

  updateProduct(
    shopId: string,
    kind: StockKind,
    id: string,
    body: {
      name?: string;
      categoryId?: string | null;
      newCategory?: { name: string } | null;
      quantity?: number;
      minQuantity?: number;
      maxQuantity?: number;
      active?: boolean;
    },
  ) {
    return this.http.patch<StockProduct>(
      `${this.base}/shops/${shopId}/stock/products/${id}`,
      body,
      { params: this.params(kind) },
    );
  }

  adjust(shopId: string, kind: StockKind, id: string, delta: 1 | -1) {
    return this.http.post<StockProduct>(
      `${this.base}/shops/${shopId}/stock/products/${id}/adjust`,
      { delta },
      { params: this.params(kind) },
    );
  }

  restock(shopId: string, kind: StockKind, productIds: string[]) {
    return this.http.post<{ products: StockProduct[]; skipped: string[] }>(
      `${this.base}/shops/${shopId}/stock/products/restock`,
      { productIds },
      { params: this.params(kind) },
    );
  }

  listStockAdmins(shopId: string, kind: StockKind) {
    return this.http.get<StockShareAdmin[]>(`${this.base}/shops/${shopId}/stock/admins`, {
      params: this.params(kind),
    });
  }

  shareStock(shopId: string, kind: StockKind, recipientUserIds: string[]) {
    return this.http.post<StockShareResult>(
      `${this.base}/shops/${shopId}/stock/share`,
      { recipientUserIds },
      { params: this.params(kind) },
    );
  }

  removeProduct(shopId: string, kind: StockKind, id: string) {
    return this.http.delete<{ ok: boolean }>(
      `${this.base}/shops/${shopId}/stock/products/${id}`,
      { params: this.params(kind) },
    );
  }
}
