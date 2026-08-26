import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type PartnerSplitConfig = {
  partnerAccountIds: string[];
  channelLeaves: Array<{ accountId: string; leaveAmount: number }>;
  extras: Array<{ id: string; label: string; amount: number }>;
};

export type PartnerSplitRow = {
  accountId: string;
  name: string;
  current: number;
  target: number;
  difference: number;
  share?: number;
  leaveAmount?: number;
  included?: boolean;
};

export type PartnerSplitPreview = {
  config: PartnerSplitConfig;
  partners: PartnerSplitRow[];
  channels: PartnerSplitRow[];
  extras: Array<{ id: string; label: string; amount: number }>;
  availablePartners: Array<{
    accountId: string;
    name: string;
    included: boolean;
    current: number;
  }>;
  totals: {
    balances: number;
    reserves: number;
    extras: number;
    toDistribute: number;
    share: number;
    differences: number;
  };
  transfers: Array<{
    fromAccountId: string;
    fromName: string;
    toAccountId: string;
    toName: string;
    amount: number;
  }>;
  createdCount?: number;
};

@Injectable({ providedIn: 'root' })
export class PartnerSplitsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  get(shopId: string) {
    return this.http.get<PartnerSplitPreview>(`${this.base}/shops/${shopId}/partner-splits`);
  }

  preview(shopId: string, config: PartnerSplitConfig) {
    return this.http.post<PartnerSplitPreview>(
      `${this.base}/shops/${shopId}/partner-splits/preview`,
      config,
    );
  }

  save(shopId: string, config: PartnerSplitConfig) {
    return this.http.put<PartnerSplitPreview>(
      `${this.base}/shops/${shopId}/partner-splits/config`,
      config,
    );
  }

  apply(shopId: string, config: PartnerSplitConfig) {
    return this.http.post<PartnerSplitPreview>(
      `${this.base}/shops/${shopId}/partner-splits/apply`,
      config,
    );
  }

  listRuns(shopId: string) {
    return this.http.get<PartnerSplitRun[]>(`${this.base}/shops/${shopId}/partner-splits/runs`);
  }

  getRun(shopId: string, id: string) {
    return this.http.get<PartnerSplitRun>(
      `${this.base}/shops/${shopId}/partner-splits/runs/${id}`,
    );
  }
}

export type PartnerSplitRun = {
  id: string;
  shopId: string;
  appliedAt: string;
  appliedByUserId: string | null;
  appliedByName: string | null;
  transferCount: number;
  distributedAmount: number;
  snapshot?: PartnerSplitPreview & { createdIds?: string[] };
};
