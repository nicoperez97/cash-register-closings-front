import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { AuthService } from '../../core/auth/auth.service';
import { canEditShopPayments } from '../../core/auth/auth.models';
import { NotifyRecipientsFieldComponent } from '../../shared/components/notify-recipients-field';
import { UserAvatarComponent } from '../../shared/components/user-avatar';
import {
  SelectSearchComponent,
  filterBySelectQuery,
  onSelectSearchOpened,
} from '../../shared/components/select-search';
import {
  PaymentsApiService,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_PRIORITY_OPTIONS,
  PaymentMethod,
  PaymentPriority,
  PaymentStatus,
  ShopPayment,
} from './payments-api.service';
import {
  buildPaymentDialogAccounts,
  buildPaymentDialogUsers,
  filterActivePaymentAccounts,
  mapShopUsersForPayments,
} from './payments-page-actions';
import { PAYMENT_STATUS_OPTIONS } from './payments-display.util';
import { PaymentFilePreviewDialogComponent } from './payment-file-preview-dialog';
import { ShopSupplier, SuppliersApiService } from '../suppliers/suppliers-api.service';
import { ShopService, ServicesApiService } from '../services/services-api.service';
import { Employee, EmployeesApiService } from '../employees/employees-api.service';
import { ClosingsApiService } from '../closings/closings-api.service';
import { MovementsApiService } from '../movements/movements-api.service';
import { takeInputFile } from '../../shared/utils/input-file';
import { MoneyInputDirective } from '../../shared/directives/money-input';
import { parseLocaleNumber } from '../../shared/utils/money';
import { Observable, catchError, concatMap, forkJoin, from, map, of, switchMap } from 'rxjs';

export type PaymentDialogKind = 'supplier' | 'employee' | 'service' | 'partner';

export type PaymentDialogUser = {
  id: string;
  fullName: string;
  avatarUrl?: string | null;
  hasAvatar?: boolean;
};

export type PaymentDialogData = {
  shopId: string;
  shopName: string;
  /** Semilla opcional; el diálogo siempre recarga al abrir. */
  users?: PaymentDialogUser[];
  /** Cuentas con las que se puede pagar (no proveedores / servicios / sistema). */
  accounts?: Array<{ id: string; name: string }>;
  suppliers?: ShopSupplier[];
  services?: ShopService[];
  employees?: Employee[];
  canManageSuppliers: boolean;
  canManageServices: boolean;
  /** Conceptos validados para el campo Concepto. */
  concepts?: Array<{ id: string; name: string; description?: string | null }>;
  /** Determina si se pide proveedor, servicio o empleado. */
  kind: PaymentDialogKind;
} & (
  | { mode: 'create'; prefill?: Partial<ShopPayment> | null }
  | { mode: 'duplicate'; payment: ShopPayment }
  | { mode: 'edit'; payment: ShopPayment }
);

type PaymentDraft = {
  values: Record<string, unknown>;
  invoiceFile: File | null;
  invoiceExpanded: boolean;
  newSupplierName: string;
  newSupplierAlias: string;
  newServiceName: string;
  newServiceAlias: string;
};

