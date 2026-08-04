import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type CandidateStatus = 'new' | 'reviewing' | 'hired' | 'rejected';

export interface CandidateEducationItem {
  institution?: string;
  degree?: string;
  period?: string;
}

export interface CandidateExperienceItem {
  company?: string;
  role?: string;
  period?: string;
  description?: string;
}

export interface CandidateLanguageItem {
  name?: string;
  level?: string;
}

export interface Candidate {
  id: string;
  shopId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  documentId?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  birthDate?: string | null;
  nationality?: string | null;
  linkedIn?: string | null;
  website?: string | null;
  summary?: string | null;
  education?: CandidateEducationItem[];
  experience?: CandidateExperienceItem[];
  skills?: string[];
  languages?: CandidateLanguageItem[];
  rawText?: string | null;
  notes?: string | null;
  status: CandidateStatus;
  active: boolean;
  createdAt?: string;
  updatedAt?: string | null;
}

export type ParsedCv = Omit<
  Candidate,
  'id' | 'shopId' | 'status' | 'active' | 'createdAt' | 'updatedAt' | 'notes'
> & {
  notes?: string | null;
};

export type CandidatePayload = Partial<
  Omit<Candidate, 'id' | 'shopId' | 'active' | 'createdAt' | 'updatedAt'>
> & {
  firstName: string;
  lastName: string;
};

@Injectable({ providedIn: 'root' })
export class CandidatesApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  list(shopId: string, status?: string) {
    return this.http.get<Candidate[]>(`${this.base}/shops/${shopId}/candidates`, {
      params: status ? { status } : {},
    });
  }

  one(shopId: string, id: string) {
    return this.http.get<Candidate>(`${this.base}/shops/${shopId}/candidates/${id}`);
  }

  parse(shopId: string, files: File | File[]) {
    const list = Array.isArray(files) ? files : [files];
    const form = new FormData();
    for (const file of list) {
      form.append('files', file, file.name);
    }
    return this.http.post<ParsedCv>(`${this.base}/shops/${shopId}/candidates/parse`, form);
  }

  create(shopId: string, body: CandidatePayload) {
    return this.http.post<Candidate>(`${this.base}/shops/${shopId}/candidates`, body);
  }

  update(shopId: string, id: string, body: Partial<CandidatePayload>) {
    return this.http.patch<Candidate>(`${this.base}/shops/${shopId}/candidates/${id}`, body);
  }

  remove(shopId: string, id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/shops/${shopId}/candidates/${id}`);
  }
}
