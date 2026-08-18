import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { ClosingsApiService } from '../closings/closings-api.service';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { PaymentsApiService, PaymentStatus, ShopPayment, paymentPriorityRank } from './payments-api.service';
import { PaymentCardComponent } from './payment-card';
import { PaymentsFiltersPanelComponent } from './payments-filters-panel';
import { compareDueDate, PAYMENT_STATUS_LABEL } from './payments-display.util';
import { PaymentsInboxService } from './payments-inbox.service';
import { isUserVisible } from '../../shared/user-visibility';
import type { UserVisibility } from '../../shared/user-visibility';
import { PaymentDialogComponent } from './payment-dialog';
import { PaymentPayDialogComponent } from './payment-pay-dialog';
import { SuppliersApiService, ShopSupplier } from '../suppliers/suppliers-api.service';
import { ServicesApiService, ShopService } from '../services/services-api.service';
import { Employee, EmployeesApiService } from '../employees/employees-api.service';
import { MovementsApiService, Concept } from '../movements/movements-api.service';
import { usePageRefresh } from '../../core/page-refresh.service';
import { takeInputFile } from '../../shared/utils/input-file';
import { RecordSavedDialogComponent } from '../../shared/components/record-saved-dialog';
import {
  paymentPaidDialogData,
  paymentsSharePayload,
} from '../../shared/components/record-share-builders';
import { shareText } from '../../shared/utils/share-text';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { SpinnerComponent } from '../../shared/components/spinner';
import { firstValueFrom } from 'rxjs';
import {
  buildPaymentsListFilterOpts,
  countActivePaymentFilters,
} from './payments-list-query';
import {
  buildPaymentDialogAccounts,
  buildPaymentDialogUsers,
  clearedFiltersForDeepLink,
  downloadBlobFile,
  filterActivePaymentAccounts,
  loadPaymentsViewMode,
  mapShopUsersForPayments,
  paymentsExportFilename,
  savePaymentsViewMode,
  paymentMatchesKind,
  shouldRedirectPaymentKind,
  type PaymentKind,
  type PaymentsViewMode,
} from './payments-page-actions';

