import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { filter, map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import {
  canManageShop,
  canManageShopUsers,
  defaultHomeRoute,
  hasShopPermission,
  isCashierOnly,
  isClosingsCreateOnly,
  isProducerOnly,
  canViewClosingsList,
} from '../auth/auth.models';
import { canAccessAppRoute } from '../auth/route-access';
import { ToolbarComponent } from './toolbar/toolbar';
import { SidebarComponent, NavItem } from './sidebar/sidebar';
import { ShopContextService } from '../shop/shop-context.service';
import { PageRefreshService } from '../page-refresh.service';
import { PullToRefreshComponent } from '../../shared/components/pull-to-refresh';
import { BodyScrollLockService } from '../../shared/services/body-scroll-lock.service';
import { PaymentsInboxService } from '../../features/payments/payments-inbox.service';
import { CashWithdrawalsInboxService } from '../../features/cash-withdrawals/cash-withdrawals-inbox.service';
import { SettlementsInboxService } from '../../features/settlements/settlements-inbox.service';
import { ReservationsInboxService } from '../../features/reservations/reservations-inbox.service';
import { TipsInboxService } from '../../features/tips/tips-inbox.service';
import { ReimbursementsInboxService } from '../../features/reimbursements/reimbursements-inbox.service';
import { applyNavConfig, effectiveNavConfig } from './nav-config';
import { MainPwaInstallBannerComponent } from '../../shared/components/main-pwa-install-banner';
import { MainPwaInstallService } from '../pwa/main-pwa-install.service';

const SIDENAV_EXPANDED_KEY = 'crc.sidenav.expanded';

function loadSidenavExpanded(): boolean {
  try {
    const v = localStorage.getItem(SIDENAV_EXPANDED_KEY);
    if (v === '0' || v === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

function saveSidenavExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(SIDENAV_EXPANDED_KEY, expanded ? '1' : '0');
  } catch {
    // ignore
  }
}

@Component({
  selector: 'app-main-layout',
  imports: [
    RouterOutlet,
    MatSidenavModule,
    MatProgressBarModule,
    ToolbarComponent,
    SidebarComponent,
    PullToRefreshComponent,
    MainPwaInstallBannerComponent,
  ],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
})
export class MainLayoutComponent {
  private readonly auth = inject(AuthService);
  private readonly shopContext = inject(ShopContextService);
  private readonly router = inject(Router);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly destroyRef = inject(DestroyRef);
  private readonly bodyLock = inject(BodyScrollLockService);
  private readonly paymentsInbox = inject(PaymentsInboxService);
  private readonly cashWithdrawalsInbox = inject(CashWithdrawalsInboxService);
  private readonly settlementsInbox = inject(SettlementsInboxService);
  private readonly reservationsInbox = inject(ReservationsInboxService);
  private readonly tipsInbox = inject(TipsInboxService);
  private readonly reimbursementsInbox = inject(ReimbursementsInboxService);
  private readonly mainPwa = inject(MainPwaInstallService);
  readonly pageRefresh = inject(PageRefreshService);

  readonly user = this.auth.currentUser;

  /** Lazy chunk / navegación en curso (con demora corta para no parpadear). */
  readonly routeLoading = signal(false);
  private routeLoadingTimer: ReturnType<typeof setTimeout> | null = null;

  readonly isMobile = toSignal(
    this.breakpointObserver
      .observe('(max-width: 960px)')
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  readonly sidenavOpen = signal(true);
  /** Desktop: menú ancho vs rail de iconos. Persistido en localStorage. */
  readonly sidenavExpanded = signal(loadSidenavExpanded());
  readonly currentUrl = signal(this.router.url);
  private readonly lastMobile = signal<boolean | null>(null);

  readonly navItems = computed((): NavItem[] => {
    const user = this.auth.currentUser();
    const shopId = this.shopContext.selectedShopId();
    if (isCashierOnly(user, shopId)) {
      const items: NavItem[] = [
        { label: 'Nuevo cierre', route: '/closings/new', icon: 'point_of_sale' },
      ];
      if (shopId && hasShopPermission(user, shopId, 'tips.read') && this.shopFeature('tips')) {
        items.push({
          label: 'Propinas',
          route: '/tips',
          icon: 'volunteer_activism',
          badge: this.tipsInbox.pendingCount() || null,
        });
      }
      return items;
    }
    if (isProducerOnly(user, shopId)) {
      const items: NavItem[] = [
        { label: 'Mis horas', route: '/my-production', icon: 'restaurant' },
      ];
      if (shopId && hasShopPermission(user, shopId, 'reimbursements.self')) {
        items.push({ label: 'Mis reintegros', route: '/reimbursements', icon: 'receipt_long' });
      }
      const stockChildren: NonNullable<NavItem['children']> = [];
      if (shopId && hasShopPermission(user, shopId, 'stock.read')) {
        stockChildren.push({ label: 'Alimentos', route: '/stock', icon: 'inventory' });
      }
      if (shopId && hasShopPermission(user, shopId, 'beverageStock.read')) {
        stockChildren.push({ label: 'Bebidas', route: '/beverage-stock', icon: 'local_bar' });
      }
      if (shopId && hasShopPermission(user, shopId, 'shortages.read')) {
        stockChildren.push({ label: 'Faltantes', route: '/shortages', icon: 'report' });
      }
      if (shopId && hasShopPermission(user, shopId, 'orders.read')) {
        stockChildren.push({ label: 'Pedidos', route: '/orders', icon: 'local_shipping' });
      }
      if (stockChildren.length) {
        items.push({
          label: 'Stock',
          route: '__group_stock',
          icon: 'inventory_2',
          defaultRoute: stockChildren.find((c) => c.route === '/stock')?.route ?? stockChildren[0]?.route,
          children: stockChildren,
        });
      }
      return items;
    }

    const items: NavItem[] = [
      { label: 'Inicio', route: '/', icon: 'home', exact: true },
    ];

    const operacion: NonNullable<NavItem['children']> = [];
    if (
      shopId &&
      isClosingsCreateOnly(user, shopId) &&
      hasShopPermission(user, shopId, 'closings.create')
    ) {
      operacion.push({ label: 'Nuevo cierre', route: '/closings/new', icon: 'point_of_sale' });
    } else if (shopId && canViewClosingsList(user, shopId)) {
      operacion.push({ label: 'Cierres', route: '/closings', icon: 'point_of_sale' });
    }
    if (shopId && hasShopPermission(user, shopId, 'cashWithdrawals.read')) {
      operacion.push({
        label: 'A Retirar',
        route: '/cash-withdrawals',
        icon: 'payments',
        badge: this.cashWithdrawalsInbox.pendingCount() || null,
      });
    }
    if (shopId && hasShopPermission(user, shopId, 'settlements.read') && this.settlementsInbox.enabled()) {
      operacion.push({
        label: 'Rendiciones',
        route: '/settlements',
        icon: 'account_balance_wallet',
        badge: this.settlementsInbox.pendingCount() || null,
      });
    }
    if (shopId && hasShopPermission(user, shopId, 'tips.read') && this.shopFeature('tips')) {
      operacion.push({
        label: 'Propinas',
        route: '/tips',
        icon: 'volunteer_activism',
        badge: this.tipsInbox.pendingCount() || null,
        badgeInGroup: false,
      });
    }
    if (shopId && hasShopPermission(user, shopId, 'serviceRules.read')) {
      operacion.push({
        label: 'Normas de servicio',
        route: '/service-rules',
        icon: 'menu_book',
      });
    }
    if (operacion.length) {
      items.push({
        label: 'Operación',
        route: '__group_operacion',
        icon: 'today',
        defaultRoute: operacion.find((c) => c.route === '/closings')?.route ?? operacion[0]?.route,
        children: operacion,
      });
    }

    const cuentas: NonNullable<NavItem['children']> = [];
    if (shopId && hasShopPermission(user, shopId, 'expenses.read')) {
      cuentas.push({ label: 'Gastos', route: '/expenses', icon: 'payments' });
    }
    if (shopId && hasShopPermission(user, shopId, 'incomes.read')) {
      cuentas.push({ label: 'Ingresos', route: '/incomes', icon: 'south_west' });
    }
    if (shopId && hasShopPermission(user, shopId, 'accountTransfers.read')) {
      cuentas.push({
        label: 'Movimientos entre cuentas',
        route: '/account-transfers',
        icon: 'swap_horiz',
      });
    }
    if (
      shopId &&
      (hasShopPermission(user, shopId, 'expenses.read') ||
        hasShopPermission(user, shopId, 'incomes.read') ||
        hasShopPermission(user, shopId, 'accountTransfers.read'))
    ) {
      cuentas.push({
        label: 'Transacciones',
        route: '/transactions',
        icon: 'receipt_long',
      });
    }
    if (shopId && hasShopPermission(user, shopId, 'partnerSplits.read')) {
      cuentas.push({
        label: 'División de socios',
        route: '/partner-splits',
        icon: 'groups',
      });
      cuentas.push({
        label: 'Divisiones',
        route: '/splits',
        icon: 'history',
      });
    }
    if (cuentas.length) {
      items.push({
        label: 'Cuentas',
        route: '__group_cuentas',
        icon: 'account_balance',
        defaultRoute: cuentas[0]?.route,
        children: cuentas,
      });
    }

    const salon: NonNullable<NavItem['children']> = [];
    if (shopId && hasShopPermission(user, shopId, 'reservations.read') && this.shopFeature('reservations')) {
      salon.push({
        label: 'Reservas',
        route: '/reservations',
        icon: 'table_restaurant',
        badge: this.reservationsInbox.menuBadge() || null,
        badgeInGroup: false,
      });
    }
    if (shopId && hasShopPermission(user, shopId, 'waitingList.read') && this.shopFeature('waitingList')) {
      salon.push({ label: 'Lista de espera', route: '/waiting-list', icon: 'hourglass_top' });
    }
    if (shopId && hasShopPermission(user, shopId, 'reservations.read') && this.shopFeature('reservations')) {
      salon.push({ label: 'Diagrama', route: '/salon/diagrama', icon: 'grid_view' });
      salon.push({ label: 'Reglas', route: '/salon/reglas', icon: 'tune' });
      salon.push({ label: 'Horarios', route: '/salon/horarios', icon: 'schedule' });
    }
    if (salon.length) {
      items.push({
        label: 'Salón',
        route: '__group_salon',
        icon: 'table_restaurant',
        defaultRoute: salon.find((c) => c.route === '/reservations')?.route ?? salon[0]?.route,
        children: salon,
        badge: this.reservationsInbox.menuBadge() || null,
        badgeInGroup: false,
      });
    }

    const stockChildren: NonNullable<NavItem['children']> = [];
    if (shopId && hasShopPermission(user, shopId, 'stock.read')) {
      stockChildren.push({ label: 'Alimentos', route: '/stock', icon: 'inventory' });
    }
    if (shopId && hasShopPermission(user, shopId, 'beverageStock.read')) {
      stockChildren.push({ label: 'Bebidas', route: '/beverage-stock', icon: 'local_bar' });
    }
    if (shopId && hasShopPermission(user, shopId, 'shortages.read')) {
      stockChildren.push({ label: 'Faltantes', route: '/shortages', icon: 'report' });
    }
    if (shopId && hasShopPermission(user, shopId, 'orders.read')) {
      stockChildren.push({ label: 'Pedidos', route: '/orders', icon: 'local_shipping' });
    }
    if (stockChildren.length) {
      items.push({
        label: 'Stock',
        route: '__group_stock',
        icon: 'inventory_2',
        defaultRoute: stockChildren.find((c) => c.route === '/stock')?.route ?? stockChildren[0]?.route,
        children: stockChildren,
      });
    }

    if (shopId && hasShopPermission(user, shopId, 'attendance.read')) {
      items.push({
        label: 'Asistencia',
        route: '__group_asistencia',
        icon: 'event_available',
        defaultRoute: '/attendance',
        children: [
          { label: 'Servicio', route: '/attendance', icon: 'storefront' },
          { label: 'Produccion', route: '/production-attendance', icon: 'restaurant' },
        ],
      });
    } else if (shopId && hasShopPermission(user, shopId, 'attendance.self')) {
      items.push({
        label: 'Mis horas',
        route: '/my-production',
        icon: 'restaurant',
      });
    }
    if (
      shopId &&
      hasShopPermission(user, shopId, 'reimbursements.self') &&
      !hasShopPermission(user, shopId, 'reimbursements.read') &&
      !isProducerOnly(user, shopId)
    ) {
      items.push({
        label: 'Mis reintegros',
        route: '/reimbursements',
        icon: 'receipt_long',
      });
    }

    const pagos: NonNullable<NavItem['children']> = [];
    if (shopId && hasShopPermission(user, shopId, 'payments.read')) {
      pagos.push({
        label: 'A proveedores',
        route: '/payments/suppliers',
        icon: 'local_shipping',
        badge: this.paymentsInbox.pendingSupplierCount() || null,
      });
      pagos.push({
        label: 'A servicios',
        route: '/payments/services',
        icon: 'home_repair_service',
        badge: this.paymentsInbox.pendingServiceCount() || null,
      });
      pagos.push({
        label: 'A empleados',
        route: '/payments/employees',
        icon: 'badge',
        badge: this.paymentsInbox.pendingEmployeeCount() || null,
      });
      pagos.push({
        label: 'A socios',
        route: '/payments/partners',
        icon: 'groups',
        badge: this.paymentsInbox.pendingPartnerCount() || null,
      });
    }
    if (shopId && hasShopPermission(user, shopId, 'suppliers.read')) {
      pagos.push({ label: 'Proveedores', route: '/suppliers', icon: 'inventory_2' });
    }
    if (shopId && hasShopPermission(user, shopId, 'services.read')) {
      pagos.push({ label: 'Servicios', route: '/services', icon: 'home_repair_service' });
    }
    if (pagos.length) {
      items.push({
        label: 'Pagos',
        route: '__group_pagos',
        icon: 'payments',
        defaultRoute:
          pagos.find((c) => c.route === '/payments/suppliers')?.route ?? pagos[0]?.route,
        children: pagos,
      });
    }

    if (shopId && hasShopPermission(user, shopId, 'reports.view')) {
      items.push({
        label: 'Reportes',
        route: '__group_reportes',
        icon: 'insights',
        defaultRoute: '/reports',
        children: [
          { label: 'Cierres', route: '/reports', icon: 'insights' },
          { label: 'Conceptos', route: '/reports/concepts', icon: 'category' },
          { label: 'Ventas POS', route: '/reports/products', icon: 'restaurant_menu' },
          { label: 'Estadísticas', route: '/reports/stats', icon: 'analytics' },
        ],
      });
    }

    const personal: NonNullable<NavItem['children']> = [];
    if (shopId && hasShopPermission(user, shopId, 'employees.read')) {
      personal.push({ label: 'Empleados', route: '/employees', icon: 'badge' });
    }
    if (shopId && hasShopPermission(user, shopId, 'vacations.read')) {
      personal.push({ label: 'Vacaciones', route: '/vacations', icon: 'beach_access' });
    }
    if (shopId && hasShopPermission(user, shopId, 'candidates.read')) {
      personal.push({ label: 'CVs / Candidatos', route: '/candidates', icon: 'person_search' });
    }
    if (shopId && hasShopPermission(user, shopId, 'payroll.read')) {
      personal.push({ label: 'Sueldos', route: '/salaries', icon: 'request_quote' });
    }
    if (shopId && hasShopPermission(user, shopId, 'commissions.read')) {
      personal.push({ label: 'Comisiones', route: '/commissions', icon: 'percent' });
    }
    if (
      shopId &&
      (hasShopPermission(user, shopId, 'reimbursements.read') ||
        hasShopPermission(user, shopId, 'reimbursements.manage'))
    ) {
      personal.push({
        label: 'Reintegros',
        route: '/reimbursements',
        icon: 'receipt_long',
        badge: this.reimbursementsInbox.pendingCount() || null,
      });
    }
    if (personal.length) {
      items.push({
        label: 'Personal',
        route: '__group_personal',
        icon: 'groups',
        defaultRoute: personal.find((c) => c.route === '/employees')?.route ?? personal[0]?.route,
        children: personal,
      });
    }

    const admin: NonNullable<NavItem['children']> = [];
    if (this.auth.isSuperAdmin()) {
      admin.push({ label: 'Locales', route: '/admin/shops', icon: 'store' });
    }
    if (shopId && canManageShop(user, shopId)) {
      admin.push({ label: 'Configuración del local', route: '/admin/shop', icon: 'storefront' });
      admin.push({ label: 'Mensajes', route: '/admin/messages', icon: 'mail' });
      admin.push({ label: 'Carta', route: '/admin/menu', icon: 'menu_book' });
      admin.push({ label: 'QR', route: '/admin/qr', icon: 'qr_code_2' });
      admin.push({ label: 'Instrucciones', route: '/admin/instrucciones', icon: 'help_outline' });
    }
    if (canManageShopUsers(user, shopId) && (shopId || this.auth.isAdmin())) {
      admin.push({ label: 'Usuarios', route: '/admin/users', icon: 'group' });
      admin.push({ label: 'Actividad', route: '/admin/user-activity', icon: 'leaderboard' });
    }
    if (shopId && hasShopPermission(user, shopId, 'accounts.manage')) {
      admin.push({ label: 'Cuentas', route: '/admin/accounts', icon: 'account_balance' });
    }
    if (shopId && hasShopPermission(user, shopId, 'concepts.manage')) {
      admin.push({ label: 'Conceptos', route: '/admin/concepts', icon: 'sell' });
    }
    if (shopId && canManageShop(user, shopId)) {
      admin.push({ label: 'Sistemas', route: '/admin/sales-systems', icon: 'dns' });
      admin.push({ label: 'Platos y rubros', route: '/admin/pos-products', icon: 'restaurant_menu' });
    }
    if (admin.length) {
      const adminDefault =
        admin.find((c) => c.route === '/admin/shop')?.route ?? admin[0]?.route;
      items.push({
        label: 'Administración',
        route: '__group_admin',
        icon: 'settings',
        defaultRoute: adminDefault,
        children: admin,
      });
    }

    return applyNavConfig(items, effectiveNavConfig(this.shopContext.selectedShop()));
  });

  readonly isCashierLayout = computed(() =>
    isCashierOnly(this.auth.currentUser(), this.shopContext.selectedShopId()),
  );

  constructor() {
    this.mainPwa.start();

    effect(() => {
      const mobile = this.isMobile();
      const prev = this.lastMobile();
      if (prev === mobile) return;
      this.lastMobile.set(mobile);
      // Desktop: drawer siempre abierto (rail o expandido). Mobile: overlay cerrado al entrar.
      this.sidenavOpen.set(!mobile);
    });

    // En móvil, con el drawer abierto: bloquear scroll de la página detrás
    // (si no, el gesto a veces scrollea el contenido y no la sidebar).
    effect(() => {
      if (typeof document === 'undefined') return;
      const lock = !!this.isMobile() && this.sidenavOpen();
      if (lock) this.bodyLock.lock('sidenav');
      else this.bodyLock.unlock('sidenav');
    });

    this.destroyRef.onDestroy(() => {
      this.bodyLock.unlock('sidenav');
      if (this.routeLoadingTimer) clearTimeout(this.routeLoadingTimer);
    });

    // Si la ruta actual no está permitida, ir al home del rol
    effect(() => {
      const user = this.auth.currentUser();
      const shopId = this.shopContext.selectedShopId();
      const path = this.currentUrl().split('?')[0];
      if (!user) return;
      const home = defaultHomeRoute(user, shopId);
      if (!shopId) {
        const allowedWithoutShop =
          path === '/' ||
          path === '' ||
          (path.startsWith('/admin/shops') && this.auth.isSuperAdmin()) ||
          (path.startsWith('/admin/users') && this.auth.isAdmin());
        if (!allowedWithoutShop && path !== '/login') {
          void this.router.navigateByUrl(home);
        }
        return;
      }
      if (isCashierOnly(user, shopId)) {
        const allowed =
          path.startsWith('/closings/new') ||
          path === '/profile' ||
          (path.startsWith('/tips') &&
            hasShopPermission(user, shopId, 'tips.read') &&
            this.shopFeature('tips'));
        if (!allowed) {
          void this.router.navigateByUrl(home);
        }
        return;
      }
      if (isProducerOnly(user, shopId)) {
        const allowed =
          path === '/my-production' ||
          (path.startsWith('/reimbursements') &&
            hasShopPermission(user, shopId, 'reimbursements.self')) ||
          (path === '/stock' && hasShopPermission(user, shopId, 'stock.read')) ||
          (path === '/beverage-stock' &&
            hasShopPermission(user, shopId, 'beverageStock.read')) ||
          (path.startsWith('/shortages') &&
            hasShopPermission(user, shopId, 'shortages.read')) ||
          (path.startsWith('/orders') && hasShopPermission(user, shopId, 'orders.read'));
        if (!allowed) {
          void this.router.navigateByUrl(home);
        }
        return;
      }
      if (isClosingsCreateOnly(user, shopId)) {
        const onList = path === '/closings' || path === '/closings/';
        if (onList) {
          void this.router.navigateByUrl('/closings/new');
          return;
        }
      }
      if (path === '/' || path === '') return;
      if (!this.isPathAllowed(path, user, shopId)) {
        void this.router.navigateByUrl(home);
      }
    });

    this.applyShopFromUrl(this.router.url);
    effect(() => {
      this.shopContext.shops();
      untracked(() => this.applyShopFromUrl(this.router.url));
    });
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.currentUrl.set(e.urlAfterRedirects);
        this.applyShopFromUrl(e.urlAfterRedirects);
      });

    this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart) {
        if (this.routeLoadingTimer) clearTimeout(this.routeLoadingTimer);
        this.routeLoadingTimer = setTimeout(() => this.routeLoading.set(true), 120);
        return;
      }
      if (
        e instanceof NavigationEnd ||
        e instanceof NavigationCancel ||
        e instanceof NavigationError
      ) {
        if (this.routeLoadingTimer) {
          clearTimeout(this.routeLoadingTimer);
          this.routeLoadingTimer = null;
        }
        this.routeLoading.set(false);
      }
    });
  }

  private applyShopFromUrl(url: string): void {
    try {
      const shop = this.router.parseUrl(url).queryParams['shop'];
      const id = typeof shop === 'string' ? shop.trim() : '';
      if (id) this.shopContext.selectShop(id);
    } catch {
      // ignore
    }
  }

  private isPathAllowed(path: string, user: NonNullable<ReturnType<AuthService['currentUser']>>, shopId: string): boolean {
    const shop = this.shopContext.selectedShop();
    return canAccessAppRoute(path, user, shopId, {
      features: {
        reservationsEnabled: shop?.reservationsEnabled,
        waitingListEnabled: shop?.waitingListEnabled,
        tipsEnabled: shop?.tipsEnabled,
        settlementsEnabled:
          this.settlementsInbox.enabled() || !!shop?.settlementsEnabled,
      },
      navConfig: effectiveNavConfig(shop),
    });
  }

  toggleSidenav(): void {
    if (this.isMobile()) {
      this.sidenavOpen.update((open) => !open);
      return;
    }
    this.sidenavExpanded.update((expanded) => {
      const next = !expanded;
      saveSidenavExpanded(next);
      return next;
    });
    // Asegurar que el drawer siga abierto en desktop (modo rail).
    this.sidenavOpen.set(true);
  }

  expandSidenav(): void {
    if (this.isMobile()) return;
    if (this.sidenavExpanded()) return;
    this.sidenavExpanded.set(true);
    saveSidenavExpanded(true);
    this.sidenavOpen.set(true);
  }

  onSidenavOpenedChange(opened: boolean): void {
    if (this.isMobile()) {
      this.sidenavOpen.set(opened);
      return;
    }
    // Desktop: no dejar cerrar el drawer; el toggle solo colapsa a rail.
    if (!opened) {
      this.sidenavOpen.set(true);
      this.sidenavExpanded.set(false);
      saveSidenavExpanded(false);
      return;
    }
    this.sidenavOpen.set(true);
  }

  closeSidenavOnNavigate(): void {
    if (this.isMobile()) {
      this.sidenavOpen.set(false);
    }
  }

  private shopFeature(feature: 'reservations' | 'waitingList' | 'tips'): boolean {
    const shop = this.shopContext.selectedShop();
    if (!shop) return false;
    if (feature === 'reservations') return !!shop.reservationsEnabled;
    if (feature === 'waitingList') return !!shop.waitingListEnabled;
    return !!shop.tipsEnabled;
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
