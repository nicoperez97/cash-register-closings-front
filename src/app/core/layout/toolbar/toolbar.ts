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
  map,
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
  isProducerOnly,
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

const QUICK_BTN = 38;
const QUICK_GAP = 6;
/** Espacio mínimo del spacer (no comerse el layout). */
const MIN_SPACER = 12;

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

  /** Recarga la lista; cancela un pedido anterior (p. ej. colgado al volver de background). */
  private readonly loadNotifs$ = new Subject<{ markRead: boolean; showSpinner: boolean }>();

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
      items.push({
        id: 'quick-expense',
        kind: 'action',
        label: 'Gasto rápido',
        icon: 'payments',
      });
    }
    if (
      hasShopPermission(user, shopId, 'closings.read') ||
      hasShopPermission(user, shopId, 'closings.create')
    ) {
      pushRoute('closings', 'Cierres', 'point_of_sale', '/closings');
    }
    if (hasShopPermission(user, shopId, 'shortages.read')) {
      pushRoute('shortages', 'Faltantes', 'error_outline', '/shortages');
    }
    if (hasShopPermission(user, shopId, 'payments.read')) {
      pushRoute('payments', 'Pagos', 'local_shipping', '/payments/suppliers');
    }
    if (shop?.reservationsEnabled && hasShopPermission(user, shopId, 'reservations.read')) {
      pushRoute('reservations', 'Reservas', 'table_restaurant', '/reservations');
    }
    if (shop?.waitingListEnabled && hasShopPermission(user, shopId, 'waitingList.read')) {
      pushRoute('waiting-list', 'Lista de espera', 'hourglass_top', '/waiting-list');
    }
    if (shop?.tipsEnabled && hasShopPermission(user, shopId, 'tips.read')) {
      pushRoute('tips', 'Propinas', 'volunteer_activism', '/tips');
    }
    if (hasShopPermission(user, shopId, 'closings.create')) {
      pushRoute('new-closing', 'Nuevo cierre', 'point_of_sale', '/closings/new');
    }
    if (hasShopPermission(user, shopId, 'reimbursements.self')) {
      pushRoute('my-hours', 'Mis horas', 'restaurant', '/my-production');
    }
    if (
      hasShopPermission(user, shopId, 'reimbursements.self') ||
      hasShopPermission(user, shopId, 'reimbursements.read')
    ) {
      pushRoute('my-reimbursements', 'Reintegros', 'receipt_long', '/reimbursements');
    }
    if (hasShopPermission(user, shopId, 'stock.read')) {
      pushRoute('stock', 'Alimentos', 'inventory', '/stock');
    }
    if (hasShopPermission(user, shopId, 'beverageStock.read')) {
      pushRoute('beverage-stock', 'Bebidas', 'local_bar', '/beverage-stock');
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
        switchMap(({ markRead, showSpinner }) => {
          if (showSpinner) this.loadingNotifs.set(true);
          const shopId = this.shopContext.selectedShopId();
          return this.notificationsApi.list(shopId).pipe(
            timeout({ first: 12_000 }),
            map((rows) => ({ rows, markRead })),
            catchError(() => of({ rows: null as AppNotification[] | null, markRead })),
            finalize(() => this.loadingNotifs.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ rows, markRead }) => {
        if (!rows) return;
        this.notifications.set(rows);
        if (markRead && (this.unreadCount() > 0 || rows.some((n) => !n.read))) {
          this.markAllRead(true);
        }
      });

    if (typeof document !== 'undefined') {
      const onVis = () => {
        if (document.visibilityState !== 'visible' || !this.auth.getToken()) return;
        // Precarga al volver: el panel no arranca en blanco si la red tarda.
        this.loadNotifs$.next({ markRead: false, showSpinner: false });
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
    this.loadNotifs$.next({ markRead: false, showSpinner: false });
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
    this.loadNotifs$.next({
      markRead: true,
      showSpinner: this.notifications().length === 0,
    });
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

  markAllRead(silent = false): void {
    this.notificationsApi.markAllRead(this.shopContext.selectedShopId()).subscribe({
      next: () => {
        this.notifications.update((rows) => rows.map((n) => ({ ...n, read: true })));
        this.notifsInbox.refresh();
        if (!silent) {
          this.snack.open('Notificaciones marcadas como leídas', 'OK', { duration: 2000 });
        }
      },
    });
  }

  openNotification(n: AppNotification): void {
    this.notifTrigger()?.closeMenu();
    if (!n.read) {
      this.notificationsApi.markRead(n.id).subscribe({
        next: () => {
          this.notifications.update((rows) =>
            rows.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
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