@Component({
  selector: 'app-payments-page',
  imports: [
    PageHeaderComponent,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatMenuModule,
    MatSnackBarModule,
    SpinnerComponent,
    PaymentCardComponent,
    PaymentsFiltersPanelComponent,
  ],
  template: `
    <app-page-header
      [title]="pageTitle()"
      [subtitle]="pageSubtitle()"
      [actionLabel]="canManage() ? 'Nuevo pago' : ''"
      actionIcon="add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    <app-payments-filters-panel
      [collapsed]="filtersCollapsed()"
      [activeFilterCount]="activeFilterCount()"
      [viewMode]="viewMode()"
      [selecting]="selecting()"
      [exporting]="exporting()"
      [shopId]="shopId()"
      [mineOnly]="mineOnly()"
      [kind]="kind()"
      [currentUserId]="currentUserId()"
      [statusOptions]="statusOptions"
      [filterUsers]="filterUsers()"
      [suppliers]="suppliers()"
      [services]="services()"
      [employees]="employees()"
      [statusFilter]="statusFilter"
      [validatorFilter]="validatorFilter"
      [payerFilter]="payerFilter"
      [dueRange]="dueRange"
      [paidRange]="paidRange"
      [supplierFilter]="supplierFilter"
      [serviceFilter]="serviceFilter"
      [employeeFilter]="employeeFilter"
      [amountMinFilter]="amountMinFilter"
      [amountMaxFilter]="amountMaxFilter"
      (viewModeChange)="onViewMode($event)"
      (toggleSelecting)="toggleSelecting()"
      (exportExcel)="exportExcel()"
      (toggleFilters)="toggleFilters()"
      (filterMine)="filterMine()"
    />

    <div
      class="pay-list"
      [class.pay-list--cards]="viewMode() === 'cards'"
      [class.pay-list--list]="viewMode() === 'list'"
    >
      @if (loading()) {
        <div class="panel-card guy-empty guy-empty--loading" role="status" aria-live="polite" aria-busy="true">
          <app-spinner [size]="28" tone="accent" />
          <div>
            <strong>Cargando…</strong>
            <div class="small">Obteniendo pagos</div>
          </div>
        </div>
      } @else {
        @for (p of visibleRows(); track p.id) {
          <app-payment-card
            [payment]="p"
            [viewMode]="viewMode()"
            [selecting]="selecting()"
            [selected]="isSelected(p.id)"
            [focused]="focusedPaymentId() === p.id"
            [payBusy]="actionBusyId() === p.id"
            [kind]="kind()"
            [canManage]="canManage()"
            (click)="onCardClick(p, $event)"
            (toggleSelected)="toggleSelected(p)"
            (changed)="reload({ preserveScroll: true })"
            (payRequested)="pay($event)"
            (editRequested)="openEdit($event)"
            (duplicateRequested)="openDuplicate($event)"
            (receiptPickRequested)="startReceiptPick($event)"
          />
        } @empty {
        <div class="panel-card guy-empty">
          <mat-icon>{{ emptyIcon() }}</mat-icon>
          <div>
            <strong>{{ emptyTitle() }}</strong>
            <div class="small">{{ emptyHint() }}</div>
          </div>
        </div>
      }
      }
    </div>

    <input
      #receiptPicker
      type="file"
      accept="application/pdf,image/*"
      hidden
      (change)="onSharedReceiptPicked($event)"
    />

    @if (selecting()) {
      <div class="pay-select-bar" role="toolbar" aria-label="Pagos seleccionados">
        <span class="pay-select-bar__count">{{ selectedCount() }} seleccionados</span>
        <button mat-stroked-button type="button" (click)="selectAllVisible()">
          Todos
        </button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="!selectedCount()"
          (click)="shareSelected()"
        >
          <mat-icon>share</mat-icon>
          Compartir
        </button>
      </div>
    }
  `,
  styleUrl: './payments-page.scss',
})
export class PaymentsPage {
  private readonly filtersUi = createFiltersCollapsed('payments');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  private readonly api = inject(PaymentsApiService);
  private readonly suppliersApi = inject(SuppliersApiService);
  private readonly servicesApi = inject(ServicesApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  private readonly movementsApi = inject(MovementsApiService);
  private readonly closingsApi = inject(ClosingsApiService);
  private readonly paymentsInbox = inject(PaymentsInboxService);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  readonly shops = inject(ShopContextService);

  /** Pago resaltado al abrir un enlace directo (?payment=…). */
  readonly focusedPaymentId = signal<string | null>(null);
  private deepLinkHandled = false;
  private focusClearTimer: ReturnType<typeof setTimeout> | null = null;
  /** Scroll a restaurar tras un reload suave (validar/pagar/etc.). */
  private pendingScrollY: number | null = null;

  private readonly routeData = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });

  readonly kind = computed<PaymentKind>(() => {
    const k = this.routeData()['paymentKind'];
    if (k === 'employee') return 'employee';
    if (k === 'service') return 'service';
    return 'supplier';
  });
  readonly isSupplierKind = computed(() => this.kind() === 'supplier');

  readonly pageTitle = computed(() => {
    if (this.kind() === 'service') return 'Pagos a servicios';
    return this.isSupplierKind() ? 'Pagos a proveedores' : 'Pagos a empleados';
  });
  readonly pageSubtitle = computed(() => {
    const shop = this.shops.selectedShop()?.name ?? 'Sin local';
    if (this.kind() === 'service') return `${shop} · con servicio asignado`;
    return this.isSupplierKind()
      ? `${shop} · con proveedor asignado`
      : `${shop} · internos (sueldos, reintegros, etc.)`;
  });
  readonly emptyTitle = computed(() => {
    if (this.kind() === 'service') return 'Sin pagos a servicios';
    return this.isSupplierKind() ? 'Sin pagos a proveedores' : 'Sin pagos a empleados';
  });
  readonly emptyHint = computed(() => {
    if (this.kind() === 'service') return 'Creá un pago y asignale un servicio.';
    return this.isSupplierKind()
      ? 'Creá un pago y asignale un proveedor.'
      : 'Creá un pago sin proveedor ni servicio para esta sección.';
  });
  readonly emptyIcon = computed(() => {
    if (this.kind() === 'service') return 'home_repair_service';
    return this.isSupplierKind() ? 'local_shipping' : 'badge';
  });

  readonly rows = signal<ShopPayment[]>([]);
  readonly loading = signal(true);
  readonly actionBusyId = signal<string | null>(null);
  readonly viewMode = signal<PaymentsViewMode>(loadPaymentsViewMode());
  readonly selecting = signal(false);
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly users = signal<
    Array<{
      id: string;
      fullName: string;
      visibility?: Partial<UserVisibility> | null;
      hideFromCashWithdraw?: boolean;
    }>
  >([]);
  readonly accounts = signal<Array<{ id: string; name: string }>>([]);
  readonly suppliers = signal<ShopSupplier[]>([]);
  readonly services = signal<ShopService[]>([]);
  readonly employees = signal<Employee[]>([]);
  readonly concepts = signal<Array<{ id: string; name: string; description?: string | null }>>([]);
  readonly statusFilter = new FormControl<PaymentStatus[]>(
    ['PENDING_VALIDATION', 'VALIDATED'],
    { nonNullable: true },
  );
  readonly validatorFilter = new FormControl<string[]>([], { nonNullable: true });
  readonly payerFilter = new FormControl<string[]>([], { nonNullable: true });
  readonly dueRange = this.fb.group({
    start: this.fb.control<Date | null>(null),
    end: this.fb.control<Date | null>(null),
  });
  readonly paidRange = this.fb.group({
    start: this.fb.control<Date | null>(null),
    end: this.fb.control<Date | null>(null),
  });
  readonly supplierFilter = new FormControl<string[]>([], { nonNullable: true });
  readonly serviceFilter = new FormControl<string[]>([], { nonNullable: true });
  readonly employeeFilter = new FormControl<string[]>([], { nonNullable: true });
  readonly amountMinFilter = new FormControl<number | null>(null);
  readonly amountMaxFilter = new FormControl<number | null>(null);
  readonly mineOnly = signal(false);
  readonly exporting = signal(false);

  readonly statusOptions = (
    Object.entries(PAYMENT_STATUS_LABEL) as Array<[PaymentStatus, string]>
  ).map(([value, label]) => ({ value, label }));

  private readonly statusFilterValue = toSignal(this.statusFilter.valueChanges, {
    initialValue: this.statusFilter.value,
  });
  private readonly validatorFilterValue = toSignal(this.validatorFilter.valueChanges, {
    initialValue: this.validatorFilter.value,
  });
  private readonly payerFilterValue = toSignal(this.payerFilter.valueChanges, {
    initialValue: this.payerFilter.value,
  });
  private readonly dueRangeValue = toSignal(this.dueRange.valueChanges, {
    initialValue: this.dueRange.getRawValue(),
  });
  private readonly paidRangeValue = toSignal(this.paidRange.valueChanges, {
    initialValue: this.paidRange.getRawValue(),
  });
  private readonly supplierFilterValue = toSignal(this.supplierFilter.valueChanges, {
    initialValue: this.supplierFilter.value,
  });
  private readonly serviceFilterValue = toSignal(this.serviceFilter.valueChanges, {
    initialValue: this.serviceFilter.value,
  });
  private readonly employeeFilterValue = toSignal(this.employeeFilter.valueChanges, {
    initialValue: this.employeeFilter.value,
  });
  private readonly amountMinFilterValue = toSignal(this.amountMinFilter.valueChanges, {
    initialValue: this.amountMinFilter.value,
  });
  private readonly amountMaxFilterValue = toSignal(this.amountMaxFilter.valueChanges, {
    initialValue: this.amountMaxFilter.value,
  });

  readonly currentUserId = computed(() => this.auth.currentUser()?.id ?? '');

  /** Usuarios del local sin duplicar la opción "Yo". */
  readonly filterUsers = computed(() => {
    const me = this.currentUserId();
    return this.users().filter(
      (u) => u.id !== me && isUserVisible(u, 'payments'),
    );
  });

  readonly activeFilterCount = computed(() =>
    countActivePaymentFilters({
      statusCount: this.statusFilterValue()?.length ?? 0,
      mineOnly: this.mineOnly(),
      validatorCount: this.validatorFilterValue()?.length ?? 0,
      payerCount: this.payerFilterValue()?.length ?? 0,
      dueStart: this.dueRangeValue()?.start,
      dueEnd: this.dueRangeValue()?.end,
      paidStart: this.paidRangeValue()?.start,
      paidEnd: this.paidRangeValue()?.end,
      isSupplierKind: this.isSupplierKind(),
      kind: this.kind(),
      supplierCount: this.supplierFilterValue()?.length ?? 0,
      serviceCount: this.serviceFilterValue()?.length ?? 0,
      employeeCount: this.employeeFilterValue()?.length ?? 0,
      amountMin: this.amountMinFilterValue(),
      amountMax: this.amountMaxFilterValue(),
    }),
  );

  readonly shopId = computed(() => this.shops.selectedShopId());

  readonly visibleRows = computed(() => {
    const list = this.rows().filter((p) => paymentMatchesKind(p, this.kind()));
    return [...list].sort((a, b) => {
      const byPrio = paymentPriorityRank(a.priority) - paymentPriorityRank(b.priority);
      if (byPrio !== 0) return byPrio;
      return compareDueDate(a.dueDate, b.dueDate);
    });
  });

  canManage(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'payments.manage');
  }

  canManageSuppliers(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'suppliers.manage');
  }

  canManageServices(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'services.manage');
  }

  async onReceiptPicked(ev: Event, p: ShopPayment): Promise<void> {
    const file = await takeInputFile(ev.target as HTMLInputElement);
    if (!file) {
      this.snack.open('No se pudo leer el archivo. Probá de nuevo.', 'OK', { duration: 3500 });
      return;
    }
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.uploadReceiptFile(shopId, p.id, file).subscribe({
      next: () => {
        this.snack.open('Comprobante de pago guardado', 'OK', { duration: 2500 });
        this.reload({ preserveScroll: true });
      },
      error: (err) => this.showErr(err),
    });
  }

  private readonly receiptPicker = viewChild<ElementRef<HTMLInputElement>>('receiptPicker');
  private pendingReceiptPayment: ShopPayment | null = null;

  startReceiptPick(p: ShopPayment): void {
    this.pendingReceiptPayment = p;
    const input = this.receiptPicker()?.nativeElement;
    if (!input) return;
    try {
      input.value = '';
    } catch {
      // ignore
    }
    input.click();
  }

  onSharedReceiptPicked(ev: Event): void {
    const p = this.pendingReceiptPayment;
    this.pendingReceiptPayment = null;
    if (!p) return;
    this.onReceiptPicked(ev, p);
  }

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shopId();
      if (!shopId) {
        this.rows.set([]);
        this.loading.set(false);
        this.selecting.set(false);
        this.selectedIds.set(new Set());
        return;
      }
      // untracked: reload() lee rows()/mineOnly() y al hacer rows.set() re-disparaba este effect
      // en bucle (con lista vacía el spinner nunca cortaba).
      untracked(() => {
        this.reloadMeta(shopId);
        this.reload();
      });
    });
    this.statusFilter.valueChanges.subscribe(() => this.reload());
    this.validatorFilter.valueChanges.subscribe(() => {
      if (this.validatorFilter.value.length) this.mineOnly.set(false);
      this.reload();
    });
    this.payerFilter.valueChanges.subscribe(() => {
      if (this.payerFilter.value.length) this.mineOnly.set(false);
      this.reload();
    });
    this.dueRange.valueChanges.subscribe(() => this.reload());
    this.paidRange.valueChanges.subscribe(() => this.reload());
    this.supplierFilter.valueChanges.subscribe(() => this.reload());
    this.serviceFilter.valueChanges.subscribe(() => this.reload());
    this.employeeFilter.valueChanges.subscribe(() => this.reload());
    this.amountMinFilter.valueChanges.subscribe(() => this.reload());
    this.amountMaxFilter.valueChanges.subscribe(() => this.reload());

    // Enlace profundo: /payments/...?payment=id&shop=shopId
    const qp = this.route.snapshot.queryParamMap;
    const paymentId = (qp.get('payment') || '').trim();
    const shopFromLink = (qp.get('shop') || '').trim();
    if (paymentId) {
      this.focusedPaymentId.set(paymentId);
      if (shopFromLink && shopFromLink !== this.shopId()) {
        this.shops.selectShop(shopFromLink);
      }
    }
  }

  private listFilterOpts() {
    return buildPaymentsListFilterOpts({
      statuses: this.statusFilter.value,
      mineOnly: this.mineOnly(),
      dueStart: this.dueRange.controls.start.value,
      dueEnd: this.dueRange.controls.end.value,
      paidStart: this.paidRange.controls.start.value,
      paidEnd: this.paidRange.controls.end.value,
      amountMin: this.amountMinFilter.value,
      amountMax: this.amountMaxFilter.value,
      isSupplierKind: this.isSupplierKind(),
      kind: this.kind(),
      supplierIds: this.supplierFilter.value,
      serviceIds: this.serviceFilter.value,
      employeeIds: this.employeeFilter.value,
      validatorIds: this.validatorFilter.value,
      payerIds: this.payerFilter.value,
    });
  }

  filterMine(): void {
    if (!this.currentUserId()) return;
    if (this.mineOnly()) {
      this.mineOnly.set(false);
      this.reload();
      return;
    }
    this.mineOnly.set(true);
    this.validatorFilter.setValue([], { emitEvent: false });
    this.payerFilter.setValue([], { emitEvent: false });
    this.reload();
  }

  onViewMode(value: PaymentsViewMode | null | undefined): void {
    const mode: PaymentsViewMode = value === 'list' ? 'list' : 'cards';
    this.viewMode.set(mode);
    savePaymentsViewMode(mode);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleSelecting(): void {
    if (this.selecting()) {
      this.selecting.set(false);
      this.selectedIds.set(new Set());
      return;
    }
    this.selecting.set(true);
  }

  toggleSelected(p: ShopPayment): void {
    const next = new Set(this.selectedIds());
    if (next.has(p.id)) next.delete(p.id);
    else next.add(p.id);
    this.selectedIds.set(next);
  }

  onCardClick(p: ShopPayment, ev: Event): void {
    if (!this.selecting()) return;
    const t = ev.target as HTMLElement | null;
    if (t?.closest('button, a, mat-checkbox, input, .pay-card__actions')) return;
    this.toggleSelected(p);
  }

  selectAllVisible(): void {
    this.selectedIds.set(new Set(this.visibleRows().map((p) => p.id)));
  }

  async shareSelected(): Promise<void> {
    const selected = this.visibleRows().filter((p) => this.selectedIds().has(p.id));
    if (!selected.length) return;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    const payload = paymentsSharePayload(selected, shopName);
    const result = await shareText(payload);
    if (result === 'copied') {
      this.snack.open('Copiado al portapapeles', 'OK', { duration: 2200 });
    } else if (result === 'failed') {
      this.snack.open('No se pudo compartir', 'OK', { duration: 3000 });
    }
  }

  reloadMeta(shopId: string): void {
    this.closingsApi.shopUsers(shopId).subscribe({
      next: (rows) => this.users.set(mapShopUsersForPayments(rows)),
      error: () => this.users.set([]),
    });
    this.http
      .get<Array<{ id: string; name: string; type?: string; active?: boolean }>>(
        `${environment.apiUrl}/shops/${shopId}/accounts`,
      )
      .subscribe({
        next: (rows) => this.accounts.set(filterActivePaymentAccounts(rows)),
        error: () => this.accounts.set([]),
      });
    this.suppliersApi.list(shopId).subscribe({
      next: (rows) => this.suppliers.set(rows),
      error: () => this.suppliers.set([]),
    });
    this.servicesApi.list(shopId).subscribe({
      next: (rows) => this.services.set(rows),
      error: () => this.services.set([]),
    });
    this.employeesApi.list(shopId).subscribe({
      next: (rows) => this.employees.set(rows),
      error: () => this.employees.set([]),
    });
    this.movementsApi.concepts(shopId, this.kind()).subscribe({
      next: (rows: Concept[]) =>
        this.concepts.set(rows.map((c) => ({ id: c.id, name: c.name, description: c.description }))),
      error: () => this.concepts.set([]),
    });
  }

  reload(opts?: { preserveScroll?: boolean }): void {
    const shopId = this.shopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    if (opts?.preserveScroll) {
      this.pendingScrollY =
        typeof window !== 'undefined'
          ? window.scrollY || document.documentElement.scrollTop || 0
          : 0;
    } else {
      this.pendingScrollY = null;
    }
    const optsList = this.listFilterOpts();
    // Si ya hay filas, no reemplazar la lista por el spinner (salta al top).
    const soft = untracked(() => this.rows().length > 0);
    if (!soft) this.loading.set(true);
    this.api.list(shopId, optsList).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        untracked(() => this.paymentsInbox.refresh());
        void this.afterListLoaded();
        this.restoreScrollIfNeeded();
      },
      error: () => {
        this.loading.set(false);
        this.pendingScrollY = null;
        this.snack.open('No se pudieron cargar los pagos', 'OK', { duration: 3000 });
      },
    });
  }

  private restoreScrollIfNeeded(): void {
    const y = this.pendingScrollY;
    this.pendingScrollY = null;
    if (y == null || typeof window === 'undefined') return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, left: 0, behavior: 'instant' as ScrollBehavior });
    });
  }

  private async afterListLoaded(): Promise<void> {
    const focusId = this.focusedPaymentId();
    if (!focusId || this.deepLinkHandled) {
      if (focusId) this.scrollToFocusedPayment();
      return;
    }
    await this.ensureFocusedPaymentVisible();
  }

  /** Si el pago del enlace no está en la lista (filtros), abre filtros y lo busca. */
  private ensureFocusedPaymentVisible(): void {
    const focusId = this.focusedPaymentId();
    const shopId = this.shopId();
    if (!focusId || !shopId || this.deepLinkHandled) return;

    if (this.visibleRows().some((p) => p.id === focusId)) {
      this.deepLinkHandled = true;
      this.scrollToFocusedPayment();
      this.clearDeepLinkQuery();
      return;
    }

    this.api.get(shopId, focusId).subscribe({
      next: (p) => {
        const redirectPath = shouldRedirectPaymentKind(p, this.kind());
        if (redirectPath) {
          void this.router.navigate([redirectPath], {
            queryParams: { payment: p.id, shop: p.shopId },
            replaceUrl: true,
          });
          return;
        }

        // Limpiar filtros que lo ocultan y volver a listar.
        const cleared = clearedFiltersForDeepLink(p);
        this.mineOnly.set(cleared.mineOnly);
        this.validatorFilter.setValue(cleared.validatorFilter, { emitEvent: false });
        this.payerFilter.setValue(cleared.payerFilter, { emitEvent: false });
        this.supplierFilter.setValue(cleared.supplierFilter, { emitEvent: false });
        this.serviceFilter.setValue(cleared.serviceFilter, { emitEvent: false });
        this.employeeFilter.setValue(cleared.employeeFilter, { emitEvent: false });
        this.amountMinFilter.setValue(cleared.amountMin, { emitEvent: false });
        this.amountMaxFilter.setValue(cleared.amountMax, { emitEvent: false });
        this.dueRange.reset(cleared.dueRange, { emitEvent: false });
        this.paidRange.reset(cleared.paidRange, { emitEvent: false });
        this.statusFilter.setValue(cleared.statusFilter, { emitEvent: false });
        this.filtersCollapsed.set(false);
        this.deepLinkHandled = true;
        this.loading.set(true);
        this.api.list(shopId, this.listFilterOpts()).subscribe({
          next: (rows) => {
            this.rows.set(rows);
            this.loading.set(false);
            this.scrollToFocusedPayment();
            this.clearDeepLinkQuery();
          },
          error: () => {
            this.loading.set(false);
            this.snack.open('No se pudo abrir el pago del enlace', 'OK', { duration: 3500 });
          },
        });
      },
      error: () => {
        this.deepLinkHandled = true;
        this.snack.open('No se encontró el pago del enlace', 'OK', { duration: 3500 });
        this.clearDeepLinkQuery();
      },
    });
  }

  private scrollToFocusedPayment(): void {
    const id = this.focusedPaymentId();
    if (!id) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(`payment-${id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    if (this.focusClearTimer) clearTimeout(this.focusClearTimer);
    this.focusClearTimer = setTimeout(() => {
      if (this.focusedPaymentId() === id) this.focusedPaymentId.set(null);
    }, 8000);
  }

  private clearDeepLinkQuery(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { payment: null, shop: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  openCreate(): void {
    this.openDialog('create', undefined, this.kind());
  }

  exportExcel(): void {
    const shopId = this.shopId();
    const shop = this.shops.selectedShop();
    if (!shopId || this.exporting()) return;
    const opts = this.listFilterOpts();
    const kind = this.kind();
    this.exporting.set(true);
    this.api.exportExcel(shopId, { ...opts, kind }).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const stamp = new Date().toISOString().slice(0, 10);
        downloadBlobFile(
          blob,
          paymentsExportFilename(kind, shop?.name ?? shop?.slug, stamp),
        );
      },
      error: () => {
        this.exporting.set(false);
        this.snack.open('No se pudo descargar el Excel', 'OK', { duration: 3000 });
      },
    });
  }

  openEdit(p: ShopPayment): void {
    this.openDialog('edit', p);
  }

  openDuplicate(p: ShopPayment): void {
    this.openDialog('duplicate', p);
  }

  private openDialog(
    mode: 'create' | 'edit' | 'duplicate',
    payment?: ShopPayment,
    kind: PaymentKind = this.kind(),
  ): void {
    const shopId = this.shopId();
    const shop = this.shops.selectedShop();
    if (!shopId || !shop) return;
    const title =
      mode === 'edit' ? 'Editar pago' : mode === 'duplicate' ? 'Duplicar pago' : 'Nuevo pago';
    const prefill =
      mode === 'create'
        ? kind === 'employee'
          ? { supplierId: null as string | null, serviceId: null as string | null }
          : kind === 'service'
            ? { supplierId: null as string | null, employeeId: null as string | null }
            : { serviceId: null as string | null, employeeId: null as string | null }
        : undefined;
    const accounts = buildPaymentDialogAccounts(this.accounts(), payment);
    this.dialogTitle
      .track(
        this.dialog.open(PaymentDialogComponent, {
          width: '560px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            mode,
            kind,
            shopId,
            shopName: shop.name,
            users: buildPaymentDialogUsers(this.users(), payment),
            accounts,
            suppliers: this.suppliers(),
            services: this.services(),
            employees: this.employees(),
            canManageSuppliers: this.canManageSuppliers(),
            canManageServices: this.canManageServices(),
            concepts: this.concepts(),
            ...(payment && (mode === 'edit' || mode === 'duplicate') ? { payment } : {}),
            ...(mode === 'create' && prefill ? { prefill } : {}),
          },
        }),
        title,
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) {
          this.reload({ preserveScroll: true });
          this.reloadMeta(shopId);
        }
      });
  }

  async pay(p: ShopPayment): Promise<void> {
    if (this.actionBusyId()) return;
    const result = await firstValueFrom(
      this.dialogTitle
        .track(
          this.dialog.open(PaymentPayDialogComponent, {
            width: '420px',
            maxWidth: '95vw',
            panelClass: 'guy-dialog',
            data: { payment: p },
          }),
          'Marcar como pagado',
        )
        .afterClosed(),
    );
    if (!result?.paymentMethod) return;
    const shopId = this.shopId();
    if (!shopId || this.actionBusyId()) return;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    this.actionBusyId.set(p.id);
    this.api.pay(shopId, p.id, { paymentMethod: result.paymentMethod }).subscribe({
      next: (paid) => {
        this.actionBusyId.set(null);
        this.reload({ preserveScroll: true });
        this.dialogTitle.track(
          this.dialog.open(RecordSavedDialogComponent, {
            width: '440px',
            maxWidth: '95vw',
            panelClass: 'guy-dialog',
            data: paymentPaidDialogData(paid, shopName),
          }),
          'Pago registrado',
        );
        // Ofrece adjuntar comprobante de pago de inmediato
        void this.promptReceiptAfterPay(paid);
      },
      error: (err) => {
        this.actionBusyId.set(null);
        this.showErr(err);
      },
    });
  }

  private async promptReceiptAfterPay(paid: ShopPayment): Promise<void> {
    const ok = await this.confirm.confirm(
      'Comprobante de pago',
      '¿Querés adjuntar el comprobante de pago ahora?',
    );
    if (!ok) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = () => {
      void (async () => {
        const file = await takeInputFile(input);
        if (!file) {
          this.snack.open('No se pudo leer el archivo. Probá de nuevo.', 'OK', {
            duration: 3500,
          });
          return;
        }
        const shopId = this.shopId();
        if (!shopId) return;
        this.api.uploadReceiptFile(shopId, paid.id, file).subscribe({
          next: () => {
            this.snack.open('Comprobante de pago guardado', 'OK', { duration: 2500 });
            this.reload({ preserveScroll: true });
          },
          error: (err) => this.showErr(err),
        });
      })();
    };
    input.click();
  }

  private showErr(err: any): void {
    const msg = err?.error?.message ?? 'No se pudo completar la acción';
    this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
  }
}
