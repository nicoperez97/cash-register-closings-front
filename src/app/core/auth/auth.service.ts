import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthUser, GlobalRole, toUiRole } from './auth.models';
import { ShopContextService } from '../shop/shop-context.service';
import { isPublicAppPath } from '../routing/public-paths';

const TOKEN_KEY = 'crc_token';
const USER_KEY = 'crc_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly shopContext = inject(ShopContextService);

  readonly currentUser = signal<AuthUser | null>(this.readUser());

  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private refreshAgain = false;
  private visibilityHooked = false;

  constructor() {
    this.hookVisibilityRefresh();
  }

  isAuthenticated(): boolean {
    return !!this.getToken() && !!this.currentUser();
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isAdmin(): boolean {
    const role = this.currentUser()?.globalRole;
    return role === 'ADMIN' || role === 'OWNER';
  }

  /** Solo Super admin (OWNER). */
  isSuperAdmin(): boolean {
    return this.currentUser()?.globalRole === 'OWNER';
  }

  hasPermission(permission: string): boolean {
    return !!this.currentUser()?.permissions?.includes(permission);
  }

  /**
   * Revalida /auth/me con debounce (p.ej. tras cargas/actualizaciones vía interceptor).
   */
  scheduleRefreshMe(delayMs = 400): void {
    if (!this.getToken()) return;
    if (typeof location !== 'undefined' && isPublicAppPath(location.pathname || '/')) {
      return;
    }
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshMe().catch(() => undefined);
    }, delayMs);
  }

  async login(email: string, password: string): Promise<boolean> {
    const res = await firstValueFrom(
      this.http.post<{
        accessToken: string;
        user: {
          id: string;
          email: string;
          fullName: string;
          globalRole: GlobalRole;
          permissions: string[];
          shopIds: string[];
        };
      }>(`${environment.apiUrl}/auth/login`, { email, password }),
    );

    return this.applySession(res.accessToken);
  }

  /** Login con ID token de Google (solo si el email ya existe en el sistema). */
  async loginWithGoogle(idToken: string): Promise<boolean> {
    const res = await firstValueFrom(
      this.http.post<{ accessToken: string }>(`${environment.apiUrl}/auth/google`, {
        idToken,
      }),
    );
    return this.applySession(res.accessToken);
  }

  private async applySession(accessToken: string): Promise<boolean> {
    localStorage.setItem(TOKEN_KEY, accessToken);
    const me = await firstValueFrom(
      this.http.get<any>(`${environment.apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    const user = this.mapMe(me);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
    this.shopContext.setShops(user.shops, user.favoriteShopId, true);
    return true;
  }

  /**
   * Si hay un /me en vuelo y llega otro pedido, marca refreshAgain para
   * re-fetch al terminar (evita quedar con prefs viejas tras Guardar menú).
   */
  async refreshMe(): Promise<void> {
    if (!this.getToken()) return;
    if (this.refreshInFlight) {
      this.refreshAgain = true;
      return this.refreshInFlight;
    }
    this.refreshInFlight = (async () => {
      try {
        do {
          this.refreshAgain = false;
          const me = await firstValueFrom(this.http.get<any>(`${environment.apiUrl}/auth/me`));
          const user = this.mapMe(me);
          const prev = this.currentUser();
          if (prev && this.userFingerprint(prev) === this.userFingerprint(user)) {
            continue;
          }
          localStorage.setItem(USER_KEY, JSON.stringify(user));
          this.currentUser.set(user);
          this.shopContext.setShops(user.shops, user.favoriteShopId);
        } while (this.refreshAgain);
      } finally {
        this.refreshInFlight = null;
      }
    })();
    return this.refreshInFlight;
  }

  /** Actualiza campos de perfil en memoria (toolbar / avatar) sin esperar /me. */
  patchCurrentUser(partial: Partial<AuthUser>): void {
    const prev = this.currentUser();
    if (!prev) return;
    const next: AuthUser = { ...prev, ...partial };
    localStorage.setItem(USER_KEY, JSON.stringify(next));
    this.currentUser.set(next);
  }

  async setFavoriteShop(shopId: string | null): Promise<void> {
    const me = await firstValueFrom(
      this.http.patch<any>(`${environment.apiUrl}/auth/favorite-shop`, { shopId }),
    );
    const user = this.mapMe(me);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.currentUser.set(user);
    this.shopContext.setFavoriteShopId(user.favoriteShopId ?? null);
  }

  logout(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.refreshInFlight = null;
    this.refreshAgain = false;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    this.shopContext.clear();
  }

  private hookVisibilityRefresh(): void {
    if (this.visibilityHooked || typeof document === 'undefined') return;
    this.visibilityHooked = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.getToken()) {
        this.scheduleRefreshMe(0);
      }
    });
  }

  private userFingerprint(u: AuthUser): string {
    return JSON.stringify({
      id: u.id,
      globalRole: u.globalRole,
      permissions: u.permissions ?? [],
      shopIds: u.shopIds ?? [],
      shopRoles: u.shopRoles ?? {},
      shopPermissions: u.shopPermissions ?? {},
      shopModulePermissions: u.shopModulePermissions ?? {},
      shopAccountIds: u.shopAccountIds ?? {},
      favoriteShopId: u.favoriteShopId ?? null,
      avatarUrl: u.avatarUrl ?? null,
      hasAvatar: !!u.hasAvatar,
      fullName: u.fullName ?? null,
      phone: u.phone ?? null,
      bankAlias: u.bankAlias ?? null,
      cbu: u.cbu ?? null,
      shops: (u.shops ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        active: s.active,
        logoUrl: s.logoUrl ?? null,
        myNavConfig: s.myNavConfig ?? null,
        navConfig: s.navConfig ?? null,
        myToolbarConfig: s.myToolbarConfig ?? null,
        toolbarConfig: s.toolbarConfig ?? null,
        mutedNotificationTypes: s.mutedNotificationTypes ?? [],
        canEditExpenses: !!s.canEditExpenses,
        canEditPayments: !!s.canEditPayments,
        accentColor: s.accentColor ?? null,
        accentSecondary: s.accentSecondary ?? null,
        email: s.email ?? null,
        instagramHandle: s.instagramHandle ?? null,
        phone: s.phone ?? null,
        emailNotificationsEnabled: s.emailNotificationsEnabled,
        coversEnabled: s.coversEnabled,
        reservationsEnabled: s.reservationsEnabled,
        reservationSignupEnabled: s.reservationSignupEnabled !== false,
        reservationInsideEnabled: s.reservationInsideEnabled !== false,
        reservationOutsideEnabled: s.reservationOutsideEnabled !== false,
        reservationInsideMaxPartySize: s.reservationInsideMaxPartySize ?? null,
        reservationOutsideMaxPartySize:
          s.reservationOutsideMaxPartySize ?? s.reservationOutsideMinPartySize ?? null,
        reservationOutsideMinPartySize: s.reservationOutsideMinPartySize ?? null,
        waitingListEnabled: s.waitingListEnabled,
        tipsEnabled: s.tipsEnabled,
        settlementsEnabled: !!s.settlementsEnabled,
        publicAttendanceEnabled: !!s.publicAttendanceEnabled,
        publicServiceRulesEnabled: !!s.publicServiceRulesEnabled,
        serviceDefaultCheckIn: s.serviceDefaultCheckIn || '18:00',
        serviceDefaultCheckOut: s.serviceDefaultCheckOut || '00:00',
        serviceAttendanceWithHours: s.serviceAttendanceWithHours !== false,
        menuEnabled: !!s.menuEnabled,
        timezone: s.timezone ?? null,
        openingTime: s.openingTime ?? null,
        shifts: Array.isArray(s.shifts) ? s.shifts : [],
      })),
    });
  }

  private mapMe(me: any): AuthUser {
    return {
      id: me.id,
      email: me.email,
      fullName: me.fullName,
      phone: me.phone ?? null,
      bankAlias: me.bankAlias ?? null,
      cbu: me.cbu ?? null,
      avatarUrl: me.avatarUrl ?? null,
      hasAvatar: !!me.hasAvatar || !!me.avatarUrl,
      globalRole: me.globalRole,
      role: toUiRole(me.globalRole),
      permissions: me.permissions ?? [],
      shopIds: me.shopIds ?? [],
      shopRoles: me.shopRoles ?? {},
      shopPermissions: me.shopPermissions ?? {},
      shopModulePermissions: me.shopModulePermissions ?? {},
      shopAccountIds: this.normalizeShopAccountIds(me.shopAccountIds),
      shops: me.shops ?? [],
      favoriteShopId: me.favoriteShopId ?? null,
    };
  }

  /** Compat: antes era un string por shop; ahora es string[]. */
  private normalizeShopAccountIds(raw: any): Record<string, string[]> {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, string[]> = {};
    for (const [shopId, value] of Object.entries(raw)) {
      if (Array.isArray(value)) out[shopId] = value.filter((v) => typeof v === 'string');
      else if (typeof value === 'string' && value) out[shopId] = [value];
    }
    return out;
  }

  private readUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      const user = raw ? (JSON.parse(raw) as AuthUser) : null;
      if (user) {
        queueMicrotask(() =>
          this.shopContext.setShops(user.shops ?? [], user.favoriteShopId ?? null),
        );
      }
      return user;
    } catch {
      return null;
    }
  }
}
