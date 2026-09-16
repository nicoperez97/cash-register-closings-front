import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export type MenuImportAction = 'load' | 'replace' | 'omit';

export type MenuImportItemSnapshot = {
  id?: string;
  name: string;
  description?: string | null;
  price?: number | null;
  priceLabel?: string | null;
  available?: boolean;
  imageUrl?: string | null;
  removableIngredients?: string[] | string | null;
};

export type MenuImportPreviewRow = {
  key: string;
  sectionName: string;
  parsed: MenuImportItemSnapshot;
  existing: MenuImportItemSnapshot | null;
  action: MenuImportAction;
};

export type MenuImportPreviewDialogData = {
  mode: 'add' | 'replace';
  fileName: string;
  shopName: string;
  engine?: string | null;
  parsedTitle?: string | null;
  parsedNote?: string | null;
  rows: MenuImportPreviewRow[];
};

export type MenuImportPreviewDialogResult = {
  title: string;
  note: string;
  rows: MenuImportPreviewRow[];
};

export function normalizeMenuItemName(raw: string): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function buildMenuImportPreviewRows(
  parsedSections: Array<{ name: string; items: MenuImportItemSnapshot[] }>,
  existingSections: Array<{ name: string; items: MenuImportItemSnapshot[] }> | null,
): MenuImportPreviewRow[] {
  const existingByName = new Map<string, MenuImportItemSnapshot>();
  for (const sec of existingSections ?? []) {
    for (const it of sec.items ?? []) {
      const key = normalizeMenuItemName(it.name);
      if (!key || existingByName.has(key)) continue;
      existingByName.set(key, it);
    }
  }

  const rows: MenuImportPreviewRow[] = [];
  let i = 0;
  for (const sec of parsedSections ?? []) {
    const sectionName = String(sec.name ?? '').trim() || 'General';
    for (const it of sec.items ?? []) {
      const name = String(it.name ?? '').trim();
      if (!name) continue;
      const key = normalizeMenuItemName(name);
      const existing = key ? existingByName.get(key) ?? null : null;
      if (existing && key) existingByName.delete(key);
      rows.push({
        key: `r_${i++}_${key || 'item'}`,
        sectionName,
        parsed: { ...it, name },
        existing,
        action: existing ? 'replace' : 'load',
      });
    }
  }
  return rows;
}

export function ingredientsLabel(value: string[] | string | null | undefined): string {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean).join(', ');
  return String(value ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .join(', ');
}

export function formatMenuPrice(item: MenuImportItemSnapshot): string {
  const label = String(item.priceLabel ?? '').trim();
  if (label) return label;
  if (item.price == null || !Number.isFinite(Number(item.price))) return '—';
  return `$${Number(item.price).toLocaleString('es-AR')}`;
}

