import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { PushNotificationsService } from './push-notifications.service';

export type PushEnableDialogData = {
  iosHomeScreen: boolean;
  permissionDenied: boolean;
};

export type PushEnableDialogResult = 'enabled' | 'dismissed' | null;

@Component({
  selector: 'app-push-enable-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, BusyLabelComponent],
  template: `
    <div class="push-dlg" role="dialog" aria-labelledby="push-dlg-title" aria-describedby="push-dlg-desc">
      <div class="push-dlg__icon" aria-hidden="true">
        <mat-icon>{{ data.iosHomeScreen ? 'iphone' : 'notifications_active' }}</mat-icon>
      </div>

      <h2 id="push-dlg-title" class="push-dlg__title">
        @if (data.iosHomeScreen) {
          Instalá la app para recibir avisos
        } @else if (data.permissionDenied) {
          Notificaciones bloqueadas
        } @else {
          Activá las notificaciones
        }
      </h2>

      <p id="push-dlg-desc" class="push-dlg__lead">
        @if (data.iosHomeScreen) {
          En iPhone/iPad: tocá <strong>Compartir</strong> →
          <em>Agregar a pantalla de inicio</em> y abrí la app desde el ícono. Ahí vas a poder
          activar las notificaciones push.
        } @else if (data.permissionDenied) {
          El navegador tiene bloqueadas las notificaciones. Abrí la configuración del sitio y
          permití notificaciones para no perderte pagos, validaciones y avisos del local.
        } @else {
          Te avisamos cuando haya un pago para validar o pagar, y otros eventos importantes del
          local. Podés desactivarlas cuando quieras desde el panel de notificaciones.
        }
      </p>

      @if (error()) {
        <p class="push-dlg__error" role="alert">{{ error() }}</p>
      }

      <div class="push-dlg__actions">
        @if (!data.iosHomeScreen && !data.permissionDenied) {
          <button
            mat-flat-button
            color="primary"
            type="button"
            class="push-dlg__cta"
            [disabled]="busy()"
            (click)="enable()"
          >
            <app-busy-label [busy]="busy()" busyLabel="Activando…">
              <mat-icon>notification_add</mat-icon>
              Activar notificaciones
            </app-busy-label>
          </button>
        }
        <button mat-button type="button" [disabled]="busy()" (click)="dismiss()">
          {{ data.permissionDenied || data.iosHomeScreen ? 'Entendido' : 'Ahora no' }}
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .push-dlg {
      padding: 1.5rem 1.25rem 1.15rem;
      text-align: center;
      color: var(--guy-text, #1b2a33);
    }

    .push-dlg__icon {
      width: 3.5rem;
      height: 3.5rem;
      margin: 0 auto 1rem;
      border-radius: 1rem;
      display: grid;
      place-items: center;
      color: #fff;
      background: linear-gradient(
        145deg,
        color-mix(in srgb, var(--guy-primary, #1d65a0) 92%, #fff),
        var(--guy-navy-deep, #154a75)
      );
      box-shadow: 0 10px 24px color-mix(in srgb, var(--guy-primary, #1d65a0) 28%, transparent);
    }

    .push-dlg__icon mat-icon {
      font-size: 1.75rem;
      width: 1.75rem;
      height: 1.75rem;
    }

    .push-dlg__title {
      margin: 0 0 0.5rem;
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--guy-navy, #1d65a0);
      line-height: 1.25;
    }

    .push-dlg__lead {
      margin: 0 auto 1.15rem;
      max-width: 26rem;
      font-size: 0.92rem;
      line-height: 1.5;
      color: var(--guy-muted, #5f6f76);
    }

    .push-dlg__error {
      margin: -0.35rem 0 0.85rem;
      font-size: 0.82rem;
      font-weight: 600;
      color: #b42318;
    }

    .push-dlg__actions {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      align-items: stretch;
    }

    .push-dlg__cta {
      min-height: 44px;
      font-weight: 700 !important;
      border-radius: 999px !important;
    }
  `,
})
export class PushEnableDialogComponent {
  readonly data = inject<PushEnableDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<PushEnableDialogComponent, PushEnableDialogResult>);
  private readonly push = inject(PushNotificationsService);

  readonly busy = signal(false);
  readonly error = signal('');

  async enable(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const ok = await this.push.enable();
    this.busy.set(false);
    if (ok) {
      this.ref.close('enabled');
      return;
    }
    this.error.set(this.push.lastError() || 'No se pudo activar');
  }

  dismiss(): void {
    this.ref.close('dismissed');
  }
}
