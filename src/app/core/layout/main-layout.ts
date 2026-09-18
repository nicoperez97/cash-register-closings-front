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
  canAccessShopAdmin,
  canAccessShopConfig,
  canManageShopUsers,
  canManageOrderingCatalog,
  canSeeShopConfigSection,
  defaultHomeRoute,
  hasShopPermission,
  isCashierOnly,
  isClosingsCreateOnly,
  isCustomerOrdersOnly,
  isComandaOnly,
  isProducerOnly,
  canViewClosingsList,
  isShopAdministrator,
} from '../auth/auth.models';
import { canAccessAppRoute } from '../auth/route-access';
import { ToolbarComponent } from './toolbar/toolbar';
import { SidebarComponent, NavItem, type NavChild } from './sidebar/sidebar';
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
import { CustomerOrdersInboxService } from '../../features/customer-orders/customer-orders-inbox.service';
import { applyNavConfig, appShortcutById, effectiveNavConfig, navGroupPagePath, navLeaf } from './nav-config';
import { publicPagesNavChildren } from '../shop/public-pages';
import { canAccessAnyPublicPage } from '../shop/public-page-access';
import { NavMenuService } from './nav-menu.service';
import { ImmersiveChromeService } from './immersive-chrome.service';
import { MainPwaInstallBannerComponent } from '../../shared/components/main-pwa-install-banner';
import { MainPwaInstallService } from '../pwa/main-pwa-install.service';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

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
    MatIconModule,
    MatTooltipModule,
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
  private readonly customerOrdersInbox = inject(CustomerOrdersInboxService);
  private readonly mainPwa = inject(MainPwaInstallService);
  private readonly navMenu = inject(NavMenuService);
  readonly immersiveChrome = inject(ImmersiveChromeService);
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

  readonly sidenavOpen = signal(!this.immersiveChrome.toolbarHidden());
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
    if (isCustomerOrdersOnly(user, shopId)) {
      return [
        leaf('customerOrders', {
          badge: this.customerOrdersInbox.pendingCount() || null,
        }),
      ];
    }
    if (isComandaOnly(user, shopId)) {
      return this.shopFeature('waiterOrdering') ? [leaf('comanda')] : [];
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
    if (
      shopId &&
      this.shopFeature('onlineOrdering') &&
      (hasShopPermission(user, shopId, 'customerOrders.read') ||
        hasShopPermission(user, shopId, 'orderingCatalog.manage'))
    ) {
      operacion.push(
        leaf('customerOrders', {
          badge: this.customerOrdersInbox.pendingCount() || null,
          badgeInGroup: false,
        }),
      );
    }
    if (
      shopId &&
      this.shopFeature('waiterOrdering') &&
      (hasShopPermission(user, shopId, 'comanda.manage') ||
        hasShopPermission(user, shopId, 'shops.manage'))
    ) {
      operacion.push(leaf('comanda'));
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
    if (shopId && hasShopPermission(user, shopId, 'accountBalances.read')) {
      cuentas.push(leaf('accountBalances'));
    }
    if (shopId && hasShopPermission(user, shopId, 'transactions.read')) {
      cuentas.push(leaf('transactions'));
    }
    if (shopId && hasShopPermission(user, shopId, 'partnerSplits.read')) {
      cuentas.push(leaf('partnerSplits'));
    }
    if (shopId && hasShopPermission(user, shopId, 'splits.read')) {
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
    if (shopId && hasShopPermission(user, shopId, 'salonTables.read') && this.shopFeature('reservations')) {
      salon.push(leaf('salonTables'));
    }
    if (shopId && hasShopPermission(user, shopId, 'diagrama.read') && this.shopFeature('reservations')) {
      salon.push(leaf('diagrama'));
    }
    if (shopId && hasShopPermission(user, shopId, 'salonRules.read') && this.shopFeature('reservations')) {
      salon.push(leaf('salonRules'));
    }
    if (shopId && hasShopPermission(user, shopId, 'salonHours.read') && this.shopFeature('reservations')) {
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

    const asistencia: NonNullable<NavItem['children']> = [];
    if (shopId && hasShopPermission(user, shopId, 'attendance.read')) {
      asistencia.push(leaf('attendance'));
    }
    if (shopId && hasShopPermission(user, shopId, 'productionAttendance.read')) {
      asistencia.push(leaf('productionAttendance'));
    }
    if (asistencia.length) {
      items.push({
        label: 'Asistencia',
        route: '__group_asistencia',
        icon: 'event_available',
        defaultRoute: asistencia[0]?.route,
        children: asistencia,
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
    if (shopId && hasShopPermission(user, shopId, 'paymentsSuppliers.read')) {
      pagos.push(
        leaf('paymentsSuppliers', {
          badge: this.paymentsInbox.pendingSupplierCount() || null,
        }),
      );
    }
    if (shopId && hasShopPermission(user, shopId, 'paymentsServices.read')) {
      pagos.push(
        leaf('paymentsServices', {
          badge: this.paymentsInbox.pendingServiceCount() || null,
        }),
      );
    }
    if (shopId && hasShopPermission(user, shopId, 'paymentsEmployees.read')) {
      pagos.push(
        leaf('paymentsEmployees', {
          badge: this.paymentsInbox.pendingEmployeeCount() || null,
        }),
      );
    }
    if (shopId && hasShopPermission(user, shopId, 'paymentsPartners.read')) {
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

    const reportes: NonNullable<NavItem['children']> = [];
    if (shopId && hasShopPermission(user, shopId, 'reports.view')) {
      reportes.push(leaf('reports'));
    }
    if (shopId && hasShopPermission(user, shopId, 'reportsConcepts.read')) {
      reportes.push(leaf('reportsConcepts'));
    }
    if (shopId && hasShopPermission(user, shopId, 'reportsProducts.read')) {
      reportes.push(leaf('reportsProducts'));
    }
    if (shopId && hasShopPermission(user, shopId, 'reportsStats.read')) {
      reportes.push(leaf('reportsStats'));
    }
    if (reportes.length) {
      items.push({
        label: 'Reportes',
        route: '__group_reportes',
        icon: 'insights',
        defaultRoute: reportes[0]?.route,
        children: reportes,
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

    if (shopId && canAccessAnyPublicPage(user, shopId)) {
      const publicChildren: NavChild[] = [
        ...(isShopAdministrator(user, shopId) ? [leaf('adminPublicPages')] : []),
        ...publicPagesNavChildren(this.shopContext.selectedShop(), user, shopId),
      ];
      if (publicChildren.length) {
        items.push({
          label: 'Páginas públicas',
          route: '__group_publicPages',
          icon: 'public',
          defaultRoute:
            publicChildren.find((c) => c.route && !c.route.startsWith('__'))?.route ??
            navGroupPagePath('publicPages'),
          children: publicChildren,
        });
      }
    }

    const local: NonNullable<NavItem['children']> = [];
    if (shopId && canAccessShopConfig(user, shopId)) {
      if (canSeeShopConfigSection(user, shopId, 'resumen')) {
        local.push(leaf('adminShop'));
      }
      if (canSeeShopConfigSection(user, shopId, 'identidad')) {
        local.push(leaf('adminShopIdentidad'));
      }
      if (canSeeShopConfigSection(user, shopId, 'operacion')) {
        local.push(leaf('adminShopOperacion'));
      }
    }
    if (shopId && canSeeShopConfigSection(user, shopId, 'pedidos')) {
      local.push(leaf('adminOrdering'));
    }
    if (shopId && canSeeShopConfigSection(user, shopId, 'comanda')) {
      local.push(leaf('adminComanda'));
    }
    if (shopId && canAccessShopConfig(user, shopId)) {
      if (canSeeShopConfigSection(user, shopId, 'dispositivos')) {
        local.push(leaf('adminShopDispositivos'));
      }
      if (canSeeShopConfigSection(user, shopId, 'menu')) {
        local.push(leaf('adminShopMenu'));
      }
    }
    if (shopId && canSeeShopConfigSection(user, shopId, 'carta')) {
      if (canManageOrderingCatalog(user, shopId)) {
        local.push(leaf('adminMenu'));
      }
      if (hasShopPermission(user, shopId, 'promos.manage')) {
        local.push(leaf('adminPromos'));
      }
    }
    if (
      shopId &&
      (hasShopPermission(user, shopId, 'integrations.read') ||
        hasShopPermission(user, shopId, 'integrations.manage'))
    ) {
      local.push(leaf('integrations'));
    }
    if (shopId && canSeeShopConfigSection(user, shopId, 'avanzado')) {
      local.push(leaf('adminShopAvanzado'));
    }
    if (local.length) {
      items.push({
        label: 'Configuración del local',
        route: '__group_local',
        icon: 'storefront',
        defaultRoute: '/admin/shop',
        children: local,
      });
    }

    const admin: NonNullable<NavItem['children']> = [];
    if (this.auth.isSuperAdmin()) {
      admin.push(leaf('adminShops'));
    }
    if (shopId && canAccessShopAdmin(user, shopId)) {
      admin.push(leaf('adminMessages'));
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
    if (shopId && canAccessShopAdmin(user, shopId)) {
      admin.push(leaf('adminSalesSystems'));
      admin.push(leaf('adminPosProducts'));
    }
    if (admin.length) {
      items.push({
        label: 'Administración',
        route: '__group_admin',
        icon: 'settings',
        defaultRoute: admin[0]?.route,
        children: admin,
      });
    }

    return applyNavConfig(items, effectiveNavConfig(this.shopContext.selectedShop()));
  });

  readonly isCashierLayout = computed(() =>
    isCashierOnly(this.auth.currentUser(), this.shopContext.selectedShopId()),
  );

  /** Visor de página pública: sin toolbar del admin (barra mínima propia). */
  readonly isPublicPageViewer = computed(() => {
    const path = this.currentUrl().split('?')[0] || '';
    return /^\/admin\/public-pages\/[^/]+/.test(path);
  });

  /** Sin toolbar: visor público u operativa (Comanda / Pedidos) con barra ocultada. */
  readonly hideMainToolbar = computed(
    () => this.isPublicPageViewer() || this.immersiveChrome.toolbarHidden(),
  );

  /** Controles flotantes para volver a mostrar la toolbar (no aplica al visor público). */
  readonly showChromeReveal = computed(
    () => this.immersiveChrome.toolbarHidden() && !this.isPublicPageViewer(),
  );

  /** Overlay (móvil o chrome oculta): el menú no empuja el contenido. */
  readonly sidenavOverlay = computed(() => this.isMobile() || this.showChromeReveal());

  constructor() {
    this.mainPwa.start();

    effect(() => {
      this.navMenu.items.set(this.navItems());
    });

    let lastSidenavToggle = 0;
    effect(() => {
      const n = this.navMenu.sidenavToggleRequest();
      if (n === lastSidenavToggle) return;
      lastSidenavToggle = n;
      untracked(() => this.toggleSidenav());
    });

    effect(() => {
      const mobile = this.isMobile();
      const prev = this.lastMobile();
      if (prev === mobile) return;
      this.lastMobile.set(mobile);
      // Desktop: drawer abierto (salvo modo inmersivo). Mobile: overlay cerrado.
      if (untracked(() => this.showChromeReveal())) {
        this.sidenavOpen.set(false);
        return;
      }
      this.sidenavOpen.set(!mobile);
    });

    // Al entrar a Comanda / Pedidos: cerrar sidenav. Al salir: restaurar en desktop.
    let wasImmersive = false;
    effect(() => {
      const immersive = this.showChromeReveal();
      if (immersive === wasImmersive) return;
      const leaving = wasImmersive && !immersive;
      wasImmersive = immersive;
      if (immersive) {
        untracked(() => this.sidenavOpen.set(false));
      } else if (leaving && !untracked(() => this.isMobile())) {
        untracked(() => this.sidenavOpen.set(true));
      }
    });

    // Con overlay abierto: bloquear scroll de la página detrás.
    effect(() => {
      if (typeof document === 'undefined') return;
      const lock = !!this.sidenavOverlay() && this.sidenavOpen();
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
      if (isCustomerOrdersOnly(user, shopId)) {
        const allowed =
          path.startsWith('/customer-orders') ||
          path === '/profile' ||
          path === '/forbidden';
        if (!allowed) {
          void this.router.navigate(['/forbidden'], { queryParams: { from: path } });
        }
        return;
      }
      if (isComandaOnly(user, shopId)) {
        const allowed =
          path.startsWith('/comanda') ||
          path === '/profile' ||
          path === '/forbidden';
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
        onlineOrderingEnabled: shop?.onlineOrderingEnabled,
        waiterOrderingEnabled: shop?.waiterOrderingEnabled,
        settlementsEnabled:
          this.settlementsInbox.enabled() || !!shop?.settlementsEnabled,
      },
      navConfig: effectiveNavConfig(shop),
    });
  }

  toggleSidenav(): void {
    if (this.sidenavOverlay()) {
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
    if (this.sidenavOverlay()) return;
    if (this.sidenavExpanded()) return;
    this.sidenavExpanded.set(true);
    saveSidenavExpanded(true);
    this.sidenavOpen.set(true);
  }

  onSidenavOpenedChange(opened: boolean): void {
    if (this.sidenavOverlay()) {
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
    if (this.sidenavOverlay()) {
      this.sidenavOpen.set(false);
    }
  }

  private shopFeature(
    feature: 'reservations' | 'waitingList' | 'tips' | 'onlineOrdering' | 'waiterOrdering',
  ): boolean {
    const shop = this.shopContext.selectedShop();
    if (!shop) return false;
    if (feature === 'reservations') return !!shop.reservationsEnabled;
    if (feature === 'waitingList') return !!shop.waitingListEnabled;
    if (feature === 'onlineOrdering') return !!shop.onlineOrderingEnabled;
    if (feature === 'waiterOrdering') return !!shop.waiterOrderingEnabled;
    return !!shop.tipsEnabled;
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
