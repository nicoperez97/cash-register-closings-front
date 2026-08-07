import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { APP_BRAND } from '../../config/app-brand';
import { userRoleLabel } from '../../auth/auth.models';
import { ThemeService, ThemeMode } from '../../theme/theme.service';
import { OfflineService } from '../../offline/offline.service';
import { ShopContextService } from '../../shop/shop-context.service';
import {
  AppNotification,
  NotificationsApiService,
  notificationIcon,
  notificationToneClass,
} from '../../../features/payments/notifications-api.service';
import { NotificationsInboxService } from '../../../features/payments/notifications-inbox.service';
import { PushNotificationsService } from '../../../features/payments/push-notifications.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

export interface ToolbarUser {
  email: string;
  fullName?: string;
  role?: string;
  globalRole?: string;
}

@Component({
  selector: 'app-toolbar',
  imports: [MatIconModule, MatButtonModule, MatTooltipModule, MatMenuModule, MatSnackBarModule],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
})
export class ToolbarComponent implements OnInit {
  readonly brand = APP_BRAND;
  readonly theme = inject(ThemeService);
  readonly offline = inject(OfflineService);
  readonly shopContext = inject(ShopContextService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly notifsInbox = inject(NotificationsInboxService);
  readonly push = inject(PushNotificationsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly user = input<ToolbarUser | null>(null);
  readonly isMobile = input(false);
  readonly sidenavOpen = input(false);
  readonly menuToggle = output<void>();
  readonly logout = output<void>();

  readonly unreadCount = this.notifsInbox.unreadCount;
  readonly notifications = signal<AppNotification[]>([]);
  readonly loadingNotifs = signal(false);

  ngOnInit(): void {
    this.notifsInbox.ensureStarted();
    this.notifsInbox.refresh();
    void this.push.refreshStatus();
  }

  badgeLabel(count: number): string {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n > 9) return '9+';
    return String(n);
  }

  roleLabel(user?: ToolbarUser | null): string {
    return userRoleLabel(user?.globalRole ?? user?.role);
  }

  displayName(user: ToolbarUser): string {
    const name = user.fullName?.trim();
    return name || user.email;
  }

  setMode(mode: ThemeMode): void {
    this.theme.setMode(mode);
  }

  onPrimaryInput(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this.theme.setPrimary(value);
  }

  onAccentInput(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this.theme.setAccent(value);
  }

  logoSrc(): string {
    return this.shopContext.logoUrl();
  }

  openNotifications(): void {
    this.loadingNotifs.set(true);
    void this.push.refreshStatus();
    this.notificationsApi.list(this.shopContext.selectedShopId()).subscribe({
      next: (rows) => {
        this.notifications.set(rows);
        this.loadingNotifs.set(false);
      },
      error: () => {
        this.notifications.set([]);
        this.loadingNotifs.set(false);
      },
    });
  }

  async togglePush(): Promise<void> {
    if (this.push.busy()) return;
    if (this.push.subscribed()) {
      await this.push.disable();
      this.snack.open('Notificaciones push desactivadas', 'OK', { duration: 2500 });
      return;
    }
    const ok = await this.push.enable();
    if (ok) {
      this.snack.open('Notificaciones push activadas', 'OK', { duration: 2500 });
    } else {
      this.snack.open(this.push.lastError() || 'No se pudo activar push', 'OK', {
        duration: 4500,
      });
    }
  }

  markAllRead(): void {
    this.notificationsApi.markAllRead(this.shopContext.selectedShopId()).subscribe({
      next: () => {
        this.notifications.update((rows) => rows.map((n) => ({ ...n, read: true })));
        this.notifsInbox.refresh();
      },
    });
  }

  openNotification(n: AppNotification): void {
    if (!n.read) {
      this.notificationsApi.markRead(n.id).subscribe({
        next: () => {
          this.notifications.update((rows) =>
            rows.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
          );
          this.notifsInbox.refresh();
        },
      });
    }
    if (n.shopId && n.shopId !== this.shopContext.selectedShopId()) {
      this.shopContext.selectShop(n.shopId);
    }
    if (n.closingId || n.type === 'CLOSING_CREATED') {
      const path = n.closingId ? `/closings/${n.closingId}` : '/closings';
      void this.router.navigateByUrl(path);
      return;
    }
    if (n.type === 'CASH_WITHDRAWAL_PICKED') {
      void this.router.navigateByUrl('/cash-withdrawals');
      return;
    }
    if (n.type === 'PRODUCTION_HOURS_LOGGED') {
      void this.router.navigateByUrl('/production-attendance');
      return;
    }
    if (n.type === 'STOCK_BELOW_MINIMUM' || n.type === 'STOCK_SHARED') {
      void this.router.navigateByUrl('/stock');
      return;
    }
    if (
      n.type === 'BEVERAGE_STOCK_BELOW_MINIMUM' ||
      n.type === 'BEVERAGE_STOCK_SHARED'
    ) {
      void this.router.navigateByUrl('/beverage-stock');
      return;
    }
    if (n.paymentId || n.type.startsWith('PAYMENT_')) {
      void this.router.navigateByUrl('/payments/suppliers');
    }
  }

  notifIcon(type: string): string {
    return notificationIcon(type);
  }

  notifTone(type: string): string {
    return notificationToneClass(type);
  }
}
