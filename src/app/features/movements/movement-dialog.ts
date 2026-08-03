import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { Concept, LedgerAccount, Movement, MovementsApiService } from './movements-api.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { resolveShopCalendarDate } from '../../core/shop/business-date';
import { ShopContextService } from '../../core/shop/shop-context.service';

export interface MovementEmployeeOption {
  id: string;
  fullName: string;
}

export interface MovementUserAccountOption {
  id: string;
  name: string;
  code: string;
}

export interface MovementUserOption {
  id: string;
  fullName: string;
  email?: string;
  ledgerAccounts?: MovementUserAccountOption[];
}

export type MovementDialogData = {
  shopId: string;
  shopName: string;
  accounts: LedgerAccount[];
  concepts: Concept[];
  employees: MovementEmployeeOption[];
  users: MovementUserOption[];
} & ({ mode: 'create' } | { mode: 'edit'; movement: Movement });

const LOCAL_ACCOUNTS_KEY = '__local__';

function toDateInput(value?: string | null): Date | null {
  if (!value) return new Date();
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toDateString(value: Date | null): string {
  const d = value ?? new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function partnerCodeFromName(fullName: string): string {
  const slug = fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 28);
  return slug || 'SOCIO';
}

@Component({
  selector: 'app-movement-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatSlideToggleModule,
    MatIconModule,
    MatSnackBarModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'swap_horiz' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar movimiento' : 'Nuevo movimiento' }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form mov-form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Fecha</mat-label>
          <mat-icon matPrefix>event</mat-icon>
          <input matInput [matDatepicker]="datePicker" formControlName="businessDate" />
          <mat-datepicker-toggle matIconSuffix [for]="datePicker" />
          <mat-datepicker #datePicker />
        </mat-form-field>

        <div class="mov-transfer">
          <section class="mov-side">
            <div class="mov-side__head">
              <span class="mov-side__badge mov-side__badge--from" aria-hidden="true">
                <mat-icon>call_made</mat-icon>
              </span>
              <div class="mov-side__titles">
                <strong>Origen</strong>
                <span>De dónde sale</span>
              </div>
            </div>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Usuario</mat-label>
              <mat-icon matPrefix>person</mat-icon>
              <mat-select
                formControlName="fromUserId"
                (selectionChange)="onSideUserChange('from', $event.value)"
              >
                <mat-option value="">Sin usuario</mat-option>
                <mat-option [value]="localKey">Cuentas del local</mat-option>
                @for (u of users(); track u.id) {
                  <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Cuenta</mat-label>
              <mat-icon matPrefix>account_balance_wallet</mat-icon>
              <mat-select formControlName="fromAccountId">
                <mat-option value="">Sin cuenta</mat-option>
                @for (a of fromAccountOptions(); track a.id) {
                  <mat-option [value]="a.id">{{ a.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            @if (canQuickAdd('from')) {
              <div class="mov-side__add">
                @if (!addingFrom()) {
                  <button mat-stroked-button type="button" class="mov-side__add-btn" (click)="addingFrom.set(true)">
                    <mat-icon>add</mat-icon>
                    Nueva cuenta
                  </button>
                } @else {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mov-side__add-field">
                    <mat-label>Nombre de la cuenta</mat-label>
                    <input matInput [formControl]="newFromAccountName" placeholder="ej. Socio Juan" />
                  </mat-form-field>
                  <div class="mov-side__add-actions">
                    <button mat-button type="button" (click)="cancelQuickAdd('from')">Cancelar</button>
                    <button
                      mat-flat-button
                      color="primary"
                      type="button"
                      [disabled]="busy()"
                      (click)="createAccountForSide('from')"
                    >
                      Crear
                    </button>
                  </div>
                }
              </div>
            }
          </section>

          <div class="mov-transfer__arrow" aria-hidden="true">
            <mat-icon>south</mat-icon>
          </div>

          <section class="mov-side">
            <div class="mov-side__head">
              <span class="mov-side__badge mov-side__badge--to" aria-hidden="true">
                <mat-icon>call_received</mat-icon>
              </span>
              <div class="mov-side__titles">
                <strong>Destino</strong>
                <span>A dónde entra</span>
              </div>
            </div>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Usuario</mat-label>
              <mat-icon matPrefix>person</mat-icon>
              <mat-select
                formControlName="toUserId"
                (selectionChange)="onSideUserChange('to', $event.value)"
              >
                <mat-option value="">Sin usuario</mat-option>
                <mat-option [value]="localKey">Cuentas del local</mat-option>
                @for (u of users(); track u.id) {
                  <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Cuenta</mat-label>
              <mat-icon matPrefix>account_balance_wallet</mat-icon>
              <mat-select formControlName="toAccountId">
                <mat-option value="">Sin cuenta</mat-option>
                @for (a of toAccountOptions(); track a.id) {
                  <mat-option [value]="a.id">{{ a.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            @if (canQuickAdd('to')) {
              <div class="mov-side__add">
                @if (!addingTo()) {
                  <button mat-stroked-button type="button" class="mov-side__add-btn" (click)="addingTo.set(true)">
                    <mat-icon>add</mat-icon>
                    Nueva cuenta
                  </button>
                } @else {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mov-side__add-field">
                    <mat-label>Nombre de la cuenta</mat-label>
                    <input matInput [formControl]="newToAccountName" placeholder="ej. Socio Juan" />
                  </mat-form-field>
                  <div class="mov-side__add-actions">
                    <button mat-button type="button" (click)="cancelQuickAdd('to')">Cancelar</button>
                    <button
                      mat-flat-button
                      color="primary"
                      type="button"
                      [disabled]="busy()"
                      (click)="createAccountForSide('to')"
                    >
                      Crear
                    </button>
                  </div>
                }
              </div>
            }
          </section>
        </div>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Concepto</mat-label>
          <mat-icon matPrefix>sell</mat-icon>
          <mat-select formControlName="conceptId">
            <mat-option [value]="null">Sin concepto</mat-option>
            @for (c of data.concepts; track c.id) {
              <mat-option [value]="c.id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Descripción</mat-label>
          <mat-icon matPrefix>notes</mat-icon>
          <input matInput formControlName="description" placeholder="Opcional" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mov-amount">
          <mat-label>Monto ($)</mat-label>
          <mat-icon matPrefix>attach_money</mat-icon>
          <input matInput type="number" min="0" inputmode="decimal" formControlName="amountUyu" />
          @if (form.controls.amountUyu.touched && form.controls.amountUyu.hasError('required')) {
            <mat-error>Ingresá un monto</mat-error>
          }
        </mat-form-field>

        <div class="mov-more">
          <button
            type="button"
            class="mov-more__toggle"
            (click)="showMore.set(!showMore())"
            [attr.aria-expanded]="showMore()"
          >
            <mat-icon>{{ showMore() ? 'expand_less' : 'expand_more' }}</mat-icon>
            <span>{{ showMore() ? 'Menos opciones' : 'Más opciones' }}</span>
            <span class="mov-more__hint">USD, empleado, factura</span>
          </button>

          @if (showMore()) {
            <div class="mov-more__body">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Cotización USD</mat-label>
                <input matInput type="number" min="0" step="0.01" inputmode="decimal" formControlName="usdRate" />
              </mat-form-field>

              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Monto USD</mat-label>
                <input matInput type="number" min="0" step="0.01" inputmode="decimal" formControlName="amountUsd" />
                <mat-hint>Se calcula si dejás vacío y hay cotización</mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Empleado</mat-label>
                <mat-icon matPrefix>badge</mat-icon>
                <mat-select formControlName="employeeId">
                  <mat-option [value]="null">Sin empleado</mat-option>
                  @for (e of data.employees; track e.id) {
                    <mat-option [value]="e.id">{{ e.fullName }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <div class="mov-invoice">
                <mat-slide-toggle formControlName="invoiced">Facturado</mat-slide-toggle>
                @if (form.controls.invoiced.value) {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>N° de factura</mat-label>
                    <input matInput formControlName="invoiceNumber" />
                  </mat-form-field>
                }
              </div>
            </div>
          }
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions class="mov-actions">
      <button
        mat-stroked-button
        type="button"
        class="mov-actions__cancel"
        (click)="ref.close(false)"
        [disabled]="busy()"
      >
        Cancelar
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        class="mov-actions__save"
        [disabled]="form.invalid || busy()"
        (click)="save()"
      >
        <app-busy-label [busy]="busy()" [busyLabel]="isEdit ? 'Guardando…' : 'Creando…'">
          <mat-icon>{{ isEdit ? 'save' : 'add' }}</mat-icon>
          {{ isEdit ? 'Guardar' : 'Crear' }}
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .mov-actions {
        display: flex !important;
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        align-items: stretch !important;
        gap: 0.55rem !important;
        width: 100%;
        margin: 0 !important;
        padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px)) !important;
        border-top: 1px solid var(--guy-border, rgba(15, 23, 42, 0.08));
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 55%, var(--guy-card, #fff));
      }

      .mov-actions__cancel,
      .mov-actions__save {
        flex: 1 1 0;
        min-width: 0;
        min-height: 48px;
        margin: 0 !important;
        border-radius: 12px !important;
      }

      .mov-actions__cancel {
        --mdc-outlined-button-outline-color: color-mix(in srgb, var(--guy-navy, #003366) 28%, transparent);
        font-weight: 600;
      }

      .mov-actions__save {
        font-weight: 700;
        letter-spacing: 0.01em;
        box-shadow: 0 6px 16px color-mix(in srgb, var(--guy-navy, #003366) 22%, transparent);
      }

      .mov-actions__save app-busy-label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
        width: 100%;
      }

      .mov-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        container-type: inline-size;
        container-name: mov-form;
      }

      .mov-transfer {
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      .mov-transfer__arrow {
        display: grid;
        place-items: center;
        height: 1.75rem;
        color: var(--guy-muted, #5f6f76);
      }

      .mov-transfer__arrow mat-icon {
        font-size: 1.15rem;
        width: 1.15rem;
        height: 1.15rem;
        opacity: 0.7;
      }

      .mov-side {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        padding: 0.75rem 0.85rem 0.85rem;
        border-radius: 14px;
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 85%, #fff);
        border: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 80%, transparent);
      }

      .mov-side__head {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        margin-bottom: 0.1rem;
      }

      .mov-side__badge {
        display: grid;
        place-items: center;
        width: 2rem;
        height: 2rem;
        border-radius: 10px;
        flex-shrink: 0;
      }

      .mov-side__badge mat-icon {
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
      }

      .mov-side__badge--from {
        background: color-mix(in srgb, #c62828 12%, transparent);
        color: #c62828;
      }

      .mov-side__badge--to {
        background: color-mix(in srgb, var(--guy-green, #2e7d32) 16%, transparent);
        color: var(--guy-green, #2e7d32);
      }

      .mov-side__titles {
        display: flex;
        flex-direction: column;
        gap: 0.05rem;
        min-width: 0;
      }

      .mov-side__titles strong {
        font-size: 0.92rem;
        font-weight: 700;
        line-height: 1.2;
        color: var(--guy-navy, #003366);
      }

      .mov-side__titles span {
        font-size: 0.75rem;
        color: var(--guy-muted, #5f6f76);
      }

      .mov-side .mat-mdc-form-field {
        width: 100%;
      }

      .mov-side__add {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }

      .mov-side__add-btn {
        width: 100%;
        min-height: 44px;
      }

      .mov-side__add-field {
        width: 100%;
        margin: 0;
      }

      .mov-side__add-actions {
        display: flex;
        gap: 0.4rem;
        justify-content: flex-end;
      }

      .mov-side__add-actions .mat-mdc-button-base {
        min-height: 44px;
      }

      .mov-amount {
        margin-top: 0.15rem;
      }

      .mov-more {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        margin-top: 0.15rem;
      }

      .mov-more__toggle {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        width: 100%;
        min-height: 44px;
        padding: 0.45rem 0.65rem;
        border: 1px dashed color-mix(in srgb, var(--guy-border, #d7e0d9) 90%, transparent);
        border-radius: 12px;
        background: transparent;
        color: var(--guy-navy, #003366);
        font: inherit;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
      }

      .mov-more__toggle mat-icon {
        font-size: 1.25rem;
        width: 1.25rem;
        height: 1.25rem;
        color: var(--guy-muted, #5f6f76);
      }

      .mov-more__hint {
        margin-left: auto;
        font-size: 0.72rem;
        font-weight: 500;
        color: var(--guy-muted, #5f6f76);
        white-space: nowrap;
      }

      .mov-more__body {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        padding: 0.15rem 0 0.25rem;
      }

      .mov-invoice {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        padding: 0.35rem 0.15rem 0;
      }

      /* Desktop ancho: usuario + cuenta en dos columnas */
      @container mov-form (min-width: 520px) {
        .mov-side {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.65rem 0.75rem;
          align-items: start;
        }

        .mov-side__head,
        .mov-side__add {
          grid-column: 1 / -1;
        }
      }

      /* Fallback si no hay container queries */
      @supports not (container-type: inline-size) {
        @media (min-width: 640px) {
          .mov-side {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.65rem 0.75rem;
            align-items: start;
          }

          .mov-side__head,
          .mov-side__add {
            grid-column: 1 / -1;
          }
        }
      }

      @media (max-width: 420px) {
        .mov-more__hint {
          display: none;
        }
      }
    `,
  ],
})
export class MovementDialogComponent {
  readonly data = inject<MovementDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<MovementDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(MovementsApiService);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly shops = inject(ShopContextService);

  readonly isEdit = this.data.mode === 'edit';
  private readonly movement = this.data.mode === 'edit' ? this.data.movement : null;
  readonly busy = signal(false);
  readonly showMore = signal(false);
  readonly localKey = LOCAL_ACCOUNTS_KEY;
  readonly addingFrom = signal(false);
  readonly addingTo = signal(false);
  readonly accounts = signal<LedgerAccount[]>([...this.data.accounts]);
  readonly users = signal<MovementUserOption[]>([...this.data.users]);

  readonly newFromAccountName = this.fb.nonNullable.control('');
  readonly newToAccountName = this.fb.nonNullable.control('');

  private initialFromUser = this.resolveUserForAccount(this.movement?.fromAccountId ?? null);
  private initialToUser = this.resolveUserForAccount(this.movement?.toAccountId ?? null);

  private defaultBusinessDate(): string {
    const shop = this.shops.selectedShop();
    return resolveShopCalendarDate(new Date(), {
      timezone: shop?.timezone,
    });
  }

  readonly form = this.fb.nonNullable.group({
    businessDate: [
      toDateInput(this.movement?.businessDate ?? this.defaultBusinessDate()),
      Validators.required,
    ],
    fromUserId: [this.initialFromUser],
    toUserId: [this.initialToUser],
    fromAccountId: [this.movement?.fromAccountId ?? ''],
    toAccountId: [this.movement?.toAccountId ?? ''],
    conceptId: this.fb.control<string | null>(this.movement?.conceptId ?? null),
    description: [this.movement?.description ?? ''],
    amountUyu: [this.movement?.amountUyu ?? 0, [Validators.required, Validators.min(0)]],
    usdRate: this.fb.control<number | null>(this.movement?.usdRate ?? null),
    amountUsd: this.fb.control<number | null>(this.movement?.amountUsd ?? null),
    employeeId: this.fb.control<string | null>(this.movement?.employeeId ?? null),
    invoiced: [this.movement?.invoiced ?? false],
    invoiceNumber: [this.movement?.invoiceNumber ?? ''],
  });

  private readonly formValue = signal(this.form.getRawValue());

  constructor() {
    this.form.valueChanges.subscribe(() => this.formValue.set(this.form.getRawValue()));
    // Abrir “Más opciones” si el movimiento ya tiene datos secundarios.
    if (
      this.movement &&
      (this.movement.usdRate != null ||
        this.movement.amountUsd != null ||
        this.movement.employeeId ||
        this.movement.invoiced)
    ) {
      this.showMore.set(true);
    }
  }

  readonly fromAccountOptions = computed(() =>
    this.accountsForUserKey(this.formValue().fromUserId),
  );
  readonly toAccountOptions = computed(() => this.accountsForUserKey(this.formValue().toUserId));

  canQuickAdd(side: 'from' | 'to'): boolean {
    const userId = side === 'from' ? this.formValue().fromUserId : this.formValue().toUserId;
    return !!userId && userId !== LOCAL_ACCOUNTS_KEY;
  }

  onSideUserChange(side: 'from' | 'to', userKey: string): void {
    const options = this.accountsForUserKey(userKey);
    const control = side === 'from' ? 'fromAccountId' : 'toAccountId';
    const current = String(this.form.getRawValue()[control] ?? '');
    if (!options.some((a) => a.id === current)) {
      this.form.patchValue({ [control]: options.length === 1 ? options[0].id : '' });
    }
    if (side === 'from') this.cancelQuickAdd('from');
    else this.cancelQuickAdd('to');
  }

  cancelQuickAdd(side: 'from' | 'to'): void {
    if (side === 'from') {
      this.addingFrom.set(false);
      this.newFromAccountName.setValue('');
    } else {
      this.addingTo.set(false);
      this.newToAccountName.setValue('');
    }
  }

  createAccountForSide(side: 'from' | 'to'): void {
    const userId = side === 'from' ? this.form.getRawValue().fromUserId : this.form.getRawValue().toUserId;
    if (!userId || userId === LOCAL_ACCOUNTS_KEY) return;
    const nameCtrl = side === 'from' ? this.newFromAccountName : this.newToAccountName;
    const name = nameCtrl.value.trim();
    if (!name) {
      this.snack.open('Ingresá el nombre de la cuenta', 'OK', { duration: 2500 });
      return;
    }
    const user = this.users().find((u) => u.id === userId);
    const codeBase = partnerCodeFromName(name);
    let code = codeBase;
    let n = 2;
    const existing = new Set(this.accounts().map((a) => a.code.toUpperCase()));
    while (existing.has(code)) {
      code = `${codeBase}_${n}`.slice(0, 40);
      n += 1;
    }

    this.busy.set(true);
    this.http
      .post<LedgerAccount & { userIds?: string[] }>(
        `${environment.apiUrl}/shops/${this.data.shopId}/accounts`,
        {
          name,
          code,
          type: 'PARTNER',
          userIds: [userId],
          active: true,
        },
      )
      .subscribe({
        next: (created) => {
          const account: LedgerAccount = {
            id: created.id,
            shopId: created.shopId,
            name: created.name,
            code: created.code,
            type: created.type,
            linkedPaymentMethod: created.linkedPaymentMethod ?? null,
            userIds: created.userIds ?? [userId],
            active: created.active,
          };
          this.accounts.update((rows) => [...rows, account]);
          this.users.update((rows) =>
            rows.map((u) =>
              u.id !== userId
                ? u
                : {
                    ...u,
                    ledgerAccounts: [
                      ...(u.ledgerAccounts ?? []),
                      { id: account.id, name: account.name, code: account.code },
                    ],
                  },
            ),
          );
          if (side === 'from') {
            this.form.patchValue({ fromAccountId: account.id });
            this.cancelQuickAdd('from');
          } else {
            this.form.patchValue({ toAccountId: account.id });
            this.cancelQuickAdd('to');
          }
          this.busy.set(false);
          this.snack.open(
            `Cuenta «${account.name}» creada${user ? ` para ${user.fullName}` : ''}`,
            'OK',
            { duration: 2500 },
          );
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudo crear la cuenta';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const shopId = this.data.shopId;
    const raw = this.form.getRawValue();
    const body: Partial<Movement> = {
      businessDate: toDateString(raw.businessDate),
      fromAccountId: raw.fromAccountId || null,
      toAccountId: raw.toAccountId || null,
      conceptId: raw.conceptId || null,
      description: raw.description.trim() || null,
      amountUyu: raw.amountUyu,
      usdRate: raw.usdRate,
      amountUsd: raw.amountUsd,
      employeeId: raw.employeeId || null,
      invoiced: raw.invoiced,
      invoiceNumber: raw.invoiced ? raw.invoiceNumber.trim() || null : null,
    };
    this.busy.set(true);

    const req =
      this.isEdit && this.movement
        ? this.api.update(shopId, this.movement.id, body)
        : this.api.create(shopId, body);

    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open(this.isEdit ? 'Movimiento actualizado' : 'Movimiento creado', 'OK', {
          duration: 2500,
        });
        this.ref.close(true);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'Error al guardar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  private accountsForUserKey(userKey: string | null | undefined): Array<{ id: string; name: string }> {
    const key = String(userKey ?? '');
    if (!key) return [];
    if (key === LOCAL_ACCOUNTS_KEY) {
      return this.accounts()
        .filter((a) => a.type === 'CHANNEL' || a.type === 'SYSTEM')
        .map((a) => ({ id: a.id, name: a.name }));
    }
    const fromUsers = this.users().find((u) => u.id === key)?.ledgerAccounts ?? [];
    if (fromUsers.length) return fromUsers.map((a) => ({ id: a.id, name: a.name }));
    return this.accounts()
      .filter((a) => (a.userIds ?? []).includes(key))
      .map((a) => ({ id: a.id, name: a.name }));
  }

  private resolveUserForAccount(accountId: string | null | undefined): string {
    if (!accountId) return '';
    const account = this.data.accounts.find((a) => a.id === accountId);
    if (account?.type === 'CHANNEL' || account?.type === 'SYSTEM') return LOCAL_ACCOUNTS_KEY;
    const fromUsers = this.data.users.find((u) =>
      (u.ledgerAccounts ?? []).some((a) => a.id === accountId),
    );
    if (fromUsers) return fromUsers.id;
    const uid = account?.userIds?.[0];
    return uid ?? LOCAL_ACCOUNTS_KEY;
  }
}