@Component({
  selector: 'app-payment-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatExpansionModule,
    BusyLabelComponent,
    SelectSearchComponent,
    UserAvatarComponent,
    NotifyRecipientsFieldComponent,
    MoneyInputDirective,
  ],
  templateUrl: './payment-dialog.html',
  styleUrl: './payment-dialog.scss',
})
export class PaymentDialogComponent implements OnInit {
  readonly data = inject<PaymentDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<PaymentDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(PaymentsApiService);
  private readonly suppliersApi = inject(SuppliersApiService);
  private readonly servicesApi = inject(ServicesApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  private readonly movementsApi = inject(MovementsApiService);
  private readonly closingsApi = inject(ClosingsApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);

  readonly actorId = this.auth.currentUser()?.id ?? null;
  readonly canChooseStatus = canEditShopPayments(this.auth.currentUser(), this.data.shopId);
  readonly notifyEnabled = signal(false);
  readonly notifyIds = signal<string[]>([]);

  readonly isEdit = this.data.mode === 'edit';
  readonly isDuplicate = this.data.mode === 'duplicate';
  readonly isSupplierKind = this.data.kind === 'supplier';
  readonly isServiceKind = this.data.kind === 'service';
  readonly isPartnerKind = this.data.kind === 'partner';
  readonly isBilledKind = this.isSupplierKind || this.isServiceKind;
  readonly isPaidEdit =
    this.data.mode === 'edit' && this.data.payment?.status === 'PAID';
  readonly paymentMethods = PAYMENT_METHOD_OPTIONS;
  readonly paymentPriorities = PAYMENT_PRIORITY_OPTIONS;

  setPriority(value: PaymentPriority): void {
    const current = this.form.controls.priority.value;
    this.form.controls.priority.setValue(current === value ? null : value);
  }
  readonly seed: Partial<ShopPayment> | null =
    this.data.mode === 'edit' || this.data.mode === 'duplicate'
      ? this.data.payment
      : (this.data.prefill ?? null);
  readonly payment = this.data.mode === 'edit' ? this.data.payment : null;

  readonly accountQuery = signal('');
  readonly supplierQuery = signal('');
  readonly onSelectSearchOpened = onSelectSearchOpened;
  readonly loadingLists = signal(true);
  readonly listsFailed = signal(false);
  readonly accounts = signal<Array<{ id: string; name: string }>>(this.data.accounts ?? []);
  readonly concepts = signal<Array<{ id: string; name: string; description?: string | null }>>(
    this.data.concepts ?? [],
  );
  readonly employees = signal<Employee[]>([...(this.data.employees ?? [])]);
  readonly users = signal<PaymentDialogUser[]>([...(this.data.users ?? [])]);
  readonly filteredAccounts = computed(() =>
    filterBySelectQuery(
      this.accounts(),
      this.accountQuery(),
      (a) => a.name,
      this.form.controls.accountId.value,
    ),
  );
  readonly filteredSuppliers = computed(() =>
    filterBySelectQuery(
      this.suppliers(),
      this.supplierQuery(),
      (s) => [s.name, s.legalName, s.taxId, s.bankAlias].filter(Boolean).join(' '),
      this.form.controls.supplierId.value,
    ),
  );

  readonly conceptQuery = signal('');
  readonly filteredConcepts = computed(() =>
    filterBySelectQuery(
      this.concepts(),
      this.conceptQuery(),
      (c) => c.name,
      this.form.controls.conceptId.value,
    ),
  );

  onConceptChange(id: string | null): void {
    const concept = this.concepts().find((c) => c.id === id) ?? null;
    this.form.controls.title.setValue(concept?.name ?? '');
    const notes = String(this.form.controls.notes.value ?? '').trim();
    if (!notes && concept?.description) {
      this.form.controls.notes.setValue(concept.description);
    }
  }

  private initialConceptId(): string | null {
    if (this.seed?.conceptId) return this.seed.conceptId;
    const title = (this.seed?.title ?? '').trim();
    if (!title) return null;
    return this.concepts().find((c) => c.name === title)?.id ?? null;
  }

  readonly titleIcon = this.isEdit ? 'edit' : this.isDuplicate ? 'content_copy' : 'payments';
  get titleText(): string {
    if (this.isEdit) return this.isPaidEdit ? 'Editar pago abonado' : 'Editar pago';
    if (this.drafts().length > 1) return 'Nuevos pagos';
    return this.isDuplicate ? 'Duplicar pago' : 'Nuevo pago';
  }
  get saveLabel(): string {
    const n = this.drafts().length;
    if (n > 1) return `Crear ${n} pagos`;
    return this.isDuplicate ? 'Duplicar' : 'Crear';
  }

  readonly busy = signal(false);
  readonly creatingSupplier = signal(false);
  readonly creatingService = signal(false);
  readonly parsingInvoice = signal(false);
  readonly invoiceExpanded = signal(
    !!(
      this.seed?.invoiceNumber ||
      this.seed?.invoiceLegalName ||
      this.seed?.hasInvoiceFile
    ),
  );
  readonly pendingInvoiceFile = signal<File | null>(null);
  readonly existingInvoiceName = signal<string | null>(
    this.isEdit && this.seed?.hasInvoiceFile ? (this.seed.invoiceFileName ?? 'factura') : null,
  );
  readonly suppliers = signal<ShopSupplier[]>([...(this.data.suppliers ?? [])]);
  readonly services = signal<ShopService[]>([...(this.data.services ?? [])]);
  readonly newSupplierName = this.fb.nonNullable.control('');
  readonly newSupplierAlias = this.fb.nonNullable.control('');
  readonly newServiceName = this.fb.nonNullable.control('');
  readonly newServiceAlias = this.fb.nonNullable.control('');

  ngOnInit(): void {
    this.reloadLists();
  }

  reloadLists(): void {
    const shopId = this.data.shopId;
    if (!shopId) {
      this.loadingLists.set(false);
      this.listsFailed.set(true);
      return;
    }
    const payment =
      this.data.mode === 'edit' || this.data.mode === 'duplicate' ? this.data.payment : null;
    const conceptOpts =
      this.data.kind === 'supplier' ||
      this.data.kind === 'service' ||
      this.data.kind === 'employee'
        ? { for: this.data.kind }
        : {};
    this.loadingLists.set(true);
    this.listsFailed.set(false);
    forkJoin({
      accounts: this.movementsApi.accounts(shopId).pipe(catchError(() => of(null))),
      concepts: this.movementsApi.concepts(shopId, conceptOpts).pipe(catchError(() => of(null))),
      suppliers: this.suppliersApi.list(shopId).pipe(catchError(() => of(null))),
      services: this.servicesApi.list(shopId).pipe(catchError(() => of(null))),
      employees: this.employeesApi.list(shopId).pipe(catchError(() => of(null))),
      users: this.closingsApi.shopUsers(shopId).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ accounts, concepts, suppliers, services, employees, users }) => {
        this.loadingLists.set(false);
        if (!accounts || !concepts || !suppliers || !services || !employees || !users) {
          this.listsFailed.set(true);
          if (accounts) {
            this.accounts.set(
              buildPaymentDialogAccounts(filterActivePaymentAccounts(accounts), payment),
            );
          }
          if (concepts) {
            this.concepts.set(
              concepts.map((c) => ({ id: c.id, name: c.name, description: c.description })),
            );
          }
          if (suppliers) this.suppliers.set(suppliers);
          if (services) this.services.set(services);
          if (employees) this.employees.set(employees);
          if (users) {
            this.users.set(buildPaymentDialogUsers(mapShopUsersForPayments(users), payment));
          }
          return;
        }
        this.accounts.set(
          buildPaymentDialogAccounts(filterActivePaymentAccounts(accounts), payment),
        );
        this.concepts.set(
          concepts.map((c) => ({ id: c.id, name: c.name, description: c.description })),
        );
        this.suppliers.set(suppliers);
        this.services.set(services);
        this.employees.set(employees);
        this.users.set(buildPaymentDialogUsers(mapShopUsersForPayments(users), payment));
        this.listsFailed.set(false);
      },
      error: () => {
        this.loadingLists.set(false);
        this.listsFailed.set(true);
      },
    });
  }

  private parseDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (!m) return new Date(value);
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  private toIsoDate(value: Date | string | null): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10) || null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private numOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = parseLocaleNumber(v);
    return Number.isFinite(n) ? n : null;
  }

  readonly form = this.fb.group({
    title: [this.seed?.title ?? ''],
    conceptId: [this.initialConceptId() as string | null],
    amount: [this.seed?.amount ?? (null as number | null)],
    dueDate: [this.parseDate(this.seed?.dueDate) as Date | null],
    paidAt: [this.parseDate(this.seed?.paidAt) as Date | null],
    status: [
      this.isEdit
        ? ((this.seed?.status ?? 'PENDING_VALIDATION') as PaymentStatus)
        : ('PENDING_VALIDATION' as PaymentStatus),
    ],
    priority: [this.seed?.priority ?? (null as PaymentPriority | null)],
    supplierId: [
      this.isSupplierKind ? (this.seed?.supplierId ?? null) : (null as string | null),
    ],
    serviceId: [
      this.isServiceKind ? (this.seed?.serviceId ?? null) : (null as string | null),
    ],
    employeeId: [
      !this.isBilledKind ? (this.seed?.employeeId ?? null) : (null as string | null),
    ],
    payerUserId: [this.seed?.payerUserId ?? (null as string | null)],
    validatorUserId: [this.seed?.validatorUserId ?? (null as string | null)],
    accountId: [this.seed?.accountId ?? (null as string | null)],
    toAccountId: [this.seed?.toAccountId ?? (null as string | null)],
    paymentMethod: [this.seed?.paymentMethod ?? (null as PaymentMethod | null)],
    notes: [this.seed?.notes ?? ''],
    invoiceLegalName: [this.seed?.invoiceLegalName ?? ''],
    invoiceTaxId: [this.seed?.invoiceTaxId ?? ''],
    invoiceType: [this.seed?.invoiceType ?? ''],
    invoiceNumber: [this.seed?.invoiceNumber ?? ''],
    invoiceNetAmount: [this.seed?.invoiceNetAmount ?? (null as number | null)],
    invoiceIvaAmount: [this.seed?.invoiceIvaAmount ?? (null as number | null)],
    invoicePerceptionsAmount: [
      this.seed?.invoicePerceptionsAmount ?? (null as number | null),
    ],
    invoiceOtherTaxesAmount: [this.seed?.invoiceOtherTaxesAmount ?? (null as number | null)],
  });

  readonly statusOptions = PAYMENT_STATUS_OPTIONS;
  readonly activeDraft = signal(0);
  readonly drafts = signal<PaymentDraft[]>([this.snapshot()]);

  isPaidStatus(): boolean {
    return !this.isEdit && this.form.controls.status.value === 'PAID';
  }

  showPayingAccount(): boolean {
    return (
      this.isPartnerKind ||
      this.isPaidStatus() ||
      this.isPaidEdit ||
      (this.isEdit && this.seed?.status === 'VALIDATED')
    );
  }

  private snapshot(): PaymentDraft {
    return {
      values: { ...this.form.getRawValue() },
      invoiceFile: this.pendingInvoiceFile(),
      invoiceExpanded: this.invoiceExpanded(),
      newSupplierName: this.newSupplierName.value,
      newSupplierAlias: this.newSupplierAlias.value,
      newServiceName: this.newServiceName.value,
      newServiceAlias: this.newServiceAlias.value,
    };
  }

  private restore(draft: PaymentDraft): void {
    this.form.reset(draft.values, { emitEvent: false });
    this.pendingInvoiceFile.set(draft.invoiceFile);
    this.invoiceExpanded.set(draft.invoiceExpanded);
    this.newSupplierName.setValue(draft.newSupplierName, { emitEvent: false });
    this.newSupplierAlias.setValue(draft.newSupplierAlias, { emitEvent: false });
    this.newServiceName.setValue(draft.newServiceName, { emitEvent: false });
    this.newServiceAlias.setValue(draft.newServiceAlias, { emitEvent: false });
  }

  private persistActive(): void {
    const list = this.drafts().slice();
    list[this.activeDraft()] = this.snapshot();
    this.drafts.set(list);
  }

  private blankDraft(): PaymentDraft {
    return {
      values: {
        title: '',
        conceptId: null,
        amount: null,
        dueDate: null,
        paidAt: null,
        status: 'PENDING_VALIDATION',
        priority: null,
        supplierId: null,
        serviceId: null,
        employeeId: null,
        payerUserId: null,
        validatorUserId: null,
        accountId: null,
        paymentMethod: null,
        notes: '',
        invoiceLegalName: '',
        invoiceTaxId: '',
        invoiceType: '',
        invoiceNumber: '',
        invoiceNetAmount: null,
        invoiceIvaAmount: null,
        invoicePerceptionsAmount: null,
        invoiceOtherTaxesAmount: null,
      },
      invoiceFile: null,
      invoiceExpanded: false,
      newSupplierName: '',
      newSupplierAlias: '',
      newServiceName: '',
      newServiceAlias: '',
    };
  }

  selectDraft(index: number): void {
    if (index === this.activeDraft() || this.busy()) return;
    this.persistActive();
    this.activeDraft.set(index);
    this.restore(this.drafts()[index]);
  }

  removeDraft(index: number, ev?: Event): void {
    ev?.preventDefault();
    ev?.stopPropagation();
    if (this.drafts().length <= 1 || this.busy()) return;
    this.persistActive();
    const list = this.drafts().filter((_, i) => i !== index);
    let next = this.activeDraft();
    if (index === next) next = Math.min(index, list.length - 1);
    else if (index < next) next -= 1;
    this.drafts.set(list);
    this.activeDraft.set(next);
    this.restore(list[next]);
  }

  duplicateActive(): void {
    if (this.busy()) return;
    this.persistActive();
    const copy = this.snapshot();
    const list = [...this.drafts(), copy];
    this.drafts.set(list);
    this.activeDraft.set(list.length - 1);
    this.restore(copy);
  }

  addBlank(): void {
    if (this.busy()) return;
    this.persistActive();
    const list = [...this.drafts(), this.blankDraft()];
    this.drafts.set(list);
    this.activeDraft.set(list.length - 1);
    this.restore(list[list.length - 1]);
  }

  private dropCreatedPrefix(count: number): void {
    const rest = this.drafts().slice(count);
    const list = rest.length ? rest : [this.blankDraft()];
    this.drafts.set(list);
    this.activeDraft.set(0);
    this.restore(list[0]);
  }

  onSupplierChange(supplierId: string | null): void {
    if (!supplierId) return;
    const s = this.suppliers().find((x) => x.id === supplierId);
    if (!s) return;
    if (!this.form.controls.invoiceLegalName.value && s.legalName) {
      this.form.controls.invoiceLegalName.setValue(s.legalName);
    }
    if (!this.form.controls.invoiceTaxId.value && s.taxId) {
      this.form.controls.invoiceTaxId.setValue(s.taxId);
    }
  }

  onServiceChange(serviceId: string | null): void {
    if (!serviceId) return;
    const s = this.services().find((x) => x.id === serviceId);
    if (!s) return;
    if (!this.form.controls.invoiceLegalName.value && s.legalName) {
      this.form.controls.invoiceLegalName.setValue(s.legalName);
    }
    if (!this.form.controls.invoiceTaxId.value && s.taxId) {
      this.form.controls.invoiceTaxId.setValue(s.taxId);
    }
  }

  private normalizeTaxId(v: string | null | undefined): string {
    return (v ?? '').replace(/\D/g, '');
  }

  private normalizeName(v: string | null | undefined): string {
    return (v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\b(s\.?\s*r\.?\s*l\.?|s\.?\s*a\.?\s*s\.?|s\.?\s*a\.?)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
    const na = this.normalizeName(a);
    const nb = this.normalizeName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    // Coincide si uno contiene al otro (mín. 6 caracteres para evitar falsos positivos)
    if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) {
      return true;
    }
    return false;
  }

  private findSupplierMatch(legalName: string | null, taxId: string | null): ShopSupplier | null {
    const taxDigits = this.normalizeTaxId(taxId);
    if (taxDigits.length === 11) {
      const byTax = this.suppliers().find(
        (s) => this.normalizeTaxId(s.taxId) === taxDigits,
      );
      if (byTax) return byTax;
    }

    const candidates = this.suppliers().filter(
      (s) =>
        this.namesMatch(s.name, legalName) || this.namesMatch(s.legalName, legalName),
    );
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const exact = candidates.find(
        (s) =>
          this.normalizeName(s.name) === this.normalizeName(legalName) ||
          this.normalizeName(s.legalName) === this.normalizeName(legalName),
      );
      return exact ?? candidates[0];
    }
    return null;
  }

  /** Selecciona proveedor existente por CUIT/razón social, o sugiere crear uno nuevo. */
  private suggestNewSupplierFromInvoice(legalName: string | null, taxId: string | null): boolean {
    const match = this.findSupplierMatch(legalName, taxId);
    if (match) {
      const currentId = this.form.controls.supplierId.value;
      this.form.controls.supplierId.setValue(match.id);
      this.newSupplierName.setValue('');
      if (!this.form.controls.invoiceLegalName.value && (match.legalName || match.name)) {
        this.form.controls.invoiceLegalName.setValue(match.legalName || match.name);
      }
      if (!this.form.controls.invoiceTaxId.value && match.taxId) {
        this.form.controls.invoiceTaxId.setValue(match.taxId);
      }
      if (currentId !== match.id) {
        this.snack.open(`Proveedor seleccionado: ${match.name}`, 'OK', { duration: 2800 });
      } else {
        this.snack.open('Datos de factura cargados', 'OK', { duration: 2500 });
      }
      return true;
    }

    if (!this.form.controls.supplierId.value) {
      const name = (legalName ?? '').trim();
      if (name && !this.newSupplierName.value.trim()) {
        this.newSupplierName.setValue(name);
      }
    }
    return false;
  }

  private findServiceMatch(legalName: string | null, taxId: string | null): ShopService | null {
    const taxDigits = this.normalizeTaxId(taxId);
    if (taxDigits.length === 11) {
      const byTax = this.services().find((s) => this.normalizeTaxId(s.taxId) === taxDigits);
      if (byTax) return byTax;
    }

    const candidates = this.services().filter(
      (s) =>
        this.namesMatch(s.name, legalName) || this.namesMatch(s.legalName, legalName),
    );
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      const exact = candidates.find(
        (s) =>
          this.normalizeName(s.name) === this.normalizeName(legalName) ||
          this.normalizeName(s.legalName) === this.normalizeName(legalName),
      );
      return exact ?? candidates[0];
    }
    return null;
  }

  private suggestNewServiceFromInvoice(legalName: string | null, taxId: string | null): boolean {
    const match = this.findServiceMatch(legalName, taxId);
    if (match) {
      const currentId = this.form.controls.serviceId.value;
      this.form.controls.serviceId.setValue(match.id);
      this.newServiceName.setValue('');
      if (!this.form.controls.invoiceLegalName.value && (match.legalName || match.name)) {
        this.form.controls.invoiceLegalName.setValue(match.legalName || match.name);
      }
      if (!this.form.controls.invoiceTaxId.value && match.taxId) {
        this.form.controls.invoiceTaxId.setValue(match.taxId);
      }
      if (currentId !== match.id) {
        this.snack.open(`Servicio seleccionado: ${match.name}`, 'OK', { duration: 2800 });
      } else {
        this.snack.open('Datos de factura cargados', 'OK', { duration: 2500 });
      }
      return true;
    }

    if (!this.form.controls.serviceId.value) {
      const name = (legalName ?? '').trim();
      if (name && !this.newServiceName.value.trim()) {
        this.newServiceName.setValue(name);
      }
    }
    return false;
  }

  async onInvoicePicked(ev: Event): Promise<void> {
    const file = await takeInputFile(ev.target as HTMLInputElement);
    if (!file) {
      this.snack.open('No se pudo leer el archivo. Probá de nuevo.', 'OK', { duration: 3500 });
      return;
    }
    this.pendingInvoiceFile.set(file);
    this.invoiceExpanded.set(true);
    this.parsingInvoice.set(true);
    this.api.parseInvoice(this.data.shopId, file).subscribe({
      next: (parsed) => {
        this.parsingInvoice.set(false);
        if (parsed.legalName) this.form.controls.invoiceLegalName.setValue(parsed.legalName);
        if (parsed.taxId) this.form.controls.invoiceTaxId.setValue(parsed.taxId);
        if (parsed.invoiceType) this.form.controls.invoiceType.setValue(parsed.invoiceType);
        if (parsed.invoiceNumber) this.form.controls.invoiceNumber.setValue(parsed.invoiceNumber);
        if (parsed.netAmount != null) this.form.controls.invoiceNetAmount.setValue(parsed.netAmount);
        if (parsed.ivaAmount != null) this.form.controls.invoiceIvaAmount.setValue(parsed.ivaAmount);
        if (parsed.perceptionsAmount != null) {
          this.form.controls.invoicePerceptionsAmount.setValue(parsed.perceptionsAmount);
        }
        if (parsed.otherTaxesAmount != null) {
          this.form.controls.invoiceOtherTaxesAmount.setValue(parsed.otherTaxesAmount);
        }
        if (parsed.totalAmount != null && !this.form.controls.amount.value) {
          this.form.controls.amount.setValue(parsed.totalAmount);
        }
        const matched = this.isServiceKind
          ? this.suggestNewServiceFromInvoice(parsed.legalName, parsed.taxId)
          : this.suggestNewSupplierFromInvoice(parsed.legalName, parsed.taxId);
        if (!matched) {
          this.snack.open('Datos de factura cargados', 'OK', { duration: 2500 });
        }
      },
      error: (err) => {
        this.parsingInvoice.set(false);
        const msg = err?.error?.message ?? 'No se pudo leer la factura';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }

  viewExistingInvoice(): void {
    if (!this.payment) return;
    this.api.downloadInvoiceFile(this.data.shopId, this.payment.id).subscribe({
      next: (blob) => {
        this.dialog.open(PaymentFilePreviewDialogComponent, {
          width: '920px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          panelClass: 'guy-dialog',
          data: {
            title: 'Factura',
            fileName: this.existingInvoiceName() || 'factura.pdf',
            blob,
          },
        });
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo abrir la factura';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  createSupplier(): void {
    const name = this.newSupplierName.value.trim();
    if (!name || this.creatingSupplier()) return;
    this.creatingSupplier.set(true);
    this.ensureSupplierCreated$(name).subscribe({
      next: () => {
        this.creatingSupplier.set(false);
        this.newSupplierName.setValue('');
        this.newSupplierAlias.setValue('');
        this.snack.open('Proveedor creado', 'OK', { duration: 2000 });
      },
      error: (err) => {
        this.creatingSupplier.set(false);
        const msg = err?.error?.message ?? 'No se pudo crear el proveedor';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  createService(): void {
    const name = this.newServiceName.value.trim();
    if (!name || this.creatingService()) return;
    this.creatingService.set(true);
    this.ensureServiceCreated$(name).subscribe({
      next: () => {
        this.creatingService.set(false);
        this.newServiceName.setValue('');
        this.newServiceAlias.setValue('');
        this.snack.open('Servicio creado', 'OK', { duration: 2000 });
      },
      error: (err) => {
        this.creatingService.set(false);
        const msg = err?.error?.message ?? 'No se pudo crear el servicio';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  private ensureSupplierCreated$(name: string): Observable<string> {
    const legalName =
      (this.form.controls.invoiceLegalName.value ?? '').trim() || name;
    const taxId = (this.form.controls.invoiceTaxId.value ?? '').trim() || null;
    const match = this.findSupplierMatch(legalName, taxId) ?? this.findSupplierMatch(name, taxId);
    if (match) {
      this.form.controls.supplierId.setValue(match.id);
      return of(match.id);
    }
    return this.suppliersApi
      .create(this.data.shopId, {
        name,
        legalName: legalName || null,
        taxId,
        bankAlias: this.newSupplierAlias.value.trim() || null,
      })
      .pipe(
        switchMap((row) => {
          this.suppliers.update((list) =>
            [...list, row].sort((a, b) => a.name.localeCompare(b.name)),
          );
          this.form.controls.supplierId.setValue(row.id);
          return of(row.id);
        }),
      );
  }

  /** Crea el proveedor desde el nombre sugerido si aún no hay uno seleccionado. */
  private resolveSupplierId$(): Observable<string | null> {
    if (!this.isSupplierKind) return of(null);
    const current = this.form.controls.supplierId.value || null;
    if (current) return of(current);
    if (!this.data.canManageSuppliers) return of(null);

    const fromField = this.newSupplierName.value.trim();
    const fromInvoice = (this.form.controls.invoiceLegalName.value ?? '').trim();
    const name = fromField || fromInvoice;
    if (!name) return of(null);
    return this.ensureSupplierCreated$(name);
  }

  private ensureServiceCreated$(name: string): Observable<string> {
    const legalName =
      (this.form.controls.invoiceLegalName.value ?? '').trim() || name;
    const taxId = (this.form.controls.invoiceTaxId.value ?? '').trim() || null;
    const match = this.findServiceMatch(legalName, taxId) ?? this.findServiceMatch(name, taxId);
    if (match) {
      this.form.controls.serviceId.setValue(match.id);
      return of(match.id);
    }
    return this.servicesApi
      .create(this.data.shopId, {
        name,
        legalName: legalName || null,
        taxId,
        bankAlias: this.newServiceAlias.value.trim() || null,
      })
      .pipe(
        switchMap((row) => {
          this.services.update((list) =>
            [...list, row].sort((a, b) => a.name.localeCompare(b.name)),
          );
          this.form.controls.serviceId.setValue(row.id);
          return of(row.id);
        }),
      );
  }

  private resolveServiceId$(): Observable<string | null> {
    if (!this.isServiceKind) return of(null);
    const current = this.form.controls.serviceId.value || null;
    if (current) return of(current);
    if (!this.data.canManageServices) return of(null);

    const fromField = this.newServiceName.value.trim();
    const fromInvoice = (this.form.controls.invoiceLegalName.value ?? '').trim();
    const name = fromField || fromInvoice;
    if (!name) return of(null);
    return this.ensureServiceCreated$(name);
  }

  private resolveParty$(): Observable<{
    supplierId: string | null;
    serviceId: string | null;
    employeeId: string | null;
  }> {
    if (this.isSupplierKind) {
      return this.resolveSupplierId$().pipe(
        map((supplierId) => ({
          supplierId,
          serviceId: null,
          employeeId: null,
        })),
      );
    }
    if (this.isServiceKind) {
      return this.resolveServiceId$().pipe(
        map((serviceId) => ({
          supplierId: null,
          serviceId,
          employeeId: null,
        })),
      );
    }
    if (this.isPartnerKind) {
      return of({
        supplierId: null,
        serviceId: null,
        employeeId: null,
      });
    }
    return of({
      supplierId: null,
      serviceId: null,
      employeeId: this.form.controls.employeeId.value || null,
    });
  }

  private invoiceBody() {
    const raw = this.form.getRawValue();
    return {
      invoiceLegalName: (raw.invoiceLegalName ?? '').trim() || null,
      invoiceTaxId: (raw.invoiceTaxId ?? '').trim() || null,
      invoiceType: (raw.invoiceType ?? '').trim() || null,
      invoiceNumber: (raw.invoiceNumber ?? '').trim() || null,
      invoiceNetAmount: this.numOrNull(raw.invoiceNetAmount),
      invoiceIvaAmount: this.numOrNull(raw.invoiceIvaAmount),
      invoicePerceptionsAmount: this.numOrNull(raw.invoicePerceptionsAmount),
      invoiceOtherTaxesAmount: this.numOrNull(raw.invoiceOtherTaxesAmount),
    };
  }

  save(): void {
    if (!this.isEdit) {
      this.saveBatch();
      return;
    }
    const raw = this.form.getRawValue();
    const amountRaw = raw.amount;
    const amount =
      amountRaw === null || amountRaw === undefined || (amountRaw as any) === ''
        ? null
        : Number(amountRaw);
    if (this.isPaidEdit && (!(amount != null && amount > 0) || !raw.accountId || !raw.paymentMethod)) {
      this.snack.open(
        !raw.accountId
          ? 'Indicá la cuenta que paga'
          : !raw.paymentMethod
            ? 'Indicá la forma de pago'
            : 'Un pago abonado necesita un monto mayor a 0',
        'OK',
        { duration: 3500 },
      );
      return;
    }

    const invoice = this.isBilledKind
      ? this.invoiceBody()
      : {
          invoiceLegalName: null,
          invoiceTaxId: null,
          invoiceType: null,
          invoiceNumber: null,
          invoiceNetAmount: null,
          invoiceIvaAmount: null,
          invoicePerceptionsAmount: null,
          invoiceOtherTaxesAmount: null,
        };

    this.busy.set(true);

    this.resolveParty$()
      .pipe(
        switchMap((party) => {
          const next = {
            title: (raw.title ?? '').trim() || null,
            conceptId: raw.conceptId ? String(raw.conceptId) : null,
            amount,
            dueDate: this.toIsoDate(raw.dueDate),
            paidAt: this.isPaidEdit ? this.toIsoDate(raw.paidAt) : null,
            priority: (raw.priority as PaymentPriority | null) || null,
            supplierId: party.supplierId,
            serviceId: party.serviceId,
            employeeId: party.employeeId,
            payerUserId: raw.payerUserId || null,
            validatorUserId: raw.validatorUserId || null,
            accountId: raw.accountId ? String(raw.accountId) : null,
            toAccountId: this.isPartnerKind
              ? raw.toAccountId
                ? String(raw.toAccountId)
                : null
              : null,
            paymentMethod: (raw.paymentMethod as PaymentMethod | null) || null,
            notes: (raw.notes ?? '').trim() || null,
            ...invoice,
          };

          if (this.isEdit && this.payment) {
            const prev = this.payment;
            const sameAmount = (a: number | null, b: number | null) =>
              (a == null && b == null) || (a != null && b != null && Number(a) === Number(b));
            const sameStr = (a: string | null | undefined, b: string | null | undefined) =>
              (a || null) === (b || null);

            const body: Record<string, string | number | null | string[]> = {};
            if (!sameStr(next.title, prev.title)) body['title'] = next.title;
            if (!sameStr(next.conceptId, prev.conceptId)) body['conceptId'] = next.conceptId;
            if (!sameAmount(next.amount, prev.amount ?? null)) body['amount'] = next.amount;
            if (!sameStr(next.dueDate, prev.dueDate)) body['dueDate'] = next.dueDate;
            if (!sameStr(next.priority, prev.priority)) body['priority'] = next.priority;
            if (this.isPaidEdit && next.paidAt && !sameStr(next.paidAt, prev.paidAt)) {
              body['paidAt'] = next.paidAt;
            }
            if (this.isSupplierKind && !sameStr(next.supplierId, prev.supplierId)) {
              body['supplierId'] = next.supplierId;
            }
            if (this.isServiceKind && !sameStr(next.serviceId, prev.serviceId)) {
              body['serviceId'] = next.serviceId;
            }
            if (
              !this.isBilledKind &&
              !this.isPartnerKind &&
              !sameStr(next.employeeId, prev.employeeId)
            ) {
              body['employeeId'] = next.employeeId;
            }
            if (!sameStr(next.payerUserId, prev.payerUserId)) body['payerUserId'] = next.payerUserId;
            if (!sameStr(next.validatorUserId, prev.validatorUserId)) {
              body['validatorUserId'] = next.validatorUserId;
            }
            if (!sameStr(next.accountId, prev.accountId)) body['accountId'] = next.accountId;
            if (this.isPartnerKind && !sameStr(next.toAccountId, prev.toAccountId)) {
              body['toAccountId'] = next.toAccountId;
            }
            if (!sameStr(next.paymentMethod, prev.paymentMethod)) {
              body['paymentMethod'] = next.paymentMethod;
            }
            if (!sameStr(next.notes, prev.notes)) body['notes'] = next.notes;
            if (this.isBilledKind) {
              if (!sameStr(next.invoiceLegalName, prev.invoiceLegalName)) {
                body['invoiceLegalName'] = next.invoiceLegalName;
              }
              if (!sameStr(next.invoiceTaxId, prev.invoiceTaxId)) {
                body['invoiceTaxId'] = next.invoiceTaxId;
              }
              if (!sameStr(next.invoiceType, prev.invoiceType)) {
                body['invoiceType'] = next.invoiceType;
              }
              if (!sameStr(next.invoiceNumber, prev.invoiceNumber)) {
                body['invoiceNumber'] = next.invoiceNumber;
              }
              if (!sameAmount(next.invoiceNetAmount, prev.invoiceNetAmount ?? null)) {
                body['invoiceNetAmount'] = next.invoiceNetAmount;
              }
              if (!sameAmount(next.invoiceIvaAmount, prev.invoiceIvaAmount ?? null)) {
                body['invoiceIvaAmount'] = next.invoiceIvaAmount;
              }
              if (
                !sameAmount(next.invoicePerceptionsAmount, prev.invoicePerceptionsAmount ?? null)
              ) {
                body['invoicePerceptionsAmount'] = next.invoicePerceptionsAmount;
              }
              if (
                !sameAmount(next.invoiceOtherTaxesAmount, prev.invoiceOtherTaxesAmount ?? null)
              ) {
                body['invoiceOtherTaxesAmount'] = next.invoiceOtherTaxesAmount;
              }
            }

            if (this.notifyEnabled() && this.notifyIds().length) {
              body['notifyUserIds'] = this.notifyIds();
            }

            const hasFile = !!this.pendingInvoiceFile();
            if (!Object.keys(body).length && !hasFile) {
              return of({ kind: 'noop' as const });
            }

            const req$ = Object.keys(body).length
              ? this.api.update(this.data.shopId, this.payment.id, body)
              : of(this.payment);

            return req$.pipe(
              switchMap((saved) => {
                const file = this.pendingInvoiceFile();
                if (!file || !this.isBilledKind) {
                  return of({ kind: 'updated' as const, saved, invoiceOk: true });
                }
                return this.api.uploadInvoiceFile(this.data.shopId, saved.id, file, false).pipe(
                  map((s) => ({ kind: 'updated' as const, saved: s, invoiceOk: true })),
                  catchError(() =>
                    of({ kind: 'updated' as const, saved, invoiceOk: false }),
                  ),
                );
              }),
            );
          }

          return of({ kind: 'noop' as const });
        }),
      )
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          if (result.kind === 'noop') {
            this.snack.open('Sin cambios', 'OK', { duration: 2000 });
            this.ref.close(false);
            return;
          }
          if (this.isSupplierKind && this.newSupplierName.value.trim()) {
            this.newSupplierName.setValue('');
            this.newSupplierAlias.setValue('');
          }
          if (this.isServiceKind && this.newServiceName.value.trim()) {
            this.newServiceName.setValue('');
            this.newServiceAlias.setValue('');
          }
          const msg =
            result.invoiceOk === false
              ? 'Pago actualizado, pero no se pudo subir la factura. Volvé a adjuntarla desde el listado.'
              : 'Pago actualizado';
          this.snack.open(msg, 'OK', {
            duration: result.invoiceOk === false ? 5500 : 2500,
          });
          this.ref.close(true);
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
        },
      });
  }

  private paidError(raw: {
    amount?: unknown;
    accountId?: unknown;
    paymentMethod?: unknown;
  }): string | null {
    const amountRaw = raw.amount;
    const amount =
      amountRaw === null || amountRaw === undefined || amountRaw === ''
        ? null
        : Number(amountRaw);
    if (!(amount != null && amount > 0) || !raw.accountId || !raw.paymentMethod) {
      return !raw.accountId
        ? 'Indicá la cuenta que paga'
        : !raw.paymentMethod
          ? 'Indicá la forma de pago'
          : 'Un pago abonado necesita un monto mayor a 0';
    }
    return null;
  }

  private saveBatch(): void {
    this.persistActive();
    const list = this.drafts();
    for (let i = 0; i < list.length; i++) {
      const raw = list[i].values as {
        status?: PaymentStatus;
        amount?: unknown;
        accountId?: unknown;
        paymentMethod?: unknown;
      };
      if (raw.status === 'PAID') {
        const msg = this.paidError(raw);
        if (msg) {
          this.activeDraft.set(i);
          this.restore(list[i]);
          this.snack.open(`Pago ${i + 1}: ${msg}`, 'OK', { duration: 3500 });
          return;
        }
      }
    }

    this.busy.set(true);
    let created = 0;
    let invoiceFail = 0;
    from(list.map((_, i) => i))
      .pipe(
        concatMap((i) => {
          this.restore(this.drafts()[i]);
          this.activeDraft.set(i);
          return this.createCurrent$();
        }),
      )
      .subscribe({
        next: (result) => {
          created += 1;
          if (!result.invoiceOk) invoiceFail += 1;
        },
        error: (err) => {
          this.busy.set(false);
          this.dropCreatedPrefix(created);
          const msg = err?.error?.message ?? 'No se pudo guardar';
          const prefix = created
            ? `Se crearon ${created} pago${created === 1 ? '' : 's'}. El siguiente falló: `
            : '';
          this.snack.open(`${prefix}${Array.isArray(msg) ? msg.join(', ') : msg}`, 'OK', {
            duration: 5000,
          });
        },
        complete: () => {
          this.busy.set(false);
          const n = created;
          const msg = invoiceFail
            ? `${n === 1 ? 'Pago creado' : `${n} pagos creados`}, pero no se pudo subir alguna factura.`
            : n === 1
              ? this.isDuplicate
                ? 'Pago duplicado'
                : 'Pago creado'
              : `${n} pagos creados`;
          this.snack.open(msg, 'OK', { duration: invoiceFail ? 5500 : 2500 });
          this.ref.close(true);
        },
      });
  }

  private createCurrent$() {
    const raw = this.form.getRawValue();
    const amountRaw = raw.amount;
    const amount =
      amountRaw === null || amountRaw === undefined || (amountRaw as any) === ''
        ? null
        : Number(amountRaw);
    const invoice = this.isBilledKind
      ? this.invoiceBody()
      : {
          invoiceLegalName: null,
          invoiceTaxId: null,
          invoiceType: null,
          invoiceNumber: null,
          invoiceNetAmount: null,
          invoiceIvaAmount: null,
          invoicePerceptionsAmount: null,
          invoiceOtherTaxesAmount: null,
        };
    const status = this.canChooseStatus
      ? ((raw.status as PaymentStatus) || 'PENDING_VALIDATION')
      : 'PENDING_VALIDATION';
    return this.resolveParty$().pipe(
      switchMap((party) =>
        this.api
          .create(this.data.shopId, {
            title: (raw.title ?? '').trim() || null,
            conceptId: raw.conceptId ? String(raw.conceptId) : null,
            amount,
            dueDate: this.toIsoDate(raw.dueDate),
            paidAt: status === 'PAID' ? this.toIsoDate(raw.paidAt) : null,
            status,
            priority: (raw.priority as PaymentPriority | null) || null,
            supplierId: party.supplierId,
            serviceId: party.serviceId,
            employeeId: party.employeeId,
            payerUserId: raw.payerUserId || null,
            validatorUserId: raw.validatorUserId || null,
            accountId: raw.accountId ? String(raw.accountId) : null,
            toAccountId: this.isPartnerKind
              ? raw.toAccountId
                ? String(raw.toAccountId)
                : null
              : null,
            paymentMethod: (raw.paymentMethod as PaymentMethod | null) || null,
            notes: (raw.notes ?? '').trim() || null,
            ...invoice,
          })
          .pipe(
            switchMap((created) => {
              const file = this.pendingInvoiceFile();
              if (!file || !this.isBilledKind) {
                return of({ invoiceOk: true as const });
              }
              return this.api.uploadInvoiceFile(this.data.shopId, created.id, file, false).pipe(
                map(() => ({ invoiceOk: true as const })),
                catchError(() => of({ invoiceOk: false as const })),
              );
            }),
          ),
      ),
    );
  }
}
