import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Subscription,
  catchError,
  debounceTime,
  filter,
  forkJoin,
  interval,
  map,
  of,
} from 'rxjs';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
import { PublicPagePwaService } from '../../core/pwa/public-page-pwa.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { ThemeService } from '../../core/theme/theme.service';
import { ImmersiveChromeService } from '../../core/layout/immersive-chrome.service';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import { prettySection } from '../menu/menu-display';
import {
  apiErrorMessage,
  formatOrderLinesInline,
  groupOrderLines,
  onAccentColor,
  orderingLogoUrl,
  orderingMoney,
} from '../customer-orders/ordering-ui.util';
import { PublicPageInstallBannerComponent } from '../../shared/components/public-page-install-banner';
import { KioskPinLoginComponent } from '../../shared/components/kiosk-pin-login';
import {
  WaiterApiService,
  WaiterCatalog,
  WaiterCounterSession,
  WaiterLineAudit,
  WaiterMapObject,
  WaiterSession,
  WaiterShiftTipsSummary,
  WaiterTable,
  type TablePaymentMethod,
} from './waiter-api.service';
import {
  ComandaLineReasonDialogComponent,
  comandaReasonLabel,
} from './comanda-line-reason-dialog';import {
  DEFAULT_WAITER_CAP_PUBLIC,
  DEFAULT_WAITER_CAP_STAFF,
  normalizeWaiterCapProfile,
  type WaiterCapProfile,
} from '../admin/waiter-capabilities';
import {
  resolveDiscountPresets,
  type DiscountPreset,
} from '../../core/shop/discount-presets';
import { resolveItemUnitPrice } from '../menu/menu-account-price.util';
import { ClosingsApiService } from '../closings/closings-api.service';

type PosLine = {
  key: string;
  kind: 'ITEM' | 'EXTRA' | 'PROMO';
  menuItemId: string;
  name: string;
  unitPrice: number;
  qty: number;
  extraId?: string;
  attachedToMenuItemId?: string;
  promoId?: string;
  /** Sectores de cocina del ítem (para Combina automático). */
  kitchenSectorIds?: string[];
  /** Sale a cocina como entrada. */
  isEntrada?: boolean;
  /** Keys de otras líneas del carrito con las que combina. */
  combinesWithKeys?: string[];
  /** Nota del plato (va a cocina bajo el ítem). */
  notes?: string;
};

type CatalogItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  accountPrices?: Array<{ accountId: string; price: number }>;
  section: string;
  kitchenSectorIds?: string[];
};

type View = 'login' | 'tables' | 'session';

/** «Mozo a cargo» = el usuario logueado sin empleado vinculado (la API lo resuelve). */
const STAFF_SELF_WAITER = 'self';

function tokenKey(slug: string) {
  return `waiter_token_${slug}`;
}

