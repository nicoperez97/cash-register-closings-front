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
import { hasShopPermission, canManageShop } from '../../core/auth/auth.models';
import {
  canSeeOrderingConfig,
  normalizeOrderingConfigVisibility,
  type OrderingConfigVisibilityKey,
} from '../../shared/ordering-config-visibility';
import { environment } from '../../../environments/environment';
import {
  clearClosingDraft,
  persistClosingDraft,
  readClosingDraft,
  type ClosingFormDraft,
} from '../closings/closing-form-draft';
import { ClosingsApiService, type CashClosing } from '../closings/closings-api.service';
import {
  SelectSearchComponent,
  filterBySelectQuery,
} from '../../shared/components/select-search';
import { formatMoney } from '../../shared/utils/money';
import { apiErrorMessage } from './ordering-ui.util';

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
  deliverate?: {
    closingSourceId: string | null;
    paymentMethod: 'CASH' | 'TRANSFER';
    includeInDeclared: boolean;
    amount: number;
    cashTotal: number;
    transferTotal: number;
    orderCount: number;
    unitsSold: number;
  } | null;
  tables?: {
    closedCount: number;
    coversTotal: number;
    ticketTotal: number;
    tipTotal: number;
    cashTotal: number;
    transferTotal: number;
    cardTotal: number;
    paymentsByMethod: Array<{
      paymentMethodId: string;
      paymentMethodName: string;
      amount: number;
      kind: 'CASH' | 'TRANSFER' | 'CARD' | string;
    }>;
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
        <h2>Configurar canales</h2>
        <p>
          Alta/baja de envío, medios de pago, ítems y extras. CBU/alias y WhatsApp: en Configuración del
          local → Pedidos. Crear ítems/extras y fotos: en Carta.
        </p>
      </header>

      @if (loading()) {
        <p class="ocp__hint">Cargando…</p>
      } @else {
        @if (shiftActiveClosed() && !openClosing() && showCaja()) {
          <div class="ocp__alert" role="status">
            El turno ya empezó y no hay caja abierta. Abrí la caja para recibir pedidos online.
          </div>
        }
        @if (justAutoClosed() && showCaja()) {
          <div class="ocp__alert ocp__alert--info" role="status">
            El local se cerró solo al finalizar el turno. Abrí la caja del próximo turno para volver a
            recibir.
          </div>
        }

        @if (showCaja()) {
        <div class="ocp__caja">
          @if (openClosing(); as caja) {
            <div class="ocp__caja-open">
              <div>
                <strong>Caja abierta</strong>
                <span>
                  Turno {{ caja.shiftName || '—' }} · cambio
                  {{ money(caja.cashOpeningAmount ?? 0) }} · pedidos online habilitados
                </span>
              </div>
              @if (canCreateClosing()) {
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  [disabled]="generatingClosing()"
                  (click)="generateClosing()"
                >
                  <mat-icon>point_of_sale</mat-icon>
                  {{ generatingClosing() ? 'Preparando…' : 'Generar cierre' }}
                </button>
              }
            </div>
            <p class="ocp__hint">
              Generar cierre arma el formulario con los pedidos de esta caja y cierra pedidos online.
              Al guardar el cierre se confirma.
            </p>
          } @else if (canOpenCaja()) {
            <div class="ocp__caja-closed">
              <div>
                <strong>Sin caja abierta</strong>
                <span>Antes de recibir pedidos online abrí la caja del turno con el efectivo de apertura.</span>
              </div>
              <div class="ocp__caja-open-form">
                <label class="ocp__caja-amount">
                  <span>Efectivo de apertura</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    [(ngModel)]="openingAmount"
                    name="openingAmount"
                    [disabled]="openingCaja()"
                  />
                </label>
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  [disabled]="openingCaja()"
                  (click)="openCaja()"
                >
                  <mat-icon>lock_open</mat-icon>
                  {{ openingCaja() ? 'Abriendo…' : 'Abrir caja' }}
                </button>
              </div>
            </div>
          } @else {
            <p class="ocp__hint">No hay caja abierta. Pedí a quien gestione cierres que la abra.</p>
          }
        </div>
        }

        @if (showChannels() || showPayments()) {
        <div class="ocp__toggles">
          @if (showChannels()) {
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
          }
          @if (showPayments()) {
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
          }
        </div>
        }

        @if (showItems()) {
        <div class="ocp__fold">
          <button
            type="button"
            class="ocp__fold-btn"
            [attr.aria-expanded]="itemsOpen()"
            (click)="itemsOpen.set(!itemsOpen())"
          >
            <span class="ocp__fold-copy">
              <strong>Ítems de la carta</strong>
              <span>Desactivá lo que no quieras vender online</span>
            </span>
            <mat-icon>{{ itemsOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
          </button>
          @if (itemsOpen()) {
            <div class="ocp__fold-body">
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
            </div>
          }
        </div>
        }

        @if (showExtras()) {
        <div class="ocp__fold">
          <button
            type="button"
            class="ocp__fold-btn"
            [attr.aria-expanded]="extrasOpen()"
            (click)="extrasOpen.set(!extrasOpen())"
          >
            <span class="ocp__fold-copy">
              <strong>Extras</strong>
              <span>Solo alta/baja. Para crear o editar extras, usá Carta</span>
            </span>
            <mat-icon>{{ extrasOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
          </button>
          @if (extrasOpen()) {
            <div class="ocp__fold-body">
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
            </div>
          }
        </div>
        }

        @if (showCatalogSave()) {
        <div class="ocp__save">
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="saving()"
            (click)="save()"
          >
            <mat-icon>save</mat-icon>
            {{ saving() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
        }
      }
    </section>
  `,
  styles: `
    .ocp {
      position: relative;
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
    .ocp__alert {
      padding: 0.75rem 0.9rem;
      border-radius: 12px;
      border: 1px solid #e2b86a;
      background: #fff8e8;
      color: #5c4816;
      font-size: 0.9rem;
      text-align: left;
      line-height: 1.35;
    }
    .ocp__alert--info {
      border-color: #9bb8d4;
      background: #eef5fb;
      color: #1e3a55;
    }
    .ocp__sub {
      margin: 0.65rem 0 0;
      font-size: 0.95rem;
      color: var(--guy-navy, #003366);
      text-align: center;
    }
    .ocp__fold {
      display: grid;
      gap: 0.55rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 12px;
      padding: 0.35rem 0.55rem 0.45rem;
      background: #fafbfa;
    }
    .ocp__fold-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      width: 100%;
      border: 0;
      background: transparent;
      padding: 0.45rem 0.25rem;
      cursor: pointer;
      text-align: left;
      font: inherit;
      color: inherit;
    }
    .ocp__fold-copy {
      display: grid;
      gap: 0.1rem;
      min-width: 0;
    }
    .ocp__fold-copy strong {
      font-size: 0.95rem;
      color: var(--guy-navy, #003366);
    }
    .ocp__fold-copy span {
      font-size: 0.8rem;
      color: var(--guy-muted, #5f6f76);
    }
    .ocp__fold-btn mat-icon {
      color: var(--guy-muted, #5f6f76);
      flex-shrink: 0;
    }
    .ocp__fold-body {
      display: grid;
      gap: 0.55rem;
      padding-bottom: 0.25rem;
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
    .ocp__caja {
      display: grid;
      gap: 0.55rem;
      padding: 0.85rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 12px;
      background: #f4f8f6;
    }
    .ocp__caja-open,
    .ocp__caja-closed {
      display: grid;
      gap: 0.65rem;
    }
    .ocp__caja-open strong,
    .ocp__caja-closed strong {
      display: block;
      font-size: 0.95rem;
    }
    .ocp__caja-open span,
    .ocp__caja-closed span {
      display: block;
      font-size: 0.82rem;
      color: var(--guy-muted, #5f6f76);
    }
    .ocp__caja-open-form {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
      align-items: end;
    }
    .ocp__caja-amount {
      display: grid;
      gap: 0.2rem;
      font-size: 0.8rem;
      color: var(--guy-muted, #5f6f76);
    }
    .ocp__caja-amount input {
      width: 8.5rem;
      padding: 0.45rem 0.55rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 8px;
      font: inherit;
    }
    .ocp__save {
      display: flex;
      justify-content: center;
      margin-top: 0.15rem;
    }
  `,
})
export class OrderingCatalogPanelComponent {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly closingsApi = inject(ClosingsApiService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly openingCaja = signal(false);
  readonly generatingClosing = signal(false);
  readonly openClosing = signal<CashClosing | null>(null);
  readonly items = signal<ToggleRow[]>([]);
  readonly extras = signal<ToggleRow[]>([]);
  readonly itemQuery = signal('');
  readonly extraQuery = signal('');
  readonly itemsOpen = signal(false);
  readonly extrasOpen = signal(false);
  readonly shiftActiveClosed = signal(false);
  readonly justAutoClosed = signal(false);

  openingAmount: number | null = null;
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

  readonly canOpenCaja = computed(() => {
    const shopId = this.shops.selectedShopId();
    const user = this.auth.currentUser();
    return (
      hasShopPermission(user, shopId, 'closings.create') ||
      hasShopPermission(user, shopId, 'orderingCatalog.manage') ||
      hasShopPermission(user, shopId, 'customerOrders.manage')
    );
  });

  private readonly orderingConfigVis = computed(() => {
    const shopId = this.shops.selectedShopId();
    const user = this.auth.currentUser();
    if (canManageShop(user, shopId)) return normalizeOrderingConfigVisibility(null);
    const shop = this.shops.selectedShop();
    return normalizeOrderingConfigVisibility(shop?.orderingConfigVisibility ?? null);
  });

  private sees(key: OrderingConfigVisibilityKey): boolean {
    return canSeeOrderingConfig(this.orderingConfigVis(), key);
  }

  readonly showCaja = computed(() => this.sees('caja'));
  readonly showChannels = computed(() => this.sees('channels'));
  readonly showPayments = computed(() => this.sees('payments'));
  readonly showItems = computed(() => this.sees('items'));
  readonly showExtras = computed(() => this.sees('extras'));
  readonly showCatalogSave = computed(
    () =>
      this.showChannels() || this.showPayments() || this.showItems() || this.showExtras(),
  );

  constructor() {
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) return;
      this.reload(shopId);
    });
  }

  money(n: number): string {
    return formatMoney(n);
  }

  setItemAvailable(id: string, available: boolean): void {
    this.items.update((list) => list.map((it) => (it.id === id ? { ...it, available } : it)));
  }

  setExtraAvailable(id: string, available: boolean): void {
    this.extras.update((list) => list.map((ex) => (ex.id === id ? { ...ex, available } : ex)));
  }

  openCaja(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canOpenCaja()) return;
    const amount = Number(this.openingAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      this.snack.open('Ingresá el efectivo de apertura', 'OK', { duration: 3000 });
      return;
    }
    this.openingCaja.set(true);
    this.closingsApi.openRegister(shopId, { cashOpeningAmount: amount }).subscribe({
      next: (caja) => {
        this.openingCaja.set(false);
        this.openClosing.set(caja);
        this.shiftActiveClosed.set(false);
        this.justAutoClosed.set(false);
        const shop = this.shops.selectedShop();
        if (shop) {
          this.shops.upsertShop({
            ...shop,
            orderingForceClosed: false,
          });
        }
        this.snack.open(
          `Caja abierta · ${caja.shiftName || 'turno'} · cambio ${this.money(caja.cashOpeningAmount ?? 0)}`,
          'OK',
          { duration: 2800 },
        );
      },
      error: (err: HttpErrorResponse) => {
        this.openingCaja.set(false);
        this.snack.open(apiErrorMessage(err, 'No se pudo abrir la caja'), 'OK', {
          duration: 4500,
        });
      },
    });
  }

  generateClosing(): void {
    const shopId = this.shops.selectedShopId();
    const userId = this.auth.currentUser()?.id;
    const shop = this.shops.selectedShop();
    const caja = this.openClosing();
    if (!shopId || !userId || !shop) return;
    if (!caja?.id) {
      this.snack.open('Abrí la caja del turno antes de generar el cierre', 'OK', {
        duration: 3500,
      });
      return;
    }

    const existing = readClosingDraft(shopId, userId);
    if (existing) {
      const ok = window.confirm(
        'Hay un cierre en borrador. ¿Reemplazarlo con los totales de pedidos y mesas del turno?',
      );
      if (!ok) return;
    }

    this.generatingClosing.set(true);
    const params = new URLSearchParams();
    if (caja.shiftId) params.set('shiftId', caja.shiftId);
    if (caja.businessDate) params.set('businessDate', String(caja.businessDate).slice(0, 10));
    const qs = params.toString();
    this.http
      .get<ClosingSummary>(
        `${environment.apiUrl}/shops/${shopId}/customer-orders/closing-summary${qs ? `?${qs}` : ''}`,
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
          const draft = this.buildClosingDraft(shopId, userId, summary, caja);
          persistClosingDraft(draft);

          this.http
            .patch(`${environment.apiUrl}/shops/${shopId}/ordering-catalog`, {
              orderingForceClosed: true,
            })
            .subscribe({
              next: (updated: any) => {
                this.shops.upsertShop(updated);
                this.generatingClosing.set(false);
                const mesas = summary.tables?.closedCount ?? 0;
                const bits = [
                  `Cierre del turno «${summary.shiftName}»`,
                  summary.orderCount ? `${summary.orderCount} pedido(s)` : null,
                  mesas ? `${mesas} mesa(s)` : null,
                ].filter(Boolean);
                this.snack.open(
                  bits.length > 1 ? bits.join(': ') : `${bits[0]} (sin movimientos)`,
                  'OK',
                  { duration: 3200 },
                );
                void this.router.navigate(['/closings/new']);
              },
              error: () => {
                clearClosingDraft();
                this.generatingClosing.set(false);
                this.snack.open(
                  'No se pudo cerrar pedidos online. El borrador no se abrió para evitar pedidos nuevos durante el cierre.',
                  'OK',
                  { duration: 5000 },
                );
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
    caja?: CashClosing | null,
  ): ClosingFormDraft {
    const shop = this.shops.selectedShop();
    const openingFromCaja =
      caja?.cashOpeningAmount != null && Number(caja.cashOpeningAmount) >= 0
        ? Number(caja.cashOpeningAmount)
        : null;
    const opening =
      openingFromCaja ??
      (summary.defaultChangeAmount != null && summary.defaultChangeAmount > 0
        ? summary.defaultChangeAmount
        : (shop?.defaultChangeAmount ?? null));

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

    const tables = summary.tables;
    if (tables) {
      for (const m of tables.paymentsByMethod ?? []) {
        if (!(m.amount > 0)) continue;
        const kind = String(m.kind || '').toUpperCase();
        if (kind === 'CARD') continue; // va a cardAmount / PVS
        pushCobro(
          `Mesas · ${m.paymentMethodName}`,
          m.amount,
          kind === 'TRANSFER' ? 'TRANSFER' : 'CASH',
        );
      }
    }

    const deliverate = summary.deliverate;
    const sourceAmounts =
      deliverate?.closingSourceId && deliverate.amount > 0
        ? [
            {
              sourceId: deliverate.closingSourceId,
              name: 'Deliverate',
              includeInDeclared: !!deliverate.includeInDeclared,
              kind: 'OWN_ACCOUNT' as const,
              amount: deliverate.amount,
              lines: [deliverate.amount],
            },
          ]
        : [];

    const notesParts = [
      `Turno · ${summary.shiftName} (${summary.opensAt}–${summary.closesAt})`,
      summary.businessDate,
      summary.orderCount ? `${summary.orderCount} pedido(s)` : null,
      summary.completedCount ? `${summary.completedCount} completado(s)` : null,
      summary.openCount ? `${summary.openCount} abierto(s)` : null,
      by?.COUNTER?.orderCount ? `${by.COUNTER.orderCount} mostrador` : null,
      by?.TAKEAWAY?.orderCount ? `${by.TAKEAWAY.orderCount} take away` : null,
      by?.DELIVERY?.orderCount ? `${by.DELIVERY.orderCount} delivery` : null,
      deliverate?.orderCount
        ? `${deliverate.orderCount} Deliverate (${deliverate.paymentMethod === 'TRANSFER' ? 'transf.' : 'efectivo'})`
        : null,
      tables?.closedCount ? `${tables.closedCount} mesa(s) cerrada(s)` : null,
      tables?.tipTotal ? `propinas mesas ${this.money(tables.tipTotal)}` : null,
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
        cardAmount: tables?.cardTotal && tables.cardTotal > 0 ? tables.cardTotal : null,
        mercadoPagoAmount: null,
        accountDniAmount: null,
        deliveryAppsAmount: null,
        transferAmount: null,
        posSystemAmount: null,
        unitsSold: summary.unitsSold > 0 ? summary.unitsSold : null,
        coversCount: tables?.coversTotal && tables.coversTotal > 0 ? tables.coversTotal : null,
        cashWithdrawn: null,
        cashWithdrawnByUserId: '',
        cashWithdrawnToAccountId: '',
        tipsAmount: tables?.tipTotal && tables.tipTotal > 0 ? tables.tipTotal : null,
        notes: notesParts.join(' · '),
        otherCobros,
        expenses: [],
        dniTransfers: [],
        posnetAmounts: [],
        sourceAmounts,
      },
    };
  }

  private reload(shopId: string): void {
    this.loading.set(true);
    this.openingAmount = this.shops.selectedShop()?.defaultChangeAmount ?? this.openingAmount;
    this.closingsApi.getOpen(shopId).subscribe({
      next: (caja) => this.openClosing.set(caja ?? null),
      error: () => this.openClosing.set(null),
    });
    this.http
      .get<{
        orderingForceClosed?: boolean;
        orderingShiftActive?: boolean;
        orderingJustAutoClosed?: boolean;
        takeawayEnabled?: boolean;
        deliveryEnabled?: boolean;
        defaultChangeAmount?: number | null;
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
          const open = !s.orderingForceClosed;
          this.shiftActiveClosed.set(!!s.orderingShiftActive && !open);
          this.justAutoClosed.set(!!s.orderingJustAutoClosed);
          if (s.orderingJustAutoClosed) {
            this.snack.open('El local se cerró solo al finalizar el turno', 'OK', {
              duration: 4200,
            });
          }
          if (this.openingAmount == null && s.defaultChangeAmount != null) {
            this.openingAmount = Number(s.defaultChangeAmount) || 0;
          }
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
    if (!shopId || !this.showCatalogSave()) return;
    this.saving.set(true);
    const body: Record<string, unknown> = {};
    if (this.showChannels()) {
      body['takeawayEnabled'] = this.takeawayEnabled;
      body['deliveryEnabled'] = this.deliveryEnabled;
    }
    if (this.showPayments()) {
      const methods: Array<'CASH' | 'TRANSFER'> = [
        ...(this.payCash ? (['CASH'] as const) : []),
        ...(this.payTransfer ? (['TRANSFER'] as const) : []),
      ];
      body['orderingPayments'] = { methods };
    }
    if (this.showItems()) {
      body['menuItemAvailability'] = this.items().map((it) => ({
        id: it.id,
        available: it.available,
      }));
    }
    if (this.showExtras()) {
      body['orderingExtraAvailability'] = this.extras().map((ex) => ({
        id: ex.id,
        available: ex.available,
      }));
    }
    this.http
      .patch(`${environment.apiUrl}/shops/${shopId}/ordering-catalog`, body)
      .subscribe({
        next: (shop: any) => {
          this.saving.set(false);
          this.justAutoClosed.set(false);
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
