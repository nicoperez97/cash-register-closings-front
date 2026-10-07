import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { concatMap, forkJoin, from, map, of, startWith } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import {
  SelectSearchComponent,
  filterBySelectQuery,
  onSelectSearchOpened,
} from '../../shared/components/select-search';
import { resolveShopCalendarDate } from '../../core/shop/business-date';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { movementSavedDialogData } from '../../shared/components/record-share-builders';
import { shareText } from '../../shared/utils/share-text';
import { takeInputFile } from '../../shared/utils/input-file';
import { CashWithdrawalsInboxService } from '../cash-withdrawals/cash-withdrawals-inbox.service';
import { ShopSupplier, SuppliersApiService } from '../suppliers/suppliers-api.service';
import { ShopService, ServicesApiService } from '../services/services-api.service';
import {
  Concept,
  EXPENSE_PAYMENT_METHOD_OPTIONS,
  ExpensePaymentMethod,
  LedgerAccount,
  Movement,
  MovementsApiService,
  accountListedIn,
  expenseReceiptRequired,
} from './movements-api.service';

import { apiErrorMessage } from '../../core/http/api-error-message';
export type QuickExpenseDialogData = {
  shopId: string;
  shopName: string;
  /** Semilla opcional; el diálogo siempre recarga al abrir. */
  accounts?: LedgerAccount[];
  concepts?: Concept[];
  kind?: 'expense' | 'income';
};

type PartyKind = 'supplier' | 'service';

function todayIso(timezone?: string | null): string {
  return resolveShopCalendarDate(new Date(), { timezone: timezone ?? undefined });
}

function conceptHasCategory(c: Concept | undefined, cat: string): boolean {
  return (c?.categories ?? []).some((x) => String(x).toUpperCase() === cat);
}

