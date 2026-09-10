import {
  Component,
  HostBinding,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
import { prettySection } from '../menu/menu-display';
import { apiErrorMessage, onAccentColor, orderingMoney } from '../customer-orders/ordering-ui.util';
import {
  WaiterApiService,
  WaiterCatalog,
  WaiterMapObject,
  WaiterSession,
  WaiterTable,
} from './waiter-api.service';

type PosLine = {
  key: string;
  kind: 'ITEM' | 'EXTRA';
  menuItemId: string;
  name: string;
  unitPrice: number;
  qty: number;
  extraId?: string;
  attachedToMenuItemId?: string;
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
  imports: [FormsModule],
  templateUrl: './waiter-page.html',
  styleUrl: './waiter-page.scss',
})
export class WaiterPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(WaiterApiService);
  private readonly title = inject(Title);

  readonly slug = computed(() => String(this.route.snapshot.paramMap.get('slug') ?? '').trim());
  readonly view = signal<View>('login');
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly toast = signal<string | null>(null);
  readonly pin = signal('');
  readonly token = signal<string | null>(null);
  readonly waiterName = signal('');
  readonly shopName = signal('');
  readonly accent = signal('#2e7d32');
  readonly tables = signal<WaiterTable[]>([]);
  readonly mapObjects = signal<WaiterMapObject[]>([]);
  readonly session = signal<WaiterSession | null>(null);
  readonly catalog = signal<WaiterCatalog | null>(null);
  readonly lines = signal<PosLine[]>([]);
  readonly query = signal('');
  readonly sectionFilter = signal<string | null>(null);
  readonly notes = signal('');
  readonly printKitchen = signal(true);
  readonly printCustomerTicket = signal(false);
  readonly cartOpen = signal(false);

  /** Sheet: pedir comensales antes de abrir. */
  readonly coversSheet = signal<WaiterTable | null>(null);
  readonly coversDraft = signal(2);

  /** Sheet: cerrar mesa / ticket. */
  readonly closeSheet = signal(false);

  /** Tab de sector: null = Todos. */
  readonly sectorTab = signal<string | null>(null);

  /** Lista forzada aunque haya coords (toggle). */
  readonly forceList = signal(false);

  readonly onAccent = computed(() => onAccentColor(this.accent()));
  readonly lineCount = computed(() => this.lines().reduce((s, l) => s + l.qty, 0));

  readonly freeTables = computed(() => this.tables().filter((t) => !t.openSession));
  readonly busyTables = computed(() => this.tables().filter((t) => !!t.openSession));

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

  tableLeft(t: WaiterTable): number {
    return t.mapX == null ? 50 : Number(t.mapX);
  }

  tableTop(t: WaiterTable): number {
    return t.mapY == null ? 50 : Number(t.mapY);
  }

  objectLeft(o: WaiterMapObject): number {
    return Number(o.mapX);
  }

  objectTop(o: WaiterMapObject): number {
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
  readonly subtotal = computed(() =>
    this.lines().reduce((s, l) => s + l.unitPrice * l.qty, 0),
  );

  @HostBinding('style.--accent')
  get hostAccent(): string {
    return this.accent();
  }

  @HostBinding('style.--on-accent')
  get hostOnAccent(): string {
    return this.onAccent();
  }

  @HostBinding('class.view-session')
  get hostSession(): boolean {
    return this.view() === 'session';
  }

  @HostBinding('class.view-map')
  get hostMap(): boolean {
    return this.view() === 'tables' && this.showMap();
  }

  ngOnInit(): void {
    applyStatusBar('#eef1ee', 'light');
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
          this.accent.set(me.shop.accentColor?.trim() || '#2e7d32');
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

  private loadBootstrap(slug: string): void {
    this.api.bootstrap(slug).subscribe({
      next: (res) => {
        this.shopName.set(res.shop.name);
        this.accent.set(res.shop.accentColor?.trim() || '#2e7d32');
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
        this.accent.set(res.shop.accentColor?.trim() || '#2e7d32');
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
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudieron cargar las mesas'));
        if (err?.status === 401) this.logout();
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
    this.coversSheet.set(null);
    this.openFresh(table, covers);
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

  private openFresh(table: WaiterTable, covers: number): void {
    const slug = this.slug();
    const token = this.token();
    if (!slug || !token) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.openSession(slug, token, table.id, covers).subscribe({
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
    this.printKitchen.set(true);
    this.printCustomerTicket.set(false);
    this.cartOpen.set(false);
    this.view.set('session');
    this.ensureCatalog();
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
      next: (cfg) => this.catalog.set(cfg),
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
    return this.extras().filter((e) => {
      const ids = e.menuItemIds ?? [];
      return !ids.length || ids.includes(itemId);
    });
  }

  addExtra(extra: { id: string; name: string; price: number }, itemId: string): void {
    const key = `e:${extra.id}:${itemId}`;
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
          kind: 'EXTRA',
          menuItemId: itemId,
          name: extra.name,
          unitPrice: Number(extra.price) || 0,
          qty: 1,
          extraId: extra.id,
          attachedToMenuItemId: itemId,
        },
      ];
    });
    this.cartOpen.set(true);
  }

  bump(line: PosLine, delta: number): void {
    this.lines.update((list) =>
      list
        .map((l) =>
          l.key === line.key ? { ...l, qty: Math.max(0, Math.min(99, l.qty + delta)) } : l,
        )
        .filter((l) => l.qty > 0),
    );
  }

  clearCart(): void {
    this.lines.set([]);
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
    if (!this.printKitchen() && !this.printCustomerTicket()) {
      this.error.set('Elegí cocina y/o ticket cliente');
      return;
    }
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
    this.busy.set(true);
    this.error.set(null);
    this.api
      .createOrder(slug, token, session.id, {
        items,
        extras,
        customerNotes: this.notes().trim() || null,
        printKitchen: this.printKitchen(),
        printCustomerTicket: this.printCustomerTicket(),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.lines.set([]);
          this.notes.set('');
          this.cartOpen.set(false);
          this.showToast('Comanda enviada');
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

  askCloseTable(): void {
    const session = this.session();
    if (!session || this.busy()) return;
    const orders = session.orderCount ?? session.orders?.length ?? 0;
    if (!orders) {
      this.backToTables();
      return;
    }
    this.closeSheet.set(true);
  }

  cancelClose(): void {
    this.closeSheet.set(false);
  }

  printTicketOnly(): void {
    const slug = this.slug();
    const token = this.token();
    const session = this.session();
    if (!slug || !token || !session || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.printCustomerTicket(slug, token, session.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.session.set(null);
        this.lines.set([]);
        this.cartOpen.set(false);
        this.closeSheet.set(false);
        this.view.set('tables');
        this.loadTables();
        this.showToast('Ticket enviado a imprimir');
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiErrorMessage(err, 'No se pudo imprimir el ticket'));
      },
    });
  }

  confirmClose(printTicket: boolean): void {
    const slug = this.slug();
    const token = this.token();
    const session = this.session();
    if (!slug || !token || !session || this.busy()) return;
    this.closeSheet.set(false);
    this.busy.set(true);
    this.api
      .closeSession(slug, token, session.id, { printCustomerTicket: printTicket })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.showToast(printTicket ? 'Mesa cerrada · ticket enviado' : 'Mesa cerrada');
          this.session.set(null);
          this.lines.set([]);
          this.view.set('tables');
          this.loadTables();
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(apiErrorMessage(err, 'No se pudo cerrar la mesa'));
        },
      });
  }
}
