import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { environment } from '../../../environments/environment';
import {
  clearClosingDraft,
  persistClosingDraft,
  readClosingDraft,
  type ClosingFormDraft,
} from '../closings/closing-form-draft';
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

type FulfillmentBucket = {
  cashTotal: number;
  transferTotal: number;
  total: number;
  orderCount: number;
  unitsSold: number;
};

type ClosingSummary = {
  businessDate: string;
  shiftId: string;
  shiftName: string;
  opensAt: string;
  closesAt: string;
  orderCount: number;
  openCount: number;
  completedCount: number;
  cashTotal: number;
  transferTotal: number;
  total: number;
  unitsSold: number;
  defaultChangeAmount?: number;
  byFulfillment?: {
    TAKEAWAY: FulfillmentBucket;
    DELIVERY: FulfillmentBucket;
    COUNTER: FulfillmentBucket;
  };
};

@Component({
  selector: 'app-ordering-catalog-panel',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    SelectSearchComponent,
  ],
  template: `
    <section class="ocp">
      <header class="ocp__head">
        <h2>Configurar pedidos online</h2>
        <p>
          Alta/baja de envío, medios de pago, ítems y extras. CBU/alias y WhatsApp: en Configuración del
          local → Pedidos. Crear ítems/extras y fotos: en Carta.
        </p>
      </header>

      @if (loading()) {
        <p class="ocp__hint">Cargando…</p>
      } @else {
        <div class="ocp__toggles">
          <div class="ocp__toggle ocp__toggle--focus">
            <div>
              <strong>{{ localOpen ? 'Local abierto' : 'Local cerrado' }}</strong>
              <span>
                {{
                  localOpen
                    ? 'Los clientes pueden pedir según el horario'
                    : 'La página pública no acepta pedidos nuevos'
                }}
              </span>
            </div>
            <mat-slide-toggle
              [ngModel]="localOpen"
              (ngModelChange)="onLocalOpenChange($event)"
              [disabled]="togglingOpen()"
              name="localOpen"
              aria-label="Local abierto"
            />
          </div>
          <div class="ocp__toggle">
            <div>
              <strong>Take away</strong>
              <span>Retiro en el local</span>
            </div>
            <mat-slide-toggle
              [(ngModel)]="takeawayEnabled"
              name="takeawayEnabled"
              aria-label="Take away"
            />
          </div>
          <div class="ocp__toggle">
            <div>
              <strong>Delivery</strong>
              <span>Envío a domicilio</span>
            </div>
            <mat-slide-toggle
              [(ngModel)]="deliveryEnabled"
              name="deliveryEnabled"
              aria-label="Delivery"
            />
          </div>
          <div class="ocp__toggle">
            <div><strong>Efectivo</strong></div>
            <mat-slide-toggle [(ngModel)]="payCash" name="payCash" aria-label="Efectivo" />
          </div>
          <div class="ocp__toggle">
            <div><strong>Transferencia</strong></div>
            <mat-slide-toggle
              [(ngModel)]="payTransfer"
              name="payTransfer"
              aria-label="Transferencia"
            />
          </div>
        </div>

        @if (canCreateClosing()) {
          <div class="ocp__closing">
            <button
              mat-stroked-button
              color="primary"
              type="button"
              class="ocp__closing-btn"
              [disabled]="generatingClosing()"
              (click)="generateClosing()"
            >
              <mat-icon>point_of_sale</mat-icon>
              {{ generatingClosing() ? 'Preparando…' : 'Generar cierre' }}
            </button>
            <p class="ocp__hint">
              Arma un cierre del turno vigente con efectivo, transferencias y unidades de los pedidos
              de ese turno. También marca el local como cerrado.
            </p>
          </div>
        }

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
    .ocp__head {
      text-align: center;
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
      text-align: center;
    }
    .ocp__sub {
      margin: 0.65rem 0 0;
      font-size: 0.95rem;
      color: var(--guy-navy, #003366);
      text-align: center;
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
      text-align: left;
    }
    .ocp__toggle--focus {
      padding: 0.65rem 0.75rem;
      margin: 0 -0.15rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 12px;
      background: #f4f8f6;
      border-bottom: 1px solid var(--guy-border, #d7e0d9);
    }
    .ocp__toggle span {
      display: block;
      font-size: 0.8rem;
      color: var(--guy-muted, #5f6f76);
    }
    .ocp__closing {
      display: grid;
      gap: 0.45rem;
      padding: 0.75rem 0 0.25rem;
      justify-items: center;
      text-align: center;
    }
    .ocp__closing-btn {
      justify-self: center;
    }
    .ocp__save {
      margin-top: 0.35rem;
      display: flex;
      justify-content: center;
    }
  `,
})
export class OrderingCatalogPanelComponent {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly togglingOpen = signal(false);
  readonly generatingClosing = signal(false);
  readonly items = signal<ToggleRow[]>([]);
  readonly extras = signal<ToggleRow[]>([]);
  readonly itemQuery = signal('');
  readonly extraQuery = signal('');

