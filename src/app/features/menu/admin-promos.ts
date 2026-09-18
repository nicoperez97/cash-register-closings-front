import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
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
  /** Fechas puntuales YYYY-MM-DD (modo solo hoy / fechas). */
  validDates?: string[] | null;
};

type MenuPickItem = { id: string; name: string; price: number | null; section: string };

@Component({
  selector: 'app-admin-promos',
  imports: [
    FormsModule,
    DecimalPipe,
    MatButtonModule,
    MatDatepickerModule,
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
      subtitle="Packs a precio fijo. Con vigencia por día u hoy se aplican solas al abrir mesa."
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
          <span class="promo-admin__count" aria-live="polite">
            {{ promos().length ? promos().length + (promos().length === 1 ? ' promo' : ' promos') : 'Sin promos' }}
          </span>
          <button
            mat-flat-button
            color="primary"
            type="button"
            class="promo-admin__save-btn"
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
            <p class="promo-admin__muted">Ej.: 2x1 Heineken los miércoles, o Solo hoy en Aperol.</p>
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
                    <mat-label>Precio</mat-label>
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
                <div class="promo-card__top-actions">
                  <button
                    type="button"
                    class="promo-card__toggle"
                    [class.promo-card__toggle--on]="p.available"
                    (click)="p.available = !p.available"
                    [attr.aria-pressed]="p.available"
                  >
                    {{ p.available ? 'Activa' : 'Off' }}
                  </button>
                  <button
                    mat-icon-button
                    type="button"
                    class="promo-card__del"
                    (click)="removePromo(i)"
                    aria-label="Eliminar promo"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              </header>

              <p class="promo-card__summary">{{ scheduleSummary(p) }}</p>

              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="promo-card__desc">
                <mat-label>Descripción (opcional)</mat-label>
                <input matInput [(ngModel)]="p.description" [name]="'d' + i" />
              </mat-form-field>

              <div class="promo-card__chips" role="group" aria-label="Dónde se usa">
                <button
                  type="button"
                  class="promo-card__chip"
                  [class.promo-card__chip--on]="p.sellable"
                  (click)="p.sellable = !p.sellable"
                  [attr.aria-pressed]="p.sellable"
                  title="El mozo la agrega como pack"
                >
                  Comanda
                </button>
                <button
                  type="button"
                  class="promo-card__chip"
                  [class.promo-card__chip--on]="p.tableMatchable"
                  (click)="p.tableMatchable = !p.tableMatchable"
                  [attr.aria-pressed]="p.tableMatchable"
                  title="Matching automático en el ticket de mesa"
                >
                  Mesa
                </button>
                <button
                  type="button"
                  class="promo-card__chip"
                  [class.promo-card__chip--on]="p.showOnPublicMenu"
                  (click)="p.showOnPublicMenu = !p.showOnPublicMenu"
                  [attr.aria-pressed]="p.showOnPublicMenu"
                  title="Informativo en carta pública /m"
                >
                  Carta /m
                </button>
              </div>

              <div class="promo-card__grid">
                <div class="promo-card__panel">
                  <div class="promo-card__panel-head">
                    <h3 class="promo-card__label">Pack</h3>
                    <button mat-stroked-button type="button" class="promo-card__add" (click)="addComp(i)">
                      <mat-icon>add</mat-icon>
                      Ítem
                    </button>
                  </div>

                  @if (!p.items.length) {
                    <p class="promo-admin__muted">Sin ítems = evento especial (nombre en cocina).</p>
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

                <div class="promo-card__panel">
                  <h3 class="promo-card__label">Vigencia</h3>
                  <div class="promo-card__seg" role="radiogroup" [attr.aria-label]="'Vigencia promo ' + (i + 1)">
                    <button
                      type="button"
                      class="promo-card__seg-btn"
                      [class.promo-card__seg-btn--on]="scheduleMode(p) === 'always'"
                      (click)="setScheduleMode(i, 'always')"
                    >
                      Siempre
                    </button>
                    <button
                      type="button"
                      class="promo-card__seg-btn"
                      [class.promo-card__seg-btn--on]="scheduleMode(p) === 'weekly'"
                      (click)="setScheduleMode(i, 'weekly')"
                    >
                      Por día
                    </button>
                    <button
                      type="button"
                      class="promo-card__seg-btn"
                      [class.promo-card__seg-btn--on]="scheduleMode(p) === 'dates'"
                      (click)="setScheduleMode(i, 'dates')"
                    >
                      Solo hoy
                    </button>
                  </div>

                  @if (scheduleMode(p) === 'always') {
                    <p class="promo-card__hint">Se asigna a mano en la mesa (no automática).</p>
                  }

                  @if (scheduleMode(p) === 'weekly') {
                    <div class="promo-card__days" role="group" aria-label="Días">
                      @for (d of weekDays; track d.key) {
                        <button
                          type="button"
                          class="promo-card__day"
                          [class.promo-card__day--on]="isWeekdayOn(p, d.key)"
                          (click)="toggleWeekday(i, d.key)"
                        >
                          {{ d.label }}
                        </button>
                      }
                    </div>
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
                    <p class="promo-card__hint">Auto al abrir mesa dentro de la ventana.</p>
                  }

                  @if (scheduleMode(p) === 'dates') {
                    <div class="promo-card__dates-toolbar">
                      <button mat-flat-button color="primary" type="button" (click)="addTodayDate(i)">
                        <mat-icon>today</mat-icon>
                        Hoy
                      </button>
                      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="promo-card__date-add">
                        <mat-label>Otra fecha</mat-label>
                        <input
                          matInput
                          [matDatepicker]="extraPicker"
                          [ngModel]="dateDraft(i)"
                          (ngModelChange)="pickExtraDate(i, $event)"
                          [name]="'da' + i"
                        />
                        <mat-datepicker-toggle matIconSuffix [for]="extraPicker" />
                        <mat-datepicker #extraPicker touchUi />
                      </mat-form-field>
                    </div>
                    @if (p.validDates?.length) {
                      <div class="promo-card__date-chips">
                        @for (d of p.validDates; track d) {
                          <span class="promo-card__date-chip">
                            {{ formatDateLabel(d) }}
                            <button type="button" (click)="removeValidDate(i, d)" aria-label="Quitar fecha">
                              <mat-icon>close</mat-icon>
                            </button>
                          </span>
                        }
                      </div>
                    } @else {
                      <p class="promo-card__hint">Tocá Hoy o elegí una fecha.</p>
                    }
                    <div class="promo-card__allday-row">
                      <button
                        type="button"
                        class="promo-card__chip"
                        [class.promo-card__chip--on]="!hasDateTimeWindow(p)"
                        (click)="setDatesAllDay(i, hasDateTimeWindow(p))"
                        [attr.aria-pressed]="!hasDateTimeWindow(p)"
                      >
                        Todo el día
                      </button>
                      @if (hasDateTimeWindow(p)) {
                        <div class="promo-card__hours">
                          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="promo-card__time">
                            <mat-label>Desde</mat-label>
                            <input
                              matInput
                              type="time"
                              [ngModel]="scheduleOpen(p)"
                              (ngModelChange)="setScheduleOpen(i, $event)"
                              [name]="'dso' + i"
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
                              [name]="'dsc' + i"
                            />
                          </mat-form-field>
                        </div>
                      }
                    </div>
                    <p class="promo-card__hint">Auto al abrir mesa mientras esté vigente.</p>
                  }
                </div>
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: `
    .promo-admin {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      padding: 0.85rem 1rem 1.15rem;
    }
    .promo-admin__toolbar {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      padding: 0.35rem 0 0.55rem;
      margin: 0 0 0.15rem;
      background: color-mix(in srgb, var(--guy-card, #fff) 92%, transparent);
      backdrop-filter: blur(6px);
      border-bottom: 1px solid var(--guy-border, #e4ebe6);
    }
    .promo-admin__count {
      flex: 1 1 auto;
      font-size: 0.82rem;
      font-weight: 650;
      color: var(--guy-muted, #5f6f76);
    }
    .promo-admin__save-btn {
      margin-left: auto;
    }
    .promo-admin__toolbar button mat-icon,
    .promo-card__add mat-icon,
    .promo-card__dates-toolbar button mat-icon {
      margin-right: 0.15rem;
    }
    .promo-admin__list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .promo-admin__empty {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.35rem;
      padding: 1.1rem 0.15rem;
    }
    .promo-admin__empty > p:first-child {
      margin: 0;
      font-weight: 650;
      color: var(--guy-navy, #003366);
    }
    .promo-admin__muted {
      margin: 0;
      font-size: 0.84rem;
      line-height: 1.4;
      color: var(--guy-muted, #5f6f76);
    }

    .promo-card {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
      padding: 0.85rem 0.95rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 14px;
      background: var(--guy-card, #fff);
    }
    .promo-card--off {
      opacity: 0.68;
    }
    .promo-card__top {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 0.65rem;
      align-items: start;
    }
    .promo-card__identity {
      flex: 1 1 16rem;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 7.5rem;
      gap: 0.45rem;
      min-width: 0;
    }
    .promo-card__top-actions {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
      flex-shrink: 0;
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
      color: #b71c1c;
    }
    .promo-card__toggle {
      appearance: none;
      border: 1px solid var(--guy-border, #d7e0d9);
      background: #fff;
      border-radius: 999px;
      padding: 0.4rem 0.75rem;
      font: inherit;
      font-size: 0.78rem;
      font-weight: 750;
      color: var(--guy-muted, #5f6f76);
      cursor: pointer;
    }
    .promo-card__toggle--on {
      background: color-mix(in srgb, #2e7d32 14%, #fff);
      border-color: color-mix(in srgb, #2e7d32 40%, var(--guy-border, #d7e0d9));
      color: #1b5e20;
    }
    .promo-card__summary {
      margin: -0.2rem 0 0;
      font-size: 0.8rem;
      font-weight: 650;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.35;
    }

    .promo-card__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .promo-card__chip {
      appearance: none;
      border: 1px solid var(--guy-border, #d7e0d9);
      background: #fff;
      border-radius: 999px;
      padding: 0.38rem 0.75rem;
      font: inherit;
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--guy-muted, #5f6f76);
      cursor: pointer;
    }
    .promo-card__chip--on {
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 14%, #fff);
      border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 45%, var(--guy-border, #d7e0d9));
      color: var(--guy-navy, #003366);
    }

    .promo-card__grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
    }
    .promo-card__panel {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.7rem 0.75rem;
      border-radius: 12px;
      background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 85%, #fff);
      border: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 70%, transparent);
      min-width: 0;
    }
    .promo-card__panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .promo-card__label {
      margin: 0;
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
    }
    .promo-card__add {
      flex-shrink: 0;
    }
    .promo-card__comps {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .promo-card__comp {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 4.75rem auto;
      gap: 0.35rem;
      align-items: start;
    }

    .promo-card__seg {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.25rem;
      padding: 0.2rem;
      border-radius: 10px;
      background: color-mix(in srgb, #fff 70%, transparent);
      border: 1px solid var(--guy-border, #d7e0d9);
    }
    .promo-card__seg-btn {
      appearance: none;
      border: 0;
      background: transparent;
      border-radius: 8px;
      padding: 0.45rem 0.35rem;
      font: inherit;
      font-size: 0.78rem;
      font-weight: 750;
      color: var(--guy-muted, #5f6f76);
      cursor: pointer;
    }
    .promo-card__seg-btn--on {
      background: #fff;
      color: var(--guy-navy, #003366);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .promo-card__days {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
    }
    .promo-card__day {
      border: 1px solid var(--guy-border, #d7e0d9);
      background: #fff;
      border-radius: 999px;
      min-width: 2.55rem;
      padding: 0.38rem 0.55rem;
      font: inherit;
      font-size: 0.78rem;
      font-weight: 750;
      cursor: pointer;
      color: var(--guy-muted, #5f6f76);
    }
    .promo-card__day--on {
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 16%, #fff);
      border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 45%, var(--guy-border, #d7e0d9));
      color: var(--guy-navy, #003366);
    }
    .promo-card__hours {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      flex-wrap: wrap;
    }
    .promo-card__time {
      width: 7.75rem;
    }
    .promo-card__hours-sep {
      color: var(--guy-muted, #5f6f76);
      font-weight: 700;
    }
    .promo-card__dates-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      align-items: center;
    }
    .promo-card__date-add {
      width: 10.5rem;
      flex: 1 1 8rem;
    }
    .promo-card__date-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .promo-card__date-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.15rem;
      padding: 0.25rem 0.2rem 0.25rem 0.65rem;
      border-radius: 999px;
      background: #fff;
      border: 1px solid var(--guy-border, #d7e0d9);
      font-size: 0.8rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .promo-card__date-chip button {
      appearance: none;
      border: 0;
      background: transparent;
      padding: 0;
      width: 1.6rem;
      height: 1.6rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: var(--guy-muted, #5f6f76);
    }
    .promo-card__date-chip mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
    }
    .promo-card__allday-row {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      align-items: flex-start;
    }
    .promo-card__hint {
      margin: 0;
      font-size: 0.76rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.35;
    }

    @media (max-width: 900px) {
      .promo-card__grid {
        grid-template-columns: 1fr;
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
      .promo-card__seg {
        grid-template-columns: 1fr;
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
  /** Borrador del datepicker por índice de promo. */
  readonly dateDrafts = signal<Record<number, Date | null>>({});
  readonly onSelectSearchOpened = onSelectSearchOpened;

  readonly weekDays = [
    { key: 0, label: 'Dom' },
    { key: 1, label: 'Lun' },
    { key: 2, label: 'Mar' },
    { key: 3, label: 'Mié' },
    { key: 4, label: 'Jue' },
    { key: 5, label: 'Vie' },
    { key: 6, label: 'Sáb' },
  ] as const;

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
        validDates: null,
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

  scheduleMode(p: ShopPromo): 'always' | 'weekly' | 'dates' {
    if (p.validDates?.length) return 'dates';
    if (p.schedule && Object.keys(p.schedule).length) return 'weekly';
    return 'always';
  }

  scheduleSummary(p: ShopPromo): string {
    const mode = this.scheduleMode(p);
    const open = this.scheduleOpen(p);
    const close = this.scheduleClose(p);
    if (mode === 'always') return 'Sin vigencia acotada · se asigna a mano en la mesa';
    if (mode === 'weekly') {
      const days = this.selectedWeekdays(p)
        .map((d) => this.weekDays.find((w) => w.key === d)?.label ?? '')
        .filter(Boolean);
      const dayPart = days.length ? days.join(', ') : 'sin días';
      return `${dayPart} · ${open}–${close} · auto al abrir mesa`;
    }
    const dates = (p.validDates ?? []).map((d) => this.formatDateLabel(d));
    const datePart = dates.length ? dates.join(', ') : 'sin fechas';
    const timePart = this.hasDateTimeWindow(p) ? `${open}–${close}` : 'todo el día';
    return `${datePart} · ${timePart} · auto al abrir mesa`;
  }

  formatDateLabel(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
    if (!m) return iso;
    return `${m[3]}/${m[2]}`;
  }

  setScheduleMode(index: number, mode: 'always' | 'weekly' | 'dates'): void {
    this.promos.update((list) =>
      list.map((p, i) => {
        if (i !== index) return p;
        if (mode === 'always') return { ...p, schedule: null, validDates: null };
        if (mode === 'weekly') {
          const open = this.scheduleOpen(p) || '12:00';
          const close = this.scheduleClose(p) || '20:30';
          const day = [{ open, close }];
          // Default: miércoles (2x1 típico); si ya había días, se conservan abajo.
          const prevDays = this.selectedWeekdays(p);
          const keys = prevDays.length ? prevDays : [3];
          const schedule: NonNullable<ShopPromo['schedule']> = {};
          for (const d of keys) schedule[String(d)] = day;
          return { ...p, schedule, validDates: null };
        }
        // dates
        const dates = p.validDates?.length ? [...p.validDates] : [this.todayKey()];
        return { ...p, validDates: dates, schedule: null };
      }),
    );
  }

  selectedWeekdays(p: ShopPromo): number[] {
    const out: number[] = [];
    for (let d = 0; d <= 6; d++) {
      const w = p.schedule?.[String(d)];
      if (Array.isArray(w) && w.length) out.push(d);
    }
    return out;
  }

  isWeekdayOn(p: ShopPromo, day: number): boolean {
    return this.selectedWeekdays(p).includes(day);
  }

  toggleWeekday(index: number, day: number): void {
    const p = this.promos()[index];
    if (!p) return;
    const open = this.scheduleOpen(p) || '12:00';
    const close = this.scheduleClose(p) || '20:30';
    const win = [{ open, close }];
    const on = new Set(this.selectedWeekdays(p));
    if (on.has(day)) on.delete(day);
    else on.add(day);
    if (!on.size) on.add(day); // al menos un día
    const schedule: NonNullable<ShopPromo['schedule']> = {};
    for (const d of on) schedule[String(d)] = win;
    this.promos.update((list) =>
      list.map((row, i) => (i === index ? { ...row, schedule, validDates: null } : row)),
    );
  }

  scheduleOpen(p: ShopPromo): string {
    for (let d = 0; d <= 6; d++) {
      const w = p.schedule?.[String(d)];
      if (Array.isArray(w) && w[0]?.open) return w[0].open;
    }
    return '12:00';
  }

  scheduleClose(p: ShopPromo): string {
    for (let d = 0; d <= 6; d++) {
      const w = p.schedule?.[String(d)];
      if (Array.isArray(w) && w[0]?.close) return w[0].close;
    }
    return '20:30';
  }

  setScheduleOpen(index: number, open: string): void {
    this.setScheduleWindow(index, open, this.scheduleClose(this.promos()[index]));
  }

  setScheduleClose(index: number, close: string): void {
    this.setScheduleWindow(index, this.scheduleOpen(this.promos()[index]), close);
  }

  private setScheduleWindow(index: number, open: string, close: string): void {
    const p = this.promos()[index];
    if (!p) return;
    const win = [{ open: open || '12:00', close: close || '20:30' }];
    const mode = this.scheduleMode(p);
    const schedule: NonNullable<ShopPromo['schedule']> = {};
    if (mode === 'dates') {
      for (let d = 0; d <= 6; d++) schedule[String(d)] = win;
      this.promos.update((list) =>
        list.map((row, i) => (i === index ? { ...row, schedule } : row)),
      );
      return;
    }
    const days = this.selectedWeekdays(p);
    for (const d of days.length ? days : [3]) schedule[String(d)] = win;
    this.promos.update((list) =>
      list.map((row, i) => (i === index ? { ...row, schedule, validDates: null } : row)),
    );
  }

  hasDateTimeWindow(p: ShopPromo): boolean {
    return !!(p.schedule && Object.keys(p.schedule).length);
  }

  setDatesAllDay(index: number, allDay: boolean): void {
    this.promos.update((list) =>
      list.map((p, i) => {
        if (i !== index) return p;
        if (allDay) return { ...p, schedule: null };
        const open = this.scheduleOpen(p) || '12:00';
        const close = this.scheduleClose(p) || '20:30';
        const win = [{ open, close }];
        const schedule: NonNullable<ShopPromo['schedule']> = {};
        for (let d = 0; d <= 6; d++) schedule[String(d)] = win;
        return { ...p, schedule };
      }),
    );
  }

  todayKey(): string {
    return this.dateToKey(new Date());
  }

  dateToKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  dateDraft(index: number): Date | null {
    return this.dateDrafts()[index] ?? null;
  }

  pickExtraDate(index: number, value: Date | null): void {
    if (!value || !(value instanceof Date) || Number.isNaN(value.getTime())) return;
    this.addValidDate(index, this.dateToKey(value));
    this.dateDrafts.update((cur) => ({ ...cur, [index]: null }));
  }

  addTodayDate(index: number): void {
    this.addValidDate(index, this.todayKey());
  }

  addValidDate(index: number, date: string): void {
    const d = String(date ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    this.promos.update((list) =>
      list.map((p, i) => {
        if (i !== index) return p;
        const cur = [...(p.validDates ?? [])];
        if (!cur.includes(d)) cur.push(d);
        cur.sort();
        return { ...p, validDates: cur };
      }),
    );
  }

  removeValidDate(index: number, date: string): void {
    this.promos.update((list) =>
      list.map((p, i) => {
        if (i !== index) return p;
        const next = (p.validDates ?? []).filter((x) => x !== date);
        return { ...p, validDates: next.length ? next : null };
      }),
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
        validDates: p.validDates?.length ? p.validDates : null,
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
