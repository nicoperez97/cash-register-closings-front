import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { APP_BRAND } from '../../config/app-brand';
import { AuthService } from '../../auth/auth.service';
import {
  hasShopPermission,
  isCashierOnly,
  isProducerOnly,
  userRoleLabel,
} from '../../auth/auth.models';
import { ThemeService, ThemeMode } from '../../theme/theme.service';
import { OfflineService } from '../../offline/offline.service';
import { ShopContextService } from '../../shop/shop-context.service';
import { PageRefreshService } from '../../page-refresh.service';
import { DialogTitleService } from '../../../shared/services/dialog-title.service';
import { MovementsApiService } from '../../../features/movements/movements-api.service';
import { QuickExpenseDialogComponent } from '../../../features/movements/quick-expense-dialog';
import {
  AppNotification,
  NotificationsApiService,
  notificationIcon,
  notificationToneClass,
} from '../../../features/payments/notifications-api.service';
import { NotificationsInboxService } from '../../../features/payments/notifications-inbox.service';
import { PushNotificationsService } from '../../../features/payments/push-notifications.service';

export interface ToolbarUser {
  email: string;
  fullName?: string;
  role?: string;
  globalRole?: string;
}

type ToolbarQuickAction =
  | { id: string; kind: 'route'; label: string; icon: string; route: string }
  | { id: string; kind: 'action'; label: string; icon: string };

const QUICK_BTN = 38;
const QUICK_GAP = 6;
/** Espacio mínimo del spacer (no comerse el layout). */
const MIN_SPACER = 12;

