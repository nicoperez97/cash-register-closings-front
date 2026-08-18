import { Component, DestroyRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom, map, merge, startWith } from 'rxjs';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { BreakpointObserver } from '@angular/cdk/layout';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { defaultHomeRoute, isCashierOnly } from '../../core/auth/auth.models';
import { newId } from '../../core/utils/id';
import {
  formatBusinessDayHint,
  formatIsoDateDisplay,
  resolveShopBusinessDate,
} from '../../core/shop/business-date';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ClosingsApiService, CashClosing, CashClosingInput, ClosingPosnetAmount, ShopClosingSource, ShopUserAccountOption, ShopUserOption } from './closings-api.service';
import { CashWithdrawalsInboxService } from '../cash-withdrawals/cash-withdrawals-inbox.service';
import { shareText } from '../../shared/utils/share-text';
import {
  closingSharePayload,
} from '../../shared/components/record-share-builders';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { ClosingSaveDialogComponent } from './closing-save-dialog';
import { CashBillCounterDialogComponent } from './cash-bill-counter-dialog';
import { isUserVisible } from '../../shared/user-visibility';
import { EmployeesApiService, Employee } from '../employees/employees-api.service';
import { TipsApiService } from '../tips/tips-api.service';
import { TipsEditorState } from '../tips/tips-editor';
import { ClosingFormHeaderComponent } from './closing-form-header';
import { ClosingFormStickyActionsComponent } from './closing-form-sticky-actions';
import { ClosingFormSummaryComponent } from './closing-form-summary';
import { ClosingFormPosnetsStepComponent } from './closing-form-posnets-step';
import { ClosingFormCajaOtrosStepComponent } from './closing-form-caja-otros-step';
import { ClosingFormCajaStepComponent } from './closing-form-caja-step';
import { ClosingFormEfectivoStepComponent } from './closing-form-efectivo-step';
import { ClosingFormRetiroStepComponent } from './closing-form-retiro-step';
import {
  buildDniTransferGroup,
  buildPosnetAmountGroup,
  populatePaymentLines,
  syncDerivedTotals,
} from './closings-form-payment-lines';
import {
  applyTipDayToForm,
  buildExpenseGroup,
  cobrosFromClosing,
  defaultNewClosingPatch,
  ensureTrailingAllSourceLines as syncTrailingSourceLines,
  ensureTrailingOtherCobro,
  ensureTrailingSourceLines,
  patchClosingFormValues,
  populateOtherCobros,
  populateSourceAmounts,
  resetClosingFormForNext,
  resolveWithdrawnAccountId,
  sourceRowTotal,
} from './closings-form-load';
import {
  buildClosingShareSnapshot,
  prepareClosingSaveBody,
  type ClosingFormRawValue,
} from './closings-form-save';
import {
  EXPENSE_CATEGORY_OPTIONS,
  POSNET_TYPE_LABEL,
  POSNET_TYPE_OPTIONS,
  closingMoney,
  closingNum,
  emptyNum as toEmptyNum,
  toDateInput,
  toDateString,
  type PosnetType,
} from './closings-form.utils';

