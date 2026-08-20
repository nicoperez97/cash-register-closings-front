import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { KpiStripComponent, KpiItem } from '../../shared/components/kpi-strip';
import {
  BalanceAccountRow,
  BalancesTableComponent,
} from '../../shared/components/balances-table';
import { APP_BRAND } from '../../core/config/app-brand';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { canManageShop, hasShopPermission } from '../../core/auth/auth.models';
import { ClosingsApiService } from '../closings/closings-api.service';
import { closingMoneyColumns } from '../closings/closing-list-columns';
import { ExportMenuComponent, ExportFormat } from '../../shared/components/export-menu';
import { downloadColumnsPdf } from '../../shared/utils/table-pdf';
import { MovementsApiService } from '../movements/movements-api.service';
import { QuickExpenseDialogComponent } from '../movements/quick-expense-dialog';
import { PaymentsApiService } from '../payments/payments-api.service';
import { ReservationsInboxService } from '../reservations/reservations-inbox.service';
import { environment } from '../../../environments/environment';
import { usePageRefresh } from '../../core/page-refresh.service';
import { attendanceDaySharePayload } from '../../shared/utils/attendance-share';
import { shareText } from '../../shared/utils/share-text';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { EmployeesApiService } from '../employees/employees-api.service';
import { catchError, forkJoin, of } from 'rxjs';

interface AttendanceEmployee {
  employeeId: string;
  fullName: string;
  type?: 'FIXED' | 'ROTATING';
}

interface AttendanceMonthResponse {
  employees: Array<{
    employeeId: string;
    fullName: string;
    type?: 'FIXED' | 'ROTATING';
    days: Record<string, { isPresent?: boolean; isHoliday?: boolean } | undefined>;
  }>;
}

interface BalanceRowExt extends BalanceAccountRow {
  type?: string;
}

