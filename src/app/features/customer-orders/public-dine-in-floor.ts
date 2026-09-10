import { Component, HostBinding, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { applyStatusBar, resetStatusBar } from '../../core/pwa/status-bar';
import {
  DineInApiService,
  DineInFloor,
  DineInFloorTable,
  DineInMapObject,
} from './dine-in-api.service';
import { DineInSessionService } from './dine-in-session.service';
import { apiErrorMessage, onAccentColor, orderingLogoUrl } from './ordering-ui.util';

@Component({
  selector: 'app-public-dine-in-floor',
  imports: [FormsModule, RouterLink, MatSnackBarModule],
  templateUrl: './public-dine-in-floor.html',
  styleUrl: './public-dine-in-floor.scss',
})
export class PublicDineInFloorComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(DineInApiService);
  private readonly dineIn = inject(DineInSessionService);
  private readonly snack = inject(MatSnackBar);
  private readonly title = inject(Title);

  readonly slug = computed(() => String(this.route.snapshot.paramMap.get('slug') ?? '').trim());
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly floor = signal<DineInFloor | null>(null);
  readonly sectorFilter = signal<string | 'ALL'>('ALL');

  readonly coversSheet = signal<DineInFloorTable | null>(null);
  readonly coversDraft = signal(2);

  readonly shop = computed(() => this.floor()?.shop ?? null);
  readonly accent = computed(() => this.shop()?.accentColor?.trim() || '#2e7d32');
  readonly onAccent = computed(() => onAccentColor(this.accent()));
  readonly logoUrl = computed(() => orderingLogoUrl(this.shop()?.logoUrl, this.shop()?.id));
  readonly activeSession = computed(() => this.dineIn.active());

  readonly sectors = computed(() => this.floor()?.sectors ?? []);

  readonly visibleTables = computed(() => {
    const tables = this.floor()?.tables ?? [];
    const f = this.sectorFilter();
    if (f === 'ALL') return tables;
    return tables.filter((t) => t.sectorId === f);
  });

  readonly visibleObjects = computed(() => {
    const objects = this.floor()?.mapObjects ?? [];
    const f = this.sectorFilter();
    if (f === 'ALL') return objects;
    return objects.filter((o) => o.sectorId === f);
  });

  readonly hasMapLayout = computed(() =>
    this.visibleTables().some((t) => t.mapX != null && t.mapY != null),
  );

  @HostBinding('style.--accent')
  get hostAccent(): string {
    return this.accent();
  }

  @HostBinding('style.--on-accent')
  get hostOnAccent(): string {
    return this.onAccent();
  }

  ngOnInit(): void {
    applyStatusBar('#eef1ee', 'light');
    const slug = this.slug();
    this.dineIn.bindSlug(slug);
    this.load();
  }

  ngOnDestroy(): void {
    resetStatusBar();
  }

  load(): void {
    const slug = this.slug();
    if (!slug) {
      this.loading.set(false);
      this.error.set('Local no encontrado');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.api.getFloor(slug).subscribe({
      next: (floor) => {
        this.floor.set(floor);
        this.loading.set(false);
        this.title.setTitle(`Mesas · ${floor.shop?.name ?? slug}`);
        const token = this.dineIn.token();
        if (token) {
          this.api.resume(slug, token).subscribe({
            error: () => this.dineIn.clear(),
          });
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'No pudimos cargar el mapa de mesas.'));
      },
    });
  }

  tableLeft(t: DineInFloorTable): number {
    return t.mapX == null ? 50 : Number(t.mapX);
  }

  tableTop(t: DineInFloorTable): number {
    return t.mapY == null ? 50 : Number(t.mapY);
  }

  objectLeft(o: DineInMapObject): number {
    return Number(o.mapX);
  }

  objectTop(o: DineInMapObject): number {
    return Number(o.mapY);
  }

  objectIcon(kind: string): string {
    if (kind === 'barra') return 'Bar';
    if (kind === 'arbol') return 'Árb';
    return 'Obj';
  }

  selectTable(table: DineInFloorTable): void {
    if (this.busy()) return;
    const active = this.activeSession();
    if (active?.tableId === table.id) {
      void this.router.navigate(['/pedir', this.slug(), 'menu']);
      return;
    }
    if (table.occupied) {
      this.snack.open('Esa mesa ya está ocupada', 'OK', { duration: 2500 });
      return;
    }
    this.coversDraft.set(Math.max(1, Math.min(30, table.seats || 2)));
    this.coversSheet.set(table);
  }

  closeCovers(): void {
    this.coversSheet.set(null);
  }

  bumpCovers(delta: number): void {
    this.coversDraft.set(Math.max(1, Math.min(30, this.coversDraft() + delta)));
  }

  confirmCovers(): void {
    const table = this.coversSheet();
    const covers = Math.round(Number(this.coversDraft()));
    const slug = this.slug();
    if (!table || !slug) return;
    if (!Number.isFinite(covers) || covers < 1 || covers > 30) {
      this.snack.open('Indicá entre 1 y 30 comensales', 'OK', { duration: 2500 });
      return;
    }
    this.coversSheet.set(null);
    this.busy.set(true);
    this.api.openSession(slug, table.id, covers).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.dineIn.save({
          token: res.token,
          sessionId: res.session.id,
          tableId: table.id,
          tableLabel: table.label,
          covers,
        });
        void this.router.navigate(['/pedir', slug, 'menu']);
      },
      error: (err) => {
        this.busy.set(false);
        this.snack.open(apiErrorMessage(err, 'No se pudo abrir la mesa'), 'OK', {
          duration: 3500,
        });
        this.load();
      },
    });
  }

  continueSession(): void {
    void this.router.navigate(['/pedir', this.slug(), 'menu']);
  }

  leaveSession(): void {
    const slug = this.slug();
    const token = this.dineIn.token();
    if (!slug || !token) {
      this.dineIn.clear();
      return;
    }
    this.busy.set(true);
    this.api.discard(slug, token).subscribe({
      next: () => {
        this.busy.set(false);
        this.dineIn.clear();
        this.snack.open('Mesa liberada', 'OK', { duration: 2000 });
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        // Si ya hay envíos, solo limpiamos el token local y dejamos la mesa ocupada.
        this.dineIn.clear();
        this.snack.open(
          apiErrorMessage(err, 'No se pudo liberar la mesa. Pedile al mozo que la cierre.'),
          'OK',
          { duration: 4000 },
        );
        this.load();
      },
    });
  }

  onLogoError(): void {
    const f = this.floor();
    if (!f) return;
    this.floor.set({ ...f, shop: { ...f.shop, logoUrl: null } });
  }
}
