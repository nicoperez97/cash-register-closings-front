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
import { SalonSector, SalonTable } from './salon.models';

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
  readonly addingSectorId = signal<string | null>(null);
  readonly creatingSector = signal(false);
  readonly bulkingSectorId = signal<string | null>(null);
  readonly newSectorName = signal('');
  readonly labelDrafts = signal<Record<string, string>>({});
  readonly nameDrafts = signal<Record<string, string>>({});
  readonly bulkFrom = signal<Record<string, number>>({});
  readonly bulkTo = signal<Record<string, number>>({});

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

  tablesOf(sectorId: string): SalonTable[] {
    return this.tables()
      .filter((t) => t.forWaiter !== false && t.sectorId === sectorId)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'es'));
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
    this.loading.set(true);
    this.api.getFloor(shopId).subscribe({
      next: (floor) => {
        const sectors = [...(floor.sectors ?? [])].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'),
        );
        this.sectors.set(sectors);
        this.tables.set(floor.tables ?? []);
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
        this.sectors.update((list) => list.filter((s) => s.id !== sector.id));
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
          this.tables.update((list) => [...list, ...res.created]);
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
