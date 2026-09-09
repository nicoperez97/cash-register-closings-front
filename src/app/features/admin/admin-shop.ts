import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  forwardRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { catchError, filter, firstValueFrom, map, of, startWith, switchMap } from 'rxjs';
import {
  filterBySelectQuery,
  onSelectSearchOpened,
} from '../../shared/components/select-search';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { canManageShop, canManageOrderingCatalog, hasShopPermission, ShopPosnet } from '../../core/auth/auth.models';
import { defaultShopShift, shopShiftsOf, type ShopShift } from '../../core/shop/shop-shifts';
import { normalizeLogoUrl, resolveShopLogoSrc, isUploadedShopLogoPath } from '../../core/utils/drive-url';
import { newId } from '../../core/utils/id';
import { environment } from '../../../environments/environment';
import {
  ClosingsApiService,
  CLOSING_SOURCE_KIND_OPTIONS,
  closingSourceKindNeedsAccount,
  SalesSystemOption,
  ShopClosingSource,
} from '../closings/closings-api.service';
import { SettlementsInboxService } from '../settlements/settlements-inbox.service';
import { ShopBackupDialogComponent } from './shop-backup-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { AdminAccountDialogComponent, AdminAccountRow } from './admin-account-dialog';
import {
  CONCEPT_CATEGORY_OPTIONS,
  DEFAULT_PAYMENT_CONCEPT_CATEGORIES,
  normalizePaymentConceptCategories,
} from '../../shared/concept-categories';
import { usePageRefresh } from '../../core/page-refresh.service';
import { takeInputFile } from '../../shared/utils/input-file';
import { normalizeLogoImageFile } from '../../shared/utils/normalize-logo-image';
import type { ShopNavConfig } from '../../core/layout/nav-config';
import type { ShopToolbarConfig } from '../../core/layout/toolbar-config';
import { ADMIN_SHOP_HOST } from './admin-shop-host';

const POSNET_TYPE_OPTIONS = [
  { value: 'PVS', label: 'PVS' },
  { value: 'MERCADO_PAGO', label: 'Mercado Pago' },
  { value: 'CUENTA_DNI', label: 'Cuenta DNI' },
] as const;

const EMAIL_NOTIFICATION_TYPE_OPTIONS = [
  { value: 'PAYMENT_VALIDATE', label: 'Pagos · pendiente de validar' },
  { value: 'PAYMENT_PAY', label: 'Pagos · pendiente de abonar' },
  { value: 'PAYMENT_REJECTED', label: 'Pagos · rechazados' },
  { value: 'PAYMENT_PAID', label: 'Pagos · abonados' },
  { value: 'CLOSING_CREATED', label: 'Cierres creados' },
  { value: 'CASH_WITHDRAWAL_PICKED', label: 'Retiros de efectivo' },
  { value: 'PRODUCTION_HOURS_LOGGED', label: 'Horas de producción cargadas' },
  { value: 'STOCK_BELOW_MINIMUM', label: 'Stock alimentos · bajo el mínimo' },
  { value: 'STOCK_SHARED', label: 'Stock alimentos · compartido' },
  { value: 'BEVERAGE_STOCK_BELOW_MINIMUM', label: 'Stock bebidas · bajo el mínimo' },
  { value: 'BEVERAGE_STOCK_SHARED', label: 'Stock bebidas · compartido' },
  { value: 'SHORTAGE_CREATED', label: 'Faltantes · crítico cargado' },
  { value: 'SHORTAGE_LEVEL_LOW', label: 'Faltantes · bajó a crítico' },
  { value: 'SHORTAGE_RESOLVED', label: 'Faltantes · resuelto' },
  { value: 'RESERVATION_REQUEST', label: 'Reservas · solicitud nueva' },
  { value: 'CUSTOMER_ORDER_CREATED', label: 'Pedidos online · pedido nuevo' },
  { value: 'MOVEMENT_CREATED', label: 'Movimientos y gastos rápidos' },
  { value: 'MOVEMENT_UPDATED', label: 'Gastos · editados' },
  { value: 'MOVEMENT_DELETED', label: 'Gastos · eliminados' },
  { value: 'PAYMENT_UPDATED', label: 'Pagos · editados' },
  { value: 'PAYMENT_DELETED', label: 'Pagos · eliminados' },
  { value: 'REIMBURSEMENT_CREATED', label: 'Reintegros · gasto de productor' },
] as const;

const ALL_EMAIL_NOTIFICATION_TYPES = EMAIL_NOTIFICATION_TYPE_OPTIONS.map((o) => o.value);

interface ShopUserOption {
  id: string;
  fullName: string;
  email: string;
  active?: boolean;
  avatarUrl?: string | null;
  hasAvatar?: boolean;
}

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
] as const;

const TIMEZONE_OPTIONS = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (Buenos Aires)' },
  { value: 'America/Montevideo', label: 'Uruguay (Montevideo)' },
  { value: 'America/Sao_Paulo', label: 'Brasil (São Paulo)' },
  { value: 'UTC', label: 'UTC' },
] as const;

