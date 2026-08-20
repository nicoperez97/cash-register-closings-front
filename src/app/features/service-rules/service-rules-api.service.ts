import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { safeUploadFileName } from '../../shared/utils/input-file';

export type ServiceRulePhase = 'PRE' | 'POST';

export interface ServiceRuleCategory {
  id: string;
  shopId: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface ServiceRule {
  id: string;
  shopId: string;
  categoryId: string;
  phase: ServiceRulePhase;
  title: string;
  body: string;
  sortOrder: number;
  active: boolean;
}

export interface ServiceRulesBundle {
  categories: ServiceRuleCategory[];
  rules: ServiceRule[];
}

export interface PublicServiceRulesBundle extends ServiceRulesBundle {
  shop: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
    accentColor?: string | null;
  };
}

export const SERVICE_RULE_PHASES: Array<{ value: ServiceRulePhase; label: string }> = [
  { value: 'PRE', label: 'Antes del servicio' },
  { value: 'POST', label: 'Después del servicio' },
];

export interface ServiceRulesImportRuleDraft {
  phase: ServiceRulePhase;
  title: string;
  body: string;
}

export interface ServiceRulesImportCategoryDraft {
  name: string;
  rules: ServiceRulesImportRuleDraft[];
}

export interface ServiceRulesImportDraft {
  categories: ServiceRulesImportCategoryDraft[];
}

export interface ServiceRulesParseResult extends ServiceRulesImportDraft {
  fileName?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ServiceRulesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(shopId: string, includeInactive = false) {
    const params: Record<string, string> = {};
    if (includeInactive) params['includeInactive'] = 'true';
    return this.http.get<ServiceRulesBundle>(`${this.base}/shops/${shopId}/service-rules`, {
      params,
    });
  }

  parseFile(shopId: string, file: File) {
    const form = new FormData();
    form.append('file', file, safeUploadFileName(file.name));
    return this.http.post<ServiceRulesParseResult>(
      `${this.base}/shops/${shopId}/service-rules/parse`,
      form,
    );
  }

  importDraft(shopId: string, draft: ServiceRulesImportDraft) {
    return this.http.post<ServiceRulesBundle>(
      `${this.base}/shops/${shopId}/service-rules/import`,
      draft,
    );
  }

  publicBySlug(slug: string) {
    return this.http.get<PublicServiceRulesBundle>(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/service-rules`,
    );
  }

  publicPdf(slug: string) {
    return this.http.get(
      `${this.base}/public/shops/${encodeURIComponent(slug)}/service-rules.pdf`,
      { responseType: 'blob' },
    );
  }

  createCategory(shopId: string, body: { name: string; sortOrder?: number }) {
    return this.http.post<ServiceRuleCategory>(
      `${this.base}/shops/${shopId}/service-rules/categories`,
      body,
    );
  }

  updateCategory(
    shopId: string,
    id: string,
    body: Partial<{ name: string; sortOrder: number; active: boolean }>,
  ) {
    return this.http.patch<ServiceRuleCategory>(
      `${this.base}/shops/${shopId}/service-rules/categories/${id}`,
      body,
    );
  }

  removeCategory(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(
      `${this.base}/shops/${shopId}/service-rules/categories/${id}`,
    );
  }

  createRule(
    shopId: string,
    body: {
      categoryId: string;
      phase: ServiceRulePhase;
      title: string;
      body: string;
      sortOrder?: number;
    },
  ) {
    return this.http.post<ServiceRule>(`${this.base}/shops/${shopId}/service-rules`, body);
  }

  updateRule(
    shopId: string,
    id: string,
    body: Partial<{
      categoryId: string;
      phase: ServiceRulePhase;
      title: string;
      body: string;
      sortOrder: number;
      active: boolean;
    }>,
  ) {
    return this.http.patch<ServiceRule>(`${this.base}/shops/${shopId}/service-rules/${id}`, body);
  }

  removeRule(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/service-rules/${id}`);
  }
}
