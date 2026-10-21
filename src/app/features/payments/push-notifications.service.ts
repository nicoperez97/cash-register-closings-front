import { Injectable, inject, signal, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SwPush } from '@angular/service-worker';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { pathFromPushData } from '../../core/notifications/notification-deep-link';
import { NotificationsInboxService } from './notifications-inbox.service';
import { PageRefreshService } from '../../core/page-refresh.service';
import type { PushEnableDialogResult } from './push-enable-dialog';

type VapidResponse = { publicKey: string | null; enabled: boolean };

const PUSH_PROMPT_SNOOZE_KEY = 'crc_push_prompt_snooze_until';
/** No volver a pedir por 7 días si el usuario elige “Ahora no”. */
const PUSH_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  private readonly http = inject(HttpClient);
  private readonly swPush = inject(SwPush);
  private readonly auth = inject(AuthService);
  private readonly inbox = inject(NotificationsInboxService);
  private readonly pageRefresh = inject(PageRefreshService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly router = inject(Router);
  private readonly shops = inject(ShopContextService);

  readonly supported = signal(this.detectSupport());
  readonly permission = signal<NotificationPermission | 'unsupported'>(
    this.detectSupport() ? Notification.permission : 'unsupported',
  );
  readonly subscribed = signal(false);
  readonly busy = signal(false);
  readonly lastError = signal<string | null>(null);
  readonly iosHomeScreenHint = signal(this.isIos() && !this.isStandalone());

  private listening = false;
  private promptInFlight: Promise<void> | null = null;
  private promptedThisSession = false;

  /** Escucha push en foreground para refrescar el badge y abrir el deep link. */
  ensureListening(): void {
    if (this.listening) return;
    this.listening = true;
    if (this.swPush.isEnabled) {
      this.swPush.messages.subscribe(() => {
        this.inbox.refresh();
        this.pageRefresh.refreshFromInbox();
      });
      this.swPush.notificationClicks.subscribe((ev) => {
        this.inbox.refresh();
        this.pageRefresh.refreshFromInbox();
        this.openFromPush(ev.notification?.data);
      });
    }
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (ev: MessageEvent) => {
        const msg = ev.data as { type?: string; url?: string; data?: unknown } | undefined;
        if (msg?.type !== 'CRC_NOTIFICATION_CLICK') return;
        this.inbox.refresh();
        this.pageRefresh.refreshFromInbox();
        this.openFromPush(msg.data ?? { url: msg.url });
      });
      void this.consumePendingClick();
    }
  }

  private openFromPush(data: unknown): void {
    const path = pathFromPushData(
      data as {
        url?: string | null;
        type?: string | null;
        shopId?: string | null;
        paymentId?: string | null;
        closingId?: string | null;
        targetId?: string | null;
      },
    );
    if (!path || path === '/') return;
    try {
      const parsed = new URL(path, window.location.origin);
      const shop = parsed.searchParams.get('shop');
      if (shop) this.shops.selectShop(shop);
      void this.router.navigateByUrl(parsed.pathname + parsed.search + parsed.hash);
    } catch {
      void this.router.navigateByUrl(path);
    }
  }

  private async consumePendingClick(): Promise<void> {
    try {
      const cache = await caches.open('crc-push-pending');
      const res = await cache.match('/__crc_pending_click');
      if (!res) return;
      const url = (await res.text()).trim();
      await cache.delete('/__crc_pending_click');
      if (url) this.openFromPush({ url });
    } catch {
      // ignore
    }
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
    if (this.auth.isDemoMode()) {
      this.lastError.set('Las notificaciones push no están en la demo');
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

      await this.ensureServiceWorkerControlling();
      // Suscripción vieja (otra clave VAPID / SW anterior) suele romper el subscribe.
      await this.clearBrowserPushSubscription();

      const sub = await this.subscribeWithVapid(vapid.publicKey);
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
      this.lastError.set(this.friendlyPushError(err));
      return false;
    } finally {
      this.busy.set(false);
      await this.refreshStatus();
    }
  }

  /** Espera a que el SW controle esta pestaña (si no, el PushManager suele fallar). */
  private async ensureServiceWorkerControlling(): Promise<void> {
    if (navigator.serviceWorker.controller) return;
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => {
      const onChange = () => {
        navigator.serviceWorker.removeEventListener('controllerchange', onChange);
        resolve();
      };
      navigator.serviceWorker.addEventListener('controllerchange', onChange);
      window.setTimeout(() => {
        navigator.serviceWorker.removeEventListener('controllerchange', onChange);
        resolve();
      }, 2500);
    });
    if (!navigator.serviceWorker.controller) {
      throw new Error(
        'El service worker aún no controla esta pestaña. Recargá la app (F5) e intentá de nuevo.',
      );
    }
  }

  /** Quita una suscripción local previa (no toca el API). */
  private async clearBrowserPushSubscription(): Promise<void> {
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
    } catch {
      // ignore
    }
  }

  /**
   * Suscribe con clave VAPID paddeada vía PushManager nativo (más fiable que
   * SwPush.requestSubscription, que a veces falla con “push service error”).
   */
  private async subscribeWithVapid(publicKey: string): Promise<PushSubscription> {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.pushManager) {
      throw new Error('Este navegador no expone PushManager en el service worker');
    }
    const applicationServerKey = this.urlBase64ToUint8Array(publicKey);
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast: TS 5.7 tipa Uint8Array con ArrayBufferLike; el runtime espera Uint8Array.
      applicationServerKey: applicationServerKey as unknown as BufferSource,
    });
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  private isBraveBrowser(): boolean {
    const nav = navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } };
    return !!nav.brave || /Brave/i.test(navigator.userAgent || '');
  }

  private friendlyPushError(err: unknown): string {
    const raw =
      (err as { error?: { message?: string | string[] } })?.error?.message ??
      (err as Error)?.message ??
      'No se pudo activar';
    const msg = Array.isArray(raw) ? raw.join(', ') : String(raw);
    if (/service worker aún no controla/i.test(msg)) return msg;
    if (/push service error/i.test(msg)) {
      if (this.isBraveBrowser()) {
        return 'Brave bloquea el push de Google. En brave://settings/privacy activá “Use Google services for push messaging” y reintentá.';
      }
      return 'Chrome no pudo hablar con el servicio de push (FCM). Probá ventana de incógnito o https://gauntface.github.io/simple-push-demo — si ahí también falla, es el navegador/PC, no la app.';
    }
    if (/permission/i.test(msg) && /denied/i.test(msg)) {
      return 'Permiso de notificaciones denegado';
    }
    return msg;
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

  /**
   * Si el usuario está logueado y no tiene push activo, muestra un modal
   * pidiendo activarlas (con snooze de 7 días si dice “Ahora no”).
   */
  async promptEnableIfNeeded(): Promise<void> {
    if (this.promptInFlight) return this.promptInFlight;
    this.promptInFlight = this.runPromptEnableIfNeeded().finally(() => {
      this.promptInFlight = null;
    });
    return this.promptInFlight;
  }

  private async runPromptEnableIfNeeded(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;
    if (this.promptedThisSession) return;
    if (this.isSnoozed()) return;

    await this.refreshStatus();
    if (this.subscribed()) return;

    const iosHint = this.iosHomeScreenHint();
    const permission = this.permission();
    const canEnableNow =
      this.detectSupport() && this.swPush.isEnabled && permission !== 'unsupported';

    // En ng serve / sin SW no tiene sentido pedir push (salvo iOS “agregar a inicio”).
    if (!canEnableNow && !iosHint) {
      if (isDevMode()) return;
      if (permission === 'unsupported') return;
    }

    this.promptedThisSession = true;

    const { PushEnableDialogComponent } = await import('./push-enable-dialog');
    const result = await firstValueFrom(
      this.dialogTitle
        .track(
          this.dialog.open(PushEnableDialogComponent, {
            width: '420px',
            maxWidth: '95vw',
            panelClass: 'guy-dialog',
            autoFocus: 'dialog',
            data: {
              iosHomeScreen: iosHint,
              permissionDenied: permission === 'denied',
            },
          }),
          'Notificaciones push',
        )
        .afterClosed(),
    ) as PushEnableDialogResult;

    if (result === 'enabled') {
      this.clearSnooze();
      return;
    }
    // dismissed / cerrar: snooze (también en iOS / denied para no molestar cada refresh)
    this.setSnooze();
  }

  private isSnoozed(): boolean {
    try {
      const raw = localStorage.getItem(PUSH_PROMPT_SNOOZE_KEY);
      if (!raw) return false;
      const until = Number(raw);
      if (!Number.isFinite(until)) return false;
      return Date.now() < until;
    } catch {
      return false;
    }
  }

  private setSnooze(): void {
    try {
      localStorage.setItem(
        PUSH_PROMPT_SNOOZE_KEY,
        String(Date.now() + PUSH_PROMPT_SNOOZE_MS),
      );
    } catch {
      // ignore
    }
  }

  private clearSnooze(): void {
    try {
      localStorage.removeItem(PUSH_PROMPT_SNOOZE_KEY);
    } catch {
      // ignore
    }
  }
}
