import { Component, inject, input, output } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { APP_BRAND } from '../../config/app-brand';
import { ShopContextService } from '../../shop/shop-context.service';

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
    MatExpansionModule,
    MatTooltipModule,
    MatMenuModule,
  ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class SidebarComponent {
  readonly brand = APP_BRAND;
  readonly shopContext = inject(ShopContextService);
  private readonly router = inject(Router);
  readonly navItems = input.required<NavItem[]>();
  readonly isMobile = input(false);
  readonly navigate = output<void>();
  readonly close = output<void>();

  onNavClick(): void {
    this.navigate.emit();
  }

  onShopChange(shopId: string): void {
    if (!this.shopContext.selectShop(shopId)) return;
    void this.router.navigateByUrl('/');
    this.navigate.emit();
  }

  shopInitial(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
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

  logoBackground(): string {
    const url = this.logoSrc().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `url("${url}")`;
  }
}
