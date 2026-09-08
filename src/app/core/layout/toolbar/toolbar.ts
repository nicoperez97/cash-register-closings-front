import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  Subject,
  catchError,
  finalize,
  of,
  switchMap,
  timeout,
} from 'rxjs';
import { APP_BRAND } from '../../config/app-brand';
import { AuthService } from '../../auth/auth.service';
import {
  defaultHomeRoute,
  hasShopPermission,
  isCashierOnly,
  isClosingsCreateOnly,
  isProducerOnly,
  canViewClosingsList,
  canCustomizeLayout,
  userRoleLabel,
} from '../../auth/auth.models';
import { ThemeService, ThemeMode } from '../../theme/theme.service';
import { OfflineService } from '../../offline/offline.service';
import { ShopContextService } from '../../shop/shop-context.service';
import { PageRefreshService } from '../../page-refresh.service';
import { DialogTitleService } from '../../../shared/services/dialog-title.service';
import { QuickExpenseDialogComponent } from '../../../features/movements/quick-expense-dialog';
import {
  canAccessCustomRoute,
  type ShopRouteFeatures,
} from '../../auth/route-access';
import {
  applyToolbarConfig,
  effectiveToolbarConfig,
  TOOLBAR_QUICK_ACTION_DEFS,
} from '../toolbar-config';
import {
  AppNotification,
  NotificationsApiService,
  notificationIcon,
  notificationToneClass,
} from '../../../features/payments/notifications-api.service';
import { notificationRouterLink } from '../../notifications/notification-deep-link';
import { NotificationsInboxService } from '../../../features/payments/notifications-inbox.service';
import { PushNotificationsService } from '../../../features/payments/push-notifications.service';
import { UserAvatarComponent } from '../../../shared/components/user-avatar';

export interface ToolbarUser {
  id?: string;
  email: string;
  fullName?: string;
  role?: string;
  globalRole?: string;
  avatarUrl?: string | null;
  hasAvatar?: boolean;
}

type ToolbarQuickAction =
  | { id: string; kind: 'route'; label: string; icon: string; route: string }
  | { id: string; kind: 'action'; label: string; icon: string };

type NotifSection = {
  key: 'nuevas' | 'hoy' | 'anteriores';
  label: string;
  items: AppNotification[];
};

const QUICK_BTN = 38;
const QUICK_GAP = 6;
/** Espacio mínimo del spacer (no comerse el layout). */
const MIN_SPACER = 12;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * TypeORM usa timezone:'Z' pero MySQL guarda DATETIME en hora local del server (AR).
 * El JSON llega como `…Z` aunque los números son de pared local → sin esto marca ~3 h de más.
 */
export function parseAppDateTime(raw: string | Date | null | undefined): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  const s = String(raw).trim();
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const ms = m[7] ? Math.round(Number(`0${m[7]}`) * 1000) : 0;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    m[4] != null ? Number(m[4]) : 0,
    m[5] != null ? Number(m[5]) : 0,
    m[6] != null ? Number(m[6]) : 0,
    ms,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Tiempo relativo estilo inbox (es-AR). */
export function notifRelativeTime(iso: string, now = new Date()): string {
  const then = parseAppDateTime(iso);
  if (!then) return '';
  const diffSec = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (diffSec < 60) return 'Ahora';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 día';
  if (days < 7) return `${days} días`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? '1 sem' : `${weeks} sem`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? '1 mes' : `${months} meses`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 año' : `${years} años`;
}

