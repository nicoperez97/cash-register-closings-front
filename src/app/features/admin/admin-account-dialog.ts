import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { accountTypeLabel } from '../../core/i18n/labels';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { AuthService } from '../../core/auth/auth.service';
import { canConfigureShopOpeningBalances } from '../../core/auth/auth.models';

export interface AdminAccountRow {
  id: string;
  name: string;
  code: string;
  type: 'PARTNER' | 'CHANNEL' | 'SYSTEM' | 'SUPPLIER' | 'SERVICE';
  linkedPaymentMethod?: string | null;
  userIds?: string[];
  userId?: string | null;
  userFullName?: string | null;
  active: boolean;
  hideFromCashWithdraw?: boolean;
  listInExpenses?: boolean;
  listInIncomes?: boolean;
  listInTransfers?: boolean;
  openingBalance?: number | string | null;
}

export const LINKED_PAYMENT_METHOD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'PVS / Tarjeta' },
  { value: 'mercadoPago', label: 'Mercado Pago' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'accountDni', label: 'Cuenta DNI' },
  { value: 'other', label: 'Otros' },
];

export const ACCOUNT_TYPE_OPTIONS: Array<{
  value: 'PARTNER' | 'CHANNEL' | 'SYSTEM' | 'SUPPLIER' | 'SERVICE';
  label: string;
}> = [
  { value: 'PARTNER', label: accountTypeLabel('PARTNER') },
  { value: 'CHANNEL', label: accountTypeLabel('CHANNEL') },
  { value: 'SYSTEM', label: accountTypeLabel('SYSTEM') },
  { value: 'SUPPLIER', label: accountTypeLabel('SUPPLIER') },
  { value: 'SERVICE', label: accountTypeLabel('SERVICE') },
];

export type AdminAccountDialogData = {
  shopId?: string;
  /** Prefijo de tipo al crear (ej. CHANNEL desde config del local). */
  defaultType?: 'PARTNER' | 'CHANNEL' | 'SYSTEM' | 'SUPPLIER' | 'SERVICE';
  /** Nombre sugerido al crear (ej. desde una fuente de cuentas aparte). */
  suggestedName?: string;
} & (
  | { mode: 'create' }
  | { mode: 'edit'; account: AdminAccountRow }
);

function suggestAccountCode(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24);
}

interface UserOption {
  id: string;
  fullName: string;
  ledgerAccountIds?: string[];
  ledgerAccountId?: string | null;
}

