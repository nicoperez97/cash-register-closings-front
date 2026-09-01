import { Component, computed, inject, input, output, signal, effect } from '@angular/core';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  ShopToolbarConfig,
  TOOLBAR_ADDABLE_MODULE_DEFS,
  TOOLBAR_QUICK_ACTION_DEFS,
  normalizeToolbarConfig,
  type ToolbarCustomAction,
  type ToolbarQuickActionDef,
} from '../../core/layout/toolbar-config';
import { AuthService } from '../../core/auth/auth.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import {
  canAccessCustomRoute,
  canAccessToolbarAction,
  type ShopRouteFeatures,
} from '../../core/auth/route-access';

type DraftRow =
  | (ToolbarQuickActionDef & { hidden: boolean; custom: false })
  | (ToolbarCustomAction & { hidden: boolean; custom: true; audience: 'staff' });

@Component({
  selector: 'app-shop-toolbar-editor',
  imports: [
    DragDropModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSlideToggleModule,
  ],
  template: `
    <div class="tb-ed">
      <p class="text-muted small mb-2">
        Arrastrá para ordenar y apagá los que no quieras en la barra. Podés sumar atajos de otros
        módulos a los que tengas acceso en este local.
      </p>

      <div class="tb-ed__list" role="list" cdkDropList (cdkDropListDropped)="onDrop($event)">
        @for (row of rows(); track row.id; let i = $index) {
          <div
            class="tb-ed__row"
            role="listitem"
            cdkDrag
            [class.tb-ed__row--off]="row.hidden"
          >
            <div class="tb-ed__drag-placeholder" *cdkDragPlaceholder></div>
            <button
              type="button"
              class="tb-ed__handle"
              cdkDragHandle
              [attr.aria-label]="'Arrastrar ' + row.label"
            >
              <mat-icon>drag_indicator</mat-icon>
            </button>
            <mat-icon class="tb-ed__icon" aria-hidden="true">{{ row.icon }}</mat-icon>
            <div class="tb-ed__meta">
              <strong>{{ row.label }}</strong>
              <span>{{ row.custom ? 'Atajo agregado' : audienceLabel(row.audience) }}</span>
            </div>
            <div class="tb-ed__actions">
              @if (row.custom) {
                <button
                  mat-icon-button
                  type="button"
                  aria-label="Quitar atajo"
                  (click)="removeCustom(row.id)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              } @else {
                <mat-slide-toggle
                  [checked]="!row.hidden"
                  (change)="toggleHidden(i, !$event.checked)"
                  [attr.aria-label]="row.hidden ? 'Mostrar ' + row.label : 'Ocultar ' + row.label"
                />
              }
            </div>
          </div>
        }
      </div>

      <div class="tb-ed__footer">
        @if (addable().length) {
          <button mat-stroked-button type="button" [matMenuTriggerFor]="addMenu">
            <mat-icon>add</mat-icon>
            Agregar atajo
          </button>
          <mat-menu #addMenu="matMenu" class="tb-ed-add-menu">
            @for (opt of addable(); track opt.id) {
              <button mat-menu-item type="button" (click)="addCustom(opt)">
                <mat-icon>{{ opt.icon }}</mat-icon>
                <span>{{ opt.label }}</span>
              </button>
            }
          </mat-menu>
        }
        <button mat-stroked-button type="button" (click)="reset()">
          <mat-icon>restart_alt</mat-icon>
          Restaurar defaults
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .tb-ed__list {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }
      .tb-ed__row {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.55rem 0.7rem 0.55rem 0.35rem;
        border-radius: 12px;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: var(--guy-card, #fff);
        box-sizing: border-box;
      }
      .tb-ed__row--off {
        opacity: 0.55;
      }
      .tb-ed__row.cdk-drag-preview {
        box-shadow: 0 8px 24px rgba(27, 42, 51, 0.14);
        opacity: 0.98;
      }
      .tb-ed__row.cdk-drag-animating {
        transition: transform 180ms ease;
      }
      .tb-ed__list.cdk-drop-list-dragging .tb-ed__row:not(.cdk-drag-placeholder) {
        transition: transform 180ms ease;
      }
      .tb-ed__drag-placeholder {
        min-height: 52px;
        border-radius: 12px;
        border: 1px dashed color-mix(in srgb, var(--guy-primary, #1d65a0) 35%, var(--guy-border, #d7e0d9));
        background: color-mix(in srgb, var(--guy-primary, #1d65a0) 6%, transparent);
      }
      .tb-ed__handle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--guy-muted, #5f6f76);
        cursor: grab;
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
      }
      .tb-ed__handle:active {
        cursor: grabbing;
      }
      .tb-ed__handle mat-icon {
        font-size: 22px;
        width: 22px;
        height: 22px;
      }
      .tb-ed__icon {
        color: var(--guy-primary, #1d65a0);
        flex-shrink: 0;
      }
      .tb-ed__meta {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
      }
      .tb-ed__meta strong {
        font-size: 0.92rem;
        color: var(--guy-navy, #003366);
      }
      .tb-ed__meta span {
        font-size: 0.75rem;
        color: var(--guy-muted, #5f6f76);
      }
      .tb-ed__actions {
        display: flex;
        align-items: center;
        gap: 0.15rem;
      }
      .tb-ed__footer {
        margin-top: 0.85rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
    `,
  ],
})
export class ShopToolbarEditorComponent {
  readonly value = input<ShopToolbarConfig | null>(null);
  /** En perfil: solo módulos accesibles. En admin del local: catálogo completo. */
  readonly filterByUserPermissions = input(true);
  readonly valueChange = output<ShopToolbarConfig | null>();

