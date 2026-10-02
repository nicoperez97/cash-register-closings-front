import {
  AfterViewInit,
  Component,
  ElementRef,
  Injectable,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth/auth.service';
import { DialogTitleService } from '../services/dialog-title.service';
import { FormDialogShellComponent } from './form-dialog-shell';
import { environment } from '../../../environments/environment';

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

export type AccountSwitchDialogMode = 'add' | 'elevate';

export type AccountSwitchDialogData = {
  mode: AccountSwitchDialogMode;
  /** En modo elevate: email de la cuenta destino (readonly). */
  email?: string;
  /** En modo elevate: userId esperado (opcional, para validar). */
  userId?: string;
};

@Component({
  selector: 'app-account-switch-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    FormDialogShellComponent,
  ],
  template: `
    <app-form-dialog-shell
      [title]="data.mode === 'add' ? 'Agregar cuenta' : 'Confirmar identidad'"
      [subtitle]="
        data.mode === 'add'
          ? 'Ingresá otra cuenta para tenerla abierta en esta sesión.'
          : 'Esta cuenta tiene más permisos. Ingresá la contraseña para continuar.'
      "
      [icon]="data.mode === 'add' ? 'person_add' : 'lock'"
      [busy]="busy()"
      [canSave]="form.valid"
      [saveLabel]="data.mode === 'add' ? 'Agregar' : 'Cambiar'"
      [busyLabel]="data.mode === 'add' ? 'Agregando…' : 'Cambiando…'"
      [saveIcon]="data.mode === 'add' ? 'person_add' : 'login'"
      (save)="submit()"
      (cancel)="ref.close(false)"
    >
      @if (error()) {
        <p class="acct-switch__error" role="alert">{{ error() }}</p>
      }

      <form [formGroup]="form" class="acct-switch__form" (ngSubmit)="submit()">
        <mat-form-field appearance="outline" class="w-100">
          <mat-label>Correo</mat-label>
          <input
            matInput
            type="email"
            formControlName="email"
            autocomplete="username"
            [readonly]="data.mode === 'elevate'"
          />
          <mat-icon matPrefix>mail</mat-icon>
          @if (form.controls.email.touched && form.controls.email.invalid) {
            <mat-error>{{ emailError() }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-100">
          <mat-label>Contraseña</mat-label>
          <input
            matInput
            [type]="hidePassword() ? 'password' : 'text'"
            formControlName="password"
            autocomplete="current-password"
          />
          <mat-icon matPrefix>lock</mat-icon>
          <button
            mat-icon-button
            matSuffix
            type="button"
            (click)="hidePassword.set(!hidePassword())"
            [attr.aria-label]="hidePassword() ? 'Mostrar contraseña' : 'Ocultar contraseña'"
          >
            <mat-icon>{{ hidePassword() ? 'visibility' : 'visibility_off' }}</mat-icon>
          </button>
          @if (form.controls.password.touched && form.controls.password.invalid) {
            <mat-error>Ingresá la contraseña.</mat-error>
          }
        </mat-form-field>
      </form>

      @if (googleEnabled()) {
        <div class="acct-switch__divider" aria-hidden="true"><span>o</span></div>
        <p class="acct-switch__google-hint">Solo si tu correo ya está dado de alta</p>
        <div #googleBtn class="acct-switch__google" role="presentation"></div>
      }
    </app-form-dialog-shell>
  `,
  styles: `
    .acct-switch__form {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-top: 0.25rem;
    }
    .acct-switch__error {
      margin: 0 0 0.75rem;
      padding: 0.65rem 0.75rem;
      border-radius: 10px;
      background: color-mix(in srgb, #c62828 10%, transparent);
      color: #b71c1c;
      font-size: 0.88rem;
      line-height: 1.35;
    }
    .acct-switch__divider {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 0.5rem 0 0.35rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.8rem;
    }
    .acct-switch__divider::before,
    .acct-switch__divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: color-mix(in srgb, var(--guy-border, #d7e0d9) 80%, transparent);
    }
    .acct-switch__google-hint {
      margin: 0 0 0.4rem;
      font-size: 0.78rem;
      color: var(--guy-muted, #5f6f76);
      text-align: center;
    }
    .acct-switch__google {
      display: flex;
      justify-content: center;
      min-height: 40px;
    }
    .w-100 {
      width: 100%;
    }
  `,
})
export class AccountSwitchDialogComponent implements AfterViewInit, OnDestroy {
  readonly data = inject<AccountSwitchDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AccountSwitchDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  @ViewChild('googleBtn') googleBtn?: ElementRef<HTMLDivElement>;

