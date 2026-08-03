import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
} from '../../../features/payments/notifications-api.service';
import { interval, startWith, switchMap } from 'rxjs';

export interface ToolbarUser {
  email: string;
  fullName?: string;
  role?: string;
  globalRole?: string;
}

@Component({
  selector: 'app-toolbar',
  imports: [MatIconModule, MatButtonModule, MatTooltipModule, MatMenuModule],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
})
export class ToolbarComponent implements OnInit {
  readonly brand = APP_BRAND;
  readonly theme = inject(ThemeService);
  readonly offline = inject(OfflineService);
  readonly shopContext = inject(ShopContextService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = input<ToolbarUser | null>(null);
  readonly isMobile = input(false);
  readonly sidenavOpen = input(false);
  readonly menuToggle = output<void>();
  readonly logout = output<void>();

  readonly unreadCount = signal(0);
  readonly notifications = signal<AppNotification[]>([]);
  readonly loadingNotifs = signal(false);

  ngOnInit(): void {
    interval(45000)
      .pipe(
        startWith(0),
        switchMap(() => this.notificationsApi.unreadCount(this.shopContext.selectedShopId())),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (r) => this.unreadCount.set(Math.max(0, Number(r?.count) || 0)),
        error: () => this.unreadCount.set(0),
      });
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

  markAllRead(): void {
    this.notificationsApi.markAllRead(this.shopContext.selectedShopId()).subscribe({
      next: () => {
        this.unreadCount.set(0);
        this.notifications.update((rows) => rows.map((n) => ({ ...n, read: true })));
      },
    });
  }

  openNotification(n: AppNotification): void {
    if (!n.read) {
      this.notificationsApi.markRead(n.id).subscribe({
        next: () => {
          this.unreadCount.update((c) => Math.max(0, c - 1));
          this.notifications.update((rows) =>
            rows.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
          );
        },
      });
    }
    if (n.paymentId || n.type.startsWith('PAYMENT_')) {
      void this.router.navigateByUrl('/payments/suppliers');
    }
  }
}
