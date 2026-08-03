import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type ReservationArea = 'INSIDE' | 'OUTSIDE';
export type ReservationStatus = 'CONFIRMED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';
export type WaitingListStatus = 'WAITING' | 'SEATED' | 'CANCELLED' | 'LEFT';

export interface ReservationRow {
  id: string;
  shopId: string;
  businessDate: string;
  guestName: string;
  partySize: number;
  area: ReservationArea;
  notes?: string | null;
  status: ReservationStatus;
  reservationTime?: string | null;
}

export interface WaitingListRow {
  id: string;
  shopId: string;
  guestName: string;
  partySize: number;
  phone: string;
  area: ReservationArea;
  notes?: string | null;
  status: WaitingListStatus;
  whatsappUrl?: string;
  createdAt?: string;
}

export interface ReservationsDayResponse {
  shopId: string;
  businessDate: string;
  reservations: ReservationRow[];
}

export interface PublicReservationsBoard {
  shop: {
    name: string;
    slug: string;
    logoUrl?: string | null;
    accentColor?: string | null;
  };
  businessDate: string;
  totals: {
    parties: number;
    guests: number;
    inside: number;
    outside: number;
  };
  reservations: Array<{
    id: string;
    guestName: string;
    partySize: number;
    area: ReservationArea;
    reservationTime?: string | null;
    status: ReservationStatus;
  }>;
}

export interface PublicWaitingBoard {
  shop: {
    name: string;
    slug: string;
    logoUrl?: string | null;
    accentColor?: string | null;
  };
  totals: {
    parties: number;
    guests: number;
    inside: number;
    outside: number;
  };
  waiting: Array<{
    id: string;
    position: number;
    guestName: string;
    partySize: number;
    area: ReservationArea;
    status: WaitingListStatus;
  }>;
}

@Injectable({ providedIn: 'root' })
export class ReservationsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listReservations(shopId: string, date?: string) {
    let params = new HttpParams();
    if (date) params = params.set('date', date);
    return this.http.get<ReservationsDayResponse>(
      `${this.base}/shops/${shopId}/reservations`,
      { params },
    );
  }

  createReservation(
    shopId: string,
    body: {
      businessDate?: string;
      guestName?: string;
      partySize: number;
      area?: ReservationArea;
      notes?: string;
      reservationTime?: string;
    },
  ) {
    return this.http.post<ReservationRow>(`${this.base}/shops/${shopId}/reservations`, body);
  }

  updateReservation(shopId: string, id: string, body: Partial<ReservationRow>) {
    return this.http.patch<ReservationRow>(
      `${this.base}/shops/${shopId}/reservations/${id}`,
      body,
    );
  }

  removeReservation(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/reservations/${id}`);
  }

  listWaiting(shopId: string, includeDone = false) {
    let params = new HttpParams();
    if (includeDone) params = params.set('includeDone', '1');
    return this.http.get<WaitingListRow[]>(`${this.base}/shops/${shopId}/waiting-list`, {
      params,
    });
  }

  createWaiting(
    shopId: string,
    body: {
      guestName: string;
      partySize: number;
      phone: string;
      area?: ReservationArea;
      notes?: string;
    },
  ) {
    return this.http.post<WaitingListRow>(`${this.base}/shops/${shopId}/waiting-list`, body);
  }

  updateWaiting(shopId: string, id: string, body: Partial<WaitingListRow>) {
    return this.http.patch<WaitingListRow>(
      `${this.base}/shops/${shopId}/waiting-list/${id}`,
      body,
    );
  }

  removeWaiting(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/waiting-list/${id}`);
  }

  publicBoard(slug: string, date?: string) {
    let params = new HttpParams();
    if (date) params = params.set('date', date);
    return this.http.get<PublicReservationsBoard>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/reservations`,
      { params },
    );
  }

  publicWaitingBoard(slug: string) {
    return this.http.get<PublicWaitingBoard>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiting-list`,
    );
  }
}
