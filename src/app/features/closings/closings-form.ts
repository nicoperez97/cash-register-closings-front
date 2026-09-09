import { Component, DestroyRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
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
import { debounceTime, firstValueFrom, map, merge, startWith, catchError, concatMap, from, of, switchMap, tap, toArray } from 'rxjs';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { HttpClient } from '@angular/common/http';
import { BreakpointObserver } from '@angular/cdk/layout';
import { environment } from '../../../environments/environment';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { defaultHomeRoute, isCashierOnly } from '../../core/auth/auth.models';
import { AnalyticsService } from '../../core/analytics/analytics.service';
import { AnalyticsEvents } from '../../core/analytics/analytics.events';
import { newId } from '../../core/utils/id';
import {
  formatIsoDateDisplay,
  resolveShopBusinessDate,
} from '../../core/shop/business-date';
import {
  formatShiftHint,
  resolveCurrentShift,
  shopBusinessOpening,
  shopHasMultipleShifts,
  shopShiftsOf,
  shiftsOnIsoDate,
  shiftHoursLabel,
  type ShopShift,
} from '../../core/shop/shop-shifts';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ClosingsApiService, CashClosing, CashClosingInput, ClosingPosnetAmount, ClosingStepFile, ClosingStepFileSlot, ShopClosingSource, ShopUserOption } from './closings-api.service';
import { CashWithdrawalsInboxService } from '../cash-withdrawals/cash-withdrawals-inbox.service';
import { SettlementsInboxService } from '../settlements/settlements-inbox.service';
import { shareText } from '../../shared/utils/share-text';
import {
  closingSharePayload,
} from '../../shared/components/record-share-builders';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { ClosingSaveDialogComponent } from './closing-save-dialog';
import { CashBillCounterDialogComponent } from './cash-bill-counter-dialog';
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
import { ClosingFormTipsStepComponent } from './closing-form-tips-step';
import type { ClosingStepFileView } from './closing-form-step-files';
import { PaymentFilePreviewDialogComponent } from '../payments/payment-file-preview-dialog';
import {
  buildDniTransferGroup,
  buildPosnetAmountGroup,
  populatePaymentLines,
  syncDerivedTotals,
} from './closings-form-payment-lines';
import {
  applyTipDayToForm,
  buildExpenseGroup,
  buildSourceLineGroup,
  buildOtherCobroGroup,
  cobrosFromClosing,
  defaultNewClosingPatch,
  ensureTrailingAllSourceLines as syncTrailingSourceLines,
  ensureTrailingOtherCobro,
  ensureTrailingSourceLines,
  type OtherCobroRow,
  patchClosingFormValues,
  populateOtherCobros,
  populateSourceAmounts,
  resetClosingFormForNext,
  sourceRowTotal,
} from './closings-form-load';
import {
  hydrateWithdrawnAccountId,
  userIdForWithdrawAccount,
  withdrawAccountOptionsFromUsers,
} from './withdraw-account-options';
import {
  buildClosingShareSnapshot,
  closingSaveDialogExtraRows,
  prepareClosingSaveBody,
  type ClosingFormRawValue,
} from './closings-form-save';
import {
  applyClosingFormDraft,
  clearClosingDraft,
  closingDraftFromForm,
  persistClosingDraft as writeClosingDraft,
  readClosingDraft,
  sourceAmountsFromDraft,
} from './closing-form-draft';
import {
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
    ClosingFormTipsStepComponent,
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
            @if (showShiftSelect()) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="closing-form__shift">
                <mat-label>Turno</mat-label>
                <mat-select formControlName="shiftId">
                  @for (shift of shopShifts(); track shift.id) {
                    <mat-option [value]="shift.id">
                      {{ shift.name }} · {{ shiftHoursLabel(shift) }}
                    </mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
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
            [animationDuration]="isMobile() ? '0' : ''"
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
                [posnetFiles]="posnetFilesMap()"
                [cardFiles]="cardFiles()"
                [mpFiles]="mpFiles()"
                [filesBusyKey]="parsingKey()"
                [filesDisabled]="filesDisabled()"
                [requireClosingFiles]="requireClosingFiles()"
                [cardHasAmount]="cardAmount() > 0 && !locksCard()"
                [mpHasAmount]="mpAmount() > 0 && !locksMp()"
                (add)="addPosnet()"
                (remove)="removePosnet($event)"
                (filePicked)="onStepFilesPicked($event.slot, $event.sourceId, $event.files)"
                (fileView)="onStepFileView($event)"
                (fileRemove)="onStepFileRemoved($event.slot, $event.sourceId, $event.file)"
              />
            </mat-step>

            <mat-step label="Cobros">
              <app-closing-form-caja-otros-step
                [sourceAmounts]="sourceAmounts"
                [sourceCount]="sourceCount()"
                [otherCobros]="otherCobros"
                [cobrosHint]="cobrosPanelHint()"
                [cobrosTotal]="money(cobrosStepTotal())"
                [dniTransfers]="dniTransfers"
                [dniHint]="dniPanelHint()"
                [locksDni]="locksDni()"
                [sourceFiles]="sourceFilesMap()"
                [dniFiles]="dniStepFiles()"
                [cobrosFiles]="cobrosStepFiles()"
                [filesBusyKey]="parsingKey()"
                [filesDisabled]="filesDisabled()"
                [requireClosingFiles]="requireClosingFiles()"
                [dniHasAmount]="dniNeedsFiles()"
                [cobrosHasAmount]="cobrosStepTotal() > 0"
                (remove)="removeOtherCobro($event)"
                (removeSourceLine)="removeSourceLine($event.sourceIndex, $event.lineIndex)"
                (addDni)="addDniTransfer()"
                (removeDni)="removeDniTransfer($event)"
                (filePicked)="onStepFilesPicked('channel', $event.sourceId, $event.files)"
                (fileView)="onStepFileView($event)"
                (fileRemove)="onStepFileRemoved('channel', $event.sourceId, $event.file)"
                (dniFilePicked)="onStepFilesPicked('account_dni', null, $event)"
                (dniFileRemove)="onStepFileRemoved('account_dni', null, $event)"
                (cobrosFilePicked)="onStepFilesPicked('other', null, $event)"
                (cobrosFileRemove)="onStepFileRemoved('other', null, $event)"
              />
            </mat-step>

            <mat-step label="Retiro y egresos">
              <app-closing-form-retiro-step
                [expenses]="expenses"
                [withdrawHint]="withdrawPanelHint()"
                [expensesHint]="expensesPanelHint()"
                [unitsLabel]="shop()?.unitsLabel ?? null"
                [coversEnabled]="!!shop()?.coversEnabled"
                [closingConcepts]="closingConcepts()"
                (addExpense)="addExpense()"
                (removeExpense)="removeExpense($event)"
              />
            </mat-step>

            <mat-step label="Propinas">
              <app-closing-form-tips-step
                [tipsEnabled]="tipsEnabled()"
                [tipsReadonly]="isLocked() && !auth.isAdmin()"
                [tipEmployees]="tipEmployees()"
                [tipEditorValue]="tipEditorValue()"
                (tipChange)="onTipEditorChange($event)"
              />
            </mat-step>

            <mat-step label="Efectivo">
              <app-closing-form-efectivo-step
                [withdrawAccounts]="withdrawAccounts()"
                [pendingHint]="pendingWithdrawHint()"
                (countBills)="openBillCounter()"
                (withdrawnAccountChange)="onWithdrawnAccountChange($event)"
              />
            </mat-step>

            <mat-step label="Caja">
              <app-closing-form-caja-step
                [calculated]="money(declaredTotal())"
                [breakdown]="cajaBreakdown()"
                [difference]="cajaDifference()"
                [differenceLabel]="cajaDifferenceLabel()"
                [files]="posSystemFiles()"
                [filesBusy]="parsingKey() === 'pos_system'"
                [filesDisabled]="filesDisabled()"
                [requireClosingFiles]="requireClosingFiles()"
                [hasAmount]="posAmount() > 0"
                (filePicked)="onStepFilesPicked('pos_system', null, $event)"
                (fileView)="onStepFileView($event)"
                (fileRemove)="onStepFileRemoved('pos_system', null, $event)"
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
    </div>

    <!-- Fuera del panel-card: su animación usa transform y desancora position:fixed -->
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
  `,
  styleUrl: './closings-form.scss',
})
export class ClosingsFormPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ClosingsApiService);
  private readonly cashWithdrawalsInbox = inject(CashWithdrawalsInboxService);
  private readonly settlementsInbox = inject(SettlementsInboxService);
  private readonly tipsApi = inject(TipsApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  private readonly shops = inject(ShopContextService);
  readonly auth = inject(AuthService);
  private readonly analytics = inject(AnalyticsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly http = inject(HttpClient);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpointObserver = inject(BreakpointObserver);

  readonly shop = this.shops.selectedShop;
  readonly shopShifts = computed(() => {
    const shop = this.shop();
    const date = toDateString(this.formValue()?.businessDate as Date | string | null);
    const list = /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? shiftsOnIsoDate(shop, date)
      : shopShiftsOf(shop);
    const currentId = String(this.formValue()?.shiftId ?? '');
    if (currentId && !list.some((s) => s.id === currentId)) {
      const extra = shopShiftsOf(shop).find((s) => s.id === currentId);
      if (extra) return [...list, extra];
    }
    return list;
  });
  readonly showShiftSelect = computed(() => this.shopShifts().length > 1);
  private userPickedShift = false;
  readonly tipsEnabled = computed(() => !!this.shop()?.tipsEnabled);
  readonly tipEmployees = signal<Employee[]>([]);
  readonly tipEditorValue = signal<TipsEditorState | null>(null);
  private tipDraft: TipsEditorState | null = null;
  readonly isEdit = signal(false);
  readonly saving = signal(false);
  readonly status = signal<string | null>(null);
  readonly users = signal<ShopUserOption[]>([]);
  readonly closingConcepts = signal<Array<{ id: string; name: string }>>([]);
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
    'Cobros',
    'Retiro y egresos',
    'Propinas',
    'Efectivo',
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
      openingTime: shopBusinessOpening(shop, new Date()),
    });
  }

  readonly form = this.fb.group({
    businessDate: [null as Date | null, Validators.required],
    shiftId: [''],
    posSystemAmount: [null as number | null],
    cardAmount: [null as number | null],
    cashAmount: [null as number | null],
    cashOpeningAmount: [null as number | null],
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
  readonly savedStepFiles = signal<ClosingStepFile[]>([]);
  readonly pendingStepFiles = signal<
    Array<{ pendingId: string; slot: ClosingStepFileSlot; sourceId: string | null; file: File }>
  >([]);
  readonly parsingKey = signal<string | null>(null);
  readonly filesDisabled = () => this.isLocked() && !this.auth.isAdmin();
  readonly posSystemFiles = computed(() => this.slotFiles('pos_system'));
  readonly cardFiles = computed(() => this.slotFiles('card'));
  readonly mpFiles = computed(() => this.slotFiles('mercado_pago'));
  readonly dniStepFiles = computed(() => this.slotFiles('account_dni'));
  readonly cobrosStepFiles = computed(() => this.slotFiles('other'));
  readonly sourceFilesMap = computed(() => this.sourcedFilesMap('channel'));
  readonly posnetFilesMap = computed(() => this.sourcedFilesMap('posnet'));

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
    const shiftId = String(this.formValue()?.shiftId ?? '');
    const shifts = this.shopShifts();
    const shift =
      shifts.find((s) => s.id === shiftId) ?? resolveCurrentShift(this.shop());
    return formatShiftHint(date, shift, shifts);
  });

  private readonly autoSelectShift = effect(() => {
    if (this.isEdit()) return;
    const shop = this.shop();
    const shifts = this.shopShifts();
    if (!shifts.length || this.userPickedShift) return;
    const current = resolveCurrentShift(shop).id;
    const next = shifts.some((s) => s.id === current) ? current : shifts[0].id;
    if (this.form.controls.shiftId.value !== next) {
      this.form.patchValue({ shiftId: next }, { emitEvent: false });
    }
  });

  shiftHoursLabel(shift: ShopShift): string {
    return shiftHoursLabel(shift);
  }

  readonly locksCard = computed(() => this.hasPosnetType('PVS'));
  readonly locksMp = computed(() => this.hasPosnetType('MERCADO_PAGO'));
  readonly locksDni = computed(
    () => this.hasPosnetType('CUENTA_DNI') || (this.formValue().dniTransfers?.length ?? 0) > 0,
  );

  readonly cardAmount = computed(() => this.n(this.formValue().cardAmount));
  readonly cashAmount = computed(() => {
    const v = this.formValue();
    const cobros = (v.otherCobros ?? []) as Array<{
      amount?: number | null;
      paymentMethod?: string | null;
    }>;
    const cashFromCobros = cobros
      .filter((s) => String(s.paymentMethod ?? '').toUpperCase() === 'CASH')
      .reduce((sum, s) => sum + this.n(s.amount), 0);
    return Math.max(this.n(v.cashAmount), cashFromCobros);
  });
  readonly mpAmount = computed(() => this.n(this.formValue().mercadoPagoAmount));
  readonly accountDniAmount = computed(() => this.n(this.formValue().accountDniAmount));
  readonly posAmount = computed(() => this.n(this.formValue().posSystemAmount));
  readonly requireClosingFiles = computed(() => !!this.shop()?.requireClosingFiles);
  readonly dniNeedsFiles = computed(() => {
    const transfers = (this.formValue().dniTransfers ?? []) as Array<{ amount?: unknown }>;
    const hasTransfer = transfers.some((t) => this.n(t.amount) > 0);
    if (this.hasPosnetType('CUENTA_DNI')) return hasTransfer;
    return this.n(this.formValue().accountDniAmount) > 0 || hasTransfer;
  });

  /** Cobros que no son efectivo (el efectivo va en el paso Efectivo / cashAmount). */
  readonly cobrosTotal = computed(() => {
    const cobros = (this.formValue().otherCobros ?? []) as Array<{
      amount?: number | null;
      paymentMethod?: string | null;
    }>;
    return cobros
      .filter((s) => String(s.paymentMethod ?? '').toUpperCase() !== 'CASH')
      .reduce((sum, s) => sum + this.n(s.amount), 0);
  });

  /** Suma de filas en el paso Cobros (incluye efectivo tipificado). */
  readonly cobrosStepTotal = computed(() => {
    const cobros = (this.formValue().otherCobros ?? []) as Array<{ amount?: number | null }>;
    return cobros.reduce((sum, s) => sum + this.n(s.amount), 0);
  });

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
    return (
      this.n(v.cardAmount) +
      this.cashAmount() +
      this.n(v.mercadoPagoAmount) +
      this.n(v.accountDniAmount) +
      this.cobrosTotal() +
      fromSources
    );
  });

  readonly cajaBreakdown = computed(() => {
    const v = this.formValue();
    const rows: Array<{ name: string; amount: string }> = [];
    const push = (name: string, value: number) => {
      if (value > 0) rows.push({ name, amount: this.money(value) });
    };
    push('PVS', this.n(v.cardAmount));
    push('Efectivo', this.cashAmount());
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

  readonly withdrawAccounts = computed(() => {
    const v = this.formValue();
    return withdrawAccountOptionsFromUsers(this.users(), {
      selectedAccountId: String(v.cashWithdrawnToAccountId ?? ''),
      selectedUserId: String(v.cashWithdrawnByUserId ?? ''),
    });
  });

  /** Monto a retirar si no hay destinatario (queda en A Retirar). */
  readonly pendingWithdrawAmount = computed(() => {
    const v = this.formValue();
    const assigned =
      String(v.cashWithdrawnToAccountId ?? '') || String(v.cashWithdrawnByUserId ?? '');
    if (assigned) return 0;
    const explicit = this.n(v.cashWithdrawn);
    if (explicit > 0) return explicit;
    return Math.max(0, this.cashAmount() - this.n(v.cashLeftInRegister));
  });

  readonly pendingWithdrawHint = computed(() => {
    const v = this.formValue();
    const assigned =
      String(v.cashWithdrawnToAccountId ?? '') || String(v.cashWithdrawnByUserId ?? '');
    if (assigned) return '';
    const amount = this.pendingWithdrawAmount();
    if (amount > 0) {
      return `Quedará en A Retirar (${this.money(amount)}).`;
    }
    const cash = this.cashAmount();
    if (cash <= 0) return '';
    // Sin asignar pero no hay monto a retirar (todo queda en caja / egresos).
    return 'El efectivo total tiene que ser igual a efectivo a retirar más efectivo que se deja en caja.';
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
    return this.money(this.cobrosStepTotal());
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
    this.form.controls.shiftId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.userPickedShift = true;
    });
    const shopId = this.shops.selectedShopId();
    if (shopId) {
      this.api.shopUsers(shopId).subscribe({
        next: (rows) => {
          this.users.set(rows);
          this.hydrateWithdrawnAccount(rows);
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
          this.snack.open('No se pudieron cargar las cuentas aparte', 'OK', {
            duration: 3000,
          });
          if (!this.catalogSources.length) {
            this.catalogSources = [];
            this.syncSourceAmounts();
          }
        },
      });
      this.http
        .get<Array<{ id: string; name: string; categories?: string[] }>>(
          `${environment.apiUrl}/shops/${shopId}/concepts`,
        )
        .subscribe({
          next: (rows) =>
            this.closingConcepts.set(
              rows.filter((c) => (c.categories ?? []).includes('CLOSURE')),
            ),
          error: () => this.closingConcepts.set([]),
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
        this.hydrateWithdrawnAccount(this.users());
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
                conceptId: expense.conceptId ?? '',
                notes: expense.notes ?? '',
              },
              (v) => this.emptyNum(v),
            ),
          );
        }
        this.loadTipDay(c.businessDate);
        this.savedSourceAmounts = c.sourceAmounts ?? [];
        this.savedStepFiles.set(c.stepFiles ?? []);
        this.pendingStepFiles.set([]);
        this.syncSourceAmounts();
        this.syncOtherCobros(cobrosFromClosing(c));
      });
    } else {
      const today = this.currentBusinessDate();
      this.form.patchValue(
        defaultNewClosingPatch(this.shop(), today, (v) => this.emptyNum(v), toDateInput),
      );
      this.form.patchValue(
        { shiftId: resolveCurrentShift(this.shop()).id },
        { emitEvent: false },
      );
      this.initPaymentLines();
      this.loadTipDay(today);
      this.savedSourceAmounts = null;
      this.syncSourceAmounts();
      this.syncOtherCobros([]);
      if (this.restoreClosingDraft()) {
        this.userPickedShift = true;
        this.snack.open('Recuperamos el cierre que estabas cargando', 'OK', {
          duration: 4000,
        });
      }
      this.startClosingDraftAutosave();
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
    this.persistClosingDraft();
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

  private syncOtherCobros(rows: OtherCobroRow[]): void {
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

  onStepFilesPicked(slot: ClosingStepFileSlot, sourceId: string | null, files: File[]): void {
    for (const file of files) {
      this.stepFileQueue.push({ slot, sourceId, file });
    }
    void this.drainStepFiles();
  }

  onStepFileRemoved(slot: ClosingStepFileSlot, sourceId: string | null, file: ClosingStepFileView): void {
    this.removeStepFileView(slot, sourceId, file);
  }

  private stepFileQueue: Array<{
    slot: ClosingStepFileSlot;
    sourceId: string | null;
    file: File;
  }> = [];
  private stepFileDraining = false;

  private async drainStepFiles(): Promise<void> {
    if (this.stepFileDraining) return;
    this.stepFileDraining = true;
    try {
      while (this.stepFileQueue.length) {
        const next = this.stepFileQueue.shift();
        if (!next) break;
        await this.handleStepFile(next.slot, next.sourceId, next.file);
      }
    } finally {
      this.stepFileDraining = false;
    }
  }

  onStepFileView(file: ClosingStepFileView): void {
    if (file.pendingId) {
      const pending = this.pendingStepFiles().find((p) => p.pendingId === file.pendingId);
      if (!pending) return;
      this.openStepFilePreview(pending.file.name, pending.file);
      return;
    }
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.closingId || !file.savedId) return;
    this.api.downloadStepFile(shopId, this.closingId, file.savedId).subscribe({
      next: (blob) => this.openStepFilePreview(file.name, blob),
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo abrir el archivo';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
      },
    });
  }

  private openStepFilePreview(fileName: string, blob: Blob): void {
    this.dialog.open(PaymentFilePreviewDialogComponent, {
      width: '920px',
      maxWidth: '96vw',
      maxHeight: '92vh',
      panelClass: 'guy-dialog',
      data: { title: 'Archivo del cierre', fileName, blob },
    });
  }

  private async handleStepFile(
    slot: ClosingStepFileSlot,
    sourceId: string | null,
    file: File,
  ): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.filesDisabled()) return;
    const key = this.stepFileKey(slot, sourceId);
    if (this.stepFileViews(slot, sourceId).length >= 6) {
      this.snack.open('Ya hay demasiados archivos en este paso', 'OK', { duration: 3000 });
      return;
    }
    const sourceName = this.stepFileLabel(slot, sourceId);
    this.parsingKey.set(key);

    if (this.closingId) {
      try {
        const res = await firstValueFrom(
          this.api.uploadStepFile(shopId, this.closingId, file, slot, sourceId, sourceName),
        );
        this.savedStepFiles.update((list) => [...list, res.file]);
        this.applyParsedStepAmount(slot, sourceId, res.amount, res.warning);
      } catch (err: unknown) {
        const msg =
          (err as { error?: { message?: string | string[] } })?.error?.message ??
          'No se pudo subir el archivo';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : String(msg), 'OK', { duration: 4000 });
      } finally {
        this.parsingKey.set(null);
      }
      return;
    }

    try {
      const parsed = await firstValueFrom(this.api.parseStepFile(shopId, file, slot, sourceName));
      this.pendingStepFiles.update((list) => [
        ...list,
        { pendingId: newId(), slot, sourceId, file },
      ]);
      this.applyParsedStepAmount(slot, sourceId, parsed.amount, parsed.warning);
    } catch (err: unknown) {
      this.pendingStepFiles.update((list) => [
        ...list,
        { pendingId: newId(), slot, sourceId, file },
      ]);
      const msg =
        (err as { error?: { message?: string | string[] } })?.error?.message ??
        'Archivo adjunto. Completá el monto a mano.';
      this.snack.open(Array.isArray(msg) ? msg.join(', ') : String(msg), 'OK', { duration: 4000 });
    } finally {
      this.parsingKey.set(null);
    }
  }

  private removeStepFileView(
    slot: ClosingStepFileSlot,
    sourceId: string | null,
    file: ClosingStepFileView,
  ): void {
    if (file.pendingId) {
      this.pendingStepFiles.update((list) => list.filter((p) => p.pendingId !== file.pendingId));
      return;
    }
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.closingId || !file.savedId) return;
    this.api.removeStepFile(shopId, this.closingId, file.savedId).subscribe({
      next: () => {
        this.savedStepFiles.update((list) => list.filter((f) => f.id !== file.savedId));
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo quitar el archivo';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
      },
    });
  }

  private applyParsedStepAmount(
    slot: ClosingStepFileSlot,
    sourceId: string | null,
    amount: number | null,
    warning: string | null,
  ): void {
    if (amount != null && amount > 0) {
      if (slot === 'pos_system') {
        this.addToMoneyControl('posSystemAmount', amount);
      } else if (slot === 'card') {
        this.addToMoneyControl('cardAmount', amount);
      } else if (slot === 'mercado_pago') {
        this.addToMoneyControl('mercadoPagoAmount', amount);
      } else if (slot === 'account_dni') {
        this.applyDniParsedAmount(amount);
      } else if (slot === 'other') {
        this.applyCobroParsedAmount(amount);
      } else if (slot === 'posnet' && sourceId) {
        this.applyPosnetParsedAmount(sourceId, amount);
      } else if (sourceId) {
        this.applyChannelParsedAmount(sourceId, amount);
      }
      this.snack.open(`Cargamos ${this.money(amount)} desde el archivo`, 'OK', { duration: 2800 });
      return;
    }
    this.snack.open(warning || 'Archivo adjunto. Completá el monto a mano.', 'OK', {
      duration: 3500,
    });
  }

  private applyChannelParsedAmount(sourceId: string, amount: number): void {
    const index = this.sourceAmounts.controls.findIndex(
      (row) => String(row.get('sourceId')?.value ?? '') === sourceId,
    );
    if (index < 0) return;
    const lines = this.sourceAmounts.at(index)?.get('lines') as FormArray | null;
    if (!lines) return;
    this.fillNextMoneyLine(lines, amount, () =>
      buildSourceLineGroup(this.fb, amount, (v) => this.emptyNum(v)),
    );
    ensureTrailingSourceLines(this.fb, lines, (v) => this.emptyNum(v));
  }

  private applyPosnetParsedAmount(posnetId: string, amount: number): void {
    const row = this.posnetAmounts.controls.find(
      (c) => String(c.get('posnetId')?.value ?? '') === posnetId,
    );
    const ctrl = row?.get('amount');
    if (!ctrl) return;
    const current = this.n(ctrl.value);
    ctrl.setValue(this.emptyNum(current > 0 ? current + amount : amount));
    this.runSyncDerivedTotals();
  }

  private applyDniParsedAmount(amount: number): void {
    if (this.locksDni()) {
      this.dniTransfers.push(
        buildDniTransferGroup(this.fb, {
          id: newId(),
          label: 'Archivo',
          amount,
        }),
      );
      this.runSyncDerivedTotals();
      return;
    }
    this.addToMoneyControl('accountDniAmount', amount);
  }

  private applyCobroParsedAmount(amount: number): void {
    this.fillNextMoneyLine(this.otherCobros, amount, () =>
      buildOtherCobroGroup(
        this.fb,
        {
          label: `Cobro ${this.otherCobros.length + 1}`,
          amount,
          paymentMethod: 'OTHER',
        },
        (v) => this.emptyNum(v),
      ),
    );
    this.ensureTrailingCobro();
  }

  private fillNextMoneyLine(
    lines: FormArray,
    amount: number,
    build: () => ReturnType<FormBuilder['group']>,
  ): void {
    const emptyIdx = lines.controls.findIndex((line) => this.n(line.get('amount')?.value) <= 0);
    if (emptyIdx >= 0) {
      lines.at(emptyIdx)?.get('amount')?.setValue(this.emptyNum(amount));
      return;
    }
    lines.push(build());
  }

  private addToMoneyControl(
    name: 'posSystemAmount' | 'cardAmount' | 'mercadoPagoAmount' | 'accountDniAmount',
    amount: number,
  ): void {
    const ctrl = this.form.controls[name];
    const current = this.n(ctrl.value);
    ctrl.setValue(this.emptyNum(current > 0 ? current + amount : amount));
  }

  private sourceNameById(sourceId: string | null): string {
    if (!sourceId) return 'Cuenta de canal';
    const row = this.sourceAmounts.controls.find(
      (c) => String(c.get('sourceId')?.value ?? '') === sourceId,
    );
    return String(row?.get('name')?.value ?? '').trim() || 'Cuenta de canal';
  }

  private posnetNameById(posnetId: string | null): string {
    if (!posnetId) return 'Posnet';
    const row = this.posnetAmounts.controls.find(
      (c) => String(c.get('posnetId')?.value ?? '') === posnetId,
    );
    const raw = row?.getRawValue() as { name?: string; type?: string } | undefined;
    return (raw?.name || '').trim() || this.posnetTypeLabels[raw?.type || ''] || 'Posnet';
  }

  private stepFileLabel(slot: ClosingStepFileSlot, sourceId: string | null): string {
    if (slot === 'pos_system') return 'Caja sistema';
    if (slot === 'card') return 'PVS';
    if (slot === 'mercado_pago') return 'Mercado Pago';
    if (slot === 'account_dni') return 'Cuenta DNI';
    if (slot === 'other') return 'Cobros';
    if (slot === 'posnet') return this.posnetNameById(sourceId);
    return this.sourceNameById(sourceId);
  }

  private stepFileKey(slot: ClosingStepFileSlot, sourceId: string | null): string {
    if (slot === 'channel' || slot === 'posnet') return `${slot}:${sourceId || ''}`;
    return slot;
  }

  slotFiles(slot: ClosingStepFileSlot): ClosingStepFileView[] {
    return this.stepFileViews(slot, null);
  }

  private sourcedFilesMap(slot: 'channel' | 'posnet'): Record<string, ClosingStepFileView[]> {
    const map: Record<string, ClosingStepFileView[]> = {};
    for (const row of this.stepFileViewsAll()) {
      if (row.slot !== slot || !row.sourceId) continue;
      (map[row.sourceId] ??= []).push(row.view);
    }
    return map;
  }

  private stepFileViewsAll(): Array<{
    slot: ClosingStepFileSlot;
    sourceId: string | null;
    view: ClosingStepFileView;
  }> {
    const saved = this.savedStepFiles().map((f) => ({
      slot: f.slot,
      sourceId: f.sourceId,
      view: { key: f.id, name: f.fileName, savedId: f.id } satisfies ClosingStepFileView,
    }));
    const pending = this.pendingStepFiles().map((f) => ({
      slot: f.slot,
      sourceId: f.sourceId,
      view: {
        key: f.pendingId,
        name: f.file.name,
        pendingId: f.pendingId,
      } satisfies ClosingStepFileView,
    }));
    return [...saved, ...pending];
  }

  private stepFileViews(slot: ClosingStepFileSlot, sourceId: string | null): ClosingStepFileView[] {
    return this.stepFileViewsAll()
      .filter((row) => {
        if (row.slot !== slot) return false;
        if (slot === 'channel' || slot === 'posnet') return row.sourceId === sourceId;
        return true;
      })
      .map((row) => row.view);
  }

  private flushPendingFiles(shopId: string, closingId: string) {
    const pending = this.pendingStepFiles();
    if (!pending.length) return of(null);
    return from(pending).pipe(
      concatMap((p) =>
        this.api.uploadStepFile(
          shopId,
          closingId,
          p.file,
          p.slot,
          p.sourceId,
          this.stepFileLabel(p.slot, p.sourceId),
        ),
      ),
      toArray(),
      tap((rows) => {
        this.savedStepFiles.update((list) => [...list, ...rows.map((r) => r.file)]);
        this.pendingStepFiles.set([]);
      }),
      catchError((err) => {
        const msg = err?.error?.message ?? 'No se pudieron adjuntar los archivos';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : String(msg), 'OK', { duration: 4000 });
        return of(null);
      }),
    );
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
    const row = this.posnetAmounts.at(index)?.getRawValue() as ClosingPosnetAmount | undefined;
    const posnetId = String(row?.posnetId ?? '');
    this.posnetAmounts.removeAt(index);
    if (posnetId) this.dropFilesForSource('posnet', posnetId);
    this.runSyncDerivedTotals();
  }

  private dropFilesForSource(slot: ClosingStepFileSlot, sourceId: string): void {
    this.pendingStepFiles.update((list) =>
      list.filter((p) => !(p.slot === slot && p.sourceId === sourceId)),
    );
    const saved = this.savedStepFiles().filter((f) => f.slot === slot && f.sourceId === sourceId);
    for (const file of saved) {
      this.removeStepFileView(slot, sourceId, {
        key: file.id,
        name: file.fileName,
        savedId: file.id,
      });
    }
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

  onWithdrawnAccountChange(accountId: string): void {
    this.form.patchValue(
      { cashWithdrawnByUserId: userIdForWithdrawAccount(this.users(), accountId) ?? '' },
      { emitEvent: false },
    );
  }

  private hydrateWithdrawnAccount(users: ShopUserOption[]): void {
    if (!users.length) return;
    const raw = this.form.getRawValue();
    const accountId = hydrateWithdrawnAccountId(
      users,
      String(raw.cashWithdrawnByUserId ?? ''),
      String(raw.cashWithdrawnToAccountId ?? ''),
    );
    this.form.patchValue(
      {
        cashWithdrawnToAccountId: accountId,
        cashWithdrawnByUserId: userIdForWithdrawAccount(users, accountId) ?? '',
      },
      { emitEvent: false },
    );
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
    if (this.blockIfMissingRequiredFiles()) return;
    this.persistClosingDraft();

    const { shopId, body } = prepared;
    if (!this.isEdit()) {
      void this.saveNewWithDialog(shopId, body, { shareAfterSave: true });
      return;
    }

    this.api
      .update(shopId, this.closingId!, body)
      .pipe(switchMap(() => this.flushPendingFiles(shopId, this.closingId!)))
      .subscribe({
      next: () => {
        this.form.markAsPristine();
        this.cashWithdrawalsInbox.refresh();
        this.settlementsInbox.refresh();
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
    const cashTotal = this.cashAmount();
    const cashLeave = this.n(this.form.controls.cashLeftInRegister.value);
    const cashTake = this.n(this.form.controls.cashWithdrawn.value);
    if (cashTotal > 0 && Math.abs(cashTotal - (cashTake + cashLeave)) > 0.05) {
      this.snack.open(
        'El efectivo total tiene que ser igual a efectivo a retirar más efectivo que se deja en caja',
        'OK',
        { duration: 4500 },
      );
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
      } else if (result.reason === 'tips_invalid') {
        this.snack.open('El reparto de propinas debe sumar el total', 'OK', { duration: 3000 });
      }
      return null;
    }
    return { shopId: result.shopId, body: result.body };
  }

  private missingRequiredFiles(): { labels: string[]; step: number } | null {
    if (!this.requireClosingFiles()) return null;
    const labels: string[] = [];
    let step: number = this.stepLabels.length;
    const bump = (index: number) => {
      if (index < step) step = index;
    };

    for (const row of this.posnetAmounts.controls) {
      const raw = row.getRawValue() as ClosingPosnetAmount;
      if (this.n(raw?.amount) <= 0) continue;
      const id = String(raw?.posnetId ?? '');
      if ((this.posnetFilesMap()[id] ?? []).length) continue;
      labels.push(
        (raw?.name || '').trim() || this.posnetTypeLabels[raw?.type || ''] || 'Posnet',
      );
      bump(0);
    }
    if (!this.locksCard() && this.cardAmount() > 0 && !this.cardFiles().length) {
      labels.push('PVS');
      bump(0);
    }
    if (!this.locksMp() && this.mpAmount() > 0 && !this.mpFiles().length) {
      labels.push('Mercado Pago');
      bump(0);
    }
    if (this.dniNeedsFiles() && !this.dniStepFiles().length) {
      labels.push('Cuenta DNI');
      bump(1);
    }
    if (this.cobrosStepTotal() > 0 && !this.cobrosStepFiles().length) {
      labels.push('Cobros');
      bump(1);
    }
    for (const row of this.sourceAmounts.controls) {
      const sourceId = String(row.get('sourceId')?.value ?? '');
      if (!sourceId) continue;
      if (sourceRowTotal(row.getRawValue()) <= 0) continue;
      if ((this.sourceFilesMap()[sourceId] ?? []).length) continue;
      labels.push(String(row.get('name')?.value ?? '').trim() || 'Cuenta de canal');
      bump(1);
    }
    if (this.posAmount() > 0 && !this.posSystemFiles().length) {
      labels.push('Caja sistema');
      bump(5);
    }
    if (!labels.length) return null;
    return { labels, step };
  }

  private blockIfMissingRequiredFiles(): boolean {
    const missing = this.missingRequiredFiles();
    if (!missing) return false;
    this.goToStep(missing.step);
    this.snack.open(`Falta archivo en ${missing.labels.join(', ')}`, 'OK', { duration: 4500 });
    return true;
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
    if (this.blockIfMissingRequiredFiles()) return;
    this.persistClosingDraft();

    const { shopId, body } = prepared;
    const wasCreate = !this.isEdit();
    if (wasCreate) {
      void this.saveNewWithDialog(shopId, body);
      return;
    }

    this.saving.set(true);
    this.api
      .update(shopId, this.closingId!, body)
      .pipe(switchMap(() => this.flushPendingFiles(shopId, this.closingId!)))
      .subscribe({
      next: () => {
        this.saving.set(false);
        this.cashWithdrawalsInbox.refresh();
        this.settlementsInbox.refresh();
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
    const snapshot = this.shareClosingSnapshot();
    const share = closingSharePayload(
      {
        ...snapshot,
        cashWithdrawnByName: body.cashWithdrawnByName ?? snapshot.cashWithdrawnByName ?? null,
        unitsSold: body.unitsSold ?? snapshot.unitsSold ?? null,
      },
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
              extraRows: closingSaveDialogExtraRows(snapshot, (v) => this.money(v)),
              unitsLabel: this.shop()?.unitsLabel ?? null,
              unitsSold: body.unitsSold ?? null,
              cashWithdrawnByName: body.cashWithdrawnByName ?? null,
              shareTitle: share.title,
              shareText: share.text,
              shareAfterSave: opts?.shareAfterSave === true,
              save$: () =>
                this.api.create(shopId, body).pipe(
                  switchMap((closing) =>
                    this.flushPendingFiles(shopId, closing.id).pipe(map(() => closing)),
                  ),
                ),
            },
          }),
          'Confirmar cierre',
        )
        .afterClosed(),
    );

    if (result !== 'saved') return;
    clearClosingDraft();

    this.analytics.event(AnalyticsEvents.closingCreated, {
      date: this.summaryDate() ?? '',
      total: this.declaredTotal(),
    });
    this.analytics.event(AnalyticsEvents.closingSubmitted, {
      date: this.summaryDate() ?? '',
    });

    this.cashWithdrawalsInbox.refresh();
    this.settlementsInbox.refresh();

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

  private persistClosingDraft(): void {
    if (this.isEdit()) return;
    const shopId = this.shops.selectedShopId();
    const userId = this.auth.currentUser()?.id;
    if (!shopId || !userId) return;
    writeClosingDraft(
      closingDraftFromForm(shopId, userId, this.form, this.tipDraft),
    );
  }

  private restoreClosingDraft(): boolean {
    const shopId = this.shops.selectedShopId();
    const userId = this.auth.currentUser()?.id;
    if (!shopId || !userId) return false;
    const draft = readClosingDraft(shopId, userId);
    if (!draft) return false;
    applyClosingFormDraft(this.form, this.fb, draft, (v) => this.emptyNum(v), toDateInput);
    this.tipDraft = draft.tipDraft;
    this.savedSourceAmounts = sourceAmountsFromDraft(draft);
    this.syncSourceAmounts();
    const date = toDateString(this.form.controls.businessDate.value as Date | string | null);
    if (date) this.loadTipDay(date);
    return true;
  }

  private startClosingDraftAutosave(): void {
    this.form.valueChanges
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.persistClosingDraft());
  }

  private resetForNextClosing(): void {
    clearClosingDraft();
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
    this.savedStepFiles.set([]);
    this.pendingStepFiles.set([]);
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