@Component({
  selector: 'app-admin-account-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatCheckboxModule,
    MatIconModule,
    MatSnackBarModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'account_balance' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar cuenta' : 'Nueva cuenta' }}</strong>
        <span>Cuentas contables</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <mat-icon matPrefix>badge</mat-icon>
          <input matInput formControlName="name" />
          @if (form.controls.name.touched && form.controls.name.hasError('required')) {
            <mat-error>Ingresá un nombre</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Código</mat-label>
          <mat-icon matPrefix>tag</mat-icon>
          <input matInput formControlName="code" />
          @if (form.controls.code.touched && form.controls.code.hasError('required')) {
            <mat-error>Ingresá un código</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Tipo</mat-label>
          <mat-icon matPrefix>category</mat-icon>
          <mat-select formControlName="type" [disabled]="isSystem">
            @for (opt of typeOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Medio de pago vinculado (opcional)</mat-label>
          <mat-icon matPrefix>payments</mat-icon>
          <mat-select formControlName="linkedPaymentMethod">
            <mat-option [value]="null">Ninguno</mat-option>
            @for (opt of paymentOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Usuarios asociados</mat-label>
          <mat-icon matPrefix>group</mat-icon>
          <mat-select formControlName="userIds" multiple>
            @for (u of users(); track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
          <mat-hint>Una cuenta puede tener varios usuarios</mat-hint>
        </mat-form-field>

        @if (canConfigureOpeningBalances) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Saldo inicial</mat-label>
            <input matInput type="number" step="0.01" formControlName="openingBalance" />
            <mat-hint>Se suma al saldo de movimientos. Si la cuenta ya tiene plata, este monto se agrega.</mat-hint>
          </mat-form-field>
        }

        @if (form.controls.type.value !== 'SUPPLIER' && form.controls.type.value !== 'SERVICE') {
          <div class="account-lists">
            <p class="account-lists__title">Mostrar esta cuenta en</p>
            <p class="account-lists__hint">Si no está tildada, no aparece al cargar ese movimiento.</p>
            <mat-checkbox formControlName="listInExpenses">Gastos</mat-checkbox>
            <mat-checkbox formControlName="listInIncomes">Ingresos</mat-checkbox>
            <mat-checkbox formControlName="listInTransfers">Movimientos entre cuentas</mat-checkbox>
            <mat-checkbox formControlName="listInCashWithdraw">
              Cierres (quién se lo lleva)
            </mat-checkbox>
          </div>
        }

        @if (isEdit) {
          <mat-slide-toggle formControlName="active">Cuenta activa</mat-slide-toggle>
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
  styles: `
    .account-lists {
      display: grid;
      gap: 0.35rem;
      padding: 0.15rem 0 0.35rem;
    }
    .account-lists__title {
      margin: 0;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
    }
    .account-lists__hint {
      margin: 0 0 0.25rem;
      font-size: 0.8rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.35;
    }
  `,
})
export class AdminAccountDialogComponent implements OnInit {
  readonly data = inject<{ shopId: string } & AdminAccountDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AdminAccountDialogComponent, AdminAccountRow | boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  readonly canConfigureOpeningBalances = canConfigureShopOpeningBalances(this.auth.currentUser());

  readonly typeOptions = ACCOUNT_TYPE_OPTIONS;
  readonly paymentOptions = LINKED_PAYMENT_METHOD_OPTIONS;
  readonly isEdit = this.data.mode === 'edit';
  private readonly account = this.data.mode === 'edit' ? this.data.account : null;
  readonly isSystem = this.account?.type === 'SYSTEM';
  readonly busy = signal(false);
  readonly users = signal<UserOption[]>([]);

  private initialUserIds(): string[] {
    if (this.account?.userIds?.length) return [...this.account.userIds];
    if (this.account?.userId) return [this.account.userId];
    return [];
  }

  private initialCreateName(): string {
    if (this.isEdit) return this.account?.name ?? '';
    return String(this.data.suggestedName ?? '').trim();
  }

  private initialCreateCode(): string {
    if (this.isEdit) return this.account?.code ?? '';
    return suggestAccountCode(this.initialCreateName());
  }

  readonly form = this.fb.nonNullable.group({
    name: [this.initialCreateName(), Validators.required],
    code: [this.initialCreateCode(), Validators.required],
    type: [
      this.account?.type ?? this.data.defaultType ?? 'PARTNER',
      Validators.required,
    ],
    linkedPaymentMethod: this.fb.control<string | null>(this.account?.linkedPaymentMethod ?? null),
    userIds: this.fb.nonNullable.control<string[]>(this.initialUserIds()),
    listInExpenses: [this.account?.listInExpenses !== false],
    listInIncomes: [this.account?.listInIncomes !== false],
    listInTransfers: [this.account?.listInTransfers !== false],
    listInCashWithdraw: [!(this.account?.hideFromCashWithdraw ?? false)],
    openingBalance: [Number(this.account?.openingBalance ?? 0)],
    active: [this.account?.active ?? true],
  });

  ngOnInit(): void {
    this.http
      .get<UserOption[]>(`${environment.apiUrl}/users`, {
        params: { shopId: this.data.shopId },
      })
      .subscribe({
        next: (rows) => this.users.set(rows),
        error: () => this.users.set([]),
      });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const shopId = this.data.shopId;
    const raw = this.form.getRawValue();
    const body = {
      name: raw.name.trim(),
      code: raw.code.trim(),
      type: raw.type,
      linkedPaymentMethod: raw.linkedPaymentMethod || null,
      userIds: raw.userIds ?? [],
      hideFromCashWithdraw:
        raw.type === 'SUPPLIER' || raw.type === 'SERVICE' ? true : !raw.listInCashWithdraw,
      listInExpenses: raw.type === 'SUPPLIER' || raw.type === 'SERVICE' ? false : !!raw.listInExpenses,
      listInIncomes: raw.type === 'SUPPLIER' || raw.type === 'SERVICE' ? false : !!raw.listInIncomes,
      listInTransfers: raw.type === 'SUPPLIER' || raw.type === 'SERVICE' ? false : !!raw.listInTransfers,
      ...(this.canConfigureOpeningBalances
        ? { openingBalance: Number(raw.openingBalance ?? 0) }
        : {}),
      ...(this.isEdit ? { active: raw.active } : {}),
    };
    this.busy.set(true);

    const req =
      this.isEdit && this.account
        ? this.http.patch<AdminAccountRow>(
            `${environment.apiUrl}/shops/${shopId}/accounts/${this.account.id}`,
            body,
          )
        : this.http.post<AdminAccountRow>(`${environment.apiUrl}/shops/${shopId}/accounts`, body);

    req.subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.snack.open(this.isEdit ? 'Cuenta actualizada' : 'Cuenta creada', 'OK', { duration: 2500 });
        this.ref.close(saved);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'Error al guardar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }
}
