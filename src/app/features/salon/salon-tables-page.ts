import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { ShopLiveClient } from '../../core/live/shop-live.service';
import { usePageRefresh } from '../../core/page-refresh.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { SpinnerComponent } from '../../shared/components/spinner';
import { SalonApiService } from './salon-api.service';
import { formatTableInventory } from './salon-combine.util';
import { SalonMapObject, SalonSector, SalonTable } from './salon.models';

type DraftMapObject = {
  key: string;
  id: string | null;
  kind: string;
  name: string;
  mapX: number;
  mapY: number;
};

@Component({
  selector: 'app-salon-tables-page',
  imports: [
    FormsModule,
    RouterLink,
    MatIconModule,
    MatSnackBarModule,
    BusyLabelComponent,
    PageHeaderComponent,
    SpinnerComponent,
  ],
  templateUrl: './salon-tables-page.html',
  styleUrl: './salon-page.scss',
})
export class SalonTablesPage {
  private readonly api = inject(SalonApiService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly live = inject(ShopLiveClient);
  readonly shops = inject(ShopContextService);

  readonly loading = signal(true);
  readonly sectors = signal<SalonSector[]>([]);
  readonly tables = signal<SalonTable[]>([]);
  readonly mapObjects = signal<SalonMapObject[]>([]);
  readonly addingSectorId = signal<string | null>(null);
  readonly creatingSector = signal(false);
  readonly bulkingSectorId = signal<string | null>(null);
  readonly newSectorName = signal('');
  readonly labelDrafts = signal<Record<string, string>>({});
  readonly nameDrafts = signal<Record<string, string>>({});
  readonly bulkFrom = signal<Record<string, number>>({});
  readonly bulkTo = signal<Record<string, number>>({});
  readonly viewMode = signal<'list' | 'map'>('list');
  readonly editingSectorId = signal<string | null>(null);
  readonly savingMap = signal(false);
  readonly draggingId = signal<string | null>(null);
  readonly draftTablePos = signal<Record<string, { x: number; y: number }>>({});
  readonly draftObjects = signal<DraftMapObject[]>([]);
  readonly removedObjectIds = signal<string[]>([]);
  readonly newObjectName = signal('');

  private drag:
    | {
        kind: 'table' | 'object';
        id: string;
        startX: number;
        startY: number;
        origX: number;
        origY: number;
      }
    | null = null;
  private draftSeq = 0;

  private readonly liveSlug = computed(() => this.shops.selectedShop()?.slug ?? null);

  constructor() {
    usePageRefresh(() => this.load());
    this.live
      .watch(this.liveSlug, ['reservations'])
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.load());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      untracked(() => {
        if (shopId) this.load();
      });
    });
  }

  canManage(): boolean {
    return hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'reservations.manage',
    );
  }

  isEditing(sectorId: string): boolean {
    return this.editingSectorId() === sectorId;
  }

  tablesOf(sectorId: string): SalonTable[] {
    return this.tables()
      .filter((t) => t.forWaiter !== false && t.sectorId === sectorId)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'es'));
  }

  objectsOf(sectorId: string): Array<SalonMapObject | DraftMapObject> {
    if (this.isEditing(sectorId)) return this.draftObjects();
    return this.mapObjects()
      .filter((o) => o.sectorId === sectorId)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'));
  }

  private onlyWaiterTables(rows: SalonTable[]): SalonTable[] {
    return (rows ?? []).filter((t) => t.forWaiter !== false);
  }

  setViewMode(mode: 'list' | 'map'): void {
    if (this.editingSectorId()) {
      this.snack.open('Guardá o cancelá el mapa antes de cambiar de vista', 'OK', {
        duration: 2800,
      });
      return;
    }
    this.viewMode.set(mode);
  }

  startEditMap(sectorId: string): void {
    if (!this.canManage() || this.editingSectorId()) return;
    this.viewMode.set('map');
    const drafts: Record<string, { x: number; y: number }> = {};
    this.tablesOf(sectorId).forEach((table, idx) => {
      drafts[table.id] = this.fallbackPos(table, idx);
    });
    this.draftTablePos.set(drafts);
    this.draftObjects.set(
      this.mapObjects()
        .filter((o) => o.sectorId === sectorId)
        .map((o) => ({
          key: o.id,
          id: o.id,
          kind: o.kind,
          name: o.name,
          mapX: o.mapX,
          mapY: o.mapY,
        })),
    );
    this.removedObjectIds.set([]);
    this.newObjectName.set('');
    this.editingSectorId.set(sectorId);
  }

  cancelEditMap(): void {
    this.editingSectorId.set(null);
    this.draftTablePos.set({});
    this.draftObjects.set([]);
    this.removedObjectIds.set([]);
    this.draggingId.set(null);
    this.drag = null;
  }

  saveEditMap(sectorId: string): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.savingMap() || this.editingSectorId() !== sectorId) return;
    this.savingMap.set(true);
    const tables = this.tablesOf(sectorId).map((t) => {
      const pos = this.draftTablePos()[t.id] ?? this.fallbackPos(t, 0);
      return { id: t.id, mapX: pos.x, mapY: pos.y };
    });
    const objects = this.draftObjects().map((o) => ({
      id: o.id,
      kind: o.kind,
      name: o.name,
      mapX: o.mapX,
      mapY: o.mapY,
    }));
    this.api
      .saveSectorMap(shopId, sectorId, {
        tables,
        objects,
        removedObjectIds: this.removedObjectIds(),
      })
      .subscribe({
        next: (floor) => {
          this.tables.set(this.onlyWaiterTables(floor.tables ?? []));
          this.mapObjects.set(floor.mapObjects ?? []);
          this.cancelEditMap();
          this.savingMap.set(false);
          this.snack.open('Mapa guardado', 'OK', { duration: 2200 });
        },
        error: (err) => {
          this.savingMap.set(false);
          this.fail(err, 'No se pudo guardar el mapa');
        },
      });
  }

  addMapObject(sectorId: string, kind: string): void {
    if (!this.isEditing(sectorId)) return;
    const name =
      this.newObjectName().trim() ||
      (kind === 'barra' ? 'Barra' : kind === 'arbol' ? 'Árbol' : 'Objeto');
    const key = `tmp-${++this.draftSeq}`;
    const count = this.draftObjects().length;
    this.draftObjects.update((list) => [
      ...list,
      {
        key,
        id: null,
        kind,
        name,
        mapX: Math.min(90, 20 + (count % 4) * 18),
        mapY: Math.min(85, 25 + Math.floor(count / 4) * 16),
      },
    ]);
    this.newObjectName.set('');
  }

  removeDraftObject(key: string): void {
    const obj = this.draftObjects().find((o) => o.key === key);
    if (!obj) return;
    if (obj.id) {
      this.removedObjectIds.update((ids) => [...ids, obj.id!]);
    }
    this.draftObjects.update((list) => list.filter((o) => o.key !== key));
  }

  renameDraftObject(key: string, name: string): void {
    this.draftObjects.update((list) =>
      list.map((o) => (o.key === key ? { ...o, name: name.slice(0, 60) } : o)),
    );
  }

  mapLeft(table: SalonTable): number {
    const draft = this.draftTablePos()[table.id];
    if (draft && this.isEditing(table.sectorId ?? '')) return draft.x;
    return this.fallbackPos(table).x;
  }

  mapTop(table: SalonTable): number {
    const draft = this.draftTablePos()[table.id];
    if (draft && this.isEditing(table.sectorId ?? '')) return draft.y;
    return this.fallbackPos(table).y;
  }

  objectLeft(obj: { mapX: number }): number {
    return Number(obj.mapX);
  }

  objectTop(obj: { mapY: number }): number {
    return Number(obj.mapY);
  }

  objectIcon(kind: string): string {
    if (kind === 'barra') return 'local_bar';
    if (kind === 'arbol') return 'park';
    return 'category';
  }

  private fallbackPos(table: SalonTable, idxHint?: number): { x: number; y: number } {
    if (table.mapX != null && table.mapY != null) {
      return { x: Number(table.mapX), y: Number(table.mapY) };
    }
    const peers = this.tablesOf(table.sectorId ?? '');
    const idx =
      idxHint ?? Math.max(0, peers.findIndex((t) => t.id === table.id));
    const cols = 5;
    return {
      x: Math.min(92, 8 + (idx % cols) * 18),
      y: Math.min(88, 10 + Math.floor(idx / cols) * 18),
    };
  }

  onMapPointerDown(
    ev: PointerEvent,
    target: { kind: 'table' | 'object'; id: string; x: number; y: number },
  ): void {
    if (!this.canManage() || !this.editingSectorId() || ev.button !== 0) return;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this.drag = {
      kind: target.kind,
      id: target.id,
      startX: ev.clientX,
      startY: ev.clientY,
      origX: target.x,
      origY: target.y,
    };
    this.draggingId.set(target.id);
    ev.preventDefault();
  }

  onMapPointerMove(ev: PointerEvent): void {
    if (!this.drag || !this.editingSectorId()) return;
    const canvas = (ev.currentTarget as HTMLElement).closest('.salon-map') as HTMLElement | null;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dx = ((ev.clientX - this.drag.startX) / rect.width) * 100;
    const dy = ((ev.clientY - this.drag.startY) / rect.height) * 100;
    const mapX = Math.min(92, Math.max(2, this.drag.origX + dx));
    const mapY = Math.min(88, Math.max(2, this.drag.origY + dy));
    if (this.drag.kind === 'table') {
      const id = this.drag.id;
      this.draftTablePos.update((m) => ({ ...m, [id]: { x: mapX, y: mapY } }));
    } else {
      const key = this.drag.id;
      this.draftObjects.update((list) =>
        list.map((o) => (o.key === key ? { ...o, mapX, mapY } : o)),
      );
    }
  }

  onMapPointerUp(ev: PointerEvent): void {
    if (!this.drag) return;
    this.drag = null;
    this.draggingId.set(null);
    try {
      (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
    } catch {
      // ignore
    }
  }

  inventoryLabel(sectorId: string): string {
    return formatTableInventory(this.tablesOf(sectorId).map((t) => t.seats));
  }

  seatDots(seats: number): number[] {
    return Array.from({ length: seats }, (_, i) => i);
  }

  load(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    if (this.editingSectorId()) return;
    this.loading.set(true);
    this.api.getFloor(shopId).subscribe({
      next: (floor) => {
        const sectors = [...(floor.sectors ?? [])].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'),
        );
        this.sectors.set(sectors);
        this.tables.set(this.onlyWaiterTables(floor.tables ?? []));
        this.mapObjects.set(floor.mapObjects ?? []);
        this.labelDrafts.set({});
        this.nameDrafts.set({});
        const from: Record<string, number> = {};
        const to: Record<string, number> = {};
        for (const s of sectors) {
          from[s.id] = this.bulkFrom()[s.id] ?? 1;
          to[s.id] = this.bulkTo()[s.id] ?? 20;
        }
        this.bulkFrom.set(from);
        this.bulkTo.set(to);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.fail(err, 'No se pudo cargar el salón');
      },
    });
  }

  createSector(): void {
    const shopId = this.shops.selectedShopId();
    const name = this.newSectorName().trim();
    if (!shopId || !name || this.creatingSector()) return;
    this.creatingSector.set(true);
    this.api.createSector(shopId, { name }).subscribe({
      next: (row) => {
        this.sectors.update((list) =>
          [...list, row].sort(
            (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'),
          ),
        );
        this.bulkFrom.update((m) => ({ ...m, [row.id]: 1 }));
        this.bulkTo.update((m) => ({ ...m, [row.id]: 20 }));
        this.newSectorName.set('');
        this.creatingSector.set(false);
      },
      error: (err) => {
        this.creatingSector.set(false);
        this.fail(err, 'No se pudo crear el sector');
      },
    });
  }

  onSectorNameDraft(id: string, value: string): void {
    this.nameDrafts.update((m) => ({ ...m, [id]: value }));
  }

  saveSectorName(sector: SalonSector): void {
    const shopId = this.shops.selectedShopId();
    const next = (this.nameDrafts()[sector.id] ?? sector.name).trim();
    if (!shopId) return;
    if (!next || next === sector.name) {
      this.nameDrafts.update((m) => {
        const copy = { ...m };
        delete copy[sector.id];
        return copy;
      });
      return;
    }
    this.api.updateSector(shopId, sector.id, { name: next }).subscribe({
      next: (row) => {
        this.sectors.update((list) => list.map((s) => (s.id === row.id ? row : s)));
        this.nameDrafts.update((m) => {
          const copy = { ...m };
          delete copy[sector.id];
          return copy;
        });
      },
      error: (err) => {
        this.fail(err, 'No se pudo renombrar el sector');
        this.load();
      },
    });
  }

  async removeSector(sector: SalonSector): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage()) return;
    const count = this.tablesOf(sector.id).length;
    const ok = await this.confirm.confirm(
      'Quitar sector',
      count
        ? `¿Quitar «${sector.name}» y sus ${count} mesa${count === 1 ? '' : 's'}? No cambia Diagrama ni Reglas.`
        : `¿Quitar el sector «${sector.name}»?`,
      { confirmLabel: 'Quitar', confirmColor: 'warn', icon: 'delete' },
    );
    if (!ok) return;
    this.api.removeSector(shopId, sector.id).subscribe({
      next: () => {
        this.tables.update((list) => list.filter((t) => t.sectorId !== sector.id));
        this.mapObjects.update((list) => list.filter((o) => o.sectorId !== sector.id));
        this.sectors.update((list) => list.filter((s) => s.id !== sector.id));
        if (this.editingSectorId() === sector.id) this.cancelEditMap();
      },
      error: (err) => this.fail(err, 'No se pudo quitar el sector'),
    });
  }

  addTable(sectorId: string): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.addingSectorId()) return;
    this.addingSectorId.set(sectorId);
    this.api.createTable(shopId, { sectorId, seats: 2 }).subscribe({
      next: (row) => {
        this.tables.update((list) => [...list, row]);
        this.addingSectorId.set(null);
      },
      error: (err) => {
        this.addingSectorId.set(null);
        this.fail(err, 'No se pudo agregar la mesa');
      },
    });
  }

  setBulkFrom(sectorId: string, value: number): void {
    this.bulkFrom.update((m) => ({ ...m, [sectorId]: value }));
  }

  setBulkTo(sectorId: string, value: number): void {
    this.bulkTo.update((m) => ({ ...m, [sectorId]: value }));
  }

  generateBulk(sectorId: string): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.bulkingSectorId()) return;
    const from = Math.round(Number(this.bulkFrom()[sectorId]));
    const to = Math.round(Number(this.bulkTo()[sectorId]));
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < from) {
      this.snack.open('Indicá un rango válido (de ≤ a)', 'OK', { duration: 2500 });
      return;
    }
    this.bulkingSectorId.set(sectorId);
    this.api.createTablesBulk(shopId, { from, to, sectorId, seats: 2 }).subscribe({
      next: (res) => {
        this.bulkingSectorId.set(null);
        if (res.created?.length) {
          this.tables.update((list) => [...list, ...this.onlyWaiterTables(res.created)]);
        }
        const msg =
          res.skippedCount > 0
            ? `Se crearon ${res.createdCount}. Se omitieron ${res.skippedCount} (ya existían).`
            : `Se crearon ${res.createdCount} mesas.`;
        this.snack.open(msg, 'OK', { duration: 3200 });
      },
      error: (err) => {
        this.bulkingSectorId.set(null);
        this.fail(err, 'No se pudieron generar las mesas');
      },
    });
  }

  setSeats(table: SalonTable, seats: 2 | 3): void {
    if (!this.canManage() || table.seats === seats) return;
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.tables.update((list) => list.map((t) => (t.id === table.id ? { ...t, seats } : t)));
    this.api.updateTable(shopId, table.id, { seats }).subscribe({
      error: (err) => {
        this.fail(err, 'No se pudieron guardar los cubiertos');
        this.load();
      },
    });
  }

  onLabelDraft(id: string, value: string): void {
    this.labelDrafts.update((m) => ({ ...m, [id]: value }));
  }

  saveLabel(table: SalonTable): void {
    const shopId = this.shops.selectedShopId();
    const next = (this.labelDrafts()[table.id] ?? table.label).trim();
    if (!shopId) return;
    if (!next) {
      this.labelDrafts.update((m) => {
        const copy = { ...m };
        delete copy[table.id];
        return copy;
      });
      return;
    }
    if (next === table.label) return;
    this.api.updateTable(shopId, table.id, { label: next }).subscribe({
      next: (row) => {
        this.tables.update((list) => list.map((t) => (t.id === row.id ? row : t)));
        this.labelDrafts.update((m) => {
          const copy = { ...m };
          delete copy[table.id];
          return copy;
        });
      },
      error: (err) => {
        this.fail(err, 'No se pudo guardar el número');
        this.load();
      },
    });
  }

  async removeTable(table: SalonTable): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage()) return;
    const ok = await this.confirm.confirm(
      'Quitar mesa',
      `¿Quitar la mesa ${table.label} de la comanda? Diagrama y Reglas no cambian.`,
      { confirmLabel: 'Quitar', confirmColor: 'warn', icon: 'delete' },
    );
    if (!ok) return;
    this.api.removeTable(shopId, table.id).subscribe({
      next: () => {
        this.tables.update((list) => list.filter((t) => t.id !== table.id));
      },
      error: (err) => this.fail(err, 'No se pudo quitar la mesa'),
    });
  }

  private fail(err: unknown, fallback: string): void {
    const e = err as { error?: { message?: string | string[] }; message?: string };
    const msg = e?.error?.message ?? e?.message;
    const text = Array.isArray(msg) ? msg[0] : msg;
    this.snack.open(String(text || fallback), 'OK', { duration: 3500 });
  }
}
