import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { ThemeService } from '../../core/theme/theme.service';
import { prettySection } from '../menu/menu-display';
import { apiErrorMessage, formatOrderLinesInline, groupOrderLines, onAccentColor, orderingMoney } from '../customer-orders/ordering-ui.util';
import {
  WaiterApiService,
  WaiterCatalog,
  WaiterMapObject,
  WaiterSession,
  WaiterShiftTipsSummary,
  WaiterTable,
} from './waiter-api.service';
import {
  DEFAULT_WAITER_CAP_PUBLIC,
  DEFAULT_WAITER_CAP_STAFF,
  normalizeWaiterCapProfile,
  type WaiterCapProfile,
} from '../admin/waiter-capabilities';
import {
  resolveDiscountPresets,
  type DiscountPreset,
} from '../../core/shop/discount-presets';

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
};

type CatalogItem = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  section: string;
};

type View = 'login' | 'tables' | 'session';

function tokenKey(slug: string) {
  return `waiter_token_${slug}`;
}

@Component({
  selector: 'app-waiter-page',
  imports: [FormsModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './waiter-page.html',
  styleUrl: './waiter-page.scss',
  host: {
    '[style.--accent]': 'hostAccentVar()',
    '[style.--on-accent]': 'hostOnAccentVar()',
    '[class.view-session]': 'view() === "session"',
    '[class.view-map]': 'view() === "tables" && showMap()',
    '[class.staff-embedded]': 'staffMode',
  },
})
export class WaiterPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(WaiterApiService);
  private readonly title = inject(Title);
  private readonly shopContext = inject(ShopContextService);
  private readonly theme = inject(ThemeService);

  /** Operación → Comanda (JWT, sin PIN). */
  readonly staffMode = !!this.route.snapshot.data['staffComanda'];

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
  readonly shopName = signal('');
  readonly accent = signal(this.theme.accent());
  readonly tables = signal<WaiterTable[]>([]);
  readonly mapObjects = signal<WaiterMapObject[]>([]);
  readonly session = signal<WaiterSession | null>(null);
  readonly catalog = signal<WaiterCatalog | null>(null);
  readonly lines = signal<PosLine[]>([]);
  readonly query = signal('');
  readonly sectionFilter = signal<string | null>(null);
  /** Filtro de chip «Promos» (no es una sección de carta). */
  readonly promosSection = '__promos__';
  readonly notes = signal('');
  readonly printKitchen = signal(true);
  readonly printCustomerTicket = signal(false);
  readonly cartOpen = signal(false);
  /** Vista detallada del carrito (qty +/− y nota). Por defecto resumen. */
  readonly cartDetail = signal(false);
  /** Ítem de carta con extras desplegados (null = todos contraídos). */
  readonly extrasOpenFor = signal<string | null>(null);
  /** Envíos / Resumen de mesa: colapsados por defecto para priorizar la carta. */
  readonly sessionEnviosOpen = signal(false);
  readonly sessionResumenOpen = signal(false);
  /** Borrador del cupo por promoId (vacío = ilimitado). */
  readonly promoCupoDrafts = signal<Record<string, string>>({});

  /** Sheet: pedir comensales (y mozo en admin) antes de abrir. */
  readonly coversSheet = signal<WaiterTable | null>(null);
  readonly coversDraft = signal(2);
  readonly staffWaiters = signal<Array<{ id: string; fullName: string }>>([]);
  readonly coversWaiterId = signal<string | null>(null);

  /** Sheet: cerrar mesa (ticket + pagos mixtos + propina). */
  readonly closeSheet = signal(false);
  readonly closeTipMode = signal<'none' | 'percent' | 'fixed'>('none');
  readonly closeTipValue = signal<number | null>(null);
  /** Montos por medio de pago (id → monto). */
  readonly closePayAmounts = signal<Record<string, number | null>>({});
  /** Medio que absorbe el resto / último «Todo». */
  readonly closePayPrimaryId = signal<string | null>(null);

  /** Resumen de propinas del turno (vista mesas). */
  readonly tipsSummary = signal<WaiterShiftTipsSummary | null>(null);
  readonly capabilities = signal<WaiterCapProfile>(
    this.staffMode ? DEFAULT_WAITER_CAP_STAFF : DEFAULT_WAITER_CAP_PUBLIC,
  );
  readonly historyOpen = signal(false);
  readonly historyDetailId = signal<string | null>(null);

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

  readonly sections = computed(() => {
    const menus = this.catalog()?.menus ?? [];
    const names: string[] = [];
    const seen = new Set<string>();
    for (const m of menus) {
      for (const sec of m.sections ?? []) {
        const label =
          menus.length > 1 && m.title
            ? `${prettySection(sec.name)} · ${m.title}`
            : prettySection(sec.name);
        if (!seen.has(label)) {
          seen.add(label);
          names.push(label);
        }
      }
    }
    return names;
  });

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
    (this.catalog()?.promos ?? []).filter((p) => p.sellable),
  );

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
    applyStatusBar('#eef1ee', 'light');
    if (this.staffMode) {
      this.enterAsStaff();
      return;
    }
    const slug = this.slug();
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
          this.waiterName.set(me.waiter.fullName);
          this.shopName.set(me.shop.name);
          this.accent.set(this.resolveAccent(me.shop.accentColor));
          this.applyCapabilities((me as { capabilities?: WaiterCapProfile }).capabilities);
          this.title.setTitle(`Mozo · ${me.shop.name}`);
          this.view.set('tables');
          this.loadTables();
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
        this.waiterName.set(res.waiter.fullName);
        this.shopName.set(res.shop.name);
        this.accent.set(this.resolveAccent(res.shop.accentColor));
        this.applyCapabilities(res.capabilities);
        this.title.setTitle(`Comanda · ${res.shop.name}`);
        this.view.set('tables');
        this.loadTables();
        this.loadStaffWaiters(shopId);
      },
      error: (err) => {
        this.busy.set(false);
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudo abrir la comanda'));
        this.view.set('login');
      },
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
        this.title.setTitle(`Mozo · ${res.shop.name}`);
      },
      error: (err) => {
        if (!this.token()) {
          this.error.set(apiErrorMessage(err, 'Local no encontrado o comanda desactivada'));
        }
      },
    });
  }

  ngOnDestroy(): void {
    resetStatusBar();
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

  bumpTicketItem(
    row: {
      parts: Array<{ orderId: string; lineIndex: number; qty: number }>;
    },
    delta: number,
  ): void {
    if (!this.capabilities().allowEditTicket) return;
    if (!row.parts.length) return;
    const last = row.parts[row.parts.length - 1];
    this.patchTicketLine({
      orderId: last.orderId,
      lineIndex: last.lineIndex,
      qty: Math.max(0, last.qty + delta),
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
    parts: Array<{ orderId: string; lineIndex: number; qty: number }>;
  }): void {
    if (!this.capabilities().allowRemoveTicketLines) return;
    // Quitar de atrás hacia adelante para no invalidar índices en el mismo envío.
    const ops = [...row.parts]
      .sort((a, b) => {
        if (a.orderId !== b.orderId) return a.orderId < b.orderId ? -1 : 1;
        return b.lineIndex - a.lineIndex;
      })
      .map((p) => ({
        orderId: p.orderId,
        lineIndex: p.lineIndex,
        remove: true as const,
      }));
    this.patchTicketLineChain(ops);
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
    if (!/^\d{4,6}$/.test(pin)) {
      this.error.set('Ingresá un PIN de 4 a 6 dígitos');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.login(slug, pin).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.token.set(res.token);
        localStorage.setItem(tokenKey(slug), res.token);
        this.waiterName.set(res.waiter.fullName);
        this.shopName.set(res.shop.name);
        this.accent.set(this.resolveAccent(res.shop.accentColor));
        this.applyCapabilities(res.capabilities);
        this.title.setTitle(`Mozo · ${res.shop.name}`);
        this.pin.set('');
        this.view.set('tables');
        this.loadTables();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'PIN incorrecto'));
      },
    });
  }

  logout(): void {
    const slug = this.slug();
    if (slug) localStorage.removeItem(tokenKey(slug));
    this.token.set(null);
    this.session.set(null);
    this.lines.set([]);
    if (this.staffMode) {
      void this.router.navigate(['/']);
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
      next: (sum) => this.tipsSummary.set(sum),
      error: () => this.tipsSummary.set(null),
    });
  }

  historySessions(): NonNullable<WaiterShiftTipsSummary['sessions']> {
    return this.tipsSummary()?.sessions ?? [];
  }

  historyDetail(): NonNullable<WaiterShiftTipsSummary['sessions']>[number] | null {
    const id = this.historyDetailId();
    if (!id) return null;
    return this.historySessions().find((s) => s.sessionId === id) ?? null;
  }

  readonly historyOrderItems = signal<
    Array<{ name: string; qty: number; unitPrice: number; extra?: boolean }>
  >([]);
  readonly historyOrderLoading = signal(false);

  openHistory(): void {
    if (!this.capabilities().allowHistory) return;
    this.historyDetailId.set(null);
    this.historyOrderItems.set([]);
    this.historyOpen.set(true);
    this.loadTipsSummary();
  }

  closeHistory(): void {
    this.historyOpen.set(false);
    this.historyDetailId.set(null);
    this.historyOrderItems.set([]);
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
        this.historyOrderLoading.set(false);
      },
      error: () => {
        this.historyOrderItems.set([]);
        this.historyOrderLoading.set(false);
      },
    });
  }

  tapTable(table: WaiterTable): void {
    if (this.busy()) return;
    if (table.openSession) {
      this.resumeTable(table);
      return;
    }
    this.coversDraft.set(Math.max(1, Math.min(30, table.seats || 2)));
    if (this.staffMode) {
      const waiters = this.staffWaiters();
      const current = this.coversWaiterId();
      if (!current || !waiters.some((w) => w.id === current)) {
        this.coversWaiterId.set(waiters.length === 1 ? waiters[0].id : null);
      }
    }
    this.coversSheet.set(table);
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

  private resumeTable(table: WaiterTable): void {
    const slug = this.slug();
    const token = this.token();
    const sid = table.openSession?.id;
    if (!slug || !token || !sid) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.getSession(slug, token, sid).subscribe({
      next: (session) => this.enterSession(session),
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudo abrir la mesa'));
      },
    });
  }

  private openFresh(
    table: WaiterTable,
    covers: number,
    waiterEmployeeId?: string | null,
  ): void {
    const slug = this.slug();
    const token = this.token();
    if (!slug || !token) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.openSession(slug, token, table.id, covers, waiterEmployeeId).subscribe({
      next: (session) => this.enterSession(session),
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudo abrir la mesa'));
      },
    });
  }

  private enterSession(session: WaiterSession): void {
    this.busy.set(false);
    this.session.set(session);
    this.lines.set([]);
    this.notes.set('');
    const caps = this.capabilities();
    this.printKitchen.set(caps.allowPrintKitchen && caps.defaultPrintKitchen);
    this.printCustomerTicket.set(
      caps.allowPrintCustomerTicket && caps.defaultPrintCustomerTicket,
    );
    this.cartOpen.set(false);
    this.sessionEnviosOpen.set(false);
    this.sessionResumenOpen.set(false);
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
    items?: Array<{ menuItemId: string; qty: number }>;
    specialName?: string | null;
    tableMatchable?: boolean;
  }): void {
    const items = promo.items ?? [];
    if (items.length) {
      // Composición = mismos ítems de carta; el matching de mesa hace el precio.
      const catalog = this.catalogItems();
      this.lines.update((list) => {
        let next = [...list];
        for (const it of items) {
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
            next.push({
              key,
              kind: 'ITEM',
              menuItemId: found.id,
              name: found.name,
              unitPrice: Number(found.price) || 0,
              qty: qtyAdd,
            });
          }
        }
        return next;
      });
      if (promo.tableMatchable !== false && !this.isSessionPromoOn(promo.id)) {
        this.toggleSessionPromo(promo.id);
      }
      this.cartOpen.set(true);
      return;
    }

    // Evento sin composición: línea PROMO.
    const key = `p:${promo.id}`;
    this.lines.update((list) => {
      const idx = list.findIndex((l) => l.key === key);
      if (idx >= 0) {
        return list.map((l, i) =>
          i === idx ? { ...l, qty: Math.min(99, l.qty + 1) } : l,
        );
      }
      return [
        ...list,
        {
          key,
          kind: 'PROMO',
          menuItemId: promo.id,
          name: promo.name,
          unitPrice: Number(promo.fixedPrice) || 0,
          qty: 1,
          promoId: promo.id,
        },
      ];
    });
    this.cartOpen.set(true);
  }

  backToTables(): void {
    const slug = this.slug();
    const token = this.token();
    const session = this.session();
    const hadOrders = (session?.orderCount ?? session?.orders?.length ?? 0) > 0;

    const go = () => {
      this.session.set(null);
      this.lines.set([]);
      this.cartOpen.set(false);
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
      },
      error: (err) =>
        this.error.set(apiErrorMessage(err, 'No se pudo cargar la carta')),
    });
  }

  setSection(sec: string | null): void {
    this.sectionFilter.set(sec);
  }

  addItem(it: CatalogItem): void {
    const key = `i:${it.id}`;
    this.lines.update((list) => {
      const idx = list.findIndex((l) => l.key === key);
      if (idx >= 0) {
        return list.map((l, i) =>
          i === idx ? { ...l, qty: Math.min(99, l.qty + 1) } : l,
        );
      }
      return [
        ...list,
        {
          key,
          kind: 'ITEM',
          menuItemId: it.id,
          name: it.name,
          unitPrice: Number(it.price) || 0,
          qty: 1,
        },
      ];
    });
    this.cartOpen.set(true);
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
    const itemKey = `i:${itemId}`;
    const extraKey = `e:${String(extra.id)}:${itemId}`;
    this.lines.update((list) => {
      let next = [...list];
      const itemIdx = next.findIndex((l) => l.key === itemKey);
      const exIdx = next.findIndex((l) => l.key === extraKey);

      if (itemIdx < 0) {
        // Tocó el extra directo: suma plato + extra juntos.
        next.push(
          {
            key: itemKey,
            kind: 'ITEM',
            menuItemId: itemId,
            name: parent.name,
            unitPrice: Number(parent.price) || 0,
            qty: 1,
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
        return next;
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
    this.cartOpen.set(true);
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
        return next
          .map((l) => {
            if (l.kind !== 'EXTRA') return l;
            const attach = String(l.attachedToMenuItemId || l.menuItemId || '');
            if (attach !== parentId) return l;
            return { ...l, qty: updated.qty };
          })
          .filter((l) => l.qty > 0);
      }
      return next.filter((l) => l.qty > 0);
    });
  }

  clearCart(): void {
    this.lines.set([]);
    this.cartDetail.set(false);
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
    let printKitchen = this.printKitchen();
    let printCustomerTicket = this.printCustomerTicket();
    if (!caps.allowPrintKitchen) printKitchen = false;
    if (!caps.allowPrintCustomerTicket) printCustomerTicket = false;
    if (caps.lockPrintKitchen) printKitchen = !!caps.defaultPrintKitchen;
    if (caps.lockPrintCustomerTicket) printCustomerTicket = !!caps.defaultPrintCustomerTicket;
    const items = lines
      .filter((l) => l.kind === 'ITEM')
      .map((l) => ({ menuItemId: l.menuItemId, qty: l.qty }));
    const extras = lines
      .filter((l) => l.kind === 'EXTRA' && l.extraId)
      .map((l) => ({
        extraId: l.extraId!,
        qty: l.qty,
        attachedToMenuItemId: l.attachedToMenuItemId ?? null,
      }));
    const promos = lines
      .filter((l) => l.kind === 'PROMO' && l.promoId)
      .map((l) => ({ promoId: l.promoId!, qty: l.qty }));
    this.busy.set(true);
    this.error.set(null);
    this.api
      .createOrder(slug, token, session.id, {
        items,
        extras,
        promos: promos.length ? promos : undefined,
        customerNotes: this.notes().trim() || null,
        printKitchen,
        printCustomerTicket,
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.lines.set([]);
          this.notes.set('');
          this.cartOpen.set(false);
          this.cartDetail.set(false);
          const warn = res?.print?.kitchenWarning;
          if (printKitchen && warn) {
            this.showToast(warn);
          } else {
            this.showToast(
              printKitchen || printCustomerTicket ? 'Comanda enviada' : 'Agregado a la mesa',
            );
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
    if (caps.requireTicketBeforeClose && !session.customerTicketPrinted) {
      this.error.set('Primero imprimí el ticket del cliente');
      this.openTicketSheet();
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
    this.closeSheet.set(true);
  }

  cancelClose(): void {
    this.closeSheet.set(false);
    this.closePayAmounts.set({});
    this.closePayPrimaryId.set(null);
    this.closeTipMode.set('none');
    this.closeTipValue.set(null);
  }

  closeDueAmount(): number {
    const s = this.session();
    if (!s) return 0;
    if (s.ticketTotal != null) return Number(s.ticketTotal) || 0;
    return this.sessionSubtotal();
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
  }

  applyTicketDiscountPreset(preset: DiscountPreset): void {
    this.ticketDiscountPresetId.set(preset.id);
    this.ticketDiscountMode.set(preset.mode);
    this.ticketDiscountValue.set(preset.value);
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
    if (!session.customerTicketPrinted) {
      this.error.set('Primero imprimí el ticket del cliente');
      return;
    }
    if (!this.canConfirmClose()) {
      this.error.set('La suma de pagos debe coincidir con el total a cobrar');
      return;
    }
    const payments = Object.entries(this.closePayAmounts())
      .map(([paymentMethodId, amount]) => ({
        paymentMethodId,
        amount: Number(amount) || 0,
      }))
      .filter((p) => p.amount > 0);
    this.closeSheet.set(false);
    this.busy.set(true);
    this.api
      .closeSession(slug, token, session.id, {
        payments,
        tipMode: this.closeTipMode(),
        tipValue: this.closeTipValue(),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.showToast('Mesa cerrada');
          this.session.set(null);
          this.lines.set([]);
          this.view.set('tables');
          this.loadTables();
        },
        error: (err) => {
          this.busy.set(false);
          this.closeSheet.set(true);
          this.error.set(apiErrorMessage(err, 'No se pudo cerrar la mesa'));
        },
      });
  }
}