@Component({
  selector: 'app-toolbar',
  imports: [
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatMenuModule,
    MatDialogModule,
    MatSnackBarModule,
    UserAvatarComponent,
  ],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
})
export class ToolbarComponent implements OnInit {
  readonly brand = APP_BRAND;
  readonly theme = inject(ThemeService);
  readonly offline = inject(OfflineService);
  readonly shopContext = inject(ShopContextService);
  readonly pageRefresh = inject(PageRefreshService);
  private readonly auth = inject(AuthService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly notifsInbox = inject(NotificationsInboxService);
  readonly push = inject(PushNotificationsService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly user = input<ToolbarUser | null>(null);
  readonly isMobile = input(false);
  readonly sidenavOpen = input(false);
  readonly menuToggle = output<void>();
  readonly logout = output<void>();

  private readonly notifTrigger = viewChild<MatMenuTrigger>('notifTrigger');
  private readonly userTrigger = viewChild<MatMenuTrigger>('userTrigger');

  readonly unreadCount = this.notifsInbox.unreadCount;
  readonly notifications = signal<AppNotification[]>([]);
  readonly loadingNotifs = signal(false);
  /** Filtro del panel: todas | solo no leídas. */
  readonly notifFilter = signal<'all' | 'unread'>('all');
  readonly notifMenuOpen = signal(false);

  readonly filteredNotifications = computed(() => {
    const rows = this.notifications();
    if (this.notifFilter() === 'unread') return rows.filter((n) => !n.read);
    return rows;
  });

  readonly hasUnreadNotifs = computed(() => this.notifications().some((n) => !n.read));

  /** Secciones estilo Facebook: Nuevas (no leídas) / Hoy / Anteriores. */
  readonly notifSections = computed((): NotifSection[] => {
    const rows = this.filteredNotifications();
    if (!rows.length) return [];

    if (this.notifFilter() === 'unread') {
      return [{ key: 'nuevas', label: 'Nuevas', items: rows }];
    }

    const startOfToday = startOfLocalDay(new Date());
    const nuevas: AppNotification[] = [];
    const hoy: AppNotification[] = [];
    const anteriores: AppNotification[] = [];

    for (const n of rows) {
      if (!n.read) {
        nuevas.push(n);
        continue;
      }
      const created = parseAppDateTime(n.createdAt);
      if (created && created >= startOfToday) {
        hoy.push(n);
      } else {
        anteriores.push(n);
      }
    }

    const sections: NotifSection[] = [];
    if (nuevas.length) sections.push({ key: 'nuevas', label: 'Nuevas', items: nuevas });
    if (hoy.length) sections.push({ key: 'hoy', label: 'Hoy', items: hoy });
    if (anteriores.length) {
      sections.push({ key: 'anteriores', label: 'Anteriores', items: anteriores });
    }
    return sections;
  });

  /** Recarga la lista; cancela un pedido anterior (p. ej. colgado al volver de background). */
  private readonly loadNotifs$ = new Subject<{ showSpinner: boolean }>();

  /** Ancho libre (px) para los accesos rápidos, medido en el DOM. */
  private readonly availableQuickWidth = signal(0);

  /**
   * Accesos filtrados por permiso del local activo (built-in + custom).
   * Cajero/productor solo ven lo que su rol puede abrir; el resto ve
   * todos los atajos para los que tienen permiso (p. ej. Nuevo cierre + stock).
   */
  readonly quickActions = computed((): ToolbarQuickAction[] => {
    const user = this.auth.currentUser();
    const shopId = this.shopContext.selectedShopId();
    const shop = this.shopContext.selectedShop();
    if (!user || !shopId) return [];

    const cashierOnly = isCashierOnly(user, shopId);
    const producerOnly = isProducerOnly(user, shopId);
    const items: ToolbarQuickAction[] = [];
    const cfg = effectiveToolbarConfig(shop);

    const pushRoute = (id: string, label: string, icon: string, route: string) => {
      items.push({ id, kind: 'route', label, icon, route });
    };

    if (cashierOnly) {
      if (hasShopPermission(user, shopId, 'closings.create')) {
        pushRoute('new-closing', 'Nuevo cierre', 'point_of_sale', '/closings/new');
      }
      return applyToolbarConfig(items, cfg);
    }

    if (producerOnly) {
      pushRoute('my-hours', 'Mis horas', 'restaurant', '/my-production');
      if (hasShopPermission(user, shopId, 'reimbursements.self')) {
        pushRoute('my-reimbursements', 'Reintegros', 'receipt_long', '/reimbursements');
      }
      if (hasShopPermission(user, shopId, 'stock.read')) {
        pushRoute('stock', 'Alimentos', 'inventory', '/stock');
      }
      if (hasShopPermission(user, shopId, 'beverageStock.read')) {
        pushRoute('beverage-stock', 'Bebidas', 'local_bar', '/beverage-stock');
      }
      if (hasShopPermission(user, shopId, 'shortages.read')) {
        pushRoute('shortages', 'Faltantes', 'error_outline', '/shortages');
      }
      if (cfg?.custom?.length) {
        const seen = new Set(items.map((i) => i.id));
        const features = this.routeFeatures();
        for (const c of cfg.custom) {
          if (!c?.id || !c.route || seen.has(c.id)) continue;
          if (!canAccessCustomRoute(c.route, user, shopId, { features })) continue;
          seen.add(c.id);
          pushRoute(c.id, c.label, c.icon || 'bolt', c.route);
        }
      }
      return applyToolbarConfig(items, cfg);
    }

    if (hasShopPermission(user, shopId, 'expenses.manage')) {
      const qe = TOOLBAR_QUICK_ACTION_DEFS.find((d) => d.id === 'quick-expense')!;
      items.push({
        id: 'quick-expense',
        kind: 'action',
        label: qe.label,
        icon: qe.icon,
      });
    }
    if (canViewClosingsList(user, shopId)) {
      const d = TOOLBAR_QUICK_ACTION_DEFS.find((x) => x.id === 'closings')!;
      pushRoute('closings', d.label, d.icon, '/closings');
    }
    if (hasShopPermission(user, shopId, 'shortages.read')) {
      const d = TOOLBAR_QUICK_ACTION_DEFS.find((x) => x.id === 'shortages')!;
      pushRoute('shortages', d.label, d.icon, '/shortages');
    }
    if (hasShopPermission(user, shopId, 'payments.read')) {
      const d = TOOLBAR_QUICK_ACTION_DEFS.find((x) => x.id === 'payments')!;
      pushRoute('payments', d.label, d.icon, '/g/pagos');
    }
    if (shop?.reservationsEnabled && hasShopPermission(user, shopId, 'reservations.read')) {
      const d = TOOLBAR_QUICK_ACTION_DEFS.find((x) => x.id === 'reservations')!;
      pushRoute('reservations', d.label, d.icon, '/reservations');
    }
    if (shop?.waitingListEnabled && hasShopPermission(user, shopId, 'waitingList.read')) {
      const d = TOOLBAR_QUICK_ACTION_DEFS.find((x) => x.id === 'waiting-list')!;
      pushRoute('waiting-list', d.label, d.icon, '/waiting-list');
    }
    if (shop?.tipsEnabled && hasShopPermission(user, shopId, 'tips.read')) {
      const d = TOOLBAR_QUICK_ACTION_DEFS.find((x) => x.id === 'tips')!;
      pushRoute('tips', d.label, d.icon, '/tips');
    }
    if (hasShopPermission(user, shopId, 'closings.create')) {
      const d = TOOLBAR_QUICK_ACTION_DEFS.find((x) => x.id === 'new-closing')!;
      pushRoute('new-closing', d.label, d.icon, '/closings/new');
    }
    if (hasShopPermission(user, shopId, 'reimbursements.self')) {
      const d = TOOLBAR_QUICK_ACTION_DEFS.find((x) => x.id === 'my-hours')!;
      pushRoute('my-hours', d.label, d.icon, '/my-production');
    }
    if (
      hasShopPermission(user, shopId, 'reimbursements.self') ||
      hasShopPermission(user, shopId, 'reimbursements.read')
    ) {
      const d = TOOLBAR_QUICK_ACTION_DEFS.find((x) => x.id === 'my-reimbursements')!;
      pushRoute('my-reimbursements', d.label, d.icon, '/reimbursements');
    }
    if (hasShopPermission(user, shopId, 'stock.read')) {
      const d = TOOLBAR_QUICK_ACTION_DEFS.find((x) => x.id === 'stock')!;
      pushRoute('stock', d.label, d.icon, '/stock');
    }
    if (hasShopPermission(user, shopId, 'beverageStock.read')) {
      const d = TOOLBAR_QUICK_ACTION_DEFS.find((x) => x.id === 'beverage-stock')!;
      pushRoute('beverage-stock', d.label, d.icon, '/beverage-stock');
    }

    if (cfg?.custom?.length) {
      const seen = new Set(items.map((i) => i.id));
      const features = this.routeFeatures();
      for (const c of cfg.custom) {
        if (!c?.id || !c.route || seen.has(c.id)) continue;
        if (!canAccessCustomRoute(c.route, user, shopId, { features })) continue;
        seen.add(c.id);
        pushRoute(c.id, c.label, c.icon || 'bolt', c.route);
      }
    }

    return applyToolbarConfig(items, cfg);
  });

  /** true cuando hay un solo atajo: botón con nombre en vez de ícono. */
  readonly singleQuickAction = computed(() => {
    const all = this.quickActions();
    return all.length === 1 ? all[0]! : null;
  });

  /**
   * Cuántos accesos caben en la barra según el ancho libre medido.
   * A más espacio → más botones en la toolbar; el resto va al menú.
   */
  readonly inlineQuickLimit = computed(() => {
    const all = this.quickActions().length;
    if (!all) return 0;
    // Un solo atajo: siempre inline (botón con nombre), también en móvil.
    if (all === 1) return 1;
    if (this.isMobile()) return 0;
    const avail = this.availableQuickWidth();
    if (avail < QUICK_BTN) return 0;

    const slot = QUICK_BTN + QUICK_GAP;
    // Slots que entran (el +GAP compensa el gap “fantasma” del último).
    const maxSlots = Math.floor((avail + QUICK_GAP) / slot);
    if (maxSlots >= all) return all;
    // Reservar 1 slot para el botón "Más".
    return Math.max(0, Math.min(all - 1, maxSlots - 1));
  });

  readonly inlineQuickActions = computed(() =>
    this.quickActions().slice(0, this.inlineQuickLimit()),
  );

  readonly menuQuickActions = computed(() =>
    this.quickActions().slice(this.inlineQuickLimit()),
  );

  constructor() {
    afterNextRender(() => this.bindQuickSpaceObserver());

    effect(() => {
      this.quickActions();
      this.isMobile();
      this.user();
      this.inlineQuickLimit();
      queueMicrotask(() => this.measureQuickSpace());
    });

    this.loadNotifs$
      .pipe(
        switchMap(({ showSpinner }) => {
          if (showSpinner) this.loadingNotifs.set(true);
          const shopId = this.shopContext.selectedShopId();
          return this.notificationsApi.list(shopId).pipe(
            timeout({ first: 12_000 }),
            catchError(() => of(null as AppNotification[] | null)),
            finalize(() => this.loadingNotifs.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((rows) => {
        if (!rows) return;
        this.notifications.set(rows);
      });

    if (typeof document !== 'undefined') {
      const onVis = () => {
        if (document.visibilityState !== 'visible' || !this.auth.getToken()) return;
        // Precarga al volver: el panel no arranca en blanco si la red tarda.
        this.loadNotifs$.next({ showSpinner: false });
      };
      document.addEventListener('visibilitychange', onVis);
      this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVis));
    }
  }

  ngOnInit(): void {
    this.notifsInbox.ensureStarted();
    this.notifsInbox.refresh();
    void this.push.refreshStatus().then(() => this.push.promptEnableIfNeeded());
    // Lista en caché para que la campana no arranque en “Cargando…”.
    this.loadNotifs$.next({ showSpinner: false });
  }

  private bindQuickSpaceObserver(): void {
    if (typeof ResizeObserver === 'undefined') {
      this.measureQuickSpace();
      return;
    }
    const root = this.host.nativeElement.querySelector('.toolbar');
    if (!(root instanceof HTMLElement)) return;

    const ro = new ResizeObserver(() => {
      this.measureQuickSpace();
      // Segunda pasada tras pintar botones nuevos.
      requestAnimationFrame(() => this.measureQuickSpace());
    });
    ro.observe(root);
    const actions = root.querySelector('.toolbar-actions');
    if (actions instanceof HTMLElement) ro.observe(actions);
    this.destroyRef.onDestroy(() => ro.disconnect());
    this.measureQuickSpace();
  }

  private measureQuickSpace(): void {
    const root = this.host.nativeElement.querySelector('.toolbar');
    if (!(root instanceof HTMLElement)) return;

    const menu = root.querySelector('.toolbar-menu') as HTMLElement | null;
    const brand = root.querySelector('.toolbar-brand') as HTMLElement | null;
    const actions = root.querySelector('.toolbar-actions') as HTMLElement | null;

    const style = getComputedStyle(root);
    const gap = Number.parseFloat(style.columnGap || style.gap || '8') || 8;
    const pad =
      (Number.parseFloat(style.paddingLeft) || 0) +
      (Number.parseFloat(style.paddingRight) || 0);

    const visibleWidth = (el: HTMLElement | null) => {
      if (!el) return 0;
      if (getComputedStyle(el).display === 'none') return 0;
      return el.getBoundingClientRect().width;
    };

    // No restamos el bloque quick actual: medimos el hueco real disponible.
    const used =
      visibleWidth(menu) +
      visibleWidth(brand) +
      visibleWidth(actions) +
      pad;

    // Gaps fijos aprox: menu↔brand, brand↔quick, quick↔spacer, spacer↔actions
    const reservedGaps = gap * 3;
    const avail = root.clientWidth - used - reservedGaps - MIN_SPACER;
    const next = Math.max(0, Math.floor(avail));
    if (next !== this.availableQuickWidth()) {
      this.availableQuickWidth.set(next);
    }
  }

  badgeLabel(count: number): string {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n > 9) return '9+';
    return String(n);
  }

  roleLabel(user?: ToolbarUser | null): string {
    return userRoleLabel(user?.globalRole ?? user?.role);
  }

  displayName(user: ToolbarUser): string {
    const name = user.fullName?.trim();
    return name || user.email;
  }

  closeUserMenu(): void {
    this.userTrigger()?.closeMenu();
  }

  canCustomizeProfile(): boolean {
    return canCustomizeLayout(this.auth.currentUser(), this.shopContext.selectedShopId());
  }

  setMode(mode: ThemeMode): void {
    this.theme.setMode(mode);
  }

  onPrimaryInput(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this.theme.setPrimary(value);
  }

  onAccentInput(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this.theme.setAccent(value);
  }

  logoSrc(): string {
    return this.shopContext.logoUrl();
  }

  logoAlt(): string {
    return this.shopContext.selectedShop()?.name || this.brand.productName;
  }

  onLogoRefresh(): void {
    const home = defaultHomeRoute(this.auth.currentUser(), this.shopContext.selectedShopId());
    const path = this.router.url.split('?')[0];
    const atHome =
      path === home || ((home === '/' || home === '') && (path === '/' || path === ''));
    if (!atHome) {
      void this.router.navigateByUrl(home);
      return;
    }
    if (!this.pageRefresh.hasHandler() || this.pageRefresh.refreshing()) return;
    void this.pageRefresh.refresh();
  }

  onQuickAction(item: ToolbarQuickAction): void {
    if (item.kind !== 'action') return;
    if (item.id === 'quick-expense') this.openQuickExpense();
  }

  /** Rutas que un productor-only puede abrir (custom). */
  private routeFeatures(): ShopRouteFeatures {
    const shop = this.shopContext.selectedShop();
    return {
      reservationsEnabled: shop?.reservationsEnabled,
      waitingListEnabled: shop?.waitingListEnabled,
      tipsEnabled: shop?.tipsEnabled,
      settlementsEnabled: shop?.settlementsEnabled,
    };
  }

  openQuickExpense(): void {
    const shopId = this.shopContext.selectedShopId();
    if (
      !shopId ||
      !hasShopPermission(this.auth.currentUser(), shopId, 'expenses.manage')
    ) {
      return;
    }
    this.dialogTitle
      .track(
        this.dialog.open(QuickExpenseDialogComponent, {
          width: '440px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            shopId,
            shopName: this.shopContext.selectedShop()?.name ?? 'Local',
            kind: 'expense' as const,
          },
        }),
        'Gasto rápido',
      )
      .afterClosed()
      .subscribe((saved) => {
        if (saved && this.pageRefresh.hasHandler()) {
          void this.pageRefresh.refresh();
        }
      });
  }

  openNotifications(): void {
    void this.push.refreshStatus();
    // Badge se limpia al abrir; los ítems siguen no leídos hasta click / marcar todas.
    this.notifsInbox.clearBadgeLocal();
    this.markPanelSeen();
    this.loadNotifs$.next({
      showSpinner: this.notifications().length === 0,
    });
  }

  setNotifFilter(filter: 'all' | 'unread'): void {
    this.notifFilter.set(filter);
    this.notifMenuOpen.set(false);
  }

  toggleNotifActions(ev?: Event): void {
    ev?.stopPropagation();
    this.notifMenuOpen.update((open) => !open);
  }

  closeNotifActions(): void {
    this.notifMenuOpen.set(false);
  }

  notifTime(n: AppNotification): string {
    return notifRelativeTime(n.createdAt);
  }

  async togglePush(): Promise<void> {
    if (this.push.busy()) return;
    if (this.push.subscribed()) {
      await this.push.disable();
      this.snack.open('Notificaciones push desactivadas', 'OK', { duration: 2500 });
      return;
    }
    const ok = await this.push.enable();
    if (ok) {
      this.snack.open('Notificaciones push activadas', 'OK', { duration: 2500 });
    } else {
      this.snack.open(this.push.lastError() || 'No se pudo activar push', 'OK', {
        duration: 4500,
      });
    }
  }

  /** Marca vistas (badge) sin tocar leídas. */
  private markPanelSeen(): void {
    this.notificationsApi.markSeen(this.shopContext.selectedShopId()).subscribe({
      next: () => {
        this.notifications.update((rows) =>
          rows.map((n) => (n.seen ? n : { ...n, seen: true })),
        );
        this.notifsInbox.refresh();
      },
    });
  }

  markAllRead(): void {
    this.notifMenuOpen.set(false);
    this.notificationsApi.markAllRead(this.shopContext.selectedShopId()).subscribe({
      next: () => {
        this.notifications.update((rows) =>
          rows.map((n) => ({ ...n, read: true, seen: true })),
        );
        this.notifsInbox.refresh();
        this.snack.open('Notificaciones marcadas como leídas', 'OK', { duration: 2000 });
      },
    });
  }

  /** Marca leída sin navegar (como el ⋯ de Facebook). */
  markOneRead(n: AppNotification, ev: Event): void {
    ev.stopPropagation();
    ev.preventDefault();
    if (n.read) return;
    this.notificationsApi.markRead(n.id).subscribe({
      next: () => {
        this.notifications.update((rows) =>
          rows.map((x) =>
            x.id === n.id ? { ...x, read: true, seen: true } : x,
          ),
        );
        this.notifsInbox.refresh();
      },
    });
  }

  openNotification(n: AppNotification): void {
    this.notifMenuOpen.set(false);
    this.notifTrigger()?.closeMenu();
    if (!n.read) {
      this.notificationsApi.markRead(n.id).subscribe({
        next: () => {
          this.notifications.update((rows) =>
            rows.map((x) =>
              x.id === n.id ? { ...x, read: true, seen: true } : x,
            ),
          );
          this.notifsInbox.refresh();
        },
      });
    }
    if (n.shopId && n.shopId !== this.shopContext.selectedShopId()) {
      this.shopContext.selectShop(n.shopId);
    }
    const link = notificationRouterLink(n);
    void this.router.navigate(link.commands, { queryParams: link.queryParams });
  }

  notifIcon(type: string): string {
    return notificationIcon(type);
  }

  notifTone(type: string): string {
    return notificationToneClass(type);
  }
}
