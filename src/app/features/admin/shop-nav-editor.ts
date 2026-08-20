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
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
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
  accountTransfers: 'Movimientos entre cuentas',
  reservations: 'Reservas',
  waitingList: 'Lista de espera',
  diagrama: 'Diagrama',
  salonRules: 'Reglas',
  stockFood: 'Alimentos',
  beverageStock: 'Bebidas',
  shortages: 'Faltantes',
  attendance: 'Asistencia',
  productionAttendance: 'Presentismo producción',
  reimbursements: 'Reintegros',
  paymentsSuppliers: 'A proveedores',
  paymentsServices: 'A servicios',
  paymentsEmployees: 'A empleados',
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
  adminShop: 'Local',
  adminMessages: 'Mensajes',
  adminMenu: 'Carta',
  adminQr: 'QR',
  adminInstrucciones: 'Instrucciones',
  adminUsers: 'Usuarios',
  adminAccounts: 'Cuentas',
  adminConcepts: 'Conceptos',
  adminSalesSystems: 'Sistemas',
  adminPosProducts: 'Platos y rubros',
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
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  template: `
    <div class="nav-ed">
      <div class="nav-ed__toolbar">
        <p class="text-muted small mb-0">
          Creá grupos, renombrá con el lápiz, mové módulos u ocultálos. Inicio siempre queda arriba.
          Los toggles de módulos y los permisos siguen valiendo.
        </p>
        <div class="nav-ed__toolbar-actions">
          <button mat-stroked-button type="button" (click)="addGroup()">
            <mat-icon>create_new_folder</mat-icon>
            Nuevo grupo
          </button>
          <button mat-stroked-button type="button" (click)="reset()">
            <mat-icon>restart_alt</mat-icon>
            Restablecer menú
          </button>
        </div>
      </div>

      @for (g of groups(); track g.id; let gi = $index) {
        <div
          class="nav-ed__group"
          [class.nav-ed__group--collapsed]="isGroupCollapsed(g.id)"
        >
          <div class="nav-ed__group-head">
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
                  class="nav-ed__edit-btn"
                  aria-label="Renombrar grupo"
                  (click)="startGroupEdit(g.id, g.label)"
                >
                  <mat-icon>edit</mat-icon>
                </button>
              </div>
            }

            <span class="nav-ed__moves">
              <button
                mat-icon-button
                type="button"
                aria-label="Subir grupo"
                [disabled]="gi === 0"
                (click)="moveGroup(gi, -1)"
              >
                <mat-icon>arrow_upward</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                aria-label="Bajar grupo"
                [disabled]="gi === groups().length - 1"
                (click)="moveGroup(gi, 1)"
              >
                <mat-icon>arrow_downward</mat-icon>
              </button>
              @if (canDeleteGroup(g.id)) {
                <button
                  mat-icon-button
                  type="button"
                  aria-label="Eliminar grupo"
                  (click)="deleteGroup(g.id)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              }
            </span>
          </div>

          <div class="nav-ed__group-body">
            <div class="nav-ed__group-body-inner">
              @for (it of itemsInGroup(g.id); track it.id; let ii = $index) {
                <div class="nav-ed__row" [class.nav-ed__row--hidden]="it.hidden">
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
                    <div class="nav-ed__label-wrap">
                      <span class="nav-ed__label">{{ it.label }}</span>
                      <button
                        mat-icon-button
                        type="button"
                        class="nav-ed__edit-btn"
                        aria-label="Renombrar ítem"
                        (click)="startItemEdit(it.id, it.label)"
                      >
                        <mat-icon>edit</mat-icon>
                      </button>
                    </div>
                  }
                  <mat-form-field
                    appearance="outline"
                    subscriptSizing="dynamic"
                    class="nav-ed__group-sel"
                  >
                    <mat-label>Grupo</mat-label>
                    <mat-select
                      [ngModel]="it.groupId"
                      (ngModelChange)="moveItemToGroup(it.id, $event)"
                      [ngModelOptions]="{ standalone: true }"
                    >
                      @for (og of groups(); track og.id) {
                        <mat-option [value]="og.id">{{ og.label }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <mat-slide-toggle
                    [checked]="!it.hidden"
                    (change)="setHidden(it.id, !$event.checked)"
                    >Visible</mat-slide-toggle
                  >
                  <span class="nav-ed__moves">
                    <button
                      mat-icon-button
                      type="button"
                      aria-label="Subir ítem"
                      [disabled]="ii === 0"
                      (click)="moveItem(g.id, ii, -1)"
                    >
                      <mat-icon>arrow_upward</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      type="button"
                      aria-label="Bajar ítem"
                      [disabled]="ii === itemsInGroup(g.id).length - 1"
                      (click)="moveItem(g.id, ii, 1)"
                    >
                      <mat-icon>arrow_downward</mat-icon>
                    </button>
                  </span>
                </div>
              } @empty {
                <p class="text-muted small nav-ed__empty">Sin ítems en este grupo</p>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .nav-ed {
      display: grid;
      gap: 0.85rem;
    }
    .nav-ed__toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: flex-start;
      justify-content: space-between;
    }
    .nav-ed__toolbar-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }
    .nav-ed__group {
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 12px;
      padding: 0.65rem 0.75rem;
      background: color-mix(in srgb, var(--guy-card, #fff) 96%, var(--guy-surface, #f3f6f4));
    }
    .nav-ed__group-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.35rem;
      transition: margin-bottom 0.22s ease;
    }
    .nav-ed__group-toggle {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.15rem;
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
      flex: 1 1 12rem;
      min-width: 0;
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
    }
    .nav-ed__label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.98rem;
      color: var(--guy-navy, #003366);
    }
    .nav-ed__edit-btn {
      flex-shrink: 0;
      width: 2rem;
      height: 2rem;
      padding: 0;
      --mdc-icon-button-state-layer-size: 2rem;
      color: var(--guy-muted, #666);
    }
    .nav-ed__edit-btn mat-icon {
      font-size: 1.1rem;
      width: 1.1rem;
      height: 1.1rem;
    }
    .nav-ed__rename {
      flex: 1 1 12rem;
      min-width: 0;
    }
    .nav-ed__row {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(7rem, 0.9fr) auto auto;
      gap: 0.45rem 0.65rem;
      align-items: center;
      padding: 0.35rem 0;
      border-top: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 70%, transparent);
    }
    .nav-ed__row--hidden {
      opacity: 0.72;
    }
    .nav-ed__group-sel {
      width: 100%;
    }
    .nav-ed__moves {
      display: inline-flex;
      flex-shrink: 0;
    }
    .nav-ed__empty {
      margin: 0.25rem 0 0;
    }
    @media (max-width: 720px) {
      .nav-ed__row {
        grid-template-columns: 1fr;
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
