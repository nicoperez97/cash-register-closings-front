import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission, canManageShop } from '../../core/auth/auth.models';
import {
  canEditOrderingConfig,
  canSeeOrderingConfig,
  normalizeOrderingConfigVisibility,
  type OrderingConfigVisibilityKey,
} from '../../shared/ordering-config-visibility';
import { environment } from '../../../environments/environment';
import {
  clearClosingDraft,
  formatPendingClosingLabel,
  pendingClosingFromOpenCaja,
  persistClosingDraft,
  readClosingDraft,
  type PendingClosingNotice,
} from '../closings/closing-form-draft';
import {
  buildClosingDraftFromOrdersSummary,
  type ClosingSummary,
} from '../closings/closing-from-orders';
import { ClosingsApiService, type CashClosing, type ShopClosingSource } from '../closings/closings-api.service';
import { formatSuggestedOpeningHint } from '../closings/closings-form.utils';
import { catchError, forkJoin, of, Subject, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  SelectSearchComponent,
  filterBySelectQuery,
} from '../../shared/components/select-search';
import { formatMoney } from '../../shared/utils/money';
import { apiErrorMessage } from './ordering-ui.util';
import { formatIsoDateDisplay, resolveShopBusinessDate } from '../../core/shop/business-date';
import {
  resolveCurrentShift,
  shiftHoursLabel,
  shiftsOnIsoDate,
  type ShopShift,
} from '../../core/shop/shop-shifts';

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
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
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
        @if (pendingCaja(); as pending) {
          <div class="ocp__alert" role="status">
            La caja abierta es del {{ formatPendingLabel(pending) }} (no el de ahora). Generar cierre arma
            ese día y turno. Si era un error, cambiá día/turno abajo.
          </div>
        }
        <div class="ocp__caja">
          @if (openClosing(); as caja) {
            <div class="ocp__caja-open">
              <div>
                <strong>Caja abierta</strong>
                <span>
                  {{ cajaDateLabel(caja.businessDate) }} · turno
                  {{ caja.shiftName || '—' }} · cambio
                  {{ money(caja.cashOpeningAmount ?? 0) }}
                </span>
              </div>
              @if (canCreateClosing() && canEditCaja()) {
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  [disabled]="generatingClosing() || savingOpenCaja()"
                  (click)="generateClosing()"
                >
                  <mat-icon>point_of_sale</mat-icon>
                  {{ generatingClosing() ? 'Preparando…' : 'Generar cierre' }}
                </button>
              }
            </div>
            @if (canEditCaja()) {
              <div class="ocp__caja-open-form ocp__caja-open-form--edit">
                <div class="ocp__caja-open-form__row ocp__caja-open-form__row--action">
                  <mat-form-field appearance="outline" class="ocp__caja-field" subscriptSizing="dynamic">
                    <mat-label>Día</mat-label>
                    <input
                      matInput
                      [matDatepicker]="editCajaDatePicker"
                      [ngModel]="openingDateValue()"
                      (ngModelChange)="onOpeningDateObjChange($event)"
                      name="openCajaDate"
                      [disabled]="savingOpenCaja()"
                    />
                    <mat-datepicker-toggle matIconSuffix [for]="editCajaDatePicker" />
                    <mat-datepicker #editCajaDatePicker touchUi />
                  </mat-form-field>
                  @if (openingShiftOptions().length > 1) {
                    <mat-form-field appearance="outline" class="ocp__caja-field ocp__caja-field--shift" subscriptSizing="dynamic">
                      <mat-label>Turno</mat-label>
                      <mat-select
                        [ngModel]="openingShiftId()"
                        (ngModelChange)="openingShiftId.set($event)"
                        name="openCajaShift"
                        [disabled]="savingOpenCaja()"
                      >
                        @for (s of openingShiftOptions(); track s.id) {
                          <mat-option [value]="s.id">{{ s.name }} · {{ shiftHours(s) }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                  }
                  <button
                    mat-stroked-button
                    type="button"
                    class="ocp__caja-open-btn"
                    [disabled]="savingOpenCaja() || !openCajaDirty()"
                    (click)="saveOpenCajaMeta()"
                  >
                    <mat-icon>edit_calendar</mat-icon>
                    {{ savingOpenCaja() ? 'Guardando…' : 'Cambiar día/turno' }}
                  </button>
                </div>
              </div>
            }
            <div class="ocp__caja-local">
              <div>
                <strong>{{ orderingOpen() ? 'Local abierto' : 'Local cerrado' }}</strong>
                <span>
                  {{
                    orderingOpen()
                      ? 'Los clientes pueden hacer pedidos online.'
                      : 'Pedidos online pausados. La caja sigue abierta.'
                  }}
                </span>
              </div>
              @if (canEditCaja()) {
                <button
                  mat-stroked-button
                  type="button"
                  [disabled]="togglingLocal()"
                  (click)="setOrderingOpen(!orderingOpen())"
                >
                  <mat-icon>{{ orderingOpen() ? 'storefront' : 'store' }}</mat-icon>
                  {{
                    togglingLocal()
                      ? 'Guardando…'
                      : orderingOpen()
                        ? 'Cerrar local'
                        : 'Abrir local'
                  }}
                </button>
              }
            </div>
            <p class="ocp__hint">
              Generar cierre arma el formulario con los pedidos de esta caja (ese día y turno) y cierra
              pedidos online. Al guardar el cierre se confirma. No se puede abrir otra caja del mismo
              día/turno si ya hay un cierre enviado.
            </p>
          } @else if (canOpenCaja() && canEditCaja()) {
            <div class="ocp__caja-closed">
              <div>
                <strong>Sin caja abierta</strong>
                <span>Antes de recibir pedidos online abrí la caja con día, turno y efectivo de apertura.</span>
              </div>
              <div class="ocp__caja-open-form">
                <div class="ocp__caja-open-form__row">
                  <mat-form-field appearance="outline" class="ocp__caja-field" subscriptSizing="dynamic">
                    <mat-label>Día</mat-label>
                    <input
                      matInput
                      [matDatepicker]="openCajaDatePicker"
                      [ngModel]="openingDateValue()"
                      (ngModelChange)="onOpeningDateObjChange($event)"
                      name="openingBusinessDate"
                      [disabled]="openingCaja() || openingAmountLoading()"
                    />
                    <mat-datepicker-toggle matIconSuffix [for]="openCajaDatePicker" />
                    <mat-datepicker #openCajaDatePicker touchUi />
                  </mat-form-field>
                  @if (openingShiftOptions().length > 1) {
                    <mat-form-field appearance="outline" class="ocp__caja-field ocp__caja-field--shift" subscriptSizing="dynamic">
                      <mat-label>Turno</mat-label>
                      <mat-select
                        [ngModel]="openingShiftId()"
                        (ngModelChange)="openingShiftId.set($event)"
                        name="openingShiftId"
                        [disabled]="openingCaja() || openingAmountLoading()"
                      >
                        @for (s of openingShiftOptions(); track s.id) {
                          <mat-option [value]="s.id">{{ s.name }} · {{ shiftHours(s) }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                  }
                </div>
                <div class="ocp__caja-open-form__row ocp__caja-open-form__row--action">
                  <div class="ocp__caja-cash">
                    <mat-form-field appearance="outline" class="ocp__caja-field ocp__caja-field--cash" subscriptSizing="dynamic">
                      <mat-label>Efectivo de apertura</mat-label>
                      <input
                        matInput
                        type="number"
                        min="0"
                        step="100"
                        [ngModel]="openingAmount()"
                        (ngModelChange)="onOpeningAmountChange($event)"
                        name="openingAmount"
                        [disabled]="openingCaja() || openingAmountLoading()"
                      />
                    </mat-form-field>
                    @if (openingHint()) {
                      <p class="ocp__caja-hint">{{ openingHint() }}</p>
                    }
                  </div>
                  <button
                    mat-flat-button
                    color="primary"
                    type="button"
                    class="ocp__caja-open-btn"
                    [disabled]="openingCaja() || openingAmountLoading()"
                    (click)="openCaja()"
                  >
                    <mat-icon>lock_open</mat-icon>
                    {{ openingCaja() ? 'Abriendo…' : 'Abrir caja' }}
                  </button>
                </div>
              </div>
            </div>
          } @else {
            <p class="ocp__hint">
              @if (openClosing()) {
                Caja abierta en solo lectura.
              } @else {
                No hay caja abierta. Pedí a quien gestione cierres que la abra.
              }
            </p>
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
              [disabled]="!canEditChannels()"
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
              [disabled]="!canEditChannels()"
            />
          </div>
          }
          @if (showPayments()) {
          <div class="ocp__toggle">
            <div><strong>Efectivo</strong></div>
            <mat-slide-toggle
              [(ngModel)]="payCash"
              name="payCash"
              aria-label="Efectivo"
              [disabled]="!canEditPayments()"
            />
          </div>
          <div class="ocp__toggle">
            <div><strong>Transferencia</strong></div>
            <mat-slide-toggle
              [(ngModel)]="payTransfer"
              name="payTransfer"
              aria-label="Transferencia"
              [disabled]="!canEditPayments()"
            />
          </div>
          }
        </div>
        @if (canEditChannels() || canEditPayments()) {
          <div class="ocp__save ocp__save--inline">
            <button
              mat-flat-button
              color="primary"
              type="button"
              [disabled]="savingChannels()"
              (click)="saveChannels()"
            >
              <mat-icon>save</mat-icon>
              {{ savingChannels() ? 'Guardando…' : 'Guardar canales' }}
            </button>
          </div>
        }
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
                    [disabled]="!canEditItems()"
                    [attr.aria-label]="'Disponible ' + it.name"
                  />
                </div>
              } @empty {
                <p class="ocp__hint">No hay ítems en la carta o no coinciden con la búsqueda.</p>
              }
              @if (canEditItems()) {
                <div class="ocp__save ocp__save--inline">
                  <button
                    mat-flat-button
                    color="primary"
                    type="button"
                    [disabled]="savingItems()"
                    (click)="saveItems()"
                  >
                    <mat-icon>save</mat-icon>
                    {{ savingItems() ? 'Guardando…' : 'Guardar ítems' }}
                  </button>
                </div>
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
                    [disabled]="!canEditExtras()"
                    [attr.aria-label]="'Disponible ' + ex.name"
                  />
                </div>
              } @empty {
                <p class="ocp__hint">Todavía no hay extras, o no coinciden con la búsqueda.</p>
              }
              @if (canEditExtras()) {
                <div class="ocp__save ocp__save--inline">
                  <button
                    mat-flat-button
                    color="primary"
                    type="button"
                    [disabled]="savingExtras()"
                    (click)="saveExtrasAvailability()"
                  >
                    <mat-icon>save</mat-icon>
                    {{ savingExtras() ? 'Guardando…' : 'Guardar extras' }}
                  </button>
                </div>
              }
            </div>
          }
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
    .ocp__caja-closed,
    .ocp__caja-local {
      display: grid;
      gap: 0.65rem;
    }
    .ocp__caja-open strong,
    .ocp__caja-closed strong,
    .ocp__caja-local strong {
      display: block;
      font-size: 0.95rem;
    }
    .ocp__caja-open span,
    .ocp__caja-closed span,
    .ocp__caja-local span {
      display: block;
      font-size: 0.82rem;
      color: var(--guy-muted, #5f6f76);
    }
    .ocp__caja-local {
      padding-top: 0.55rem;
      border-top: 1px dashed var(--guy-border, #d7e0d9);
    }
    @media (min-width: 640px) {
      .ocp__caja-open,
      .ocp__caja-local {
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
      }
    }
    .ocp__caja-open-form {
      display: grid;
      gap: 0.65rem;
    }
    .ocp__caja-open-form--edit {
      padding-top: 0.55rem;
      border-top: 1px dashed var(--guy-border, #d7e0d9);
    }
    .ocp__caja-open-form__row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem 0.65rem;
      align-items: flex-start;
    }
    .ocp__caja-open-form__row--action {
      align-items: flex-start;
    }
    .ocp__caja-field {
      width: 11rem;
      margin: 0;
    }
    .ocp__caja-field--shift {
      flex: 1 1 14rem;
      width: auto;
      min-width: min(100%, 14rem);
      max-width: 18rem;
    }
    .ocp__caja-field--cash {
      width: 12rem;
    }
    .ocp__caja-cash {
      display: grid;
      gap: 0.2rem;
    }
    .ocp__caja-hint {
      margin: 0;
      max-width: 14rem;
      font-size: 0.75rem;
      line-height: 1.3;
      color: var(--guy-muted, #5f6f76);
    }
    .ocp__caja-open-btn {
      flex: 0 0 auto;
      min-height: 3.25rem;
      margin-top: 0.15rem;
      padding-inline: 1rem;
    }
    .ocp__save {
      display: flex;
      justify-content: center;
      margin-top: 0.15rem;
    }
    .ocp__save--inline {
      justify-content: flex-start;
      margin-top: 0.45rem;
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

  /** Si viene en true (p. ej. desde Nuevo cierre), dispara Generar cierre al estar listo. */
  readonly runGenerateClosing = input(false);
  private autoGenerateTried = false;

  readonly loading = signal(true);
  readonly savingChannels = signal(false);
  readonly savingItems = signal(false);
  readonly savingExtras = signal(false);
  readonly openingCaja = signal(false);
  readonly togglingLocal = signal(false);
  readonly generatingClosing = signal(false);
  readonly openClosing = signal<CashClosing | null>(null);
  readonly pendingCaja = computed(() =>
    pendingClosingFromOpenCaja(this.openClosing(), this.shops.selectedShop()),
  );
  readonly orderingOpen = signal(false);
  readonly items = signal<ToggleRow[]>([]);
  readonly extras = signal<ToggleRow[]>([]);
  readonly itemQuery = signal('');
  readonly extraQuery = signal('');
  readonly itemsOpen = signal(false);
  readonly extrasOpen = signal(false);
  readonly shiftActiveClosed = signal(false);
  readonly justAutoClosed = signal(false);

  readonly openingAmount = signal<number | null>(null);
  readonly openingHint = signal('');
  readonly openingAmountLoading = signal(false);
  readonly openingBusinessDate = signal('');
  readonly openingShiftId = signal('');
  readonly savingOpenCaja = signal(false);
  takeawayEnabled = true;
  deliveryEnabled = false;
  payCash = true;
  payTransfer = true;

  readonly openingShiftOptions = computed(() =>
    shiftsOnIsoDate(this.shops.selectedShop(), this.openingBusinessDate()),
  );

  readonly openingDateValue = computed(() => {
    const iso = this.openingBusinessDate();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  });

  readonly openCajaDirty = computed(() => {
    const caja = this.openClosing();
    if (!caja) return false;
    const date = this.openingBusinessDate();
    const shiftId = this.openingShiftId();
    const cajaDate = String(caja.businessDate ?? '').slice(0, 10);
    const cajaShift = String(caja.shiftId ?? '').trim();
    return date !== cajaDate || (!!shiftId && shiftId !== cajaShift);
  });

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

  private canEdit(key: OrderingConfigVisibilityKey): boolean {
    return canEditOrderingConfig(this.orderingConfigVis(), key);
  }

  readonly showCaja = computed(() => this.sees('caja'));
  readonly showChannels = computed(() => this.sees('channels'));
  readonly showPayments = computed(() => this.sees('payments'));
  readonly showItems = computed(() => this.sees('items'));
  readonly showExtras = computed(() => this.sees('extras'));
  readonly canEditCaja = computed(() => this.canEdit('caja'));
  readonly canEditChannels = computed(() => this.canEdit('channels'));
  readonly canEditPayments = computed(() => this.canEdit('payments'));
  readonly canEditItems = computed(() => this.canEdit('items'));
  readonly canEditExtras = computed(() => this.canEdit('extras'));

  private readonly reloadShop$ = new Subject<string>();

  constructor() {
    effect(() => {
      if (!this.runGenerateClosing() || this.autoGenerateTried) return;
      if (this.loading() || this.generatingClosing()) return;
      this.autoGenerateTried = true;
      queueMicrotask(() => this.generateClosing());
    });

    this.reloadShop$
      .pipe(
        switchMap((shopId) => {
          this.loading.set(true);
          this.openingAmount.set(null);
          this.openingAmountLoading.set(true);
          this.openingHint.set('Consultando efectivo en caja…');
          return forkJoin({
            shopId: of(shopId),
            caja: this.closingsApi.getOpen(shopId).pipe(catchError(() => of(null))),
            suggested: this.closingsApi.suggestedOpening(shopId).pipe(
              catchError(() =>
                of({
                  amount: Number(this.shops.selectedShop()?.defaultChangeAmount) || 0,
                  source: 'default' as const,
                  accountName: null,
                  previousDate: null,
                  previousShiftName: null,
                }),
              ),
            ),
            shop: this.http
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
              .pipe(catchError(() => of(null))),
            menu: this.http
              .get<{
                menus?: Array<{
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
              .pipe(catchError(() => of({ menus: [] as never[] }))),
          });
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: ({ caja, suggested, shop, menu }) => {
          this.openClosing.set(caja ?? null);
          if (!caja) {
            const amount = Number(suggested?.amount);
            this.openingAmount.set(Number.isFinite(amount) ? Math.max(0, amount) : 0);
            this.openingHint.set(formatSuggestedOpeningHint(suggested ?? { source: 'default' }));
          } else {
            this.openingHint.set('');
          }
          this.syncOpeningDayShift(caja);
          this.openingAmountLoading.set(false);

          if (shop) {
            const open = !shop.orderingForceClosed;
            this.orderingOpen.set(open);
            this.shiftActiveClosed.set(!!shop.orderingShiftActive && !open);
            this.justAutoClosed.set(!!shop.orderingJustAutoClosed);
            if (shop.orderingJustAutoClosed) {
              this.snack.open('El local se cerró solo al finalizar el turno', 'OK', {
                duration: 4200,
              });
            }
            this.takeawayEnabled = shop.takeawayEnabled !== false;
            this.deliveryEnabled = !!shop.deliveryEnabled;
            const methods = shop.orderingPayments?.methods;
            this.payCash = !methods || methods.includes('CASH');
            this.payTransfer = !methods || methods.includes('TRANSFER');
            this.extras.set(
              (shop.orderingExtras ?? [])
                .filter((e) => String(e.name ?? '').trim())
                .map((e) => ({
                  id: String(e.id ?? '').trim(),
                  name: String(e.name).trim(),
                  detail: this.money(Number(e.price) || 0),
                  available: e.available !== false,
                }))
                .filter((e) => !!e.id),
            );
          }

          const out: ToggleRow[] = [];
          const seen = new Set<string>();
          for (const m of menu?.menus ?? []) {
            for (const sec of m.sections ?? []) {
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
          this.loading.set(false);
        },
        error: () => {
          this.openingAmountLoading.set(false);
          this.openingAmount.set(Number(this.shops.selectedShop()?.defaultChangeAmount) || 0);
          this.openingHint.set('Cambio por defecto del local');
          this.loading.set(false);
          this.snack.open('No se pudo cargar la configuración', 'OK', { duration: 3000 });
        },
      });

    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) return;
      this.reloadShop$.next(shopId);
    });
  }

  money(n: number): string {
    return formatMoney(n);
  }

  cajaDateLabel(raw: string | null | undefined): string {
    const s = String(raw ?? '').slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return s || '—';
    return `${Number(m[3])}/${Number(m[2])}`;
  }

  formatPendingLabel(pending: PendingClosingNotice): string {
    return formatPendingClosingLabel(pending);
  }

  onOpeningAmountChange(raw: number | string | null): void {
    if (raw === null || raw === '') {
      this.openingAmount.set(null);
      return;
    }
    const n = Number(raw);
    this.openingAmount.set(Number.isFinite(n) ? n : null);
  }

  setItemAvailable(id: string, available: boolean): void {
    this.items.update((list) => list.map((it) => (it.id === id ? { ...it, available } : it)));
  }

  setExtraAvailable(id: string, available: boolean): void {
    this.extras.update((list) => list.map((ex) => (ex.id === id ? { ...ex, available } : ex)));
  }

  syncOpeningDayShift(caja?: CashClosing | null): void {
    const shop = this.shops.selectedShop();
    const today = resolveShopBusinessDate(new Date(), {
      timezone: shop?.timezone,
      openingTime: shop?.openingTime,
    });
    const date = String(caja?.businessDate ?? '').slice(0, 10) || today;
    this.openingBusinessDate.set(date);
    const options = shiftsOnIsoDate(shop, date);
    const preferred =
      String(caja?.shiftId ?? '').trim() ||
      resolveCurrentShift(shop).id ||
      options[0]?.id ||
      '';
    this.openingShiftId.set(
      options.some((s) => s.id === preferred) ? preferred : options[0]?.id || '',
    );
  }

  onOpeningDateChange(raw: string): void {
    const date = String(raw ?? '').slice(0, 10);
    this.openingBusinessDate.set(date);
    const options = shiftsOnIsoDate(this.shops.selectedShop(), date);
    const current = this.openingShiftId();
    if (!options.some((s) => s.id === current)) {
      const preferred = resolveCurrentShift(this.shops.selectedShop()).id;
      this.openingShiftId.set(
        options.some((s) => s.id === preferred) ? preferred : options[0]?.id || '',
      );
    }
  }

  onOpeningDateObjChange(value: Date | null): void {
    if (!value || Number.isNaN(value.getTime())) return;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    this.onOpeningDateChange(`${y}-${m}-${d}`);
  }

  shiftHours(shift: ShopShift): string {
    return shiftHoursLabel(shift);
  }

  openCaja(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canOpenCaja()) return;
    const amount = Number(this.openingAmount());
    // 0 es válido (último cierre dejó la caja vacía).
    if (!Number.isFinite(amount) || amount < 0) {
      this.snack.open('Ingresá el efectivo de apertura', 'OK', { duration: 3000 });
      return;
    }
    const businessDate = this.openingBusinessDate() || undefined;
    const shiftId = this.openingShiftId() || undefined;
    if (!businessDate) {
      this.snack.open('Elegí el día de apertura', 'OK', { duration: 3000 });
      return;
    }
    this.openingCaja.set(true);
    this.closingsApi
      .openRegister(shopId, { cashOpeningAmount: amount, businessDate, shiftId })
      .subscribe({
      next: (caja) => {
        this.openingCaja.set(false);
        this.openClosing.set(caja);
        this.syncOpeningDayShift(caja);
        this.orderingOpen.set(true);
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
          `Caja abierta · ${this.cajaDateLabel(caja.businessDate)} · ${caja.shiftName || 'turno'} · cambio ${this.money(caja.cashOpeningAmount ?? 0)}`,
          'OK',
          { duration: 3200 },
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

  saveOpenCajaMeta(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.openClosing() || !this.canEditCaja()) return;
    const businessDate = this.openingBusinessDate();
    const shiftId = this.openingShiftId();
    if (!businessDate) {
      this.snack.open('Elegí el día', 'OK', { duration: 2800 });
      return;
    }
    this.savingOpenCaja.set(true);
    this.closingsApi.updateOpenRegister(shopId, { businessDate, shiftId }).subscribe({
      next: (caja) => {
        this.savingOpenCaja.set(false);
        this.openClosing.set(caja);
        this.syncOpeningDayShift(caja);
        this.snack.open(
          `Caja actualizada · ${this.cajaDateLabel(caja.businessDate)} · ${caja.shiftName || 'turno'}`,
          'OK',
          { duration: 2800 },
        );
      },
      error: (err: HttpErrorResponse) => {
        this.savingOpenCaja.set(false);
        this.snack.open(apiErrorMessage(err, 'No se pudo cambiar día/turno'), 'OK', {
          duration: 4500,
        });
      },
    });
  }

  setOrderingOpen(open: boolean): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canEditCaja() || !this.openClosing()) return;
    if (open === this.orderingOpen()) return;
    this.togglingLocal.set(true);
    this.http
      .patch(`${environment.apiUrl}/shops/${shopId}/ordering-catalog`, {
        orderingForceClosed: !open,
      })
      .subscribe({
        next: (updated: any) => {
          this.togglingLocal.set(false);
          this.orderingOpen.set(!updated?.orderingForceClosed);
          this.shops.upsertShop(updated);
          this.snack.open(
            open ? 'Local abierto para pedidos' : 'Local cerrado · pedidos pausados',
            'OK',
            { duration: 2800 },
          );
        },
        error: (err: HttpErrorResponse) => {
          this.togglingLocal.set(false);
          this.snack.open(apiErrorMessage(err, 'No se pudo cambiar el estado del local'), 'OK', {
            duration: 4000,
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
        'Hay un cierre en borrador. ¿Reemplazarlo con los totales de pedidos y mesas del turno?',
      );
      if (!ok) return;
    }

    this.generatingClosing.set(true);
    this.closingsApi.getOpen(shopId).subscribe({
      next: (fresh) => {
        this.openClosing.set(fresh);
        this.runClosingSummary(shopId, userId, shop, fresh);
      },
      error: () => this.runClosingSummary(shopId, userId, shop, this.openClosing()),
    });
  }

  private runClosingSummary(
    shopId: string,
    userId: string,
    shop: NonNullable<ReturnType<ShopContextService['selectedShop']>>,
    caja: CashClosing | null,
  ): void {
    const todayBd = resolveShopBusinessDate(new Date(), {
      timezone: shop.timezone,
      openingTime: shop.openingTime,
    });
    const currentShift = resolveCurrentShift(shop);
    const pending = pendingClosingFromOpenCaja(caja, shop);
    // Siempre el día/turno de la caja abierta (evita un segundo cierre “de ahora”
    // dejando el draft viejo colgado).
    const businessDate = String(caja?.businessDate ?? '').slice(0, 10) || todayBd;
    const shiftId = String(caja?.shiftId ?? '').trim() || currentShift.id;
    if (pending) {
      const cont = window.confirm(
        `La caja abierta es del ${formatPendingClosingLabel(pending)} (no el de ahora). ¿Generar ese cierre?`,
      );
      if (!cont) {
        this.generatingClosing.set(false);
        return;
      }
    }
    const params = new URLSearchParams();
    params.set('businessDate', businessDate);
    if (shiftId) params.set('shiftId', shiftId);
    const qs = params.toString();
    forkJoin({
      summary: this.http.get<ClosingSummary>(
        `${environment.apiUrl}/shops/${shopId}/customer-orders/closing-summary${qs ? `?${qs}` : ''}`,
      ),
      sources: this.closingsApi
        .listClosingSources(shopId, true)
        .pipe(catchError(() => of([] as ShopClosingSource[]))),
    }).subscribe({
      next: ({ summary, sources }) => {
          const warnings: string[] = [];
          if (summary.openCount > 0) {
            warnings.push(
              `${summary.openCount} pedido(s) todavía abiertos del turno «${summary.shiftName}» (no entran hasta completarlos)`,
            );
          }
          if ((summary.openTablesCount ?? 0) > 0) {
            warnings.push(
              `${summary.openTablesCount} mesa(s) abierta(s) (no se incluyen hasta cobrarlas)`,
            );
          }
          if (!summary.orderCount && !summary.tables?.closedCount) {
            warnings.push(
              `Sin pedidos completados ni mesas cobradas en «${summary.shiftName}» (${summary.businessDate}). En Pedidos: Completar (acreditado no alcanza)`,
            );
          }
          if (warnings.length) {
            const cont = window.confirm(
              `${warnings.join('. ')}. ¿Generar el cierre igual?`,
            );
            if (!cont) {
              this.generatingClosing.set(false);
              return;
            }
          }

          clearClosingDraft();
          const draft = buildClosingDraftFromOrdersSummary({
            shopId,
            userId,
            shop,
            summary,
            sources,
            caja,
            pendingClosing: pending,
          });
          persistClosingDraft(draft);

          const finishGenerate = (updatedShop?: unknown) => {
            if (updatedShop) this.shops.upsertShop(updatedShop as never);
            this.orderingOpen.set(false);
            this.generatingClosing.set(false);
            const mesas = summary.tables?.closedCount ?? 0;
            const bits = [
              `Cierre del turno «${summary.shiftName}» (${formatIsoDateDisplay(summary.businessDate)})`,
              summary.orderCount ? `${summary.orderCount} pedido(s)` : null,
              mesas ? `${mesas} mesa(s)` : null,
              pending ? 'La caja era de otro día/turno respecto de ahora' : null,
            ].filter(Boolean);
            this.snack.open(
              bits.length > 1 ? bits.join('. ') : `${bits[0]} (sin movimientos)`,
              'OK',
              { duration: pending ? 5200 : 3200 },
            );
            void this.router.navigate(['/closings/new'], {
              queryParams: { fromGenerate: '1' },
            });
          };

          this.http
            .patch(`${environment.apiUrl}/shops/${shopId}/ordering-catalog`, {
              orderingForceClosed: true,
            })
            .subscribe({
              next: (updated) => finishGenerate(updated),
              // Solo comandas / sin catálogo de pedidos: igual abrimos el cierre armado.
              error: () => finishGenerate(),
            });
      },
      error: (err: HttpErrorResponse) => {
        this.generatingClosing.set(false);
        this.snack.open(apiErrorMessage(err, 'No se pudo armar el resumen de pedidos'), 'OK', {
          duration: 3500,
        });
      },
    });
  }

  private patchCatalog(
    body: Record<string, unknown>,
    saving: { set: (v: boolean) => void },
    okMsg: string,
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !Object.keys(body).length) return;
    saving.set(true);
    this.http
      .patch(`${environment.apiUrl}/shops/${shopId}/ordering-catalog`, body)
      .subscribe({
        next: (shop: any) => {
          saving.set(false);
          this.justAutoClosed.set(false);
          this.shops.upsertShop(shop);
          this.snack.open(okMsg, 'OK', { duration: 2500 });
          this.reloadShop$.next(shopId);
        },
        error: (err: HttpErrorResponse) => {
          saving.set(false);
          this.snack.open(apiErrorMessage(err, 'No se pudo guardar'), 'OK', { duration: 3500 });
        },
      });
  }

  saveChannels(): void {
    if (!this.canEditChannels() && !this.canEditPayments()) return;
    const body: Record<string, unknown> = {};
    if (this.canEditChannels()) {
      body['takeawayEnabled'] = this.takeawayEnabled;
      body['deliveryEnabled'] = this.deliveryEnabled;
    }
    if (this.canEditPayments()) {
      const methods: Array<'CASH' | 'TRANSFER'> = [
        ...(this.payCash ? (['CASH'] as const) : []),
        ...(this.payTransfer ? (['TRANSFER'] as const) : []),
      ];
      body['orderingPayments'] = { methods };
    }
    this.patchCatalog(body, this.savingChannels, 'Canales guardados');
  }

  saveItems(): void {
    if (!this.canEditItems()) return;
    this.patchCatalog(
      {
        menuItemAvailability: this.items().map((it) => ({
          id: it.id,
          available: it.available,
        })),
      },
      this.savingItems,
      'Ítems guardados',
    );
  }

  saveExtrasAvailability(): void {
    if (!this.canEditExtras()) return;
    this.patchCatalog(
      {
        orderingExtraAvailability: this.extras().map((ex) => ({
          id: ex.id,
          available: ex.available,
        })),
      },
      this.savingExtras,
      'Extras guardados',
    );
  }
}