  localOpen = true;
  takeawayEnabled = true;
  deliveryEnabled = false;
  payCash = true;
  payTransfer = true;

  readonly filteredItems = computed(() =>
    filterBySelectQuery(this.items(), this.itemQuery(), (it) => `${it.name} ${it.detail ?? ''}`),
  );
  readonly filteredExtras = computed(() =>
    filterBySelectQuery(this.extras(), this.extraQuery(), (ex) => `${ex.name} ${ex.detail ?? ''}`),
  );

  readonly canCreateClosing = computed(() =>
    hasShopPermission(this.auth.currentUser(), this.shops.selectedShopId(), 'closings.create'),
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

  onLocalOpenChange(open: boolean): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const prev = this.localOpen;
    this.localOpen = open;
    this.togglingOpen.set(true);
    this.http
      .patch(`${environment.apiUrl}/shops/${shopId}/ordering-catalog`, {
        orderingForceClosed: !open,
      })
      .subscribe({
        next: (shop: any) => {
          this.togglingOpen.set(false);
          this.localOpen = !shop?.orderingForceClosed;
          this.shops.upsertShop(shop);
          this.snack.open(
            this.localOpen ? 'Local abierto para pedidos' : 'Local cerrado para pedidos',
            'OK',
            { duration: 2200 },
          );
        },
        error: (err: HttpErrorResponse) => {
          this.togglingOpen.set(false);
          this.localOpen = prev;
          this.snack.open(err.error?.message ?? 'No se pudo cambiar el estado', 'OK', {
            duration: 3500,
          });
        },
      });
  }

  generateClosing(): void {
    const shopId = this.shops.selectedShopId();
    const userId = this.auth.currentUser()?.id;
    const shop = this.shops.selectedShop();
    if (!shopId || !userId || !shop) return;

    const existing = readClosingDraft(shopId, userId);
    if (existing) {
      const ok = window.confirm(
        'Hay un cierre en borrador. ¿Reemplazarlo con los totales de pedidos del turno?',
      );
      if (!ok) return;
    }

    this.generatingClosing.set(true);
    // Sin shiftId fijo: la API elige el turno con ventas (si Mañana recién abrió, usa el anterior).
    this.http
      .get<ClosingSummary>(
        `${environment.apiUrl}/shops/${shopId}/customer-orders/closing-summary`,
      )
      .subscribe({
        next: (summary) => {
          if (summary.openCount > 0) {
            const cont = window.confirm(
              `Hay ${summary.openCount} pedido(s) todavía abiertos del turno «${summary.shiftName}». ¿Generar el cierre igual?`,
            );
            if (!cont) {
              this.generatingClosing.set(false);
              return;
            }
          }

          clearClosingDraft();
          const draft = this.buildClosingDraft(shopId, userId, summary);
          persistClosingDraft(draft);

          this.http
            .patch(`${environment.apiUrl}/shops/${shopId}/ordering-catalog`, {
              orderingForceClosed: true,
            })
            .subscribe({
              next: (updated: any) => {
                this.localOpen = false;
                this.shops.upsertShop(updated);
                this.generatingClosing.set(false);
                this.snack.open(
                  summary.orderCount
                    ? `Cierre del turno «${summary.shiftName}»: ${summary.orderCount} pedido(s)`
                    : `Cierre del turno «${summary.shiftName}» (sin pedidos)`,
                  'OK',
                  { duration: 3200 },
                );
                void this.router.navigate(['/closings/new']);
              },
              error: () => {
                this.generatingClosing.set(false);
                this.snack.open('Borrador armado; no se pudo cerrar el local', 'OK', {
                  duration: 3500,
                });
                void this.router.navigate(['/closings/new']);
              },
            });
        },
        error: (err: HttpErrorResponse) => {
          this.generatingClosing.set(false);
          this.snack.open(err.error?.message ?? 'No se pudo armar el resumen de pedidos', 'OK', {
            duration: 3500,
          });
        },
      });
  }

