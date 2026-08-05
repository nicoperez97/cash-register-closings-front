import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SwPush } from '@angular/service-worker';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationsInboxService } from './notifications-inbox.service';

type VapidResponse = { publicKey: string | null; enabled: boolean };

@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  private readonly http = inject(HttpClient);
  private readonly swPush = inject(SwPush);
  private readonly auth = inject(AuthService);
  private readonly inbox = inject(NotificationsInboxService);

  readonly supported = signal(this.detectSupport());
  readonly permission = signal<NotificationPermission | 'unsupported'>(
    this.detectSupport() ? Notification.permission : 'unsupported',
  );
  readonly subscribed = signal(false);
  readonly busy = signal(false);
  readonly lastError = signal<string | null>(null);
  readonly iosHomeScreenHint = signal(this.isIos() && !this.isStandalone());

  private listening = false;

  /** Escucha push en foreground para refrescar el badge. */
  ensureListening(): void {
    if (this.listening || !this.swPush.isEnabled) return;
    this.listening = true;
    this.swPush.messages.subscribe(() => {
      this.inbox.refresh();
    });
    this.swPush.notificationClicks.subscribe((ev) => {
      this.inbox.refresh();
      const url = (ev.notification?.data as { url?: string } | undefined)?.url;
      if (url && typeof window !== 'undefined') {
        // El SW ya navega; esto cubre algunos browsers
        void url;
      }
    });
  }

  private detectSupport(): boolean {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    );
  }

  private isIos(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  private isStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  }

  /** Estado actual de suscripción (llamar al iniciar sesión). */
  async refreshStatus(): Promise<void> {
    this.ensureListening();
    if (!this.detectSupport()) {
      this.supported.set(false);
      this.permission.set('unsupported');
      this.subscribed.set(false);
      this.iosHomeScreenHint.set(this.isIos() && !this.isStandalone());
      return;
    }
    this.supported.set(true);
    this.permission.set(Notification.permission);
    this.iosHomeScreenHint.set(this.isIos() && !this.isStandalone());
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      this.subscribed.set(!!sub);
    } catch {
      this.subscribed.set(false);
    }
  }

  async enable(): Promise<boolean> {
    this.lastError.set(null);
    if (!this.auth.getToken()) {
      this.lastError.set('Tenés que iniciar sesión');
      return false;
    }
    if (this.isIos() && !this.isStandalone()) {
      this.lastError.set(
        'En iPhone/iPad: compartí → “Agregar a pantalla de inicio” y abrí la app desde el ícono.',
      );
      this.iosHomeScreenHint.set(true);
      return false;
    }
    if (!this.detectSupport()) {
      this.lastError.set('Este navegador no soporta notificaciones push');
      return false;
    }
    if (!this.swPush.isEnabled) {
      this.lastError.set(
        'El service worker no está activo. Usá la app instalada / build de producción (HTTPS).',
      );
      return false;
    }

    this.busy.set(true);
    try {
      const vapid = await firstValueFrom(
        this.http.get<VapidResponse>(`${environment.apiUrl}/push/vapid-public-key`),
      );
      if (!vapid?.enabled || !vapid.publicKey) {
        this.lastError.set('Push no configurado en el servidor (faltan claves VAPID)');
        return false;
      }

      const permission = await Notification.requestPermission();
      this.permission.set(permission);
      if (permission !== 'granted') {
        this.lastError.set('Permiso de notificaciones denegado');
        return false;
      }

      const sub = await this.swPush.requestSubscription({
        serverPublicKey: vapid.publicKey,
      });
      const json = sub.toJSON();
      const p256dh = json.keys?.['p256dh'];
      const auth = json.keys?.['auth'];
      if (!json.endpoint || !p256dh || !auth) {
        this.lastError.set('Suscripción inválida del navegador');
        return false;
      }

      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/push/subscribe`, {
          endpoint: json.endpoint,
          keys: { p256dh, auth },
        }),
      );
      this.subscribed.set(true);
      return true;
    } catch (err) {
      const msg =
        (err as { error?: { message?: string | string[] } })?.error?.message ??
        (err as Error)?.message ??
        'No se pudo activar';
      this.lastError.set(Array.isArray(msg) ? msg.join(', ') : String(msg));
      return false;
    } finally {
      this.busy.set(false);
      await this.refreshStatus();
    }
  }

  async disable(): Promise<void> {
    this.busy.set(true);
    this.lastError.set(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        try {
          await firstValueFrom(
            this.http.delete(`${environment.apiUrl}/push/subscribe`, {
              params: { endpoint: sub.endpoint },
            }),
          );
        } catch {
          // igual intentamos desuscribir local
        }
        await sub.unsubscribe();
      }
      this.subscribed.set(false);
    } catch (err) {
      this.lastError.set((err as Error)?.message ?? 'No se pudo desactivar');
    } finally {
      this.busy.set(false);
      await this.refreshStatus();
    }
  }
}