@Component({
  selector: 'app-closings-form',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatDialogModule,
    MatDatepickerModule,
    MatStepperModule,
    ClosingFormHeaderComponent,
    ClosingFormStickyActionsComponent,
    ClosingFormSummaryComponent,
    ClosingFormPosnetsStepComponent,
    ClosingFormCajaOtrosStepComponent,
    ClosingFormCajaStepComponent,
    ClosingFormEfectivoStepComponent,
    ClosingFormRetiroStepComponent,
  ],
  host: {
    class: 'closing-form-page',
    '[class.closing-form-page--cashier]': 'cashierOnly()',
  },
  template: `
    <div class="closing-form-shell panel-card">
      <app-closing-form-header
        [isEdit]="isEdit()"
        [shopName]="shop()?.name ?? ''"
        [cashierOnly]="cashierOnly()"
        [isLocked]="isLocked()"
        [isAdmin]="auth.isAdmin()"
        [saving]="saving()"
        (cancelClicked)="cancel()"
        (unlockClicked)="unlock()"
      />

      <form
        id="closing-form"
        class="closing-form"
        [formGroup]="form"
        (ngSubmit)="save()"
        [class.closing-form--locked]="isLocked() && !auth.isAdmin()"
      >
        <section class="closing-form__section closing-form__main">
          <h2>Cobros del día</h2>
          <div class="closing-form__fields closing-form__fields--date">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Fecha</mat-label>
              <input matInput [matDatepicker]="closingDatePicker" formControlName="businessDate" />
              <mat-datepicker-toggle matIconSuffix [for]="closingDatePicker" />
              <mat-datepicker #closingDatePicker touchUi />
              @if (businessDayHint()) {
                <mat-hint>{{ businessDayHint() }}</mat-hint>
              }
            </mat-form-field>
          </div>

          @if (isMobile()) {
            <div class="closing-stepper__progress">
              <div class="closing-stepper__dots" role="tablist" aria-label="Pasos del cierre">
                @for (label of stepLabels; track label; let i = $index) {
                  <button
                    type="button"
                    class="closing-stepper__dot"
                    role="tab"
                    [attr.aria-label]="label"
                    [attr.aria-selected]="stepIndex() === i"
                    [class.is-active]="stepIndex() === i"
                    [class.is-done]="stepIndex() > i"
                    (click)="goToStep(i)"
                  >
                    {{ i + 1 }}
                  </button>
                }
              </div>
              <span aria-live="polite">
                Paso {{ stepIndex() + 1 }} de {{ stepLabels.length }} · {{ stepLabels[stepIndex()] }}
              </span>
            </div>
          }

          <mat-stepper
            class="closing-stepper"
            [class.closing-stepper--mobile]="isMobile()"
            orientation="horizontal"
            [linear]="false"
            (selectionChange)="stepIndex.set($event.selectedIndex)"
          >
            <mat-step label="Posnets">
              <app-closing-form-posnets-step
                [posnetAmounts]="posnetAmounts"
                [panelHint]="posnetsPanelHint()"
                [locksCard]="locksCard()"
                [locksMp]="locksMp()"
                [configuredIds]="configuredPosnetIds"
                [posnetTypes]="posnetTypes"
                [typeLabels]="posnetTypeLabels"
                (add)="addPosnet()"
                (remove)="removePosnet($event)"
              />
            </mat-step>

            <mat-step label="Efectivo">
              <app-closing-form-efectivo-step
                [withdrawUsers]="withdrawUsers()"
                [needsAccountPick]="needsWithdrawnAccountPick()"
                [accountOptions]="withdrawnAccountOptions()"
                [accountHint]="withdrawnAccountHint()"
                [pendingHint]="pendingWithdrawHint()"
                (countBills)="openBillCounter()"
                (withdrawnUserChange)="onWithdrawnUserChange($event)"
              />
            </mat-step>

            <mat-step label="Cobros">
              <app-closing-form-caja-otros-step
                [sourceAmounts]="sourceAmounts"
                [sourceCount]="sourceCount()"
                [otherCobros]="otherCobros"
                [cobrosHint]="cobrosPanelHint()"
                [cobrosTotal]="money(cobrosTotal())"
                [dniTransfers]="dniTransfers"
                [dniHint]="dniPanelHint()"
                [locksDni]="locksDni()"
                (remove)="removeOtherCobro($event)"
                (removeSourceLine)="removeSourceLine($event.sourceIndex, $event.lineIndex)"
                (addDni)="addDniTransfer()"
                (removeDni)="removeDniTransfer($event)"
              />
            </mat-step>

            <mat-step label="Retiro y egresos">
              <app-closing-form-retiro-step
                [expenses]="expenses"
                [withdrawHint]="withdrawPanelHint()"
                [expensesHint]="expensesPanelHint()"
                [unitsLabel]="shop()?.unitsLabel ?? null"
                [coversEnabled]="!!shop()?.coversEnabled"
                [tipsEnabled]="tipsEnabled()"
                [tipsReadonly]="isLocked() && !auth.isAdmin()"
                [tipEmployees]="tipEmployees()"
                [tipEditorValue]="tipEditorValue()"
                [expenseCategories]="expenseCategories"
                (addExpense)="addExpense()"
                (removeExpense)="removeExpense($event)"
                (tipChange)="onTipEditorChange($event)"
              />
            </mat-step>

            <mat-step label="Caja">
              <app-closing-form-caja-step
                [calculated]="money(declaredTotal())"
                [breakdown]="cajaBreakdown()"
                [difference]="cajaDifference()"
                [differenceLabel]="cajaDifferenceLabel()"
              />
            </mat-step>

            <mat-step label="Resumen">
              <app-closing-form-summary
                [summaryDate]="summaryDate()"
                [cardAmount]="money(cardAmount())"
                [cashAmount]="money(cashAmount())"
                [accountDniAmount]="money(accountDniAmount())"
                [posAmount]="money(posAmount())"
                [declaredTotal]="money(declaredTotal())"
                [asideTotal]="asideTotal() > 0 ? money(asideTotal()) : ''"
                [dayTotal]="money(dayTotal())"
                [asideLines]="asideLines()"
                [saving]="saving()"
                [saveDisabled]="saving() || (isLocked() && !auth.isAdmin())"
                (shareClicked)="shareSummary()"
              />
            </mat-step>
          </mat-stepper>
        </section>
      </form>

      <app-closing-form-sticky-actions
        [navigateMode]="!isLastStep()"
        [canGoBack]="stepIndex() > 0"
        [cashierOnly]="cashierOnly()"
        [isLocked]="isLocked()"
        [isAdmin]="auth.isAdmin()"
        [saving]="saving()"
        (backClicked)="stepBack()"
        (nextClicked)="stepNext()"
        (cancelClicked)="cancel()"
        (unlockClicked)="unlock()"
      />
    </div>
  `,
  styleUrl: './closings-form.scss',
})
export class ClosingsFormPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ClosingsApiService);
  private readonly cashWithdrawalsInbox = inject(CashWithdrawalsInboxService);
  private readonly tipsApi = inject(TipsApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  private readonly shops = inject(ShopContextService);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpointObserver = inject(BreakpointObserver);

  readonly shop = this.shops.selectedShop;
  readonly tipsEnabled = computed(() => !!this.shop()?.tipsEnabled);
  readonly tipEmployees = signal<Employee[]>([]);
  readonly tipEditorValue = signal<TipsEditorState | null>(null);
  private tipDraft: TipsEditorState | null = null;
  readonly isEdit = signal(false);
  readonly saving = signal(false);
  readonly status = signal<string | null>(null);
  readonly users = signal<ShopUserOption[]>([]);
  readonly expenseCategories = EXPENSE_CATEGORY_OPTIONS;
  readonly posnetTypes = POSNET_TYPE_OPTIONS;
  readonly posnetTypeLabels = POSNET_TYPE_LABEL;
  readonly cashierOnly = () => isCashierOnly(this.auth.currentUser(), this.shops.selectedShopId());
  readonly isLocked = () => this.status() === 'LOCKED';
  readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 720px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  readonly stepIndex = signal(0);
  readonly stepLabels = [
    'Posnets',
    'Efectivo',
    'Cobros',
    'Retiro y egresos',
    'Caja',
    'Resumen',
  ] as const;
  readonly isLastStep = computed(() => this.stepIndex() === this.stepLabels.length - 1);
  private readonly stepper = viewChild(MatStepper);
  private closingId: string | null = null;

  /** IDs de posnets del local (para distinguir transferencias DNI ad-hoc al editar). */
  configuredPosnetIds = new Set<string>();

  private currentBusinessDate(): string {
    const shop = this.shop();
    return resolveShopBusinessDate(new Date(), {
      timezone: shop?.timezone,
      openingTime: shop?.openingTime,
    });
  }

  readonly form = this.fb.group({
    businessDate: [null as Date | null, Validators.required],
    posSystemAmount: [null as number | null],
    cardAmount: [null as number | null],
    cashAmount: [null as number | null],
    mercadoPagoAmount: [null as number | null],
    deliveryAppsAmount: [null as number | null],
    transferAmount: [null as number | null],
    accountDniAmount: [null as number | null],
    unitsSold: [null as number | null],
    coversCount: [null as number | null],
    cashLeftInRegister: [null as number | null],
    cashWithdrawn: [null as number | null],
    cashWithdrawnByUserId: [''],
    cashWithdrawnToAccountId: [''],
    tipsAmount: [null as number | null],
    notes: [''],
    expenses: this.fb.array([]),
    posnetAmounts: this.fb.array([]),
    dniTransfers: this.fb.array([]),
    sourceAmounts: this.fb.array([]),
    otherCobros: this.fb.array([]),
  });

  get expenses(): FormArray {
    return this.form.get('expenses') as FormArray;
  }

  get posnetAmounts(): FormArray {
    return this.form.get('posnetAmounts') as FormArray;
  }

  get dniTransfers(): FormArray {
    return this.form.get('dniTransfers') as FormArray;
  }

  get sourceAmounts(): FormArray {
    return this.form.get('sourceAmounts') as FormArray;
  }

  get otherCobros(): FormArray {
    return this.form.get('otherCobros') as FormArray;
  }

  private catalogSources: ShopClosingSource[] = [];
  private savedSourceAmounts: CashClosing['sourceAmounts'] | null = null;
  readonly sourceCount = signal(0);

  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      // valueChanges omite controles disabled; usamos raw para posnets bloqueados.
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  readonly businessDayHint = computed(() => {
    const date = toDateString(this.formValue()?.businessDate as Date | string | null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    return formatBusinessDayHint(date, this.shop()?.openingTime);
  });

  readonly locksCard = computed(() => this.hasPosnetType('PVS'));
  readonly locksMp = computed(() => this.hasPosnetType('MERCADO_PAGO'));
  readonly locksDni = computed(
    () => this.hasPosnetType('CUENTA_DNI') || (this.formValue().dniTransfers?.length ?? 0) > 0,
  );

  readonly cardAmount = computed(() => this.n(this.formValue().cardAmount));
  readonly cashAmount = computed(() => this.n(this.formValue().cashAmount));
  readonly accountDniAmount = computed(() => this.n(this.formValue().accountDniAmount));
  readonly posAmount = computed(() => this.n(this.formValue().posSystemAmount));

  readonly declaredTotal = computed(() => {
    const v = this.formValue();
    const sources = (v.sourceAmounts ?? []) as Array<{
      includeInDeclared?: boolean;
      amount?: number | null;
      lines?: Array<{ amount?: unknown }> | number[] | null;
    }>;
    const fromSources = sources
      .filter((s) => !!s.includeInDeclared)
      .reduce((sum, s) => sum + sourceRowTotal(s), 0);
    const cobros = (v.otherCobros ?? []) as Array<{ amount?: number | null }>;
    const cobrosSum = cobros.reduce((sum, s) => sum + this.n(s.amount), 0);
    return (
      this.n(v.cardAmount) +
      this.n(v.cashAmount) +
      this.n(v.mercadoPagoAmount) +
      this.n(v.accountDniAmount) +
      cobrosSum +
      fromSources
    );
  });

  readonly cobrosTotal = computed(() => {
    const cobros = (this.formValue().otherCobros ?? []) as Array<{ amount?: number | null }>;
    return cobros.reduce((sum, s) => sum + this.n(s.amount), 0);
  });

  readonly cajaBreakdown = computed(() => {
    const v = this.formValue();
    const rows: Array<{ name: string; amount: string }> = [];
    const push = (name: string, value: number) => {
      if (value > 0) rows.push({ name, amount: this.money(value) });
    };
    push('PVS', this.n(v.cardAmount));
    push('Efectivo', this.n(v.cashAmount));
    push('Mercado Pago', this.n(v.mercadoPagoAmount));
    push('Cuenta DNI', this.n(v.accountDniAmount));
    push('Cobros', this.cobrosTotal());
    const sources = (v.sourceAmounts ?? []) as Array<{
      name?: string;
      includeInDeclared?: boolean;
      amount?: number | null;
      lines?: Array<{ amount?: unknown }> | number[] | null;
    }>;
    for (const source of sources) {
      if (!source.includeInDeclared) continue;
      const total = sourceRowTotal(source);
      if (total > 0) {
        push(String(source.name ?? '').trim() || 'Fuente', total);
      }
    }
    return rows;
  });

  readonly cajaEntered = computed(() => {
    const value = this.formValue().posSystemAmount as unknown;
    return value != null && String(value).trim() !== '';
  });

  readonly cajaDifference = computed(() =>
    this.cajaEntered() ? this.posAmount() - this.declaredTotal() : null,
  );

  readonly cajaDifferenceLabel = computed(() => {
    const difference = this.cajaDifference();
    return difference == null ? '—' : this.money(difference);
  });

  readonly asideLines = computed(() => {
    const v = this.formValue();
    const sources = (v.sourceAmounts ?? []) as Array<{
      name?: string;
      includeInDeclared?: boolean;
      amount?: number | null;
      lines?: Array<{ amount?: unknown }> | number[] | null;
    }>;
    return sources
      .filter((s) => !s.includeInDeclared && sourceRowTotal(s) > 0)
      .map((s) => ({
        name: String(s.name ?? '').trim() || 'Fuente',
        amount: this.money(sourceRowTotal(s)),
      }));
  });

  readonly asideTotal = computed(() => {
    const v = this.formValue();
    const sources = (v.sourceAmounts ?? []) as Array<{
      includeInDeclared?: boolean;
      amount?: number | null;
      lines?: Array<{ amount?: unknown }> | number[] | null;
    }>;
    return sources
      .filter((s) => !s.includeInDeclared)
      .reduce((sum, s) => sum + sourceRowTotal(s), 0);
  });

  readonly dayTotal = computed(() => this.declaredTotal() + this.asideTotal());

  readonly summaryDate = computed(() => {
    const date = toDateString(this.formValue().businessDate as Date | string | null);
    return date ? formatIsoDateDisplay(date) : '—';
  });

  readonly withdrawnAccountOptions = computed((): ShopUserAccountOption[] => {
    const userId = String(this.formValue().cashWithdrawnByUserId ?? '');
    if (!userId) return [];
    const user = this.users().find((u) => u.id === userId);
    return user?.ledgerAccounts ?? [];
  });

  /** Usuarios visibles en “Quién se lo lleva”; mantiene el seleccionado si está oculto (edición). */
  readonly withdrawUsers = computed(() => {
    const selected = String(this.formValue().cashWithdrawnByUserId ?? '');
    return this.users().filter(
      (u) => isUserVisible(u, 'cashWithdraw') || u.id === selected,
    );
  });

  readonly needsWithdrawnAccountPick = computed(() => this.withdrawnAccountOptions().length > 1);

  readonly withdrawnAccountHint = computed(() => {
    const userId = String(this.formValue().cashWithdrawnByUserId ?? '');
    if (!userId) return '';
    const accounts = this.withdrawnAccountOptions();
    if (accounts.length === 0) {
      return 'Sin cuenta asociada: al guardar se crea una a su nombre.';
    }
    if (accounts.length === 1) {
      return `El efectivo va a la cuenta «${accounts[0].name}».`;
    }
    return '';
  });

  /** Monto a retirar si no hay destinatario (queda en A Retirar). */
  readonly pendingWithdrawAmount = computed(() => {
    const v = this.formValue();
    const userId = String(v.cashWithdrawnByUserId ?? '');
    if (userId) return 0;
    const explicit = this.n(v.cashWithdrawn);
    if (explicit > 0) return explicit;
    const expenses = (v.expenses ?? []) as Array<{ amount?: number | null }>;
    const expensesTotal = expenses.reduce((s, e) => s + this.n(e?.amount), 0);
    return Math.max(0, this.n(v.cashAmount) - this.n(v.cashLeftInRegister) - expensesTotal);
  });

  readonly pendingWithdrawHint = computed(() => {
    const v = this.formValue();
    const userId = String(v.cashWithdrawnByUserId ?? '');
    if (userId) return '';
    const amount = this.pendingWithdrawAmount();
    if (amount > 0) {
      return `Quedará en A Retirar (${this.money(amount)}).`;
    }
    const cash = this.n(v.cashAmount);
    if (cash <= 0) return '';
    // Sin asignar pero no hay monto a retirar (todo queda en caja / egresos).
    return 'Sin asignar: para que vaya a A Retirar, «Se deja en caja» tiene que ser menor que el efectivo (menos egresos).';
  });

  posnetsPanelHint(): string {
    const n = this.posnetAmounts.length;
    if (!n) return 'Sin terminales · PVS y MP a mano';
    return n === 1 ? '1 terminal' : `${n} terminales`;
  }

  dniPanelHint(): string {
    const n = this.dniTransfers.length;
    if (!n) return 'Transferencias opcionales';
    return n === 1 ? '1 transferencia' : `${n} transferencias`;
  }

  cobrosPanelHint(): string {
    const cobros = (this.formValue().otherCobros ?? []) as Array<{ amount?: number | null }>;
    const filled = cobros.filter((s) => this.n(s?.amount) > 0).length;
    if (!filled) return 'Se van sumando';
    return this.money(this.cobrosTotal());
  }

  withdrawPanelHint(): string {
    const amount = this.n(this.formValue().cashWithdrawn);
    if (amount > 0) return this.money(amount);
    return 'Retiro, propinas y notas';
  }

  expensesPanelHint(): string {
    const n = this.expenses.length;
    if (!n) return 'Opcional';
    return n === 1 ? '1 egreso' : `${n} egresos`;
  }

  ngOnInit(): void {
    const shopId = this.shops.selectedShopId();
    if (shopId) {
      this.api.shopUsers(shopId).subscribe({
        next: (rows) => {
          this.users.set(rows);
          const uid = String(this.form.getRawValue().cashWithdrawnByUserId ?? '');
          if (uid) this.onWithdrawnUserChange(uid);
        },
        error: () =>
          this.snack.open('No se pudieron cargar los usuarios del local', 'OK', {
            duration: 3000,
          }),
      });
      this.api.listClosingSources(shopId).subscribe({
        next: (rows) => {
          this.catalogSources = rows;
          this.syncSourceAmounts();
        },
        error: () => {
          this.catalogSources = [];
          this.syncSourceAmounts();
        },
      });
      if (this.tipsEnabled()) {
        this.employeesApi.list(shopId).subscribe({
          next: (rows) => this.tipEmployees.set(rows.filter((e) => e.active)),
          error: () => this.tipEmployees.set([]),
        });
      }
    }

    merge(this.posnetAmounts.valueChanges, this.dniTransfers.valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.runSyncDerivedTotals());

    this.otherCobros.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.ensureTrailingCobro());

    this.sourceAmounts.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.ensureTrailingAllSourceLines());

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new' && shopId) {
      this.isEdit.set(true);
      this.closingId = id;
      this.api.get(shopId, id).subscribe((c) => {
        this.status.set(c.status);
        if (c.status === 'LOCKED' && !this.auth.isAdmin()) {
          this.form.disable({ emitEvent: false });
        }
        patchClosingFormValues(this.form, c, (v) => this.emptyNum(v), toDateInput);
        this.initPaymentLines(c.posnetAmounts);
        this.expenses.clear();
        for (const expense of c.expenses ?? []) {
          this.expenses.push(
            buildExpenseGroup(
              this.fb,
              {
                label: expense.label ?? '',
                amount: expense.amount ?? 0,
                category: expense.category ?? 'OTHER',
              },
              (v) => this.emptyNum(v),
            ),
          );
        }
        this.loadTipDay(c.businessDate);
        this.savedSourceAmounts = c.sourceAmounts ?? [];
        this.syncSourceAmounts();
        this.syncOtherCobros(cobrosFromClosing(c));
      });
    } else {
      const today = this.currentBusinessDate();
      this.form.patchValue(
        defaultNewClosingPatch(this.shop(), today, (v) => this.emptyNum(v), toDateInput),
      );
      this.initPaymentLines();
      this.loadTipDay(today);
      this.savedSourceAmounts = null;
      this.syncSourceAmounts();
      this.syncOtherCobros([]);
    }

    this.form
      .get('businessDate')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => {
        const date = toDateString(v as Date | string | null);
        if (date) this.loadTipDay(date);
      });
  }

  onTipEditorChange(state: TipsEditorState) {
    this.tipDraft = state;
    const total =
      Math.round(
        (Number(state.cashAmount || 0) +
          Number(state.transferAmount || 0) +
          Number(state.ticketsAmount || 0)) *
          100,
      ) / 100;
    this.form.patchValue({ tipsAmount: total || null }, { emitEvent: false });
  }

  private loadTipDay(businessDate: string) {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.tipsEnabled() || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      return;
    }
    this.tipsApi.getByDate(shopId, businessDate).subscribe({
      next: (day) => {
        const { state, tipsAmount } = applyTipDayToForm({
          day,
          currentTipsAmount: this.n(this.form.getRawValue().tipsAmount),
        });
        this.tipEditorValue.set(state);
        this.tipDraft = state;
        if (tipsAmount != null) {
          this.form.patchValue({ tipsAmount }, { emitEvent: false });
        }
      },
      error: () => {
        const { state } = applyTipDayToForm({
          error: true,
          currentTipsAmount: this.n(this.form.getRawValue().tipsAmount),
        });
        this.tipEditorValue.set(state);
        this.tipDraft = state;
      },
    });
  }

  money(value: number): string {
    return closingMoney(value);
  }

  private n(v: unknown): number {
    return closingNum(v);
  }

  private emptyNum(v: unknown): number | null {
    return toEmptyNum(v);
  }

  private hasPosnetType(type: PosnetType): boolean {
    const rows = (this.formValue().posnetAmounts ?? []) as ClosingPosnetAmount[];
    return rows.some((r) => r?.type === type);
  }

  private initPaymentLines(saved?: ClosingPosnetAmount[] | null): void {
    this.configuredPosnetIds = populatePaymentLines(
      this.fb,
      { posnetAmounts: this.posnetAmounts, dniTransfers: this.dniTransfers },
      this.shop()?.posnets ?? [],
      saved,
    );
    this.runSyncDerivedTotals();
  }

  private runSyncDerivedTotals(): void {
    syncDerivedTotals(this.form, this.posnetAmounts, this.dniTransfers);
  }

  private syncSourceAmounts(): void {
    populateSourceAmounts(
      this.fb,
      this.sourceAmounts,
      this.catalogSources,
      this.savedSourceAmounts,
      (v) => this.emptyNum(v),
    );
    this.sourceCount.set(this.sourceAmounts.length);
    this.sourceAmounts.updateValueAndValidity();
  }

  private syncOtherCobros(rows: Array<{ label: string; amount?: number | null }>): void {
    populateOtherCobros(this.fb, this.otherCobros, rows, (v) => this.emptyNum(v));
  }

  private ensureTrailingCobro(): void {
    ensureTrailingOtherCobro(this.fb, this.otherCobros, (v) => this.emptyNum(v));
  }

  private ensureTrailingAllSourceLines(): void {
    syncTrailingSourceLines(this.fb, this.sourceAmounts, (v) => this.emptyNum(v));
  }

  removeOtherCobro(index: number): void {
    if (index < 0 || index >= this.otherCobros.length) return;
    this.otherCobros.removeAt(index);
    this.ensureTrailingCobro();
  }

  removeSourceLine(sourceIndex: number, lineIndex: number): void {
    const lines = this.sourceAmounts.at(sourceIndex)?.get('lines') as FormArray | null;
    if (!lines || lineIndex < 0 || lineIndex >= lines.length) return;
    lines.removeAt(lineIndex);
    ensureTrailingSourceLines(this.fb, lines, (v) => this.emptyNum(v));
  }

  addPosnet(): void {
    this.posnetAmounts.push(
      buildPosnetAmountGroup(this.fb, {
        posnetId: newId(),
        name: '',
        type: 'PVS',
        amount: null,
      }),
    );
  }

  isConfiguredPosnet(index: number): boolean {
    const row = this.posnetAmounts.at(index)?.getRawValue() as ClosingPosnetAmount | undefined;
    return !!row?.posnetId && this.configuredPosnetIds.has(row.posnetId);
  }

  removePosnet(index: number): void {
    if (this.isConfiguredPosnet(index)) return;
    this.posnetAmounts.removeAt(index);
    this.runSyncDerivedTotals();
  }

  addDniTransfer(): void {
    this.dniTransfers.push(
      buildDniTransferGroup(this.fb, {
        id: newId(),
        label: '',
        amount: null,
      }),
    );
  }

  removeDniTransfer(index: number): void {
    this.dniTransfers.removeAt(index);
    this.runSyncDerivedTotals();
  }

  openBillCounter(): void {
    this.dialogTitle
      .track(
        this.dialog.open(CashBillCounterDialogComponent, {
          width: '440px',
          maxWidth: '96vw',
          maxHeight: 'calc(100dvh - 4.5rem)',
          autoFocus: 'dialog',
          panelClass: 'guy-dialog',
          data: {
            initialTotal: this.form.controls.cashAmount.value,
          },
        }),
        'Contar billetes',
      )
      .afterClosed()
      .subscribe((result) => {
        if (!result || result.total <= 0) return;
        this.form.patchValue({ cashAmount: result.total });
      });
  }

  onWithdrawnUserChange(userId: string): void {
    const current = String(this.form.getRawValue().cashWithdrawnToAccountId ?? '');
    const accountId = resolveWithdrawnAccountId(this.users(), userId, current);
    this.form.patchValue({ cashWithdrawnToAccountId: accountId }, { emitEvent: false });
  }

  async shareSummary(): Promise<void> {
    const needsSave = !this.isEdit() || this.form.dirty;
    if (needsSave) {
      const saveFirst = await this.confirmDialog.confirm(
        'Guardar antes de compartir',
        'El cierre todavía no está guardado. ¿Querés guardarlo antes de compartir?',
        {
          confirmLabel: 'Sí, guardar',
          cancelLabel: 'Compartir sin guardar',
          confirmColor: 'primary',
          icon: 'save',
        },
      );
      if (saveFirst) {
        await this.saveAndShare();
        return;
      }
    }
    await this.doShare();
  }

  private async doShare(): Promise<void> {
    const shopName = this.shop()?.name ?? 'Local';
    const payload = closingSharePayload(this.shareClosingSnapshot(), shopName, {
      unitsLabel: this.shop()?.unitsLabel,
    });
    const result = await shareText(payload);
    if (result === 'copied') {
      this.snack.open('Resumen copiado al portapapeles', 'OK', { duration: 2500 });
    } else if (result === 'failed') {
      this.snack.open('No se pudo compartir', 'OK', { duration: 3000 });
    }
  }

  /** Guarda y luego comparte. En alta abre el diálogo de confirmación. */
  private async saveAndShare(): Promise<void> {
    if (this.isLocked() && !this.auth.isAdmin()) {
      this.snack.open('El cierre está bloqueado', 'OK', { duration: 2500 });
      return;
    }
    const prepared = this.tryPrepareSaveBody();
    if (!prepared) return;

    const { shopId, body } = prepared;
    if (!this.isEdit()) {
      void this.saveNewWithDialog(shopId, body, { shareAfterSave: true });
      return;
    }

    this.api.update(shopId, this.closingId!, body).subscribe({
      next: () => {
        this.form.markAsPristine();
        this.cashWithdrawalsInbox.refresh();
        this.snack.open('Cierre guardado', 'OK', { duration: 2500 });
        void this.doShare();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo guardar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  /** Arma el body de guardado o null si la validación falla (snacks en el componente). */
  private tryPrepareSaveBody(): { shopId: string; body: CashClosingInput } | null {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return null;
    }
    this.runSyncDerivedTotals();
    const result = prepareClosingSaveBody({
      formRaw: this.form.getRawValue() as ClosingFormRawValue,
      users: this.users(),
      declaredTotal: this.declaredTotal(),
      shopId: this.shops.selectedShopId(),
      tipsEnabled: this.tipsEnabled(),
      tipDraft: this.tipDraft,
    });
    if (!result.ok) {
      if (result.reason === 'no_shop') {
        this.snack.open('Seleccioná un local', 'OK', { duration: 2500 });
      } else if (result.reason === 'missing_account') {
        this.snack.open('Seleccioná la cuenta destino del efectivo', 'OK', { duration: 3000 });
      } else if (result.reason === 'tips_invalid') {
        this.snack.open('El reparto de propinas debe sumar el total', 'OK', { duration: 3000 });
      }
      return null;
    }
    return { shopId: result.shopId, body: result.body };
  }

  /** Snapshot del formulario como CashClosing para armar el texto de compartir. */
  private shareClosingSnapshot(): CashClosing {
    this.runSyncDerivedTotals();
    return buildClosingShareSnapshot({
      formRaw: this.form.getRawValue() as ClosingFormRawValue,
      users: this.users(),
      declaredTotal: this.declaredTotal(),
      posSystemAmount: this.posAmount(),
      shopId: this.shops.selectedShopId(),
      closingId: this.closingId,
      status: this.status(),
    });
  }

  save(): void {
    if (this.saving()) return;
    if (this.isLocked() && !this.auth.isAdmin()) {
      this.snack.open('El cierre está bloqueado', 'OK', { duration: 2500 });
      return;
    }
    const prepared = this.tryPrepareSaveBody();
    if (!prepared) return;

    const { shopId, body } = prepared;
    const wasCreate = !this.isEdit();
    if (wasCreate) {
      void this.saveNewWithDialog(shopId, body);
      return;
    }

    this.saving.set(true);
    this.api.update(shopId, this.closingId!, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.cashWithdrawalsInbox.refresh();
        this.snack.open('Cierre guardado', 'OK', { duration: 2500 });
        void this.router.navigateByUrl(
          defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId()),
        );
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message ?? 'No se pudo guardar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  private async saveNewWithDialog(
    shopId: string,
    body: CashClosingInput,
    opts?: { shareAfterSave?: boolean },
  ): Promise<void> {
    const shopName = this.shop()?.name ?? 'Local';
    const share = closingSharePayload(
      {
        ...this.shareClosingSnapshot(),
        ...body,
        cashWithdrawnByName: body.cashWithdrawnByName ?? null,
      } as CashClosing,
      shopName,
      { unitsLabel: this.shop()?.unitsLabel },
    );

    const result = await firstValueFrom(
      this.dialogTitle
        .track(
          this.dialog.open(ClosingSaveDialogComponent, {
            width: '440px',
            maxWidth: '95vw',
            panelClass: 'guy-dialog',
            disableClose: true,
            data: {
              shopName,
              date: this.summaryDate(),
              pvs: this.money(this.cardAmount()),
              cash: this.money(this.cashAmount()),
              accountDni: this.money(this.accountDniAmount()),
              posSystem: this.money(this.posAmount()),
              total: this.money(this.declaredTotal()),
              unitsLabel: this.shop()?.unitsLabel ?? null,
              unitsSold: body.unitsSold ?? null,
              cashWithdrawnByName: body.cashWithdrawnByName ?? null,
              shareTitle: share.title,
              shareText: share.text,
              shareAfterSave: opts?.shareAfterSave === true,
              save$: () => this.api.create(shopId, body),
            },
          }),
          'Confirmar cierre',
        )
        .afterClosed(),
    );

    if (result !== 'saved') return;

    this.cashWithdrawalsInbox.refresh();

    if (this.cashierOnly()) {
      this.resetForNextClosing();
      return;
    }
    void this.router.navigateByUrl(
      defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId()),
    );
  }

  goToStep(index: number): void {
    const stepper = this.stepper();
    if (!stepper || index < 0 || index >= this.stepLabels.length) return;
    stepper.selectedIndex = index;
    this.stepIndex.set(index);
  }

  stepBack(): void {
    const stepper = this.stepper();
    if (!stepper || this.stepIndex() <= 0) return;
    stepper.previous();
  }

  stepNext(): void {
    const stepper = this.stepper();
    if (!stepper || this.isLastStep()) return;
    stepper.next();
  }

  cancel(): void {
    void this.router.navigateByUrl(
      defaultHomeRoute(this.auth.currentUser(), this.shops.selectedShopId()),
    );
  }

  unlock(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.closingId || !this.auth.isAdmin()) return;
    this.api.unlock(shopId, this.closingId).subscribe({
      next: (c) => {
        this.status.set(c.status);
        this.form.enable({ emitEvent: false });
        this.snack.open('Cierre desbloqueado', 'OK', { duration: 2500 });
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo desbloquear';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
      },
    });
  }

  private resetForNextClosing(): void {
    const today = this.currentBusinessDate();
    this.expenses.clear();
    this.dniTransfers.clear();
    this.form.reset(
      resetClosingFormForNext({
        currentBusinessDate: today,
        defaultChangeAmount: this.shop()?.defaultChangeAmount,
        emptyNum: (v) => this.emptyNum(v),
        toDateInput,
      }),
    );
    this.initPaymentLines();
    this.savedSourceAmounts = null;
    this.syncSourceAmounts();
    this.syncOtherCobros([]);
  }

  addExpense(): void {
    this.expenses.push(
      buildExpenseGroup(this.fb, { label: '', amount: null, category: 'OTHER' }, (v) =>
        this.emptyNum(v),
      ),
    );
  }

  removeExpense(index: number): void {
    this.expenses.removeAt(index);
  }
}