@Component({
  selector: 'app-home-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatDialogModule,
    PageHeaderComponent,
    KpiStripComponent,
    BalancesTableComponent,
    ExportMenuComponent,
  ],
  template: `
    <app-page-header
      [title]="shopContext.selectedShop()?.name ?? 'Inicio'"
      [subtitle]="headerSubtitle()"
      [actionLabel]="canCreateShop() ? 'Crear local' : canCreateClosing() ? 'Nuevo cierre' : ''"
      [actionIcon]="canCreateShop() ? 'add_business' : 'add'"
      [actionLarge]="true"
      (action)="canCreateShop() ? goCreateShop() : goCreate()"
    />

    @if (kpis().length) {
      <app-kpi-strip [items]="kpis()" class="mb-3" />
    }

    @if (canOpenReservations()) {
      <a
        class="panel-card mb-3 pending-reservations-card guy-enter-scale"
        [class.pending-reservations-card--warn]="pendingReservations() > 0"
        routerLink="/reservations"
      >
        <div class="pending-reservations-card__body">
          <div>
            <h2 class="pending-reservations-card__title">Reservas pendientes</h2>
            <p class="pending-reservations-card__hint">
              @if (pendingReservations() === 0) {
                Sin solicitudes web por aceptar
              } @else if (pendingReservations() === 1) {
                1 solicitud web por aceptar o rechazar
              } @else {
                {{ pendingReservations() }} solicitudes web por aceptar o rechazar
              }
            </p>
          </div>
          <div class="pending-reservations-card__right">
            <strong class="pending-reservations-card__count">{{ pendingReservations() }}</strong>
            <mat-icon>chevron_right</mat-icon>
          </div>
        </div>
      </a>
    }

    <div class="home-shortcuts guy-shortcuts guy-stagger mb-3">
      @if (canCreateShop()) {
        <a mat-stroked-button routerLink="/admin/shops">
          <mat-icon>add_business</mat-icon>
          Crear local
        </a>
      }
      @if (canReadClosings()) {
        <a mat-flat-button color="primary" routerLink="/closings">
          <mat-icon>point_of_sale</mat-icon>
          Cierres
        </a>
      }
        @if (canViewReports()) {
          <a mat-stroked-button routerLink="/reports">
            <mat-icon>insights</mat-icon>
            Reportes
          </a>
          @if (canExport()) {
            <app-export-menu label="Descargar" (pick)="onExportMonth($event)" />
          }
        }
      @if (canOpenReservations()) {
        <a mat-stroked-button routerLink="/reservations">
          <mat-icon>table_restaurant</mat-icon>
          Reservas
        </a>
      }
      @if (canOpenWaitingList()) {
        <a mat-stroked-button routerLink="/waiting-list">
          <mat-icon>hourglass_top</mat-icon>
          Lista de espera
        </a>
      }
      @if (canOpenTips()) {
        <a mat-stroked-button routerLink="/tips">
          <mat-icon>volunteer_activism</mat-icon>
          Propinas
        </a>
      }
      @if (canManageMovements()) {
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="quickExpenseBusy()"
          (click)="openQuickExpense()"
        >
          <mat-icon>payments</mat-icon>
          Gasto rápido
        </button>
      }
      @if (canViewPayments()) {
        <a mat-stroked-button routerLink="/payments/suppliers">
          <mat-icon>payments</mat-icon>
          Pagos
        </a>
      }
      @if (canEditShop()) {
        <a mat-stroked-button routerLink="/admin/shop">
          <mat-icon>storefront</mat-icon>
          Local
        </a>
      }
    </div>

    @if (canViewAttendance()) {
      <div class="panel-card mb-3 today-panel guy-enter-scale">
        <div class="today-panel__head">
          <div>
            <h2 class="today-panel__title">Hoy</h2>
            <p class="today-panel__date">
              {{ todayLabel() }}
              @if (isTodayClosed()) {
                · Franco
              }
            </p>
          </div>
          <div class="today-panel__actions">
            @if (attendanceEmployees().length && !isTodayClosed()) {
              <button
                mat-stroked-button
                type="button"
                [disabled]="sharingAttendance()"
                (click)="shareTodayAttendance()"
              >
                <mat-icon>share</mat-icon>
                Compartir
              </button>
            }
            @if (canManageAttendance() && !isTodayClosed()) {
              <button
                mat-stroked-button
                type="button"
                [disabled]="attendanceBusy() || !attendanceEmployees().length"
                (click)="markAllHolidayToday()"
              >
                <mat-icon>star</mat-icon>
                Todos feriado
              </button>
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="attendanceBusy() || !attendanceEmployees().length"
                (click)="markAllPresentToday()"
              >
                <mat-icon>done_all</mat-icon>
                Todos presentes
              </button>
            }
            <a mat-stroked-button routerLink="/attendance">
              <mat-icon>calendar_month</mat-icon>
              Ver mes
            </a>
          </div>
        </div>
        @if (isTodayClosed()) {
          <p class="text-muted small mb-0">Hoy es franco del local. No se marca presentismo.</p>
        } @else if (attendanceEmployees().length) {
          <div class="today-panel__chips">
            @for (emp of attendanceEmployees(); track emp.employeeId) {
              <button
                type="button"
                class="today-chip guy-chip-btn"
                [class.today-chip--present]="isPresentToday(emp.employeeId)"
                [class.guy-chip-btn--on]="isPresentToday(emp.employeeId)"
                [class.today-chip--rotating]="emp.type === 'ROTATING'"
                [disabled]="!canManageAttendance() || attendanceBusy() || isTodayClosed()"
                [title]="emp.type === 'ROTATING' ? 'Rotativo: no entra en Todos presentes' : ''"
                (click)="togglePresentToday(emp)"
              >
                <mat-icon>{{
                  isPresentToday(emp.employeeId) ? 'check_circle' : 'radio_button_unchecked'
                }}</mat-icon>
                {{ emp.fullName }}
              </button>
            }
          </div>
        } @else {
          <p class="text-muted small mb-0">No hay empleados activos para marcar hoy.</p>
        }
      </div>
    }

    @if (canViewBalances()) {
      <div class="panel-card panel-card--flush mb-3">
        <app-balances-table
          title="Saldos"
          subtitle="Cuentas del local activo"
          [accounts]="balanceRows()"
          [showFooter]="false"
          [shopId]="shopContext.selectedShopId()"
          [fileSlug]="shopContext.selectedShop()?.name ?? shopContext.selectedShop()?.slug ?? 'local'"
        />
      </div>
    }

    <p class="text-center text-muted mt-4 mb-0 small">{{ brand.tagline }}</p>
  `,
  styles: [
    `
      .today-panel__head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin-bottom: 0.85rem;
      }
      .today-panel__title {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
      }
      .today-panel__date {
        margin: 0.15rem 0 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
        text-transform: capitalize;
      }
      .today-panel__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
      }
      .today-panel__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .today-chip mat-icon {
        font-size: 1.15rem;
        width: 1.15rem;
        height: 1.15rem;
      }
      .today-chip--rotating:not(.today-chip--present) {
        border-style: dashed;
        opacity: 0.92;
      }
      .today-chip:disabled {
        opacity: 0.7;
        cursor: default;
      }
      .pending-reservations-card {
        display: block;
        text-decoration: none;
        color: inherit;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .pending-reservations-card:hover {
        border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 35%, var(--guy-border, #d7e0d9));
        box-shadow: 0 6px 18px rgba(0, 51, 102, 0.08);
      }
      .pending-reservations-card--warn {
        border-color: color-mix(in srgb, #c62828 28%, var(--guy-border, #d7e0d9));
        background: color-mix(in srgb, #c62828 5%, var(--guy-card, #fff));
      }
      .pending-reservations-card__body {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.85rem;
      }
      .pending-reservations-card__title {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
      }
      .pending-reservations-card__hint {
        margin: 0.2rem 0 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
      }
      .pending-reservations-card__right {
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
        flex-shrink: 0;
      }
      .pending-reservations-card__count {
        font-size: 1.55rem;
        font-weight: 800;
        line-height: 1;
        color: var(--guy-navy, #003366);
        font-variant-numeric: tabular-nums;
      }
      .pending-reservations-card--warn .pending-reservations-card__count {
        color: #c62828;
      }
      .pending-reservations-card__right mat-icon {
        color: var(--guy-muted, #5f6f76);
      }
    `,
  ],
})
export class HomePageComponent {
  readonly brand = APP_BRAND;
  readonly shopContext = inject(ShopContextService);
  readonly auth = inject(AuthService);
  private readonly api = inject(ClosingsApiService);
  private readonly movementsApi = inject(MovementsApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  private readonly paymentsApi = inject(PaymentsApiService);
  private readonly reservationsInbox = inject(ReservationsInboxService);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly router = inject(Router);
  readonly quickExpenseBusy = signal(false);

  private readonly reportSummary = signal<any>(null);
  private readonly refreshTick = signal(0);
  readonly balanceRows = signal<BalanceRowExt[]>([]);
  readonly attendanceBusy = signal(false);
  readonly sharingAttendance = signal(false);
  readonly attendanceEmployees = signal<AttendanceEmployee[]>([]);
  readonly todayMarks = signal<Record<string, { isPresent: boolean; isHoliday: boolean }>>({});
  readonly supplierPaymentsPending = signal<number | null>(null);
  readonly supplierPaymentsToValidateMine = signal<number | null>(null);
  readonly supplierPaymentsToPayMine = signal<number | null>(null);
  readonly servicePaymentsPending = signal<number | null>(null);
  readonly servicePaymentsToValidateMine = signal<number | null>(null);
  readonly servicePaymentsToPayMine = signal<number | null>(null);
  readonly employeePaymentsPending = signal<number | null>(null);
  readonly employeePaymentsToValidateMine = signal<number | null>(null);
  readonly employeePaymentsToPayMine = signal<number | null>(null);
  readonly pendingReservations = computed(() => this.reservationsInbox.pendingRequests());

  private readonly todayIso = this.toIso(new Date());

  readonly presentTodayCount = computed(() => {
    const marks = this.todayMarks();
    return this.attendanceEmployees().filter((e) => marks[e.employeeId]?.isPresent).length;
  });

  readonly cashBalance = computed(() => {
    const rows = this.balanceRows();
    const cash = rows.find(
      (a) => a.type === 'CHANNEL' && /efectivo/i.test(a.name),
    );
    if (cash) return Number(cash.balance ?? 0);
    const channels = rows.filter((a) => a.type === 'CHANNEL');
    if (!channels.length) return null;
    return channels.reduce((sum, a) => sum + Number(a.balance ?? 0), 0);
  });

  readonly kpis = computed((): KpiItem[] => {
    const items: KpiItem[] = [];
    const shopId = this.shopContext.selectedShopId();
    if (!shopId) return items;

    if (this.canViewAttendance()) {
      if (this.isTodayClosed()) {
        items.push({
          label: 'Presentes hoy',
          value: 'Franco',
          hint: 'Local cerrado',
          icon: 'hotel',
          route: '/attendance',
          tone: 'muted',
        });
      } else {
        const total = this.attendanceEmployees().length;
        const present = this.presentTodayCount();
        items.push({
          label: 'Presentes hoy',
          value: total ? `${present} / ${total}` : '—',
          hint: total ? (present === total ? 'Completo' : 'Presentismo') : 'Sin empleados',
          icon: 'event_available',
          route: '/attendance',
          tone: total && present === total ? 'ok' : total && present === 0 ? 'warn' : 'default',
        });
      }
    }

    if (this.canReadClosings() || this.canViewReports()) {
      const count = this.reportSummary()?.count;
      items.push({
        label: 'Cierres del mes',
        value: count != null ? count : '—',
        hint: this.periodLabel(),
        icon: 'point_of_sale',
        route: '/closings',
      });
    }

    if (this.canViewReports()) {
      const declared = this.reportSummary()?.totals?.declared;
      items.push({
        label: 'Total declarado',
        value:
          declared != null ? `$ ${Number(declared).toLocaleString('es-AR')}` : '—',
        hint: 'Mes en curso',
        icon: 'insights',
        route: '/reports',
      });
    }

    if (this.canViewPayments()) {
      const pushPaymentKpi = (
        label: string,
        pending: number | null,
        toValidate: number | null,
        toPay: number | null,
        route: string,
        icon: string,
      ) => {
        items.push({
          label,
          value: pending != null ? pending : '—',
          hint: pending === 0 ? 'Al día' : undefined,
          details:
            pending != null && pending > 0
              ? [
                  { label: 'A validar (vos)', value: toValidate ?? 0 },
                  { label: 'A pagar (vos)', value: toPay ?? 0 },
                ]
              : undefined,
          icon,
          route,
          tone: pending != null && pending > 0 ? 'warn' : pending === 0 ? 'ok' : 'default',
        });
      };

      pushPaymentKpi(
        'Pagos proveedores',
        this.supplierPaymentsPending(),
        this.supplierPaymentsToValidateMine(),
        this.supplierPaymentsToPayMine(),
        '/payments/suppliers',
        'storefront',
      );
      pushPaymentKpi(
        'Pagos servicios',
        this.servicePaymentsPending(),
        this.servicePaymentsToValidateMine(),
        this.servicePaymentsToPayMine(),
        '/payments/services',
        'home_repair_service',
      );
      pushPaymentKpi(
        'Pagos empleados',
        this.employeePaymentsPending(),
        this.employeePaymentsToValidateMine(),
        this.employeePaymentsToPayMine(),
        '/payments/employees',
        'badge',
      );
    }

    if (this.canViewBalances()) {
      const cash = this.cashBalance();
      const cashRow = this.balanceRows().find(
        (a) => a.type === 'CHANNEL' && /efectivo/i.test(a.name),
      );
      items.push({
        label: 'Efectivo en caja',
        value: cash != null ? this.formatMoney(cash) : '—',
        hint: cashRow ? cashRow.name : 'Suma canales',
        icon: 'account_balance_wallet',
        route: '/movements',
      });
    }

    return items;
  });

  constructor() {
    usePageRefresh(() => {
      this.refreshTick.update((n) => n + 1);
      if (this.canOpenReservations()) this.reservationsInbox.refresh();
    });
    effect(() => {
      this.refreshTick();
      const shopId = this.shopContext.selectedShopId();
      const user = this.auth.currentUser();
      const canViewReports = hasShopPermission(user, shopId, 'reports.view');
      const canReadClosings = hasShopPermission(user, shopId, 'closings.read');
      if (!shopId || (!canViewReports && !canReadClosings)) {
        this.reportSummary.set(null);
      } else {
        const { from, to } = this.monthRange();
        this.api.summary(shopId, { from, to }).subscribe({
          next: (s) => this.reportSummary.set(s),
          error: () => this.reportSummary.set(null),
        });
      }

      if (!shopId || !hasShopPermission(user, shopId, 'movements.read')) {
        this.balanceRows.set([]);
      } else {
        this.movementsApi.balances(shopId).subscribe({
          next: (res) =>
            this.balanceRows.set(
              (res.accounts ?? []).map((a: any) => ({
                name: a.name,
                balance: Number(a.balance ?? 0),
                type: a.type,
              })),
            ),
          error: () => this.balanceRows.set([]),
        });
      }

      if (!shopId || !this.canViewAttendance()) {
        this.attendanceEmployees.set([]);
        this.todayMarks.set({});
      } else {
        this.loadAttendanceToday(shopId);
      }

      if (!shopId || !this.canViewPayments()) {
        this.supplierPaymentsPending.set(null);
        this.supplierPaymentsToValidateMine.set(null);
        this.supplierPaymentsToPayMine.set(null);
        this.servicePaymentsPending.set(null);
        this.servicePaymentsToValidateMine.set(null);
        this.servicePaymentsToPayMine.set(null);
        this.employeePaymentsPending.set(null);
        this.employeePaymentsToValidateMine.set(null);
        this.employeePaymentsToPayMine.set(null);
      } else {
        this.paymentsApi.list(shopId).subscribe({
          next: (rows) => {
            const uid = this.auth.currentUser()?.id ?? null;
            const pending = rows.filter(
              (p) => p.status === 'PENDING_VALIDATION' || p.status === 'VALIDATED',
            );
            const suppliers = pending.filter((p) => !!p.supplierId);
            const services = pending.filter((p) => !!p.serviceId);
            const employees = pending.filter((p) => !p.supplierId && !p.serviceId);

            const mineValidate = (list: typeof pending) =>
              uid
                ? list.filter(
                    (p) =>
                      p.status === 'PENDING_VALIDATION' && p.validatorUserId === uid,
                  ).length
                : 0;
            const minePay = (list: typeof pending) =>
              uid
                ? list.filter((p) => p.status === 'VALIDATED' && p.payerUserId === uid)
                    .length
                : 0;

            this.supplierPaymentsPending.set(suppliers.length);
            this.supplierPaymentsToValidateMine.set(mineValidate(suppliers));
            this.supplierPaymentsToPayMine.set(minePay(suppliers));
            this.servicePaymentsPending.set(services.length);
            this.servicePaymentsToValidateMine.set(mineValidate(services));
            this.servicePaymentsToPayMine.set(minePay(services));
            this.employeePaymentsPending.set(employees.length);
            this.employeePaymentsToValidateMine.set(mineValidate(employees));
            this.employeePaymentsToPayMine.set(minePay(employees));
          },
          error: () => {
            this.supplierPaymentsPending.set(null);
            this.supplierPaymentsToValidateMine.set(null);
            this.supplierPaymentsToPayMine.set(null);
            this.servicePaymentsPending.set(null);
            this.servicePaymentsToValidateMine.set(null);
            this.servicePaymentsToPayMine.set(null);
            this.employeePaymentsPending.set(null);
            this.employeePaymentsToValidateMine.set(null);
            this.employeePaymentsToPayMine.set(null);
          },
        });
      }
    });
  }

  headerSubtitle(): string {
    const date = this.todayLabel();
    const shop = this.shopContext.selectedShop();
    if (shop) return `${date} · ${shop.name}`;
    if (this.canCreateShop()) return `${date} · Creá tu primer local`;
    return `${date} · Sin local asignado`;
  }

  todayLabel(): string {
    return new Date().toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  isTodayClosed(): boolean {
    const closed = this.shopContext.selectedShop()?.closedWeekdays ?? [];
    if (!closed.length) return false;
    return closed.includes(new Date().getDay());
  }

  periodLabel(): string {
    const { from, to } = this.monthRange();
    return `${this.formatDisplay(from)} – ${this.formatDisplay(to)}`;
  }

  formatMoney(value: number): string {
    return `$ ${Number(value).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  canReadClosings(): boolean {
    const shopId = this.shopContext.selectedShopId();
    return !!shopId && hasShopPermission(this.auth.currentUser(), shopId, 'closings.read');
  }

  canViewReports(): boolean {
    const shopId = this.shopContext.selectedShopId();
    return !!shopId && hasShopPermission(this.auth.currentUser(), shopId, 'reports.view');
  }

  canViewBalances(): boolean {
    const shopId = this.shopContext.selectedShopId();
    return !!shopId && hasShopPermission(this.auth.currentUser(), shopId, 'movements.read');
  }

  canManageMovements(): boolean {
    const shopId = this.shopContext.selectedShopId();
    return !!shopId && hasShopPermission(this.auth.currentUser(), shopId, 'movements.manage');
  }

  openQuickExpense(): void {
    const shopId = this.shopContext.selectedShopId();
    if (!shopId || !this.canManageMovements() || this.quickExpenseBusy()) return;
    this.quickExpenseBusy.set(true);
    forkJoin({
      accounts: this.movementsApi.accounts(shopId),
      concepts: this.movementsApi.concepts(shopId, 'movement'),
      employees: this.employeesApi.list(shopId).pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ accounts, concepts, employees }) => {
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
                employees: employees ?? [],
              },
            }),
            'Gasto rápido',
          )
          .afterClosed()
          .subscribe((saved) => {
            if (saved) this.refreshTick.update((n) => n + 1);
          });
      },
      error: () => {
        this.quickExpenseBusy.set(false);
        this.snack.open('No se pudieron cargar cuentas/conceptos', 'OK', { duration: 3500 });
      },
    });
  }

  canViewPayments(): boolean {
    const shopId = this.shopContext.selectedShopId();
    return !!shopId && hasShopPermission(this.auth.currentUser(), shopId, 'payments.read');
  }

  canExport(): boolean {
    const shopId = this.shopContext.selectedShopId();
    return !!shopId && hasShopPermission(this.auth.currentUser(), shopId, 'reports.export');
  }

  canCreateClosing(): boolean {
    const shopId = this.shopContext.selectedShopId();
    return !!shopId && hasShopPermission(this.auth.currentUser(), shopId, 'closings.create');
  }

  canCreateShop(): boolean {
    return this.auth.isSuperAdmin() && this.shopContext.shops().length === 0;
  }

  canViewAttendance(): boolean {
    const shopId = this.shopContext.selectedShopId();
    const user = this.auth.currentUser();
    return (
      !!shopId &&
      (hasShopPermission(user, shopId, 'attendance.read') ||
        hasShopPermission(user, shopId, 'attendance.manage'))
    );
  }

  canManageAttendance(): boolean {
    const shopId = this.shopContext.selectedShopId();
    return !!shopId && hasShopPermission(this.auth.currentUser(), shopId, 'attendance.manage');
  }

  canOpenReservations(): boolean {
    const shopId = this.shopContext.selectedShopId();
    const shop = this.shopContext.selectedShop();
    return (
      !!shopId &&
      !!shop?.reservationsEnabled &&
      hasShopPermission(this.auth.currentUser(), shopId, 'reservations.read')
    );
  }

  canOpenWaitingList(): boolean {
    const shopId = this.shopContext.selectedShopId();
    const shop = this.shopContext.selectedShop();
    return (
      !!shopId &&
      !!shop?.waitingListEnabled &&
      hasShopPermission(this.auth.currentUser(), shopId, 'waitingList.read')
    );
  }

  canOpenTips(): boolean {
    const shopId = this.shopContext.selectedShopId();
    const shop = this.shopContext.selectedShop();
    return (
      !!shopId &&
      !!shop?.tipsEnabled &&
      hasShopPermission(this.auth.currentUser(), shopId, 'tips.read')
    );
  }

  goCreate(): void {
    void this.router.navigate(['/closings/new']);
  }

  goCreateShop(): void {
    void this.router.navigate(['/admin/shops']);
  }

  canEditShop(): boolean {
    const shopId = this.shopContext.selectedShopId();
    return !!shopId && canManageShop(this.auth.currentUser(), shopId);
  }

  isPresentToday(employeeId: string): boolean {
    return !!this.todayMarks()[employeeId]?.isPresent;
  }

  async shareTodayAttendance(): Promise<void> {
    const shopName = this.shopContext.selectedShop()?.name ?? 'Local';
    const marks = this.todayMarks();
    const payload = attendanceDaySharePayload({
      shopName,
      dateLabel: this.todayLabel(),
      kind: 'servicio',
      employees: this.attendanceEmployees().map((emp) => {
        const m = marks[emp.employeeId];
        return {
          fullName: emp.fullName,
          present: !!m?.isPresent,
          holiday: !!m?.isHoliday,
        };
      }),
    });
    this.sharingAttendance.set(true);
    const result = await shareText(payload);
    this.sharingAttendance.set(false);
    if (result === 'copied') {
      this.snack.open('Presentismo copiado al portapapeles', 'OK', { duration: 2200 });
    } else if (result === 'failed') {
      this.snack.open('No se pudo compartir', 'OK', { duration: 3000 });
    }
  }

  togglePresentToday(emp: AttendanceEmployee): void {
    if (!this.canManageAttendance() || this.attendanceBusy() || this.isTodayClosed()) return;
    const shopId = this.shopContext.selectedShopId();
    if (!shopId) return;
    const cur = this.todayMarks()[emp.employeeId];
    const nextPresent = !this.isPresentToday(emp.employeeId);
    const dayIsHoliday = Object.values(this.todayMarks()).some((m) => m.isHoliday);
    const body: { employeeId: string; date: string; isPresent: boolean; isHoliday?: boolean } = {
      employeeId: emp.employeeId,
      date: this.todayIso,
      isPresent: nextPresent,
    };
    if (nextPresent && (!!cur?.isHoliday || dayIsHoliday)) {
      body.isHoliday = true;
    }
    this.attendanceBusy.set(true);
    this.http
      .post<{ isPresent: boolean; isHoliday: boolean }>(
        `${environment.apiUrl}/shops/${shopId}/attendance`,
        body,
      )
      .subscribe({
        next: (result) => {
          this.attendanceBusy.set(false);
          this.todayMarks.update((m) => ({
            ...m,
            [emp.employeeId]: {
              isPresent: !!result.isPresent,
              isHoliday: !!result.isHoliday,
            },
          }));
        },
        error: (err) => {
          this.attendanceBusy.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar la asistencia';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  markAllPresentToday(): void {
    const shopId = this.shopContext.selectedShopId();
    if (!shopId || !this.canManageAttendance() || this.attendanceBusy() || this.isTodayClosed())
      return;
    const fixed = this.attendanceEmployees().filter((e) => e.type !== 'ROTATING');
    if (!fixed.length) {
      this.snack.open('No hay empleados fijos para marcar', 'OK', { duration: 2500 });
      return;
    }
    this.attendanceBusy.set(true);
    const holiday = Object.values(this.todayMarks()).some((m) => m.isHoliday);
    const items = fixed.map((e) => ({
      employeeId: e.employeeId,
      date: this.todayIso,
      isPresent: true,
      ...(holiday ? { isHoliday: true } : {}),
    }));
    this.http.post(`${environment.apiUrl}/shops/${shopId}/attendance/bulk`, { items }).subscribe({
      next: () => {
        this.attendanceBusy.set(false);
        const next = { ...this.todayMarks() };
        for (const e of fixed) {
          next[e.employeeId] = {
            isPresent: true,
            isHoliday: holiday ? true : (next[e.employeeId]?.isHoliday ?? false),
          };
        }
        this.todayMarks.set(next);
        const skipped = this.attendanceEmployees().length - fixed.length;
        this.snack.open(
          skipped
            ? `Fijos marcados presentes (${skipped} rotativo${skipped === 1 ? '' : 's'} omitido${skipped === 1 ? '' : 's'})`
            : holiday
              ? 'Todos presentes (feriado)'
              : 'Todos marcados presentes hoy',
          'OK',
          { duration: 2500 },
        );
      },
      error: (err) => {
        this.attendanceBusy.set(false);
        const msg = err?.error?.message ?? 'No se pudo marcar el presentismo';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
      },
    });
  }

  markAllHolidayToday(): void {
    const shopId = this.shopContext.selectedShopId();
    if (!shopId || !this.canManageAttendance() || this.attendanceBusy() || this.isTodayClosed())
      return;
    const emps = this.attendanceEmployees();
    if (!emps.length) return;
    const allHoliday = emps.every((e) => !!this.todayMarks()[e.employeeId]?.isHoliday);
    const nextHoliday = !allHoliday;
    const items = emps.map((e) => ({
      employeeId: e.employeeId,
      date: this.todayIso,
      isHoliday: nextHoliday,
    }));
    this.attendanceBusy.set(true);
    this.http.post(`${environment.apiUrl}/shops/${shopId}/attendance/bulk`, { items }).subscribe({
      next: () => {
        this.attendanceBusy.set(false);
        const next = { ...this.todayMarks() };
        for (const e of emps) {
          next[e.employeeId] = {
            isPresent: next[e.employeeId]?.isPresent ?? false,
            isHoliday: nextHoliday,
          };
        }
        this.todayMarks.set(next);
        this.snack.open(
          nextHoliday ? 'Todos marcados feriado hoy' : 'Feriado quitado a todos',
          'OK',
          { duration: 2500 },
        );
      },
      error: (err) => {
        this.attendanceBusy.set(false);
        const msg = err?.error?.message ?? 'No se pudo marcar el feriado';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
      },
    });
  }

  private loadAttendanceToday(shopId: string): void {
    const now = new Date();
    this.http
      .get<AttendanceMonthResponse>(`${environment.apiUrl}/shops/${shopId}/attendance`, {
        params: {
          year: String(now.getFullYear()),
          month: String(now.getMonth() + 1),
        },
      })
      .subscribe({
        next: (data) => {
          const employees = (data.employees ?? []).map((e) => ({
            employeeId: e.employeeId,
            fullName: e.fullName,
            type: e.type === 'ROTATING' ? ('ROTATING' as const) : ('FIXED' as const),
          }));
          this.attendanceEmployees.set(employees);
          const marks: Record<string, { isPresent: boolean; isHoliday: boolean }> = {};
          for (const e of data.employees ?? []) {
            const cell = e.days?.[this.todayIso];
            marks[e.employeeId] = {
              isPresent: !!cell?.isPresent,
              isHoliday: !!cell?.isHoliday,
            };
          }
          this.todayMarks.set(marks);
        },
        error: () => {
          this.attendanceEmployees.set([]);
          this.todayMarks.set({});
        },
      });
  }

  async onExportMonth(format: ExportFormat): Promise<void> {
    if (format === 'pdf') {
      const shopId = this.shopContext.selectedShopId();
      const shop = this.shopContext.selectedShop();
      if (!shopId || !this.canExport()) return;
      const { from, to } = this.monthRange();
      this.api.list(shopId, { from, to }).subscribe({
        next: async (rows) => {
          await downloadColumnsPdf({
            title: 'Cierres del mes',
            subtitle: `${shop?.name ?? ''} · ${from} a ${to}`,
            filename: `cierres-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${from}_${to}.pdf`,
            columns: closingMoneyColumns(),
            rows,
          });
        },
        error: () => this.snack.open('No se pudo generar el PDF', 'OK', { duration: 3000 }),
      });
      return;
    }
    this.exportMonth();
  }

  exportMonth(): void {
    const shopId = this.shopContext.selectedShopId();
    const shop = this.shopContext.selectedShop();
    if (!shopId || !this.canExport()) return;
    const { from, to } = this.monthRange();
    this.api.exportExcel(shopId, { from, to }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cierres-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${from}_${to}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open('No se pudo exportar', 'OK', { duration: 3000 }),
    });
  }

  private shopFileSlug(name?: string | null): string {
    const raw = (name || 'local')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return raw || 'local';
  }

  private monthRange(): { from: string; to: string } {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      from: this.toIso(from),
      to: this.toIso(now),
    };
  }

  private toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private formatDisplay(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
}
