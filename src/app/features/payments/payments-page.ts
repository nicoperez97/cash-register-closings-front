import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
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
import { PaymentsApiService, PaymentStatus, ShopPayment } from './payments-api.service';
import { PaymentsInboxService } from './payments-inbox.service';
import { PaymentDialogComponent } from './payment-dialog';
import { SuppliersApiService, ShopSupplier } from '../suppliers/suppliers-api.service';
import { Employee, EmployeesApiService } from '../employees/employees-api.service';
import { usePageRefresh } from '../../core/page-refresh.service';
import { formatIsoDateDisplay } from '../../core/shop/business-date';
import { RecordSavedDialogComponent } from '../../shared/components/record-saved-dialog';
import {
  paymentPaidDialogData,
  paymentSharePayload,
} from '../../shared/components/record-share-builders';
import { shareText } from '../../shared/utils/share-text';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';

type PaymentKind = 'supplier' | 'employee';

const STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING_VALIDATION: 'Pendiente de validar',
  VALIDATED: 'Validado · por pagar',
  REJECTED: 'Rechazado',
  PAID: 'Pagado',
  CANCELLED: 'Cancelado',
};

@Component({
  selector: 'app-payments-page',
  imports: [
    PageHeaderComponent,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatDialogModule,
    MatSnackBarModule,
    FiltersCollapseBtnComponent,
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

    <div
      class="panel-card guy-filters mb-3"
      [class.guy-filters--collapsed]="filtersCollapsed()"
    >
      <div class="guy-filters__head">
        <div>
          <h2 class="guy-filters__title">Filtros</h2>
          <p class="guy-filters__subtitle">Estado del pago</p>
        </div>
        <div class="guy-filters__tools">
          <button
            mat-stroked-button
            type="button"
            [disabled]="!shopId() || exporting()"
            (click)="exportExcel()"
          >
            <mat-icon>download</mat-icon>
            {{ exporting() ? 'Descargando…' : 'Descargar Excel' }}
          </button>
          <app-filters-collapse-btn
            [collapsed]="filtersCollapsed()"
            (toggle)="toggleFilters()"
          />
        </div>
      </div>
      <div class="guy-filters__body">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Estado</mat-label>
        <mat-select [formControl]="statusFilter">
          <mat-option value="">Todos</mat-option>
          @for (opt of statusOptions; track opt.value) {
            <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      </div>
    </div>

    <div class="pay-list">
      @for (p of visibleRows(); track p.id) {
        <article class="panel-card pay-card" [attr.data-status]="p.status">
          <div class="pay-card__top">
            <div>
              <h3 class="pay-card__title">{{ p.title || 'Sin concepto' }}</h3>
              <p class="pay-card__meta">
                @if (p.dueDate) {
                  Vence {{ formatDate(p.dueDate) }}
                } @else {
                  Sin fecha
                }
                @if (p.paidAt) {
                  · Pagado {{ formatDate(p.paidAt) }}
                }
              </p>
            </div>
            <div class="pay-card__amount">$ {{ (p.amount || 0).toLocaleString('es-AR') }}</div>
          </div>

          <div class="pay-card__grid">
            <div>
              <span class="pay-card__label">Estado</span>
              <strong class="pay-card__status">{{ statusLabel(p.status) }}</strong>
            </div>
            @if (isSupplierKind()) {
              <div>
                <span class="pay-card__label">Proveedor</span>
                <strong>{{ p.supplierName || '—' }}</strong>
              </div>
            } @else {
              <div>
                <span class="pay-card__label">Empleado</span>
                <strong>{{ p.employeeName || '—' }}</strong>
              </div>
            }
            <div>
              <span class="pay-card__label">Paga</span>
              <strong>{{ p.payerName || '—' }}</strong>
            </div>
            <div>
              <span class="pay-card__label">Valida</span>
              <strong>{{ p.validatorName || '—' }}</strong>
            </div>
            <div>
              <span class="pay-card__label">Cuenta que paga</span>
              <strong>{{ p.accountName || '—' }}</strong>
            </div>
          </div>

          @if (p.notes) {
            <p class="pay-card__notes">{{ p.notes }}</p>
          }

          <div class="pay-card__actions">
            @if (canValidate(p)) {
              <button mat-flat-button color="primary" type="button" (click)="validate(p)">
                <mat-icon>verified</mat-icon>
                Validar
              </button>
              <button mat-stroked-button type="button" (click)="reject(p)">
                <mat-icon>block</mat-icon>
                Rechazar
              </button>
            }
            @if (canPay(p)) {
              <button mat-flat-button color="primary" type="button" (click)="pay(p)">
                <mat-icon>paid</mat-icon>
                Marcar pagado
              </button>
            }
            @if (p.status === 'PAID') {
              <button mat-stroked-button type="button" (click)="sharePayment(p)">
                <mat-icon>share</mat-icon>
                Compartir
              </button>
            }
            @if (canManage()) {
              <button mat-stroked-button type="button" (click)="openDuplicate(p)">
                <mat-icon>content_copy</mat-icon>
                Duplicar
              </button>
            }
            @if (canManage() && (p.status === 'PENDING_VALIDATION' || p.status === 'VALIDATED')) {
              <button mat-stroked-button type="button" (click)="openEdit(p)">
                <mat-icon>edit</mat-icon>
                Editar
              </button>
              <button mat-stroked-button type="button" (click)="cancel(p)">
                <mat-icon>cancel</mat-icon>
                Cancelar
              </button>
            }
            @if (canManage() && p.status !== 'PAID') {
              <button mat-button type="button" class="pay-card__danger" (click)="remove(p)">
                <mat-icon>delete</mat-icon>
                Eliminar
              </button>
            }
          </div>
        </article>
      } @empty {
        <div class="panel-card guy-empty">
          <mat-icon>{{ isSupplierKind() ? 'local_shipping' : 'badge' }}</mat-icon>
          <div>
            <strong>{{ emptyTitle() }}</strong>
            <div class="small">{{ emptyHint() }}</div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .pay-list {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }
      .pay-card__top {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: flex-start;
        margin-bottom: 0.85rem;
      }
      .pay-card__title {
        margin: 0 0 0.2rem;
        font-size: 1.05rem;
        color: var(--guy-navy, #003366);
      }
      .pay-card__meta {
        margin: 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
      }
      .pay-card__amount {
        font-size: 1.2rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--guy-navy, #003366);
        white-space: nowrap;
      }
      .pay-card__grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.65rem 1rem;
        margin-bottom: 0.75rem;
      }
      @media (min-width: 720px) {
        .pay-card__grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }
      .pay-card__label {
        display: block;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--guy-muted, #5f6f76);
        margin-bottom: 0.15rem;
      }
      .pay-card__status {
        color: var(--guy-green, #2e7d32);
      }
      .pay-card[data-status='REJECTED'] .pay-card__status,
      .pay-card[data-status='CANCELLED'] .pay-card__status {
        color: #c62828;
      }
      .pay-card[data-status='PAID'] .pay-card__status {
        color: #1565c0;
      }
      .pay-card__notes {
        margin: 0 0 0.75rem;
        font-size: 0.88rem;
        color: var(--guy-muted, #5f6f76);
      }
      .pay-card__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
      }
      .pay-card__danger {
        color: #c62828;
      }
    `,
  ],
})
export class PaymentsPage {
  private readonly filtersUi = createFiltersCollapsed('payments');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  private readonly api = inject(PaymentsApiService);
  private readonly suppliersApi = inject(SuppliersApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  private readonly closingsApi = inject(ClosingsApiService);
  private readonly paymentsInbox = inject(PaymentsInboxService);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  readonly shops = inject(ShopContextService);

  private readonly routeData = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });

  readonly kind = computed<PaymentKind>(() =>
    this.routeData()['paymentKind'] === 'employee' ? 'employee' : 'supplier',
  );
  readonly isSupplierKind = computed(() => this.kind() === 'supplier');

  readonly pageTitle = computed(() =>
    this.isSupplierKind() ? 'Pagos a proveedores' : 'Pagos a empleados',
  );
  readonly pageSubtitle = computed(() => {
    const shop = this.shops.selectedShop()?.name ?? 'Sin local';
    return this.isSupplierKind()
      ? `${shop} · con proveedor asignado`
      : `${shop} · internos (sueldos, reintegros, etc.)`;
  });
  readonly emptyTitle = computed(() =>
    this.isSupplierKind() ? 'Sin pagos a proveedores' : 'Sin pagos a empleados',
  );
  readonly emptyHint = computed(() =>
    this.isSupplierKind()
      ? 'Creá un pago y asignale un proveedor.'
      : 'Creá un pago sin proveedor para esta sección.',
  );

  readonly rows = signal<ShopPayment[]>([]);
  readonly users = signal<Array<{ id: string; fullName: string }>>([]);
  readonly accounts = signal<Array<{ id: string; name: string }>>([]);
  readonly suppliers = signal<ShopSupplier[]>([]);
  readonly employees = signal<Employee[]>([]);
  readonly statusFilter = new FormControl('', { nonNullable: true });
  readonly exporting = signal(false);

  readonly statusOptions = (
    Object.entries(STATUS_LABEL) as Array<[PaymentStatus, string]>
  ).map(([value, label]) => ({ value, label }));

  readonly shopId = computed(() => this.shops.selectedShopId());

  readonly visibleRows = computed(() =>
    this.rows().filter((p) => (this.isSupplierKind() ? !!p.supplierId : !p.supplierId)),
  );

  canManage(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'payments.manage');
  }

  canManageSuppliers(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'suppliers.manage');
  }

  statusLabel(status: PaymentStatus): string {
    return STATUS_LABEL[status] ?? status;
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return formatIsoDateDisplay(iso);
  }

  canValidate(p: ShopPayment): boolean {
    if (p.status !== 'PENDING_VALIDATION') return false;
    const uid = this.auth.currentUser()?.id;
    return this.canManage() || !p.validatorUserId || uid === p.validatorUserId;
  }

  canPay(p: ShopPayment): boolean {
    if (p.status !== 'VALIDATED') return false;
    const uid = this.auth.currentUser()?.id;
    return this.canManage() || !p.payerUserId || uid === p.payerUserId;
  }

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shopId();
      if (!shopId) return;
      this.reloadMeta(shopId);
      this.reload();
    });
    this.statusFilter.valueChanges.subscribe(() => this.reload());
  }

  reloadMeta(shopId: string): void {
    this.closingsApi.shopUsers(shopId).subscribe({
      next: (rows) => this.users.set(rows.map((u) => ({ id: u.id, fullName: u.fullName }))),
      error: () => this.users.set([]),
    });
    this.http
      .get<Array<{ id: string; name: string; type?: string; active?: boolean }>>(
        `${environment.apiUrl}/shops/${shopId}/accounts`,
      )
      .subscribe({
        next: (rows) =>
          this.accounts.set(
            rows
              .filter(
                (a) =>
                  a.active !== false &&
                  a.type !== 'SUPPLIER' &&
                  a.type !== 'SYSTEM',
              )
              .map((a) => ({ id: a.id, name: a.name })),
          ),
        error: () => this.accounts.set([]),
      });
    this.suppliersApi.list(shopId).subscribe({
      next: (rows) => this.suppliers.set(rows),
      error: () => this.suppliers.set([]),
    });
    this.employeesApi.list(shopId).subscribe({
      next: (rows) => this.employees.set(rows),
      error: () => this.employees.set([]),
    });
  }

  reload(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    const status = this.statusFilter.value || undefined;
    this.api.list(shopId, status).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.paymentsInbox.refresh();
      },
      error: () => this.snack.open('No se pudieron cargar los pagos', 'OK', { duration: 3000 }),
    });
  }

  openCreate(): void {
    this.openDialog('create', undefined, this.kind());
  }

  exportExcel(): void {
    const shopId = this.shopId();
    const shop = this.shops.selectedShop();
    if (!shopId || this.exporting()) return;
    const status = this.statusFilter.value || undefined;
    const kind = this.kind();
    this.exporting.set(true);
    this.api.exportExcel(shopId, status, kind).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const stamp = new Date().toISOString().slice(0, 10);
        const kindSlug = kind === 'supplier' ? 'proveedores' : 'empleados';
        a.download = `pagos-${kindSlug}-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${stamp}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.exporting.set(false);
        this.snack.open('No se pudo descargar el Excel', 'OK', { duration: 3000 });
      },
    });
  }

  private shopFileSlug(name?: string | null): string {
    const raw = (name ?? 'local')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
    return raw || 'local';
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
      mode === 'create' && kind === 'employee'
        ? { supplierId: null as string | null }
        : undefined;
    this.dialogTitle
      .track(
        this.dialog.open(PaymentDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            mode,
            kind,
            shopId,
            shopName: shop.name,
            users: this.users(),
            accounts: this.accounts(),
            suppliers: this.suppliers(),
            employees: this.employees(),
            canManageSuppliers: this.canManageSuppliers(),
            ...(payment && (mode === 'edit' || mode === 'duplicate') ? { payment } : {}),
            ...(mode === 'create' && prefill ? { prefill } : {}),
          },
        }),
        title,
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) {
          this.reload();
          this.reloadMeta(shopId);
        }
      });
  }

  validate(p: ShopPayment): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.validate(shopId, p.id).subscribe({
      next: () => {
        this.snack.open('Pago validado', 'OK', { duration: 2500 });
        this.reload();
      },
      error: (err) => this.showErr(err),
    });
  }

  async reject(p: ShopPayment): Promise<void> {
    const ok = await this.confirm.confirm('Rechazar pago', `¿Rechazar "${p.title}"?`);
    if (!ok) return;
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.reject(shopId, p.id).subscribe({
      next: () => {
        this.snack.open('Pago rechazado', 'OK', { duration: 2500 });
        this.reload();
      },
      error: (err) => this.showErr(err),
    });
  }

  async pay(p: ShopPayment): Promise<void> {
    const ok = await this.confirm.confirm(
      'Marcar como pagado',
      `¿Confirmás el pago de "${p.title}" por $${p.amount.toLocaleString('es-AR')}? Se crea un movimiento contable.`,
    );
    if (!ok) return;
    const shopId = this.shopId();
    if (!shopId) return;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    this.api.pay(shopId, p.id).subscribe({
      next: (paid) => {
        this.reload();
        this.dialogTitle.track(
          this.dialog.open(RecordSavedDialogComponent, {
            width: '440px',
            maxWidth: '95vw',
            panelClass: 'guy-dialog',
            data: paymentPaidDialogData(paid, shopName),
          }),
          'Pago registrado',
        );
      },
      error: (err) => this.showErr(err),
    });
  }

  async sharePayment(p: ShopPayment): Promise<void> {
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    const payload = paymentSharePayload(p, shopName);
    const result = await shareText(payload);
    if (result === 'copied') {
      this.snack.open('Copiado al portapapeles', 'OK', { duration: 2200 });
    } else if (result === 'failed') {
      this.snack.open('No se pudo compartir', 'OK', { duration: 3000 });
    }
  }

  async cancel(p: ShopPayment): Promise<void> {
    const ok = await this.confirm.confirm('Cancelar pago', `¿Cancelar "${p.title}"?`);
    if (!ok) return;
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.cancel(shopId, p.id).subscribe({
      next: () => {
        this.snack.open('Pago cancelado', 'OK', { duration: 2500 });
        this.reload();
      },
      error: (err) => this.showErr(err),
    });
  }

  async remove(p: ShopPayment): Promise<void> {
    const ok = await this.confirm.confirm('Eliminar pago', `¿Eliminar "${p.title}"?`);
    if (!ok) return;
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.remove(shopId, p.id).subscribe({
      next: () => {
        this.snack.open('Pago eliminado', 'OK', { duration: 2500 });
        this.reload();
      },
      error: (err) => this.showErr(err),
    });
  }

  private showErr(err: any): void {
    const msg = err?.error?.message ?? 'No se pudo completar la acción';
    this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
  }
}
