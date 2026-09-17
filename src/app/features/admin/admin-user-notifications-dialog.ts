import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import type { EligibleNotification, ShopProfilePreferences } from '../profile/profile-api.service';

export type AdminUserNotificationsDialogData = {
  userId: string;
  fullName: string;
  shopId: string;
  shopName: string;
};

@Component({
  selector: 'app-admin-user-notifications-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>notifications</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Notificaciones</strong>
        <span>{{ data.fullName }} · {{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="aun__hint">
        Solo ves avisos que el local le habilitó. Apagá App, Mail o ambos.
      </p>

      @if (loading()) {
        <p class="aun__muted">Cargando…</p>
      } @else if (!eligible().length) {
        <p class="aun__muted">No tiene notificaciones habilitadas en este local.</p>
      } @else {
        <div class="aun__bulk" role="group" aria-label="Cambiar todos los canales">
          <div class="aun__bulk-group">
            <span class="aun__bulk-label">App</span>
            <button
              type="button"
              class="aun__bulk-btn"
              [disabled]="busy() || allChannelOn('app')"
              (click)="setAllChannel('app', false)"
            >
              Activar todas
            </button>
            <button
              type="button"
              class="aun__bulk-btn aun__bulk-btn--mute"
              [disabled]="busy() || allChannelOff('app')"
              (click)="setAllChannel('app', true)"
            >
              Apagar todas
            </button>
          </div>
          <div class="aun__bulk-group">
            <span class="aun__bulk-label">Mail</span>
            <button
              type="button"
              class="aun__bulk-btn"
              [disabled]="busy() || allChannelOn('email')"
              (click)="setAllChannel('email', false)"
            >
              Activar todas
            </button>
            <button
              type="button"
              class="aun__bulk-btn aun__bulk-btn--mute"
              [disabled]="busy() || allChannelOff('email')"
              (click)="setAllChannel('email', true)"
            >
              Apagar todas
            </button>
          </div>
        </div>

        <ul class="aun__list">
          @for (n of eligible(); track n.type; let i = $index) {
            <li
              class="aun__item"
              [class.aun__item--muted]="channelMuted(n, 'app') && channelMuted(n, 'email')"
              [style.--ni]="i"
            >
              <div class="aun__label">
                <span>{{ n.label }}</span>
                @if (channelMuted(n, 'app') && channelMuted(n, 'email')) {
                  <span class="aun__badge">Silenciada</span>
                } @else if (channelMuted(n, 'app')) {
                  <span class="aun__badge">Sin app</span>
                } @else if (channelMuted(n, 'email')) {
                  <span class="aun__badge">Sin mail</span>
                }
              </div>
              <div class="aun__channels">
                <label class="aun__channel">
                  <mat-slide-toggle
                    [checked]="!channelMuted(n, 'app')"
                    [disabled]="busy()"
                    [attr.aria-label]="'App: ' + n.label"
                    (change)="toggleChannel(n, 'app', !$event.checked)"
                  />
                  App
                </label>
                <label class="aun__channel">
                  <mat-slide-toggle
                    [checked]="!channelMuted(n, 'email')"
                    [disabled]="busy()"
                    [attr.aria-label]="'Mail: ' + n.label"
                    (change)="toggleChannel(n, 'email', !$event.checked)"
                  />
                  Mail
                </label>
              </div>
            </li>
          }
        </ul>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" type="button" (click)="ref.close()">
        Listo
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .aun__hint {
      margin: 0 0 0.85rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
      line-height: 1.45;
    }

    .aun__muted {
      margin: 0.35rem 0 0;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }

    .aun__bulk {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem 1rem;
      margin: 0 0 0.55rem;
      padding: 0.55rem 0.65rem;
      border: 1px solid color-mix(in srgb, var(--guy-border, #e5e5e5) 90%, transparent);
      border-radius: 10px;
      background: color-mix(in srgb, var(--guy-navy, #003366) 3%, #fff);
    }

    .aun__bulk-group {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
    }

    .aun__bulk-label {
      font-size: 0.72rem;
      font-weight: 750;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
      margin-right: 0.15rem;
    }

    .aun__bulk-btn {
      border: 1px solid color-mix(in srgb, var(--guy-navy, #003366) 22%, var(--guy-border, #e5e5e5));
      border-radius: 999px;
      background: #fff;
      color: var(--guy-navy, #003366);
      font: inherit;
      font-size: 0.75rem;
      font-weight: 650;
      line-height: 1.2;
      padding: 0.28rem 0.7rem;
      cursor: pointer;
    }

    .aun__bulk-btn:hover:not(:disabled) {
      background: color-mix(in srgb, var(--guy-navy, #003366) 6%, #fff);
    }

    .aun__bulk-btn--mute {
      border-color: color-mix(in srgb, #c62828 28%, var(--guy-border, #e5e5e5));
      color: #b71c1c;
    }

    .aun__bulk-btn--mute:hover:not(:disabled) {
      background: color-mix(in srgb, #c62828 7%, #fff);
    }

    .aun__bulk-btn:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .aun__list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .aun__item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 0;
      border-bottom: 1px solid color-mix(in srgb, var(--guy-border, #e5e5e5) 85%, transparent);
      min-height: 3rem;
    }

    .aun__item:last-child {
      border-bottom: 0;
    }

    .aun__item--muted .aun__label > span:first-child {
      opacity: 0.65;
    }

    .aun__label {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem 0.55rem;
      min-width: 0;
      font-weight: 650;
      color: var(--guy-navy, #003366);
      font-size: 0.92rem;
      line-height: 1.3;
    }

    .aun__channels {
      display: flex;
      flex-shrink: 0;
      gap: 0.85rem;
    }

    .aun__channel {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.15rem;
      font-size: 0.68rem;
      font-weight: 750;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--guy-muted, #666);
      cursor: pointer;
      margin: 0;
    }

    .aun__badge {
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--guy-muted, #666);
      padding: 0.1rem 0.45rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--guy-border, #e5e5e5) 55%, transparent);
    }
  `,
})
export class AdminUserNotificationsDialogComponent implements OnInit {
  readonly data = inject<AdminUserNotificationsDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AdminUserNotificationsDialogComponent>);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly prefs = signal<ShopProfilePreferences | null>(null);
  readonly eligible = computed(() => this.prefs()?.eligibleNotifications ?? []);

  private url(): string {
    return `${environment.apiUrl}/users/${this.data.userId}/notification-preferences`;
  }

  ngOnInit(): void {
    this.http
      .get<ShopProfilePreferences>(this.url(), {
        params: { shopId: this.data.shopId },
      })
      .subscribe({
        next: (p) => {
          this.prefs.set(p);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snack.open('No se pudieron cargar las notificaciones', 'OK', {
            duration: 3500,
          });
        },
      });
  }

  channelMuted(n: EligibleNotification, channel: 'app' | 'email'): boolean {
    if (channel === 'app') return n.mutedApp ?? n.muted;
    return n.mutedEmail ?? n.muted;
  }

  allChannelOn(channel: 'app' | 'email'): boolean {
    const rows = this.eligible();
    return rows.length > 0 && rows.every((n) => !this.channelMuted(n, channel));
  }

  allChannelOff(channel: 'app' | 'email'): boolean {
    const rows = this.eligible();
    return rows.length > 0 && rows.every((n) => this.channelMuted(n, channel));
  }

  private saveChannelMutes(app: string[], email: string[], okMsg?: string): void {
    this.busy.set(true);
    this.http
      .patch<ShopProfilePreferences>(
        this.url(),
        {
          mutedAppNotificationTypes: app,
          mutedEmailNotificationTypes: email,
        },
        { params: { shopId: this.data.shopId } },
      )
      .subscribe({
        next: (p) => {
          this.prefs.set(p);
          this.busy.set(false);
          if (okMsg) this.snack.open(okMsg, 'OK', { duration: 2200 });
        },
        error: () => {
          this.busy.set(false);
          this.snack.open('No se pudo actualizar la notificación', 'OK', {
            duration: 3500,
          });
        },
      });
  }

  setAllChannel(channel: 'app' | 'email', muted: boolean): void {
    if (!this.prefs()) return;
    const app: string[] = [];
    const email: string[] = [];
    for (const row of this.eligible()) {
      const appMuted = channel === 'app' ? muted : this.channelMuted(row, 'app');
      const emailMuted = channel === 'email' ? muted : this.channelMuted(row, 'email');
      if (appMuted) app.push(row.type);
      if (emailMuted) email.push(row.type);
    }
    const label = channel === 'app' ? 'App' : 'Mail';
    const okMsg = muted ? `${label}: todas apagadas` : `${label}: todas activadas`;
    this.saveChannelMutes(app, email, okMsg);
  }

  toggleChannel(n: EligibleNotification, channel: 'app' | 'email', muted: boolean): void {
    if (!this.prefs()) return;
    const app: string[] = [];
    const email: string[] = [];
    for (const row of this.eligible()) {
      const appMuted =
        row.type === n.type
          ? channel === 'app'
            ? muted
            : this.channelMuted(row, 'app')
          : this.channelMuted(row, 'app');
      const emailMuted =
        row.type === n.type
          ? channel === 'email'
            ? muted
            : this.channelMuted(row, 'email')
          : this.channelMuted(row, 'email');
      if (appMuted) app.push(row.type);
      if (emailMuted) email.push(row.type);
    }
    this.saveChannelMutes(app, email);
  }
}
