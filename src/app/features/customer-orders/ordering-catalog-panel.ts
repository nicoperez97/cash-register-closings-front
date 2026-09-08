import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { environment } from '../../../environments/environment';
import {
  SelectSearchComponent,
  filterBySelectQuery,
} from '../../shared/components/select-search';

type ToggleRow = {
  id: string;
  name: string;
  detail?: string;
  available: boolean;
};

@Component({
  selector: 'app-ordering-catalog-panel',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    SelectSearchComponent,
  ],
  template: `
    <section class="ocp">
      <header class="ocp__head">
        <h2>Configurar pedidos online</h2>
        <p>Alta/baja de envío, pagos, ítems y extras. Crear o editar ítems/extras y fotos: en Carta.</p>
      </header>

      @if (loading()) {
        <p class="ocp__hint">Cargando…</p>
      } @else {
        <div class="ocp__toggles">
          <div class="ocp__toggle">
            <div>
              <strong>Take away</strong>
              <span>Retiro en el local</span>
            </div>
            <mat-slide-toggle [(ngModel)]="takeawayEnabled" aria-label="Take away" />
          </div>
          <div class="ocp__toggle">
            <div>
              <strong>Delivery</strong>
              <span>Envío a domicilio</span>
            </div>
            <mat-slide-toggle [(ngModel)]="deliveryEnabled" aria-label="Delivery" />
          </div>
          <div class="ocp__toggle">
            <div><strong>Efectivo</strong></div>
            <mat-slide-toggle [(ngModel)]="payCash" aria-label="Efectivo" />
          </div>
          <div class="ocp__toggle">
            <div><strong>Transferencia</strong></div>
            <mat-slide-toggle [(ngModel)]="payTransfer" aria-label="Transferencia" />
          </div>
        </div>

        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="ocp__full">
          <mat-label>Datos de transferencia (CBU / alias)</mat-label>
          <textarea matInput rows="2" [(ngModel)]="transferInstructions"></textarea>
        </mat-form-field>

        <h3 class="ocp__sub">Ítems de la carta</h3>
        <p class="ocp__hint">Desactivá lo que no quieras vender online.</p>
        <div class="ocp__search">
          <app-select-search [(query)]="itemQuery" placeholder="Buscar ítem…" />
        </div>
        @for (it of filteredItems(); track it.id) {
          <div class="ocp__toggle">
            <div>
              <strong>{{ it.name }}</strong>
              @if (it.detail) {
                <span>{{ it.detail }}</span>
              }
            </div>
            <mat-slide-toggle
              [ngModel]="it.available"
              (ngModelChange)="setItemAvailable(it.id, $event)"
              [attr.aria-label]="'Disponible ' + it.name"
            />
          </div>
        } @empty {
          <p class="ocp__hint">No hay ítems en la carta o no coinciden con la búsqueda.</p>
        }

        <h3 class="ocp__sub">Extras</h3>
        <p class="ocp__hint">Solo alta/baja. Para crear o editar extras, usá Carta.</p>
        <div class="ocp__search">
          <app-select-search [(query)]="extraQuery" placeholder="Buscar extra…" />
        </div>
        @for (ex of filteredExtras(); track ex.id) {
          <div class="ocp__toggle">
            <div>
              <strong>{{ ex.name }}</strong>
              @if (ex.detail) {
                <span>{{ ex.detail }}</span>
              }
            </div>
            <mat-slide-toggle
              [ngModel]="ex.available"
              (ngModelChange)="setExtraAvailable(ex.id, $event)"
              [attr.aria-label]="'Disponible ' + ex.name"
            />
          </div>
        } @empty {
          <p class="ocp__hint">Todavía no hay extras, o no coinciden con la búsqueda.</p>
        }

        <div class="ocp__save">
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="saving()"
            (click)="save()"
          >
            <mat-icon>save</mat-icon>
            {{ saving() ? 'Guardando…' : 'Guardar configuración' }}
          </button>
        </div>
      }
    </section>
  `,
  styles: `
    .ocp {
      display: grid;
      gap: 0.85rem;
      padding: 1rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 14px;
      background: var(--guy-card, #fff);
    }
    .ocp__head h2 {
      margin: 0 0 0.25rem;
      font-size: 1.05rem;
      color: var(--guy-navy, #003366);
    }
    .ocp__head p,
    .ocp__hint {
      margin: 0;
      font-size: 0.88rem;
      color: var(--guy-muted, #5f6f76);
    }
    .ocp__sub {
      margin: 0.65rem 0 0;
      font-size: 0.95rem;
      color: var(--guy-navy, #003366);
    }
    .ocp__search {
      padding: 0.45rem 0.65rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 10px;
      background: #f7f9f7;
    }
    .ocp__toggles {
      display: grid;
      gap: 0.55rem;
    }
    .ocp__toggle {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      padding: 0.45rem 0;
      border-bottom: 1px solid var(--guy-border, #d7e0d9);
    }
    .ocp__toggle span {
      display: block;
      font-size: 0.8rem;
      color: var(--guy-muted, #5f6f76);
    }
    .ocp__full {
      width: 100%;
    }
    .ocp__save {
      margin-top: 0.35rem;
    }
  `,
})
export class OrderingCatalogPanelComponent {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly shops = inject(ShopContextService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly items = signal<ToggleRow[]>([]);
  readonly extras = signal<ToggleRow[]>([]);
  readonly itemQuery = signal('');
  readonly extraQuery = signal('');

  takeawayEnabled = true;
  deliveryEnabled = false;
  payCash = true;
  payTransfer = true;
  transferInstructions = '';

  readonly filteredItems = computed(() =>
    filterBySelectQuery(this.items(), this.itemQuery(), (it) => `${it.name} ${it.detail ?? ''}`),
  );
  readonly filteredExtras = computed(() =>
    filterBySelectQuery(this.extras(), this.extraQuery(), (ex) => `${ex.name} ${ex.detail ?? ''}`),
  );

  constructor() {
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) return;
      this.reload(shopId);
    });
  }

  setItemAvailable(id: string, available: boolean): void {
    this.items.update((list) => list.map((it) => (it.id === id ? { ...it, available } : it)));
  }

  setExtraAvailable(id: string, available: boolean): void {
    this.extras.update((list) => list.map((ex) => (ex.id === id ? { ...ex, available } : ex)));
  }

  private money(n: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(n);
  }

  private reload(shopId: string): void {
    this.loading.set(true);
    this.http
      .get<{
        takeawayEnabled?: boolean;
        deliveryEnabled?: boolean;
        orderingPayments?: {
          methods?: Array<'CASH' | 'TRANSFER'>;
          transferInstructions?: string | null;
        } | null;
        orderingExtras?: Array<{
          id?: string;
          name: string;
          price: number;
          available?: boolean;
        }> | null;
      }>(`${environment.apiUrl}/shops/${shopId}`)
      .subscribe({
        next: (s) => {
          this.takeawayEnabled = s.takeawayEnabled !== false;
          this.deliveryEnabled = !!s.deliveryEnabled;
          const methods = s.orderingPayments?.methods;
          this.payCash = !methods || methods.includes('CASH');
          this.payTransfer = !methods || methods.includes('TRANSFER');
          this.transferInstructions = String(s.orderingPayments?.transferInstructions ?? '');
          this.extras.set(
            (s.orderingExtras ?? [])
              .filter((e) => String(e.name ?? '').trim())
              .map((e) => ({
                id: String(e.id ?? '').trim(),
                name: String(e.name ?? '').trim(),
                detail: this.money(Number(e.price) || 0),
                available: e.available !== false,
              }))
              .filter((e) => !!e.id),
          );
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snack.open('No se pudo cargar la configuración', 'OK', { duration: 3000 });
        },
      });

    this.http
      .get<{
        menus?: Array<{
          title?: string | null;
          sections?: Array<{
            name?: string;
            items?: Array<{
              id?: string;
              name?: string;
              price?: number | null;
              available?: boolean;
            }>;
          }>;
        }>;
      }>(`${environment.apiUrl}/shops/${shopId}/menu`)
      .subscribe({
        next: (res) => {
          const out: ToggleRow[] = [];
          const seen = new Set<string>();
          for (const menu of res.menus ?? []) {
            for (const sec of menu.sections ?? []) {
              for (const it of sec.items ?? []) {
                const id = String(it.id ?? '').trim();
                const name = String(it.name ?? '').trim();
                if (!id || !name || seen.has(id)) continue;
                seen.add(id);
                const price = it.price == null ? null : Number(it.price);
                out.push({
                  id,
                  name,
                  detail: [
                    sec.name ? String(sec.name) : '',
                    price != null && Number.isFinite(price) ? this.money(price) : '',
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  available: it.available !== false,
                });
              }
            }
          }
          this.items.set(out);
        },
        error: () => this.items.set([]),
      });
  }

  save(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.saving.set(true);
    const methods: Array<'CASH' | 'TRANSFER'> = [
      ...(this.payCash ? (['CASH'] as const) : []),
      ...(this.payTransfer ? (['TRANSFER'] as const) : []),
    ];
    this.http
      .patch(`${environment.apiUrl}/shops/${shopId}/ordering-catalog`, {
        takeawayEnabled: this.takeawayEnabled,
        deliveryEnabled: this.deliveryEnabled,
        orderingPayments: {
          methods,
          transferInstructions: this.transferInstructions.trim() || null,
        },
        menuItemAvailability: this.items().map((it) => ({
          id: it.id,
          available: it.available,
        })),
        orderingExtraAvailability: this.extras().map((ex) => ({
          id: ex.id,
          available: ex.available,
        })),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snack.open('Configuración guardada', 'OK', { duration: 2500 });
          this.reload(shopId);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.snack.open(err.error?.message ?? 'No se pudo guardar', 'OK', { duration: 3500 });
        },
      });
  }
}
