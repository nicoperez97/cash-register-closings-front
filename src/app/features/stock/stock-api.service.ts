import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface StockCategory {
  id: string;
  shopId: string;
  name: string;
  minQuantity: number;
  active: boolean;
}

export interface StockProduct {
  id: string;
  shopId: string;
  categoryId: string;
  categoryName?: string | null;
  minQuantity: number;
  name: string;
  quantity: number;
  belowMinimum: boolean;
  active: boolean;
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

  createCategory(shopId: string, body: { name: string; minQuantity?: number }) {
    return this.http.post<StockCategory>(
      `${this.base}/shops/${shopId}/stock/categories`,
      body,
    );
  }

  updateCategory(
    shopId: string,
    id: string,
    body: Partial<{ name: string; minQuantity: number; active: boolean }>,
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
      newCategory?: { name: string; minQuantity?: number } | null;
      quantity?: number;
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
      newCategory?: { name: string; minQuantity?: number } | null;
      quantity?: number;
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

  removeProduct(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(
      `${this.base}/shops/${shopId}/stock/products/${id}`,
    );
  }
}