function newItemId(): string {
  return `i_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function asEditorIngredients(value: string[] | string | null | undefined): string {
  return ingredientsLabel(value);
}

/** Aplica cargar / reemplazar / omitir sobre la carta actual (si hay) y el parse. */
export function applyMenuImportPreview(
  rows: MenuImportPreviewRow[],
  existingSections: Array<{ name: string; items: MenuImportItemSnapshot[] }> | null,
  mode: 'add' | 'replace',
): Array<{ name: string; items: MenuImportItemSnapshot[] }> {
  if (mode === 'add' || !existingSections?.length) {
    const bySection = new Map<string, MenuImportItemSnapshot[]>();
    for (const row of rows) {
      if (row.action === 'omit') continue;
      const list = bySection.get(row.sectionName) ?? [];
      list.push({
        id: newItemId(),
        name: row.parsed.name,
        description: row.parsed.description ?? '',
        price: row.parsed.price ?? null,
        priceLabel: row.parsed.priceLabel ?? '',
        available: true,
        imageUrl: null,
        removableIngredients: asEditorIngredients(row.parsed.removableIngredients),
      });
      bySection.set(row.sectionName, list);
    }
    return [...bySection.entries()].map(([name, items]) => ({ name, items }));
  }

  const sections = existingSections.map((s) => ({
    name: s.name,
    items: (s.items ?? []).map((it) => ({ ...it })),
  }));

  const findByName = (name: string): { si: number; ii: number } | null => {
    const key = normalizeMenuItemName(name);
    if (!key) return null;
    for (let si = 0; si < sections.length; si++) {
      for (let ii = 0; ii < sections[si].items.length; ii++) {
        if (normalizeMenuItemName(sections[si].items[ii].name) === key) return { si, ii };
      }
    }
    return null;
  };

  const ensureSection = (name: string) => {
    const key = normalizeMenuItemName(name);
    let sec = sections.find((s) => normalizeMenuItemName(s.name) === key);
    if (!sec) {
      sec = { name, items: [] };
      sections.push(sec);
    }
    return sec;
  };

  for (const row of rows) {
    if (row.action === 'omit') continue;

    if (row.action === 'replace' && row.existing) {
      const loc = findByName(row.existing.name) ?? findByName(row.parsed.name);
      if (loc) {
        const prev = sections[loc.si].items[loc.ii];
        sections[loc.si].items[loc.ii] = {
          ...prev,
          name: row.parsed.name,
          description: row.parsed.description ?? prev.description ?? '',
          price: row.parsed.price ?? prev.price ?? null,
          priceLabel: row.parsed.priceLabel ?? prev.priceLabel ?? '',
          removableIngredients: asEditorIngredients(
            row.parsed.removableIngredients ?? prev.removableIngredients,
          ),
        };
        continue;
      }
    }

    const sec = ensureSection(row.sectionName);
    sec.items.push({
      id: newItemId(),
      name: row.parsed.name,
      description: row.parsed.description ?? '',
      price: row.parsed.price ?? null,
      priceLabel: row.parsed.priceLabel ?? '',
      available: true,
      imageUrl: null,
      removableIngredients: asEditorIngredients(row.parsed.removableIngredients),
    });
  }

  return sections.filter((s) => s.items.length > 0 || existingSections.some((e) => e.name === s.name));
}

@Component({
  selector: 'app-menu-import-preview-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>preview</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Vista previa de la carta</strong>
        <span
          >{{ data.shopName }}{{ data.fileName ? ' · ' + data.fileName : ''
          }}{{ data.engine ? ' · ' + data.engine : '' }}</span
        >
      </span>
    </h2>

    <mat-dialog-content>
      <p class="mip__hint">
        Revisá lo que leyó la IA. Por cada ítem elegí
        <strong>Cargar</strong> (alta),
        <strong>Reemplazar</strong> (si ya existe con el mismo nombre) u
        <strong>Omitir</strong>. Los cambios quedan en el editor; guardá la carta después.
      </p>

      <div class="mip__meta">
        <label class="mip__field">
          <span>Nombre de la carta</span>
          <input [(ngModel)]="title" name="menuTitle" autocomplete="off" />
        </label>
        <label class="mip__field">
          <span>Nota</span>
          <input [(ngModel)]="note" name="menuNote" autocomplete="off" />
        </label>
      </div>

      <div class="mip__summary">
        <span>{{ loadCount() }} cargar</span>
        <span>{{ replaceCount() }} reemplazar</span>
        <span>{{ omitCount() }} omitir</span>
      </div>

      <div class="mip__bulk">
        <button type="button" mat-stroked-button (click)="setAllLoad()">
          Todo cargar
        </button>
        @if (data.mode === 'replace') {
          <button type="button" mat-stroked-button (click)="setAllReplaceWherePossible()">
            Reemplazar coincidencias
          </button>
        }
        <button type="button" mat-stroked-button (click)="setAllOmit()">
          Todo omitir
        </button>
      </div>

      @for (row of rows(); track row.key) {
        <article class="mip__row" [class.mip__row--omit]="row.action === 'omit'">
          <div class="mip__row-main">
            <div class="mip__row-copy">
              <span class="mip__section">{{ row.sectionName }}</span>
              <strong>{{ row.parsed.name }}</strong>
              <span class="mip__price">{{ priceOf(row.parsed) }}</span>
              @if (row.parsed.description) {
                <p class="mip__desc">{{ row.parsed.description }}</p>
              }
              @if (ingredientsOf(row.parsed)) {
                <p class="mip__ings">Sin: {{ ingredientsOf(row.parsed) }}</p>
              }
              @if (row.existing) {
                <p class="mip__match">
                  Coincide con «{{ row.existing.name }}»
                  @if (priceOf(row.existing) !== '—') {
                    <span>(ahora {{ priceOf(row.existing) }})</span>
                  }
                </p>
              }
            </div>
            <div class="mip__actions" role="group" [attr.aria-label]="'Acción para ' + row.parsed.name">
              <button
                type="button"
                class="mip__act"
                [class.mip__act--on]="row.action === 'load'"
                (click)="setAction(row.key, 'load')"
              >
                Cargar
              </button>
              <button
                type="button"
                class="mip__act"
                [class.mip__act--on]="row.action === 'replace'"
                [disabled]="!row.existing"
                matTooltip="Solo si ya hay un ítem con el mismo nombre"
                (click)="setAction(row.key, 'replace')"
              >
                Reemplazar
              </button>
              <button
                type="button"
                class="mip__act"
                [class.mip__act--on]="row.action === 'omit'"
                (click)="setAction(row.key, 'omit')"
              >
                Omitir
              </button>
            </div>
          </div>
        </article>
      } @empty {
        <p class="mip__empty">No hay ítems para revisar.</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(null)">Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="applyCount() === 0"
        (click)="confirm()"
      >
        <mat-icon>done_all</mat-icon>
        Aplicar {{ applyCount() }} ítem{{ applyCount() === 1 ? '' : 's' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .mip__hint {
      margin: 0 0 0.85rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
      line-height: 1.45;
    }
    .mip__meta {
      display: grid;
      gap: 0.55rem;
      margin-bottom: 0.85rem;
      @media (min-width: 640px) {
        grid-template-columns: 1fr 1fr;
      }
    }
    .mip__field {
      display: grid;
      gap: 0.25rem;
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--guy-muted, #5f6f76);
      input {
        font: inherit;
        font-size: 0.95rem;
        font-weight: 650;
        color: var(--guy-ink, #1b2a33);
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 10px;
        padding: 0.55rem 0.7rem;
        background: #fff;
      }
    }
    .mip__summary {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem 1rem;
      margin: 0 0 0.65rem;
      font-size: 0.86rem;
      font-weight: 750;
      color: var(--guy-navy, #003366);
    }
    .mip__bulk {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-bottom: 0.85rem;
    }
    .mip__row {
      border: 1px solid var(--guy-border, #e6ebf0);
      border-radius: 12px;
      padding: 0.75rem 0.85rem;
      margin-bottom: 0.55rem;
      background: #fff;
    }
    .mip__row--omit {
      opacity: 0.55;
      background: color-mix(in srgb, var(--guy-muted, #5f6f76) 6%, #fff);
    }
    .mip__row-main {
      display: grid;
      gap: 0.65rem;
      @media (min-width: 720px) {
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
      }
    }
    .mip__row-copy {
      display: grid;
      gap: 0.15rem;
      min-width: 0;
      strong {
        font-size: 1rem;
        color: var(--guy-ink, #1b2a33);
      }
    }
    .mip__section {
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--guy-green, #2e7d32);
    }
    .mip__price {
      font-weight: 750;
      font-variant-numeric: tabular-nums;
      color: var(--guy-navy, #003366);
    }
    .mip__desc,
    .mip__ings,
    .mip__match {
      margin: 0.2rem 0 0;
      font-size: 0.82rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.35;
    }
    .mip__match {
      color: var(--guy-primary, #1d65a0);
      font-weight: 650;
    }
    .mip__actions {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 0.3rem;
    }
    .mip__act {
      appearance: none;
      border: 1px solid var(--guy-border, #d7e0d9);
      background: #fff;
      border-radius: 999px;
      padding: 0.35rem 0.7rem;
      font: inherit;
      font-size: 0.78rem;
      font-weight: 750;
      color: var(--guy-ink, #1b2a33);
      cursor: pointer;
      &:disabled {
        opacity: 0.4;
        cursor: default;
      }
      &--on {
        border-color: transparent;
        background: var(--guy-green, #2e7d32);
        color: #fff;
      }
    }
    .mip__act:nth-child(2).mip__act--on {
      background: var(--guy-primary, #1d65a0);
    }
    .mip__act:nth-child(3).mip__act--on {
      background: var(--guy-muted, #5f6f76);
    }
    .mip__empty {
      margin: 0.75rem 0;
      color: var(--guy-muted, #5f6f76);
    }
  `,
})
export class MenuImportPreviewDialogComponent {
  readonly data = inject<MenuImportPreviewDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<MenuImportPreviewDialogComponent, MenuImportPreviewDialogResult | null>);

  title = String(this.data.parsedTitle ?? '').trim();
  note = String(this.data.parsedNote ?? '').trim();
  readonly rows = signal<MenuImportPreviewRow[]>(
    structuredClone(this.data.rows).map((r) => ({
      ...r,
      action: r.existing ? r.action : r.action === 'replace' ? 'load' : r.action,
    })),
  );

  readonly loadCount = computed(() => this.rows().filter((r) => r.action === 'load').length);
  readonly replaceCount = computed(() => this.rows().filter((r) => r.action === 'replace').length);
  readonly omitCount = computed(() => this.rows().filter((r) => r.action === 'omit').length);
  readonly applyCount = computed(() => this.loadCount() + this.replaceCount());

  priceOf(item: MenuImportItemSnapshot): string {
    return formatMenuPrice(item);
  }

  ingredientsOf(item: MenuImportItemSnapshot): string {
    return ingredientsLabel(item.removableIngredients);
  }

  setAction(key: string, action: MenuImportAction): void {
    this.rows.update((list) =>
      list.map((r) => {
        if (r.key !== key) return r;
        if (action === 'replace' && !r.existing) return { ...r, action: 'load' };
        return { ...r, action };
      }),
    );
  }

  setAllLoad(): void {
    this.rows.update((list) => list.map((r) => ({ ...r, action: 'load' as const })));
  }

  setAllOmit(): void {
    this.rows.update((list) => list.map((r) => ({ ...r, action: 'omit' as const })));
  }

  setAllReplaceWherePossible(): void {
    this.rows.update((list) =>
      list.map((r) => ({
        ...r,
        action: r.existing ? ('replace' as const) : ('load' as const),
      })),
    );
  }

  confirm(): void {
    if (this.applyCount() === 0) return;
    this.ref.close({
      title: this.title.trim(),
      note: this.note.trim(),
      rows: this.rows(),
    });
  }
}