@Component({
  selector: 'app-quick-expense-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatSnackBarModule,
    BusyLabelComponent,
    SelectSearchComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span
        class="guy-dialog__title-icon"
        [class.guy-dialog__title-icon--ok]="!!saved()"
        aria-hidden="true"
      >
        <mat-icon>{{ saved() ? 'check_circle' : 'payments' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ titleText }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    @if (saved(); as movement) {
      <mat-dialog-content>
        @if (savedCount() > 1) {
          <p class="quick-exp__ok">Se registraron {{ savedCount() }} gastos. Podés cerrar.</p>
        } @else {
          <p class="quick-exp__ok">Quedó registrado. Podés compartirlo o cerrar.</p>
          <dl class="quick-exp__summary">
            @for (f of savedFields(movement); track f.label) {
              <div [class.quick-exp__total]="f.emphasize">
                <dt>{{ f.label }}</dt>
                <dd>{{ f.value }}</dd>
              </div>
            }
          </dl>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        @if (savedCount() === 1) {
          <button mat-stroked-button type="button" (click)="share(movement)" [disabled]="sharing()">
            <mat-icon>share</mat-icon>
            Compartir
          </button>
        }
        <button mat-flat-button color="primary" type="button" (click)="ref.close(movement)">
          Cerrar
        </button>
      </mat-dialog-actions>
    } @else if (loadingLists()) {
      <mat-dialog-content class="quick-exp__loading">
        <div class="quick-exp__skeleton" role="status" aria-busy="true" aria-label="Cargando conceptos y cuentas">
          <div class="guy-skeleton-line guy-skeleton-line--title"></div>
          <div class="guy-skeleton-line"></div>
          <div class="guy-skeleton-line guy-skeleton-line--short"></div>
          <div class="guy-skeleton-line"></div>
          <div class="guy-skeleton-line guy-skeleton-line--short"></div>
        </div>
      </mat-dialog-content>
    } @else if (listsFailed()) {
      <mat-dialog-content>
        <p class="quick-exp__empty">
          No se pudieron cargar conceptos o cuentas. Probá de nuevo.
        </p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="ref.close(false)">Cancelar</button>
        <button mat-flat-button color="primary" type="button" (click)="reloadLists()">
          <mat-icon>refresh</mat-icon>
          Reintentar
        </button>
      </mat-dialog-actions>
    } @else {
      <mat-dialog-content>
        <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
          @if (isIncome) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Monto</mat-label>
              <mat-icon matPrefix>attach_money</mat-icon>
              <input matInput type="number" inputmode="decimal" formControlName="amountUyu" />
            </mat-form-field>
          } @else {
            <div class="quick-exp__amounts" formArrayName="amountLines">
              <span class="quick-exp__amounts-label">Montos</span>
              <p class="quick-exp__amounts-hint">
                Se registra un gasto por cada monto; el resto del formulario se comparte.
              </p>
              @for (ctrl of amountLines.controls; track $index) {
                <div class="quick-exp__amount-row">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Monto{{ amountLines.length > 1 ? ' ' + ($index + 1) : '' }}</mat-label>
                    <mat-icon matPrefix>attach_money</mat-icon>
                    <input
                      matInput
                      type="number"
                      inputmode="decimal"
                      [formControlName]="$index"
                    />
                  </mat-form-field>
                  @if (amountLines.length > 1) {
                    <button
                      mat-icon-button
                      type="button"
                      aria-label="Quitar monto"
                      [disabled]="busy()"
                      (click)="removeAmountLine($index)"
                    >
                      <mat-icon>close</mat-icon>
                    </button>
                  }
                </div>
              }
              <button
                mat-stroked-button
                type="button"
                class="quick-exp__amounts-add"
                [disabled]="busy()"
                (click)="addAmountLine()"
              >
                <mat-icon>add</mat-icon>
                Agregar monto
              </button>
            </div>
          }

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Concepto</mat-label>
            <mat-icon matPrefix>sell</mat-icon>
            <mat-select
              formControlName="conceptId"
              panelClass="guy-select-search-panel"
              (openedChange)="onSelectSearchOpened($event, conceptQuery)"
            >
              <mat-option disabled class="select-search-opt">
                <app-select-search [(query)]="conceptQuery" placeholder="Buscar concepto…" />
              </mat-option>
              @for (c of filteredExpenseConcepts(); track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              }
              @if (!filteredExpenseConcepts().length) {
                <mat-option disabled>{{
                  conceptQuery()
                    ? 'Sin resultados'
                    : 'No hay conceptos de ' + (isIncome ? 'ingreso' : 'gasto')
                }}</mat-option>
              }
            </mat-select>
            @if (form.controls.conceptId.touched && form.controls.conceptId.hasError('required')) {
              <mat-error>Elegí un concepto</mat-error>
            }
          </mat-form-field>

          @if (!isIncome && showPartySection()) {
            <div class="quick-exp__party">
              @if (partyAllowsSupplier() && partyAllowsService()) {
                <div class="quick-exp__party-tabs" role="group" aria-label="Tipo opcional">
                  <button
                    type="button"
                    class="quick-exp__party-tab"
                    [class.quick-exp__party-tab--on]="partyKind() === 'supplier'"
                    (click)="setPartyKind('supplier')"
                  >
                    Proveedor
                  </button>
                  <button
                    type="button"
                    class="quick-exp__party-tab"
                    [class.quick-exp__party-tab--on]="partyKind() === 'service'"
                    (click)="setPartyKind('service')"
                  >
                    Servicio
                  </button>
                </div>
              }

              @if (partyKind() === 'supplier' && partyAllowsSupplier()) {
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Proveedor (opcional)</mat-label>
                  <mat-icon matPrefix>store</mat-icon>
                  <mat-select
                    [value]="supplierId()"
                    panelClass="guy-select-search-panel"
                    (openedChange)="onSelectSearchOpened($event, supplierQuery)"
                    (selectionChange)="supplierId.set($event.value)"
                  >
                    <mat-option disabled class="select-search-opt">
                      <app-select-search [(query)]="supplierQuery" placeholder="Buscar proveedor…" />
                    </mat-option>
                    <mat-option [value]="null">Sin proveedor · va a Egreso</mat-option>
                    @for (s of filteredSuppliers(); track s.id) {
                      <mat-option [value]="s.id">
                        {{ s.name }}
                        @if (s.bankAlias) {
                          · {{ s.bankAlias }}
                        }
                      </mat-option>
                    }
                    @if (supplierQuery() && !filteredSuppliers().length) {
                      <mat-option disabled>Sin resultados</mat-option>
                    }
                  </mat-select>
                  <mat-hint>Si lo elegís, el gasto suma en Saldos de ese proveedor.</mat-hint>
                </mat-form-field>

                @if (canManageSuppliers()) {
                  <div class="quick-exp__create">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Nuevo proveedor</mat-label>
                      <input matInput [formControl]="newSupplierName" placeholder="Nombre" />
                    </mat-form-field>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Alias / CBU</mat-label>
                      <input matInput [formControl]="newSupplierAlias" placeholder="Opcional" />
                    </mat-form-field>
                    <button
                      mat-stroked-button
                      type="button"
                      [disabled]="!newSupplierName.value.trim() || creatingSupplier()"
                      (click)="createSupplier()"
                    >
                      <mat-icon>add</mat-icon>
                      Crear
                    </button>
                  </div>
                }
              }

              @if (partyKind() === 'service' && partyAllowsService()) {
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Servicio (opcional)</mat-label>
                  <mat-icon matPrefix>home_repair_service</mat-icon>
                  <mat-select
                    [value]="serviceId()"
                    panelClass="guy-select-search-panel"
                    (openedChange)="onSelectSearchOpened($event, serviceQuery)"
                    (selectionChange)="serviceId.set($event.value)"
                  >
                    <mat-option disabled class="select-search-opt">
                      <app-select-search [(query)]="serviceQuery" placeholder="Buscar servicio…" />
                    </mat-option>
                    <mat-option [value]="null">Sin servicio · va a Egreso</mat-option>
                    @for (s of filteredServices(); track s.id) {
                      <mat-option [value]="s.id">
                        {{ s.name }}
                        @if (s.bankAlias) {
                          · {{ s.bankAlias }}
                        }
                      </mat-option>
                    }
                    @if (serviceQuery() && !filteredServices().length) {
                      <mat-option disabled>Sin resultados</mat-option>
                    }
                  </mat-select>
                  <mat-hint>Si lo elegís, el gasto suma en Saldos de ese servicio.</mat-hint>
                </mat-form-field>

                @if (canManageServices()) {
                  <div class="quick-exp__create">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Nuevo servicio</mat-label>
                      <input matInput [formControl]="newServiceName" placeholder="Nombre" />
                    </mat-form-field>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Alias / CBU</mat-label>
                      <input matInput [formControl]="newServiceAlias" placeholder="Opcional" />
                    </mat-form-field>
                    <button
                      mat-stroked-button
                      type="button"
                      [disabled]="!newServiceName.value.trim() || creatingService()"
                      (click)="createService()"
                    >
                      <mat-icon>add</mat-icon>
                      Crear
                    </button>
                  </div>
                }
              }
            </div>
          }

          @if (!isIncome) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Forma de pago</mat-label>
              <mat-icon matPrefix>payments</mat-icon>
              <mat-select formControlName="paymentMethod">
                @for (opt of paymentMethods; track opt.value) {
                  <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                }
              </mat-select>
              @if (
                form.controls.paymentMethod.touched &&
                form.controls.paymentMethod.hasError('required')
              ) {
                <mat-error>Elegí efectivo, transferencia o tarjeta</mat-error>
              }
            </mat-form-field>
          }

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ isIncome ? 'Entra a' : 'Sale de' }}</mat-label>
            <mat-icon matPrefix>account_balance_wallet</mat-icon>
            <mat-select
              formControlName="fromAccountId"
              panelClass="guy-select-search-panel"
              (openedChange)="onSelectSearchOpened($event, accountQuery)"
            >
              <mat-option disabled class="select-search-opt">
                <app-select-search [(query)]="accountQuery" placeholder="Buscar cuenta…" />
              </mat-option>
              @for (a of filteredFromAccounts(); track a.id) {
                <mat-option [value]="a.id">{{ a.name }}</mat-option>
              }
              @if (!filteredFromAccounts().length) {
                <mat-option disabled>{{
                  accountQuery() ? 'Sin resultados' : 'No hay cuentas disponibles'
                }}</mat-option>
              }
            </mat-select>
            @if (
              form.controls.fromAccountId.touched &&
              form.controls.fromAccountId.hasError('required')
            ) {
              <mat-error>{{
                isIncome ? 'Elegí a qué cuenta entra' : 'Elegí de qué cuenta sale'
              }}</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Descripción (opcional)</mat-label>
            <mat-icon matPrefix>notes</mat-icon>
            <input matInput formControlName="description" autocomplete="off" />
          </mat-form-field>

          @if (!isIncome) {
            <div class="quick-exp__receipt">
              <span class="quick-exp__receipt-label">{{
                receiptRequired() ? 'Comprobante' : 'Comprobante (opcional)'
              }}</span>
              <div class="quick-exp__receipt-actions">
                <button mat-stroked-button type="button" (click)="cameraInput.click()">
                  <mat-icon>photo_camera</mat-icon>
                  Foto
                </button>
                <button mat-stroked-button type="button" (click)="fileInput.click()">
                  <mat-icon>upload_file</mat-icon>
                  Archivo
                </button>
              </div>
              <input
                #cameraInput
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                (change)="onReceiptPicked($event)"
              />
              <input
                #fileInput
                type="file"
                accept="image/*,application/pdf"
                hidden
                (change)="onReceiptPicked($event)"
              />
              @if (receiptFile(); as file) {
                <p class="quick-exp__receipt-name">
                  {{ file.name }}
                  <button
                    mat-icon-button
                    type="button"
                    aria-label="Quitar"
                    (click)="receiptFile.set(null)"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                </p>
              }
            </div>
          }
        </form>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">
          Cancelar
        </button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="
            !canSubmit() ||
            busy() ||
            !(isIncome ? ingresoAccountId() : egresoAccountId()) ||
            missingReceipt()
          "
          (click)="save()"
        >
          <app-busy-label [busy]="busy()" busyLabel="Guardando…">
            <mat-icon>check</mat-icon>
            {{ saveLabel }}
          </app-busy-label>
        </button>
      </mat-dialog-actions>
    }
  `,
  styles: `
    .quick-exp__amounts {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      margin-bottom: 0.15rem;
    }
    .quick-exp__amounts-label {
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--guy-navy, #003366);
    }
    .quick-exp__amounts-hint {
      margin: -0.1rem 0 0.1rem;
      font-size: 0.82rem;
      line-height: 1.35;
      color: var(--guy-muted, #5f6f76);
    }
    .quick-exp__amount-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.35rem;
      align-items: start;
    }
    .quick-exp__amounts-add {
      align-self: flex-start;
    }
    .quick-exp__loading {
      display: block;
      min-height: 8rem;
      padding: 0.35rem 0 0.75rem;
      animation: guy-fade-in var(--guy-dur, 240ms) var(--guy-ease, cubic-bezier(0.22, 1, 0.36, 1)) both;
    }
    .quick-exp__skeleton {
      display: grid;
      gap: 0.55rem;
      padding: 0.35rem 0;
    }
    .quick-exp__empty {
      margin: 0.5rem 0;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.92rem;
      line-height: 1.45;
    }
    .quick-exp__ok {
      margin: 0 0 0.75rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }
    .quick-exp__summary {
      display: grid;
      gap: 0.55rem;
      margin: 0;
      padding: 0;
    }
    .quick-exp__summary > div {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: baseline;
    }
    .quick-exp__summary dt {
      margin: 0;
      font-size: 0.85rem;
      color: var(--guy-muted, #5f6f76);
    }
    .quick-exp__summary dd {
      margin: 0;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--guy-navy, #003366);
      text-align: right;
    }
    .quick-exp__total {
      margin-top: 0.35rem;
      padding-top: 0.55rem;
      border-top: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 80%, transparent);
    }
    .quick-exp__total dd {
      font-size: 1.05rem;
    }
    .quick-exp__party {
      display: grid;
      gap: 0.55rem;
    }
    .quick-exp__party-tabs {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .quick-exp__party-tab {
      border: 1px solid var(--guy-border, #d7e0d9);
      background: #fff;
      color: var(--guy-navy, #003366);
      border-radius: 999px;
      padding: 0.35rem 0.85rem;
      font: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
    }
    .quick-exp__party-tab--on {
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 12%, #fff);
      border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 45%, var(--guy-border, #d7e0d9));
      color: var(--guy-primary, #1d65a0);
    }
    .quick-exp__create {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 0.55rem;
      align-items: start;
    }
    @media (max-width: 560px) {
      .quick-exp__create {
        grid-template-columns: 1fr;
      }
    }
    .quick-exp__receipt {
      display: grid;
      gap: 0.45rem;
    }
    .quick-exp__receipt-label {
      font-size: 0.82rem;
      font-weight: 650;
      color: var(--guy-navy, #003366);
    }
    .quick-exp__receipt-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }
    .quick-exp__receipt-name {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin: 0;
      font-size: 0.85rem;
      color: var(--guy-navy, #003366);
    }
  `,
})
export class QuickExpenseDialogComponent implements OnInit {
  readonly data = inject<QuickExpenseDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<QuickExpenseDialogComponent, Movement | boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(MovementsApiService);
  private readonly suppliersApi = inject(SuppliersApiService);
  private readonly servicesApi = inject(ServicesApiService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly shops = inject(ShopContextService);
  private readonly cashWithdrawalsInbox = inject(CashWithdrawalsInboxService);

  readonly busy = signal(false);
  readonly sharing = signal(false);
  readonly saved = signal<Movement | null>(null);
  readonly savedCount = signal(1);
  readonly receiptFile = signal<File | null>(null);
  readonly loadingLists = signal(true);
  readonly listsFailed = signal(false);
  readonly accounts = signal<LedgerAccount[]>(this.data.accounts ?? []);
  readonly concepts = signal<Concept[]>(this.data.concepts ?? []);
  readonly suppliers = signal<ShopSupplier[]>([]);
  readonly services = signal<ShopService[]>([]);
  readonly isIncome = (this.data.kind ?? 'expense') === 'income';

  readonly supplierId = signal<string | null>(null);
  readonly serviceId = signal<string | null>(null);
  readonly partyKind = signal<PartyKind>('supplier');
  readonly creatingSupplier = signal(false);
  readonly creatingService = signal(false);

  readonly newSupplierName = this.fb.nonNullable.control('');
  readonly newSupplierAlias = this.fb.nonNullable.control('');
  readonly newServiceName = this.fb.nonNullable.control('');
  readonly newServiceAlias = this.fb.nonNullable.control('');

  readonly egresoAccountId = computed(() => {
    const hit = this.accounts().find(
      (a) =>
        a.active !== false &&
        (a.code?.toUpperCase() === 'EGRESO' || a.name.toLowerCase().includes('egreso')),
    );
    return hit?.id ?? null;
  });

  readonly ingresoAccountId = computed(() => {
    const hit = this.accounts().find(
      (a) =>
        a.active !== false &&
        (a.code?.toUpperCase() === 'INGRESO' || a.name.toLowerCase().includes('ingreso')),
    );
    return hit?.id ?? null;
  });

  readonly expenseConcepts = computed(() =>
    this.concepts().filter(
      (c) => c.active !== false && c.kind === (this.isIncome ? 'INCOME' : 'EXPENSE'),
    ),
  );

  readonly conceptQuery = signal('');
  readonly filteredExpenseConcepts = computed(() =>
    filterBySelectQuery(
      this.expenseConcepts(),
      this.conceptQuery(),
      (c) => c.name,
      this.form.controls.conceptId.value,
    ),
  );

  readonly fromAccounts = computed(() =>
    this.accounts().filter(
      (a) =>
        a.active !== false &&
        a.id !== this.egresoAccountId() &&
        a.id !== this.ingresoAccountId() &&
        accountListedIn(a, this.isIncome ? 'incomes' : 'expenses') &&
        (a.type === 'CHANNEL' || a.type === 'SYSTEM' || a.type === 'PARTNER'),
    ),
  );

  readonly accountQuery = signal('');
  readonly onSelectSearchOpened = onSelectSearchOpened;
  readonly filteredFromAccounts = computed(() =>
    filterBySelectQuery(
      this.fromAccounts(),
      this.accountQuery(),
      (a) => a.name,
      this.form.controls.fromAccountId.value,
    ),
  );

  readonly supplierQuery = signal('');
  readonly filteredSuppliers = computed(() =>
    filterBySelectQuery(
      this.suppliers().filter((s) => s.active !== false),
      this.supplierQuery(),
      (s) => `${s.name} ${s.bankAlias ?? ''} ${s.taxId ?? ''}`,
      this.supplierId(),
    ),
  );

  readonly serviceQuery = signal('');
  readonly filteredServices = computed(() =>
    filterBySelectQuery(
      this.services().filter((s) => s.active !== false),
      this.serviceQuery(),
      (s) => `${s.name} ${s.bankAlias ?? ''} ${s.taxId ?? ''}`,
      this.serviceId(),
    ),
  );

  readonly paymentMethods = EXPENSE_PAYMENT_METHOD_OPTIONS;

  readonly form = this.fb.nonNullable.group({
    amountUyu: [
      null as number | null,
      this.isIncome ? [Validators.required, Validators.min(0.01)] : [],
    ],
    amountLines: this.fb.array(
      this.isIncome ? [] : [this.newAmountLine()],
    ),
    conceptId: ['', Validators.required],
    paymentMethod: [
      '' as ExpensePaymentMethod | '',
      this.isIncome ? [] : [Validators.required],
    ],
    fromAccountId: ['', Validators.required],
    toAccountId: [''],
    description: [''],
  });

  get amountLines(): FormArray<FormControl<number | null>> {
    return this.form.controls.amountLines as FormArray<FormControl<number | null>>;
  }

  private newAmountLine(): FormControl<number | null> {
    return this.fb.control<number | null>(null, {
      nonNullable: false,
      validators: [Validators.required, Validators.min(0.01)],
    });
  }

  addAmountLine(): void {
    if (this.busy()) return;
    this.amountLines.push(this.newAmountLine());
  }

  removeAmountLine(index: number): void {
    if (this.busy() || this.amountLines.length <= 1) return;
    this.amountLines.removeAt(index);
  }

  private readAmountLines(): number[] {
    return this.amountLines.getRawValue()
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  get titleText(): string {
    if (this.saved()) {
      if (this.isIncome) return 'Ingreso registrado';
      return this.savedCount() > 1 ? 'Gastos registrados' : 'Gasto registrado';
    }
    return this.isIncome ? 'Ingreso rápido' : 'Gasto rápido';
  }

  get saveLabel(): string {
    if (this.isIncome) return 'Registrar ingreso';
    const n = Math.max(this.amountLines.length, 1);
    return n > 1 ? `Registrar ${n} gastos` : 'Registrar gasto';
  }

  canSubmit(): boolean {
    if (this.form.invalid) return false;
    if (this.isIncome) return true;
    return this.readAmountLines().length === this.amountLines.length;
  }

  private readonly conceptIdValue = toSignal(
    this.form.controls.conceptId.valueChanges.pipe(startWith(this.form.controls.conceptId.value)),
    { initialValue: this.form.controls.conceptId.value },
  );

  readonly selectedConcept = computed(() => {
    const id = this.conceptIdValue();
    return this.concepts().find((c) => c.id === id);
  });

  readonly partyAllowsSupplier = computed(
    () => !this.isIncome && conceptHasCategory(this.selectedConcept(), 'SUPPLIERS'),
  );
  readonly partyAllowsService = computed(
    () => !this.isIncome && conceptHasCategory(this.selectedConcept(), 'SERVICES'),
  );
  readonly showPartySection = computed(
    () => this.partyAllowsSupplier() || this.partyAllowsService(),
  );

  readonly canManageSuppliers = computed(() =>
    hasShopPermission(this.auth.currentUser(), this.data.shopId, 'suppliers.manage'),
  );
  readonly canManageServices = computed(() =>
    hasShopPermission(this.auth.currentUser(), this.data.shopId, 'services.manage'),
  );

  ngOnInit(): void {
    this.reloadLists();
    this.form.controls.conceptId.valueChanges.subscribe((id) => this.syncPartyKindForConcept(id));
  }

  setPartyKind(kind: PartyKind): void {
    this.partyKind.set(kind);
    if (kind === 'supplier') this.serviceId.set(null);
    else this.supplierId.set(null);
  }

  private syncPartyKindForConcept(conceptId?: string | null): void {
    const id = conceptId ?? this.form.controls.conceptId.value;
    const concept = this.concepts().find((c) => c.id === id);
    const allowS = !this.isIncome && conceptHasCategory(concept, 'SUPPLIERS');
    const allowV = !this.isIncome && conceptHasCategory(concept, 'SERVICES');
    if (!allowS && !allowV) {
      this.supplierId.set(null);
      this.serviceId.set(null);
      return;
    }
    if (allowS && !allowV) {
      this.partyKind.set('supplier');
      this.serviceId.set(null);
      return;
    }
    if (!allowS && allowV) {
      this.partyKind.set('service');
      this.supplierId.set(null);
      return;
    }
    if (this.partyKind() === 'supplier') this.serviceId.set(null);
    else this.supplierId.set(null);
  }

  reloadLists(): void {
    const shopId = this.data.shopId;
    if (!shopId) {
      this.loadingLists.set(false);
      this.listsFailed.set(true);
      return;
    }
    this.loadingLists.set(true);
    this.listsFailed.set(false);
    forkJoin({
      accounts: this.api.accounts(shopId).pipe(catchError(() => of(null))),
      concepts: this.api
        .concepts(shopId, { kind: this.isIncome ? 'INCOME' : 'EXPENSE' })
        .pipe(catchError(() => of(null))),
      suppliers: this.isIncome
        ? of([] as ShopSupplier[])
        : this.suppliersApi.list(shopId).pipe(catchError(() => of([] as ShopSupplier[]))),
      services: this.isIncome
        ? of([] as ShopService[])
        : this.servicesApi.list(shopId).pipe(catchError(() => of([] as ShopService[]))),
    }).subscribe({
      next: ({ accounts, concepts, suppliers, services }) => {
        this.loadingLists.set(false);
        if (!accounts || !concepts) {
          this.listsFailed.set(true);
          if (accounts) this.accounts.set(accounts);
          if (concepts) this.concepts.set(concepts);
          return;
        }
        this.accounts.set(accounts);
        this.concepts.set(concepts);
        this.suppliers.set(suppliers ?? []);
        this.services.set(services ?? []);
        this.listsFailed.set(false);
        this.syncPartyKindForConcept();
      },
      error: () => {
        this.loadingLists.set(false);
        this.listsFailed.set(true);
      },
    });
  }

  createSupplier(): void {
    const name = this.newSupplierName.value.trim();
    if (!name || this.creatingSupplier() || !this.canManageSuppliers()) return;
    this.creatingSupplier.set(true);
    this.suppliersApi
      .create(this.data.shopId, {
        name,
        bankAlias: this.newSupplierAlias.value.trim() || null,
      })
      .subscribe({
        next: (row) => {
          this.creatingSupplier.set(false);
          this.suppliers.update((list) =>
            [...list, row].sort((a, b) => a.name.localeCompare(b.name)),
          );
          this.supplierId.set(row.id);
          this.partyKind.set('supplier');
          this.serviceId.set(null);
          this.newSupplierName.setValue('');
          this.newSupplierAlias.setValue('');
          this.snack.open('Proveedor creado', 'OK', { duration: 2000 });
        },
        error: (err) => {
          this.creatingSupplier.set(false);
          const msg = apiErrorMessage(err, 'No se pudo crear el proveedor');
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }

  createService(): void {
    const name = this.newServiceName.value.trim();
    if (!name || this.creatingService() || !this.canManageServices()) return;
    this.creatingService.set(true);
    this.servicesApi
      .create(this.data.shopId, {
        name,
        bankAlias: this.newServiceAlias.value.trim() || null,
      })
      .subscribe({
        next: (row) => {
          this.creatingService.set(false);
          this.services.update((list) =>
            [...list, row].sort((a, b) => a.name.localeCompare(b.name)),
          );
          this.serviceId.set(row.id);
          this.partyKind.set('service');
          this.supplierId.set(null);
          this.newServiceName.setValue('');
          this.newServiceAlias.setValue('');
          this.snack.open('Servicio creado', 'OK', { duration: 2000 });
        },
        error: (err) => {
          this.creatingService.set(false);
          const msg = apiErrorMessage(err, 'No se pudo crear el servicio');
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }

  receiptRequired(): boolean {
    if (this.isIncome) return false;
    return expenseReceiptRequired(this.form.controls.paymentMethod.value);
  }

  missingReceipt(): boolean {
    return this.receiptRequired() && !this.receiptFile();
  }

  savedFields(movement: Movement) {
    return movementSavedDialogData(movement, this.data.shopName).fields;
  }

  async share(movement: Movement): Promise<void> {
    const data = movementSavedDialogData(movement, this.data.shopName);
    this.sharing.set(true);
    const result = await shareText({
      title: data.shareTitle,
      text: data.shareText || data.shareTitle,
    });
    this.sharing.set(false);
    if (result === 'copied') {
      this.snack.open('Copiado al portapapeles', 'OK', { duration: 2200 });
    } else if (result === 'failed') {
      this.snack.open('No se pudo compartir', 'OK', { duration: 3000 });
    }
  }

  async onReceiptPicked(ev: Event): Promise<void> {
    const file = await takeInputFile(ev.target as HTMLInputElement);
    if (file) this.receiptFile.set(file);
  }

  private resolveExpenseDestination(): {
    toAccountId: string | null;
    partyLabel: string | null;
  } {
    const egreso = this.egresoAccountId();
    if (this.isIncome) return { toAccountId: egreso, partyLabel: null };

    if (this.partyKind() === 'supplier' && this.partyAllowsSupplier()) {
      const id = this.supplierId();
      const row = id ? this.suppliers().find((s) => s.id === id) : null;
      if (row?.accountId) {
        return { toAccountId: row.accountId, partyLabel: `Proveedor: ${row.name}` };
      }
    }
    if (this.partyKind() === 'service' && this.partyAllowsService()) {
      const id = this.serviceId();
      const row = id ? this.services().find((s) => s.id === id) : null;
      if (row?.accountId) {
        return { toAccountId: row.accountId, partyLabel: `Servicio: ${row.name}` };
      }
    }
    return { toAccountId: egreso, partyLabel: null };
  }

  save(): void {
    const systemId = this.isIncome ? this.ingresoAccountId() : this.egresoAccountId();
    if (!this.canSubmit() || !systemId) {
      this.form.markAllAsTouched();
      if (!this.isIncome) this.amountLines.markAllAsTouched();
      if (!systemId) {
        this.snack.open(
          this.isIncome
            ? 'No hay cuenta de Ingreso configurada'
            : 'No hay cuenta de Egreso configurada',
          'OK',
          { duration: 3500 },
        );
      }
      return;
    }
    if (this.missingReceipt()) {
      this.snack.open('Con transferencia el comprobante es obligatorio', 'OK', {
        duration: 3500,
      });
      return;
    }
    const raw = this.form.getRawValue();
    const dest = this.resolveExpenseDestination();
    if (!this.isIncome && !dest.toAccountId) {
      this.snack.open('No hay cuenta de Egreso configurada', 'OK', { duration: 3500 });
      return;
    }
    const tz = this.shops.selectedShop()?.timezone;
    const receipt = this.receiptFile();
    const description = [raw.description.trim() || null, dest.partyLabel]
      .filter(Boolean)
      .join(' · ');
    const amounts = this.isIncome
      ? [Number(raw.amountUyu)].filter((n) => Number.isFinite(n) && n > 0)
      : this.readAmountLines();
    if (!amounts.length) {
      this.snack.open('Indicá al menos un monto mayor a 0', 'OK', { duration: 3500 });
      return;
    }
    if (!this.isIncome && amounts.length !== this.amountLines.length) {
      this.amountLines.markAllAsTouched();
      this.snack.open('Completá todos los montos', 'OK', { duration: 3500 });
      return;
    }

    this.busy.set(true);
    let created = 0;
    let lastSaved: Movement | null = null;
    let receiptFail = 0;

    from(amounts)
      .pipe(
        concatMap((amountUyu) =>
          this.api
            .create(this.data.shopId, {
              businessDate: todayIso(tz),
              fromAccountId: this.isIncome ? systemId : raw.fromAccountId,
              toAccountId: this.isIncome ? raw.fromAccountId : dest.toAccountId!,
              conceptId: raw.conceptId,
              employeeId: null,
              description: description || null,
              amountUyu,
              invoiced: false,
              notifyAdmins: true,
              kind: this.isIncome ? 'income' : 'expense',
              paymentMethod: this.isIncome ? null : (raw.paymentMethod as ExpensePaymentMethod),
            })
            .pipe(
              concatMap((saved) => {
                if (!receipt || this.isIncome) return of({ saved, receiptOk: true as const });
                return this.api.uploadReceiptFile(this.data.shopId, saved.id, receipt).pipe(
                  map((withFile) => ({ saved: withFile, receiptOk: true as const })),
                  catchError(() => of({ saved, receiptOk: false as const })),
                );
              }),
            ),
        ),
      )
      .subscribe({
        next: ({ saved, receiptOk }) => {
          created += 1;
          lastSaved = saved;
          if (!receiptOk) receiptFail += 1;
        },
        error: (err) => {
          this.busy.set(false);
          if (!this.isIncome) {
            const done = created;
            for (let i = 0; i < done; i++) {
              if (this.amountLines.length > 0) this.amountLines.removeAt(0);
            }
            if (this.amountLines.length === 0) {
              this.amountLines.push(this.newAmountLine());
            }
          }
          const msg = apiErrorMessage(err, 'No se pudo registrar el gasto');
          const prefix = created
            ? `Se registraron ${created} gasto${created === 1 ? '' : 's'}. El siguiente falló: `
            : '';
          this.snack.open(`${prefix}${Array.isArray(msg) ? msg.join(', ') : msg}`, 'OK', {
            duration: 5000,
          });
          if (created > 0) this.cashWithdrawalsInbox.refresh();
        },
        complete: () => {
          if (!lastSaved) {
            this.busy.set(false);
            return;
          }
          if (receiptFail > 0) {
            this.snack.open(
              created === 1
                ? 'El gasto se registró, pero el comprobante no se pudo subir'
                : 'Los gastos se registraron, pero algún comprobante no se pudo subir',
              'OK',
              { duration: 4000 },
            );
          }
          this.finishSaved(lastSaved, created);
        },
      });
  }

  private finishSaved(saved: Movement, count = 1): void {
    this.busy.set(false);
    this.savedCount.set(count);
    this.saved.set(saved);
    this.cashWithdrawalsInbox.refresh();
  }
}
