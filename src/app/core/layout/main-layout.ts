import { Component, computed, effect, inject, signal } from '@angular/core';
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

@Component({
  selector: 'app-main-layout',
  imports: [
    RouterOutlet,
    MatSidenavModule,
    ToolbarComponent,
    SidebarComponent,
    BottomNavComponent,
  ],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
})
export class MainLayoutComponent {
  private readonly auth = inject(AuthService);
  private readonly shopContext = inject(ShopContextService);
  private readonly router = inject(Router);
  private readonly breakpointObserver = inject(BreakpointObserver);

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
    if (hasShopPermission(user, shopId, 'closings.read')) {
      items.push({ label: 'Cierres', route: '/closings', icon: 'point_of_sale' });
    }
    if (hasShopPermission(user, shopId, 'reports.view')) {
      items.push({ label: 'Reportes', route: '/reports', icon: 'insights' });
    }
    if (canManageShop(user, shopId)) {
      items.push({ label: 'Local', route: '/admin/shop', icon: 'storefront' });
    }
    if (canManageShopUsers(user, shopId)) {
      items.push({ label: 'Usuarios', route: '/admin/users', icon: 'group' });
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
    if (hasShopPermission(user, shopId, 'closings.read')) {
      items.push({ label: 'Cierres', route: '/closings', icon: 'point_of_sale' });
    }
    if (hasShopPermission(user, shopId, 'reports.view')) {
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

    // Si la ruta actual no está permitida para el local, ir al home del rol
    effect(() => {
      const user = this.auth.currentUser();
      const shopId = this.shopContext.selectedShopId();
      const path = this.currentUrl().split('?')[0];
      if (!user || !shopId) return;
      const home = defaultHomeRoute(user, shopId);
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
    if (path.startsWith('/admin/shop')) {
      return canManageShop(user, shopId);
    }
    if (path.startsWith('/admin/users')) {
      return canManageShopUsers(user, shopId);
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
