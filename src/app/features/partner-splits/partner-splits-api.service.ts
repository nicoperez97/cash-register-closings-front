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
  ownershipPercent?: number;
  proposedPercent?: boolean;
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
  createdMovementCount?: number;
  createdPaymentCount?: number;
};

export type EqualizePartnerRow = {
  accountId: string;
  name: string;
  current: number;
  ownershipPercent: number;
  proposedPercent?: boolean;
  target: number;
  difference: number;
};

export type EqualizePreview = {
  kind: 'equalize';
  amount: number;
  partners: EqualizePartnerRow[];
  totals: {
    amount: number;
    ownershipSum: number;
    balances: number;
    targets: number;
    differences: number;
    transferCount: number;
    transferAmount: number;
  };
  transfers: Array<{
    fromAccountId: string;
    fromName: string;
    toAccountId: string;
    toName: string;
    amount: number;
  }>;
  surplusTotal?: number;
  deficitTotal?: number;
  transferStatus?: 'need_amount' | 'balanced' | 'transfers' | 'surplus_only' | 'deficit_only';
  proposedEqualPercents?: boolean;
  createdCount?: number;
  createdPaymentCount?: number;
  createdMovementCount?: number;
  runId?: string;
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

  apply(
    shopId: string,
    config: PartnerSplitConfig & {
      partnerActions?: Array<{
        accountId?: string;
        fromAccountId?: string;
        toAccountId?: string;
        generate: 'skip' | 'payment' | 'movement';
      }>;
      partnerComplete?: Array<{
        accountId?: string;
        fromAccountId?: string;
        toAccountId?: string;
        complete: boolean;
      }>;
    },
  ) {
    return this.http.post<PartnerSplitPreview>(
      `${this.base}/shops/${shopId}/partner-splits/apply`,
      config,
    );
  }

  saveOwnership(shopId: string, items: Array<{ accountId: string; ownershipPercent: number }>) {
    return this.http.put<Array<{ accountId: string; name: string; ownershipPercent: number }>>(
      `${this.base}/shops/${shopId}/partner-splits/ownership`,
      { items },
    );
  }

  equalizePreview(shopId: string, body: { amount: number; partnerAccountIds?: string[] }) {
    return this.http.post<EqualizePreview>(
      `${this.base}/shops/${shopId}/partner-splits/equalize/preview`,
      body,
    );
  }

  equalizeApply(
    shopId: string,
    body: {
      amount: number;
      partnerAccountIds?: string[];
      transferActions?: Array<{
        fromAccountId: string;
        toAccountId: string;
        generate: 'skip' | 'payment' | 'movement';
      }>;
      sendSurplusToDividends?: boolean;
    },
  ) {
    return this.http.post<EqualizePreview>(
      `${this.base}/shops/${shopId}/partner-splits/equalize/apply`,
      body,
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
  kind?: 'split' | 'equalize';
  snapshot?: (PartnerSplitPreview | EqualizePreview) & {
    kind?: 'equalize' | 'split';
    amount?: number;
    createdIds?: string[];
    createdMovementIds?: string[];
    createdPaymentIds?: string[];
    partnerActions?: Array<{
      accountId?: string;
      fromAccountId?: string;
      toAccountId?: string;
      generate: 'skip' | 'payment' | 'movement';
    }>;
    partnerComplete?: Array<{
      accountId?: string;
      fromAccountId?: string;
      toAccountId?: string;
      complete: boolean;
    }>;
  };
};
