import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type ReservationArea = 'INSIDE' | 'OUTSIDE';
export type ReservationStatus = 'CONFIRMED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';
export type WaitingListStatus = 'WAITING' | 'SEATED' | 'CANCELLED' | 'LEFT';
export type ReservationRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface ReservationRequestRow {
  id: string;
  shopId: string;
  businessDate: string;
  guestName: string;
  guestEmail: string;
  instagramHandle?: string | null;
  instagramUrl?: string | null;
  instagramDmUrl?: string | null;
  partySize: number;
  reservationTime?: string | null;
  area?: ReservationArea;
  guestComment?: string | null;
  status: ReservationRequestStatus;
  reservationId?: string | null;
  staffNote?: string | null;
  createdAt?: string;
}

export interface PublicReservationSignup {
  signupEnabled: boolean;
  insideEnabled?: boolean;
  outsideEnabled?: boolean;
  insideCapacityRemaining?: number | null;
  outsideCapacityRemaining?: number | null;
  insideMaxPartySize?: number | null;
  outsideMaxPartySize?: number | null;
  outsideMinPartySize?: number | null;
  /** Config global del local (sin override del día). */
  shopSignupEnabled?: boolean;
  /** 0=domingo … 6=sábado */
  closedWeekdays?: number[];
  /** true si businessDate cae en un franco del local */
  closedDay?: boolean;
  businessDate?: string;
  shop: {
    id?: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
    accentColor?: string | null;
    accentSecondary?: string | null;
    instagramHandle?: string | null;
    phone?: string | null;
    timezone?: string | null;
  };
}

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
  tableNumber?: string | null;
  number?: number;
  guestEmail?: string | null;
  createdAt?: string;
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
  notice?: string | null;
  daySettings?: ReservationDaySettings | null;
  reservations: ReservationRow[];
}

export interface ReservationDaySettings {
  signupEnabled: boolean | null;
  insideEnabled: boolean | null;
  outsideEnabled: boolean | null;
  /** NULL = sin límite; 0 = sin cupo. */
  insideCapacityRemaining?: number | null;
  outsideCapacityRemaining?: number | null;
  /** NULL = hereda del local. */
  insideMaxPartySize?: number | null;
  outsideMaxPartySize?: number | null;
  outsideMinPartySize?: number | null;
}

export interface ReservationsDaySummary {
  businessDate: string;
  parties: number;
  guests: number;
  inside: number;
  outside: number;
}

export interface ReservationsSummaryResponse {
  shopId: string;
  from: string;
  to: string;
  days: ReservationsDaySummary[];
}

export interface PublicReservationsBoard {
  shop: {
    id?: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
    accentColor?: string | null;
  };
  businessDate: string;
  notice?: string | null;
  waiting?: {
    enabled: boolean;
    parties: number;
    guests: number;
  };
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
    tableNumber?: string | null;
    notes?: string | null;
    status: ReservationStatus;
    number?: number;
    createdAt?: string;
    removedAfterSeated?: boolean;
  }>;
}

