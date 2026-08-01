import { Component, effect, inject, input, output, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter } from 'rxjs';
import { APP_BRAND } from '../../config/app-brand';
import { ShopContextService } from '../../shop/shop-context.service';
import { AuthService } from '../../auth/auth.service';
import { defaultHomeRoute } from '../../auth/auth.models';
import { normalizeLogoUrl } from '../../utils/drive-url';

export interface NavChild {
  label: string;
  route: string;
  icon: string;
}

export interface NavItem {
  label: string;
  route: string;
  icon: string;
  children?: NavChild[];
  exact?: boolean;
}

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class SidebarComponent {
  readonly brand = APP_BRAND;
  readonly shopContext = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly navItems = input.required<NavItem[]>();
  readonly isMobile = input(false);
  readonly navigate = output<void>();
  readonly close = output<void>();
  readonly logoBroken = signal(false);
  readonly currentUrl = signal(this.router.url);
  readonly shopPickerOpen = signal(false);
  /** Rutas de grupos contraídos (vacío = todos abiertos por defecto). */
  private readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());

  constructor() {
    effect(() => {
      this.shopContext.logoUrl();
      this.logoBroken.set(false);
    });
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.currentUrl.set(e.urlAfterRedirects);
        this.shopPickerOpen.set(false);
      });
  }

  onNavClick(): void {
    this.shopPickerOpen.set(false);
    this.navigate.emit();
  }

  toggleShopPicker(): void {
    this.shopPickerOpen.update((open) => !open);
  }

  pickShop(shopId: string): void {
    this.shopPickerOpen.set(false);
    this.onShopChange(shopId);
  }

  /** True si algún hijo coincide con la URL actual (estilo activo). */
  groupHasActive(item: NavItem): boolean {
    const path = this.currentUrl().split('?')[0];
    return (item.children ?? []).some((c) => this.routeMatches(path, c.route));
  }

  /** Abierto por defecto; solo se cierra si el usuario lo contrajo. */
  isGroupOpen(item: NavItem): boolean {
    return !this.collapsedGroups().has(item.route);
  }

  toggleGroup(item: NavItem, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.collapsedGroups.update((prev) => {
      const next = new Set(prev);
      if (next.has(item.route)) next.delete(item.route);
      else next.add(item.route);
      return next;
    });
  }

  private routeMatches(path: string, route: string): boolean {
    if (route === '/') return path === '/' || path === '';
    return path === route || path.startsWith(route + '/');
  }

  onShopChange(shopId: string): void {
    if (!this.shopContext.selectShop(shopId)) return;
    void this.router.navigateByUrl(defaultHomeRoute(this.auth.currentUser(), shopId));
    this.navigate.emit();
  }

  shopInitial(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  shopLogo(url?: string | null): string | null {
    return normalizeLogoUrl(url) || url?.trim() || null;
  }

  logoSrc(): string {
    return this.shopContext.logoUrl();
  }

  logoAlt(): string {
    return this.shopContext.selectedShop()?.name || this.brand.productName;
  }

  isAppLogo(): boolean {
    const url = this.logoSrc();
    return url.includes('icon.svg') || url.includes('logo-app') || url === this.brand.defaultLogoUrl;
  }

  onLogoError(): void {
    this.logoBroken.set(true);
  }

  onShopLogoError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (img) img.style.display = 'none';
  }
}
