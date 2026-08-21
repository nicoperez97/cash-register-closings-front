import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
import { environment } from '../../../environments/environment';

/** Color del tope del gradiente de login (barra de estado móvil). */
const LOGIN_STATUS = '#070809';
const GSI_SCRIPT = 'https://accounts.google.com/gsi/client';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (res: { credential?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, string | number | boolean>,
          ) => void;
          cancel: () => void;
        };
      };
    };
  }
}

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
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly shops = inject(ShopContextService);
  private readonly mainPwa = inject(MainPwaInstallService);

  @ViewChild('googleBtn', { static: false }) googleBtn?: ElementRef<HTMLDivElement>;

  readonly brand = APP_BRAND;
  busy = false;
  error = '';
  hidePassword = true;
  readonly googleEnabled = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  private googleClientId = '';
  private destroyed = false;

  ngOnInit(): void {
    document.body.classList.add('auth-login');
    this.theme.lockLight(true);
    applyStatusBar(LOGIN_STATUS, 'dark');
    this.mainPwa.start();
    if (this.auth.isAuthenticated()) {
      void this.router.navigateByUrl(this.afterLoginUrl());
      return;
    }
    void this.initGoogle();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    document.body.classList.remove('auth-login');
    this.theme.lockLight(false);
    resetStatusBar();
    try {
      window.google?.accounts.id.cancel();
    } catch {
      // ignore
    }
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
      this.error = this.readApiError(err, 'Email o contraseña incorrectos.');
      this.form.enable({ emitEvent: false });
      this.busy = false;
    }
  }

  private async initGoogle(): Promise<void> {
    try {
      let clientId = (environment.googleClientId || '').trim();
      if (!clientId) {
        const cfg = await firstValueFrom(
          this.http.get<{ enabled: boolean; clientId: string | null }>(
            `${environment.apiUrl}/auth/google`,
          ),
        );
        if (!cfg.enabled || !cfg.clientId) return;
        clientId = cfg.clientId;
      }
      this.googleClientId = clientId;
      await this.loadGsiScript();
      if (this.destroyed) return;
      this.googleEnabled.set(true);
      // Esperar a que @if pinte #googleBtn
      setTimeout(() => {
        if (!this.destroyed) this.renderGoogleButton();
      }, 0);
    } catch {
      this.googleEnabled.set(false);
    }
  }

  private renderGoogleButton(): void {
    const el = this.googleBtn?.nativeElement;
    const g = window.google;
    if (!el || !g?.accounts?.id || !this.googleClientId) return;
    el.innerHTML = '';
    g.accounts.id.initialize({
      client_id: this.googleClientId,
      callback: (res) => void this.onGoogleCredential(res.credential),
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    g.accounts.id.renderButton(el, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      logo_alignment: 'left',
      width: el.clientWidth || 320,
    });
  }

  private async onGoogleCredential(credential?: string): Promise<void> {
    if (!credential || this.busy) return;
    this.busy = true;
    this.error = '';
    this.form.disable({ emitEvent: false });
    try {
      await this.auth.loginWithGoogle(credential);
      await this.router.navigateByUrl(this.afterLoginUrl());
    } catch (err: unknown) {
      this.error = this.readApiError(
        err,
        'No se pudo ingresar con Google. El correo tiene que existir en el sistema.',
      );
      this.form.enable({ emitEvent: false });
      this.busy = false;
    }
  }

  private loadGsiScript(): Promise<void> {
    if (window.google?.accounts?.id) return Promise.resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT}"]`);
    if (existing) {
      return new Promise((resolve, reject) => {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('GSI')), { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GSI_SCRIPT;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('GSI'));
      document.head.appendChild(script);
    });
  }

  private readApiError(err: unknown, fallback: string): string {
    const apiMsg = (err as { error?: { message?: string | string[] } })?.error?.message;
    const msg = Array.isArray(apiMsg) ? apiMsg.join(', ') : apiMsg;
    return typeof msg === 'string' && msg.trim() ? msg : fallback;
  }

  private afterLoginUrl(): string {
    return defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId());
  }
}
