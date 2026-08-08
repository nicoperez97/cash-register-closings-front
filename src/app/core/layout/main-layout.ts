import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
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
  isProducerOnly,
} from '../auth/auth.models';
import { ToolbarComponent } from './toolbar/toolbar';
import { SidebarComponent, NavItem } from './sidebar/sidebar';
import { BottomNavComponent, BottomNavItem } from './bottom-nav/bottom-nav';
import { ShopContextService } from '../shop/shop-context.service';
import { PageRefreshService } from '../page-refresh.service';
import { PullToRefreshComponent } from '../../shared/components/pull-to-refresh';
import { LoadingStateComponent } from '../../shared/components/loading-state';
import { BodyScrollLockService } from '../../shared/services/body-scroll-lock.service';
import { PaymentsInboxService } from '../../features/payments/payments-inbox.service';
import { CashWithdrawalsInboxService } from '../../features/cash-withdrawals/cash-withdrawals-inbox.service';
import { ReservationsInboxService } from '../../features/reservations/reservations-inbox.service';
import { MainPwaInstallBannerComponent } from '../../shared/components/main-pwa-install-banner';
import { MainPwaInstallService } from '../pwa/main-pwa-install.service';

@Component({
  selector: 'app-main-layout',
  imports: [
    RouterOutlet,
    MatSidenavModule,
    MatProgressBarModule,
    ToolbarComponent,
    SidebarComponent,
    BottomNavComponent,
    PullToRefreshComponent,
    LoadingStateComponent,
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
  private readonly reservationsInbox = inject(ReservationsInboxService);
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
  readonly currentUrl = signal(this.router.url);
  private readonly lastMobile = signal<boolean | null>(null);

  readonly navItems = computed((): NavItem[] => {
    const user = this.auth.currentUser();
    const shopId = this.shopContext.selectedShopId();
    if (isCashierOnly(user, shopId)) {
      return [{ label: 'Nuevo cierre', route: '/closings/new', icon: 'point_of_sale' }];
    }
    if (isProducerOnly(user, shopId)) {
      const items: NavItem[] = [
        { label: 'Mis horas', route: '/my-production', icon: 'restaurant' },
      ];
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
      if (stockChildren.length) {
        items.push({
          label: 'Stock',
          route: '__group_stock',
          icon: 'inventory_2',
          children: stockChildren,
        });
      }
      return items;
    }

    const items: NavItem[] = [
      { label: 'Inicio', route: '/', icon: 'home', exact: true },
    ];

    const operacion: NonNullable<NavItem['children']> = [];
    if (shopId && hasShopPermission(user, shopId, 'closings.read')) {
      operacion.push({ label: 'Cierres', route: '/closings', icon: 'point_of_sale' });
      operacion.push({
        label: 'A Retirar',
        route: '/cash-withdrawals',
        icon: 'payments',
        badge: this.cashWithdrawalsInbox.pendingCount() || null,
      });
    }
    if (shopId && hasShopPermission(user, shopId, 'movements.read')) {
      operacion.push({ label: 'Movimientos', route: '/movements', icon: 'swap_horiz' });
    }
    if (shopId && hasShopPermission(user, shopId, 'reservations.read') && this.shopFeature('reservations')) {
      operacion.push({
        label: 'Reservas',
        route: '/reservations',
        icon: 'table_restaurant',
        badge: this.reservationsInbox.todayGuests() || null,
        badgeInGroup: false,
      });
    }
    if (shopId && hasShopPermission(user, shopId, 'waitingList.read') && this.shopFeature('waitingList')) {
      operacion.push({ label: 'Lista de espera', route: '/waiting-list', icon: 'hourglass_top' });
    }
    if (operacion.length) {
      items.push({
        label: 'Operación',
        route: '__group_operacion',
        icon: 'today',
        children: operacion,
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
    if (stockChildren.length) {
      items.push({
        label: 'Stock',
        route: '__group_stock',
        icon: 'inventory_2',
        children: stockChildren,
      });
    }

    if (shopId && hasShopPermission(user, shopId, 'attendance.read')) {
      items.push({
        label: 'Asistencia',
        route: '__group_asistencia',
        icon: 'event_available',
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

    const pagos: NonNullable<NavItem['children']> = [];
    if (shopId && hasShopPermission(user, shopId, 'payments.read')) {
      pagos.push({
        label: 'A proveedores',
        route: '/payments/suppliers',
        icon: 'local_shipping',
        badge: this.paymentsInbox.pendingSupplierCount() || null,
      });
      pagos.push({
        label: 'A empleados',
        route: '/payments/employees',
        icon: 'badge',
        badge: this.paymentsInbox.pendingEmployeeCount() || null,
      });
    }
    if (shopId && hasShopPermission(user, shopId, 'suppliers.read')) {
      pagos.push({ label: 'Proveedores', route: '/suppliers', icon: 'inventory_2' });
    }
    if (pagos.length) {
      items.push({
        label: 'Pagos',
        route: '__group_pagos',
        icon: 'payments',
        children: pagos,
      });
    }

    if (shopId && hasShopPermission(user, shopId, 'reports.view')) {
      items.push({
        label: 'Reportes',
        route: '__group_reportes',
        icon: 'insights',
        children: [
          { label: 'Cierres', route: '/reports', icon: 'insights' },
          { label: 'Ventas POS', route: '/reports/products', icon: 'restaurant_menu' },
          { label: 'Estadísticas', route: '/reports/stats', icon: 'analytics' },
        ],
      });
    }

    const personal: NonNullable<NavItem['children']> = [];
    if (shopId && hasShopPermission(user, shopId, 'employees.read')) {
      personal.push({ label: 'Empleados', route: '/employees', icon: 'badge' });
    }
    if (shopId && hasShopPermission(user, shopId, 'candidates.read')) {
      personal.push({ label: 'CVs / Candidatos', route: '/candidates', icon: 'person_search' });
    }
    if (shopId && hasShopPermission(user, shopId, 'payroll.read')) {
      personal.push({ label: 'Liquidaciones', route: '/payroll', icon: 'request_quote' });
    }
    if (shopId && hasShopPermission(user, shopId, 'commissions.read')) {
      personal.push({ label: 'Comisiones', route: '/commissions', icon: 'percent' });
    }
    if (personal.length) {
      items.push({
        label: 'Personal',
        route: '__group_personal',
        icon: 'groups',
        children: personal,
      });
    }

    const admin: NonNullable<NavItem['children']> = [];
    if (this.auth.isSuperAdmin()) {
      admin.push({ label: 'Locales', route: '/admin/shops', icon: 'store' });
    }
    if (shopId && canManageShop(user, shopId)) {
      admin.push({ label: 'Local', route: '/admin/shop', icon: 'storefront' });
    }
    if (canManageShopUsers(user, shopId) && (shopId || this.auth.isAdmin())) {
      admin.push({ label: 'Usuarios', route: '/admin/users', icon: 'group' });
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
      items.push({
        label: 'Administración',
        route: '__group_admin',
        icon: 'settings',
        children: admin,
      });
    }

    return items;
  });

  readonly bottomNavItems = computed((): BottomNavItem[] => {
    const user = this.auth.currentUser();
    const shopId = this.shopContext.selectedShopId();
    if (isCashierOnly(user, shopId)) {
      return [{ label: 'Cierre', route: '/closings/new', icon: 'point_of_sale' }];
    }
    if (isProducerOnly(user, shopId)) {
      const items: BottomNavItem[] = [
        { label: 'Mis horas', route: '/my-production', icon: 'restaurant' },
      ];
      if (shopId && hasShopPermission(user, shopId, 'stock.read')) {
        items.push({ label: 'Alimentos', route: '/stock', icon: 'inventory' });
      }
      if (shopId && hasShopPermission(user, shopId, 'beverageStock.read')) {
        items.push({ label: 'Bebidas', route: '/beverage-stock', icon: 'local_bar' });
      }
      if (shopId && hasShopPermission(user, shopId, 'shortages.read')) {
        items.push({ label: 'Faltantes', route: '/shortages', icon: 'report' });
      }
      return items;
    }
    const items: BottomNavItem[] = [
      { label: 'Inicio', route: '/', icon: 'home', exact: true },
    ];
    if (shopId && hasShopPermission(user, shopId, 'closings.read')) {
      items.push({ label: 'Cierres', route: '/closings', icon: 'point_of_sale' });
    }
    if (shopId && hasShopPermission(user, shopId, 'reports.view')) {
      items.push({ label: 'Reportes', route: '/reports', icon: 'insights' });
    }
    return items;
  });

  readonly moreActive = computed(() => {
    const path = this.currentUrl().split('?')[0];
    const allowed = this.bottomNavItems().map((i) => i.route);
    return !allowed.some((route) => path === route || (route !== '/' && path.startsWith(route + '/')));
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
        if (path !== '/closings/new') {
          void this.router.navigateByUrl(home);
        }
        return;
      }
      if (isProducerOnly(user, shopId)) {
        const allowed =
          path === '/my-production' ||
          (path === '/stock' && hasShopPermission(user, shopId, 'stock.read')) ||
          (path === '/beverage-stock' &&
            hasShopPermission(user, shopId, 'beverageStock.read')) ||
          (path.startsWith('/shortages') &&
            hasShopPermission(user, shopId, 'shortages.read'));
        if (!allowed) {
          void this.router.navigateByUrl(home);
        }
        return;
      }
      if (path === '/' || path === '') return;
      if (!this.isPathAllowed(path, user, shopId)) {
        void this.router.navigateByUrl(home);
      }
    });

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.currentUrl.set(e.urlAfterRedirects));

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

  private isPathAllowed(path: string, user: NonNullable<ReturnType<AuthService['currentUser']>>, shopId: string): boolean {
    if (path.startsWith('/closings/new')) {
      return hasShopPermission(user, shopId, 'closings.create');
    }
    if (path.startsWith('/closings/')) {
      return hasShopPermission(user, shopId, 'closings.update') || hasShopPermission(user, shopId, 'closings.read');
    }
    if (path.startsWith('/closings')) {
      return hasShopPermission(user, shopId, 'closings.read');
    }
    if (path.startsWith('/cash-withdrawals')) {
      return hasShopPermission(user, shopId, 'closings.read');
    }
    if (path.startsWith('/reports')) {
      return hasShopPermission(user, shopId, 'reports.view');
    }
    if (path.startsWith('/admin/shops')) {
      return this.auth.isSuperAdmin();
    }
    if (path.startsWith('/admin/shop')) {
      return canManageShop(user, shopId);
    }
    if (path.startsWith('/admin/users')) {
      return canManageShopUsers(user, shopId);
    }
    if (path.startsWith('/admin/accounts')) {
      return hasShopPermission(user, shopId, 'accounts.manage');
    }
    if (path.startsWith('/admin/concepts')) {
      return hasShopPermission(user, shopId, 'concepts.manage');
    }
    if (path.startsWith('/admin/sales-systems')) {
      return canManageShop(user, shopId);
    }
    if (path.startsWith('/admin/pos-products')) {
      return canManageShop(user, shopId);
    }
    if (path.startsWith('/employees')) {
      return hasShopPermission(user, shopId, 'employees.read');
    }
    if (path.startsWith('/candidates')) {
      return hasShopPermission(user, shopId, 'candidates.read');
    }
    if (path.startsWith('/movements')) {
      return hasShopPermission(user, shopId, 'movements.read');
    }
    if (path.startsWith('/my-production')) {
      return hasShopPermission(user, shopId, 'attendance.self');
    }
    if (path.startsWith('/attendance') || path.startsWith('/production-attendance')) {
      return hasShopPermission(user, shopId, 'attendance.read');
    }
    if (path.startsWith('/reservations')) {
      return (
        hasShopPermission(user, shopId, 'reservations.read') && this.shopFeature('reservations')
      );
    }
    if (path.startsWith('/waiting-list')) {
      return (
        hasShopPermission(user, shopId, 'waitingList.read') && this.shopFeature('waitingList')
      );
    }
    if (path.startsWith('/payments')) {
      return hasShopPermission(user, shopId, 'payments.read');
    }
    if (path.startsWith('/suppliers')) {
      return hasShopPermission(user, shopId, 'suppliers.read');
    }
    if (path === '/stock' || path.startsWith('/stock/')) {
      return hasShopPermission(user, shopId, 'stock.read');
    }
    if (path === '/beverage-stock' || path.startsWith('/beverage-stock/')) {
      return hasShopPermission(user, shopId, 'beverageStock.read');
    }
    if (path.startsWith('/shortages')) {
      return hasShopPermission(user, shopId, 'shortages.read');
    }
    if (path.startsWith('/payroll')) {
      return hasShopPermission(user, shopId, 'payroll.read');
    }
    if (path.startsWith('/commissions')) {
      return hasShopPermission(user, shopId, 'commissions.read');
    }
    return true;
  }

  toggleSidenav(): void {
    this.sidenavOpen.update((open) => !open);
  }

  onSidenavOpenedChange(opened: boolean): void {
    this.sidenavOpen.set(opened);
  }

  closeSidenavOnNavigate(): void {
    if (this.isMobile()) {
      this.sidenavOpen.set(false);
    }
  }

  openMore(): void {
    this.sidenavOpen.set(true);
  }

  private shopFeature(feature: 'reservations' | 'waitingList'): boolean {
    const shop = this.shopContext.selectedShop();
    if (!shop) return false;
    if (feature === 'reservations') return !!shop.reservationsEnabled;
    return !!shop.waitingListEnabled;
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
