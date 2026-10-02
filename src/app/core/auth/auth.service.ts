import { Injectable, inject, signal } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthUser, isMorePrivileged, toUiRole } from './auth.models';
import { ShopContextService } from '../shop/shop-context.service';
import { isPublicAppPath } from '../routing/public-paths';
import { AnalyticsService } from '../analytics/analytics.service';
import { buildDemoAuthUser, DEMO_TOKEN } from '../demo/demo-fixtures';
import { isDemoSession } from '../demo/demo-offline';
import { DemoOverlayStore } from '../demo/demo-overlay.store';

const TOKEN_KEY = 'crc_token';
const USER_KEY = 'crc_user';
const SESSIONS_KEY = 'crc_sessions';
const ACTIVE_KEY = 'crc_active_user_id';
const USAGE_KEY = 'crc_account_usage';
const MAX_SESSIONS = 8;

export type StoredSession = {
  userId: string;
  accessToken: string;
  user: AuthUser;
};

type AccountUsageMap = Record<string, { count: number; lastUsedAt: number }>;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  /** Sin interceptors: para /auth/me con un token que aún no es el activo. */
  private readonly rawHttp = new HttpClient(inject(HttpBackend));
  private readonly shopContext = inject(ShopContextService);
  private readonly analytics = inject(AnalyticsService);
  private readonly demoOverlay = inject(DemoOverlayStore);

  readonly currentUser = signal<AuthUser | null>(null);
  /** Perfiles de todas las cuentas abiertas (orden de apertura). */
  readonly sessions = signal<AuthUser[]>([]);
  /** Contadores de uso por cuenta (para ordenar las más usadas). */
  readonly accountUsage = signal<AccountUsageMap>(this.readUsage());

  /** Fuente de verdad en memoria (localStorage puede fallar por tamaño). */
  private sessionSlots: StoredSession[] = [];

  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private refreshAgain = false;
  private visibilityHooked = false;

  constructor() {
    this.hydrateFromStorage();
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
    if (this.isDemoMode()) return;
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
      }>(`${environment.apiUrl}/auth/login`, { email, password }),
    );

    return this.applySession(res.accessToken, 'password');
  }

  async loginDemo(): Promise<boolean> {
    this.demoOverlay.clear();
    const user = buildDemoAuthUser();
    this.writeSessions(
      [{ userId: user.id, accessToken: DEMO_TOKEN, user: { ...user, isDemo: true } }],
      user.id,
    );
    this.analytics.trackLoginSuccess('demo');
    return true;
  }

  async isDemoLoginAvailable(): Promise<boolean> {
    if (environment.demoLoginEnabled === false) return false;
    if (environment.demoLoginEnabled === true || !environment.production) return true;
    return false;
  }

  isDemoMode(): boolean {
    return isDemoSession() || !!this.currentUser()?.isDemo || this.getToken() === DEMO_TOKEN;
  }

  async loginWithGoogle(idToken: string): Promise<boolean> {
    const res = await firstValueFrom(
      this.http.post<{ accessToken: string }>(`${environment.apiUrl}/auth/google`, {
        idToken,
      }),
    );
    return this.applySession(res.accessToken, 'google');
  }

  needsReauthToSwitch(userId: string): boolean {
    const current = this.currentUser();
    if (!current || current.id === userId) return false;
    const target = this.readSessions().find((s) => s.userId === userId)?.user;
    if (!target) return true;
    if (current.isDemo || target.isDemo) return true;
    const shopId = this.shopContext.selectedShopId();
    return isMorePrivileged(target, current, shopId);
  }

  async switchTo(userId: string): Promise<boolean> {
    if (this.currentUser()?.id === userId) return true;
    if (this.needsReauthToSwitch(userId)) return false;
    const sessions = this.readSessions();
    const slot = sessions.find((s) => s.userId === userId);
    if (!slot) return false;
    let user = slot.user;
    if (!user.shops?.length) {
      try {
        const me = await firstValueFrom(
          this.rawHttp.get<any>(`${environment.apiUrl}/auth/me`, {
            headers: { Authorization: `Bearer ${slot.accessToken}` },
          }),
        );
        user = this.mapMe(me);
      } catch {
        return false;
      }
    }
    const next = sessions.map((s) =>
      s.userId === userId ? { ...s, user } : s,
    );
    this.writeSessions(next, userId);
    return true;
  }

  sessionUser(userId: string): AuthUser | null {
    return this.readSessions().find((s) => s.userId === userId)?.user ?? null;
  }

  /**
   * Cuentas abiertas ordenadas: activa primero, luego las más usadas.
   */
  sessionsRanked(): AuthUser[] {
    const activeId = this.currentUser()?.id;
    const usage = this.accountUsage();
    return [...this.sessions()].sort((a, b) => {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      const ua = usage[a.id]?.count ?? 0;
      const ub = usage[b.id]?.count ?? 0;
      if (ub !== ua) return ub - ua;
      return (usage[b.id]?.lastUsedAt ?? 0) - (usage[a.id]?.lastUsedAt ?? 0);
    });
  }

  private async applySession(
    accessToken: string,
    method?: 'password' | 'google' | 'demo',
  ): Promise<boolean> {
    const previous = this.readSessions().filter(
      (s) => !s.user.isDemo && s.accessToken !== DEMO_TOKEN,
    );

    // Sin interceptors: no pisar con el Bearer de la cuenta activa.
    const me = await firstValueFrom(
      this.rawHttp.get<any>(`${environment.apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    const user = this.mapMe(me);

    let sessions = [...previous];
    const idx = sessions.findIndex((s) => s.userId === user.id);
    const slot: StoredSession = { userId: user.id, accessToken, user };
    if (idx >= 0) sessions[idx] = slot;
    else sessions.push(slot);
    if (sessions.length > MAX_SESSIONS) {
      const others = sessions.filter((s) => s.userId !== user.id);
      sessions = [...others.slice(-(MAX_SESSIONS - 1)), slot];
    }
    this.writeSessions(sessions, user.id);
    if (method) this.analytics.trackLoginSuccess(method);
    return true;
  }

  async refreshMe(): Promise<void> {
    if (!this.getToken()) return;
    if (this.isDemoMode()) return;
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
          this.patchActiveUser(user);
          this.shopContext.setShops(user.shops, user.favoriteShopId);
        } while (this.refreshAgain);
      } finally {
        this.refreshInFlight = null;
      }
    })();
    return this.refreshInFlight;
  }

  patchCurrentUser(partial: Partial<AuthUser>): void {
    const prev = this.currentUser();
    if (!prev) return;
    const next: AuthUser = { ...prev, ...partial };
    this.patchActiveUser(next);
  }

  async setFavoriteShop(shopId: string | null): Promise<void> {
    if (this.isDemoMode()) {
      const user = this.currentUser();
      if (!user) return;
      const next = shopId && user.shopIds.includes(shopId) ? shopId : null;
      this.patchCurrentUser({ favoriteShopId: next });
      this.shopContext.setFavoriteShopId(next);
      return;
    }
    const me = await firstValueFrom(
      this.http.patch<any>(`${environment.apiUrl}/auth/favorite-shop`, { shopId }),
    );
    const user = this.mapMe(me);
    this.patchActiveUser(user);
    this.shopContext.setFavoriteShopId(user.favoriteShopId ?? null);
  }

  logout(): boolean {
    this.clearRefreshState();
    const activeId = this.currentUser()?.id;
    if (!activeId) {
      this.clearAllStorage();
      return false;
    }
    this.analytics.trackLogout();
    const remaining = this.readSessions().filter((s) => s.userId !== activeId);
    if (!remaining.length) {
      this.clearAllStorage();
      return false;
    }
    this.writeSessions(remaining, remaining[remaining.length - 1].userId);
    return true;
  }

  logoutAll(): void {
    this.clearRefreshState();
    this.analytics.trackLogout();
    this.clearAllStorage();
  }

  dropActiveAndSwitch(): boolean {
    return this.logout();
  }

  private patchActiveUser(user: AuthUser): void {
    const sessions = this.readSessions();
    const idx = sessions.findIndex((s) => s.userId === user.id);
    const activeId = this.currentUser()?.id ?? localStorage.getItem(ACTIVE_KEY) ?? user.id;
    if (idx < 0) {
      if (activeId === user.id) {
        try {
          localStorage.setItem(USER_KEY, JSON.stringify(user));
        } catch {
          // ignore
        }
        this.currentUser.set(user);
      }
      return;
    }
    const token = sessions[idx].accessToken;
    const next = sessions.slice();
    next[idx] = { userId: user.id, accessToken: token, user };
    this.writeSessions(next, activeId);
  }

  private activateSlot(slot: StoredSession, sessions: StoredSession[]): void {
    this.writeSessions(sessions, slot.userId);
  }

  private writeSessions(sessions: StoredSession[], activeUserId: string): void {
    const active = sessions.find((s) => s.userId === activeUserId) ?? sessions[0];
    if (!active) {
      this.clearAllStorage();
      return;
    }
    const prevActiveId = this.currentUser()?.id;
    this.sessionSlots = sessions;
    this.currentUser.set(active.user);
    this.sessions.set(sessions.map((s) => s.user));
    if (prevActiveId !== active.userId) {
      this.touchUsage(active.userId);
    }

    try {
      localStorage.setItem(TOKEN_KEY, active.accessToken);
      localStorage.setItem(USER_KEY, JSON.stringify(active.user));
      localStorage.setItem(ACTIVE_KEY, active.userId);
    } catch {
      // ignore
    }
    // Persistencia compacta (sin shops) para no reventar la cuota de localStorage.
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.map((s) => this.toPersistedSlot(s))));
    } catch {
      // Lista queda en memoria.
    }
    this.shopContext.setShops(active.user.shops ?? [], active.user.favoriteShopId ?? null, true);
  }

  private touchUsage(userId: string): void {
    if (!userId) return;
    const next: AccountUsageMap = { ...this.accountUsage() };
    const prev = next[userId] ?? { count: 0, lastUsedAt: 0 };
    next[userId] = { count: prev.count + 1, lastUsedAt: Date.now() };
    this.accountUsage.set(next);
    try {
      localStorage.setItem(USAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  private readUsage(): AccountUsageMap {
    try {
      const raw = localStorage.getItem(USAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as AccountUsageMap;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  /** Slot liviano para localStorage: sin el árbol de shops (muy pesado). */
  private toPersistedSlot(s: StoredSession): StoredSession {
    const u = s.user;
    return {
      userId: s.userId,
      accessToken: s.accessToken,
      user: {
        ...u,
        shops: [],
      },
    };
  }

  private readSessions(): StoredSession[] {
    if (this.sessionSlots.length) {
      return this.sessionSlots.map((s) => ({
        userId: s.userId,
        accessToken: s.accessToken,
        user: s.user,
      }));
    }
    return this.readSessionsFromStorage();
  }

  private readSessionsFromStorage(): StoredSession[] {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as StoredSession[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (s) =>
          s &&
          typeof s.userId === 'string' &&
          typeof s.accessToken === 'string' &&
          s.user &&
          typeof s.user === 'object',
      );
    } catch {
      return [];
    }
  }

  private hydrateFromStorage(): void {
    let sessions = this.readSessionsFromStorage();
    let activeId = localStorage.getItem(ACTIVE_KEY);

    if (!sessions.length) {
      const token = localStorage.getItem(TOKEN_KEY);
      const user = this.readUserLegacy();
      if (token && user) {
        sessions = [{ userId: user.id, accessToken: token, user }];
        activeId = user.id;
        try {
          localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
          localStorage.setItem(ACTIVE_KEY, user.id);
        } catch {
          // ignore
        }
      }
    }

    if (!sessions.length) {
      this.sessionSlots = [];
      this.currentUser.set(null);
      this.sessions.set([]);
      return;
    }

    const active =
      sessions.find((s) => s.userId === activeId) ?? sessions[sessions.length - 1];
    // crc_user tiene el perfil completo (con shops) de la cuenta activa.
    const fullActive = this.readUserLegacy();
    if (fullActive && fullActive.id === active.userId) {
      active.user = fullActive;
    }
    this.sessionSlots = sessions;
    try {
      localStorage.setItem(TOKEN_KEY, active.accessToken);
      localStorage.setItem(USER_KEY, JSON.stringify(active.user));
      localStorage.setItem(ACTIVE_KEY, active.userId);
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.map((s) => this.toPersistedSlot(s))));
    } catch {
      // ignore
    }
    this.currentUser.set(active.user);
    this.sessions.set(sessions.map((s) => s.user));
    const shops = active.user.shops ?? [];
    const fav = active.user.favoriteShopId ?? null;
    queueMicrotask(() => this.shopContext.setShops(shops, fav));
  }

  private clearRefreshState(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.refreshInFlight = null;
    this.refreshAgain = false;
  }

  private clearAllStorage(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SESSIONS_KEY);
    localStorage.removeItem(ACTIVE_KEY);
    this.sessionSlots = [];
    this.currentUser.set(null);
    this.sessions.set([]);
    this.shopContext.clear();
  }

  private hookVisibilityRefresh(): void {
    if (this.visibilityHooked || typeof document === 'undefined') return;
    this.visibilityHooked = true;
    document.addEventListener('visibilitychange', () => {
      // Tras sleep/red inestable: dar tiempo a recuperar red antes de /auth/me.
      if (document.visibilityState === 'visible' && this.getToken()) {
        this.scheduleRefreshMe(800);
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
      isDemo: !!u.isDemo,
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
        requireClosingFiles: !!s.requireClosingFiles,
        isCustomerOrdersAdmin: !!s.isCustomerOrdersAdmin,
        orderingConfigVisibility: s.orderingConfigVisibility ?? null,
        shopConfigVisibility: s.shopConfigVisibility ?? null,
        accentColor: s.accentColor ?? null,
        accentSecondary: s.accentSecondary ?? null,
        email: s.email ?? null,
        instagramHandle: s.instagramHandle ?? null,
        phone: s.phone ?? null,
        emailNotificationsEnabled: s.emailNotificationsEnabled,
        cashWithdrawalConceptId: s.cashWithdrawalConceptId ?? null,
        partnerDividendAccountId: s.partnerDividendAccountId ?? null,
        partnerDividendConceptId: s.partnerDividendConceptId ?? null,
        transferConceptId: s.transferConceptId ?? null,
        closingIncomeConceptId: s.closingIncomeConceptId ?? null,
        closingCashConceptId: s.closingCashConceptId ?? null,
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
        holidayPayMultiplier: Number(s.holidayPayMultiplier ?? 1) || 1,
        menuEnabled: !!s.menuEnabled,
        shopMode: s.shopMode === 'AL_PASO' ? 'AL_PASO' : 'RESTAURANTE',
        onlineOrderingEnabled: !!s.onlineOrderingEnabled,
        waiterOrderingEnabled: !!s.waiterOrderingEnabled,
        orderingForceClosed: !!s.orderingForceClosed,
        takeawayEnabled: s.takeawayEnabled !== false,
        deliveryEnabled: !!s.deliveryEnabled,
        orderingHours: s.orderingHours ?? null,
        orderingPayments: s.orderingPayments ?? null,
        counterPaymentMethods: Array.isArray(s.counterPaymentMethods)
          ? s.counterPaymentMethods
          : null,
        deliveryZones: Array.isArray(s.deliveryZones) ? s.deliveryZones : [],
        orderingEta: s.orderingEta ?? null,
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
      isDemo: !!me.isDemo,
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

  private readUserLegacy(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      let user = raw ? (JSON.parse(raw) as AuthUser) : null;
      if (user && localStorage.getItem(TOKEN_KEY) === DEMO_TOKEN) {
        user = { ...user, isDemo: true };
      }
      return user;
    } catch {
      return null;
    }
  }
}
