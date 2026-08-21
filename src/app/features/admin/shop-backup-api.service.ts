import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { BackupModuleId } from './shop-backup-modules';

export type BackupFormat = 'xlsx' | 'sql';

@Injectable({ providedIn: 'root' })
export class ShopBackupApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  downloadBackup(
    shopId: string,
    opts: { modules?: BackupModuleId[] | 'all'; format?: BackupFormat } = {},
  ): Observable<Blob> {
    let params = new HttpParams();
    const modules = opts.modules ?? 'all';
    params = params.set(
      'modules',
      modules === 'all' ? 'all' : modules.join(','),
    );
    params = params.set('format', opts.format ?? 'xlsx');
    return this.http.get(`${this.base}/shops/${shopId}/backup.xlsx`, {
      params,
      responseType: 'blob',
    });
  }

  restoreBackup(shopId: string, file: File, force = false): Observable<{ ok: boolean }> {
    const fd = new FormData();
    fd.append('file', file);
    const q = force ? '?force=1' : '';
    return this.http.post<{ ok: boolean }>(
      `${this.base}/shops/${shopId}/backup/restore${q}`,
      fd,
    );
  }

  resetShop(
    shopId: string,
    opts: { modules?: BackupModuleId[] | 'all' } = {},
  ): Observable<{ ok: boolean; modules?: string }> {
    const modules = opts.modules ?? 'all';
    return this.http.post<{ ok: boolean; modules?: string }>(
      `${this.base}/shops/${shopId}/reset`,
      {
        confirm: 'RESET',
        modules: modules === 'all' ? ['all'] : modules,
      },
    );
  }
}