  private readonly auth = inject(AuthService);
  private readonly shops = inject(ShopContextService);

  private readonly draft = signal<ShopToolbarConfig | null>(null);
  /** Evita que el effect externo pise un emit recién hecho. */
  private lastEmittedJson: string | null = null;

  private routeFeatures(): ShopRouteFeatures {
    const shop = this.shops.selectedShop();
    return {
      reservationsEnabled: shop?.reservationsEnabled,
      waitingListEnabled: shop?.waitingListEnabled,
      tipsEnabled: shop?.tipsEnabled,
      settlementsEnabled: shop?.settlementsEnabled,
    };
  }

  private canShowBuiltin(id: string): boolean {
    if (!this.filterByUserPermissions()) return true;
    const user = this.auth.currentUser();
    const shopId = this.shops.selectedShopId();
    return canAccessToolbarAction(id, user, shopId, {
      features: this.routeFeatures(),
      respectNavHidden: false,
    });
  }

  private canShowCustom(route: string): boolean {
    if (!this.filterByUserPermissions()) return true;
    const user = this.auth.currentUser();
    const shopId = this.shops.selectedShopId();
    return canAccessCustomRoute(route, user, shopId, {
      features: this.routeFeatures(),
      respectNavHidden: false,
    });
  }

  readonly rows = computed((): DraftRow[] => {
    const cfg = this.draft() ?? {};
    const hidden = new Set(cfg.hidden ?? []);
    const custom = (cfg.custom ?? []).filter((c) => this.canShowCustom(c.route));
    const allowedBuiltins = TOOLBAR_QUICK_ACTION_DEFS.filter((d) => this.canShowBuiltin(d.id));
    const byBuiltin = new Map(allowedBuiltins.map((d) => [d.id, d]));
    const byCustom = new Map(custom.map((c) => [c.id, c]));
    const allIds = [
      ...(cfg.order?.length
        ? [
            ...cfg.order.filter((id) => byBuiltin.has(id) || byCustom.has(id)),
            ...allowedBuiltins.map((d) => d.id).filter((id) => !cfg.order!.includes(id)),
            ...custom.map((c) => c.id).filter((id) => !cfg.order!.includes(id)),
          ]
        : [...allowedBuiltins.map((d) => d.id), ...custom.map((c) => c.id)]),
    ];
    const seen = new Set<string>();
    const orderedIds = allIds.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    return orderedIds.map((id) => {
      const builtin = byBuiltin.get(id);
      if (builtin) return { ...builtin, hidden: hidden.has(id), custom: false as const };
      const c = byCustom.get(id)!;
      return { ...c, hidden: hidden.has(id), custom: true as const, audience: 'staff' as const };
    });
  });

  readonly addable = computed(() => {
    const used = new Set([
      ...TOOLBAR_QUICK_ACTION_DEFS.map((d) => d.id),
      ...(this.draft()?.custom ?? []).map((c) => c.id),
    ]);
    return TOOLBAR_ADDABLE_MODULE_DEFS.filter(
      (m) => !used.has(m.id) && this.canShowCustom(m.route),
    );
  });

  constructor() {
    effect(() => {
      const normalized = normalizeToolbarConfig(this.value());
      const json = JSON.stringify(normalized);
      if (json === this.lastEmittedJson) return;
      this.lastEmittedJson = json;
      this.draft.set(normalized);
    });
  }

  audienceLabel(audience: ToolbarQuickActionDef['audience']): string {
    if (audience === 'cashier') return 'Cajero';
    if (audience === 'producer') return 'Productor';
    return 'Equipo / admin';
  }

  onDrop(event: CdkDragDrop<DraftRow[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const list = this.rows().map((r) => r.id);
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.commit({ ...(this.draft() ?? {}), order: list });
  }

  toggleHidden(index: number, hidden: boolean): void {
    const row = this.rows()[index];
    if (!row || row.custom) return;
    const set = new Set(this.draft()?.hidden ?? []);
    if (hidden) set.add(row.id);
    else set.delete(row.id);
    this.commit({
      ...(this.draft() ?? {}),
      order: this.rows().map((r) => r.id),
      hidden: [...set],
    });
  }

  addCustom(opt: ToolbarCustomAction): void {
    const custom = [...(this.draft()?.custom ?? [])];
    if (custom.some((c) => c.id === opt.id)) return;
    custom.push({ ...opt });
    this.commit({
      ...(this.draft() ?? {}),
      custom,
      order: [...this.rows().map((r) => r.id), opt.id],
      hidden: (this.draft()?.hidden ?? []).filter((id) => id !== opt.id),
    });
  }

  removeCustom(id: string): void {
    const custom = (this.draft()?.custom ?? []).filter((c) => c.id !== id);
    this.commit({
      ...(this.draft() ?? {}),
      custom,
      order: this.rows()
        .map((r) => r.id)
        .filter((x) => x !== id),
      hidden: (this.draft()?.hidden ?? []).filter((x) => x !== id),
    });
  }

  reset(): void {
    const allowed = TOOLBAR_QUICK_ACTION_DEFS.filter((d) => this.canShowBuiltin(d.id));
    this.commit({
      order: allowed.map((d) => d.id),
      hidden: [],
      custom: [],
    });
  }

  private commit(next: ShopToolbarConfig | null): void {
    const normalized = normalizeToolbarConfig(next);
    this.lastEmittedJson = JSON.stringify(normalized);
    this.draft.set(normalized);
    this.valueChange.emit(normalized);
  }
}
