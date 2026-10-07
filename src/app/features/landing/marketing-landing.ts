import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth/auth.service';
import { defaultHomeRoute } from '../../core/auth/auth.models';
import { APP_BRAND } from '../../core/config/app-brand';
import { ThemeService } from '../../core/theme/theme.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
import { environment } from '../../../environments/environment';
import { apiErrorMessage } from '../../core/http/api-error-message';
import { BusyLabelComponent } from '../../shared/components/busy-label';

const LANDING_STATUS = '#06090f';

@Component({
  selector: 'app-marketing-landing',
  imports: [RouterLink, MatButtonModule, MatIconModule, BusyLabelComponent],
  templateUrl: './marketing-landing.html',
  styleUrl: './marketing-landing.scss',
})
export class MarketingLandingPage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly shops = inject(ShopContextService);

  readonly brand = APP_BRAND;
  readonly demoEnabled = signal(false);
  readonly cashLabel = signal('$ 15.370');
  readonly closingsLabel = signal('6');
  readonly presentLabel = signal('4');
  busy = false;
  error = '';

  private destroyed = false;

  ngOnInit(): void {
    document.body.classList.add('auth-login');
    this.theme.lockLight(true);
    applyStatusBar(LANDING_STATUS, 'dark');

    if (this.auth.isAuthenticated()) {
      void this.router.navigateByUrl(
        defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId()),
      );
      return;
    }
    void this.initDemo();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    document.body.classList.remove('auth-login');
    this.theme.lockLight(false);
    resetStatusBar();
  }

  async startDemo(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      await this.auth.loginDemo();
      sessionStorage.setItem('crc_demo_tour', '1');
      await this.router.navigateByUrl('/admin/shop');
    } catch (err: unknown) {
      this.error = apiErrorMessage(err, 'La demo no está disponible ahora.');
      this.busy = false;
    }
  }

  private async initDemo(): Promise<void> {
    if (environment.demoLoginEnabled === true) {
      this.demoEnabled.set(true);
      return;
    }
    if (environment.demoLoginEnabled === false) {
      this.demoEnabled.set(false);
      return;
    }
    try {
      const ok = await this.auth.isDemoLoginAvailable();
      if (!this.destroyed) this.demoEnabled.set(ok);
    } catch {
      if (!this.destroyed) this.demoEnabled.set(false);
    }
  }
}
