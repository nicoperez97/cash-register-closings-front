import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MoneyInputDirective } from '../../shared/directives/money-input';
import { MovementsApiService } from '../movements/movements-api.service';
import {
  buildPaymentDialogAccounts,
  filterActivePaymentAccounts,
} from './payments-page-actions';
import {
  PAYMENT_METHOD_OPTIONS,
  PaymentMethod,
  ShopPayment,
} from './payments-api.service';

export type PaymentPayDialogData = {
  payment: ShopPayment;
  shopId?: string;
  /** Semilla opcional; el diálogo siempre recarga al abrir. */
  accounts?: Array<{ id: string; name: string }>;
};

export type PaymentPayDialogResult = {
  paymentMethod: PaymentMethod;
  accountId: string;
  amount: number;
};

function parseMoney(raw: unknown): number {
  if (raw === '' || raw === null || raw === undefined) return NaN;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  const n = Number(String(raw).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function moneyLabel(value: number): string {
  return Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

@Component({
  selector: 'app-payment-pay-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MoneyInputDirective,
  ],
  template: `
    <h2 mat-dialog-title>Marcar como pagado</h2>
    @if (loadingLists()) {
      <mat-dialog-content class="pay-confirm__loading">
        <mat-spinner diameter="36" />
        <p>Cargando…</p>
      </mat-dialog-content>
    } @else if (listsFailed()) {
      <mat-dialog-content>
        <p class="pay-confirm__empty">
          No se pudieron cargar las cuentas. Probá de nuevo.
        </p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="ref.close(null)">Cancelar</button>
        <button mat-flat-button color="primary" type="button" (click)="reloadLists()">
          <mat-icon>refresh</mat-icon>
          Reintentar
        </button>
      </mat-dialog-actions>
    } @else {
      <mat-dialog-content>
        <p class="pay-confirm__lead">
          ¿Confirmás el pago de <strong>{{ data.payment.title || 'Sin concepto' }}</strong>?
          Se crea un movimiento contable por el monto que indiques.
        </p>
        <form [formGroup]="form" class="pay-confirm__form">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Cuánto se paga</mat-label>
            <input matInput type="text" inputmode="decimal" appMoney formControlName="amount" />
            <mat-hint>
              Total {{ totalLabel }}.
              <button type="button" class="pay-confirm__hint-btn" (click)="fillTotal()">
                Usar total
              </button>
            </mat-hint>
          </mat-form-field>
          @if (remainderAmount() > 0.004) {
            <p class="pay-confirm__debt">
              Queda deuda de <strong>$ {{ moneyLabel(remainderAmount()) }}</strong>: se crea otro
              pago pendiente con los mismos datos.
            </p>
          }
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Cuenta que paga</mat-label>
            <mat-select formControlName="accountId">
              @for (a of accounts(); track a.id) {
                <mat-option [value]="a.id">{{ a.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Forma de pago</mat-label>
            <mat-select formControlName="paymentMethod">
              @for (opt of methods; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </form>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="ref.close(null)">Cancelar</button>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="form.invalid || !amountOk()"
          (click)="confirm()"
        >
          <mat-icon>paid</mat-icon>
          Confirmar pago
        </button>
      </mat-dialog-actions>
    }
  `,
  styles: [
    `
      .pay-confirm__lead {
        margin: 0 0 1rem;
        line-height: 1.45;
      }
      .pay-confirm__form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        min-width: min(100%, 320px);
      }
      .pay-confirm__hint-btn {
        margin: 0;
        padding: 0;
        border: 0;
        background: none;
        color: var(--guy-primary, #1d65a0);
        font: inherit;
        font-weight: 650;
        cursor: pointer;
        text-decoration: underline;
      }
      .pay-confirm__debt {
        margin: -0.25rem 0 0;
        color: var(--guy-muted, #5f6f76);
        font-size: 0.86rem;
        line-height: 1.4;
      }
      .pay-confirm__loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.85rem;
        min-height: 8rem;
        color: var(--guy-muted, #5f6f76);
        font-size: 0.9rem;
      }
      .pay-confirm__loading p {
        margin: 0;
      }
      .pay-confirm__empty {
        margin: 0.5rem 0;
        color: var(--guy-muted, #5f6f76);
        font-size: 0.92rem;
        line-height: 1.45;
      }
    `,
  ],
})
export class PaymentPayDialogComponent implements OnInit {
  readonly data = inject<PaymentPayDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<PaymentPayDialogComponent, PaymentPayDialogResult | null>);
  private readonly fb = inject(FormBuilder);
  private readonly movementsApi = inject(MovementsApiService);

  readonly methods = PAYMENT_METHOD_OPTIONS;
  readonly total = Math.round(Number(this.data.payment.amount ?? 0) * 100) / 100;
  readonly totalLabel = moneyLabel(this.total);
  readonly moneyLabel = moneyLabel;
  readonly loadingLists = signal(true);
  readonly listsFailed = signal(false);
  readonly accounts = signal<Array<{ id: string; name: string }>>(this.data.accounts ?? []);

  readonly form = this.fb.group({
    amount: [String(this.total), Validators.required],
    accountId: [
      this.data.payment.accountId || this.data.accounts?.[0]?.id || null,
      Validators.required,
    ],
    paymentMethod: [
      (this.data.payment.paymentMethod as PaymentMethod | null) ??
        ('transfer' as PaymentMethod),
      Validators.required,
    ],
  });

  ngOnInit(): void {
    this.reloadLists();
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
    this.movementsApi
      .accounts(shopId)
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (rows) => {
          this.loadingLists.set(false);
          if (!rows) {
            this.listsFailed.set(true);
            return;
          }
          const next = buildPaymentDialogAccounts(
            filterActivePaymentAccounts(rows),
            this.data.payment,
          );
          this.accounts.set(next);
          this.listsFailed.set(false);
          if (!this.form.controls.accountId.value) {
            this.form.controls.accountId.setValue(
              this.data.payment.accountId || next[0]?.id || null,
            );
          }
        },
        error: () => {
          this.loadingLists.set(false);
          this.listsFailed.set(true);
        },
      });
  }

  remainderAmount(): number {
    const paid = parseMoney(this.form.controls.amount.value);
    if (!Number.isFinite(paid)) return 0;
    return Math.round((this.total - paid) * 100) / 100;
  }

  amountOk(): boolean {
    const paid = parseMoney(this.form.controls.amount.value);
    return Number.isFinite(paid) && paid > 0.004 && paid <= this.total + 0.004;
  }

  fillTotal(): void {
    this.form.controls.amount.setValue(String(this.total));
  }

  confirm(): void {
    if (this.form.invalid || !this.amountOk()) return;
    const paymentMethod = this.form.controls.paymentMethod.value;
    const accountId = this.form.controls.accountId.value;
    const amount = Math.round(parseMoney(this.form.controls.amount.value) * 100) / 100;
    if (!paymentMethod || !accountId) return;
    this.ref.close({ paymentMethod, accountId, amount });
  }
}