@Component({
  selector: 'app-admin-shop',
  imports: [ReactiveFormsModule, MatButtonModule, MatIconModule, MatSnackBarModule, MatDialogModule, RouterOutlet],
  providers: [
    { provide: ADMIN_SHOP_HOST, useExisting: forwardRef(() => AdminShopPage) },
  ],
  template: `
    <form
      class="shop-admin shop-admin--shell"
      [formGroup]="form"
      (ngSubmit)="save()"
      [style.--guy-accent]="liveAccent()"
      [style.--guy-primary]="liveAccent()"
    >
      <router-outlet />

      @if (showSaveBar()) {
        <div class="shop-admin__save-spacer guy-form-save-spacer" aria-hidden="true"></div>
        <div class="shop-admin__save-bar guy-form-save-bar" [style.--save-accent]="liveAccent()">
          <button
            mat-flat-button
            type="submit"
            class="shop-admin__save-btn"
            [disabled]="form.invalid || saving()"
          >
            <mat-icon>save</mat-icon>
            {{ saving() ? 'Guardando…' : 'Guardar cambios' }}
          </button>
        </div>
      }
    </form>
  `,
  styleUrl: './admin-shop.scss',
})
export class AdminShopPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly api = inject(ClosingsApiService);
  private readonly settlementsInbox = inject(SettlementsInboxService);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  readonly shops = inject(ShopContextService);

  readonly salesSystems = signal<SalesSystemOption[]>([]);
  readonly allLedgerAccounts = signal<AdminAccountRow[]>([]);
  readonly shopUsers = signal<ShopUserOption[]>([]);
  readonly saving = signal(false);
  readonly sourceSaving = signal(false);
  readonly logoUploading = signal(false);
  readonly logoCacheBust = signal(Date.now());
  readonly uploadedLogoPath = signal<string | null>(null);
  readonly posnetTypes = POSNET_TYPE_OPTIONS;
  readonly emailTypeOptions = EMAIL_NOTIFICATION_TYPE_OPTIONS;
  readonly emailSmtpConfigured = signal(false);
  readonly clearSmtpPasswordOnSave = signal(false);
  readonly navConfigDraft = signal<ShopNavConfig | null>(null);
  readonly toolbarConfigDraft = signal<ShopToolbarConfig | null>(null);
  readonly closingSourceKinds = CLOSING_SOURCE_KIND_OPTIONS;
  private removedClosingSourceIds: string[] = [];
  private readonly destroyRef = inject(DestroyRef);
  /** Fuerza un nuevo GET de fuentes (reintento / pull-to-refresh / post-guardado). */
  private readonly sourcesReloadTick = signal(0);
  readonly sourcesLoading = signal(false);
  readonly sourcesLoadFailed = signal(false);
  readonly printAgentLoading = signal(false);
  readonly printAgentBusy = signal(false);
  readonly printAgentConfigured = signal(false);
  readonly printAgentTokenPrefix = signal<string | null>(null);
  readonly printAgentFreshToken = signal<string | null>(null);

  readonly accountSearchQuery = signal('');
  readonly onSelectSearchOpened = onSelectSearchOpened;

  readonly isEmailTypeSelectedBound = (type: string) => this.isEmailTypeSelected(type);
  readonly isEmailUserSelectedBound = (id: string) => this.isEmailUserSelected(id);
  readonly isShiftWeekdayBound = (index: number, day: number) => this.isShiftWeekday(index, day);
  readonly isClosedWeekdayBound = (day: number) => this.isClosedWeekday(day);
  readonly sourceNeedsAccountBound = (index: number) => this.sourceNeedsAccount(index);
  readonly filteredSourceAccountsBound = (keepId?: string | null) =>
    this.filteredSourceAccounts(keepId);

  private toPartyRule(raw: number | string | null | undefined): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(99, n);
  }

  isSuperAdmin(): boolean {
    return this.auth.isSuperAdmin();
  }

  canManageAccounts(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'accounts.manage');
  }

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    slug: ['', Validators.required],
    email: [''],
    instagramHandle: [''],
    phone: [''],
    emailSmtpPassword: [''],
    emailNotificationsEnabled: [true],
    emailNotificationTypes: this.fb.nonNullable.control<string[]>([...ALL_EMAIL_NOTIFICATION_TYPES]),
    emailNotificationUserIds: this.fb.nonNullable.control<string[]>([]),
    logoUrl: [''],
    accentColor: ['#2E7D32'],
    accentSecondary: ['#F9A825'],
    unitsLabel: [''],
    currency: ['ARS'],
    defaultChangeAmount: [0],
    openingTime: ['10:00'],
    timezone: ['America/Argentina/Buenos_Aires'],
    productionDefaultHours: [8],
    serviceAttendanceWithHours: [true],
    holidayPayMultiplier: [1],
    closedWeekdays: this.fb.nonNullable.control<number[]>([]),
    coversEnabled: [false],
    reservationsEnabled: [true],
    reservationSignupEnabled: [true],
    reservationInsideEnabled: [true],
    reservationOutsideEnabled: [true],
    reservationInsideMaxPartySize: this.fb.control<number | null>(null),
    reservationOutsideMinPartySize: this.fb.control<number | null>(null),
    waitingListEnabled: [true],
    tipsEnabled: [false],
    publicAttendanceEnabled: [false],
    publicServiceRulesEnabled: [false],
    menuEnabled: [false],
    shopMode: this.fb.nonNullable.control<'AL_PASO' | 'RESTAURANTE'>('RESTAURANTE'),
    onlineOrderingEnabled: [false],
    waiterOrderingEnabled: [false],
    takeawayEnabled: [true],
    deliveryEnabled: [false],
    orderingEtaTakeaway: [''],
    orderingEtaDelivery: [''],
    transferInstructions: [''],
    orderingWhatsapp: [''],
    payCash: [true],
    payTransfer: [true],
    deliveryZones: this.fb.array([]),
    orderingExtras: this.fb.array([]),
    takeawayHours: this.fb.array(this.emptyWeekdayHours()),
    deliveryHours: this.fb.array(this.emptyWeekdayHours()),
    active: [true],
    salesSystemId: this.fb.control<string | null>(null),
    paymentConceptCategories: this.fb.nonNullable.group({
      supplier: this.fb.nonNullable.control<string[]>([
        ...DEFAULT_PAYMENT_CONCEPT_CATEGORIES.supplier,
      ]),
      service: this.fb.nonNullable.control<string[]>([
        ...DEFAULT_PAYMENT_CONCEPT_CATEGORIES.service,
      ]),
      employee: this.fb.nonNullable.control<string[]>([
        ...DEFAULT_PAYMENT_CONCEPT_CATEGORIES.employee,
      ]),
      movement: this.fb.nonNullable.control<string[]>([
        ...DEFAULT_PAYMENT_CONCEPT_CATEGORIES.movement,
      ]),
    }),
    posnets: this.fb.array([]),
    shifts: this.fb.array([]),
    closingSources: this.fb.array([]),
  });

  readonly weekdayOptions = WEEKDAY_OPTIONS;
  readonly timezoneOptions = TIMEZONE_OPTIONS;
  readonly conceptCategoryOptions = CONCEPT_CATEGORY_OPTIONS;

  get posnets(): FormArray {
    return this.form.get('posnets') as FormArray;
  }

  get shifts(): FormArray {
    return this.form.get('shifts') as FormArray;
  }

  get closingSources(): FormArray {
    return this.form.get('closingSources') as FormArray;
  }

  get deliveryZones(): FormArray {
    return this.form.get('deliveryZones') as FormArray;
  }

  get orderingExtras(): FormArray {
    return this.form.get('orderingExtras') as FormArray;
  }

  get takeawayHours(): FormArray {
    return this.form.get('takeawayHours') as FormArray;
  }

  get deliveryHours(): FormArray {
    return this.form.get('deliveryHours') as FormArray;
  }

  private emptyWindows(open = '12:00', close = '17:00'): FormArray {
    return this.fb.array([this.buildHourWindow(open, close)]);
  }

  buildHourWindow(open = '12:00', close = '17:00'): FormGroup {
    return this.fb.nonNullable.group({
      open: [this.normalizeHhMm(open) ?? '12:00'],
      close: [this.normalizeHhMm(close) ?? '17:00'],
    });
  }

  /** Safari/iOS time inputs a veces mandan HH:mm:ss. */
  normalizeHhMm(raw: unknown): string | null {
    const m = String(raw ?? '')
      .trim()
      .match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
    if (!m) return null;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  }

  private emptyWeekdayHours(): FormGroup[] {
    return [0, 1, 2, 3, 4, 5, 6].map((day) =>
      this.fb.nonNullable.group({
        day: [day],
        enabled: [false],
        windows: this.emptyWindows(),
      }),
    );
  }

  private dayWindowsFromRaw(
    raw: { open: string; close: string } | Array<{ open: string; close: string }> | null | undefined,
  ): Array<{ open: string; close: string }> {
    if (!raw) return [];
    const list = Array.isArray(raw) ? raw : [raw];
    return list
      .map((w) => ({
        open: this.normalizeHhMm(w?.open) ?? '',
        close: this.normalizeHhMm(w?.close) ?? '',
      }))
      .filter((w) => !!w.open && !!w.close);
  }

  private setHoursFromConfig(
    arr: FormArray,
    hours:
      | Record<
          string,
          { open: string; close: string } | Array<{ open: string; close: string }> | null
        >
      | null
      | undefined,
  ): void {
    arr.clear();
    for (const day of [0, 1, 2, 3, 4, 5, 6]) {
      const wins = this.dayWindowsFromRaw(hours?.[String(day)]);
      const windows = this.fb.array(
        wins.length
          ? wins.map((w) => this.buildHourWindow(w.open, w.close))
          : [this.buildHourWindow()],
      );
      arr.push(
        this.fb.nonNullable.group({
          day: [day],
          enabled: [wins.length > 0],
          windows,
        }),
      );
    }
  }

  /**
   * Siempre persiste los 7 días. Cerrado = null por día.
   * Evita mandar `null` del canal entero (se reinterpretaba como “sin config” y se re-sembraba).
   */
  private hoursToConfig(
    arr: FormArray,
  ): Record<string, Array<{ open: string; close: string }> | null> {
    const out: Record<string, Array<{ open: string; close: string }> | null> = {};
    for (const ctrl of arr.controls) {
      const g = ctrl as FormGroup;
      const day = Number(g.get('day')?.value);
      const enabled = !!g.get('enabled')?.value;
      const windowsArr = g.get('windows') as FormArray | null;
      const wins = (windowsArr?.controls ?? [])
        .map((c) => {
          const w = (c as FormGroup).getRawValue() as { open: string; close: string };
          return {
            open: this.normalizeHhMm(w.open) ?? '',
            close: this.normalizeHhMm(w.close) ?? '',
          };
        })
        .filter((w) => !!w.open && !!w.close);
      out[String(day)] = enabled && wins.length ? wins : null;
    }
    for (let d = 0; d <= 6; d++) {
      if (!(String(d) in out)) out[String(d)] = null;
    }
    return out;
  }

  /** Copia turnos de caja → horarios de pedidos (varios turnos/día = varias franjas). */
  applyOrderingHoursFromShifts(channel: 'takeaway' | 'delivery' | 'both' = 'both'): void {
    const byDay: Record<number, Array<{ open: string; close: string }>> = {};
    for (let d = 0; d <= 6; d++) byDay[d] = [];
    for (const ctrl of this.shifts.controls) {
      const s = (ctrl as FormGroup).getRawValue() as {
        opensAt: string;
        closesAt: string;
        weekdays: number[];
      };
      const open = String(s.opensAt ?? '').trim() || '12:00';
      const close = String(s.closesAt ?? '').trim() || open;
      const days =
        Array.isArray(s.weekdays) && s.weekdays.length ? s.weekdays : [0, 1, 2, 3, 4, 5, 6];
      for (const d of days) {
        if (d < 0 || d > 6) continue;
        if (byDay[d].some((w) => w.open === open && w.close === close)) continue;
        byDay[d].push({ open, close });
      }
    }
    for (let d = 0; d <= 6; d++) {
      byDay[d].sort((a, b) => a.open.localeCompare(b.open));
    }
    const apply = (arr: FormArray) => {
      for (const ctrl of arr.controls) {
        const g = ctrl as FormGroup;
        const day = Number(g.get('day')?.value);
        const wins = byDay[day] ?? [];
        const windows = g.get('windows') as FormArray;
        windows.clear();
        if (wins.length) {
          for (const w of wins) windows.push(this.buildHourWindow(w.open, w.close));
          g.patchValue({ enabled: true });
        } else {
          windows.push(this.buildHourWindow());
          g.patchValue({ enabled: false });
        }
      }
    };
    if (channel === 'takeaway' || channel === 'both') apply(this.takeawayHours);
    if (channel === 'delivery' || channel === 'both') apply(this.deliveryHours);
  }

  private seedOrderingHoursFromShiftsIfEmpty(
    orderingHours:
      | {
          takeaway?: unknown;
          delivery?: unknown;
        }
      | null
      | undefined,
  ): void {
    // Solo sembrar si el canal nunca se configuró (sin keys 0–6).
    // Un mapa con todos null = cerrado a propósito; no volver a pisar con turnos de caja.
    if (this.channelHoursNeedSeed(orderingHours?.takeaway)) {
      this.applyOrderingHoursFromShifts('takeaway');
    }
    if (this.channelHoursNeedSeed(orderingHours?.delivery)) {
      this.applyOrderingHoursFromShifts('delivery');
    }
  }

  private channelHoursNeedSeed(raw: unknown): boolean {
    if (raw == null || typeof raw !== 'object') return true;
    for (let d = 0; d <= 6; d++) {
      if (Object.prototype.hasOwnProperty.call(raw, String(d))) return false;
    }
    return true;
  }

  addDeliveryZone(): void {
    this.deliveryZones.push(
      this.fb.nonNullable.group({
        id: [''],
        name: [''],
        fee: [0],
        note: [''],
      }),
    );
  }

  removeDeliveryZone(index: number): void {
    this.deliveryZones.removeAt(index);
  }

  addOrderingExtra(): void {
    this.orderingExtras.push(
      this.fb.nonNullable.group({
        id: [''],
        name: [''],
        price: [0],
        available: [true],
        menuItemIdsText: [''],
      }),
    );
  }

  removeOrderingExtra(index: number): void {
    this.orderingExtras.removeAt(index);
  }

  readonly sourceAccountOptions = computed(() =>
    this.allLedgerAccounts().filter((a) => a.active && a.type !== 'SYSTEM'),
  );

  filteredSourceAccounts(keepId?: string | null) {
    return filterBySelectQuery(
      this.sourceAccountOptions(),
      this.accountSearchQuery(),
      (a) => a.name,
      keepId,
    );
  }

  readonly formValue = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  readonly liveName = computed(() => this.formValue()?.name?.trim() ?? '');
  readonly liveSlug = computed(() => this.formValue()?.slug?.trim() ?? '');
  readonly liveAccent = computed(() => {
    const v = this.formValue()?.accentColor?.trim() || '#2E7D32';
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : '#2E7D32';
  });
  readonly liveAccentSecondary = computed(() => {
    const v = this.formValue()?.accentSecondary?.trim() || this.liveAccent();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : this.liveAccent();
  });
  readonly hasLogo = computed(
    () => !!(this.uploadedLogoPath() || (this.formValue()?.logoUrl ?? '').trim()),
  );

  readonly previewUrl = computed(() => {
    const raw = this.effectiveLogoRaw();
    return (
      resolveShopLogoSrc(raw, this.shops.selectedShopId(), this.logoCacheBust()) ||
      normalizeLogoUrl(raw) ||
      ''
    );
  });

  private effectiveLogoRaw(): string {
    const link = (this.formValue()?.logoUrl ?? '').trim();
    if (link && !isUploadedShopLogoPath(link)) return link;
    return this.uploadedLogoPath() ?? '';
  }

  private applyLogoFromShop(logoUrl?: string | null): void {
    const raw = (logoUrl ?? '').trim();
    if (isUploadedShopLogoPath(raw)) {
      this.uploadedLogoPath.set(raw);
      this.form.patchValue({ logoUrl: '' });
    } else {
      this.uploadedLogoPath.set(null);
      this.form.patchValue({ logoUrl: raw });
    }
    this.logoCacheBust.set(Date.now());
  }

  /** Save bar solo en submódulos (no en el hub). */
  readonly showSaveBar = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) =>
        /\/admin\/shop\/(identidad|operacion|pedidos|dispositivos|menu|avanzado)/.test(
          e.urlAfterRedirects,
        ),
      ),
      startWith(
        /\/admin\/shop\/(identidad|operacion|pedidos|dispositivos|menu|avanzado)/.test(
          this.router.url,
        ),
      ),
    ),
    {
      initialValue: /\/admin\/shop\/(identidad|operacion|pedidos|dispositivos|menu|avanzado)/.test(
        this.router.url,
      ),
    },
  );

  constructor() {
    usePageRefresh(() => {
      this.reloadAccounts();
      this.reloadClosingSources();
      this.reloadPrintAgentStatus();
    });

    toObservable(
      computed(() => ({
        shopId: this.shops.selectedShopId(),
        tick: this.sourcesReloadTick(),
      })),
    )
      .pipe(
        switchMap(({ shopId }) => {
          if (!shopId) {
            this.allLedgerAccounts.set([]);
            this.printAgentConfigured.set(false);
            this.printAgentTokenPrefix.set(null);
            this.printAgentFreshToken.set(null);
            return of({
              shopId: null as string | null,
              rows: null as ShopClosingSource[] | null,
              failed: false,
            });
          }
          this.reloadAccounts();
          this.reloadPrintAgentStatus();
          this.sourcesLoading.set(true);
          this.sourcesLoadFailed.set(false);
          return this.api.listClosingSources(shopId).pipe(
            map((rows) => ({ shopId, rows, failed: false as const })),
            catchError(() =>
              of({
                shopId,
                rows: null as ShopClosingSource[] | null,
                failed: true as const,
              }),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (!result.shopId) return;
        if (this.shops.selectedShopId() !== result.shopId) return;
        this.sourcesLoading.set(false);
        if (result.failed) {
          this.sourcesLoadFailed.set(true);
          // No vaciar: un error viejo no debe tapar fuentes que ya se veían.
          this.snack.open('No se pudieron cargar las fuentes extra', 'OK', { duration: 3000 });
          return;
        }
        this.sourcesLoadFailed.set(false);
        this.setClosingSources(result.rows ?? []);
      });
  }

  ngOnInit(): void {
    const shopId = this.shops.selectedShopId();
    if (!canManageOrderingCatalog(this.auth.currentUser(), shopId)) {
      void this.router.navigate(['/']);
      return;
    }
    this.api.listSalesSystems().subscribe({
      next: (rows) => this.salesSystems.set(rows),
      error: () => this.salesSystems.set([]),
    });
    const shop = this.shops.selectedShop();
    if (!shop) return;
    this.patchShopForm(shop);
    this.applyPaymentConceptCategories(shop.paymentConceptCategories);
    this.navConfigDraft.set(shop.navConfig ?? null);
    this.toolbarConfigDraft.set(shop.toolbarConfig ?? null);
    this.applyLogoFromShop(shop.logoUrl);
    this.applyEmailLists(shop.emailNotificationTypes, shop.emailNotificationUserIds);
    this.setPosnets(shop.posnets ?? []);
    this.setShifts(shopShiftsOf(shop));
    this.seedOrderingHoursFromShiftsIfEmpty(shop.orderingHours);
    this.emailSmtpConfigured.set(!!shop.emailSmtpConfigured);
    this.clearSmtpPasswordOnSave.set(false);
    if (shopId) {
      this.loadShopUsers(shopId, shop.emailNotificationUserIds ?? null);
      this.http.get<any>(`${environment.apiUrl}/shops/${shopId}`).subscribe({
        next: (s) => {
          this.patchShopForm(s);
          this.applyLogoFromShop(s.logoUrl);
          this.emailSmtpConfigured.set(!!s.emailSmtpConfigured);
          this.clearSmtpPasswordOnSave.set(false);
          this.applyEmailLists(s.emailNotificationTypes, s.emailNotificationUserIds);
          this.setPosnets(s.posnets ?? []);
          this.setShifts(shopShiftsOf(s));
          this.seedOrderingHoursFromShiftsIfEmpty(s.orderingHours);
          this.applyPaymentConceptCategories(s.paymentConceptCategories);
          this.navConfigDraft.set(s.navConfig ?? null);
          this.toolbarConfigDraft.set(s.toolbarConfig ?? null);
          this.shops.upsertShop(s);
          this.loadShopUsers(shopId, s.emailNotificationUserIds ?? null);
        },
      });
    }
  }

  private patchShopForm(s: {
    name?: string;
    slug?: string;
    email?: string | null;
    instagramHandle?: string | null;
    phone?: string | null;
    emailNotificationsEnabled?: boolean;
    accentColor?: string | null;
    accentSecondary?: string | null;
    unitsLabel?: string | null;
    currency?: string | null;
    defaultChangeAmount?: number | null;
    openingTime?: string | null;
    timezone?: string | null;
    productionDefaultHours?: number | null;
    closedWeekdays?: number[] | null;
    coversEnabled?: boolean;
    reservationsEnabled?: boolean;
    reservationSignupEnabled?: boolean;
    reservationInsideEnabled?: boolean;
    reservationOutsideEnabled?: boolean;
    reservationInsideMaxPartySize?: number | null;
    reservationOutsideMinPartySize?: number | null;
    waitingListEnabled?: boolean;
    tipsEnabled?: boolean;
    publicAttendanceEnabled?: boolean;
    publicServiceRulesEnabled?: boolean;
    serviceAttendanceWithHours?: boolean;
    holidayPayMultiplier?: number | null;
    menuEnabled?: boolean;
    shopMode?: 'AL_PASO' | 'RESTAURANTE';
    onlineOrderingEnabled?: boolean;
    waiterOrderingEnabled?: boolean;
    takeawayEnabled?: boolean;
    deliveryEnabled?: boolean;
    orderingHours?: {
      takeaway?: Record<
        string,
        { open: string; close: string } | Array<{ open: string; close: string }> | null
      > | null;
      delivery?: Record<
        string,
        { open: string; close: string } | Array<{ open: string; close: string }> | null
      > | null;
    } | null;
    orderingPayments?: {
      methods?: Array<'CASH' | 'TRANSFER'>;
      transferInstructions?: string | null;
      whatsapp?: string | null;
    } | null;
    deliveryZones?: Array<{
      id?: string;
      name: string;
      fee: number;
      note?: string | null;
    }> | null;
    orderingExtras?: Array<{
      id?: string;
      name: string;
      price: number;
      available?: boolean;
      menuItemIds?: string[];
    }> | null;
    orderingEta?: {
      takeaway?: string | null;
      delivery?: string | null;
    } | null;
    active?: boolean;
    salesSystemId?: string | null;
  }): void {
    this.form.patchValue({
      name: s.name ?? '',
      slug: s.slug ?? '',
      email: s.email ?? '',
      instagramHandle: s.instagramHandle ?? '',
      phone: s.phone ?? '',
      emailSmtpPassword: '',
      emailNotificationsEnabled: s.emailNotificationsEnabled !== false,
      accentColor: s.accentColor ?? '#2E7D32',
      accentSecondary: s.accentSecondary ?? '#F9A825',
      unitsLabel: s.unitsLabel ?? '',
      currency: s.currency ?? 'ARS',
      defaultChangeAmount: s.defaultChangeAmount ?? 0,
      openingTime: s.openingTime ?? '10:00',
      timezone: s.timezone ?? 'America/Argentina/Buenos_Aires',
      productionDefaultHours: s.productionDefaultHours ?? 8,
      closedWeekdays: Array.isArray(s.closedWeekdays) ? [...s.closedWeekdays] : [],
      coversEnabled: !!s.coversEnabled,
      reservationsEnabled: !!s.reservationsEnabled,
      reservationSignupEnabled: s.reservationSignupEnabled !== false,
      reservationInsideEnabled: s.reservationInsideEnabled !== false,
      reservationOutsideEnabled: s.reservationOutsideEnabled !== false,
      reservationInsideMaxPartySize: s.reservationInsideMaxPartySize ?? null,
      reservationOutsideMinPartySize: s.reservationOutsideMinPartySize ?? null,
      waitingListEnabled: !!s.waitingListEnabled,
      tipsEnabled: !!s.tipsEnabled,
      publicAttendanceEnabled: !!s.publicAttendanceEnabled,
      publicServiceRulesEnabled: !!s.publicServiceRulesEnabled,
      serviceAttendanceWithHours: s.serviceAttendanceWithHours !== false,
      holidayPayMultiplier: Number(s.holidayPayMultiplier ?? 1) || 1,
      menuEnabled: !!s.menuEnabled,
      shopMode: s.shopMode === 'AL_PASO' ? 'AL_PASO' : 'RESTAURANTE',
      onlineOrderingEnabled: !!s.onlineOrderingEnabled,
      waiterOrderingEnabled: !!s.waiterOrderingEnabled,
      takeawayEnabled: s.takeawayEnabled !== false,
      deliveryEnabled: !!s.deliveryEnabled,
      orderingEtaTakeaway: s.orderingEta?.takeaway ?? '',
      orderingEtaDelivery: s.orderingEta?.delivery ?? '',
      transferInstructions: s.orderingPayments?.transferInstructions ?? '',
      orderingWhatsapp: s.orderingPayments?.whatsapp ?? '',
      payCash: !s.orderingPayments?.methods || s.orderingPayments.methods.includes('CASH'),
      payTransfer:
        !s.orderingPayments?.methods || s.orderingPayments.methods.includes('TRANSFER'),
      active: s.active ?? true,
      salesSystemId: s.salesSystemId ?? null,
    });
    this.setHoursFromConfig(this.takeawayHours, s.orderingHours?.takeaway);
    this.setHoursFromConfig(this.deliveryHours, s.orderingHours?.delivery);
    this.deliveryZones.clear();
    for (const z of s.deliveryZones ?? []) {
      this.deliveryZones.push(
        this.fb.nonNullable.group({
          id: [z.id ?? ''],
          name: [z.name ?? ''],
          fee: [Number(z.fee) || 0],
          note: [z.note ?? ''],
        }),
      );
    }
    this.orderingExtras.clear();
    for (const e of s.orderingExtras ?? []) {
      this.orderingExtras.push(
        this.fb.nonNullable.group({
          id: [e.id ?? ''],
          name: [e.name ?? ''],
          price: [Number(e.price) || 0],
          available: [e.available !== false],
          menuItemIdsText: [(e.menuItemIds ?? []).join(', ')],
        }),
      );
    }
  }

  colorPickerValue(): string {
    return this.liveAccent();
  }

  colorSecondaryPickerValue(): string {
    return this.liveAccentSecondary();
  }

  onAccentPicker(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this.form.controls.accentColor.setValue(value.toUpperCase());
  }

  onAccentSecondaryPicker(ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    this.form.controls.accentSecondary.setValue(value.toUpperCase());
  }

  isClosedWeekday(day: number): boolean {
    return this.form.controls.closedWeekdays.value.includes(day);
  }

  toggleClosedWeekday(day: number): void {
    const cur = this.form.controls.closedWeekdays.value;
    const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day];
    this.form.controls.closedWeekdays.setValue(next.sort((a, b) => a - b));
  }

  private applyEmailLists(
    types: string[] | null | undefined,
    userIds: string[] | null | undefined,
  ): void {
    this.form.controls.emailNotificationTypes.setValue(
      Array.isArray(types)
        ? types.filter((t) =>
            ALL_EMAIL_NOTIFICATION_TYPES.includes(
              t as (typeof ALL_EMAIL_NOTIFICATION_TYPES)[number],
            ),
          )
        : [...ALL_EMAIL_NOTIFICATION_TYPES],
    );
    if (Array.isArray(userIds)) {
      this.form.controls.emailNotificationUserIds.setValue([...userIds]);
    }
  }

  private loadShopUsers(shopId: string, savedUserIds: string[] | null): void {
    this.http.get<ShopUserOption[]>(`${environment.apiUrl}/users`, { params: { shopId } }).subscribe({
      next: (users) => {
        const active = (users ?? []).filter((u) => u.active !== false);
        this.shopUsers.set(active);
        if (savedUserIds === null || savedUserIds === undefined) {
          this.form.controls.emailNotificationUserIds.setValue(active.map((u) => u.id));
        } else {
          const ids = new Set(active.map((u) => u.id));
          this.form.controls.emailNotificationUserIds.setValue(
            savedUserIds.filter((id) => ids.has(id)),
          );
        }
      },
      error: () => this.shopUsers.set([]),
    });
  }

  isEmailTypeSelected(type: string): boolean {
    return this.form.controls.emailNotificationTypes.value.includes(type);
  }

  toggleEmailType(type: string): void {
    const cur = this.form.controls.emailNotificationTypes.value;
    const next = cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type];
    this.form.controls.emailNotificationTypes.setValue(next);
  }

  allEmailTypesSelected(): boolean {
    return ALL_EMAIL_NOTIFICATION_TYPES.every((t) =>
      this.form.controls.emailNotificationTypes.value.includes(t),
    );
  }

  toggleAllEmailTypes(): void {
    this.form.controls.emailNotificationTypes.setValue(
      this.allEmailTypesSelected() ? [] : [...ALL_EMAIL_NOTIFICATION_TYPES],
    );
  }

  isEmailUserSelected(userId: string): boolean {
    return this.form.controls.emailNotificationUserIds.value.includes(userId);
  }

  toggleEmailUser(userId: string): void {
    const cur = this.form.controls.emailNotificationUserIds.value;
    const next = cur.includes(userId) ? cur.filter((id) => id !== userId) : [...cur, userId];
    this.form.controls.emailNotificationUserIds.setValue(next);
  }

  allEmailUsersSelected(): boolean {
    const users = this.shopUsers();
    if (!users.length) return true;
    return users.every((u) => this.form.controls.emailNotificationUserIds.value.includes(u.id));
  }

  toggleAllEmailUsers(): void {
    this.form.controls.emailNotificationUserIds.setValue(
      this.allEmailUsersSelected() ? [] : this.shopUsers().map((u) => u.id),
    );
  }

  addPosnet(): void {
    this.posnets.push(
      this.buildPosnetGroup({
        id: newId(),
        name: '',
        type: 'PVS',
      }),
    );
  }

  removePosnet(index: number): void {
    this.posnets.removeAt(index);
  }

  addShift(): void {
    const next = defaultShopShift(this.form.controls.openingTime.value);
    next.name = `Turno ${this.shifts.length + 1}`;
    this.shifts.push(this.buildShiftGroup(next));
  }

  removeShift(index: number): void {
    if (this.shifts.length < 2) return;
    this.shifts.removeAt(index);
  }

  private setShifts(rows: ShopShift[]): void {
    this.shifts.clear();
    for (const row of rows) {
      this.shifts.push(this.buildShiftGroup(row));
    }
    if (!this.shifts.length) {
      this.shifts.push(this.buildShiftGroup(defaultShopShift(this.form.controls.openingTime.value)));
    }
  }

  isShiftWeekday(index: number, day: number): boolean {
    const days = this.shifts.at(index)?.get('weekdays')?.value as number[] | undefined;
    return Array.isArray(days) && days.includes(day);
  }

  toggleShiftWeekday(index: number, day: number): void {
    const ctrl = this.shifts.at(index)?.get('weekdays');
    if (!ctrl) return;
    const cur = Array.isArray(ctrl.value) ? [...ctrl.value] : [];
    const next = cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day];
    if (!next.length) return;
    ctrl.setValue(next.sort((a, b) => a - b));
    ctrl.markAsDirty();
  }

  private buildShiftGroup(value: ShopShift) {
    const weekdays =
      Array.isArray(value.weekdays) && value.weekdays.length
        ? [...value.weekdays]
        : [0, 1, 2, 3, 4, 5, 6];
    return this.fb.nonNullable.group({
      id: [value.id || newId()],
      name: [value.name || 'Turno', Validators.required],
      opensAt: [value.opensAt || '10:00', Validators.required],
      closesAt: [value.closesAt || value.opensAt || '10:00', Validators.required],
      weekdays: [weekdays],
    });
  }

  private applyPaymentConceptCategories(raw?: unknown): void {
    const next = normalizePaymentConceptCategories(raw);
    this.form.controls.paymentConceptCategories.patchValue(next, { emitEvent: false });
  }

  private setPosnets(rows: ShopPosnet[]): void {
    this.posnets.clear();
    for (const row of rows) {
      this.posnets.push(this.buildPosnetGroup(row));
    }
  }

  private buildPosnetGroup(value: ShopPosnet) {
    return this.fb.nonNullable.group({
      id: [value.id || newId()],
      name: [value.name, Validators.required],
      type: [value.type || 'PVS', Validators.required],
    });
  }

  reloadClosingSources(): void {
    this.sourcesReloadTick.update((n) => n + 1);
  }

  addClosingSource(): void {
    this.closingSources.push(
      this.buildClosingSourceGroup({
        id: '',
        shopId: this.shops.selectedShopId() ?? '',
        name: '',
        includeInDeclared: false,
        kind: 'RECORD_ONLY',
        accountId: null,
        sortOrder: this.closingSources.length + 1,
        active: true,
      }),
    );
  }

  removeClosingSource(index: number): void {
    const id = String(this.closingSources.at(index)?.get('id')?.value ?? '');
    if (id) this.removedClosingSourceIds.push(id);
    this.closingSources.removeAt(index);
  }

  sourceNeedsAccount(index: number): boolean {
    return closingSourceKindNeedsAccount(
      String(this.closingSources.at(index)?.get('kind')?.value ?? ''),
    );
  }

  onClosingSourceKindChange(index: number): void {
    if (this.sourceNeedsAccount(index)) return;
    this.closingSources.at(index)?.patchValue({ accountId: null });
  }

  openCreateDestinationAccount(index: number): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManageAccounts()) return;
    const suggestedName = String(this.closingSources.at(index)?.get('name')?.value ?? '').trim();
    this.dialogTitle
      .track(
        this.dialog.open(AdminAccountDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            mode: 'create' as const,
            shopId,
            defaultType: 'CHANNEL' as const,
            ...(suggestedName ? { suggestedName } : {}),
          },
        }),
        'Nueva cuenta',
      )
      .afterClosed()
      .subscribe((saved) => {
        if (!saved || typeof saved !== 'object' || !saved.id) {
          this.reloadAccounts();
          return;
        }
        this.allLedgerAccounts.update((rows) => {
          if (rows.some((a) => a.id === saved.id)) return rows;
          return [...rows, saved].sort((a, b) => a.name.localeCompare(b.name, 'es'));
        });
        this.closingSources.at(index)?.patchValue({ accountId: saved.id });
        this.reloadAccounts();
      });
  }

  async saveClosingSources(): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    for (let i = 0; i < this.closingSources.length; i++) {
      const row = this.closingSources.at(i)?.getRawValue() as ShopClosingSource;
      const name = String(row?.name ?? '').trim();
      if (!name) {
        this.snack.open('Cada fuente necesita un nombre', 'OK', { duration: 3000 });
        return;
      }
      if (closingSourceKindNeedsAccount(row.kind) && !row.accountId) {
        this.snack.open(`Elegí la cuenta destino de «${name}»`, 'OK', { duration: 3500 });
        return;
      }
    }
    this.sourceSaving.set(true);
    try {
      for (const id of this.removedClosingSourceIds) {
        await firstValueFrom(this.api.removeClosingSource(shopId, id));
      }
      this.removedClosingSourceIds = [];
      for (let i = 0; i < this.closingSources.length; i++) {
        const row = this.closingSources.at(i);
        const raw = row?.getRawValue() as ShopClosingSource;
        const body = {
          name: String(raw.name ?? '').trim(),
          includeInDeclared: !!raw.includeInDeclared,
          kind: raw.kind,
          accountId: raw.accountId || null,
          sortOrder: i + 1,
          active: true,
        };
        if (raw.id) {
          const updated = await firstValueFrom(this.api.updateClosingSource(shopId, raw.id, body));
          row?.patchValue(
            { id: updated.id, accountId: updated.accountId ?? null },
            { emitEvent: false },
          );
        } else {
          const created = await firstValueFrom(this.api.createClosingSource(shopId, body));
          row?.patchValue(
            { id: created.id, accountId: created.accountId ?? null },
            { emitEvent: false },
          );
        }
      }
      this.snack.open('Fuentes extra actualizadas', 'OK', { duration: 2500 });
      this.reloadClosingSources();
      await this.auth.refreshMe();
      this.settlementsInbox.refresh();
    } catch (err) {
      const msg =
        (err as { error?: { message?: string | string[] } })?.error?.message ??
        'No se pudieron guardar las fuentes';
      this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
    } finally {
      this.sourceSaving.set(false);
    }
  }

  private setClosingSources(rows: ShopClosingSource[]): void {
    this.removedClosingSourceIds = [];
    this.closingSources.clear();
    for (const row of rows) {
      this.closingSources.push(this.buildClosingSourceGroup(row));
    }
  }

  private buildClosingSourceGroup(value: ShopClosingSource) {
    return this.fb.group({
      id: [value.id || ''],
      name: [value.name || ''],
      includeInDeclared: [!!value.includeInDeclared],
      kind: [value.kind || 'RECORD_ONLY'],
      accountId: [value.accountId ?? null],
      sortOrder: [value.sortOrder ?? 0],
    });
  }

  reloadAccounts(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.http.get<AdminAccountRow[]>(`${environment.apiUrl}/shops/${shopId}/accounts`).subscribe({
      next: (rows) => this.allLedgerAccounts.set(rows),
      error: () => this.snack.open('No se pudieron cargar las cuentas', 'OK', { duration: 3000 }),
    });
  }

  reloadPrintAgentStatus(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.printAgentConfigured.set(false);
      this.printAgentTokenPrefix.set(null);
      return;
    }
    this.printAgentLoading.set(true);
    this.http
      .get<{ configured: boolean; tokenPrefix: string | null }>(
        `${environment.apiUrl}/shops/${shopId}/print-agent`,
      )
      .subscribe({
        next: (res) => {
          this.printAgentLoading.set(false);
          this.printAgentConfigured.set(!!res.configured);
          this.printAgentTokenPrefix.set(res.tokenPrefix ?? null);
        },
        error: () => {
          this.printAgentLoading.set(false);
          this.snack.open('No se pudo cargar el estado de Comandas', 'OK', { duration: 3000 });
        },
      });
  }

  generatePrintAgentToken(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.printAgentBusy()) return;
    this.printAgentBusy.set(true);
    this.http
      .post<{
        token: string;
        tokenPrefix: string;
        configured: boolean;
        hint?: string;
      }>(`${environment.apiUrl}/shops/${shopId}/print-agent/token`, {})
      .subscribe({
        next: (res) => {
          this.printAgentBusy.set(false);
          this.printAgentConfigured.set(true);
          this.printAgentTokenPrefix.set(res.tokenPrefix ?? null);
          this.printAgentFreshToken.set(res.token);
          this.snack.open(res.hint || 'Token generado. Copialo ahora.', 'OK', { duration: 4500 });
        },
        error: (err) => {
          this.printAgentBusy.set(false);
          const msg = err?.error?.message || 'No se pudo generar el token';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }

  revokePrintAgentToken(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.printAgentBusy()) return;
    this.printAgentBusy.set(true);
    this.http.delete<{ configured: boolean }>(`${environment.apiUrl}/shops/${shopId}/print-agent/token`).subscribe({
      next: () => {
        this.printAgentBusy.set(false);
        this.printAgentConfigured.set(false);
        this.printAgentTokenPrefix.set(null);
        this.printAgentFreshToken.set(null);
        this.snack.open('Token de Comandas revocado', 'OK', { duration: 2500 });
      },
      error: (err) => {
        this.printAgentBusy.set(false);
        const msg = err?.error?.message || 'No se pudo revocar el token';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  copyPrintAgentToken(): void {
    const token = this.printAgentFreshToken();
    if (!token) return;
    void navigator.clipboard.writeText(token).then(
      () => this.snack.open('Token copiado', 'OK', { duration: 2000 }),
      () => this.snack.open('No se pudo copiar. Seleccioná el texto a mano.', 'OK', { duration: 3500 }),
    );
  }

  markClearSmtpPassword(): void {
    this.clearSmtpPasswordOnSave.set(true);
    this.form.controls.emailSmtpPassword.setValue('');
    this.snack.open('Se quitará la contraseña al guardar', 'OK', { duration: 2500 });
  }

  onNavConfigChange(cfg: ShopNavConfig | null): void {
    this.navConfigDraft.set(cfg);
  }

  onToolbarConfigChange(cfg: ShopToolbarConfig | null): void {
    this.toolbarConfigDraft.set(cfg);
  }

  save(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.form.invalid || this.saving()) return;
    const raw = this.form.getRawValue();
    this.saving.set(true);
    const body: Record<string, unknown> = {
      name: raw.name,
      slug: raw.slug,
      email: raw.email.trim() || null,
      instagramHandle: raw.instagramHandle.trim().replace(/^@+/, '') || null,
      phone: raw.phone.trim() || null,
      emailNotificationsEnabled: !!raw.emailNotificationsEnabled,
      emailNotificationTypes: this.allEmailTypesSelected()
        ? null
        : [...raw.emailNotificationTypes],
      emailNotificationUserIds: this.allEmailUsersSelected()
        ? null
        : [...raw.emailNotificationUserIds],
      logoUrl: this.effectiveLogoRaw(),
      accentColor: raw.accentColor.trim() || null,
      accentSecondary: raw.accentSecondary.trim() || null,
      unitsLabel: raw.unitsLabel.trim() || null,
      currency: raw.currency || 'ARS',
      defaultChangeAmount: raw.defaultChangeAmount,
      openingTime: raw.openingTime || '10:00',
      shifts: (raw.shifts as ShopShift[])
        .map((s) => ({
          id: s.id || newId(),
          name: String(s.name ?? '').trim(),
          opensAt: s.opensAt,
          closesAt: s.closesAt,
          weekdays: Array.isArray(s.weekdays) ? [...s.weekdays] : [0, 1, 2, 3, 4, 5, 6],
        }))
        .filter((s) => !!s.name),
      timezone: raw.timezone || 'America/Argentina/Buenos_Aires',
      productionDefaultHours: raw.productionDefaultHours ?? 8,
      serviceAttendanceWithHours: raw.serviceAttendanceWithHours,
      holidayPayMultiplier: Number(raw.holidayPayMultiplier ?? 1) || 1,
      closedWeekdays: [...raw.closedWeekdays].sort((a, b) => a - b),
      coversEnabled: raw.coversEnabled,
      reservationsEnabled: raw.reservationsEnabled,
      reservationSignupEnabled: raw.reservationSignupEnabled,
      reservationInsideEnabled: raw.reservationInsideEnabled,
      reservationOutsideEnabled: raw.reservationOutsideEnabled,
      reservationInsideMaxPartySize: this.toPartyRule(raw.reservationInsideMaxPartySize),
      reservationOutsideMinPartySize: this.toPartyRule(raw.reservationOutsideMinPartySize),
      waitingListEnabled: raw.waitingListEnabled,
      tipsEnabled: raw.tipsEnabled,
      publicAttendanceEnabled: raw.publicAttendanceEnabled,
      publicServiceRulesEnabled: raw.publicServiceRulesEnabled,
      menuEnabled: raw.menuEnabled,
      shopMode: raw.shopMode === 'AL_PASO' ? 'AL_PASO' : 'RESTAURANTE',
      onlineOrderingEnabled: raw.onlineOrderingEnabled,
      waiterOrderingEnabled: raw.waiterOrderingEnabled,
      takeawayEnabled: raw.takeawayEnabled,
      deliveryEnabled: raw.deliveryEnabled,
      orderingHours: {
        takeaway: this.hoursToConfig(this.takeawayHours),
        delivery: this.hoursToConfig(this.deliveryHours),
      },
      orderingPayments: {
        methods: [
          ...(raw.payCash ? (['CASH'] as const) : []),
          ...(raw.payTransfer ? (['TRANSFER'] as const) : []),
        ],
        transferInstructions: String(raw.transferInstructions ?? '').trim() || null,
        whatsapp: String(raw.orderingWhatsapp ?? '').trim() || null,
      },
      deliveryZones: (raw.deliveryZones as Array<{
        id?: string;
        name: string;
        fee: number;
        note?: string;
      }>)
        .map((z) => ({
          id: z.id || undefined,
          name: String(z.name ?? '').trim(),
          fee: Number(z.fee) || 0,
          note: String(z.note ?? '').trim() || null,
        }))
        .filter((z) => !!z.name),
      orderingEta: {
        takeaway: String(raw.orderingEtaTakeaway ?? '').trim() || null,
        delivery: String(raw.orderingEtaDelivery ?? '').trim() || null,
      },
      active: raw.active,
      salesSystemId: raw.salesSystemId || null,
      paymentConceptCategories: { ...raw.paymentConceptCategories },
      navConfig: this.navConfigDraft(),
      toolbarConfig: this.toolbarConfigDraft(),
      posnets: (raw.posnets as ShopPosnet[])
        .map((p) => ({
          id: p.id,
          name: String(p.name ?? '').trim(),
          type: p.type,
        }))
        .filter((p) => !!p.name),
    };
    const smtpPass = String(raw.emailSmtpPassword ?? '').trim();
    if (this.clearSmtpPasswordOnSave()) {
      body['emailSmtpPassword'] = null;
    } else if (smtpPass) {
      body['emailSmtpPassword'] = smtpPass;
    }

    const canFull = canManageShop(this.auth.currentUser(), shopId);
    const req$ = canFull
      ? this.http.patch<any>(`${environment.apiUrl}/shops/${shopId}`, body)
      : this.http.patch<any>(`${environment.apiUrl}/shops/${shopId}/ordering-catalog`, {
          shopMode: body['shopMode'],
          onlineOrderingEnabled: body['onlineOrderingEnabled'],
          waiterOrderingEnabled: body['waiterOrderingEnabled'],
          takeawayEnabled: body['takeawayEnabled'],
          deliveryEnabled: body['deliveryEnabled'],
          orderingHours: body['orderingHours'],
          orderingEta: body['orderingEta'],
          deliveryZones: body['deliveryZones'],
          orderingPayments: body['orderingPayments'],
        });

    req$.subscribe({
      next: (shop) => {
        const scrollY = window.scrollY;
        this.saving.set(false);
        this.emailSmtpConfigured.set(!!shop.emailSmtpConfigured);
        this.clearSmtpPasswordOnSave.set(false);
        this.form.controls.emailSmtpPassword.setValue('');
        this.applyLogoFromShop(shop.logoUrl);
        if (shop.active === false) {
          this.shops.setShops(this.shops.shops().filter((s) => s.id !== shop.id));
        } else {
          this.shops.upsertShop(shop);
        }
        void this.auth.refreshMe().finally(() => {
          requestAnimationFrame(() => {
            window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' as ScrollBehavior });
          });
        });
        this.snack.open('Local actualizado', 'OK', { duration: 2500 });
      },
      error: (err) => {
        this.saving.set(false);
        const msg = err?.error?.message ?? 'No se pudo guardar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  clearLogo(): void {
    const shopId = this.shops.selectedShopId();
    this.uploadedLogoPath.set(null);
    this.form.patchValue({ logoUrl: '' });
    this.logoCacheBust.set(Date.now());
    if (!shopId) return;
    this.http.patch<any>(`${environment.apiUrl}/shops/${shopId}`, { logoUrl: '' }).subscribe({
      next: (s) => {
        this.shops.upsertShop(s, { bustLogo: true });
        this.snack.open('Logo quitado', 'OK', { duration: 2000 });
      },
      error: () => {},
    });
  }

  async onLogoFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const picked = await takeInputFile(input);
    const shopId = this.shops.selectedShopId();
    if (!picked || !shopId) return;
    if (!picked.type.startsWith('image/')) {
      this.snack.open('Elegí una imagen (PNG, JPG, WEBP…)', 'OK', { duration: 3000 });
      return;
    }
    if (picked.size > 5 * 1024 * 1024) {
      this.snack.open('La imagen no puede superar 5 MB', 'OK', { duration: 3000 });
      return;
    }
    let file = picked;
    try {
      file = await normalizeLogoImageFile(picked);
    } catch {
      // Si falla la conversión, subimos el original.
    }
    const body = new FormData();
    body.append('file', file);
    this.logoUploading.set(true);
    this.http.post<any>(`${environment.apiUrl}/shops/${shopId}/logo`, body).subscribe({
      next: (s) => {
        this.logoUploading.set(false);
        this.applyLogoFromShop(s.logoUrl);
        this.shops.upsertShop(s, { bustLogo: true });
        this.snack.open('Logo subido', 'OK', { duration: 2200 });
      },
      error: (err) => {
        this.logoUploading.set(false);
        const msg = err?.error?.message ?? 'No se pudo subir el logo';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  openBackupTools(): void {
    const shop = this.shops.selectedShop();
    if (!shop) return;
    this.dialogTitle
      .track(
        this.dialog.open(ShopBackupDialogComponent, {
          width: '640px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { shopId: shop.id, shopName: shop.name, shopSlug: shop.slug },
        }),
        'Dump y reset',
      )
      .afterClosed()
      .subscribe();
  }
}
