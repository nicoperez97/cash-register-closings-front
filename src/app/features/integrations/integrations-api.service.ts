import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ClosingSourceKind } from '../closings/closings-api.service';

export type DeliverateWorkingDay = {
  day: number;
  shifts: Array<'M' | 'N'>;
};

export type DeliverateConfig = {
  provider: 'deliverate';
  enabled: boolean;
  connected: boolean;
  shopCreated: boolean;
  hasCredentials: boolean;
  hasApiToken: boolean;
  username: string | null;
  integrationId: string | null;
  deliId: string | null;
  shopZone: string | null;
  businessName: string | null;
  cuit: string | null;
  taxType: string | null;
  ivaCondition: string | null;
  gender: string | null;
  birthDate: string | null;
  ownerName: string | null;
  textAddress: string | null;
  cellphone: string | null;
  telephone: string | null;
  emails: string[] | null;
  locationLat: number | null;
  locationLng: number | null;
  workingDays: DeliverateWorkingDay[] | null;
  testMode: boolean;
  webhookBaseUrl: string | null;
  webhookRegisteredAt: string | null;
  lastError: string | null;
  webhookUrlHint: string | null;
  closingAccountId: string | null;
  closingAccountName: string | null;
  closingKind: ClosingSourceKind;
  closingIncludeInDeclared: boolean;
  closingPaymentMethod: 'CASH' | 'TRANSFER';
  closingSourceId: string | null;
};

export type UpsertDeliverateConfigBody = {
  enabled?: boolean;
  username?: string | null;
  password?: string | null;
  integrationId?: string | null;
  shopPassword?: string | null;
  shopZone?: string | null;
  businessName?: string | null;
  cuit?: string | null;
  taxType?: string | null;
  ivaCondition?: string | null;
  gender?: string | null;
  birthDate?: string | null;
  ownerName?: string | null;
  textAddress?: string | null;
  cellphone?: string | null;
  telephone?: string | null;
  emails?: string[] | null;
  locationLat?: number | null;
  locationLng?: number | null;
  workingDays?: DeliverateWorkingDay[] | null;
  testMode?: boolean;
  webhookBaseUrl?: string | null;
  connect?: boolean;
  createShop?: boolean;
  closingAccountId?: string | null;
  closingKind?: ClosingSourceKind;
  closingIncludeInDeclared?: boolean;
  closingPaymentMethod?: 'CASH' | 'TRANSFER';
};

export type DeliverateRequestResult = {
  id: string;
  code: string;
  status: string;
  externalSource: string | null;
  externalId: string | null;
  externalMeta: Record<string, unknown> | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryStreetNumber: string | null;
};

@Injectable({ providedIn: 'root' })
export class IntegrationsApiService {
  private readonly http = inject(HttpClient);

  getDeliverate(shopId: string) {
    return this.http.get<DeliverateConfig>(
      `${environment.apiUrl}/shops/${encodeURIComponent(shopId)}/integrations/deliverate`,
    );
  }

  upsertDeliverate(shopId: string, body: UpsertDeliverateConfigBody) {
    return this.http.put<DeliverateConfig>(
      `${environment.apiUrl}/shops/${encodeURIComponent(shopId)}/integrations/deliverate`,
      body,
    );
  }

  testDeliverate(shopId: string) {
    return this.http.post<{
      ok: boolean;
      username?: string;
      isIntegration?: boolean;
      hasToken?: boolean;
      shops?: string[];
      warning?: string | null;
    }>(
      `${environment.apiUrl}/shops/${encodeURIComponent(shopId)}/integrations/deliverate/test`,
      {},
    );
  }

  requestDeliverate(shopId: string, orderId: string) {
    return this.http.post<DeliverateRequestResult>(
      `${environment.apiUrl}/shops/${encodeURIComponent(shopId)}/customer-orders/${encodeURIComponent(orderId)}/deliverate/request`,
      {},
    );
  }

  dboyLocation(shopId: string, orderId: string) {
    return this.http.get<{
      dboy_id: number;
      location: { coordinates: [number, number] };
      created_date?: string;
    }>(
      `${environment.apiUrl}/shops/${encodeURIComponent(shopId)}/customer-orders/${encodeURIComponent(orderId)}/deliverate/dboy-location`,
    );
  }
}
