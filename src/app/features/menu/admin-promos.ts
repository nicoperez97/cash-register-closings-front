import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import {
  SelectSearchComponent,
  filterBySelectQuery,
  onSelectSearchOpened,
} from '../../shared/components/select-search';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { environment } from '../../../environments/environment';

export type ShopPromoItem = { menuItemId: string; qty: number };

export type ShopPromo = {
  id: string;
  name: string;
  description?: string | null;
  available: boolean;
  showOnPublicMenu: boolean;
  sellable: boolean;
  tableMatchable: boolean;
  fixedPrice: number;
  items: ShopPromoItem[];
  specialName?: string | null;
  schedule?: Record<string, Array<{ open: string; close: string }> | null> | null;
};

type MenuPickItem = { id: string; name: string; price: number | null; section: string };

@Component({
  selector: 'app-admin-promos',
  imports: [
    FormsModule,
    DecimalPipe,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    PageHeaderComponent,
    SelectSearchComponent,
  ],
  template: `
    <app-page-header
      title="Promos"
      subtitle="Packs a precio fijo para comanda y matching por mesa. No reemplazan la carta."
    />

    <section class="panel-card promo-admin">
      @if (loading()) {
        <p class="promo-admin__muted">Cargando…</p>
      } @else {
        <div class="promo-admin__toolbar">
          <button mat-stroked-button type="button" (click)="addPromo()">
            <mat-icon>add</mat-icon>
            Nueva promo
          </button>
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="saving() || !promos().length"
            (click)="save()"
          >
            <mat-icon>save</mat-icon>
            {{ saving() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>

        @if (!promos().length) {
          <div class="promo-admin__empty">
            <p>Todavía no hay promos.</p>
            <p class="promo-admin__muted">Creá una 2x1, un combo o un ítem de evento.</p>
            <button mat-flat-button color="primary" type="button" (click)="addPromo()">
              <mat-icon>add</mat-icon>
              Nueva promo
            </button>
          </div>
        }

        <div class="promo-admin__list">
          @for (p of promos(); track p.id || i; let i = $index) {
            <article class="promo-card" [class.promo-card--off]="!p.available">
              <header class="promo-card__top">
                <div class="promo-card__identity">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="promo-card__name">
                    <mat-label>Nombre</mat-label>
                    <input matInput [(ngModel)]="p.name" [name]="'n' + i" placeholder="ej. 2x1 Heineken" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="promo-card__price">
                    <mat-label>Precio fijo</mat-label>
                    <span matTextPrefix>$&nbsp;</span>
                    <input
                      matInput
                      type="number"
                      min="0"
                      step="1"
                      [(ngModel)]="p.fixedPrice"
                      [name]="'fp' + i"
                    />
                  </mat-form-field>
                </div>
                <label class="promo-card__check promo-card__check--active">
                  <input type="checkbox" [(ngModel)]="p.available" [name]="'av' + i" />
                  Activa
                </label>
                <button
                  mat-icon-button
                  type="button"
                  class="promo-card__del"
                  (click)="removePromo(i)"
                  aria-label="Eliminar promo"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </header>

              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="promo-card__desc">
                <mat-label>Descripción (opcional)</mat-label>
                <input matInput [(ngModel)]="p.description" [name]="'d' + i" />
              </mat-form-field>

              <div class="promo-card__section">
                <h3 class="promo-card__label">Dónde se usa</h3>
                <div class="promo-card__flags">
                  <label class="promo-card__check">
                    <input type="checkbox" [(ngModel)]="p.sellable" [name]="'se' + i" />
                    <span>
                      <strong>Vender en comanda</strong>
                      <small>El mozo la agrega como pack</small>
                    </span>
                  </label>
                  <label class="promo-card__check">
                    <input type="checkbox" [(ngModel)]="p.tableMatchable" [name]="'tm' + i" />
                    <span>
                      <strong>Asignar a mesa</strong>
                      <small>Matching automático en el ticket</small>
                    </span>
                  </label>
                  <label class="promo-card__check">
                    <input type="checkbox" [(ngModel)]="p.showOnPublicMenu" [name]="'pub' + i" />
                    <span>
                      <strong>Carta pública</strong>
                      <small>Solo informativo en /m</small>
                    </span>
                  </label>
                </div>
              </div>

              <div class="promo-card__section">
                <div class="promo-card__section-head">
                  <h3 class="promo-card__label">Composición (1 pack)</h3>
                  <button mat-stroked-button type="button" class="promo-card__add" (click)="addComp(i)">
                    <mat-icon>add</mat-icon>
                    Ítem
                  </button>
                </div>

                @if (!p.items.length) {
                  <p class="promo-admin__muted">
                    Sin ítems = evento especial. Poné el nombre que ve cocina.
                  </p>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="promo-card__desc">
                    <mat-label>Nombre en cocina</mat-label>
                    <input
                      matInput
                      [(ngModel)]="p.specialName"
                      [name]="'sp' + i"
                      placeholder="ej. Promo happy hour"
                    />
                  </mat-form-field>
                } @else {
                  <div class="promo-card__comps">
                    @for (it of p.items; track $index; let j = $index) {
                      <div class="promo-card__comp">
                        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="promo-card__item">
                          <mat-label>Ítem</mat-label>
                          <mat-select
                            [(ngModel)]="it.menuItemId"
                            [name]="'mi' + i + '_' + j"
                            panelClass="guy-select-search-panel"
                            (openedChange)="onSelectSearchOpened($event, itemQuery)"
                          >
                            <app-select-search [(query)]="itemQuery" placeholder="Buscar ítem…" />
                            @for (opt of filteredMenuItems(it.menuItemId); track opt.id) {
                              <mat-option [value]="opt.id">
                                {{ opt.name }}
                                @if (opt.price != null) {
                                  <span> — {{ opt.price | number: '1.0-0' }}</span>
                                }
                                ({{ opt.section }})
                              </mat-option>
                            }
                          </mat-select>
                        </mat-form-field>
                        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="promo-card__qty">
                          <mat-label>Cant.</mat-label>
                          <input
                            matInput
                            type="number"
                            min="1"
                            [(ngModel)]="it.qty"
                            [name]="'q' + i + '_' + j"
                          />
                        </mat-form-field>
                        <button
                          mat-icon-button
                          type="button"
                          class="promo-card__del"
                          (click)="removeComp(i, j)"
                          aria-label="Quitar ítem"
                        >
                          <mat-icon>close</mat-icon>
                        </button>
                      </div>
                    }
                  </div>
                }
              </div>

              <div class="promo-card__section promo-card__section--hours">
                <label class="promo-card__check">
                  <input
                    type="checkbox"
                    [ngModel]="!!p.schedule"
                    (ngModelChange)="toggleSchedule(i, $event)"
                    [name]="'sch' + i"
                  />
                  <span>
                    <strong>Limitar por horario</strong>
                    <small>Misma ventana todos los días</small>
                  </span>
                </label>
                @if (p.schedule) {
                  <div class="promo-card__hours">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="promo-card__time">
                      <mat-label>Desde</mat-label>
                      <input
                        matInput
                        type="time"
                        [ngModel]="scheduleOpen(p)"
                        (ngModelChange)="setScheduleOpen(i, $event)"
                        [name]="'so' + i"
                      />
                    </mat-form-field>
                    <span class="promo-card__hours-sep" aria-hidden="true">→</span>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="promo-card__time">
                      <mat-label>Hasta</mat-label>
                      <input
                        matInput
                        type="time"
                        [ngModel]="scheduleClose(p)"
                        (ngModelChange)="setScheduleClose(i, $event)"
                        [name]="'sc' + i"
                      />
                    </mat-form-field>
                  </div>
                }
              </div>
            </article>
          }
        </div>

        @if (promos().length) {
          <div class="promo-admin__save">
            <button
              mat-flat-button
              color="primary"
              type="button"
              [disabled]="saving()"
              (click)="save()"
            >
              <mat-icon>save</mat-icon>
              {{ saving() ? 'Guardando…' : 'Guardar promos' }}
            </button>
          </div>
        }
      }
    </section>
  `,
  styles: `
    .promo-admin {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1rem 1.1rem 1.25rem;
    }
    .promo-admin__toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
    .promo-admin__toolbar button mat-icon,
    .promo-admin__save button mat-icon,
    .promo-card__add mat-icon {
      margin-right: 0.15rem;
    }
    .promo-admin__list {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }
    .promo-admin__empty {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.35rem;
      padding: 1.25rem 0.25rem;
    }
    .promo-admin__empty > p:first-child {
      margin: 0;
      font-weight: 650;
      color: var(--guy-navy, #003366);
    }
    .promo-admin__muted {
      margin: 0;
      font-size: 0.85rem;
      line-height: 1.4;
      color: var(--guy-muted, #5f6f76);
    }
    .promo-admin__save {
      display: flex;
      justify-content: flex-end;
      padding-top: 0.25rem;
      border-top: 1px solid var(--guy-border, #e4ebe6);
    }

    .promo-card {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      padding: 1rem 1.05rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 12px;
      background: var(--guy-card, #fff);
    }
    .promo-card--off {
      opacity: 0.72;
    }
    .promo-card__top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 0.55rem 0.65rem;
      align-items: start;
    }
    .promo-card__identity {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 8.5rem;
      gap: 0.55rem;
      min-width: 0;
    }
    .promo-card__name,
    .promo-card__desc,
    .promo-card__item {
      width: 100%;
      min-width: 0;
    }
    .promo-card__price,
    .promo-card__qty,
    .promo-card__time {
      width: 100%;
    }
    .promo-card__del {
      margin-top: 0.2rem;
      color: #b71c1c;
    }
    .promo-card__section {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--guy-border, #e4ebe6);
    }
    .promo-card__section--hours {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem 1rem;
    }
    .promo-card__section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }
    .promo-card__label {
      margin: 0;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
    }
    .promo-card__add {
      flex-shrink: 0;
    }
    .promo-card__flags {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.45rem 0.75rem;
    }
    .promo-card__check {
      display: inline-flex;
      align-items: flex-start;
      gap: 0.45rem;
      margin: 0;
      cursor: pointer;
      font-size: 0.88rem;
      color: var(--guy-navy, #003366);
      user-select: none;
    }
    .promo-card__check--active {
      align-items: center;
      margin-top: 0.55rem;
      white-space: nowrap;
      font-weight: 650;
    }
    .promo-card__check input {
      margin-top: 0.15rem;
      accent-color: var(--guy-primary, #1d65a0);
    }
    .promo-card__check--active input {
      margin-top: 0;
    }
    .promo-card__check span {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      min-width: 0;
    }
    .promo-card__check strong {
      font-weight: 650;
      line-height: 1.25;
    }
    .promo-card__check small {
      font-size: 0.75rem;
      line-height: 1.25;
      color: var(--guy-muted, #5f6f76);
      font-weight: 400;
    }
    .promo-card__comps {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .promo-card__comp {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 5.5rem auto;
      gap: 0.45rem;
      align-items: start;
    }
    .promo-card__hours {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      flex-wrap: wrap;
    }
    .promo-card__time {
      width: 8.5rem;
    }
    .promo-card__hours-sep {
      color: var(--guy-muted, #5f6f76);
      font-weight: 600;
    }

    @media (max-width: 820px) {
      .promo-card__flags {
        grid-template-columns: 1fr;
      }
      .promo-card__top {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .promo-card__check--active {
        grid-column: 1;
        margin-top: 0;
      }
      .promo-card__del {
        grid-column: 2;
        grid-row: 1;
      }
      .promo-card__identity {
        grid-column: 1 / -1;
        grid-template-columns: minmax(0, 1fr) 7.5rem;
      }
    }
    @media (max-width: 560px) {
      .promo-card__identity,
      .promo-card__comp {
        grid-template-columns: 1fr;
      }
      .promo-card__qty,
      .promo-card__price,
      .promo-card__time {
        max-width: 10rem;
      }
      .promo-card__section--hours {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `,
})
export class AdminPromosPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly shops = inject(ShopContextService);
  private readonly snack = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly promos = signal<ShopPromo[]>([]);
  readonly menuItems = signal<MenuPickItem[]>([]);
  readonly itemQuery = signal('');
  readonly onSelectSearchOpened = onSelectSearchOpened;

  readonly shopId = computed(() => String(this.shops.selectedShopId() ?? '').trim());

  filteredMenuItems(keepId?: string | null): MenuPickItem[] {
    return filterBySelectQuery(
      this.menuItems(),
      this.itemQuery(),
      (it) => `${it.name} ${it.section} ${it.price ?? ''}`,
      keepId,
    );
  }

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    const shopId = this.shopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.http.get<{ promos: ShopPromo[]; menus: Array<{ title?: string; sections?: Array<{ name: string; items: Array<{ id: string; name: string; price: number | null }> }> }> }>(
      `${environment.apiUrl}/shops/${shopId}/promos`,
    ).subscribe({
      next: (res) => {
        this.promos.set((res.promos ?? []).map((p) => ({ ...p, items: [...(p.items ?? [])] })));
        const picks: MenuPickItem[] = [];
        for (const m of res.menus ?? []) {
          for (const sec of m.sections ?? []) {
            for (const it of sec.items ?? []) {
              if (!it.id) continue;
              picks.push({
                id: it.id,
                name: it.name,
                price: it.price,
                section: sec.name || m.title || 'Carta',
              });
            }
          }
        }
        this.menuItems.set(picks);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar las promos', 'OK', { duration: 3000 });
      },
    });
  }

  addPromo(): void {
    this.promos.update((list) => [
      ...list,
      {
        id: '',
        name: 'Nueva promo',
        description: '',
        available: true,
        showOnPublicMenu: false,
        sellable: true,
        tableMatchable: true,
        fixedPrice: 0,
        items: [],
        specialName: '',
        schedule: null,
      },
    ]);
  }

  removePromo(index: number): void {
    this.promos.update((list) => list.filter((_, i) => i !== index));
  }

  addComp(index: number): void {
    const first = this.menuItems()[0]?.id ?? '';
    this.promos.update((list) =>
      list.map((p, i) =>
        i === index
          ? { ...p, items: [...p.items, { menuItemId: first, qty: 1 }], specialName: null }
          : p,
      ),
    );
  }

  removeComp(promoIndex: number, itemIndex: number): void {
    this.promos.update((list) =>
      list.map((p, i) =>
        i === promoIndex
          ? { ...p, items: p.items.filter((_, j) => j !== itemIndex) }
          : p,
      ),
    );
  }

  toggleSchedule(index: number, on: boolean): void {
    this.promos.update((list) =>
      list.map((p, i) => {
        if (i !== index) return p;
        if (!on) return { ...p, schedule: null };
        const open = '12:00';
        const close = '16:00';
        const day = [{ open, close }];
        const schedule: NonNullable<ShopPromo['schedule']> = {};
        for (let d = 0; d <= 6; d++) schedule[String(d)] = day;
        return { ...p, schedule };
      }),
    );
  }

  scheduleOpen(p: ShopPromo): string {
    const w = p.schedule?.['1'] ?? p.schedule?.['0'];
    return Array.isArray(w) && w[0]?.open ? w[0].open : '12:00';
  }

  scheduleClose(p: ShopPromo): string {
    const w = p.schedule?.['1'] ?? p.schedule?.['0'];
    return Array.isArray(w) && w[0]?.close ? w[0].close : '16:00';
  }

  setScheduleOpen(index: number, open: string): void {
    this.setScheduleWindow(index, open, this.scheduleClose(this.promos()[index]));
  }

  setScheduleClose(index: number, close: string): void {
    this.setScheduleWindow(index, this.scheduleOpen(this.promos()[index]), close);
  }

  private setScheduleWindow(index: number, open: string, close: string): void {
    const day = [{ open: open || '12:00', close: close || '16:00' }];
    const schedule: NonNullable<ShopPromo['schedule']> = {};
    for (let d = 0; d <= 6; d++) schedule[String(d)] = day;
    this.promos.update((list) =>
      list.map((p, i) => (i === index ? { ...p, schedule } : p)),
    );
  }

  save(): void {
    const shopId = this.shopId();
    if (!shopId || this.saving()) return;
    this.saving.set(true);
    const body = {
      promos: this.promos().map((p) => ({
        id: p.id || undefined,
        name: p.name,
        description: p.description || null,
        available: p.available,
        showOnPublicMenu: p.showOnPublicMenu,
        sellable: p.sellable,
        tableMatchable: p.tableMatchable,
        fixedPrice: Number(p.fixedPrice) || 0,
        items: p.items.filter((it) => it.menuItemId),
        specialName: p.items.length ? null : p.specialName || p.name,
        schedule: p.schedule ?? null,
      })),
    };
    this.http.put<{ promos: ShopPromo[] }>(`${environment.apiUrl}/shops/${shopId}/promos`, body).subscribe({
      next: (res) => {
        this.promos.set((res.promos ?? []).map((p) => ({ ...p, items: [...(p.items ?? [])] })));
        this.saving.set(false);
        this.snack.open('Promos guardadas', 'OK', { duration: 2500 });
      },
      error: () => {
        this.saving.set(false);
        this.snack.open('No se pudieron guardar', 'OK', { duration: 3000 });
      },
    });
  }
}
