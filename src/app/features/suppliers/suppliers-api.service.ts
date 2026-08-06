import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface ShopSupplier {
  id: string;
  shopId: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  bankAlias: string | null;
  notes: string | null;
  accountId: string;
  accountName: string | null;
  active: boolean;
}

export interface UpsertSupplierBody {
  name?: string;
  legalName?: string | null;
  taxId?: string | null;
  bankAlias?: string | null;
  notes?: string | null;
  active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SuppliersApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(shopId: string, includeInactive = false) {
    return this.http.get<ShopSupplier[]>(`${this.base}/shops/${shopId}/suppliers`, {
      params: includeInactive ? { includeInactive: 'true' } : {},
    });
  }

  create(shopId: string, body: UpsertSupplierBody & { name: string }) {
    return this.http.post<ShopSupplier>(`${this.base}/shops/${shopId}/suppliers`, body);
  }

  update(shopId: string, id: string, body: UpsertSupplierBody) {
    return this.http.patch<ShopSupplier>(`${this.base}/shops/${shopId}/suppliers/${id}`, body);
  }

  remove(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/suppliers/${id}`);
  }
}