  private buildClosingDraft(
    shopId: string,
    userId: string,
    summary: ClosingSummary,
  ): ClosingFormDraft {
    const shop = this.shops.selectedShop();
    const opening =
      summary.defaultChangeAmount != null && summary.defaultChangeAmount > 0
        ? summary.defaultChangeAmount
        : (shop?.defaultChangeAmount ?? null);

    const otherCobros: Array<{
      label: string;
      amount: number;
      paymentMethod: 'CASH' | 'TRANSFER';
    }> = [];
    const by = summary.byFulfillment;
    const pushCobro = (
      label: string,
      amount: number,
      paymentMethod: 'CASH' | 'TRANSFER',
    ) => {
      if (amount > 0) otherCobros.push({ label, amount, paymentMethod });
    };
    if (by) {
      pushCobro('Pedidos take away (efectivo)', by.TAKEAWAY.cashTotal, 'CASH');
      pushCobro('Pedidos take away (transf.)', by.TAKEAWAY.transferTotal, 'TRANSFER');
      pushCobro('Pedidos delivery (efectivo)', by.DELIVERY.cashTotal, 'CASH');
      pushCobro('Pedidos delivery (transf.)', by.DELIVERY.transferTotal, 'TRANSFER');
      pushCobro('Pedidos mostrador (efectivo)', by.COUNTER.cashTotal, 'CASH');
      pushCobro('Pedidos mostrador (transf.)', by.COUNTER.transferTotal, 'TRANSFER');
    } else {
      pushCobro('Pedidos online (efectivo)', summary.cashTotal, 'CASH');
      pushCobro('Pedidos online (transferencia)', summary.transferTotal, 'TRANSFER');
    }

    const notesParts = [
      `Pedidos · ${summary.shiftName} (${summary.opensAt}–${summary.closesAt})`,
      summary.businessDate,
      `${summary.orderCount} pedido(s)`,
      summary.completedCount ? `${summary.completedCount} completado(s)` : null,
      summary.openCount ? `${summary.openCount} abierto(s)` : null,
      by?.COUNTER?.orderCount ? `${by.COUNTER.orderCount} mostrador` : null,
      by?.TAKEAWAY?.orderCount ? `${by.TAKEAWAY.orderCount} take away` : null,
      by?.DELIVERY?.orderCount ? `${by.DELIVERY.orderCount} delivery` : null,
    ].filter(Boolean);

    return {
      v: 1,
      shopId,
      userId,
      savedAt: Date.now(),
      tipDraft: null,
      form: {
        businessDate: summary.businessDate,
        shiftId: summary.shiftId,
        cashOpeningAmount: opening,
        cashLeftInRegister: opening,
        cashAmount: summary.cashTotal > 0 ? summary.cashTotal : null,
        cardAmount: null,
        mercadoPagoAmount: null,
        accountDniAmount: null,
        deliveryAppsAmount: null,
        transferAmount: null,
        posSystemAmount: null,
        unitsSold: summary.unitsSold > 0 ? summary.unitsSold : null,
        coversCount: null,
        cashWithdrawn: null,
        cashWithdrawnByUserId: '',
        cashWithdrawnToAccountId: '',
        tipsAmount: null,
        notes: notesParts.join(' · '),
        otherCobros,
        expenses: [],
        dniTransfers: [],
        posnetAmounts: [],
        sourceAmounts: [],
      },
    };
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
        orderingForceClosed?: boolean;
        takeawayEnabled?: boolean;
        deliveryEnabled?: boolean;
        orderingPayments?: {
          methods?: Array<'CASH' | 'TRANSFER'>;
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
          this.localOpen = !s.orderingForceClosed;
          this.takeawayEnabled = s.takeawayEnabled !== false;
          this.deliveryEnabled = !!s.deliveryEnabled;
          const methods = s.orderingPayments?.methods;
          this.payCash = !methods || methods.includes('CASH');
          this.payTransfer = !methods || methods.includes('TRANSFER');
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
        orderingForceClosed: !this.localOpen,
        takeawayEnabled: this.takeawayEnabled,
        deliveryEnabled: this.deliveryEnabled,
        orderingPayments: {
          methods,
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
        next: (shop: any) => {
          this.saving.set(false);
          this.localOpen = !shop?.orderingForceClosed;
          this.shops.upsertShop(shop);
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