export interface PublicWaitingBoard {
  shop: {
    id?: string;
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

  reservationsSummary(shopId: string, from: string, to: string) {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<ReservationsSummaryResponse>(
      `${this.base}/shops/${shopId}/reservations/summary`,
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
      tableNumber?: string | null;
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

  sendReservationMessage(shopId: string, id: string, message: string) {
    return this.http.post<{ ok: boolean; to: string }>(
      `${this.base}/shops/${shopId}/reservations/${id}/message`,
      { message },
    );
  }

  removeReservation(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/reservations/${id}`);
  }

  upsertDayNotice(
    shopId: string,
    body: {
      businessDate: string;
      message?: string;
      signupEnabled?: boolean | null;
      insideEnabled?: boolean | null;
      outsideEnabled?: boolean | null;
      insideCapacityRemaining?: number | null;
      outsideCapacityRemaining?: number | null;
      insideMaxPartySize?: number | null;
      outsideMaxPartySize?: number | null;
      outsideMinPartySize?: number | null;
    },
  ) {
    return this.http.put<{
      shopId: string;
      businessDate: string;
      notice: string | null;
      daySettings?: ReservationDaySettings | null;
    }>(`${this.base}/shops/${shopId}/reservation-day-notices`, body);
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
      phone?: string;
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

  publicBoard(slug: string) {
    return this.http.get<PublicReservationsBoard>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/reservations`,
    );
  }

  publicSeatReservation(slug: string, id: string, tableNumber?: string | null) {
    return this.http.post<{
      id: string;
      status: ReservationStatus;
      guestName: string;
      partySize: number;
      area: ReservationArea;
      tableNumber?: string | null;
    }>(`${this.base}/public/shops/${encodeURIComponent(slug)}/reservations/${id}/seat`, {
      tableNumber: tableNumber ?? null,
    });
  }

  publicDismissRemovedReservation(slug: string, id: string) {
    return this.http.delete<{ ok: boolean }>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/reservations/${id}/dismiss`,
    );
  }

  publicWaitingBoard(slug: string) {
    return this.http.get<PublicWaitingBoard>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/waiting-list`,
    );
  }

  publicSignupInfo(slug: string, date?: string) {
    let params = new HttpParams();
    if (date) params = params.set('date', date);
    return this.http.get<PublicReservationSignup>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/reservation-signup`,
      { params },
    );
  }

  createPublicReservationRequest(
    slug: string,
    body: {
      guestName: string;
      guestEmail: string;
      instagramHandle?: string | null;
      partySize: number;
      businessDate: string;
      reservationTime?: string | null;
      area?: ReservationArea;
      guestComment?: string | null;
      website?: string;
    },
  ) {
    return this.http.post<{
      ok: boolean;
      id?: string;
      status?: string;
      autoAccepted?: boolean;
      capacityRemaining?: number | null;
    }>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/reservation-requests`,
      body,
    );
  }

  listReservationRequests(shopId: string, status?: ReservationRequestStatus) {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<ReservationRequestRow[]>(
      `${this.base}/shops/${shopId}/reservation-requests`,
      { params },
    );
  }

  pendingReservationRequestsCount(shopId: string) {
    return this.http.get<{ count: number }>(
      `${this.base}/shops/${shopId}/reservation-requests/pending-count`,
    );
  }

  setReservationSignupEnabled(shopId: string, enabled: boolean) {
    return this.http.patch<{ reservationSignupEnabled: boolean }>(
      `${this.base}/shops/${shopId}/reservation-signup`,
      { enabled },
    );
  }

  setReservationAreasEnabled(shopId: string, patch: { inside?: boolean; outside?: boolean }) {
    return this.http.patch<{
      reservationInsideEnabled: boolean;
      reservationOutsideEnabled: boolean;
    }>(`${this.base}/shops/${shopId}/reservation-areas`, patch);
  }

  setReservationPartyRules(
    shopId: string,
    patch: {
      insideMaxPartySize?: number | null;
      outsideMaxPartySize?: number | null;
      outsideMinPartySize?: number | null;
    },
  ) {
    return this.http.patch<{
      reservationInsideMaxPartySize: number | null;
      reservationOutsideMaxPartySize?: number | null;
      reservationOutsideMinPartySize: number | null;
    }>(`${this.base}/shops/${shopId}/reservation-party-rules`, patch);
  }

  acceptReservationRequest(shopId: string, id: string, staffNote?: string | null) {
    return this.http.post<ReservationRequestRow>(
      `${this.base}/shops/${shopId}/reservation-requests/${id}/accept`,
      { staffNote: staffNote ?? null },
    );
  }

  rejectReservationRequest(shopId: string, id: string, staffNote?: string | null) {
    return this.http.post<ReservationRequestRow>(
      `${this.base}/shops/${shopId}/reservation-requests/${id}/reject`,
      { staffNote: staffNote ?? null },
    );
  }
}
