import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { environment } from '../../../environments/environment';
import { usePageRefresh } from '../../core/page-refresh.service';
import { takeInputFile, safeUploadFileName } from '../../shared/utils/input-file';
import { copyText } from '../../shared/utils/share-text';
import { LoadingStateComponent } from '../../shared/components/loading-state';
import { downloadIframePdf } from '../../shared/pdf/html-pdf';
import { pdfFileSlug } from '../../shared/pdf/pdf-text';

export type ShopMenuItem = {
  name: string;
  description?: string | null;
  price?: number | null;
  priceLabel?: string | null;
};

export type ShopMenuSection = {
  name: string;
  items: ShopMenuItem[];
};

export type ShopMenu = {
  id: string;
  slug: string;
  title?: string | null;
  note?: string | null;
  sourceFile?: string | null;
  sourceFileName?: string | null;
  sourceMime?: string | null;
  sections: ShopMenuSection[];
};

type MenuAdminResponse = {
  enabled: boolean;
  slug: string;
  menus: ShopMenu[];
};

function newMenuId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function uniqueSlug(base: string, menus: ShopMenu[], exceptId?: string): string {
  const root = slugify(base) || 'carta';
  const used = new Set(menus.filter((m) => m.id !== exceptId).map((m) => m.slug));
  let slug = root;
  let n = 2;
  while (used.has(slug)) slug = `${root}-${n++}`.slice(0, 40);
  return slug;
}

function emptySections(): ShopMenuSection[] {
  return [];
}

function cloneMenu(menu: ShopMenu): ShopMenu {
  return {
    id: menu.id || newMenuId(),
    slug: menu.slug || 'carta',
    title: menu.title ?? '',
    note: menu.note ?? '',
    sourceFile: menu.sourceFile ?? null,
    sourceFileName: menu.sourceFileName ?? null,
    sourceMime: menu.sourceMime ?? null,
    sections: (menu.sections ?? []).map((s) => ({
      name: s.name ?? '',
      items: (s.items ?? []).map((it) => ({
        name: it.name ?? '',
        description: it.description ?? '',
        price: it.price ?? null,
        priceLabel: it.priceLabel ?? '',
      })),
    })),
  };
}