@Component({
  selector: 'app-waiter-page',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    PublicPageInstallBannerComponent,
    KioskPinLoginComponent,
  ],
  templateUrl: './waiter-page.html',
  styleUrls: ['./waiter-page.scss', './waiter-page.sheets.scss', './waiter-page.pay.scss'],
  host: {
    '[style.--accent]': 'hostAccentVar()',
    '[style.--on-accent]': 'hostOnAccentVar()',
    '[class.view-session]': 'view() === "session"',
    '[class.view-map]': 'view() === "tables" && showMap()',
    '[class.staff-embedded]': 'staffMode',
    '[class.chrome-off]': 'staffChromeOff()',
  },
})
export class WaiterPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(WaiterApiService);
  private readonly closingsApi = inject(ClosingsApiService);
  /** sourceId → ledger (precios legacy). */
  private readonly priceLedgerBySourceId = signal<Map<string, string>>(new Map());
  private readonly dialog = inject(MatDialog);
  private readonly title = inject(Title);
  private readonly shopContext = inject(ShopContextService);
  private readonly theme = inject(ThemeService);
  private readonly immersiveChrome = inject(ImmersiveChromeService);
  private readonly pagePwa = inject(PublicPagePwaService);
  private readonly live = inject(ShopLiveClient);
  private pwaApplied = false;
  /** SSE + poll: mesas/sesión al día entre mozos. */
  private liveSub: Subscription | null = null;
  private pollSub: Subscription | null = null;
  private readonly onVisibility = () => {
    if (document.visibilityState === 'visible' && this.token()) {
      this.onLiveFloorTick();
    }
  };

  /** Operación → Comanda (JWT, sin PIN). */
  readonly staffMode = !!this.route.snapshot.data['staffComanda'];
  /** Toolbar oculta: hay que respetar el safe-area de iOS (si no, ← Mesas queda bajo el reloj). */
  readonly staffChromeOff = computed(
    () => this.staffMode && this.immersiveChrome.toolbarHidden(),
  );

  private readonly slugSignal = signal(
    String(this.route.snapshot.paramMap.get('slug') ?? '').trim(),
  );
  readonly slug = this.slugSignal.asReadonly();
  readonly view = signal<View>('login');
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly toast = signal<string | null>(null);
  readonly pin = signal('');
  readonly token = signal<string | null>(null);
  readonly waiterName = signal('');
  /** Empleado vinculado a la sesión (PIN o staff); null si no hay vínculo. */
  readonly waiterEmployeeId = signal<string | null>(null);
  readonly shopName = signal('');
  readonly logoUrl = signal<string | null>(null);
  readonly accent = signal(this.theme.accent());
  readonly tables = signal<WaiterTable[]>([]);
  readonly counterSessions = signal<WaiterCounterSession[]>([]);
  readonly mapObjects = signal<WaiterMapObject[]>([]);
  readonly session = signal<WaiterSession | null>(null);
  readonly catalog = signal<WaiterCatalog | null>(null);
  readonly lines = signal<PosLine[]>([]);
  readonly query = signal('');
  readonly sectionFilter = signal<string | null>(null);
  /** Filtro de chip «Promos» (no es una sección de carta). */
  readonly promosSection = '__promos__';
  readonly notes = signal('');
  /** Panel de nota del envío abierto en el resumen. */
  readonly orderNoteOpen = signal(false);
  readonly printKitchen = signal(true);
  readonly printCustomerTicket = signal(false);
  /** Paso de la mesa: elegir platos o resumen / enviar. */
  readonly orderStep = signal<'pick' | 'review'>('pick');
  /** Carta + resumen lado a lado (mismo corte que el CSS ≥900px). */
  readonly orderSplitLayout = toSignal(
    inject(BreakpointObserver)
      .observe('(min-width: 900px)')
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  /** Pedido (carta) o Información (envíos + resumen). */
  readonly sessionPane = signal<'order' | 'info'>('order');
  /** Envíos en Información: contraídos por defecto. */
  readonly sessionEnviosOpen = signal(false);
  /** Vista detallada del carrito en resumen (qty +/− y nota). */
  readonly cartDetail = signal(true);
  /** Key de la línea cuyo panel «Combina» está abierto. */
  readonly combineOpenKey = signal<string | null>(null);
  /** Key de la línea cuyo panel «Nota» está abierto (vista resumen). */
  readonly noteOpenKey = signal<string | null>(null);
  /** Ítem de carta con extras desplegados (null = todos contraídos). */
  readonly extrasOpenFor = signal<string | null>(null);
  /** Borrador del cupo por promoId (vacío = ilimitado). */
  readonly promoCupoDrafts = signal<Record<string, string>>({});

  /** Sheet: elegir ítems del pool de una promo. */
  readonly promoPick = signal<{
    id: string;
    name: string;
    fixedPrice: number;
    packQty: number;
    poolItemIds: string[];
    tableMatchable?: boolean;
  } | null>(null);
  readonly promoPickCounts = signal<Record<string, number>>({});

  /** Sheet: pedir comensales (y mozo en admin) antes de abrir mesa. */
  readonly coversSheet = signal<WaiterTable | null>(null);
  readonly coversDraft = signal(2);
  readonly staffWaiters = signal<Array<{ id: string; fullName: string }>>([]);
  readonly coversWaiterId = signal<string | null>(null);
  /**
   * Opciones de «Mozo a cargo» al abrir mesa desde Operación → Comanda: el usuario
   * logueado primero (su empleado vinculado, o 'self' si no tiene) y después los mozos.
   */
  readonly coversWaiterChoices = computed(() => {
    const waiters = this.staffWaiters();
    if (!this.staffMode) return waiters;
    const selfId = this.waiterEmployeeId() || STAFF_SELF_WAITER;
    const self = { id: selfId, fullName: `${this.waiterName() || 'Yo'} (vos)` };
    return [self, ...waiters.filter((w) => w.id !== selfId)];
  });

  /** Sheet: cerrar mesa (ticket + pagos mixtos + propina). */
  readonly closeSheet = signal(false);
  readonly closeTipMode = signal<'none' | 'percent' | 'fixed'>('none');
  readonly closeTipValue = signal<number | null>(null);
  /** Montos por medio de pago (id → monto). */
  readonly closePayAmounts = signal<Record<string, number | null>>({});
  /** Cierre en dos pasos: resumen (descuento/propina) → pantalla de cobro. */
  readonly closeStep = signal<'summary' | 'pay'>('summary');
  /** Medio que absorbe el resto / último «Todo». */
  readonly closePayPrimaryId = signal<string | null>(null);

  /**
   * Medio de pago para fijar precio al agregar (solo staff).
   * Cambiar el chip no recalcula líneas ya cargadas.
   */
  readonly pricingPaymentMethodId = signal<string | null>(null);

  /** Resumen de propinas del turno (vista mesas). */
  readonly tipsSummary = signal<WaiterShiftTipsSummary | null>(null);
  readonly capabilities = signal<WaiterCapProfile>(
    this.staffMode ? DEFAULT_WAITER_CAP_STAFF : DEFAULT_WAITER_CAP_PUBLIC,
  );
  readonly historyOpen = signal(false);
  readonly historyDetailId = signal<string | null>(null);
  /** Filtro del historial: `all` o id de empleado. */
  readonly historyWaiterFilter = signal<string>('all');

  /** Sheet: imprimir ticket con descuento. */
  readonly ticketSheet = signal(false);
  /** Editar ítems del ticket: colapsado por defecto. */
  readonly ticketEditOpen = signal(false);
  readonly ticketOutsideOpen = signal(false);
  readonly ticketDiscountMode = signal<'none' | 'percent' | 'fixed'>('none');
  readonly ticketDiscountValue = signal<number | null>(null);
  readonly ticketDiscountPresetId = signal<string | null>(null);

  /** Tab de sector: null = Todos. */
  readonly sectorTab = signal<string | null>(null);

  /** Lista forzada aunque haya coords (toggle). */
  readonly forceList = signal(false);

  readonly onAccent = computed(() => onAccentColor(this.accent()));
  /** Siempre fijar --accent del local (también en Comanda embebida). */
  readonly hostAccentVar = computed(() => this.accent());
  readonly hostOnAccentVar = computed(() => this.onAccent());
  readonly lineCount = computed(() =>
    this.lines()
      .filter((l) => l.kind !== 'EXTRA')
      .reduce((s, l) => s + l.qty, 0),
  );

  readonly freeTables = computed(() => this.tables().filter((t) => !t.openSession));
  readonly busyTables = computed(() => this.tables().filter((t) => !!t.openSession));

  constructor() {
    // En Comanda embebida, seguir el color del local activo (a veces el host quedaba en el verde default).
    effect(() => {
      if (!this.staffMode) return;
      const fromShop = this.shopContext.accentColor();
      const next = this.resolveAccent(fromShop);
      if (next !== this.accent()) this.accent.set(next);
    });

    effect(() => {
      if (!this.staffMode) return;
      const blocked =
        this.view() === 'session' ||
        this.coversSheet() != null ||
        this.closeSheet() ||
        this.historyOpen() ||
        this.ticketSheet();
      untracked(() => this.immersiveChrome.setBottomBlocked('comanda', blocked));
    });
  }

  readonly sectorTabs = computed(() => {
    const names = new Set<string>();
    for (const t of this.tables()) {
      names.add(this.sectorNameOf(t));
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'es'));
  });

  readonly freeBySector = computed(() =>
    this.groupBySector(this.filterByTab(this.freeTables())),
  );
  readonly busyBySector = computed(() =>
    this.groupBySector(this.filterByTab(this.busyTables())),
  );

  readonly showSectorLabels = computed(() => this.sectorTab() === null);

  readonly hasMapLayout = computed(() =>
    this.tables().some((t) => t.mapX != null && t.mapY != null),
  );

  readonly showMap = computed(() => this.hasMapLayout() && !this.forceList());

  readonly mapTables = computed(() => {
    const tab = this.sectorTab();
    const list = this.tables();
    if (!tab) return list;
    return list.filter((t) => this.sectorNameOf(t) === tab);
  });

  readonly mapObjectsVisible = computed(() => {
    const objects = this.mapObjects();
    const tab = this.sectorTab();
    if (!tab) return objects;
    const sectorIds = new Set(
      this.tables()
        .filter((t) => this.sectorNameOf(t) === tab && t.sectorId)
        .map((t) => String(t.sectorId)),
    );
    return objects.filter((o) => sectorIds.has(String(o.sectorId)));
  });

  /**
   * En «Todos» cada sector tiene su propio plano (no se superponen coords).
   * En un sector solo, un único panel.
   */
  readonly mapSectorPanels = computed(() => {
    const tab = this.sectorTab();
    const sectors = this.sectorTabs();
    const raw =
      tab
        ? [this.panelForSector(tab)]
        : sectors.length <= 1
          ? [
              (() => {
                const only = sectors[0];
                return only
                  ? this.panelForSector(only)
                  : { name: '', tables: this.tables(), objects: this.mapObjects() };
              })(),
            ]
          : sectors.map((name) => this.panelForSector(name));
    return raw.map((panel) => this.withNormalizedFloorPositions(panel));
  });

  readonly mapShowsMultipleSectors = computed(() => this.mapSectorPanels().length > 1);

  private panelForSector(name: string): {
    name: string;
    tables: WaiterTable[];
    objects: WaiterMapObject[];
  } {
    const tables = this.tables().filter((t) => this.sectorNameOf(t) === name);
    const sectorIds = new Set(
      tables.filter((t) => t.sectorId).map((t) => String(t.sectorId)),
    );
    const objects = this.mapObjects().filter((o) => sectorIds.has(String(o.sectorId)));
    return { name, tables, objects };
  }

  /**
   * Reescala coords del sector al área útil del panel para que no se amontonen
   * ni queden todas en una esquina al separar Adentro/Afuera.
   */
  private withNormalizedFloorPositions(panel: {
    name: string;
    tables: WaiterTable[];
    objects: WaiterMapObject[];
  }): {
    name: string;
    tables: Array<WaiterTable & { viewX: number; viewY: number }>;
    objects: Array<WaiterMapObject & { viewX: number; viewY: number }>;
  } {
    const pts: Array<{ x: number; y: number }> = [];
    for (const t of panel.tables) {
      if (t.mapX == null || t.mapY == null) continue;
      pts.push({ x: Number(t.mapX), y: Number(t.mapY) });
    }
    for (const o of panel.objects) {
      if (o.mapX == null || o.mapY == null) continue;
      pts.push({ x: Number(o.mapX), y: Number(o.mapY) });
    }
    let minX = pts.length ? Math.min(...pts.map((p) => p.x)) : 0;
    let maxX = pts.length ? Math.max(...pts.map((p) => p.x)) : 100;
    let minY = pts.length ? Math.min(...pts.map((p) => p.y)) : 0;
    let maxY = pts.length ? Math.max(...pts.map((p) => p.y)) : 100;
    if (maxX - minX < 12) {
      const mid = (minX + maxX) / 2;
      minX = mid - 18;
      maxX = mid + 18;
    }
    if (maxY - minY < 14) {
      const mid = (minY + maxY) / 2;
      minY = mid - 20;
      maxY = mid + 20;
    }
    const padX = Math.max(10, (maxX - minX) * 0.14);
    const padY = Math.max(12, (maxY - minY) * 0.16);
    minX -= padX;
    maxX += padX;
    minY -= padY;
    maxY += padY;
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const mapPoint = (x: number | null | undefined, y: number | null | undefined) => ({
      viewX: x == null ? 50 : ((Number(x) - minX) / spanX) * 100,
      viewY: y == null ? 50 : ((Number(y) - minY) / spanY) * 100,
    });
    return {
      name: panel.name,
      tables: panel.tables.map((t) => ({ ...t, ...mapPoint(t.mapX, t.mapY) })),
      objects: panel.objects.map((o) => ({ ...o, ...mapPoint(o.mapX, o.mapY) })),
    };
  }

  private sectorNameOf(t: WaiterTable): string {
    return (t.sectorName ?? '').trim() || (t.area === 'OUTSIDE' ? 'Afuera' : 'Adentro');
  }

  private filterByTab(list: WaiterTable[]): WaiterTable[] {
    const tab = this.sectorTab();
    if (!tab) return list;
    return list.filter((t) => this.sectorNameOf(t) === tab);
  }

  private groupBySector(list: WaiterTable[]): Array<{ name: string; tables: WaiterTable[] }> {
    const map = new Map<string, WaiterTable[]>();
    for (const t of list) {
      const name = this.sectorNameOf(t);
      const arr = map.get(name) ?? [];
      arr.push(t);
      map.set(name, arr);
    }
    return [...map.entries()]
      .map(([name, tables]) => ({
        name,
        tables: tables
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'es')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  setSectorTab(name: string | null): void {
    this.sectorTab.set(name);
  }

  setFloorMode(mode: 'map' | 'list'): void {
    this.forceList.set(mode === 'list');
  }

  tableLeft(t: WaiterTable & { viewX?: number }): number {
    if (t.viewX != null && Number.isFinite(t.viewX)) return Number(t.viewX);
    return t.mapX == null ? 50 : Number(t.mapX);
  }

  tableTop(t: WaiterTable & { viewY?: number }): number {
    if (t.viewY != null && Number.isFinite(t.viewY)) return Number(t.viewY);
    return t.mapY == null ? 50 : Number(t.mapY);
  }

  objectLeft(o: WaiterMapObject & { viewX?: number }): number {
    if (o.viewX != null && Number.isFinite(o.viewX)) return Number(o.viewX);
    return Number(o.mapX);
  }

  objectTop(o: WaiterMapObject & { viewY?: number }): number {
    if (o.viewY != null && Number.isFinite(o.viewY)) return Number(o.viewY);
    return Number(o.mapY);
  }

  objectLabel(o: WaiterMapObject): string {
    if (o.kind === 'barra') return 'Bar';
    if (o.kind === 'arbol') return 'Árb';
    return 'Obj';
  }

  /**
   * Secciones agrupadas por carta. El `key` sigue siendo único (incluye título si hay
   * varias cartas); el `label` es solo el nombre de sección para la UI.
   */
  readonly sectionGroups = computed(() => {
    const menus = this.catalog()?.menus ?? [];
    const multi = menus.length > 1;
    const groups: Array<{
      menuKey: string;
      menuTitle: string | null;
      sections: Array<{ key: string; label: string }>;
    }> = [];
    for (const m of menus) {
      const menuTitle = multi
        ? String(m.title ?? '').trim() || 'Carta'
        : null;
      const menuKey = String(m.id ?? m.slug ?? menuTitle ?? groups.length);
      const sections: Array<{ key: string; label: string }> = [];
      const seen = new Set<string>();
      for (const sec of m.sections ?? []) {
        const label = prettySection(sec.name);
        const key = menuTitle ? `${label} · ${menuTitle}` : label;
        if (seen.has(key)) continue;
        seen.add(key);
        sections.push({ key, label });
      }
      if (sections.length) groups.push({ menuKey, menuTitle, sections });
    }
    return groups;
  });

  readonly sections = computed(() =>
    this.sectionGroups().flatMap((g) => g.sections.map((s) => s.key)),
  );

  readonly catalogItems = computed((): CatalogItem[] => {
    const menus = this.catalog()?.menus ?? [];
    const out: CatalogItem[] = [];
    for (const m of menus) {
      for (const sec of m.sections ?? []) {
        const section =
          menus.length > 1 && m.title
            ? `${prettySection(sec.name)} · ${m.title}`
            : prettySection(sec.name);
        for (const it of sec.items ?? []) {
          if (!it?.id || !it.name || it.price == null) continue;
          out.push({ ...it, section });
        }
      }
    }
    return out;
  });

  readonly filteredCatalog = computed(() => {
    const q = this.query().trim().toLowerCase();
    const sec = this.sectionFilter();
    return this.catalogItems().filter((it) => {
      if (sec && it.section !== sec) return false;
      if (!q) return true;
      return `${it.name} ${it.description ?? ''}`.toLowerCase().includes(q);
    });
  });

  readonly extras = computed(() => this.catalog()?.extras ?? []);

  readonly sellablePromos = computed(() =>
    (this.catalog()?.promos ?? []).filter(
      (p) => (p.forComanda ?? p.sellable) && (p.poolItemIds?.length || p.items?.length),
    ),
  );

  readonly promoPickSelected = computed(() =>
    Object.values(this.promoPickCounts()).reduce((s, n) => s + (Number(n) || 0), 0),
  );

  readonly promoPickPoolItems = computed(() => {
    const pick = this.promoPick();
    if (!pick) return [] as CatalogItem[];
    const catalog = this.catalogItems();
    const ids = pick.poolItemIds?.length
      ? pick.poolItemIds
      : [];
    return ids
      .map((id) => catalog.find((c) => c.id === id))
      .filter((x): x is CatalogItem => !!x);
  });

  readonly showCatalogChips = computed(
    () => this.sections().length > 1 || this.sellablePromos().length > 0,
  );

  readonly showingPromosOnly = computed(
    () => this.sectionFilter() === this.promosSection,
  );

  readonly matchablePromos = computed(() =>
    (this.catalog()?.promos ?? []).filter((p) => p.tableMatchable),
  );

  readonly discountPresets = computed(() =>
    resolveDiscountPresets(this.catalog()?.discountPresets),
  );

  readonly showTicketDiscountInput = computed(
    () => this.ticketDiscountMode() !== 'none' && !this.ticketDiscountPresetId(),
  );

  readonly subtotal = computed(() =>
    this.lines().reduce((s, l) => s + l.unitPrice * l.qty, 0),
  );

  /** Ítems del carrito con sus extras colgados debajo. */
  readonly cartGroups = computed(() => {
    const lines = this.lines();
    const items = lines.filter((l) => l.kind !== 'EXTRA');
    const extras = lines.filter((l) => l.kind === 'EXTRA');
    const used = new Set<string>();
    const groups = items.map((item) => {
      const kids = extras.filter((ex) => {
        const parentId = String(ex.attachedToMenuItemId || ex.menuItemId || '');
        if (parentId !== String(item.menuItemId)) return false;
        used.add(ex.key);
        return true;
      });
      return { item, extras: kids };
    });
    for (const ex of extras) {
      if (used.has(ex.key)) continue;
      groups.push({ item: ex, extras: [] });
    }
    return groups;
  });

  ngOnInit(): void {
    document.addEventListener('visibilitychange', this.onVisibility);
    if (this.staffMode) {
      applyStatusBar('#eef1ee', 'light');
      this.enterAsStaff();
      return;
    }
    const slug = this.slug();
    this.pagePwa.prime('waiter', slug);
    if (!slug) {
      this.loading.set(false);
      this.error.set('Local no encontrado');
      return;
    }
    this.title.setTitle(`Mozo · ${slug}`);
    this.loadBootstrap(slug);

    const saved = localStorage.getItem(tokenKey(slug));
    if (saved) {
      this.token.set(saved);
      this.api.me(slug, saved).subscribe({
        next: (me) => {
          this.applyWaiterIdentity(me.waiter);
          this.shopName.set(me.shop.name);
          this.accent.set(this.resolveAccent(me.shop.accentColor));
          this.applyCapabilities((me as { capabilities?: WaiterCapProfile }).capabilities);
          this.title.setTitle(`Mozo · ${me.shop.name}`);
          this.view.set('tables');
          this.loadTables();
          this.startFloorLive();
        },
        error: () => {
          localStorage.removeItem(tokenKey(slug));
          this.token.set(null);
          this.loading.set(false);
          this.view.set('login');
        },
      });
      return;
    }
    this.loading.set(false);
  }

  private applyCapabilities(raw?: WaiterCapProfile | null): void {
    const fallback = this.staffMode ? DEFAULT_WAITER_CAP_STAFF : DEFAULT_WAITER_CAP_PUBLIC;
    this.capabilities.set(normalizeWaiterCapProfile(raw, fallback));
  }

  private resolveAccent(raw?: string | null): string {
    const fromShop = raw?.trim();
    if (fromShop) return fromShop;
    return this.shopContext.accentColor() || this.theme.accent() || '#2e7d32';
  }

  private enterAsStaff(): void {
    const shop = this.shopContext.selectedShop();
    const shopId = this.shopContext.selectedShopId();
    if (!shopId || !shop) {
      this.loading.set(false);
      this.error.set('Seleccioná un local');
      return;
    }
    this.title.setTitle(`Comanda · ${shop.name}`);
    this.shopName.set(shop.name);
    this.accent.set(this.resolveAccent(shop.accentColor));
    this.busy.set(true);
    this.error.set(null);
    this.api.staffEnter(shopId).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.slugSignal.set(res.shop.slug);
        localStorage.setItem(tokenKey(res.shop.slug), res.token);
        this.token.set(res.token);
        this.applyWaiterIdentity(res.waiter);
        this.shopName.set(res.shop.name);
        this.accent.set(this.resolveAccent(res.shop.accentColor));
        this.applyCapabilities(res.capabilities);
        this.title.setTitle(`Comanda · ${res.shop.name}`);
        this.view.set('tables');
        this.loadTables();
        this.loadStaffWaiters(shopId);
        this.loadPriceLedgerFallbacks(shopId);
        this.startFloorLive();
      },
      error: (err) => {
        this.busy.set(false);
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudo abrir la comanda'));
        this.view.set('login');
      },
    });
  }

  private loadPriceLedgerFallbacks(shopId: string): void {
    this.closingsApi.listClosingSources(shopId, true).subscribe({
      next: (sources) => {
        const map = new Map<string, string>();
        for (const s of sources ?? []) {
          const id = String(s.id ?? '').trim();
          const ledger = String(s.accountId ?? '').trim();
          if (id && ledger) map.set(id, ledger);
        }
        this.priceLedgerBySourceId.set(map);
      },
      error: () => this.priceLedgerBySourceId.set(new Map()),
    });
  }

  private loadStaffWaiters(shopId: string): void {
    this.api.staffWaiters(shopId).subscribe({
      next: (rows) => {
        this.staffWaiters.set(rows);
        const linked = rows.find((w) => w.fullName === this.waiterName())?.id;
        if (linked) this.coversWaiterId.set(linked);
        else if (rows.length === 1) this.coversWaiterId.set(rows[0].id);
      },
      error: () => this.staffWaiters.set([]),
    });
  }

  private loadBootstrap(slug: string): void {
    this.api.bootstrap(slug).subscribe({
      next: (res) => {
        this.shopName.set(res.shop.name);
        this.accent.set(this.resolveAccent(res.shop.accentColor));
        this.logoUrl.set(orderingLogoUrl(res.shop.logoUrl, res.shop.id));
        this.title.setTitle(`Mozo · ${res.shop.name}`);
        if (!this.staffMode && !this.pwaApplied) {
          this.pwaApplied = true;
          this.pagePwa.apply({
            kind: 'waiter',
            slug: res.shop.slug || slug,
            shopName: res.shop.name,
            accentColor: res.shop.accentColor,
            logoUrl: orderingLogoUrl(res.shop.logoUrl, res.shop.id),
          });
        }
      },
      error: (err) => {
        if (!this.token()) {
          this.error.set(apiErrorMessage(err, 'Local no encontrado o comanda desactivada'));
        }
      },
    });
  }

  onPadKey(key: string): void {
    if (this.busy()) return;
    this.error.set(null);
    if (key === '⌫') {
      this.pin.set(this.pin().slice(0, -1));
      return;
    }
    if (!/^\d$/.test(key) || this.pin().length >= 4) return;
    this.pin.set(this.pin() + key);
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.stopFloorLive();
    this.immersiveChrome.setBottomBlocked('comanda', false);
    if (this.staffMode) {
      resetStatusBar();
    } else {
      this.pagePwa.release('waiter', this.slug());
    }
  }

  /** SSE + respaldo por poll: mapa y mesa abierta se sincronizan entre mozos. */
  private startFloorLive(): void {
    this.stopFloorLive();
    const slug = this.slug();
    if (!slug || !this.token()) return;

    this.liveSub = this.live
      .connect(slug)
      .pipe(
        filter((t) => t.domain === 'customer-orders'),
        debounceTime(350),
      )
      .subscribe(() => this.onLiveFloorTick());

    this.pollSub = interval(45_000).subscribe(() => {
      if (this.token() && document.visibilityState === 'visible') {
        this.onLiveFloorTick();
      }
    });
  }

  private stopFloorLive(): void {
    this.liveSub?.unsubscribe();
    this.liveSub = null;
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }

  private onLiveFloorTick(): void {
    if (!this.token() || this.busy()) return;
    const v = this.view();
    if (v === 'tables') {
      this.refreshTablesQuiet();
      return;
    }
    if (v === 'session') {
      this.refreshSessionQuiet();
    }
  }

  /** Refresco del mapa sin spinner (para no parpadear con cada tick). */
  private refreshTablesQuiet(): void {
    const slug = this.slug();
    const token = this.token();
    if (!slug || !token) return;
    this.api.tables(slug, token).subscribe({
      next: (floor) => {
        const rows = floor?.tables ?? [];
        this.tables.set(rows);
        this.counterSessions.set(floor?.counterSessions ?? []);
        this.mapObjects.set(floor?.mapObjects ?? []);
        const tab = this.sectorTab();
        if (tab) {
          const names = new Set(
            rows.map(
              (t) =>
                (t.sectorName ?? '').trim() || (t.area === 'OUTSIDE' ? 'Afuera' : 'Adentro'),
            ),
          );
          if (!names.has(tab)) this.sectorTab.set(null);
        }
        this.loadTipsSummary();
      },
      error: (err) => {
        if (err?.status === 401) this.logout();
      },
    });
  }

  /** Refresco de la mesa abierta: envíos/cambios de otro mozo, o kick si la cerraron. */
  private refreshSessionQuiet(): void {
    const slug = this.slug();
    const token = this.token();
    const session = this.session();
    if (!slug || !token || !session) return;
    this.api.getSession(slug, token, session.id).subscribe({
      next: (updated) => {
        if (updated.status === 'CLOSED') {
          this.showToast(this.isCounterSession(updated) ? 'Pedido cerrado' : 'Mesa cerrada por otro');
          this.session.set(null);
          this.lines.set([]);
          this.orderStep.set('pick');
          this.closeSheet.set(false);
          this.ticketSheet.set(false);
          this.view.set('tables');
          this.refreshTablesQuiet();
          return;
        }
        this.session.set(updated);
      },
      error: (err) => {
        if (err?.status === 401) {
          this.logout();
          return;
        }
        if (err?.status === 404) {
          this.showToast('La mesa ya no está disponible');
          this.session.set(null);
          this.lines.set([]);
          this.view.set('tables');
          this.refreshTablesQuiet();
        }
      },
    });
  }

  bumpCovers(delta: number): void {
    this.coversDraft.set(Math.max(1, Math.min(30, this.coversDraft() + delta)));
  }

  money(n: number): string {
    return orderingMoney(n);
  }

  itemsPreview(items: Parameters<typeof formatOrderLinesInline>[0]): string {
    return formatOrderLinesInline(items);
  }

  orderGroups(items: Parameters<typeof groupOrderLines>[0]) {
    return groupOrderLines(items);
  }

  orderTime(iso: string | Date | null | undefined): string {
    if (!iso) return '';
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  lineAudits(): WaiterLineAudit[] {
    return this.session()?.lineAudits ?? [];
  }

  auditText(a: WaiterLineAudit): string {
    const name = a.itemName || 'Ítem';
    const extras = (a.relatedLines ?? [])
      .map((r) => r.name)
      .filter(Boolean)
      .join(', ');
    const extraBit = extras ? ` (+ ${extras})` : '';
    const reasonBit = (() => {
      const label = comandaReasonLabel(a.reason);
      if (!label) return '';
      const note = String(a.reasonNote ?? '').trim();
      return note ? ` · ${label}: ${note}` : ` · ${label}`;
    })();
    if (a.action === 'REMOVE') {
      const qty = a.qtyBefore ?? 1;
      let s = `Quitó ${qty}× ${name}${extraBit}${reasonBit}`;
      if (a.orderRemoved) s += ` · se borró el envío #${a.orderCode}`;
      return s;
    }
    if (a.action === 'PRICE') {
      return `Precio de ${name}: ${this.money(a.unitPriceBefore ?? 0)} → ${this.money(a.unitPriceAfter ?? 0)}`;
    }
    if (a.action === 'QTY') {
      return `Cantidad de ${name}: ${a.qtyBefore ?? '—'} → ${a.qtyAfter ?? '—'}${extraBit}${reasonBit}`;
    }
    return `${name}: ${a.qtyBefore ?? '—'}× ${this.money(a.unitPriceBefore ?? 0)} → ${a.qtyAfter ?? '—'}× ${this.money(a.unitPriceAfter ?? 0)}${reasonBit}`;
  }

  /** Ítems editables de toda la mesa (agrupados por ítem + precio). */
  ticketEditableRows(): Array<{
    key: string;
    name: string;
    qty: number;
    unitPrice: number;
    amount: number;
    extra: boolean;
    parts: Array<{ orderId: string; lineIndex: number; qty: number }>;
  }> {
    const orders = this.session()?.orders ?? [];
    type Acc = {
      key: string;
      name: string;
      qty: number;
      unitPrice: number;
      amount: number;
      extra: boolean;
      parts: Array<{ orderId: string; lineIndex: number; qty: number }>;
    };
    const map = new Map<string, Acc>();

    const push = (
      key: string,
      name: string,
      qty: number,
      unitPrice: number,
      extra: boolean,
      orderId: string,
      lineIndex: number,
    ) => {
      const q = Math.max(0, Number(qty) || 0);
      if (!q) return;
      const price = Number(unitPrice) || 0;
      const prev = map.get(key);
      if (prev) {
        prev.qty += q;
        prev.amount += price * q;
        prev.parts.push({ orderId, lineIndex, qty: q });
      } else {
        map.set(key, {
          key,
          name,
          qty: q,
          unitPrice: price,
          amount: price * q,
          extra,
          parts: [{ orderId, lineIndex, qty: q }],
        });
      }
    };

    for (const o of orders) {
      const items = o.items ?? [];
      const usedExtras = new Set<number>();
      const mains = items
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => {
          const kind = String(l.kind || 'ITEM').toUpperCase();
          return kind !== 'EXTRA' && kind !== 'PROMO';
        });
      const extras = items
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => String(l.kind || '').toUpperCase() === 'EXTRA');

      for (const { l: item, i: itemIdx } of mains) {
        const id = String(item.menuItemId || '').trim();
        const price = Number(item.unitPrice) || 0;
        const key = `i:${id || item.name}:${price}`;
        push(key, item.name, Number(item.qty) || 0, price, false, o.id, itemIdx);

        for (const { l: ex, i: exIdx } of extras) {
          if (usedExtras.has(exIdx)) continue;
          const parent = String(ex.attachedToMenuItemId || '').trim();
          if (!parent || !id || parent !== id) continue;
          usedExtras.add(exIdx);
          const exPrice = Number(ex.unitPrice) || 0;
          const exKey = `e:${parent}:${ex.name}:${exPrice}`;
          push(exKey, ex.name, Number(ex.qty) || 0, exPrice, true, o.id, exIdx);
        }
      }
      for (const { l: ex, i: exIdx } of extras) {
        if (usedExtras.has(exIdx)) continue;
        const exPrice = Number(ex.unitPrice) || 0;
        const parent = String(ex.attachedToMenuItemId || '').trim();
        const exKey = `e:${parent || '_'}:${ex.name}:${exPrice}`;
        push(exKey, ex.name, Number(ex.qty) || 0, exPrice, true, o.id, exIdx);
      }
    }
    return [...map.values()];
  }

  patchTicketLine(body: {
    orderId: string;
    lineIndex: number;
    qty?: number | null;
    unitPrice?: number | null;
    remove?: boolean;
    reason?: string | null;
    reasonNote?: string | null;
  }): void {
    const slug = this.slug();
    const token = this.token();
    const session = this.session();
    if (!slug || !token || !session || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.patchSessionLine(slug, token, session.id, body).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.session.set(updated);
        if (!(updated.orderCount ?? updated.orders?.length)) {
          this.ticketSheet.set(false);
          this.showToast('Sin ítems en la mesa');
        }
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudo actualizar el ítem'));
      },
    });
  }

  /** Aplica varios parches en serie (mismo precio / quitar grupo). */
  private patchTicketLineChain(
    ops: Array<{
      orderId: string;
      lineIndex: number;
      qty?: number | null;
      unitPrice?: number | null;
      remove?: boolean;
      reason?: string | null;
      reasonNote?: string | null;
    }>,
  ): void {
    if (!ops.length) return;
    const [head, ...rest] = ops;
    const slug = this.slug();
    const token = this.token();
    const session = this.session();
    if (!slug || !token || !session || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.patchSessionLine(slug, token, session.id, head).subscribe({
      next: (updated) => {
        this.session.set(updated);
        if (!(updated.orderCount ?? updated.orders?.length)) {
          this.busy.set(false);
          this.ticketSheet.set(false);
          this.showToast('Sin ítems en la mesa');
          return;
        }
        this.busy.set(false);
        if (rest.length) this.patchTicketLineChain(rest);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudo actualizar el ítem'));
      },
    });
  }

  private askLineReason(
    itemName: string,
    mode: 'remove' | 'qty_down',
    onOk: (reason: string, note: string) => void,
  ): void {
    this.dialog
      .open(ComandaLineReasonDialogComponent, {
        width: 'min(420px, 94vw)',
        data: { itemName, mode },
      })
      .afterClosed()
      .subscribe((res) => {
        if (!res?.reason) return;
        onOk(res.reason, res.note || '');
      });
  }

  bumpTicketItem(
    row: {
      name?: string;
      parts: Array<{ orderId: string; lineIndex: number; qty: number }>;
    },
    delta: number,
  ): void {
    if (!this.capabilities().allowEditTicket) return;
    if (!row.parts.length) return;
    const last = row.parts[row.parts.length - 1];
    const nextQty = Math.max(0, last.qty + delta);
    if (delta < 0) {
      this.askLineReason(row.name || 'Ítem', nextQty <= 0 ? 'remove' : 'qty_down', (reason, note) => {
        if (nextQty <= 0) {
          this.patchTicketLine({
            orderId: last.orderId,
            lineIndex: last.lineIndex,
            remove: true,
            reason,
            reasonNote: note || null,
          });
        } else {
          this.patchTicketLine({
            orderId: last.orderId,
            lineIndex: last.lineIndex,
            qty: nextQty,
            reason,
            reasonNote: note || null,
          });
        }
      });
      return;
    }
    this.patchTicketLine({
      orderId: last.orderId,
      lineIndex: last.lineIndex,
      qty: nextQty,
    });
  }

  setTicketLinePrice(
    row: {
      unitPrice: number;
      parts: Array<{ orderId: string; lineIndex: number; qty: number }>;
    },
    unitPrice: number,
  ): void {
    if (!this.capabilities().allowEditTicket) return;
    const next = Math.max(0, Math.round((Number(unitPrice) || 0) * 100) / 100);
    if (next === row.unitPrice) return;
    this.patchTicketLineChain(
      row.parts.map((p) => ({
        orderId: p.orderId,
        lineIndex: p.lineIndex,
        unitPrice: next,
      })),
    );
  }

  removeTicketLine(row: {
    name?: string;
    parts: Array<{ orderId: string; lineIndex: number; qty: number }>;
  }): void {
    if (!this.capabilities().allowRemoveTicketLines) return;
    this.askLineReason(row.name || 'Ítem', 'remove', (reason, note) => {
      const ops = [...row.parts]
        .sort((a, b) => {
          if (a.orderId !== b.orderId) return a.orderId < b.orderId ? -1 : 1;
          return b.lineIndex - a.lineIndex;
        })
        .map((p) => ({
          orderId: p.orderId,
          lineIndex: p.lineIndex,
          remove: true as const,
          reason,
          reasonNote: note || null,
        }));
      this.patchTicketLineChain(ops);
    });
  }

  showToast(msg: string): void {
    this.toast.set(msg);
    window.setTimeout(() => {
      if (this.toast() === msg) this.toast.set(null);
    }, 2200);
  }

  login(): void {
    const slug = this.slug();
    const pin = this.pin().trim();
    if (!slug || this.busy()) return;
    if (!/^\d{4}$/.test(pin)) {
      this.error.set('Ingresá un PIN de 4 dígitos');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.login(slug, pin).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.token.set(res.token);
        localStorage.setItem(tokenKey(slug), res.token);
        this.applyWaiterIdentity(res.waiter);
        this.shopName.set(res.shop.name);
        this.accent.set(this.resolveAccent(res.shop.accentColor));
        this.applyCapabilities(res.capabilities);
        this.title.setTitle(`Mozo · ${res.shop.name}`);
        this.pin.set('');
        this.view.set('tables');
        this.loadTables();
        this.startFloorLive();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'PIN incorrecto'));
      },
    });
  }

  private applyWaiterIdentity(waiter: { id?: string | null; fullName?: string | null }): void {
    this.waiterName.set(String(waiter.fullName ?? '').trim());
    const id = String(waiter.id ?? '').trim();
    this.waiterEmployeeId.set(id && id !== 'staff' ? id : null);
  }

  private defaultHistoryWaiterFilter(sum?: WaiterShiftTipsSummary | null): string {
    const self =
      String(sum?.selfWaiterEmployeeId ?? '').trim() ||
      this.waiterEmployeeId() ||
      '';
    return self || 'all';
  }

  logout(): void {
    this.stopFloorLive();
    const slug = this.slug();
    if (slug) localStorage.removeItem(tokenKey(slug));
    this.token.set(null);
    this.session.set(null);
    this.lines.set([]);
    if (this.staffMode) {
      void this.router.navigate(['/admin/inicio']);
      return;
    }
    this.view.set('login');
  }

  loadTables(): void {
    const slug = this.slug();
    const token = this.token();
    if (!slug || !token) return;
    this.loading.set(true);
    this.error.set(null);
    this.api.tables(slug, token).subscribe({
      next: (floor) => {
        const rows = floor?.tables ?? [];
        this.tables.set(rows);
        this.counterSessions.set(floor?.counterSessions ?? []);
        this.mapObjects.set(floor?.mapObjects ?? []);
        const tab = this.sectorTab();
        if (tab) {
          const names = new Set(
            rows.map(
              (t) =>
                (t.sectorName ?? '').trim() || (t.area === 'OUTSIDE' ? 'Afuera' : 'Adentro'),
            ),
          );
          if (!names.has(tab)) this.sectorTab.set(null);
        }
        this.loading.set(false);
        this.loadTipsSummary();
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudieron cargar las mesas'));
        if (err?.status === 401) this.logout();
      },
    });
  }

  loadTipsSummary(): void {
    if (!this.capabilities().allowHistory) {
      this.tipsSummary.set(null);
      return;
    }
    const slug = this.slug();
    const token = this.token();
    if (!slug || !token) return;
    this.api.shiftTipsSummary(slug, token).subscribe({
      next: (sum) => {
        this.tipsSummary.set(sum);
        const self = String(sum.selfWaiterEmployeeId ?? '').trim();
        if (self) this.waiterEmployeeId.set(self);
      },
      error: () => this.tipsSummary.set(null),
    });
  }

  historyWaiterOptions(): Array<{ id: string; fullName: string }> {
    const sum = this.tipsSummary();
    const byId = new Map<string, string>();
    for (const w of sum?.waiters ?? []) {
      const id = String(w.id ?? '').trim();
      if (id) byId.set(id, w.fullName?.trim() || '—');
    }
    for (const s of sum?.sessions ?? []) {
      const id = String(s.waiterEmployeeId ?? '').trim();
      if (id && !byId.has(id)) byId.set(id, s.waiterName?.trim() || '—');
    }
    // En Operación → Comanda: listá mozos del local aunque aún no hayan cerrado.
    if (this.staffMode) {
      for (const w of this.staffWaiters()) {
        const id = String(w.id ?? '').trim();
        if (id && !byId.has(id)) byId.set(id, w.fullName?.trim() || '—');
      }
    }
    const self = this.waiterEmployeeId();
    if (self && !byId.has(self)) {
      byId.set(self, this.waiterName() || 'Yo');
    }
    const selfId = self ?? '';
    return [...byId.entries()]
      .map(([id, fullName]) => ({ id, fullName }))
      .sort((a, b) => {
        if (a.id === selfId) return -1;
        if (b.id === selfId) return 1;
        return a.fullName.localeCompare(b.fullName, 'es');
      });
  }

  historyHasUnassigned(): boolean {
    return (this.tipsSummary()?.sessions ?? []).some(
      (s) => !String(s.waiterEmployeeId ?? '').trim(),
    );
  }

  historySessions(): NonNullable<WaiterShiftTipsSummary['sessions']> {
    const all = this.tipsSummary()?.sessions ?? [];
    const filter = this.historyWaiterFilter();
    if (filter === 'all') return all;
    if (filter === 'none') {
      return all.filter((s) => !String(s.waiterEmployeeId ?? '').trim());
    }
    return all.filter((s) => String(s.waiterEmployeeId ?? '') === filter);
  }

  historyFilteredStats(): { closedTables: number; ticketTotal: number } {
    const sessions = this.historySessions();
    return {
      closedTables: sessions.length,
      ticketTotal:
        Math.round(sessions.reduce((n, s) => n + (Number(s.ticketTotal) || 0), 0) * 100) / 100,
    };
  }

  historyDetail(): NonNullable<WaiterShiftTipsSummary['sessions']>[number] | null {
    const id = this.historyDetailId();
    if (!id) return null;
    const all = this.tipsSummary()?.sessions ?? [];
    return all.find((s) => s.sessionId === id) ?? null;
  }

  readonly historyOrderItems = signal<
    Array<{ name: string; qty: number; unitPrice: number; extra?: boolean }>
  >([]);
  readonly historyLineAudits = signal<WaiterLineAudit[]>([]);
  readonly historyOrderLoading = signal(false);

  openHistory(): void {
    if (!this.capabilities().allowHistory) return;
    this.historyDetailId.set(null);
    this.historyOrderItems.set([]);
    this.historyLineAudits.set([]);
    this.historyWaiterFilter.set(this.defaultHistoryWaiterFilter(this.tipsSummary()));
    this.historyOpen.set(true);
    this.loadTipsSummary();
  }

  closeHistory(): void {
    this.historyOpen.set(false);
    this.historyDetailId.set(null);
    this.historyOrderItems.set([]);
    this.historyLineAudits.set([]);
  }

  openHistoryDetail(sessionId: string): void {
    this.historyDetailId.set(sessionId);
    this.historyOpen.set(true);
    this.loadHistoryOrder(sessionId);
  }

  private loadHistoryOrder(sessionId: string): void {
    const slug = this.slug();
    const token = this.token();
    if (!slug || !token) return;
    this.historyOrderLoading.set(true);
    this.historyOrderItems.set([]);
    this.historyLineAudits.set([]);
    this.api.getSession(slug, token, sessionId).subscribe({
      next: (session) => {
        const rows: Array<{ name: string; qty: number; unitPrice: number; extra?: boolean }> =
          [];
        for (const o of session.orders ?? []) {
          for (const g of groupOrderLines(o.items ?? [])) {
            if (g.item) {
              rows.push({
                name: g.item.name,
                qty: g.item.qty,
                unitPrice: g.item.unitPrice,
              });
            }
            for (const ex of g.extras) {
              rows.push({
                name: ex.name,
                qty: ex.qty,
                unitPrice: ex.unitPrice,
                extra: true,
              });
            }
          }
        }
        this.historyOrderItems.set(rows);
        this.historyLineAudits.set(session.lineAudits ?? []);
        this.historyOrderLoading.set(false);
      },
      error: () => {
        this.historyOrderItems.set([]);
        this.historyLineAudits.set([]);
        this.historyOrderLoading.set(false);
      },
    });
  }

  tapTable(table: WaiterTable): void {
    if (this.busy()) return;
    if (table.openSession) {
      this.resumeSession(table.openSession.id);
      return;
    }
    this.coversDraft.set(Math.max(1, Math.min(30, table.seats || 2)));
    if (this.staffMode) {
      const waiters = this.coversWaiterChoices();
      const current = this.coversWaiterId();
      if (!current || !waiters.some((w) => w.id === current)) {
        this.coversWaiterId.set(waiters.length === 1 ? waiters[0].id : null);
      }
    }
    this.coversSheet.set(table);
  }

  /**
   * Pedido de mostrador: va directo a la carta (sin mozo ni comensales).
   * Si ya hay uno abierto, lo retoma (sin listarlo en el mapa).
   */
  startCounterOrder(): void {
    if (this.busy()) return;
    const open = this.counterSessions();
    if (open.length) {
      this.resumeSession(open[open.length - 1].id);
      return;
    }
    this.openFresh(null, 1, null);
  }

  cancelCovers(): void {
    this.coversSheet.set(null);
  }

  confirmCovers(): void {
    const table = this.coversSheet();
    const covers = Math.round(Number(this.coversDraft()));
    if (!table) return;
    if (!Number.isFinite(covers) || covers < 1 || covers > 30) {
      this.error.set('Indicá entre 1 y 30 comensales');
      return;
    }
    const waiterEmployeeId = this.staffMode ? this.coversWaiterId() : null;
    if (
      this.staffMode &&
      this.capabilities().requireWaiterOnOpen &&
      !waiterEmployeeId
    ) {
      this.error.set('Elegí el mozo a cargo');
      return;
    }
    this.coversSheet.set(null);
    this.openFresh(table, covers, waiterEmployeeId);
  }

  private resumeSession(sessionId: string): void {
    const slug = this.slug();
    const token = this.token();
    if (!slug || !token || !sessionId) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.getSession(slug, token, sessionId).subscribe({
      next: (session) => this.enterSession(session),
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudo abrir el pedido'));
      },
    });
  }

  private openFresh(
    table: WaiterTable | null,
    covers: number,
    waiterEmployeeId?: string | null,
  ): void {
    const slug = this.slug();
    const token = this.token();
    if (!slug || !token) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.openSession(slug, token, table?.id ?? null, covers, waiterEmployeeId).subscribe({
      next: (session) => this.enterSession(session),
      error: (err) => {
        this.busy.set(false);
        this.error.set(
          apiErrorMessage(err, table ? 'No se pudo abrir la mesa' : 'No se pudo abrir el mostrador'),
        );
      },
    });
  }

  /** Título de lugar: mesa o Mostrador. */
  placeHeading(label: string | null | undefined): string {
    const t = String(label ?? '').trim();
    if (!t || t.toLowerCase() === 'mostrador') return 'Mostrador';
    return `Mesa ${t}`;
  }

  sessionPlaceLabel(session: WaiterSession | null | undefined = this.session()): string {
    return this.placeHeading(session?.table?.label);
  }

  isCounterSession(session: WaiterSession | null | undefined = this.session()): boolean {
    return !session?.table?.id;
  }

  private enterSession(session: WaiterSession): void {
    this.busy.set(false);
    this.session.set(session);
    this.lines.set([]);
    this.notes.set('');
    this.noteOpenKey.set(null);
    this.orderNoteOpen.set(false);
    this.orderStep.set('pick');
    this.sessionPane.set('order');
    this.sessionEnviosOpen.set(false);
    this.cartDetail.set(true);
    const caps = this.capabilities();
    this.printKitchen.set(caps.allowPrintKitchen && caps.defaultPrintKitchen);
    // Ticket cliente y pago van al cerrar / ticket, no al enviar comanda.
    this.printCustomerTicket.set(false);
    this.syncPromoCupoDraft(session);
    this.view.set('session');
    this.ensureCatalog();
  }

  private syncPromoCupoDraft(session: WaiterSession | null = this.session()): void {
    const drafts: Record<string, string> = {};
    for (const p of session?.sessionPromos ?? []) {
      drafts[p.promoId] = p.maxCount == null ? '' : String(p.maxCount);
    }
    // Compat legacy single
    if (!Object.keys(drafts).length && session?.promoId) {
      drafts[session.promoId] =
        session.promoMaxCount == null ? '' : String(session.promoMaxCount);
    }
    this.promoCupoDrafts.set(drafts);
  }

  sessionPromoIds(): string[] {
    const s = this.session();
    if (s?.sessionPromos?.length) return s.sessionPromos.map((p) => p.promoId);
    return s?.promoId ? [s.promoId] : [];
  }

  isSessionPromoOn(promoId: string): boolean {
    return this.sessionPromoIds().includes(promoId);
  }

  promoCupoDraft(promoId: string): string {
    return this.promoCupoDrafts()[promoId] ?? '';
  }

  onPromoCupoDraft(promoId: string, value: string | number | null): void {
    const next =
      value == null || value === '' ? '' : String(value);
    this.promoCupoDrafts.update((cur) => ({ ...cur, [promoId]: next }));
  }

  commitPromoCupo(promoId: string): void {
    const session = this.session();
    if (!session || this.busy() || !this.isSessionPromoOn(promoId)) return;
    const raw = (this.promoCupoDrafts()[promoId] ?? '').trim();
    let next: number | null = null;
    if (raw !== '') {
      const n = Math.round(Number(raw));
      next = Number.isFinite(n) && n >= 1 ? n : null;
    }
    this.promoCupoDrafts.update((cur) => ({
      ...cur,
      [promoId]: next == null ? '' : String(next),
    }));
    const cur =
      session.sessionPromos?.find((p) => p.promoId === promoId)?.maxCount ??
      (session.promoId === promoId ? session.promoMaxCount ?? null : null);
    if (cur === next) return;
    this.saveSessionPromos(
      this.sessionPromoIds().map((id) => ({
        promoId: id,
        maxCount: id === promoId ? next : this.cupoForPromo(id),
      })),
    );
  }

  private cupoForPromo(promoId: string): number | null {
    const raw = (this.promoCupoDrafts()[promoId] ?? '').trim();
    if (!raw) return null;
    const n = Math.round(Number(raw));
    return Number.isFinite(n) && n >= 0 ? Math.min(999, n) : null;
  }

  toggleSessionPromo(promoId: string): void {
    const on = this.isSessionPromoOn(promoId);
    if (on) {
      const next = this.sessionPromoIds()
        .filter((id) => id !== promoId)
        .map((id) => ({ promoId: id, maxCount: this.cupoForPromo(id) }));
      this.saveSessionPromos(next);
      return;
    }
    this.saveSessionPromos([
      ...this.sessionPromoIds().map((id) => ({
        promoId: id,
        maxCount: this.cupoForPromo(id),
      })),
      { promoId, maxCount: null },
    ]);
  }

  clearSessionPromos(): void {
    this.saveSessionPromos([]);
  }

  saveSessionPromos(
    promos: Array<{ promoId: string; maxCount: number | null }>,
  ): void {
    const slug = this.slug();
    const token = this.token();
    const session = this.session();
    if (!slug || !token || !session || this.busy()) return;
    this.busy.set(true);
    this.api
      .patchSessionPromo(slug, token, session.id, { promos })
      .subscribe({
        next: (s) => {
          this.busy.set(false);
          this.session.set(s);
          this.syncPromoCupoDraft(s);
          this.showToast(
            promos.length ? 'Promos de mesa actualizadas' : 'Promos de mesa quitadas',
          );
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(apiErrorMessage(err, 'No se pudo guardar la promo'));
        },
      });
  }

  addPromo(promo: {
    id: string;
    name: string;
    fixedPrice: number;
    packQty?: number;
    poolItemIds?: string[];
    items?: Array<{ menuItemId: string; qty: number }>;
    tableMatchable?: boolean;
    inSchedule?: boolean;
  }): void {
    if (promo.inSchedule === false) return;
    let poolItemIds = (promo.poolItemIds ?? []).filter(Boolean);
    let packQty = Math.max(1, Math.round(Number(promo.packQty) || 0));
    if (!poolItemIds.length && promo.items?.length) {
      poolItemIds = [...new Set(promo.items.map((i) => i.menuItemId).filter(Boolean))];
      packQty = promo.items.reduce((s, i) => s + Math.max(1, Number(i.qty) || 1), 0);
    }
    if (!poolItemIds.length) return;
    if (!packQty) packQty = 1;
    // Un solo ítem en el pool y packQty 1 → agregar directo.
    if (poolItemIds.length === 1 && packQty === 1) {
      this.applyPromoSelections(promo.id, promo.name, promo.fixedPrice, promo.tableMatchable, [
        { menuItemId: poolItemIds[0], qty: 1 },
      ]);
      return;
    }
    this.promoPick.set({
      id: promo.id,
      name: promo.name,
      fixedPrice: promo.fixedPrice,
      packQty,
      poolItemIds,
      tableMatchable: promo.tableMatchable,
    });
    this.promoPickCounts.set({});
  }

  cancelPromoPick(): void {
    this.promoPick.set(null);
    this.promoPickCounts.set({});
  }

  promoPickCount(menuItemId: string): number {
    return Number(this.promoPickCounts()[menuItemId]) || 0;
  }

  bumpPromoPick(menuItemId: string, delta: number): void {
    const pick = this.promoPick();
    if (!pick || !delta) return;
    const need = pick.packQty;
    const cur = this.promoPickCounts();
    const have = Object.values(cur).reduce((s, n) => s + (Number(n) || 0), 0);
    const prev = Number(cur[menuItemId]) || 0;
    let next = prev + delta;
    if (next < 0) next = 0;
    if (delta > 0 && have >= need) return;
    if (delta > 0 && have + delta > need) next = prev + (need - have);
    const counts = { ...cur };
    if (next <= 0) delete counts[menuItemId];
    else counts[menuItemId] = next;
    this.promoPickCounts.set(counts);
  }

  confirmPromoPick(): void {
    const pick = this.promoPick();
    if (!pick) return;
    const selections = Object.entries(this.promoPickCounts())
      .map(([menuItemId, qty]) => ({ menuItemId, qty: Math.round(Number(qty) || 0) }))
      .filter((s) => s.qty > 0);
    const sum = selections.reduce((s, x) => s + x.qty, 0);
    if (sum !== pick.packQty) {
      this.error.set(`Elegí ${pick.packQty} ítem(s) para la promo`);
      return;
    }
    this.applyPromoSelections(
      pick.id,
      pick.name,
      pick.fixedPrice,
      pick.tableMatchable,
      selections,
    );
    this.cancelPromoPick();
  }

  private applyPromoSelections(
    promoId: string,
    _promoName: string,
    _fixedPrice: number,
    tableMatchable: boolean | undefined,
    selections: Array<{ menuItemId: string; qty: number }>,
  ): void {
    const catalog = this.catalogItems();
    this.lines.update((list) => {
      let next = [...list];
      for (const it of selections) {
        const found = catalog.find((c) => c.id === it.menuItemId);
        if (!found) continue;
        const key = `i:${found.id}`;
        const qtyAdd = Math.max(1, Number(it.qty) || 1);
        const idx = next.findIndex((l) => l.key === key);
        if (idx >= 0) {
          next = next.map((l, i) =>
            i === idx ? { ...l, qty: Math.min(99, l.qty + qtyAdd) } : l,
          );
        } else {
          const kitchenSectorIds = this.sectorIdsForCatalogItem(found);
          next.push({
            key,
            kind: 'ITEM',
            menuItemId: found.id,
            name: found.name,
            unitPrice: Number(found.price) || 0,
            qty: qtyAdd,
            kitchenSectorIds,
            combinesWithKeys: [],
            notes: '',
          });
          next = this.withAutoCombines(next, key);
        }
      }
      return next;
    });
    if (tableMatchable !== false && !this.isSessionPromoOn(promoId)) {
      this.toggleSessionPromo(promoId);
    }
  }

  backToTables(): void {
    const slug = this.slug();
    const token = this.token();
    const session = this.session();
    const hadOrders = (session?.orderCount ?? session?.orders?.length ?? 0) > 0;

    const go = () => {
      this.session.set(null);
      this.lines.set([]);
      this.orderStep.set('pick');
      this.sessionPane.set('order');
      this.closeSheet.set(false);
      this.view.set('tables');
      this.loadTables();
    };

    if (session && !hadOrders && slug && token) {
      // Siempre cerrar sesión vacía al volver al mapa (evita “mesas abiertas” fantasmas).
      this.api.discardSession(slug, token, session.id).subscribe({
        next: () => go(),
        error: () => go(),
      });
      return;
    }
    go();
  }

  ensureCatalog(): void {
    if (this.catalog()) return;
    const slug = this.slug();
    const token = this.token();
    if (!slug || !token) return;
    this.api.catalog(slug, token).subscribe({
      next: (cfg) => {
        this.catalog.set(cfg);
        if (cfg.capabilities) this.applyCapabilities(cfg.capabilities);
        this.ensurePricingPaymentDefault(cfg.tablePaymentMethods);
      },
      error: (err) =>
        this.error.set(apiErrorMessage(err, 'No se pudo cargar la carta')),
    });
  }

  /** Medios activos para fijar precio al agregar (staff). */
  pricingPaymentMethods(): TablePaymentMethod[] {
    return (this.catalog()?.tablePaymentMethods ?? []).filter((m) => m.active !== false);
  }

  private ensurePricingPaymentDefault(
    methods?: TablePaymentMethod[] | null,
  ): void {
    if (!this.staffMode) return;
    if (this.pricingPaymentMethodId()) return;
    const list = (methods ?? []).filter((m) => m.active !== false);
    if (!list.length) return;
    const cashLike =
      list.find((m) => /efectivo|cash|contado|tp_cash/i.test(`${m.id} ${m.name}`)) ??
      list.find((m) => !m.accountId) ??
      list[0];
    this.pricingPaymentMethodId.set(cashLike.id);
  }

  setPricingPayment(methodId: string): void {
    this.pricingPaymentMethodId.set(methodId);
    this.repriceCartForPricingPayment();
  }

  private repriceCartForPricingPayment(): void {
    const accountId = this.pricingAccountId();
    const byId = new Map(this.catalogItems().map((it) => [String(it.id), it]));
    this.lines.update((list) => {
      const next = list.map((l) => {
        if (l.kind !== 'ITEM') {
          if (l.kind === 'EXTRA' && l.extraId) {
            return { ...l, key: `e:${l.extraId}:${l.menuItemId}` };
          }
          return l;
        }
        const cat = byId.get(String(l.menuItemId));
        const unitPrice = cat ? this.catalogUnitPrice(cat, accountId) : l.unitPrice;
        const baseKey = `i:${l.menuItemId}`;
        return {
          ...l,
          unitPrice,
          key: l.isEntrada ? `${baseKey}:entrada` : baseKey,
        };
      });
      const merged: PosLine[] = [];
      for (const l of next) {
        if (l.kind !== 'ITEM') {
          merged.push(l);
          continue;
        }
        const idx = merged.findIndex(
          (m) => m.kind === 'ITEM' && m.menuItemId === l.menuItemId && !!m.isEntrada === !!l.isEntrada,
        );
        if (idx >= 0) {
          const prevKeys = new Set([merged[idx].key, l.key]);
          merged[idx] = {
            ...merged[idx],
            qty: Math.min(99, merged[idx].qty + l.qty),
            unitPrice: l.unitPrice,
            key: l.key,
          };
          // Remap combines that pointed to old keys of this item
          for (let i = 0; i < merged.length; i++) {
            const cw = merged[i].combinesWithKeys;
            if (!cw?.length) continue;
            merged[i] = {
              ...merged[i],
              combinesWithKeys: cw.map((k) => (prevKeys.has(k) ? l.key : k)),
            };
          }
        } else {
          merged.push(l);
        }
      }
      return merged;
    });
  }

  private pricingAccountId(): string | null {
    if (!this.staffMode) return null;
    const id = this.pricingPaymentMethodId();
    const m = this.pricingPaymentMethods().find((x) => x.id === id);
    return String(m?.accountId ?? '').trim() || null;
  }

  private catalogUnitPrice(
    it: {
      price?: number | null;
      accountPrices?: Array<{ accountId: string; price: number }> | null;
    },
    accountId?: string | null,
  ): number {
    const id = String(accountId ?? '').trim() || null;
    const fallback = id ? this.priceLedgerBySourceId().get(id) ?? null : null;
    return resolveItemUnitPrice(it, id, fallback);
  }

  priceForCatalogItem(it: {
    price?: number | null;
    accountPrices?: Array<{ accountId: string; price: number }> | null;
  }): number {
    return this.catalogUnitPrice(it, this.pricingAccountId());
  }

  baseUnitPrice(line: PosLine): number | null {
    if (line.kind !== 'ITEM') return null;
    const cat = this.catalogItems().find((it) => it.id === line.menuItemId);
    if (!cat || cat.price == null || !Number.isFinite(Number(cat.price))) return null;
    return Math.round(Number(cat.price));
  }

  linePriceChanged(line: PosLine): { base: number; charged: number } | null {
    const base = this.baseUnitPrice(line);
    if (base == null) return null;
    const charged = Math.round(Number(line.unitPrice) || 0);
    if (base === charged) return null;
    return { base, charged };
  }

  setSection(sec: string | null): void {
    this.sectionFilter.set(sec);
  }

  goToReview(): void {
    if (!this.lineCount()) return;
    this.cartDetail.set(true);
    this.combineOpenKey.set(null);
    this.noteOpenKey.set(null);
    this.orderNoteOpen.set(!!this.notes().trim());
    this.sessionPane.set('order');
    this.orderStep.set('review');
  }

  goToPick(): void {
    this.orderStep.set('pick');
    this.combineOpenKey.set(null);
    this.noteOpenKey.set(null);
    this.orderNoteOpen.set(false);
  }

  openSessionInfo(): void {
    if (this.isCounterSession()) return;
    this.sessionPane.set('info');
    this.sessionEnviosOpen.set(false);
    this.combineOpenKey.set(null);
    this.noteOpenKey.set(null);
    this.orderNoteOpen.set(false);
  }

  goToOrderPane(): void {
    this.sessionPane.set('order');
  }

  bumpSessionCovers(delta: number): void {
    const s = this.session();
    if (!s || this.isCounterSession(s) || this.busy() || !delta) return;
    const cur = Math.max(1, Number(s.covers) || 2);
    const next = Math.max(1, Math.min(30, cur + delta));
    if (next === cur) return;
    this.saveSessionCovers(next);
  }

  onSessionCoversInput(raw: string | number): void {
    const s = this.session();
    if (!s || this.isCounterSession(s) || this.busy()) return;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return;
    const next = Math.max(1, Math.min(30, n));
    if (next === (Number(s.covers) || 2)) return;
    this.saveSessionCovers(next);
  }

  private saveSessionCovers(covers: number): void {
    const slug = this.slug();
    const token = this.token();
    const session = this.session();
    if (!slug || !token || !session) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.patchSessionCovers(slug, token, session.id, covers).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.session.set(updated);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudieron actualizar los comensales'));
      },
    });
  }

  /** Cantidad en carrito del plato (línea no-entrada). */
  catalogQty(it: { id: string }): number {
    const key = `i:${it.id}`;
    const line = this.lines().find((l) => l.key === key && l.kind === 'ITEM' && !l.isEntrada);
    return line?.qty ?? 0;
  }

  catalogLine(it: { id: string }): PosLine | null {
    const key = `i:${it.id}`;
    return this.lines().find((l) => l.key === key && l.kind === 'ITEM' && !l.isEntrada) ?? null;
  }

  bumpCatalogItem(it: CatalogItem, delta: number, ev?: Event): void {
    ev?.stopPropagation();
    ev?.preventDefault();
    if (!delta) return;
    const line = this.catalogLine(it);
    if (!line) {
      if (delta > 0) this.addItem(it);
      return;
    }
    this.bump(line, delta);
  }

  bumpPromo(
    promo: {
      id: string;
      name: string;
      fixedPrice: number;
      packQty?: number;
      poolItemIds?: string[];
      items?: Array<{ menuItemId: string; qty: number }>;
      tableMatchable?: boolean;
      inSchedule?: boolean;
    },
    delta: number,
    ev?: Event,
  ): void {
    ev?.stopPropagation();
    ev?.preventDefault();
    if (promo.inSchedule === false) return;
    if (delta > 0) this.addPromo(promo);
  }

  addItem(it: CatalogItem): void {
    const unitPrice = this.priceForCatalogItem(it);
    const key = `i:${it.id}`;
    const kitchenSectorIds = this.sectorIdsForCatalogItem(it);
    this.lines.update((list) => {
      const idx = list.findIndex((l) => l.key === key && !l.isEntrada);
      if (idx >= 0) {
        return list.map((l, i) =>
          i === idx ? { ...l, qty: Math.min(99, l.qty + 1) } : l,
        );
      }
      const newLine: PosLine = {
        key,
        kind: 'ITEM',
        menuItemId: it.id,
        name: it.name,
        unitPrice,
        qty: 1,
        kitchenSectorIds,
        isEntrada: false,
        combinesWithKeys: [],
        notes: '',
      };
      return this.withAutoCombines([...list, newLine], newLine.key);
    });
  }

  toggleEntrada(line: PosLine, ev?: Event): void {
    ev?.stopPropagation();
    if (line.kind !== 'ITEM') return;
    const oldKey = line.key;
    const baseKey = `i:${line.menuItemId}`;
    this.lines.update((list) => {
      const nextKey = !line.isEntrada ? `${baseKey}:entrada` : baseKey;
      return list.map((l) => {
        if (l.key === oldKey) {
          return {
            ...l,
            isEntrada: !l.isEntrada,
            key: nextKey,
          };
        }
        if (!(l.combinesWithKeys ?? []).includes(oldKey)) return l;
        return {
          ...l,
          combinesWithKeys: (l.combinesWithKeys ?? []).map((k) =>
            k === oldKey ? nextKey : k,
          ),
        };
      });
    });
    const nextKey = !line.isEntrada ? `${baseKey}:entrada` : baseKey;
    if (this.combineOpenKey() === oldKey) {
      this.combineOpenKey.set(nextKey);
    }
    if (this.noteOpenKey() === oldKey) {
      this.noteOpenKey.set(nextKey);
    }
  }

  /** Otros platos del carrito para Combina (excluye mismo sector de cocina). */
  otherCartItems(line: PosLine): PosLine[] {
    return this.lines().filter(
      (l) =>
        l.kind === 'ITEM' &&
        l.key !== line.key &&
        !this.sharesKitchenSector(line, l),
    );
  }

  private sharesKitchenSector(a: PosLine, b: PosLine): boolean {
    const aIds = (a.kitchenSectorIds ?? []).map((id) => String(id).trim()).filter(Boolean);
    const bIds = (b.kitchenSectorIds ?? []).map((id) => String(id).trim()).filter(Boolean);
    if (!aIds.length || !bIds.length) return false;
    const bSet = new Set(bIds);
    return aIds.some((id) => bSet.has(id));
  }

  hasCombines(line: PosLine): boolean {
    return (line.combinesWithKeys ?? []).length > 0;
  }

  isCombinedWith(line: PosLine, other: PosLine): boolean {
    return (line.combinesWithKeys ?? []).includes(other.key);
  }

  toggleCombinePanel(line: PosLine, ev?: Event): void {
    ev?.stopPropagation();
    if (line.kind !== 'ITEM') return;
    this.combineOpenKey.update((cur) => (cur === line.key ? null : line.key));
  }

  toggleCombine(line: PosLine, other: PosLine, ev?: Event): void {
    ev?.stopPropagation();
    if (line.kind !== 'ITEM' || other.kind !== 'ITEM') return;
    this.lines.update((list) => this.linkCombinePair(list, line.key, other.key, 'toggle'));
  }

  hasLineNotes(line: PosLine): boolean {
    return !!String(line.notes ?? '').trim();
  }

  toggleNotePanel(line: PosLine, ev?: Event): void {
    ev?.stopPropagation();
    if (line.kind !== 'ITEM') return;
    this.noteOpenKey.update((cur) => (cur === line.key ? null : line.key));
  }

  setLineNotes(line: PosLine, value: string): void {
    if (line.kind !== 'ITEM') return;
    const notes = String(value ?? '').slice(0, 300);
    this.lines.update((list) =>
      list.map((l) => (l.key === line.key ? { ...l, notes } : l)),
    );
  }

  private sectorIdsForCatalogItem(it: {
    id?: string;
    kitchenSectorIds?: string[];
  }): string[] {
    if (Array.isArray(it.kitchenSectorIds) && it.kitchenSectorIds.length) {
      return it.kitchenSectorIds.map((id) => String(id ?? '').trim()).filter(Boolean);
    }
    const fromCatalog = this.catalogItems().find((c) => c.id === it.id);
    return (fromCatalog?.kitchenSectorIds ?? [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean);
  }

  /** Vínculo configurado entre sectores (A→B o B→A). */
  private sectorsLinked(aIds: string[] | undefined, bIds: string[] | undefined): boolean {
    const a = (aIds ?? []).map((id) => String(id).trim()).filter(Boolean);
    const b = (bIds ?? []).map((id) => String(id).trim()).filter(Boolean);
    if (!a.length || !b.length) return false;
    const sectors = this.catalog()?.kitchenSectors ?? [];
    const links = new Map<string, Set<string>>();
    for (const s of sectors) {
      const id = String(s.id ?? '').trim();
      if (!id) continue;
      const set = links.get(id) ?? new Set<string>();
      for (const other of s.combinesWithSectorIds ?? []) {
        const oid = String(other ?? '').trim();
        if (!oid || oid === id) continue;
        set.add(oid);
      }
      links.set(id, set);
    }
    for (const aid of a) {
      for (const bid of b) {
        if (links.get(aid)?.has(bid) || links.get(bid)?.has(aid)) return true;
      }
    }
    return false;
  }

  private linkCombinePair(
    list: PosLine[],
    keyA: string,
    keyB: string,
    mode: 'toggle' | 'add' = 'add',
  ): PosLine[] {
    if (!keyA || !keyB || keyA === keyB) return list;
    return list.map((l) => {
      if (l.key === keyA) {
        const set = new Set(l.combinesWithKeys ?? []);
        if (mode === 'toggle' && set.has(keyB)) set.delete(keyB);
        else set.add(keyB);
        return { ...l, combinesWithKeys: [...set] };
      }
      if (l.key === keyB) {
        const set = new Set(l.combinesWithKeys ?? []);
        if (mode === 'toggle' && set.has(keyA)) set.delete(keyA);
        else set.add(keyA);
        return { ...l, combinesWithKeys: [...set] };
      }
      return l;
    });
  }

  /** Tras agregar una línea nueva, enlaza Combina con ítems de sectores vinculados. */
  private withAutoCombines(list: PosLine[], newKey: string): PosLine[] {
    const neu = list.find((l) => l.key === newKey && l.kind === 'ITEM');
    if (!neu) return list;
    let next = list;
    for (const other of list) {
      if (other.key === newKey || other.kind !== 'ITEM') continue;
      if (!this.sectorsLinked(neu.kitchenSectorIds, other.kitchenSectorIds)) continue;
      next = this.linkCombinePair(next, newKey, other.key, 'add');
    }
    return next;
  }

  private combinesWithNamesFor(line: PosLine, all: PosLine[]): string[] {
    const keys = new Set(line.combinesWithKeys ?? []);
    if (!keys.size) return [];
    const names: string[] = [];
    const seen = new Set<string>();
    for (const l of all) {
      if (!keys.has(l.key)) continue;
      const name = String(l.name || '').trim();
      if (!name) continue;
      const k = name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      names.push(name);
    }
    return names;
  }

  itemExtras(itemId: string) {
    const id = String(itemId);
    return this.extras().filter((e) => {
      const ids = (e.menuItemIds ?? []).map(String);
      return !ids.length || ids.includes(id);
    });
  }

  toggleItemExtras(itemId: string, ev?: Event): void {
    ev?.stopPropagation();
    ev?.preventDefault();
    const id = String(itemId);
    this.extrasOpenFor.update((cur) => (cur === id ? null : id));
  }

  addExtra(
    extra: { id: string; name: string; price: number },
    parent: CatalogItem,
    ev?: Event,
  ): void {
    ev?.stopPropagation();
    ev?.preventDefault();
    if (!parent?.id) return;
    const itemId = String(parent.id);
    const unitPrice = this.priceForCatalogItem(parent);
    const itemKey = `i:${itemId}`;
    const itemKeyEntrada = `${itemKey}:entrada`;
    const extraKey = `e:${String(extra.id)}:${itemId}`;
    this.lines.update((list) => {
      let next = [...list];
      const itemIdx = next.findIndex(
        (l) =>
          (l.key === itemKey || l.key === itemKeyEntrada) ||
          (l.menuItemId === itemId && l.kind === 'ITEM'),
      );
      const exIdx = next.findIndex((l) => l.key === extraKey);

      if (itemIdx < 0) {
        // Tocó el extra directo: suma plato + extra juntos.
        next.push(
          {
            key: itemKey,
            kind: 'ITEM',
            menuItemId: itemId,
            name: parent.name,
            unitPrice,
            qty: 1,
            kitchenSectorIds: this.sectorIdsForCatalogItem(parent),
            isEntrada: false,
            combinesWithKeys: [],
            notes: '',
          },
          {
            key: extraKey,
            kind: 'EXTRA',
            menuItemId: itemId,
            name: extra.name,
            unitPrice: Number(extra.price) || 0,
            qty: 1,
            extraId: String(extra.id),
            attachedToMenuItemId: itemId,
          },
        );
        return this.withAutoCombines(next, itemKey);
      }

      if (exIdx < 0) {
        const itemQty = next[itemIdx].qty;
        next.push({
          key: extraKey,
          kind: 'EXTRA',
          menuItemId: itemId,
          name: extra.name,
          unitPrice: Number(extra.price) || 0,
          qty: itemQty,
          extraId: String(extra.id),
          attachedToMenuItemId: itemId,
        });
        return next;
      }

      // Ya había el combo: otra unidad de plato + extra.
      return next.map((l, i) => {
        if (i === itemIdx || i === exIdx) {
          return { ...l, qty: Math.min(99, l.qty + 1) };
        }
        return l;
      });
    });
  }

  bump(line: PosLine, delta: number): void {
    this.lines.update((list) => {
      const next = list.map((l) => {
        if (l.key !== line.key) return l;
        return { ...l, qty: Math.max(0, Math.min(99, l.qty + delta)) };
      });
      const updated = next.find((l) => l.key === line.key);
      if (!updated) return list;
      // Si baja/sube el plato, alineá extras colgados; si lo saca, sacá los extras.
      if (line.kind === 'ITEM') {
        const parentId = String(line.menuItemId);
        const pruned = next
          .map((l) => {
            if (l.kind !== 'EXTRA') return l;
            const attach = String(l.attachedToMenuItemId || l.menuItemId || '');
            if (attach !== parentId) return l;
            return { ...l, qty: updated.qty };
          })
          .filter((l) => l.qty > 0);
        if (updated.qty > 0) return pruned;
        const gone = line.key;
        if (this.combineOpenKey() === gone) this.combineOpenKey.set(null);
        if (this.noteOpenKey() === gone) this.noteOpenKey.set(null);
        return pruned.map((l) => ({
          ...l,
          combinesWithKeys: (l.combinesWithKeys ?? []).filter((k) => k !== gone),
        }));
      }
      return next.filter((l) => l.qty > 0);
    });
    if (this.orderStep() === 'review' && !this.lineCount()) {
      this.goToPick();
    }
  }

  clearCart(): void {
    this.lines.set([]);
    this.cartDetail.set(true);
    this.combineOpenKey.set(null);
    this.noteOpenKey.set(null);
    this.orderNoteOpen.set(false);
    this.notes.set('');
    this.orderStep.set('pick');
  }

  sendOrder(): void {
    const slug = this.slug();
    const token = this.token();
    const session = this.session();
    const lines = this.lines();
    if (!slug || !token || !session || this.busy()) return;
    if (!lines.length) {
      this.error.set('Agregá al menos un ítem');
      return;
    }
    const caps = this.capabilities();
    if (!caps.allowSendOrder) {
      this.error.set('No está permitido enviar comandas');
      return;
    }
    const counter = this.isCounterSession(session);
    // Mostrador: no imprime hasta confirmar el cobro (cocina + ticket ahí).
    let printKitchen = counter ? false : this.printKitchen();
    let printCustomerTicket = false;
    if (!caps.allowPrintKitchen) printKitchen = false;
    if (caps.lockPrintKitchen && !counter) {
      printKitchen = !!caps.defaultPrintKitchen;
    }
    const items = lines
      .filter((l) => l.kind === 'ITEM')
      .map((l) => {
        const combinesWithNames = this.combinesWithNamesFor(l, lines);
        const itemNotes = String(l.notes ?? '').trim().slice(0, 300);
        return {
          menuItemId: l.menuItemId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          isEntrada: counter ? false : !!l.isEntrada,
          ...(itemNotes ? { notes: itemNotes } : {}),
          ...(combinesWithNames.length ? { combinesWithNames } : {}),
        };
      });
    const extras = lines
      .filter((l) => l.kind === 'EXTRA' && l.extraId)
      .map((l) => ({
        extraId: l.extraId!,
        qty: l.qty,
        attachedToMenuItemId: l.attachedToMenuItemId ?? null,
      }));
    // Promos de pool se cargan como ítems de carta; el matching de mesa usa sessionPromos.
    this.busy.set(true);
    this.error.set(null);
    this.api
      .createOrder(slug, token, session.id, {
        items,
        extras,
        customerNotes: this.notes().trim() || null,
        printKitchen,
        printCustomerTicket,
      })
      .subscribe({
        next: (res) => {
          this.lines.set([]);
          this.notes.set('');
          this.orderStep.set('pick');
          this.cartDetail.set(true);
          this.combineOpenKey.set(null);
          this.noteOpenKey.set(null);
          this.orderNoteOpen.set(false);
          const warn = res?.print?.kitchenWarning;
          if (counter) {
            this.finishCounterSend(slug, token, session.id, warn ?? null);
            return;
          }
          this.busy.set(false);
          if (printKitchen && warn) {
            this.showToast(warn);
          } else {
            this.showToast(printKitchen ? 'Comanda enviada' : 'Agregado a la mesa');
          }
          this.session.set(null);
          this.view.set('tables');
          this.loadTables();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(apiErrorMessage(err, 'No se pudo enviar la comanda'));
        },
      });
  }

  /** Mostrador: refresca sesión y abre cobro (descuento + ticket al confirmar). */
  private finishCounterSend(
    slug: string,
    token: string,
    sessionId: string,
    kitchenWarn: string | null,
  ): void {
    this.api.getSession(slug, token, sessionId).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.session.set(updated);
        this.showToast(kitchenWarn || 'Listo para cobrar');
        this.sessionPane.set('order');
        this.ticketDiscountMode.set('none');
        this.ticketDiscountValue.set(null);
        this.ticketDiscountPresetId.set(null);
        this.openClosePaymentSheet();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudo actualizar el pedido'));
      },
    });
  }

  /** Abre el sheet de pago (sin revalidar ticket: ya se imprimió o se intenta cobrar igual). */
  private openClosePaymentSheet(): void {
    const session = this.session();
    if (!session) return;
    if (!this.capabilities().allowCloseTable) {
      this.error.set('No está permitido cerrar');
      return;
    }
    const methods = this.paymentMethodsForClose();
    const due = this.closeDueAmount();
    const amounts: Record<string, number | null> = {};
    for (const m of methods) amounts[m.id] = null;
    if (methods[0]) {
      amounts[methods[0].id] = due;
      this.closePayPrimaryId.set(methods[0].id);
    } else {
      this.closePayPrimaryId.set(null);
    }
    this.closeTipMode.set('none');
    this.closeTipValue.set(null);
    this.closePayAmounts.set(amounts);
    this.closeStep.set('summary');
    this.closeSheet.set(true);
  }

  /** Paso 2: pantalla de cobro (sin medio preelegido). Con $0 a cobrar, cierra directo. */
  goToClosePay(): void {
    if (this.closeToCollect() <= 0.02) {
      this.confirmClose();
      return;
    }
    const amounts: Record<string, number | null> = {};
    for (const m of this.paymentMethodsForClose()) amounts[m.id] = null;
    this.closePayAmounts.set(amounts);
    this.closePayPrimaryId.set(null);
    this.closeStep.set('pay');
  }

  backToCloseSummary(): void {
    this.closeStep.set('summary');
    this.redistributeClosePays();
  }

  closePayAmountOf(methodId: string): number {
    return Number(this.closePayAmounts()[methodId]) || 0;
  }

  closePaidPct(): number {
    const due = this.closeToCollect();
    if (due <= 0) return 100;
    return Math.max(0, Math.min(100, (this.closePaidTotal() / due) * 100));
  }

  /**
   * Tocar un medio: sin nada cargado → cobra todo con él; si falta plata → le suma
   * lo que resta; si ya está completo con otros → pasa todo a este.
   */
  tapClosePayMethod(methodId: string): void {
    const remaining = this.closeRemaining();
    if (this.closePaidTotal() > 0 && remaining > 0.02) {
      this.fillClosePayRest(methodId);
      return;
    }
    this.fillClosePayAll(methodId);
  }

  /** Suma a este medio lo que falta cobrar (sin tocar los demás). */
  fillClosePayRest(methodId: string): void {
    const remaining = this.closeRemaining();
    if (remaining <= 0) return;
    const amounts = { ...this.closePayAmounts() };
    amounts[methodId] = Math.round((this.closePayAmountOf(methodId) + remaining) * 100) / 100;
    this.closePayPrimaryId.set(methodId);
    this.closePayAmounts.set(amounts);
  }

  reprintKitchen(orderId: string): void {
    const slug = this.slug();
    const token = this.token();
    const session = this.session();
    if (!slug || !token || !session || this.busy()) return;
    if (!this.capabilities().allowPrintKitchen) {
      this.error.set('No está permitido imprimir cocina');
      return;
    }
    this.busy.set(true);
    this.api.reprintKitchen(slug, token, session.id, orderId).subscribe({
      next: () => {
        this.busy.set(false);
        this.showToast('Comanda reencolada a cocina');
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudo reimprimir'));
      },
    });
  }

  askCloseTable(): void {
    const session = this.session();
    if (!session || this.busy()) return;
    const caps = this.capabilities();
    if (!caps.allowCloseTable) {
      this.error.set('No está permitido cerrar mesas');
      return;
    }
    const orders = session.orderCount ?? session.orders?.length ?? 0;
    if (!orders) {
      this.backToTables();
      return;
    }
    // Mostrador: descuento en el cobro; el ticket sale al confirmar.
    if (this.isCounterSession(session)) {
      if (!session.customerTicketPrinted) {
        this.ticketDiscountMode.set('none');
        this.ticketDiscountValue.set(null);
        this.ticketDiscountPresetId.set(null);
      }
      this.openClosePaymentSheet();
      return;
    }
    if (caps.requireTicketBeforeClose && !session.customerTicketPrinted) {
      this.error.set('Primero imprimí el ticket del cliente');
      this.openTicketSheet();
      return;
    }
    this.openClosePaymentSheet();
  }

  cancelClose(): void {
    this.closeSheet.set(false);
    this.closeStep.set('summary');
    this.closePayAmounts.set({});
    this.closePayPrimaryId.set(null);
    this.closeTipMode.set('none');
    this.closeTipValue.set(null);
  }

  closeDueAmount(): number {
    const s = this.session();
    if (!s) return 0;
    // Mostrador: descuento en el cobro (preview). Si ya hay ticket y no tocó desc., usá ese total.
    if (
      this.isCounterSession(s) &&
      this.closeSheet() &&
      this.capabilities().allowTicketDiscount &&
      (this.ticketDiscountMode() !== 'none' || !s.customerTicketPrinted)
    ) {
      return this.ticketPreviewTotal();
    }
    if (s.ticketTotal != null) return Number(s.ticketTotal) || 0;
    return this.sessionSubtotal();
  }

  /** Recalcula pagos al cambiar descuento en el cobro de mostrador. */
  private syncClosePrimaryPay(): void {
    if (!this.closeSheet()) return;
    this.redistributeClosePays();
  }

  closeTipAmount(): number {
    const due = this.closeDueAmount();
    const mode = this.closeTipMode();
    const v = Math.max(0, Number(this.closeTipValue()) || 0);
    if (mode === 'percent' && v > 0) {
      return Math.round(((due * Math.min(100, v)) / 100) * 100) / 100;
    }
    if (mode === 'fixed' && v > 0) {
      return Math.round(v * 100) / 100;
    }
    return 0;
  }

  closeToCollect(): number {
    return Math.round((this.closeDueAmount() + this.closeTipAmount()) * 100) / 100;
  }

  closePaidTotal(): number {
    let sum = 0;
    for (const v of Object.values(this.closePayAmounts())) {
      sum += Number(v) || 0;
    }
    return Math.round(sum * 100) / 100;
  }

  closeRemaining(): number {
    return Math.round((this.closeToCollect() - this.closePaidTotal()) * 100) / 100;
  }

  setClosePayAmount(methodId: string, raw: number | string | null): void {
    const next =
      raw === '' || raw == null || Number.isNaN(Number(raw))
        ? null
        : Math.max(0, Math.round(Number(raw) * 100) / 100);
    const amounts = { ...this.closePayAmounts() };
    const prev = Number(amounts[methodId]) || 0;
    const value = next ?? 0;
    amounts[methodId] = next != null && next > 0 ? next : null;
    const delta = value - prev;

    if (delta > 0) {
      let need = delta;
      const donors = Object.entries(amounts)
        .filter(([id]) => id !== methodId)
        .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
      // Preferir descontar del medio primario si tiene saldo.
      const primary = this.closePayPrimaryId();
      if (primary && primary !== methodId) {
        donors.sort((a, b) => {
          if (a[0] === primary) return -1;
          if (b[0] === primary) return 1;
          return (Number(b[1]) || 0) - (Number(a[1]) || 0);
        });
      }
      for (const [id, v] of donors) {
        if (need <= 0) break;
        const cur = Number(v) || 0;
        if (cur <= 0) continue;
        const take = Math.min(cur, need);
        const left = Math.round((cur - take) * 100) / 100;
        amounts[id] = left > 0 ? left : null;
        need = Math.round((need - take) * 100) / 100;
      }
    } else if (delta < 0) {
      const free = -delta;
      let target =
        this.closePayPrimaryId() && this.closePayPrimaryId() !== methodId
          ? this.closePayPrimaryId()!
          : Object.keys(amounts).find(
              (id) => id !== methodId && (Number(amounts[id]) || 0) > 0,
            ) ?? null;
      if (!target) {
        target =
          this.paymentMethodsForClose().find((m) => m.id !== methodId)?.id ?? null;
      }
      if (target) {
        const cur = Number(amounts[target]) || 0;
        amounts[target] = Math.round((cur + free) * 100) / 100;
      }
    }

    if (value > 0) this.closePayPrimaryId.set(methodId);
    this.closePayAmounts.set(amounts);
  }

  /** Asigna todo el total a este medio (limpia los demás). */
  fillClosePayAll(methodId: string): void {
    const total = this.closeToCollect();
    const amounts: Record<string, number | null> = {};
    for (const m of this.paymentMethodsForClose()) {
      amounts[m.id] = m.id === methodId && total > 0 ? total : null;
    }
    this.closePayPrimaryId.set(methodId);
    this.closePayAmounts.set(amounts);
  }

  /** Deja 50% en este medio y el resto en el otro principal. */
  fillClosePayHalf(methodId: string): void {
    const total = this.closeToCollect();
    if (total <= 0) return;
    const half = Math.round((total / 2) * 100) / 100;
    const rest = Math.round((total - half) * 100) / 100;
    const methods = this.paymentMethodsForClose();
    const other =
      methods.find(
        (m) => m.id !== methodId && (Number(this.closePayAmounts()[m.id]) || 0) > 0,
      ) ??
      methods.find((m) => m.id !== methodId && m.id === this.closePayPrimaryId()) ??
      methods.find((m) => m.id !== methodId) ??
      null;

    const amounts: Record<string, number | null> = {};
    for (const m of methods) amounts[m.id] = null;
    amounts[methodId] = half;
    if (other && rest > 0) {
      amounts[other.id] = rest;
      this.closePayPrimaryId.set(other.id);
    } else {
      amounts[methodId] = total;
      this.closePayPrimaryId.set(methodId);
    }
    this.closePayAmounts.set(amounts);
  }

  onCloseTipMode(mode: 'none' | 'percent' | 'fixed'): void {
    this.closeTipMode.set(mode);
    if (mode === 'none') this.closeTipValue.set(null);
    this.redistributeClosePays();
  }

  onCloseTipValue(raw: number | string | null): void {
    this.closeTipValue.set(raw === '' || raw == null ? null : +raw);
    this.redistributeClosePays();
  }

  redistributeClosePays(): void {
    const methods = this.paymentMethodsForClose();
    if (!methods.length) return;
    const primary =
      this.closePayPrimaryId() && methods.some((m) => m.id === this.closePayPrimaryId())
        ? this.closePayPrimaryId()!
        : methods[0].id;
    const amounts: Record<string, number | null> = {};
    for (const m of methods) amounts[m.id] = null;
    amounts[primary] = this.closeToCollect();
    this.closePayPrimaryId.set(primary);
    this.closePayAmounts.set(amounts);
  }

  canConfirmClose(): boolean {
    if (!this.paymentMethodsForClose().length) return false;
    const paid = this.closePaidTotal();
    const due = this.closeToCollect();
    // Ticket $0 (ej. descuento 100%): nada que cobrar; alcanza con tener medios configurados.
    if (due <= 0.02) return true;
    return paid > 0 && Math.abs(paid - due) <= 0.02;
  }

  openTicketSheet(): void {
    const session = this.session();
    if (!session || this.busy()) return;
    if (!this.capabilities().allowPrintCustomerTicket) {
      this.error.set('No está permitido imprimir ticket cliente');
      return;
    }
    const orders = session.orderCount ?? session.orders?.length ?? 0;
    if (!orders) {
      this.error.set('No hay envíos para imprimir');
      return;
    }
    this.ticketDiscountMode.set('none');
    this.ticketDiscountValue.set(null);
    this.ticketDiscountPresetId.set(null);
    this.ticketEditOpen.set(false);
    this.ticketOutsideOpen.set(false);
    this.ticketSheet.set(true);
  }

  setTicketDiscountMode(mode: 'none' | 'percent' | 'fixed'): void {
    this.ticketDiscountMode.set(mode);
    this.ticketDiscountPresetId.set(null);
    if (mode === 'none') this.ticketDiscountValue.set(null);
    this.syncClosePrimaryPay();
  }

  applyTicketDiscountPreset(preset: DiscountPreset): void {
    this.ticketDiscountPresetId.set(preset.id);
    this.ticketDiscountMode.set(preset.mode);
    this.ticketDiscountValue.set(preset.value);
    this.syncClosePrimaryPay();
  }

  onCloseDiscountValue(raw: number | string | null): void {
    this.ticketDiscountValue.set(raw === '' || raw == null ? null : +raw);
    this.syncClosePrimaryPay();
  }

  cancelTicketSheet(): void {
    this.ticketSheet.set(false);
    this.ticketEditOpen.set(false);
    this.ticketOutsideOpen.set(false);
  }

  ticketOutsideGrouped(
    outside: NonNullable<WaiterSession['promoBreakdown']>['outside'] | null | undefined,
  ): Array<{ name: string; qty: number; amount: number }> {
    const map = new Map<string, { name: string; qty: number; amount: number }>();
    for (const row of outside ?? []) {
      const name = String(row.name ?? '').trim() || 'Ítem';
      const key = `${row.kind}|${name}|${row.unitPrice}`;
      const prev = map.get(key);
      const qty = Math.max(0, Number(row.qty) || 0);
      const amount = Math.max(0, Number(row.amount) || 0);
      if (prev) {
        prev.qty += qty;
        prev.amount += amount;
      } else {
        map.set(key, { name, qty, amount });
      }
    }
    return [...map.values()].filter((r) => r.qty > 0);
  }

  sessionSubtotal(): number {
    const s = this.session();
    if (!s) return 0;
    if (s.sessionSubtotal != null) return Number(s.sessionSubtotal) || 0;
    return (s.orders ?? []).reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  }

  ticketPreviewTotal(): number {
    const sub = this.sessionSubtotal();
    const mode = this.ticketDiscountMode();
    const v = Math.max(0, Number(this.ticketDiscountValue()) || 0);
    if (mode === 'percent' && v > 0) {
      return Math.max(0, Math.round((sub - (sub * Math.min(100, v)) / 100) * 100) / 100);
    }
    if (mode === 'fixed' && v > 0) {
      return Math.max(0, Math.round((sub - Math.min(sub, v)) * 100) / 100);
    }
    return sub;
  }

  paymentMethodsForClose(): Array<{ id: string; name: string }> {
    const s = this.session();
    const fromSession = s?.paymentMethods ?? [];
    if (fromSession.length) return fromSession;
    return this.catalog()?.tablePaymentMethods ?? [];
  }

  confirmPrintTicket(): void {
    const slug = this.slug();
    const token = this.token();
    const session = this.session();
    if (!slug || !token || !session || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.api
      .printCustomerTicket(slug, token, session.id, {
        discountMode: this.ticketDiscountMode(),
        discountValue: this.ticketDiscountValue(),
      })
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.ticketSheet.set(false);
          this.session.set(updated);
          this.showToast('Ticket enviado a imprimir');
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(apiErrorMessage(err, 'No se pudo imprimir el ticket'));
        },
      });
  }

  confirmClose(): void {
    const slug = this.slug();
    const token = this.token();
    const session = this.session();
    if (!slug || !token || !session || this.busy()) return;
    const counter = this.isCounterSession(session);
    if (!counter && !session.customerTicketPrinted) {
      this.error.set('Primero imprimí el ticket del cliente');
      return;
    }
    if (!this.canConfirmClose()) {
      this.error.set('La suma de pagos debe coincidir con el total a cobrar');
      return;
    }
    const toCollect = this.closeToCollect();
    const payments = Object.entries(this.closePayAmounts())
      .map(([paymentMethodId, amount]) => ({
        paymentMethodId,
        amount: Number(amount) || 0,
      }))
      .filter((p) => p.amount > 0);
    const primary =
      this.closePayPrimaryId() ?? this.paymentMethodsForClose()[0]?.id ?? null;
    const tipMode = this.closeTipMode();
    const tipValue = this.closeTipValue();
    const discountMode = this.ticketDiscountMode();
    const discountValue = this.ticketDiscountValue();

    const runClose = (sessionId: string) => {
      this.api
        .closeSession(slug, token, sessionId, {
          // Total $0: sin montos; el API registra el medio elegido (o el primero).
          payments: toCollect <= 0.02 ? undefined : payments,
          paymentMethodId: toCollect <= 0.02 ? primary ?? undefined : undefined,
          tipMode,
          tipValue,
        })
        .subscribe({
          next: () => {
            this.busy.set(false);
            this.showToast(counter ? 'Pedido cerrado' : 'Mesa cerrada');
            this.session.set(null);
            this.lines.set([]);
            this.view.set('tables');
            this.loadTables();
          },
          error: (err) => {
            this.busy.set(false);
            this.closeSheet.set(true);
            this.error.set(
              apiErrorMessage(err, counter ? 'No se pudo cerrar el pedido' : 'No se pudo cerrar la mesa'),
            );
          },
        });
    };

    this.closeSheet.set(false);
    this.busy.set(true);

    // Mostrador: cocina + ticket recién al confirmar el cobro.
    if (counter) {
      const caps = this.capabilities();
      const orders = session.orders ?? [];
      const afterPrint = (updated: WaiterSession) => {
        this.session.set(updated);
        runClose(updated.id);
      };
      const onPrintErr = (err: unknown) => {
        this.busy.set(false);
        this.closeSheet.set(true);
        this.error.set(apiErrorMessage(err, 'No se pudo imprimir'));
      };
      const printTicketThenClose = () => {
        if (!caps.allowPrintCustomerTicket) {
          this.api.getSession(slug, token, session.id).subscribe({
            next: afterPrint,
            error: onPrintErr,
          });
          return;
        }
        this.api
          .printCustomerTicket(slug, token, session.id, {
            discountMode,
            discountValue,
          })
          .subscribe({ next: afterPrint, error: onPrintErr });
      };
      if (caps.allowPrintKitchen && orders.length) {
        forkJoin(
          orders.map((o) =>
            this.api.reprintKitchen(slug, token, session.id, o.id).pipe(
              catchError(() => of(null)),
            ),
          ),
        ).subscribe({
          next: () => printTicketThenClose(),
          error: () => printTicketThenClose(),
        });
      } else {
        printTicketThenClose();
      }
      return;
    }

    runClose(session.id);
  }
}
