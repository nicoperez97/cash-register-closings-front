import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export type MenuAssignSectorOption = {
  id: string;
  name: string;
};

export type MenuAssignSectorItem = {
  key: string;
  sectionName: string;
  name: string;
  sectorIds: string[];
};

export type MenuAssignSectorsDialogData = {
  sectors: MenuAssignSectorOption[];
  items: MenuAssignSectorItem[];
  preselectedKeys?: string[];
};

export type MenuAssignSectorsMode = 'replace' | 'add';

export type MenuAssignSectorsDialogResult = {
  mode: MenuAssignSectorsMode;
  sectorIds: string[];
  keys: string[];
};

@Component({
  selector: 'app-menu-assign-sectors-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>kitchen</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Asignar sectores</strong>
        <span>Marcá ítems y elegí uno o más sectores</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="mas__label">Sectores a aplicar</p>
      <div class="mas__sectors" role="group" aria-label="Sectores">
        @for (s of data.sectors; track s.id) {
          <label class="mas__sector">
            <input
              type="checkbox"
              [checked]="pickedSectors().has(s.id)"
              (change)="toggleSector(s.id, $any($event.target).checked)"
            />
            <span>{{ s.name }}</span>
          </label>
        } @empty {
          <p class="mas__empty">No hay sectores definidos.</p>
        }
      </div>

      <div class="mas__mode" role="group" aria-label="Cómo aplicar">
        <button
          type="button"
          class="mas__chip"
          [class.mas__chip--on]="mode() === 'replace'"
          (click)="mode.set('replace')"
        >
          Reemplazar
        </button>
        <button
          type="button"
          class="mas__chip"
          [class.mas__chip--on]="mode() === 'add'"
          (click)="mode.set('add')"
        >
          Sumar a los actuales
        </button>
      </div>
      <p class="mas__hint">
        {{
          mode() === 'replace'
            ? 'Los ítems marcados quedan solo con los sectores elegidos arriba.'
            : 'Se agregan los sectores elegidos sin quitar los que ya tenían.'
        }}
      </p>

      <label class="mas__search">
        <mat-icon>search</mat-icon>
        <input
          type="search"
          [ngModel]="query()"
          (ngModelChange)="query.set($event ?? '')"
          name="assignSectorQuery"
          placeholder="Buscar ítem o sección…"
          autocomplete="off"
        />
      </label>

      <div class="mas__bulk">
        <button type="button" mat-stroked-button (click)="selectFiltered(true)">
          Marcar filtrados
        </button>
        <button type="button" mat-stroked-button (click)="selectFiltered(false)">
          Desmarcar
        </button>
        <span class="mas__summary">{{ selectedCount() }} seleccionado(s)</span>
      </div>

      @for (group of grouped(); track group.sectionName) {
        <article class="mas__section">
          <header class="mas__section-head">
            <button
              type="button"
              class="mas__section-toggle"
              (click)="toggleSection(group.sectionName)"
            >
              <mat-icon>{{ sectionOpen(group.sectionName) ? 'expand_more' : 'chevron_right' }}</mat-icon>
              <strong>{{ group.sectionName }}</strong>
              <span>{{ sectionSelected(group) }}/{{ group.items.length }}</span>
            </button>
            <div class="mas__section-links">
              <button type="button" class="mas__link" (click)="selectSection(group, true)">
                Todos
              </button>
              <button type="button" class="mas__link" (click)="selectSection(group, false)">
                Ninguno
              </button>
            </div>
          </header>
          @if (sectionOpen(group.sectionName)) {
            @for (it of group.items; track it.key) {
              <label class="mas__row">
                <input
                  type="checkbox"
                  [checked]="selected().has(it.key)"
                  (change)="toggleKey(it.key, $any($event.target).checked)"
                />
                <span class="mas__row-name">{{ it.name || 'Sin nombre' }}</span>
                <span class="mas__row-sectors">{{ sectorLabel(it) }}</span>
              </label>
            }
          }
        </article>
      } @empty {
        <p class="mas__empty">No hay ítems para asignar.</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(null)">Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="!canApply()"
        (click)="apply()"
      >
        Aplicar ({{ selectedCount() }})
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .mas__label {
      margin: 0 0 0.35rem;
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--guy-muted, #5f6f76);
    }
    .mas__sectors {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem 0.85rem;
      margin: 0 0 0.75rem;
      padding: 0.55rem 0.65rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 10px;
      background: #fff;
    }
    .mas__sector {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      margin: 0;
      cursor: pointer;
      font-size: 0.9rem;
      color: var(--guy-ink, #1b2a33);
    }
    .mas__mode {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0 0 0.35rem;
    }
    .mas__chip {
      appearance: none;
      border: 1px solid var(--guy-border, #d7e0d9);
      background: #fff;
      color: var(--guy-navy, #003366);
      border-radius: 999px;
      padding: 0.4rem 0.9rem;
      font: inherit;
      font-size: 0.88rem;
      font-weight: 650;
      cursor: pointer;
      line-height: 1.25;
    }
    .mas__chip--on {
      background: var(--guy-green, #2e7d32);
      border-color: var(--guy-green, #2e7d32);
      color: #fff;
    }
    .mas__hint {
      margin: 0 0 0.75rem;
      font-size: 0.78rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.35;
    }
    .mas__search {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 10px;
      padding: 0.2rem 0.65rem;
      background: #fff;
      margin: 0 0 0.65rem;
    }
    .mas__search mat-icon {
      color: var(--guy-muted, #5f6f76);
      font-size: 1.15rem;
      width: 1.15rem;
      height: 1.15rem;
      flex-shrink: 0;
    }
    .mas__search input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: 0;
      font: inherit;
      padding: 0.5rem 0;
      background: transparent;
    }
    .mas__bulk {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.45rem;
      margin: 0 0 0.85rem;
    }
    .mas__summary {
      font-size: 0.85rem;
      font-weight: 650;
      color: var(--guy-navy, #003366);
      margin-left: auto;
    }
    .mas__section {
      border: 1px solid var(--guy-border, #e6ebf0);
      border-radius: 12px;
      background: #fff;
      margin: 0 0 0.55rem;
    }
    .mas__section-head {
      display: grid;
      gap: 0.15rem;
      padding: 0.55rem 0.65rem 0.35rem;
      background: #f6f8f6;
      border-radius: 12px 12px 0 0;
    }
    .mas__section-toggle {
      appearance: none;
      border: 0;
      background: transparent;
      display: flex;
      align-items: center;
      gap: 0.35rem;
      width: 100%;
      padding: 0.15rem 0;
      font: inherit;
      color: var(--guy-navy, #003366);
      cursor: pointer;
      text-align: left;
      min-height: 2rem;
    }
    .mas__section-toggle mat-icon {
      flex-shrink: 0;
    }
    .mas__section-toggle strong {
      flex: 1;
      min-width: 0;
      font-size: 0.95rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mas__section-toggle span {
      flex-shrink: 0;
      font-size: 0.8rem;
      color: var(--guy-muted, #5f6f76);
    }
    .mas__section-links {
      display: flex;
      gap: 0.75rem;
      padding: 0 0 0.25rem 1.85rem;
    }
    .mas__link {
      appearance: none;
      border: 0;
      background: none;
      color: var(--guy-green, #2e7d32);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      padding: 0;
    }
    .mas__row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 0.55rem;
      align-items: center;
      margin: 0;
      padding: 0.55rem 0.75rem;
      border-top: 1px solid var(--guy-border, #e6ebf0);
      cursor: pointer;
      min-height: 2.5rem;
      box-sizing: border-box;
    }
    .mas__row-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--guy-ink, #1b2a33);
      font-size: 0.92rem;
    }
    .mas__row-sectors {
      font-size: 0.78rem;
      color: var(--guy-muted, #5f6f76);
      white-space: nowrap;
      max-width: 12rem;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mas__empty {
      margin: 0.35rem 0 0;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }
  `,
})
export class MenuAssignSectorsDialogComponent {
  readonly data = inject<MenuAssignSectorsDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(
    MatDialogRef<MenuAssignSectorsDialogComponent, MenuAssignSectorsDialogResult | null>,
  );

  readonly mode = signal<MenuAssignSectorsMode>('replace');
  readonly query = signal('');
  private readonly picked = signal<Set<string>>(
    new Set(this.data.sectors.length === 1 ? [this.data.sectors[0].id] : []),
  );
  private readonly selectedKeys = signal<Set<string>>(new Set());
  private readonly openSections = signal<Set<string>>(
    new Set([this.data.items[0]?.sectionName || 'Sin sección']),
  );

  private readonly sectorNameById = new Map<string, string>();

  readonly selected = computed(() => this.selectedKeys());
  readonly pickedSectors = computed(() => this.picked());
  readonly selectedCount = computed(() => this.selectedKeys().size);

  constructor() {
    for (const s of this.data.sectors ?? []) {
      const id = String(s.id ?? '').trim();
      const name = String(s.name ?? '').trim();
      if (id && name) this.sectorNameById.set(id, name);
    }
  }

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.data.items;
    return this.data.items.filter((it) => {
      const hay = `${it.sectionName} ${it.name}`.toLowerCase();
      return hay.includes(q);
    });
  });

  readonly grouped = computed(() => {
    const map = new Map<string, MenuAssignSectorItem[]>();
    for (const it of this.filtered()) {
      const sec = it.sectionName || 'Sin sección';
      const list = map.get(sec) ?? [];
      list.push(it);
      map.set(sec, list);
    }
    return [...map.entries()].map(([sectionName, items]) => ({ sectionName, items }));
  });

  sectorLabel(it: MenuAssignSectorItem): string {
    const names: string[] = [];
    for (const raw of it.sectorIds ?? []) {
      const id = String(raw ?? '').trim();
      if (!id) continue;
      const name =
        this.sectorNameById.get(id) ||
        this.data.sectors.find((s) => String(s.id).trim() === id)?.name?.trim() ||
        '';
      if (name) names.push(name);
    }
    return names.length ? names.join(', ') : 'Sin sector';
  }

  toggleSector(id: string, on: boolean): void {
    this.picked.update((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  sectionOpen(name: string): boolean {
    if (this.query().trim()) return true;
    return this.openSections().has(name);
  }

  toggleSection(name: string): void {
    this.openSections.update((set) => {
      const next = new Set(set);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  sectionSelected(group: { items: MenuAssignSectorItem[] }): number {
    const sel = this.selectedKeys();
    return group.items.filter((i) => sel.has(i.key)).length;
  }

  toggleKey(key: string, on: boolean): void {
    this.selectedKeys.update((set) => {
      const next = new Set(set);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  selectSection(group: { items: MenuAssignSectorItem[] }, on: boolean): void {
    this.selectedKeys.update((set) => {
      const next = new Set(set);
      for (const it of group.items) {
        if (on) next.add(it.key);
        else next.delete(it.key);
      }
      return next;
    });
  }

  selectFiltered(on: boolean): void {
    this.selectedKeys.update((set) => {
      const next = new Set(set);
      for (const it of this.filtered()) {
        if (on) next.add(it.key);
        else next.delete(it.key);
      }
      return next;
    });
  }

  canApply(): boolean {
    return this.picked().size > 0 && this.selectedCount() > 0;
  }

  apply(): void {
    if (!this.canApply()) return;
    this.ref.close({
      mode: this.mode(),
      sectorIds: [...this.picked()],
      keys: [...this.selectedKeys()],
    });
  }
}
