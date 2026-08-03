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

        <section class="mov-side">
          <div class="mov-side__head">
            <strong>Origen</strong>
            <span>Opcional</span>
          </div>
          <div class="mov-side__row">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Usuario</mat-label>
              <mat-icon matPrefix>person</mat-icon>
              <mat-select
                formControlName="fromUserId"
                (selectionChange)="onSideUserChange('from', $event.value)"
              >
                <mat-option value="">— Sin usuario —</mat-option>
                <mat-option [value]="localKey">Cuentas del local</mat-option>
                @for (u of users(); track u.id) {
                  <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Cuenta</mat-label>
              <mat-icon matPrefix>call_made</mat-icon>
              <mat-select formControlName="fromAccountId">
                <mat-option value="">— Sin cuenta —</mat-option>
                @for (a of fromAccountOptions(); track a.id) {
                  <mat-option [value]="a.id">{{ a.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          @if (canQuickAdd('from')) {
            <div class="mov-side__add">
              @if (!addingFrom()) {
                <button mat-stroked-button type="button" (click)="addingFrom.set(true)">
                  <mat-icon>add</mat-icon>
                  Nueva cuenta
                </button>
              } @else {
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mov-side__add-field">
                  <mat-label>Nombre de la cuenta</mat-label>
                  <input matInput [formControl]="newFromAccountName" placeholder="ej. Socio Juan" />
                </mat-form-field>
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  [disabled]="busy()"
                  (click)="createAccountForSide('from')"
                >
                  Crear
                </button>
                <button mat-button type="button" (click)="cancelQuickAdd('from')">Cancelar</button>
              }
            </div>
          }
        </section>

        <section class="mov-side">
          <div class="mov-side__head">
            <strong>Destino</strong>
            <span>Opcional</span>
          </div>
          <div class="mov-side__row">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Usuario</mat-label>
              <mat-icon matPrefix>person</mat-icon>
              <mat-select
                formControlName="toUserId"
                (selectionChange)="onSideUserChange('to', $event.value)"
              >
                <mat-option value="">— Sin usuario —</mat-option>
                <mat-option [value]="localKey">Cuentas del local</mat-option>
                @for (u of users(); track u.id) {
                  <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Cuenta</mat-label>
              <mat-icon matPrefix>call_received</mat-icon>
              <mat-select formControlName="toAccountId">
                <mat-option value="">— Sin cuenta —</mat-option>
                @for (a of toAccountOptions(); track a.id) {
                  <mat-option [value]="a.id">{{ a.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          @if (canQuickAdd('to')) {
            <div class="mov-side__add">
              @if (!addingTo()) {
                <button mat-stroked-button type="button" (click)="addingTo.set(true)">
                  <mat-icon>add</mat-icon>
                  Nueva cuenta
                </button>
              } @else {
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mov-side__add-field">
                  <mat-label>Nombre de la cuenta</mat-label>
                  <input matInput [formControl]="newToAccountName" placeholder="ej. Socio Juan" />
                </mat-form-field>
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  [disabled]="busy()"
                  (click)="createAccountForSide('to')"
                >
                  Crear
                </button>
                <button mat-button type="button" (click)="cancelQuickAdd('to')">Cancelar</button>
              }
            </div>
          }
        </section>

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

        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="guy-dialog__span-2">
          <mat-label>Descripción</mat-label>
          <mat-icon matPrefix>notes</mat-icon>
          <input matInput formControlName="description" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Monto ($)</mat-label>
          <mat-icon matPrefix>attach_money</mat-icon>
          <input matInput type="number" min="0" formControlName="amountUyu" />
          @if (form.controls.amountUyu.touched && form.controls.amountUyu.hasError('required')) {
            <mat-error>Ingresá un monto</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Cotización USD (opcional)</mat-label>
          <input matInput type="number" min="0" step="0.01" formControlName="usdRate" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Monto USD (opcional)</mat-label>
          <input matInput type="number" min="0" step="0.01" formControlName="amountUsd" />
          <mat-hint>Se calcula solo si dejás este campo vacío y cargás la cotización</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Empleado (opcional)</mat-label>
          <mat-icon matPrefix>badge</mat-icon>
          <mat-select formControlName="employeeId">
            <mat-option [value]="null">Sin empleado</mat-option>
            @for (e of data.employees; track e.id) {
              <mat-option [value]="e.id">{{ e.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <div class="guy-dialog__span-2 d-flex align-items-center gap-3 flex-wrap">
          <mat-slide-toggle formControlName="invoiced">Facturado</mat-slide-toggle>
          @if (form.controls.invoiced.value) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1;min-width:180px">
              <mat-label>N° de factura</mat-label>
              <input matInput formControlName="invoiceNumber" />
            </mat-form-field>
          }
        </div>
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
        [disabled]="form.invalid || busy()"
        (click)="save()"
      >
        <app-busy-label [busy]="busy()" [busyLabel]="isEdit ? 'Guardando…' : 'Creando…'">
          <mat-icon>{{ isEdit ? 'save' : 'add' }}</mat-icon>
          {{ isEdit ? 'Guardar cambios' : 'Crear' }}
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .guy-dialog__span-2 {
        grid-column: 1 / -1;
      }

      .mov-form {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }

      .mov-side {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        padding: 0.7rem 0.8rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 12px;
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 70%, #fff);
      }

      .mov-side__head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.5rem;
      }

      .mov-side__head strong {
        font-size: 0.78rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--guy-navy, #003366);
      }

      .mov-side__head span {
        font-size: 0.75rem;
        color: var(--guy-muted, #5f6f76);
      }

      .mov-side__row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem;
      }

      .mov-side__add {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.45rem;
      }

      .mov-side__add-field {
        flex: 1 1 180px;
        margin: 0;
      }

      @media (max-width: 560px) {
        .mov-side__row {
          grid-template-columns: 1fr;
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

  readonly isEdit = this.data.mode === 'edit';
  private readonly movement = this.data.mode === 'edit' ? this.data.movement : null;
  readonly busy = signal(false);
  readonly localKey = LOCAL_ACCOUNTS_KEY;
  readonly addingFrom = signal(false);
  readonly addingTo = signal(false);
  readonly accounts = signal<LedgerAccount[]>([...this.data.accounts]);
  readonly users = signal<MovementUserOption[]>([...this.data.users]);

  readonly newFromAccountName = this.fb.nonNullable.control('');
  readonly newToAccountName = this.fb.nonNullable.control('');

  private initialFromUser = this.resolveUserForAccount(this.movement?.fromAccountId ?? null);
  private initialToUser = this.resolveUserForAccount(this.movement?.toAccountId ?? null);

  readonly form = this.fb.nonNullable.group({
    businessDate: [toDateInput(this.movement?.businessDate), Validators.required],
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