@Component({
  selector: 'app-toolbar',
  imports: [
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatMenuModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
})
export class ToolbarComponent implements OnInit {
  readonly brand = APP_BRAND;
  readonly theme = inject(ThemeService);
  readonly offline = inject(OfflineService);
  readonly shopContext = inject(ShopContextService);
  readonly pageRefresh = inject(PageRefreshService);
  private readonly auth = inject(AuthService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly notifsInbox = inject(NotificationsInboxService);
  readonly push = inject(PushNotificationsService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly movementsApi = inject(MovementsApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly user = input<ToolbarUser | null>(null);
  readonly isMobile = input(false);
  readonly sidenavOpen = input(false);
  readonly menuToggle = output<void>();
  readonly logout = output<void>();

  readonly unreadCount = this.notifsInbox.unreadCount;
  readonly notifications = signal<AppNotification[]>([]);
  readonly loadingNotifs = signal(false);
  readonly quickExpenseBusy = signal(false);

  /** Ancho libre (px) para los accesos rápidos, medido en el DOM. */
  private readonly availableQuickWidth = signal(0);

  /**
   * Accesos filtrados por permiso del local activo.
   * Cajero / productor tienen atajos propios.
   */
  readonly quickActions = computed((): ToolbarQuickAction[] => {
    const user = this.auth.currentUser();
    const shopId = this.shopContext.selectedShopId();
    const shop = this.shopContext.selectedShop();
    if (!user || !shopId) return [];

    if (isCashierOnly(user, shopId)) {
      return [
        {
          id: 'new-closing',
          kind: 'route',
          label: 'Nuevo cierre',
          icon: 'point_of_sale',
          route: '/closings/new',
        },
      ];
    }

    if (isProducerOnly(user, shopId)) {
      const items: ToolbarQuickAction[] = [
        {
          id: 'my-hours',
          kind: 'route',
          label: 'Mis horas',
          icon: 'restaurant',
          route: '/my-production',
        },
      ];
      if (hasShopPermission(user, shopId, 'stock.read')) {
        items.push({
          id: 'stock',
          kind: 'route',
          label: 'Alimentos',
          icon: 'inventory',
          route: '/stock',
        });
      }
      if (hasShopPermission(user, shopId, 'beverageStock.read')) {
        items.push({
          id: 'beverage-stock',
          kind: 'route',
          label: 'Bebidas',
          icon: 'local_bar',
          route: '/beverage-stock',
        });
      }
      if (hasShopPermission(user, shopId, 'shortages.read')) {
        items.push({
          id: 'shortages',
          kind: 'route',
          label: 'Faltantes',
          icon: 'error_outline',
          route: '/shortages',
        });
      }
      return items;
    }

    const items: ToolbarQuickAction[] = [];
    if (hasShopPermission(user, shopId, 'movements.manage')) {
      items.push({
        id: 'quick-expense',
        kind: 'action',
        label: 'Gasto rápido',
        icon: 'payments',
      });
    }
    if (hasShopPermission(user, shopId, 'closings.read')) {
      items.push({
        id: 'closings',
        kind: 'route',
        label: 'Cierres',
        icon: 'point_of_sale',
        route: '/closings',
      });
    }
    if (hasShopPermission(user, shopId, 'shortages.read')) {
      items.push({
        id: 'shortages',
        kind: 'route',
        label: 'Faltantes',
        icon: 'error_outline',
        route: '/shortages',
      });
    }
    if (hasShopPermission(user, shopId, 'payments.read')) {
      items.push({
        id: 'payments',
        kind: 'route',
        label: 'Pagos',
        icon: 'local_shipping',
        route: '/payments/suppliers',
      });
    }
    if (
      shop?.reservationsEnabled &&
      hasShopPermission(user, shopId, 'reservations.read')
    ) {
      items.push({
        id: 'reservations',
        kind: 'route',
        label: 'Reservas',
        icon: 'table_restaurant',
        route: '/reservations',
      });
    }
    if (
      shop?.waitingListEnabled &&
      hasShopPermission(user, shopId, 'waitingList.read')
    ) {
      items.push({
        id: 'waiting-list',
        kind: 'route',
        label: 'Lista de espera',
        icon: 'hourglass_top',
        route: '/waiting-list',
      });
    }
    if (shop?.tipsEnabled && hasShopPermission(user, shopId, 'tips.read')) {
      items.push({
        id: 'tips',
        kind: 'route',
        label: 'Propinas',
        icon: 'volunteer_activism',
        route: '/tips',
      });
    }
    return items;
  });

  /**
   * Cuántos accesos caben en la barra según el ancho libre medido.
   * A más espacio → más botones en la toolbar; el resto va al menú.
   */
  readonly inlineQuickLimit = computed(() => {
    const all = this.quickActions().length;
    if (!all) return 0;
    const avail = this.availableQuickWidth();
    if (avail < QUICK_BTN) return 0;

    const slot = QUICK_BTN + QUICK_GAP;
    // Slots que entran (el +GAP compensa el gap “fantasma” del último).
    const maxSlots = Math.floor((avail + QUICK_GAP) / slot);
    if (maxSlots >= all) return all;
    // Reservar 1 slot para el botón "Más".
    return Math.max(0, Math.min(all - 1, maxSlots - 1));
  });

  readonly inlineQuickActions = computed(() =>
    this.quickActions().slice(0, this.inlineQuickLimit()),
  );

  readonly menuQuickActions = computed(() =>
    this.quickActions().slice(this.inlineQuickLimit()),
  );

  constructor() {
    afterNextRender(() => this.bindQuickSpaceObserver());

    effect(() => {
      this.quickActions();
      this.isMobile();
      this.user();
      this.inlineQuickLimit();
      queueMicrotask(() => this.measureQuickSpace());
    });
  }

  ngOnInit(): void {
    this.notifsInbox.ensureStarted();
    this.notifsInbox.refresh();
    void this.push.refreshStatus().then(() => this.push.promptEnableIfNeeded());
  }

  private bindQuickSpaceObserver(): void {
    if (typeof ResizeObserver === 'undefined') {
      this.measureQuickSpace();
      return;
    }
    const root = this.host.nativeElement.querySelector('.toolbar');
    if (!(root instanceof HTMLElement)) return;

    const ro = new ResizeObserver(() => {
      this.measureQuickSpace();
      // Segunda pasada tras pintar botones nuevos.
      requestAnimationFrame(() => this.measureQuickSpace());
    });
    ro.observe(root);
    const actions = root.querySelector('.toolbar-actions');
    if (actions instanceof HTMLElement) ro.observe(actions);
    this.destroyRef.onDestroy(() => ro.disconnect());
    this.measureQuickSpace();
  }

  private measureQuickSpace(): void {
    const root = this.host.nativeElement.querySelector('.toolbar');
    if (!(root instanceof HTMLElement)) return;

    const menu = root.querySelector('.toolbar-menu') as HTMLElement | null;
    const brand = root.querySelector('.toolbar-brand') as HTMLElement | null;
    const context = root.querySelector('.toolbar-context') as HTMLElement | null;
    const actions = root.querySelector('.toolbar-actions') as HTMLElement | null;

    const style = getComputedStyle(root);
    const gap = Number.parseFloat(style.columnGap || style.gap || '8') || 8;
    const pad =
      (Number.parseFloat(style.paddingLeft) || 0) +
      (Number.parseFloat(style.paddingRight) || 0);

    const visibleWidth = (el: HTMLElement | null) => {
      if (!el) return 0;
      if (getComputedStyle(el).display === 'none') return 0;
      return el.getBoundingClientRect().width;
    };

    // No restamos el bloque quick actual: medimos el hueco real disponible.
    const used =
      visibleWidth(menu) +
      visibleWidth(brand) +
      visibleWidth(context) +
      visibleWidth(actions) +
      pad;

    // Gaps fijos aprox: menu↔brand, brand↔quick, quick↔spacer, spacer↔actions
    const reservedGaps = gap * 3;
    const avail = root.clientWidth - used - reservedGaps - MIN_SPACER;
    const next = Math.max(0, Math.floor(avail));
    if (next !== this.availableQuickWidth()) {
      this.availableQuickWidth.set(next);
    }
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

  logoAlt(): string {
    return this.shopContext.selectedShop()?.name || this.brand.productName;
  }

  onLogoRefresh(): void {
    if (!this.pageRefresh.hasHandler() || this.pageRefresh.refreshing()) return;
    void this.pageRefresh.refresh();
  }

  onQuickAction(item: ToolbarQuickAction): void {
    if (item.kind !== 'action') return;
    if (item.id === 'quick-expense') this.openQuickExpense();
  }

  openQuickExpense(): void {
    const shopId = this.shopContext.selectedShopId();
    if (
      !shopId ||
      this.quickExpenseBusy() ||
      !hasShopPermission(this.auth.currentUser(), shopId, 'movements.manage')
    ) {
      return;
    }
    this.quickExpenseBusy.set(true);
    forkJoin({
      accounts: this.movementsApi.accounts(shopId),
      concepts: this.movementsApi.concepts(shopId),
    }).subscribe({
      next: ({ accounts, concepts }) => {
        this.quickExpenseBusy.set(false);
        this.dialogTitle
          .track(
            this.dialog.open(QuickExpenseDialogComponent, {
              width: '440px',
              maxWidth: '96vw',
              panelClass: 'guy-dialog',
              data: {
                shopId,
                shopName: this.shopContext.selectedShop()?.name ?? 'Local',
                accounts: accounts ?? [],
                concepts: concepts ?? [],
              },
            }),
            'Gasto rápido',
          )
          .afterClosed()
          .subscribe((saved) => {
            if (saved && this.pageRefresh.hasHandler()) {
              void this.pageRefresh.refresh();
            }
          });
      },
      error: () => {
        this.quickExpenseBusy.set(false);
        this.snack.open('No se pudieron cargar cuentas/conceptos', 'OK', {
          duration: 3500,
        });
      },
    });
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
    if (
      n.type === 'SHORTAGE_CREATED' ||
      n.type === 'SHORTAGE_LEVEL_LOW' ||
      n.type === 'SHORTAGE_RESOLVED'
    ) {
      void this.router.navigateByUrl('/shortages');
      return;
    }
    if (n.paymentId || n.type.startsWith('PAYMENT_')) {
      void this.router.navigateByUrl('/payments/suppliers');
      return;
    }
    if (n.type === 'RESERVATION_REQUEST') {
      void this.router.navigateByUrl('/reservations');
    }
  }

  notifIcon(type: string): string {
    return notificationIcon(type);
  }

  notifTone(type: string): string {
    return notificationToneClass(type);
  }
}
