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
  title?: string | null;
  note?: string | null;
  sections: ShopMenuSection[];
};

type MenuAdminResponse = {
  enabled: boolean;
  slug: string;
  menu: ShopMenu;
};

function emptyMenu(): ShopMenu {
  return { title: '', note: '', sections: [] };
}

function toPrice(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cloneMenu(menu?: ShopMenu | null): ShopMenu {
  const src = menu ?? emptyMenu();
  return {
    title: src.title ?? '',
    note: src.note ?? '',
    sections: (src.sections ?? []).map((s) => ({
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
      title="Carta"
      [subtitle]="shops.selectedShop()?.name ?? 'Menú público del local'"
    />

    @if (!shopId()) {
      <div class="panel-card">Seleccioná un local en el menú lateral.</div>
    } @else if (loading()) {
      <app-loading-state
        [loading]="true"
        title="Cargando…"
        message="Obteniendo la carta del local"
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
          @if (slug()) {
            <div class="menu-admin__links">
              <a class="menu-admin__btn" [href]="publicUrl()" target="_blank" rel="noopener">
                <mat-icon>open_in_new</mat-icon>
                Ver carta
              </a>
              <button type="button" class="menu-admin__btn menu-admin__btn--ghost" (click)="copyPublicUrl()">
                <mat-icon>content_copy</mat-icon>
                Copiar link
              </button>
            </div>
            <p class="menu-admin__url">{{ publicUrl() }}</p>
          }
        </section>

        <section class="panel-card">
          <h2>Cargar desde archivo</h2>
          <p class="menu-admin__hint">
            Subí un PDF, una foto o un .txt de la carta. El sistema lee el texto y arma secciones y precios
            para que los revises antes de publicar.
          </p>
          <input
            #fileInput
            type="file"
            hidden
            accept=".pdf,.txt,image/*,.jpg,.jpeg,.png,.webp"
            (change)="onFilePicked(fileInput)"
          />
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="parsing()"
            (click)="fileInput.click()"
          >
            <mat-icon>upload_file</mat-icon>
            {{ parsing() ? 'Leyendo…' : 'Elegir archivo' }}
          </button>
          @if (parseNote()) {
            <p class="menu-admin__parse">{{ parseNote() }}</p>
          }
          @if (rawText()) {
            <details class="menu-admin__raw">
              <summary>Texto leído del archivo</summary>
              <pre>{{ rawText() }}</pre>
            </details>
          }
        </section>

        <section class="panel-card">
          <h2>Editar carta</h2>
          <div class="menu-admin__meta">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Título</mat-label>
              <input matInput [(ngModel)]="title" placeholder="Carta" />
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
                    <mat-label>Plato</mat-label>
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
                    aria-label="Quitar plato"
                    (click)="removeItem(si, ii)"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
              }
              <button mat-stroked-button type="button" (click)="addItem(si)">
                <mat-icon>add</mat-icon>
                Plato
              </button>
            </article>
          }

          <button mat-stroked-button type="button" (click)="addSection()">
            <mat-icon>playlist_add</mat-icon>
            Sección
          </button>
        </section>

        <div class="menu-admin__save">
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="saving()"
            (click)="save()"
          >
            <mat-icon>save</mat-icon>
            {{ saving() ? 'Guardando…' : 'Guardar carta' }}
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
    .menu-admin__url {
      margin: 0 0 0.85rem;
      font-size: 0.9rem;
      color: var(--guy-muted, #5f6f76);
    }
    .menu-admin__warn {
      color: #b45309;
    }
    .menu-admin__links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
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
  readonly enabled = signal(false);
  readonly slug = signal('');
  readonly parseNote = signal('');
  readonly rawText = signal('');

  title = '';
  note = '';
  readonly sections = signal<ShopMenuSection[]>([]);

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shopId();
      if (!shopId) return;
      this.reload();
    });
  }

  publicUrl(): string {
    const slug = this.slug();
    if (!slug || typeof window === 'undefined') return '';
    return `${window.location.origin}/m/${encodeURIComponent(slug)}`;
  }

  async copyPublicUrl(): Promise<void> {
    const url = this.publicUrl();
    if (!url) return;
    const ok = await copyText(url);
    this.snack.open(ok ? 'Link de la carta copiado' : 'No se pudo copiar la URL', 'OK', {
      duration: 2500,
    });
  }

  reload(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.loading.set(true);
    this.http.get<MenuAdminResponse>(`${environment.apiUrl}/shops/${shopId}/menu`).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.applyMenu(res);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudo cargar la carta', 'OK', { duration: 3000 });
      },
    });
  }

  private applyMenu(res: MenuAdminResponse): void {
    this.enabled.set(!!res.enabled);
    this.slug.set(res.slug ?? this.shops.selectedShop()?.slug ?? '');
    const menu = cloneMenu(res.menu);
    this.title = menu.title ?? '';
    this.note = menu.note ?? '';
    this.sections.set(menu.sections.length ? menu.sections : []);
  }

  private currentMenu(): ShopMenu {
    return {
      title: this.title.trim() || null,
      note: this.note.trim() || null,
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

  addSection(): void {
    this.sections.update((list) => [...list, { name: '', items: [{ name: '', description: '', price: null, priceLabel: '' }] }]);
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

  async onFilePicked(input: HTMLInputElement): Promise<void> {
    const file = await takeInputFile(input);
    if (!file) return;
    const shopId = this.shopId();
    if (!shopId) return;
    if (this.sections().some((s) => s.items.some((it) => it.name.trim()))) {
      const ok = window.confirm(
        'Esto reemplaza la carta actual por lo que se lea del archivo. ¿Seguimos?',
      );
      if (!ok) return;
    }
    this.parsing.set(true);
    this.parseNote.set('');
    const fd = new FormData();
    fd.append('file', file, safeUploadFileName(file.name));
    this.http
      .post<{ menu: ShopMenu; rawText?: string; fileName?: string }>(
        `${environment.apiUrl}/shops/${shopId}/menu/parse`,
        fd,
      )
      .subscribe({
        next: (res) => {
          this.parsing.set(false);
          const menu = cloneMenu(res.menu);
          this.title = menu.title || this.title;
          this.note = menu.note || this.note;
          this.sections.set(menu.sections.length ? menu.sections : []);
          this.rawText.set((res.rawText ?? '').trim());
          const count = menu.sections.reduce((n, s) => n + s.items.length, 0);
          this.parseNote.set(
            count
              ? `Leímos ${count} ítem${count === 1 ? '' : 's'} de ${res.fileName || 'el archivo'}. Revisá y guardá.`
              : 'No encontramos platos claros. Revisá el texto leído y cargalos a mano.',
          );
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

  save(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.saving.set(true);
    this.http.put<MenuAdminResponse>(`${environment.apiUrl}/shops/${shopId}/menu`, this.currentMenu()).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.applyMenu(res);
        this.snack.open('Carta guardada', 'OK', { duration: 2200 });
      },
      error: () => {
        this.saving.set(false);
        this.snack.open('No se pudo guardar la carta', 'OK', { duration: 3000 });
      },
    });
  }
}
