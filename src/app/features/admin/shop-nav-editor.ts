import {
  Component,
  computed,
  input,
  output,
  signal,
  effect,
  ElementRef,
  viewChild,
} from '@angular/core';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  NAV_GROUP_DEFS,
  NAV_ITEM_DEFS,
  ShopNavConfig,
} from '../../core/layout/nav-config';

const DEFAULT_ITEM_LABELS: Record<string, string> = {
  closings: 'Cierres',
  cashWithdrawals: 'A Retirar',
  settlements: 'Rendiciones',
  tips: 'Propinas',
  serviceRules: 'Normas de servicio',
  expenses: 'Gastos',
  incomes: 'Ingresos',
  accountTransfers: 'Movimientos entre cuentas',
  transactions: 'Transacciones',
  partnerSplits: 'División de socios',
  splits: 'Divisiones',
  reservations: 'Reservas',
  waitingList: 'Lista de espera',
  diagrama: 'Diagrama',
  salonRules: 'Reglas',
  salonHours: 'Horarios',
  stockFood: 'Alimentos',
  beverageStock: 'Bebidas',
  shortages: 'Faltantes',
  orders: 'Pedidos',
  attendance: 'Asistencia',
  productionAttendance: 'Presentismo producción',
  reimbursements: 'Reintegros',
  paymentsSuppliers: 'A proveedores',
  paymentsServices: 'A servicios',
  paymentsEmployees: 'A empleados',
  paymentsPartners: 'A socios',
  suppliers: 'Proveedores',
  services: 'Servicios',
  reports: 'Cierres (reporte)',
  reportsConcepts: 'Conceptos',
  reportsProducts: 'Ventas POS',
  reportsStats: 'Estadísticas',
  employees: 'Empleados',
  candidates: 'CVs',
  payroll: 'Liquidaciones',
  commissions: 'Comisiones',
  adminShops: 'Locales',
  adminShop: 'Configuración del local',
  adminMessages: 'Mensajes',
  adminMenu: 'Carta',
  adminQr: 'QR',
  adminInstrucciones: 'Instrucciones',
  adminUsers: 'Usuarios',
  adminUserActivity: 'Actividad',
  adminAccounts: 'Cuentas',
  adminConcepts: 'Conceptos',
  adminSalesSystems: 'Sistemas',
  adminPosProducts: 'Platos y rubros',
  vacations: 'Vacaciones',
  myProduction: 'Mis horas',
};

type EditorItem = {
  id: string;
  label: string;
  groupId: string;
  hidden: boolean;
};

