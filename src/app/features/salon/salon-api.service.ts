import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { SalonArea, SalonAreaRule, SalonFloor, SalonRuleSlot, SalonTable } from './salon.models';

@Injectable({ providedIn: 'root' })
export class SalonApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  getFloor(shopId: string) {
    return this.http.get<SalonFloor>(`${this.base}/shops/${shopId}/salon-floor`);
  }

  createTable(shopId: string, body: { area: SalonArea; seats?: number; label?: string }) {
    return this.http.post<SalonTable>(`${this.base}/shops/${shopId}/salon-floor/tables`, body);
  }

  updateTable(shopId: string, id: string, body: { seats?: number; label?: string }) {
    return this.http.patch<SalonTable>(
      `${this.base}/shops/${shopId}/salon-floor/tables/${id}`,
      body,
    );
  }

  removeTable(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(
      `${this.base}/shops/${shopId}/salon-floor/tables/${id}`,
    );
  }

  replaceRules(shopId: string, area: SalonArea, slots: SalonRuleSlot[]) {
    return this.http.put<SalonAreaRule[]>(`${this.base}/shops/${shopId}/salon-floor/rules`, {
      area,
      slots,
    });
  }

  applyFromReservations(shopId: string, opts?: { onlyIfEmpty?: boolean }) {
    return this.http.post<SalonFloor & { applied?: boolean }>(
      `${this.base}/shops/${shopId}/salon-floor/from-reservations`,
      { onlyIfEmpty: !!opts?.onlyIfEmpty },
    );
  }
}
