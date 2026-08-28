import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type VacationPersonType = 'EMPLOYEE' | 'PARTNER';

export interface Vacation {
  id: string;
  shopId: string;
  personType: VacationPersonType;
  employeeId: string | null;
  partnerAccountId: string | null;
  personName: string | null;
  fromDate: string;
  toDate: string;
  businessDays: number;
  unpaid: boolean;
  notes: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string | null;
}

export interface CreateVacationBody {
  personType: VacationPersonType;
  employeeId?: string | null;
  partnerAccountId?: string | null;
  fromDate: string;
  toDate: string;
  unpaid?: boolean;
  notes?: string | null;
}

export interface UpdateVacationBody {
  employeeId?: string | null;
  partnerAccountId?: string | null;
  fromDate?: string;
  toDate?: string;
  unpaid?: boolean;
  notes?: string | null;
}

export interface VacationPreviewDays {
  fromDate: string;
  toDate: string;
  businessDays: number;
}

@Injectable({ providedIn: 'root' })
export class VacationsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(
    shopId: string,
    opts: { personType?: VacationPersonType; from?: string; to?: string } = {},
  ) {
    const params: Record<string, string> = {};
    if (opts.personType) params['personType'] = opts.personType;
    if (opts.from) params['from'] = opts.from;
    if (opts.to) params['to'] = opts.to;
    return this.http.get<Vacation[]>(`${this.base}/shops/${shopId}/vacations`, { params });
  }

  previewDays(shopId: string, from: string, to: string) {
    return this.http.get<VacationPreviewDays>(
      `${this.base}/shops/${shopId}/vacations/preview-days`,
      { params: { from, to } },
    );
  }

  create(shopId: string, body: CreateVacationBody) {
    return this.http.post<Vacation>(`${this.base}/shops/${shopId}/vacations`, body);
  }

  update(shopId: string, id: string, body: UpdateVacationBody) {
    return this.http.patch<Vacation>(`${this.base}/shops/${shopId}/vacations/${id}`, body);
  }

  remove(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/vacations/${id}`);
  }
}
