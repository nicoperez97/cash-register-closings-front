import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import type { ShopNavConfig } from '../../core/layout/nav-config';
import { safeUploadFileName } from '../../shared/utils/input-file';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  bankAlias?: string | null;
  cbu?: string | null;
  avatarUrl?: string | null;
  hasAvatar?: boolean;
}

export interface EligibleNotification {
  type: string;
  label: string;
  muted: boolean;
  mutedApp?: boolean;
  mutedEmail?: boolean;
}

export interface ShopProfilePreferences {
  shopId: string;
  shopNavConfig: ShopNavConfig | null;
  navConfig: ShopNavConfig | null;
  mutedNotificationTypes: string[];
  mutedAppNotificationTypes?: string[];
  mutedEmailNotificationTypes?: string[];
  eligibleNotifications: EligibleNotification[];
  usingShopMenuDefault: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProfileApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  get() {
    return this.http.get<UserProfile>(`${this.base}/profile`);
  }

  update(body: Partial<Pick<UserProfile, 'fullName' | 'phone' | 'bankAlias' | 'cbu'>>) {
    return this.http.patch<UserProfile>(`${this.base}/profile`, body);
  }

  uploadAvatar(file: File) {
    const body = new FormData();
    body.append('file', file, safeUploadFileName(file.name || 'avatar.jpg'));
    return this.http.post<UserProfile>(`${this.base}/profile/avatar`, body);
  }

  removeAvatar() {
    return this.http.delete<UserProfile>(`${this.base}/profile/avatar`);
  }

  getPreferences(shopId: string) {
    return this.http.get<ShopProfilePreferences>(
      `${this.base}/shops/${shopId}/profile/preferences`,
    );
  }

  updatePreferences(
    shopId: string,
    body: {
      navConfig?: ShopNavConfig | null;
      mutedNotificationTypes?: string[] | null;
      mutedAppNotificationTypes?: string[] | null;
      mutedEmailNotificationTypes?: string[] | null;
    },
  ) {
    return this.http.patch<ShopProfilePreferences>(
      `${this.base}/shops/${shopId}/profile/preferences`,
      body,
    );
  }
}
