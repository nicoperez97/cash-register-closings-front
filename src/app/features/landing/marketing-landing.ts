import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
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

const LANDING_STATUS = '#05070a';

@Component({
  selector: 'app-marketing-landing',
  imports: [RouterLink, MatButtonModule, MatIconModule, BusyLabelComponent],
  templateUrl: './marketing-landing.html',
  styleUrl: './marketing-landing.scss',
  host: {
    '[style.--tilt-x]': 'tiltX()',
    '[style.--tilt-y]': 'tiltY()',
  },
})
export class MarketingLandingPage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly shops = inject(ShopContextService);

  readonly brand = APP_BRAND;
  readonly demoEnabled = signal(false);
  readonly cashLabel = signal('$ 0');
  readonly closingsLabel = signal('0');
  readonly presentLabel = signal('0');
  readonly tiltX = signal('0deg');
  readonly tiltY = signal('0deg');
  busy = false;
  error = '';

  private destroyed = false;
  private raf = 0;
  private reduceMotion = false;

  ngOnInit(): void {
    document.body.classList.add('auth-login');
    this.theme.lockLight(true);
    applyStatusBar(LANDING_STATUS, 'dark');
    this.reduceMotion =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (this.auth.isAuthenticated()) {
      void this.router.navigateByUrl(
        defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId()),
      );
      return;
    }
    void this.initDemo();
    this.animateCounters();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    document.body.classList.remove('auth-login');
    this.theme.lockLight(false);
    resetStatusBar();
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(ev: PointerEvent): void {
    if (this.reduceMotion || this.destroyed) return;
    if (typeof window === 'undefined' || window.innerWidth < 980) return;
    const nx = (ev.clientX / window.innerWidth) * 2 - 1;
    const ny = (ev.clientY / window.innerHeight) * 2 - 1;
    this.tiltY.set(`${(-nx * 5).toFixed(2)}deg`);
    this.tiltX.set(`${(ny * 3.2).toFixed(2)}deg`);
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

  private animateCounters(): void {
    if (this.reduceMotion) {
      this.cashLabel.set('$ 15.370');
      this.closingsLabel.set('6');
      this.presentLabel.set('4');
      return;
    }
    const start = performance.now();
    const duration = 1400;
    const tick = (now: number): void => {
      if (this.destroyed) return;
      const t = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      this.cashLabel.set(`$ ${Math.round(15370 * ease).toLocaleString('es-AR')}`);
      this.closingsLabel.set(String(Math.round(6 * ease)));
      this.presentLabel.set(String(Math.round(4 * ease)));
      if (t < 1) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
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