function toPrice(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

@Component({
  selector: 'app-admin-menu',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    PageHeaderComponent,
    LoadingStateComponent,
  ],
  template: `
    <app-page-header
      title="Cartas"
      [subtitle]="shops.selectedShop()?.name ?? 'Menús públicos del local'"
    />

    @if (!shopId()) {
      <div class="panel-card">Seleccioná un local en el menú lateral.</div>
    } @else if (loading()) {
      <app-loading-state
        [loading]="true"
        title="Cargando…"
        message="Obteniendo las cartas del local"
      />
    } @else {
      <div class="menu-admin">
        <section class="panel-card">
          <h2>Página pública</h2>
          @if (!enabled()) {
            <p class="menu-admin__warn">
              La carta pública está apagada. Activala en Administración → Local → Módulos públicos.
            </p>
          }
          @if (shopSlug()) {
            <div class="menu-admin__links">
              <a class="menu-admin__btn" [href]="hubUrl()" target="_blank" rel="noopener">
                <mat-icon>open_in_new</mat-icon>
                Ver cartas
              </a>
              <button type="button" class="menu-admin__btn menu-admin__btn--ghost" (click)="copyUrl(hubUrl(), 'Link de las cartas copiado')">
                <mat-icon>content_copy</mat-icon>
                Copiar link
              </button>
            </div>
            <p class="menu-admin__url">{{ hubUrl() }}</p>
          }
        </section>

        <section class="panel-card">
          <div class="menu-admin__tabs-head">
            <h2>Cartas del local</h2>
            <div class="menu-admin__tab-actions">
              <input
                #fileInput
                type="file"
                hidden
                accept=".pdf,.txt,image/*,.jpg,.jpeg,.png,.webp"
                (change)="onFilePicked(fileInput, 'add')"
              />
              <input
                #replaceInput
                type="file"
                hidden
                accept=".pdf,.txt,image/*,.jpg,.jpeg,.png,.webp"
                (change)="onFilePicked(replaceInput, 'replace')"
              />
              <input
                #sourceInput
                type="file"
                hidden
                accept=".pdf,image/*,.jpg,.jpeg,.png,.webp"
                (change)="onSourcePicked(sourceInput)"
              />
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="parsing() || menus().length >= 8"
                (click)="fileInput.click()"
              >
                <mat-icon>upload_file</mat-icon>
                {{ parsing() ? 'Leyendo…' : 'Agregar carta' }}
              </button>
              <button mat-stroked-button type="button" [disabled]="menus().length >= 8" (click)="addBlank()">
                <mat-icon>note_add</mat-icon>
                En blanco
              </button>
            </div>
          </div>
          <p class="menu-admin__hint">
            <strong>Agregar / Reemplazar</strong> lee el PDF para armar ítems.
            <strong>Cargar carta física</strong> sube el archivo que el cliente ve en la web (sin cambiar los ítems).
            <strong>PDF estilo web</strong> genera un PDF con el look de la página pública (tipografía y layout), no el archivo cargado.
          </p>
          @if (menus().length) {
            <div class="menu-admin__tabs" role="tablist">
              @for (m of menus(); track m.id) {
                <button
                  type="button"
                  class="menu-admin__tab"
                  [class.menu-admin__tab--on]="m.id === activeId()"
                  (click)="selectMenu(m.id)"
                >
                  {{ m.title || 'Carta' }}
                </button>
              }
            </div>
          } @else {
            <p class="menu-admin__hint">Todavía no hay cartas. Subí un archivo o creá una en blanco.</p>
          }
          @if (parseNote()) {
            <p class="menu-admin__parse">{{ parseNote() }}</p>
          }
          @if (geminiWarning()) {
            <p class="menu-admin__warn">{{ geminiWarning() }}</p>
          }
          @if (rawText()) {
            <details class="menu-admin__raw">
              <summary>Texto leído del archivo</summary>
              <pre>{{ rawText() }}</pre>
            </details>
          }
        </section>

        @if (activeId()) {
          <section class="panel-card">
            <div class="menu-admin__editor-head">
              <h2>Editar {{ title || 'carta' }}</h2>
              <div class="menu-admin__links">
                @if (activePublicUrl()) {
                  <a class="menu-admin__btn menu-admin__btn--ghost" [href]="activePublicUrl()" target="_blank" rel="noopener">
                    <mat-icon>open_in_new</mat-icon>
                    Esta carta
                  </a>
                  <button type="button" class="menu-admin__btn menu-admin__btn--ghost" (click)="copyUrl(activePublicUrl(), 'Link de esta carta copiado')">
                    <mat-icon>content_copy</mat-icon>
                    Copiar
                  </button>
                }
                <button
                  type="button"
                  class="menu-admin__btn menu-admin__btn--ghost"
                  (click)="downloadStyledPdf()"
                  title="PDF generado con el contenido de la carta"
                >
                  <mat-icon>print</mat-icon>
                  PDF estilo web
                </button>
                <button mat-stroked-button type="button" [disabled]="parsing()" (click)="replaceInput.click()">
                  <mat-icon>sync</mat-icon>
                  Reemplazar contenido
                </button>
                <button
                  mat-stroked-button
                  type="button"
                  [disabled]="uploadingSource() || parsing()"
                  (click)="sourceInput.click()"
                >
                  <mat-icon>picture_as_pdf</mat-icon>
                  {{ uploadingSource() ? 'Subiendo…' : 'Cargar carta física' }}
                </button>
                <button mat-stroked-button type="button" (click)="removeActive()">
                  <mat-icon>delete</mat-icon>
                  Quitar
                </button>
              </div>
            </div>
            <div class="menu-admin__meta">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Nombre</mat-label>
                <input matInput [(ngModel)]="title" placeholder="Carta" (ngModelChange)="onTitleChange()" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Link</mat-label>
                <input matInput [(ngModel)]="menuSlug" placeholder="vinos" />
                <span matPrefix>/m/{{ shopSlug() }}/&nbsp;</span>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Nota al pie</mat-label>
                <textarea
                  matInput
                  rows="2"
                  [(ngModel)]="note"
                  placeholder="Precios sujetos a cambio, IVA incluido…"
                ></textarea>
              </mat-form-field>
            </div>
            @if (sourceFileName) {
              <div class="menu-admin__source">
                <p>
                  Carta física lista: <strong>{{ sourceFileName }}</strong>
                  — el cliente la ve con “Carta física” en la página pública.
                </p>
                <button
                  mat-stroked-button
                  type="button"
                  [disabled]="uploadingSource()"
                  (click)="clearSource()"
                >
                  <mat-icon>link_off</mat-icon>
                  Quitar archivo físico
                </button>
              </div>
            } @else {
              <p class="menu-admin__hint">
                Todavía no hay PDF/foto para la vista pública. Usá <strong>Cargar carta física</strong> (no hace falta reemplazar el contenido).
              </p>
            }

            @for (section of sections(); track $index; let si = $index) {
              <article class="menu-section">
                <div class="menu-section__head">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="menu-section__name">
                    <mat-label>Sección</mat-label>
                    <input matInput [(ngModel)]="section.name" placeholder="Entradas" />
                  </mat-form-field>
                  <button
                    mat-icon-button
                    type="button"
                    aria-label="Quitar sección"
                    (click)="removeSection(si)"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
                @for (item of section.items; track $index; let ii = $index) {
                  <div class="menu-item">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Ítem</mat-label>
                      <input matInput [(ngModel)]="item.name" />
                    </mat-form-field>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Descripción</mat-label>
                      <input matInput [(ngModel)]="item.description" />
                    </mat-form-field>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="menu-item__price">
                      <mat-label>Precio</mat-label>
                      <input matInput type="number" min="0" step="1" [(ngModel)]="item.price" />
                    </mat-form-field>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Precio (texto)</mat-label>
                      <input matInput [(ngModel)]="item.priceLabel" placeholder="$ 12.500" />
                    </mat-form-field>
                    <button
                      mat-icon-button
                      type="button"
                      aria-label="Quitar ítem"
                      (click)="removeItem(si, ii)"
                    >
                      <mat-icon>close</mat-icon>
                    </button>
                  </div>
                }
                <button mat-stroked-button type="button" (click)="addItem(si)">
                  <mat-icon>add</mat-icon>
                  Ítem
                </button>
              </article>
            }

            <button mat-stroked-button type="button" (click)="addSection()">
              <mat-icon>playlist_add</mat-icon>
              Sección
            </button>
          </section>
        }

        <div class="menu-admin__save">
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="saving()"
            (click)="save()"
          >
            <mat-icon>save</mat-icon>
            {{ saving() ? 'Guardando…' : 'Guardar cartas' }}
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .menu-admin {
      display: grid;
      gap: 1rem;
    }
    .menu-admin h2 {
      margin: 0 0 0.75rem;
      font-size: 1rem;
      color: var(--guy-navy, #003366);
    }
    .menu-admin__hint,
    .menu-admin__warn,
    .menu-admin__parse,
    .menu-admin__url,
    .menu-admin__source {
      margin: 0 0 0.85rem;
      font-size: 0.9rem;
      color: var(--guy-muted, #5f6f76);
    }
    .menu-admin__source {
      margin: 0 0 0.85rem;
      padding: 0.65rem 0.85rem;
      border-radius: 12px;
      background: color-mix(in srgb, var(--guy-green, #2e7d32) 8%, #fff);
      border: 1px solid color-mix(in srgb, var(--guy-green, #2e7d32) 22%, #d7e0d9);
      color: var(--guy-navy, #003366);
      display: grid;
      gap: 0.55rem;
      justify-items: start;
    }
    .menu-admin__source p {
      margin: 0;
      font-size: 0.9rem;
    }
    .menu-admin__warn {
      color: #b45309;
    }
    .menu-admin__tabs-head,
    .menu-admin__editor-head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .menu-admin__tab-actions,
    .menu-admin__links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .menu-admin__tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0.35rem 0 0.85rem;
    }
    .menu-admin__tab {
      border: 1px solid var(--guy-border, #d7e0d9);
      background: #fff;
      color: var(--guy-navy, #003366);
      border-radius: 999px;
      padding: 0.45rem 0.9rem;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
    }
    .menu-admin__tab--on {
      background: var(--guy-green, #2e7d32);
      border-color: var(--guy-green, #2e7d32);
      color: #fff;
    }
    .menu-admin__btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.45rem 0.85rem;
      border-radius: 999px;
      border: 1px solid var(--guy-border, #d7e0d9);
      background: var(--guy-green, #2e7d32);
      color: #fff;
      text-decoration: none;
      font-weight: 650;
      font-size: 0.88rem;
      cursor: pointer;
    }
    .menu-admin__btn mat-icon {
      font-size: 1.05rem;
      width: 1.05rem;
      height: 1.05rem;
    }
    .menu-admin__btn--ghost {
      background: #fff;
      color: var(--guy-navy, #003366);
    }
    .menu-admin__raw {
      margin-top: 0.85rem;
    }
    .menu-admin__raw pre {
      white-space: pre-wrap;
      max-height: 12rem;
      overflow: auto;
      font-size: 0.78rem;
      background: #f6f8f6;
      padding: 0.75rem;
      border-radius: 8px;
    }
    .menu-admin__meta {
      display: grid;
      gap: 0.65rem;
      margin-bottom: 1rem;
    }
    .menu-section {
      display: grid;
      gap: 0.55rem;
      padding: 0.85rem 0;
      border-top: 1px solid var(--guy-border, #d7e0d9);
    }
    .menu-section__head {
      display: flex;
      align-items: flex-start;
      gap: 0.35rem;
    }
    .menu-section__name {
      flex: 1;
    }
    .menu-item {
      display: grid;
      grid-template-columns: 1.4fr 1.4fr 7rem 8rem auto;
      gap: 0.45rem;
      align-items: start;
    }
    @media (max-width: 900px) {
      .menu-item {
        grid-template-columns: 1fr;
      }
    }
    .menu-admin__save {
      display: flex;
      justify-content: flex-end;
      position: sticky;
      bottom: 0.75rem;
    }
  `,
})
export class AdminMenuPage {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  readonly shops = inject(ShopContextService);

