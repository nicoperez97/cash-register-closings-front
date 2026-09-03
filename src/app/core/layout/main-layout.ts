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
import { applyNavConfig, appShortcutById, effectiveNavConfig, navGroupPagePath, navLeaf } from './nav-config';
import { NavMenuService } from './nav-menu.service';
import { MainPwaInstallBannerComponent } from '../../shared/components/main-pwa-install-banner';
import { MainPwaInstallService } from '../pwa/main-pwa-install.service';
import type { NavChild } from './sidebar/sidebar';

const SIDENAV_EXPANDED_KEY = 'crc.sidenav.expanded';

function leaf(id: string, extra?: Partial<NavChild>): NavChild {
  return navLeaf(id, extra)!;
}

function shortcutLeaf(id: string, extra?: Partial<NavChild>): NavChild {
  const s = appShortcutById(id)!;
  return {
    label: s.label,
    route: 'route' in s ? s.route : '/',
    icon: s.icon,
    ...extra,
  };
}

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
  private readonly navMenu = inject(NavMenuService);
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
      const items: NavItem[] = [shortcutLeaf('new-closing')];
      if (shopId && hasShopPermission(user, shopId, 'tips.read') && this.shopFeature('tips')) {
        items.push(leaf('tips', { badge: this.tipsInbox.pendingCount() || null }));
      }
      return items;
    }
    if (isProducerOnly(user, shopId)) {
      const items: NavItem[] = [leaf('myProduction')];
      if (shopId && hasShopPermission(user, shopId, 'reimbursements.self')) {
        items.push(leaf('reimbursements', { label: 'Mis reintegros' }));
      }
      const stockChildren: NonNullable<NavItem['children']> = [];
      if (shopId && hasShopPermission(user, shopId, 'stock.read')) {
        stockChildren.push(leaf('stockFood'));
      }
      if (shopId && hasShopPermission(user, shopId, 'beverageStock.read')) {
        stockChildren.push(leaf('beverageStock'));
      }
      if (shopId && hasShopPermission(user, shopId, 'shortages.read')) {
        stockChildren.push(leaf('shortages'));
      }
      if (shopId && hasShopPermission(user, shopId, 'orders.read')) {
        stockChildren.push(leaf('orders'));
      }
      if (stockChildren.length) {
        items.push({
          label: 'Stock',
          route: '__group_stock',
          icon: 'inventory_2',
          defaultRoute: navGroupPagePath('stock'),
          children: stockChildren,
        });
      }
      return items;
    }

    const items: NavItem[] = [{ ...leaf('home'), exact: true }];

    const operacion: NonNullable<NavItem['children']> = [];
    if (
      shopId &&
      isClosingsCreateOnly(user, shopId) &&
      hasShopPermission(user, shopId, 'closings.create')
    ) {
      operacion.push(shortcutLeaf('new-closing'));
    } else if (shopId && canViewClosingsList(user, shopId)) {
      operacion.push(leaf('closings'));
    }
    if (shopId && hasShopPermission(user, shopId, 'cashWithdrawals.read')) {
      operacion.push(
        leaf('cashWithdrawals', { badge: this.cashWithdrawalsInbox.pendingCount() || null }),
      );
    }
    if (shopId && hasShopPermission(user, shopId, 'settlements.read') && this.settlementsInbox.enabled()) {
      operacion.push(
        leaf('settlements', { badge: this.settlementsInbox.pendingCount() || null }),
      );
    }
    if (shopId && hasShopPermission(user, shopId, 'tips.read') && this.shopFeature('tips')) {
      operacion.push(
        leaf('tips', {
          badge: this.tipsInbox.pendingCount() || null,
          badgeInGroup: false,
        }),
      );
    }
    if (shopId && hasShopPermission(user, shopId, 'serviceRules.read')) {
      operacion.push(leaf('serviceRules'));
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
      cuentas.push(leaf('expenses'));
    }
    if (shopId && hasShopPermission(user, shopId, 'incomes.read')) {
      cuentas.push(leaf('incomes'));
    }
    if (shopId && hasShopPermission(user, shopId, 'accountTransfers.read')) {
      cuentas.push(leaf('accountTransfers'));
    }
    if (
      shopId &&
      (hasShopPermission(user, shopId, 'expenses.read') ||
        hasShopPermission(user, shopId, 'incomes.read') ||
        hasShopPermission(user, shopId, 'accountTransfers.read'))
    ) {
      cuentas.push(leaf('transactions'));
    }
    if (shopId && hasShopPermission(user, shopId, 'partnerSplits.read')) {
      cuentas.push(leaf('partnerSplits'));
      cuentas.push(leaf('splits'));
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
      salon.push(
        leaf('reservations', {
          badge: this.reservationsInbox.menuBadge() || null,
          badgeInGroup: false,
        }),
      );
    }
    if (shopId && hasShopPermission(user, shopId, 'waitingList.read') && this.shopFeature('waitingList')) {
      salon.push(leaf('waitingList'));
    }
    if (shopId && hasShopPermission(user, shopId, 'reservations.read') && this.shopFeature('reservations')) {
      salon.push(leaf('diagrama'));
      salon.push(leaf('salonRules'));
      salon.push(leaf('salonHours'));
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
      stockChildren.push(leaf('stockFood'));
    }
    if (shopId && hasShopPermission(user, shopId, 'beverageStock.read')) {
      stockChildren.push(leaf('beverageStock'));
    }
    if (shopId && hasShopPermission(user, shopId, 'shortages.read')) {
      stockChildren.push(leaf('shortages'));
    }
    if (shopId && hasShopPermission(user, shopId, 'orders.read')) {
      stockChildren.push(leaf('orders'));
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
        children: [leaf('attendance'), leaf('productionAttendance')],
      });
    } else if (shopId && hasShopPermission(user, shopId, 'attendance.self')) {
      items.push(leaf('myProduction'));
    }
    if (
      shopId &&
      hasShopPermission(user, shopId, 'reimbursements.self') &&
      !hasShopPermission(user, shopId, 'reimbursements.read') &&
      !isProducerOnly(user, shopId)
    ) {
      items.push(leaf('reimbursements', { label: 'Mis reintegros' }));
    }

    const pagos: NonNullable<NavItem['children']> = [];
    if (shopId && hasShopPermission(user, shopId, 'payments.read')) {
      pagos.push(
        leaf('paymentsSuppliers', {
          badge: this.paymentsInbox.pendingSupplierCount() || null,
        }),
      );
      pagos.push(
        leaf('paymentsServices', {
          badge: this.paymentsInbox.pendingServiceCount() || null,
        }),
      );
      pagos.push(
        leaf('paymentsEmployees', {
          badge: this.paymentsInbox.pendingEmployeeCount() || null,
        }),
      );
      pagos.push(
        leaf('paymentsPartners', {
          badge: this.paymentsInbox.pendingPartnerCount() || null,
        }),
      );
    }
    if (shopId && hasShopPermission(user, shopId, 'suppliers.read')) {
      pagos.push(leaf('suppliers'));
    }
    if (shopId && hasShopPermission(user, shopId, 'services.read')) {
      pagos.push(leaf('services'));
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
          leaf('reports'),
          leaf('reportsConcepts'),
          leaf('reportsProducts'),
          leaf('reportsStats'),
        ],
      });
    }

    const personal: NonNullable<NavItem['children']> = [];
    if (shopId && hasShopPermission(user, shopId, 'employees.read')) {
      personal.push(leaf('employees'));
    }
    if (shopId && hasShopPermission(user, shopId, 'vacations.read')) {
      personal.push(leaf('vacations'));
    }
    if (shopId && hasShopPermission(user, shopId, 'candidates.read')) {
      personal.push(leaf('candidates'));
    }
    if (shopId && hasShopPermission(user, shopId, 'payroll.read')) {
      personal.push(leaf('payroll'));
    }
    if (shopId && hasShopPermission(user, shopId, 'commissions.read')) {
      personal.push(leaf('commissions'));
    }
    if (
      shopId &&
      (hasShopPermission(user, shopId, 'reimbursements.read') ||
        hasShopPermission(user, shopId, 'reimbursements.manage'))
    ) {
      personal.push(
        leaf('reimbursements', {
          badge: this.reimbursementsInbox.pendingCount() || null,
        }),
      );
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
      admin.push(leaf('adminShops'));
    }
    if (shopId && canManageShop(user, shopId)) {
      admin.push(leaf('adminShop'));
      admin.push(leaf('adminMessages'));
      admin.push(leaf('adminMenu'));
      admin.push(leaf('adminQr'));
      admin.push(leaf('adminInstrucciones'));
    }
    if (canManageShopUsers(user, shopId) && (shopId || this.auth.isAdmin())) {
      admin.push(leaf('adminUsers'));
      admin.push(leaf('adminUserActivity'));
    }
    if (shopId && hasShopPermission(user, shopId, 'accounts.manage')) {
      admin.push(leaf('adminAccounts'));
    }
    if (shopId && hasShopPermission(user, shopId, 'concepts.manage')) {
      admin.push(leaf('adminConcepts'));
    }
    if (shopId && canManageShop(user, shopId)) {
      admin.push(leaf('adminSalesSystems'));
      admin.push(leaf('adminPosProducts'));
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
      this.navMenu.items.set(this.navItems());
    });

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
          path === '/forbidden' ||
          (path.startsWith('/tips') &&
            hasShopPermission(user, shopId, 'tips.read') &&
            this.shopFeature('tips'));
        if (!allowed) {
          void this.router.navigate(['/forbidden'], { queryParams: { from: path } });
        }
        return;
      }
      if (isProducerOnly(user, shopId)) {
        const allowed =
          path === '/my-production' ||
          path.startsWith('/g/') ||
          path === '/forbidden' ||
          (path.startsWith('/reimbursements') &&
            hasShopPermission(user, shopId, 'reimbursements.self')) ||
          (path === '/stock' && hasShopPermission(user, shopId, 'stock.read')) ||
          (path === '/beverage-stock' &&
            hasShopPermission(user, shopId, 'beverageStock.read')) ||
          (path.startsWith('/shortages') &&
            hasShopPermission(user, shopId, 'shortages.read')) ||
          (path.startsWith('/orders') && hasShopPermission(user, shopId, 'orders.read'));
        if (!allowed) {
          void this.router.navigate(['/forbidden'], { queryParams: { from: path } });
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
      if (path === '/' || path === '' || path === '/forbidden') return;
      if (!this.isPathAllowed(path, user, shopId)) {
        void this.router.navigate(['/forbidden'], { queryParams: { from: path } });
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