  readonly busy = signal(false);
  readonly error = signal('');
  readonly hidePassword = signal(true);
  readonly googleEnabled = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: [
      this.data.email ?? '',
      [Validators.required, Validators.email],
    ],
    password: ['', [Validators.required]],
  });

  private googleClientId = '';
  private destroyed = false;

  ngAfterViewInit(): void {
    if (this.data.mode === 'elevate' && this.data.email) {
      this.form.controls.email.disable({ emitEvent: false });
    }
    void this.initGoogle();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    try {
      window.google?.accounts.id.cancel();
    } catch {
      // ignore
    }
  }

  emailError(): string {
    const control = this.form.controls.email;
    if (control.hasError('required')) return 'Ingresá el email.';
    if (control.hasError('email')) return 'El email no es válido.';
    return 'Revisá el email.';
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.form.disable({ emitEvent: false });
    try {
      const email =
        this.data.mode === 'elevate'
          ? (this.data.email ?? this.form.getRawValue().email)
          : this.form.getRawValue().email;
      const { password } = this.form.getRawValue();
      await this.auth.login(email, password);
      if (this.data.mode === 'elevate' && this.data.userId) {
        const active = this.auth.currentUser();
        if (active && active.id !== this.data.userId) {
          throw new Error('La cuenta no coincide con la seleccionada.');
        }
      }
      this.ref.close(true);
    } catch (err: unknown) {
      this.error.set(this.readApiError(err, 'Email o contraseña incorrectos.'));
      this.form.enable({ emitEvent: false });
      if (this.data.mode === 'elevate') {
        this.form.controls.email.disable({ emitEvent: false });
      }
      this.busy.set(false);
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
      width: Math.min(el.clientWidth || 320, 320),
    });
  }

  private async onGoogleCredential(credential?: string): Promise<void> {
    if (!credential || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.form.disable({ emitEvent: false });
    try {
      await this.auth.loginWithGoogle(credential);
      if (this.data.mode === 'elevate' && this.data.userId) {
        const active = this.auth.currentUser();
        if (active && active.id !== this.data.userId) {
          throw new Error(
            'Ingresaste con otra cuenta. Usá el mismo correo que querés activar.',
          );
        }
      }
      if (this.data.mode === 'elevate' && this.data.email) {
        const active = this.auth.currentUser();
        if (
          active &&
          active.email.toLowerCase() !== this.data.email.toLowerCase()
        ) {
          throw new Error(
            'Ingresaste con otra cuenta. Usá el mismo correo que querés activar.',
          );
        }
      }
      this.ref.close(true);
    } catch (err: unknown) {
      this.error.set(
        this.readApiError(
          err,
          'No se pudo ingresar con Google. El correo tiene que existir en el sistema.',
        ),
      );
      this.form.enable({ emitEvent: false });
      if (this.data.mode === 'elevate') {
        this.form.controls.email.disable({ emitEvent: false });
      }
      this.busy.set(false);
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
    if (err instanceof Error && err.message && !('error' in err)) {
      return err.message;
    }
    const apiMsg = (err as { error?: { message?: string | string[] } })?.error?.message;
    const msg = Array.isArray(apiMsg) ? apiMsg.join(', ') : apiMsg;
    return typeof msg === 'string' && msg.trim() ? msg : fallback;
  }
}

@Injectable({ providedIn: 'root' })
export class AccountSwitchDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);

  open(data: AccountSwitchDialogData): Promise<boolean> {
    const title = data.mode === 'add' ? 'Agregar cuenta' : 'Confirmar identidad';
    return firstValueFrom(
      this.dialogTitle
        .track(
          this.dialog.open(AccountSwitchDialogComponent, {
            data,
            width: '420px',
            maxWidth: '95vw',
            panelClass: 'guy-dialog',
            disableClose: false,
          }),
          title,
        )
        .afterClosed(),
    ).then((r) => !!r);
  }
}
