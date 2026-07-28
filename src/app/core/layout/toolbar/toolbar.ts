import { Component, inject, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { APP_BRAND } from '../../config/app-brand';
import { userRoleLabel } from '../../auth/auth.models';
import { ThemeService, ThemeMode } from '../../theme/theme.service';
import { OfflineService } from '../../offline/offline.service';
import { ShopContextService } from '../../shop/shop-context.service';

export interface ToolbarUser {
  email: string;
  fullName?: string;
  role?: string;
  globalRole?: string;
}

@Component({
  selector: 'app-toolbar',
  imports: [MatIconModule, MatButtonModule, MatTooltipModule, MatMenuModule],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
})
export class ToolbarComponent {
  readonly brand = APP_BRAND;
  readonly theme = inject(ThemeService);
  readonly offline = inject(OfflineService);
  readonly shopContext = inject(ShopContextService);

  readonly user = input<ToolbarUser | null>(null);
  readonly isMobile = input(false);
  readonly sidenavOpen = input(false);
  readonly menuToggle = output<void>();
  readonly logout = output<void>();

  roleLabel(user?: ToolbarUser | null): string {
    return userRoleLabel(user?.globalRole ?? user?.role);
  }

  displayName(user: ToolbarUser): string {
    const name = user.fullName?.trim();
    return name || user.email;
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
}
