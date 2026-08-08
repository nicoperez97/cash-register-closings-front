import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type ShortageLevel = 'NONE' | 'LOW' | 'NORMAL' | 'HIGH';

export interface Shortage {
  id: string;
  shopId: string;
  name: string;
  level: ShortageLevel;
  levelLabel: string;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export const SHORTAGE_LEVEL_OPTIONS: Array<{
  value: ShortageLevel;
  label: string;
}> = [
  { value: 'NONE', label: 'Nada' },
  { value: 'LOW', label: 'Poco' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'Mucho' },
];

export function shortageLevelLabel(level: ShortageLevel | string): string {
  return SHORTAGE_LEVEL_OPTIONS.find((o) => o.value === level)?.label ?? String(level);
}

export function isCriticalShortageLevel(level: ShortageLevel | string): boolean {
  return level === 'NONE' || level === 'LOW';
}

@Injectable({ providedIn: 'root' })
export class ShortagesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(shopId: string, includeInactive = false) {
    const params: Record<string, string> = {};
    if (includeInactive) params['includeInactive'] = 'true';
    return this.http.get<Shortage[]>(`${this.base}/shops/${shopId}/shortages`, { params });
  }

  one(shopId: string, id: string) {
    return this.http.get<Shortage>(`${this.base}/shops/${shopId}/shortages/${id}`);
  }

  create(
    shopId: string,
    body: { name: string; level: ShortageLevel; notes?: string | null; active?: boolean },
  ) {
    return this.http.post<Shortage>(`${this.base}/shops/${shopId}/shortages`, body);
  }

  update(
    shopId: string,
    id: string,
    body: Partial<{
      name: string;
      level: ShortageLevel;
      notes: string | null;
      active: boolean;
    }>,
  ) {
    return this.http.patch<Shortage>(`${this.base}/shops/${shopId}/shortages/${id}`, body);
  }

  remove(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/shortages/${id}`);
  }
}