@Component({
  selector: 'app-shop-nav-editor',
  imports: [
    DragDropModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  template: `
    <div class="nav-ed">
      <div class="nav-ed__toolbar">
        <p class="nav-ed__help">
          Arrastrá grupos e ítems para ordenar. Usá ⋮ para renombrar o mover de grupo. Inicio queda
          arriba.
        </p>
        <div class="nav-ed__toolbar-actions">
          <button mat-stroked-button type="button" (click)="addGroup()">
            <mat-icon>create_new_folder</mat-icon>
            Nuevo grupo
          </button>
          <button mat-stroked-button type="button" (click)="reset()">
            <mat-icon>restart_alt</mat-icon>
            Restablecer
          </button>
        </div>
      </div>

      <div class="nav-ed__groups" cdkDropList (cdkDropListDropped)="onGroupDrop($event)">
        @for (g of groups(); track g.id; let gi = $index) {
          <div
            class="nav-ed__group"
            cdkDrag
            [cdkDragData]="g.id"
            [class.nav-ed__group--collapsed]="isGroupCollapsed(g.id)"
          >
            <div class="nav-ed__group-drag-ph" *cdkDragPlaceholder></div>
            <div class="nav-ed__group-head">
              <button
                type="button"
                class="nav-ed__handle"
                cdkDragHandle
                [attr.aria-label]="'Arrastrar grupo ' + g.label"
              >
                <mat-icon>drag_indicator</mat-icon>
              </button>
              <button
                type="button"
                class="nav-ed__group-toggle"
                (click)="toggleGroupCollapsed(g.id)"
                [attr.aria-expanded]="!isGroupCollapsed(g.id)"
                [attr.aria-label]="isGroupCollapsed(g.id) ? 'Expandir grupo' : 'Contraer grupo'"
              >
                <mat-icon class="nav-ed__group-chevron" aria-hidden="true">expand_more</mat-icon>
              </button>

              @if (editingGroupId() === g.id) {
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="nav-ed__rename">
                  <mat-label>Nombre del grupo</mat-label>
                  <input
                    #groupEditInput
                    matInput
                    [ngModel]="editDraft()"
                    (ngModelChange)="editDraft.set($event)"
                    [ngModelOptions]="{ standalone: true }"
                    (keydown.enter)="$event.preventDefault(); commitGroupEdit(g.id)"
                    (keydown.escape)="$event.preventDefault(); cancelEdit()"
                    (blur)="commitGroupEdit(g.id)"
                  />
                </mat-form-field>
              } @else {
                <div class="nav-ed__label-wrap">
                  <strong class="nav-ed__label">{{ g.label }}</strong>
                  <button
                    mat-icon-button
                    type="button"
                    class="nav-ed__icon-btn"
                    aria-label="Renombrar grupo"
                    (click)="startGroupEdit(g.id, g.label)"
                  >
                    <mat-icon>edit</mat-icon>
                  </button>
                </div>
              }

              <span class="nav-ed__moves">
                @if (canDeleteGroup(g.id)) {
                  <button
                    mat-icon-button
                    type="button"
                    class="nav-ed__icon-btn"
                    aria-label="Eliminar grupo"
                    (click)="deleteGroup(g.id)"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                }
              </span>
            </div>

            <div class="nav-ed__group-body">
              <div
                class="nav-ed__group-body-inner"
                cdkDropList
                [id]="dropListId(g.id)"
                [cdkDropListData]="g.id"
                [cdkDropListConnectedTo]="connectedDropLists()"
                (cdkDropListDropped)="onItemDrop($event)"
              >
                @for (it of itemsInGroup(g.id); track it.id; let ii = $index) {
                  <div
                    class="nav-ed__row"
                    cdkDrag
                    [cdkDragData]="it.id"
                    [class.nav-ed__row--hidden]="it.hidden"
                  >
                    <div class="nav-ed__row-drag-ph" *cdkDragPlaceholder></div>
                    <button
                      type="button"
                      class="nav-ed__handle nav-ed__handle--row"
                      cdkDragHandle
                      [attr.aria-label]="'Arrastrar ' + it.label"
                    >
                      <mat-icon>drag_indicator</mat-icon>
                    </button>
                    @if (editingItemId() === it.id) {
                      <mat-form-field
                        appearance="outline"
                        subscriptSizing="dynamic"
                        class="nav-ed__rename"
                      >
                        <mat-label>Nombre</mat-label>
                        <input
                          #itemEditInput
                          matInput
                          [ngModel]="editDraft()"
                          (ngModelChange)="editDraft.set($event)"
                          [ngModelOptions]="{ standalone: true }"
                          (keydown.enter)="$event.preventDefault(); commitItemEdit(it.id)"
                          (keydown.escape)="$event.preventDefault(); cancelEdit()"
                          (blur)="commitItemEdit(it.id)"
                        />
                      </mat-form-field>
                    } @else {
                      <span class="nav-ed__item-label">{{ it.label }}</span>
                    }

                    <div class="nav-ed__row-actions">
                      <mat-slide-toggle
                        class="nav-ed__visible"
                        [checked]="!it.hidden"
                        [attr.aria-label]="it.hidden ? 'Mostrar ' + it.label : 'Ocultar ' + it.label"
                        matTooltip="Visible en el menú"
                        (change)="setHidden(it.id, !$event.checked)"
                      />
                      <button
                        mat-icon-button
                        type="button"
                        class="nav-ed__icon-btn"
                        [matMenuTriggerFor]="itemMenu"
                        aria-label="Más acciones"
                      >
                        <mat-icon>more_vert</mat-icon>
                      </button>
                      <mat-menu #itemMenu="matMenu" xPosition="before">
                        <button mat-menu-item type="button" (click)="startItemEdit(it.id, it.label)">
                          <mat-icon>edit</mat-icon>
                          <span>Renombrar</span>
                        </button>
                        <button mat-menu-item type="button" [matMenuTriggerFor]="moveMenu">
                          <mat-icon>drive_file_move</mat-icon>
                          <span>Mover a…</span>
                        </button>
                        <button mat-menu-item type="button" (click)="setHidden(it.id, !it.hidden)">
                          <mat-icon>{{ it.hidden ? 'visibility' : 'visibility_off' }}</mat-icon>
                          <span>{{ it.hidden ? 'Mostrar' : 'Ocultar' }}</span>
                        </button>
                      </mat-menu>
                      <mat-menu #moveMenu="matMenu" xPosition="before">
                        @for (og of groups(); track og.id) {
                          <button
                            mat-menu-item
                            type="button"
                            [disabled]="og.id === it.groupId"
                            (click)="moveItemToGroup(it.id, og.id)"
                          >
                            {{ og.label }}
                          </button>
                        }
                      </mat-menu>
                    </div>
                  </div>
                } @empty {
                  <p class="nav-ed__empty">Sin ítems en este grupo</p>
                }
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .nav-ed {
      display: grid;
      gap: 0.75rem;
    }
    .nav-ed__toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem 0.85rem;
      align-items: center;
      justify-content: space-between;
    }
    .nav-ed__help {
      margin: 0;
      flex: 1 1 14rem;
      font-size: 0.86rem;
      color: var(--guy-muted, #666);
      line-height: 1.4;
    }
    .nav-ed__toolbar-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }
    .nav-ed__group {
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 12px;
      padding: 0.5rem 0.65rem;
      background: color-mix(in srgb, var(--guy-card, #fff) 96%, var(--guy-surface, #f3f6f4));
    }
    .nav-ed__group-head {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      margin-bottom: 0.25rem;
      transition: margin-bottom 0.22s ease;
    }
    .nav-ed__group-toggle {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      padding: 0;
      border: 0;
      background: transparent;
      cursor: pointer;
      color: var(--guy-muted, #666);
    }
    .nav-ed__group-chevron {
      transition: transform 0.22s ease;
    }
    .nav-ed__group--collapsed .nav-ed__group-head {
      margin-bottom: 0;
    }
    .nav-ed__group--collapsed .nav-ed__group-chevron {
      transform: rotate(-90deg);
    }
    .nav-ed__group-body {
      display: grid;
      grid-template-rows: 1fr;
      transition: grid-template-rows 0.28s ease;
    }
    .nav-ed__group-body-inner {
      overflow: hidden;
      min-height: 0;
      opacity: 1;
      transform: translateY(0);
      transition:
        opacity 0.22s ease,
        transform 0.22s ease;
    }
    .nav-ed__group--collapsed .nav-ed__group-body {
      grid-template-rows: 0fr;
    }
    .nav-ed__group--collapsed .nav-ed__group-body-inner {
      opacity: 0;
      transform: translateY(-0.25rem);
      pointer-events: none;
    }
    .nav-ed__label-wrap {
      flex: 1 1 auto;
      min-width: 0;
      display: inline-flex;
      align-items: center;
      gap: 0.1rem;
    }
    .nav-ed__label,
    .nav-ed__item-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.95rem;
      color: var(--guy-navy, #003366);
    }
    .nav-ed__item-label {
      flex: 1 1 auto;
      font-weight: 500;
      padding: 0.15rem 0;
    }
    .nav-ed__icon-btn {
      flex-shrink: 0;
      width: 2.5rem;
      height: 2.5rem;
      padding: 0;
      --mdc-icon-button-state-layer-size: 2.5rem;
      color: var(--guy-muted, #666);
    }
    .nav-ed__icon-btn mat-icon {
      font-size: 1.15rem;
      width: 1.15rem;
      height: 1.15rem;
    }
    .nav-ed__rename {
      flex: 1 1 10rem;
      min-width: 0;
    }
    .nav-ed__row {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.2rem 0;
      border-top: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 70%, transparent);
      min-height: 2.75rem;
      transition:
        opacity 0.2s ease,
        background 0.2s ease,
        transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .nav-ed__row:active {
      background: color-mix(in srgb, var(--guy-accent, #2e7d32) 6%, transparent);
    }
    .nav-ed__row--hidden {
      opacity: 0.55;
    }
    .nav-ed__row-actions {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      margin-left: auto;
      gap: 0.05rem;
    }
    .nav-ed__visible {
      margin: 0 0.25rem;
    }
    .nav-ed__moves {
      display: inline-flex;
      flex-shrink: 0;
      margin-left: auto;
    }
    .nav-ed__handle {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: var(--guy-muted, #666);
      cursor: grab;
      -webkit-tap-highlight-color: transparent;
    }
    .nav-ed__handle:active {
      cursor: grabbing;
    }
    .nav-ed__handle mat-icon {
      font-size: 1.25rem;
      width: 1.25rem;
      height: 1.25rem;
    }
    .nav-ed__handle--row {
      width: 2rem;
      height: 2rem;
    }
    .nav-ed__groups {
      display: grid;
      gap: 0.75rem;
    }
    .nav-ed__group.cdk-drag-preview {
      box-shadow: 0 10px 28px rgba(27, 42, 51, 0.16);
    }
    .nav-ed__group-drag-ph,
    .nav-ed__row-drag-ph {
      min-height: 3rem;
      border-radius: 10px;
      border: 1px dashed color-mix(in srgb, var(--guy-primary, #1d65a0) 35%, var(--guy-border, #d7e0d9));
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 6%, transparent);
    }
    .nav-ed__row.cdk-drag-preview {
      box-shadow: 0 6px 18px rgba(27, 42, 51, 0.12);
      background: var(--guy-card, #fff);
      border-radius: 8px;
    }
    .nav-ed__empty {
      margin: 0.35rem 0 0.15rem;
      font-size: 0.85rem;
      color: var(--guy-muted, #666);
    }
    @media (max-width: 720px) {
      .nav-ed__row {
        flex-wrap: nowrap;
        align-items: center;
        padding: 0.15rem 0;
        gap: 0.2rem;
        min-height: 2.5rem;
      }
      .nav-ed__item-label {
        flex: 1 1 auto;
        min-width: 0;
        font-size: 0.9rem;
      }
      .nav-ed__rename {
        flex: 1 1 auto;
        min-width: 0;
      }
      .nav-ed__row-actions {
        width: auto;
        margin-left: 0;
        flex-shrink: 0;
      }
      .nav-ed__handle,
      .nav-ed__handle--row {
        width: 2rem;
        height: 2rem;
      }
      .nav-ed__icon-btn {
        width: 2.25rem;
        height: 2.25rem;
        --mdc-icon-button-state-layer-size: 2.25rem;
      }
      .nav-ed__visible {
        margin: 0 0.1rem;
        transform: scale(0.92);
        transform-origin: center right;
      }
      .nav-ed__group-head {
        flex-wrap: nowrap;
        gap: 0.15rem;
      }
      .nav-ed__moves {
        width: auto;
        margin-left: auto;
        flex-shrink: 0;
      }
      .nav-ed__label-wrap {
        flex: 1 1 auto;
        min-width: 0;
      }
    }
  `,
})
export class ShopNavEditorComponent {
  readonly value = input<ShopNavConfig | null>(null);
  readonly valueChange = output<ShopNavConfig | null>();

  private readonly draft = signal<ShopNavConfig>(this.defaultConfig());
  private readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());
  readonly editingGroupId = signal<string | null>(null);
  readonly editingItemId = signal<string | null>(null);
  readonly editDraft = signal('');

  private readonly groupEditInput = viewChild<ElementRef<HTMLInputElement>>('groupEditInput');
  private readonly itemEditInput = viewChild<ElementRef<HTMLInputElement>>('itemEditInput');

  readonly groups = computed(() => {
    const cfg = this.draft();
    const ids =
      cfg.groups?.map((g) => g.id).filter(Boolean) ?? NAV_GROUP_DEFS.map((g) => g.id);
    const seen = new Set<string>();
    const ordered: Array<{ id: string; label: string }> = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const def = NAV_GROUP_DEFS.find((g) => g.id === id);
      const label =
        cfg.groups?.find((g) => g.id === id)?.label?.trim() || def?.label || id;
      ordered.push({ id, label });
    }
    for (const def of NAV_GROUP_DEFS) {
      if (seen.has(def.id)) continue;
      ordered.push({ id: def.id, label: def.label });
    }
    return ordered;
  });

  readonly connectedDropLists = computed(() => this.groups().map((g) => this.dropListId(g.id)));

  dropListId(groupId: string): string {
    return `nav-ed-items-${groupId}`;
  }

  constructor() {
    effect(() => {
      const v = this.value();
      this.draft.set(v ? structuredClone(v) : this.defaultConfig());
    });

    effect(() => {
      if (!this.editingGroupId()) return;
      queueMicrotask(() => this.groupEditInput()?.nativeElement?.focus());
    });

    effect(() => {
      if (!this.editingItemId()) return;
      queueMicrotask(() => this.itemEditInput()?.nativeElement?.focus());
    });
  }

  isGroupCollapsed(groupId: string): boolean {
    return this.collapsedGroups().has(groupId);
  }

  toggleGroupCollapsed(groupId: string): void {
    this.cancelEdit();
    this.collapsedGroups.update((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  startGroupEdit(groupId: string, label: string): void {
    this.editingItemId.set(null);
    this.editingGroupId.set(groupId);
    this.editDraft.set(label);
  }

  startItemEdit(itemId: string, label: string): void {
    this.editingGroupId.set(null);
    this.editingItemId.set(itemId);
    this.editDraft.set(label);
  }

  cancelEdit(): void {
    this.editingGroupId.set(null);
    this.editingItemId.set(null);
    this.editDraft.set('');
  }

  commitGroupEdit(groupId: string): void {
    if (this.editingGroupId() !== groupId) return;
    const next = this.editDraft();
    this.cancelEdit();
    this.renameGroup(groupId, next);
  }

  commitItemEdit(itemId: string): void {
    if (this.editingItemId() !== itemId) return;
    const next = this.editDraft();
    this.cancelEdit();
    this.renameItem(itemId, next);
  }

  itemsInGroup(groupId: string): EditorItem[] {
    const cfg = this.draft();
    const hidden = new Set(cfg.hidden ?? []);
    const itemGroup = cfg.itemGroup ?? {};
    const itemLabels = cfg.itemLabels ?? {};
    const order = cfg.itemOrder?.[groupId] ?? [];
    const items = NAV_ITEM_DEFS.filter((d) => d.defaultGroup)
      .map((d) => {
        const gid = itemGroup[d.id] ?? d.defaultGroup!;
        return {
          id: d.id,
          label: itemLabels[d.id]?.trim() || DEFAULT_ITEM_LABELS[d.id] || d.id,
          groupId: gid,
          hidden: hidden.has(d.id),
        };
      })
      .filter((it) => it.groupId === groupId);
    const rank = new Map(order.map((id, i) => [id, i]));
    items.sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id)! : 1000;
      const rb = rank.has(b.id) ? rank.get(b.id)! : 1000;
      if (ra !== rb) return ra - rb;
      return a.label.localeCompare(b.label, 'es');
    });
    return items;
  }

  addGroup(): void {
    const id = `custom_${Date.now().toString(36)}`;
    const label = `Grupo nuevo`;
    const list = [...this.groups(), { id, label }];
    this.commit({
      ...this.draft(),
      groups: list.map((g) => ({ id: g.id, label: g.label })),
      itemOrder: { ...(this.draft().itemOrder ?? {}), [id]: [] },
    });
    this.startGroupEdit(id, label);
  }

  canDeleteGroup(groupId: string): boolean {
    if (!groupId.startsWith('custom_')) return false;
    return this.itemsInGroup(groupId).length === 0;
  }

  deleteGroup(groupId: string): void {
    if (!this.canDeleteGroup(groupId)) return;
    const cfg = this.draft();
    const groups = (cfg.groups ?? this.groups()).filter((g) => g.id !== groupId);
    const itemOrder = { ...(cfg.itemOrder ?? {}) };
    delete itemOrder[groupId];
    this.cancelEdit();
    this.commit({ ...cfg, groups, itemOrder });
  }

  renameGroup(groupId: string, label: string): void {
    const list = this.groups().map((g) =>
      g.id === groupId ? { id: g.id, label: label.trim() || g.label } : { id: g.id, label: g.label },
    );
    this.commit({ ...this.draft(), groups: list });
  }

  renameItem(itemId: string, label: string): void {
    const trimmed = label.trim();
    const itemLabels = { ...(this.draft().itemLabels ?? {}) };
    const fallback = DEFAULT_ITEM_LABELS[itemId] || itemId;
    if (!trimmed || trimmed === fallback) delete itemLabels[itemId];
    else itemLabels[itemId] = trimmed;
    this.commit({ ...this.draft(), itemLabels });
  }

  moveGroup(index: number, delta: number): void {
    const list = [...this.groups()];
    const j = index + delta;
    if (j < 0 || j >= list.length) return;
    const tmp = list[index]!;
    list[index] = list[j]!;
    list[j] = tmp;
    this.commit({
      ...this.draft(),
      groups: list.map((g) => ({ id: g.id, label: g.label })),
    });
  }

  onGroupDrop(event: CdkDragDrop<string>): void {
    if (event.previousIndex === event.currentIndex) return;
    const list = this.groups().map((g) => ({ id: g.id, label: g.label }));
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    this.commit({ ...this.draft(), groups: list });
  }

  onItemDrop(event: CdkDragDrop<string>): void {
    const fromGroup = String(event.previousContainer.data ?? '');
    const toGroup = String(event.container.data ?? '');
    if (!fromGroup || !toGroup) return;

    if (event.previousContainer === event.container) {
      if (event.previousIndex === event.currentIndex) return;
      const items = this.itemsInGroup(fromGroup).map((i) => i.id);
      moveItemInArray(items, event.previousIndex, event.currentIndex);
      this.commit({
        ...this.draft(),
        itemOrder: { ...(this.draft().itemOrder ?? {}), [fromGroup]: items },
      });
      return;
    }

    const fromItems = this.itemsInGroup(fromGroup).map((i) => i.id);
    const toItems = this.itemsInGroup(toGroup).map((i) => i.id);
    transferArrayItem(fromItems, toItems, event.previousIndex, event.currentIndex);
    const itemId = toItems[event.currentIndex];
    if (!itemId) return;
    const itemGroup = { ...(this.draft().itemGroup ?? {}), [itemId]: toGroup };
    this.commit({
      ...this.draft(),
      itemGroup,
      itemOrder: {
        ...(this.draft().itemOrder ?? {}),
        [fromGroup]: fromItems,
        [toGroup]: toItems,
      },
    });
  }

  moveItem(groupId: string, index: number, delta: number): void {
    const items = this.itemsInGroup(groupId).map((i) => i.id);
    const j = index + delta;
    if (j < 0 || j >= items.length) return;
    const tmp = items[index]!;
    items[index] = items[j]!;
    items[j] = tmp;
    const itemOrder = { ...(this.draft().itemOrder ?? {}), [groupId]: items };
    this.commit({ ...this.draft(), itemOrder });
  }

  moveItemToGroup(itemId: string, groupId: string): void {
    const cfg = this.draft();
    const itemGroup = { ...(cfg.itemGroup ?? {}), [itemId]: groupId };
    const itemOrder = { ...(cfg.itemOrder ?? {}) };
    for (const key of Object.keys(itemOrder)) {
      itemOrder[key] = (itemOrder[key] ?? []).filter((id) => id !== itemId);
    }
    itemOrder[groupId] = [...(itemOrder[groupId] ?? []), itemId];
    this.commit({ ...cfg, itemGroup, itemOrder });
  }

  setHidden(itemId: string, hidden: boolean): void {
    const set = new Set(this.draft().hidden ?? []);
    if (hidden) set.add(itemId);
    else set.delete(itemId);
    this.commit({ ...this.draft(), hidden: [...set] });
  }

  reset(): void {
    this.cancelEdit();
    this.commit(null);
  }

  private defaultConfig(): ShopNavConfig {
    const itemGroup: Record<string, string> = {};
    const itemOrder: Record<string, string[]> = {};
    for (const def of NAV_GROUP_DEFS) itemOrder[def.id] = [];
    for (const def of NAV_ITEM_DEFS) {
      if (!def.defaultGroup) continue;
      itemGroup[def.id] = def.defaultGroup;
      itemOrder[def.defaultGroup] = [...(itemOrder[def.defaultGroup] ?? []), def.id];
    }
    return {
      groups: NAV_GROUP_DEFS.map((g) => ({ id: g.id, label: g.label })),
      itemGroup,
      itemOrder,
      hidden: [],
      itemLabels: {},
    };
  }

  private commit(next: ShopNavConfig | null): void {
    if (next === null) {
      this.draft.set(this.defaultConfig());
      this.valueChange.emit(null);
      return;
    }
    this.draft.set(next);
    this.valueChange.emit(next);
  }
}
