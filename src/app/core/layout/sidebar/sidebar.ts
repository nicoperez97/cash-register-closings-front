import { Component, effect, inject, input, output, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { filter } from 'rxjs';
import { APP_BRAND } from '../../config/app-brand';
import { ShopContextService } from '../../shop/shop-context.service';
import { AuthService } from '../../auth/auth.service';
import { defaultHomeRoute } from '../../auth/auth.models';
import { normalizeLogoUrl } from '../../utils/drive-url';
import { NotificationsInboxService } from '../../../features/payments/notifications-inbox.service';

export interface NavChild {
  label: string;
  route: string;
  icon: string;
  badge?: number | null;
}

export interface NavItem {
  label: string;
  route: string;
  icon: string;
  children?: NavChild[];
  exact?: boolean;
  badge?: number | null;
}

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class SidebarComponent {
  readonly brand = APP_BRAND;
  readonly shopContext = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly notifsInbox = inject(NotificationsInboxService);
  readonly navItems = input.required<NavItem[]>();
  readonly isMobile = input(false);
  readonly navigate = output<void>();
  readonly close = output<void>();
  readonly logoBroken = signal(false);
  /** Logos de locales que fallaron al cargar (mostrar iniciales). */
  readonly brokenShopLogos = signal<ReadonlySet<string>>(new Set());
  readonly currentUrl = signal(this.router.url);
  readonly shopPickerOpen = signal(false);
  readonly favoriteBusy = signal(false);
  /** Rutas de grupos contraídos (vacío = todos abiertos por defecto). */
  private readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());

  constructor() {
    this.notifsInbox.ensureStarted();
    effect(() => {
      this.shopContext.logoUrl();
      this.logoBroken.set(false);
    });
    effect(() => {
      // Si cambian URLs de logo, reintentar carga.
      const urls = this.shopContext.shops().map((s) => `${s.id}:${s.logoUrl ?? ''}`).join('|');
      void urls;
      this.brokenShopLogos.set(new Set());
    });
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.currentUrl.set(e.urlAfterRedirects);
        this.shopPickerOpen.set(false);
      });
  }

  shopUnread(shopId: string): number {
    return Math.max(0, Number(this.notifsInbox.unreadByShop()[shopId]) || 0);
  }

  /** Badge en el switcher cerrado: suma de no leídas en *otros* locales. */
  otherShopsUnread(): number {
    const current = this.shopContext.selectedShopId();
    let total = 0;
    for (const [id, count] of Object.entries(this.notifsInbox.unreadByShop())) {
      if (id === current) continue;
      total += Math.max(0, Number(count) || 0);
    }
    return total;
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

  isFavorite(shopId: string): boolean {
    return this.shopContext.favoriteShopId() === shopId;
  }

  async toggleFavorite(event: Event, shopId: string): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (this.favoriteBusy()) return;
    const next = this.isFavorite(shopId) ? null : shopId;
    this.favoriteBusy.set(true);
    try {
      await this.auth.setFavoriteShop(next);
      this.snack.open(
        next ? 'Local favorito guardado. Se usará al iniciar sesión.' : 'Favorito quitado',
        'OK',
        { duration: 2500 },
      );
    } catch {
      this.snack.open('No se pudo guardar el favorito', 'OK', { duration: 3000 });
    } finally {
      this.favoriteBusy.set(false);
    }
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

  /** Logo para el avatar del switcher; null si no hay URL o falló la carga. */
  shopAvatarSrc(shopId: string, logoUrl?: string | null): string | null {
    if (this.brokenShopLogos().has(shopId)) return null;
    return this.shopLogo(logoUrl);
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

  badgeLabel(count: number): string {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n > 9) return '9+';
    return String(n);
  }

  /** Suma badges de hijos (p. ej. Operación → Pagos). */
  groupBadge(item: NavItem): number {
    const fromItem = Number(item.badge) || 0;
    const fromChildren = (item.children ?? []).reduce(
      (sum, c) => sum + (Number(c.badge) || 0),
      0,
    );
    return fromItem + fromChildren;
  }

  onShopLogoError(shopId: string): void {
    this.brokenShopLogos.update((prev) => {
      if (prev.has(shopId)) return prev;
      const next = new Set(prev);
      next.add(shopId);
      return next;
    });
  }
}