  readonly shopId = computed(() => this.shops.selectedShopId());
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly parsing = signal(false);
  readonly uploadingSource = signal(false);
  readonly enabled = signal(false);
  readonly shopSlug = signal('');
  readonly parseNote = signal('');
  readonly geminiWarning = signal('');
  readonly rawText = signal('');
  readonly menus = signal<ShopMenu[]>([]);
  readonly activeId = signal<string | null>(null);
  private slugTouched = false;

  title = '';
  menuSlug = '';
  note = '';
  sourceFileName = '';
  private sourceFile: string | null = null;
  private sourceMime: string | null = null;
  readonly sections = signal<ShopMenuSection[]>([]);

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shopId();
      if (!shopId) return;
      this.reload();
    });
  }

  hubUrl(): string {
    const slug = this.shopSlug();
    if (!slug || typeof window === 'undefined') return '';
    return `${window.location.origin}/m/${encodeURIComponent(slug)}`;
  }

  activePublicUrl(): string {
    const hub = this.hubUrl();
    const s = slugify(this.menuSlug);
    if (!hub || !s) return hub;
    return `${hub}/${encodeURIComponent(s)}`;
  }

  downloadStyledPdf(): void {
    const shop = this.shops.selectedShop();
    if (!shop) {
      this.snack.open('Seleccioná un local', 'OK', { duration: 2500 });
      return;
    }
    const sections = this.sections();
    const hasItems = sections.some((s) => (s.items ?? []).some((it) => String(it.name ?? '').trim()));
    if (!hasItems) {
      this.snack.open('Agregá ítems a la carta antes de generar el PDF', 'OK', { duration: 3000 });
      return;
    }
    const url = this.activePublicUrl();
    if (!url) {
      this.snack.open('Guardá la carta y activá el módulo público para generar el PDF', 'OK', {
        duration: 3500,
      });
      return;
    }
    void (async () => {
      try {
        await downloadIframePdf({
          url,
          selector: '.menu:not(.menu--error)',
          readySelector: '.menu__sheet',
          filename: `carta-${pdfFileSlug(this.title || this.menuSlug || shop.name || 'carta')}.pdf`,
          widthPx: 640,
          hide: '.menu__mask, .pdf-hide',
        });
      } catch {
        this.snack.open('No se pudo generar el PDF. Revisá que la carta pública esté activa.', 'OK', {
          duration: 4000,
        });
      }
    })();
  }

  async copyUrl(url: string, okMsg: string): Promise<void> {
    if (!url) return;
    const ok = await copyText(url);
    this.snack.open(ok ? okMsg : 'No se pudo copiar la URL', 'OK', { duration: 2500 });
  }

  reload(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.loading.set(true);
    this.http.get<MenuAdminResponse>(`${environment.apiUrl}/shops/${shopId}/menu`).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.applyPayload(res);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar las cartas', 'OK', { duration: 3000 });
      },
    });
  }

  private applyPayload(res: MenuAdminResponse): void {
    this.enabled.set(!!res.enabled);
    this.shopSlug.set(res.slug ?? this.shops.selectedShop()?.slug ?? '');
    const menus = (res.menus ?? []).map((m) => cloneMenu(m));
    this.menus.set(menus);
    const keep = menus.find((m) => m.id === this.activeId()) ?? menus[0];
    this.activeId.set(keep?.id ?? null);
    if (keep) this.loadEditor(keep);
    else this.clearEditor();
  }

  private loadEditor(menu: ShopMenu): void {
    this.title = menu.title ?? '';
    this.menuSlug = menu.slug ?? '';
    this.note = menu.note ?? '';
    this.sourceFile = menu.sourceFile ?? null;
    this.sourceFileName = menu.sourceFileName ?? '';
    this.sourceMime = menu.sourceMime ?? null;
    this.sections.set(menu.sections.length ? menu.sections : emptySections());
    this.slugTouched = !!menu.slug;
  }

  private clearEditor(): void {
    this.title = '';
    this.menuSlug = '';
    this.note = '';
    this.sourceFile = null;
    this.sourceFileName = '';
    this.sourceMime = null;
    this.sections.set([]);
    this.slugTouched = false;
  }

  private editorMenu(id: string): ShopMenu {
    return {
      id,
      slug: uniqueSlug(this.menuSlug || this.title || 'carta', this.menus(), id),
      title: this.title.trim() || 'Carta',
      note: this.note.trim() || null,
      sourceFile: this.sourceFile,
      sourceFileName: this.sourceFileName || null,
      sourceMime: this.sourceMime,
      sections: this.sections().map((s) => ({
        name: String(s.name ?? '').trim() || 'Carta',
        items: (s.items ?? [])
          .map((it) => ({
            name: String(it.name ?? '').trim(),
            description: String(it.description ?? '').trim() || null,
            price: toPrice(it.price),
            priceLabel: String(it.priceLabel ?? '').trim() || null,
          }))
          .filter((it) => it.name),
      })),
    };
  }

  private flushActive(): void {
    const id = this.activeId();
    if (!id) return;
    const next = this.editorMenu(id);
    this.menus.update((list) => list.map((m) => (m.id === id ? next : m)));
    this.menuSlug = next.slug;
  }

  selectMenu(id: string): void {
    if (id === this.activeId()) return;
    this.flushActive();
    const menu = this.menus().find((m) => m.id === id);
    if (!menu) return;
    this.activeId.set(id);
    this.loadEditor(menu);
  }

  onTitleChange(): void {
    if (this.slugTouched) return;
    this.menuSlug = uniqueSlug(this.title || 'carta', this.menus(), this.activeId() ?? undefined);
  }

  addBlank(): void {
    this.flushActive();
    const menu = cloneMenu({
      id: newMenuId(),
      slug: uniqueSlug('carta', this.menus()),
      title: this.menus().length ? 'Carta' : 'Carta',
      note: '',
      sections: [{ name: '', items: [{ name: '', description: '', price: null, priceLabel: '' }] }],
    });
    if (this.menus().some((m) => m.slug === 'carta')) {
      menu.title = 'Nueva carta';
      menu.slug = uniqueSlug('nueva-carta', this.menus());
    }
    this.menus.update((list) => [...list, menu]);
    this.activeId.set(menu.id);
    this.loadEditor(menu);
  }

  removeActive(): void {
    const id = this.activeId();
    if (!id) return;
    const name = this.title || 'esta carta';
    if (!window.confirm(`¿Quitar ${name}?`)) return;
    const next = this.menus().filter((m) => m.id !== id);
    this.menus.set(next);
    const keep = next[0];
    this.activeId.set(keep?.id ?? null);
    if (keep) this.loadEditor(keep);
    else this.clearEditor();
  }

  addSection(): void {
    this.sections.update((list) => [
      ...list,
      { name: '', items: [{ name: '', description: '', price: null, priceLabel: '' }] },
    ]);
  }

  removeSection(index: number): void {
    this.sections.update((list) => list.filter((_, i) => i !== index));
  }

  addItem(sectionIndex: number): void {
    this.sections.update((list) =>
      list.map((s, i) =>
        i === sectionIndex
          ? { ...s, items: [...s.items, { name: '', description: '', price: null, priceLabel: '' }] }
          : s,
      ),
    );
  }

  removeItem(sectionIndex: number, itemIndex: number): void {
    this.sections.update((list) =>
      list.map((s, i) =>
        i === sectionIndex ? { ...s, items: s.items.filter((_, j) => j !== itemIndex) } : s,
      ),
    );
  }

  async onFilePicked(input: HTMLInputElement, mode: 'add' | 'replace'): Promise<void> {
    const file = await takeInputFile(input);
    if (!file) return;
    const shopId = this.shopId();
    if (!shopId) return;
    if (mode === 'replace' && this.sections().some((s) => s.items.some((it) => it.name.trim()))) {
      const ok = window.confirm('Esto reemplaza el contenido (ítems) de esta carta. El archivo físico no se toca. ¿Seguimos?');
      if (!ok) return;
    }
    const keepSource =
      mode === 'replace'
        ? {
            sourceFile: this.sourceFile,
            sourceFileName: this.sourceFileName || null,
            sourceMime: this.sourceMime,
          }
        : { sourceFile: null, sourceFileName: null, sourceMime: null };
    this.parsing.set(true);
    this.parseNote.set('');
    this.geminiWarning.set('');
    const fd = new FormData();
    fd.append('file', file, safeUploadFileName(file.name));
    this.http
      .post<{
        menu: ShopMenu;
        rawText?: string;
        fileName?: string;
        engine?: string;
        geminiWarning?: string | null;
      }>(`${environment.apiUrl}/shops/${shopId}/menu/parse`, fd)
      .subscribe({
        next: (res) => {
          this.parsing.set(false);
          this.flushActive();
          const parsed = cloneMenu({
            ...res.menu,
            id: mode === 'replace' && this.activeId() ? this.activeId()! : newMenuId(),
            slug: uniqueSlug(
              res.menu.slug || res.menu.title || 'carta',
              this.menus(),
              mode === 'replace' ? this.activeId() ?? undefined : undefined,
            ),
            sourceFile: keepSource.sourceFile,
            sourceFileName: keepSource.sourceFileName,
            sourceMime: keepSource.sourceMime,
          });
          if (mode === 'replace' && this.activeId()) {
            this.menus.update((list) => list.map((m) => (m.id === this.activeId() ? parsed : m)));
          } else {
            this.menus.update((list) => [...list, parsed]);
            this.activeId.set(parsed.id);
          }
          this.loadEditor(parsed);
          this.rawText.set((res.rawText ?? '').trim());
          const count = parsed.sections.reduce((n, s) => n + s.items.length, 0);
          if (res.engine === 'gemini') {
            this.parseNote.set(
              count
                ? `Leímos ${count} ítem${count === 1 ? '' : 's'} con Gemini de ${res.fileName || 'el archivo'}. Revisá y guardá. Para la vista pública usá “Cargar carta física”.`
                : 'Gemini no encontró ítems claros.',
            );
            this.geminiWarning.set('');
          } else {
            this.parseNote.set(
              count
                ? `Leímos ${count} ítem${count === 1 ? '' : 's'} con parseo local de ${res.fileName || 'el archivo'}. Revisá y guardá. Para la vista pública usá “Cargar carta física”.`
                : 'No encontramos ítems claros. Revisá el texto leído y cargalos a mano.',
            );
            this.geminiWarning.set(
              res.geminiWarning ||
                'No se usó Gemini. Se usó el parseo local.',
            );
          }
        },
        error: (err: HttpErrorResponse) => {
          this.parsing.set(false);
          const msg =
            (err.error && typeof err.error === 'object' && (err.error.message as string)) ||
            'No se pudo leer el archivo';
          this.snack.open(Array.isArray(msg) ? msg[0] : msg, 'OK', { duration: 4000 });
        },
      });
  }

  async onSourcePicked(input: HTMLInputElement): Promise<void> {
    const file = await takeInputFile(input);
    if (!file) return;
    const shopId = this.shopId();
    const menuId = this.activeId();
    if (!shopId || !menuId) return;
    this.flushActive();
    this.uploadingSource.set(true);
    // Guardamos primero para que el menuId exista en el servidor
    this.http.put<MenuAdminResponse>(`${environment.apiUrl}/shops/${shopId}/menu`, { menus: this.menus() }).subscribe({
      next: (saved) => {
        this.applyPayload(saved);
        const id = this.activeId() || menuId;
        const fd = new FormData();
        fd.append('file', file, safeUploadFileName(file.name));
        this.http
          .post<MenuAdminResponse & { attached?: { sourceFileName?: string | null } }>(
            `${environment.apiUrl}/shops/${shopId}/menu/${encodeURIComponent(id)}/source`,
            fd,
          )
          .subscribe({
            next: (res) => {
              this.uploadingSource.set(false);
              this.applyPayload(res);
              this.snack.open(
                `Carta física lista: ${res.attached?.sourceFileName || file.name}`,
                'OK',
                { duration: 2800 },
              );
            },
            error: (err: HttpErrorResponse) => {
              this.uploadingSource.set(false);
              const msg =
                (err.error && typeof err.error === 'object' && (err.error.message as string)) ||
                'No se pudo cargar la carta física';
              this.snack.open(Array.isArray(msg) ? msg[0] : msg, 'OK', { duration: 4000 });
            },
          });
      },
      error: () => {
        this.uploadingSource.set(false);
        this.snack.open('Guardá la carta antes de cargar el archivo físico', 'OK', { duration: 3500 });
      },
    });
  }

  clearSource(): void {
    const shopId = this.shopId();
    const menuId = this.activeId();
    if (!shopId || !menuId) return;
    if (!window.confirm('¿Quitar el archivo de la carta física? Los ítems no se borran.')) return;
    this.flushActive();
    this.uploadingSource.set(true);
    this.http
      .delete<MenuAdminResponse>(`${environment.apiUrl}/shops/${shopId}/menu/${encodeURIComponent(menuId)}/source`)
      .subscribe({
        next: (res) => {
          this.uploadingSource.set(false);
          this.applyPayload(res);
          this.snack.open('Archivo físico quitado', 'OK', { duration: 2200 });
        },
        error: () => {
          this.uploadingSource.set(false);
          this.snack.open('No se pudo quitar el archivo', 'OK', { duration: 3000 });
        },
      });
  }

  save(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.flushActive();
    this.saving.set(true);
    this.http
      .put<MenuAdminResponse>(`${environment.apiUrl}/shops/${shopId}/menu`, { menus: this.menus() })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.applyPayload(res);
          this.snack.open('Cartas guardadas', 'OK', { duration: 2200 });
        },
        error: () => {
          this.saving.set(false);
          this.snack.open('No se pudieron guardar las cartas', 'OK', { duration: 3000 });
        },
      });
  }
}
