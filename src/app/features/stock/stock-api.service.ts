import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface StockCategory {
  id: string;
  shopId: string;
  name: string;
  active: boolean;
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

@Injectable({ providedIn: 'root' })
export class StockApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listCategories(shopId: string, includeInactive = false) {
    return this.http.get<StockCategory[]>(`${this.base}/shops/${shopId}/stock/categories`, {
      params: includeInactive ? { includeInactive: 'true' } : {},
    });
  }

  createCategory(shopId: string, body: { name: string }) {
    return this.http.post<StockCategory>(
      `${this.base}/shops/${shopId}/stock/categories`,
      body,
    );
  }

  updateCategory(
    shopId: string,
    id: string,
    body: Partial<{ name: string; active: boolean }>,
  ) {
    return this.http.patch<StockCategory>(
      `${this.base}/shops/${shopId}/stock/categories/${id}`,
      body,
    );
  }

  listProducts(shopId: string, includeInactive = false) {
    return this.http.get<StockProduct[]>(`${this.base}/shops/${shopId}/stock/products`, {
      params: includeInactive ? { includeInactive: 'true' } : {},
    });
  }

  createProduct(
    shopId: string,
    body: {
      name: string;
      categoryId?: string | null;
      newCategory?: { name: string } | null;
      quantity?: number;
      minQuantity?: number;
      maxQuantity?: number;
    },
  ) {
    return this.http.post<StockProduct>(`${this.base}/shops/${shopId}/stock/products`, body);
  }

  updateProduct(
    shopId: string,
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
    );
  }

  adjust(shopId: string, id: string, delta: 1 | -1) {
    return this.http.post<StockProduct>(
      `${this.base}/shops/${shopId}/stock/products/${id}/adjust`,
      { delta },
    );
  }

  restock(shopId: string, productIds: string[]) {
    return this.http.post<{ products: StockProduct[]; skipped: string[] }>(
      `${this.base}/shops/${shopId}/stock/products/restock`,
      { productIds },
    );
  }

  listStockAdmins(shopId: string) {
    return this.http.get<StockShareAdmin[]>(`${this.base}/shops/${shopId}/stock/admins`);
  }

  shareStock(shopId: string, recipientUserIds: string[]) {
    return this.http.post<StockShareResult>(`${this.base}/shops/${shopId}/stock/share`, {
      recipientUserIds,
    });
  }

  removeProduct(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(
      `${this.base}/shops/${shopId}/stock/products/${id}`,
    );
  }
}
