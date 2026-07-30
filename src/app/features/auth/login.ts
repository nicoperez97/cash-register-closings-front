import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/auth/auth.service';
import { APP_BRAND } from '../../core/config/app-brand';
import { ThemeService } from '../../core/theme/theme.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { defaultHomeRoute } from '../../core/auth/auth.models';

const LOGIN_THEME = '#0E4F8C';
const APP_THEME = '#1D65A0';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
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
    this.setThemeColor(LOGIN_THEME);
    if (this.auth.isAuthenticated()) {
      void this.router.navigateByUrl(this.afterLoginUrl());
    }
  }

  ngOnDestroy(): void {
    document.body.classList.remove('auth-login');
    this.theme.lockLight(false);
    this.setThemeColor(APP_THEME);
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

  private setThemeColor(color: string): void {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', color);
  }
}
