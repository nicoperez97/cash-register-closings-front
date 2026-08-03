import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatSidenavModule } from '@angular/material/sidenav';
import { filter, map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import {
  canManageShop,
  canManageShopUsers,
  defaultHomeRoute,
  hasShopPermission,
  isCashierOnly,
} from '../auth/auth.models';
import { ToolbarComponent } from './toolbar/toolbar';
import { SidebarComponent, NavItem } from './sidebar/sidebar';
import { BottomNavComponent, BottomNavItem } from './bottom-nav/bottom-nav';
import { ShopContextService } from '../shop/shop-context.service';
import { PageRefreshService } from '../page-refresh.service';
import { PullToRefreshComponent } from '../../shared/components/pull-to-refresh';
import { BodyScrollLockService } from '../../shared/services/body-scroll-lock.service';

@Component({
  selector: 'app-main-layout',
  imports: [
    RouterOutlet,
    MatSidenavModule,
    ToolbarComponent,
    SidebarComponent,
    BottomNavComponent,
    PullToRefreshComponent,
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
  readonly pageRefresh = inject(PageRefreshService);

  readonly user = this.auth.currentUser;

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

    const items: NavItem[] = [
      { label: 'Inicio', route: '/', icon: 'home', exact: true },
    ];

    const operacion: NonNullable<NavItem['children']> = [];
    if (shopId && hasShopPermission(user, shopId, 'closings.read')) {
      operacion.push({ label: 'Cierres', route: '/closings', icon: 'point_of_sale' });
    }
    if (shopId && hasShopPermission(user, shopId, 'movements.read')) {
      operacion.push({ label: 'Movimientos', route: '/movements', icon: 'swap_horiz' });
    }
    if (shopId && hasShopPermission(user, shopId, 'attendance.read')) {
      operacion.push({ label: 'Asistencia', route: '/attendance', icon: 'event_available' });
    }
    if (operacion.length) {
      items.push({
        label: 'Operación',
        route: '__group_operacion',
        icon: 'today',
        children: operacion,
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
        ],
      });
    }

    const personal: NonNullable<NavItem['children']> = [];
    if (shopId && hasShopPermission(user, shopId, 'employees.read')) {
      personal.push({ label: 'Empleados', route: '/employees', icon: 'badge' });
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
      if (path === '/' || path === '') return;
      if (!this.isPathAllowed(path, user, shopId)) {
        void this.router.navigateByUrl(home);
      }
    });

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.currentUrl.set(e.urlAfterRedirects));
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
    if (path.startsWith('/movements')) {
      return hasShopPermission(user, shopId, 'movements.read');
    }
    if (path.startsWith('/attendance')) {
      return hasShopPermission(user, shopId, 'attendance.read');
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

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
