import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface ShopService {
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

export interface UpsertServiceBody {
  name?: string;
  legalName?: string | null;
  taxId?: string | null;
  bankAlias?: string | null;
  notes?: string | null;
  active?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ServicesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(shopId: string, includeInactive = false) {
    return this.http.get<ShopService[]>(`${this.base}/shops/${shopId}/services`, {
      params: includeInactive ? { includeInactive: 'true' } : {},
    });
  }

  create(shopId: string, body: UpsertServiceBody & { name: string }) {
    return this.http.post<ShopService>(`${this.base}/shops/${shopId}/services`, body);
  }

  update(shopId: string, id: string, body: UpsertServiceBody) {
    return this.http.patch<ShopService>(`${this.base}/shops/${shopId}/services/${id}`, body);
  }

  remove(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/services/${id}`);
  }
}
