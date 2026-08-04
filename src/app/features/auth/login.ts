import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth/auth.service';
import { APP_BRAND } from '../../core/config/app-brand';
import { ThemeService } from '../../core/theme/theme.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { defaultHomeRoute } from '../../core/auth/auth.models';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { MainPwaInstallBannerComponent } from '../../shared/components/main-pwa-install-banner';
import { MainPwaInstallService } from '../../core/pwa/main-pwa-install.service';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';

/** Color del tope del gradiente de login (barra de estado móvil). */
const LOGIN_STATUS = '#08263f';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    BusyLabelComponent,
    MainPwaInstallBannerComponent,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly shops = inject(ShopContextService);
  private readonly mainPwa = inject(MainPwaInstallService);

  readonly brand = APP_BRAND;
  busy = false;
  error = '';
  hidePassword = true;

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  ngOnInit(): void {
    document.body.classList.add('auth-login');
    this.theme.lockLight(true);
    applyStatusBar(LOGIN_STATUS, 'dark');
    this.mainPwa.start();
    if (this.auth.isAuthenticated()) {
      void this.router.navigateByUrl(this.afterLoginUrl());
    }
  }

  ngOnDestroy(): void {
    document.body.classList.remove('auth-login');
    this.theme.lockLight(false);
    resetStatusBar();
  }

  emailError(): string {
    const control = this.form.controls.email;
    if (control.hasError('required')) return 'Ingresá tu email.';
    if (control.hasError('email')) return 'El email no es válido.';
    return 'Revisá el email.';
  }

  passwordError(): string {
    if (this.form.controls.password.hasError('required')) {
      return 'Ingresá tu contraseña.';
    }
    return 'Revisá la contraseña.';
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.busy) {
      this.form.markAllAsTouched();
      this.error = '';
      return;
    }
    this.busy = true;
    this.error = '';
    this.form.disable({ emitEvent: false });
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
      await this.router.navigateByUrl(this.afterLoginUrl());
    } catch (err: unknown) {
      const apiMsg = (err as { error?: { message?: string | string[] } })?.error?.message;
      const msg = Array.isArray(apiMsg) ? apiMsg.join(', ') : apiMsg;
      this.error =
        typeof msg === 'string' && msg.trim()
          ? msg
          : 'Email o contraseña incorrectos.';
      this.form.enable({ emitEvent: false });
      this.busy = false;
    }
  }

  private afterLoginUrl(): string {
    return defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId());
  }
}
