import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import {
  PAYMENT_METHOD_OPTIONS,
  PaymentMethod,
  ShopPayment,
} from './payments-api.service';

export type PaymentPayDialogData = {
  payment: ShopPayment;
  accounts: Array<{ id: string; name: string }>;
};

export type PaymentPayDialogResult = {
  paymentMethod: PaymentMethod;
  accountId: string;
};

@Component({
  selector: 'app-payment-pay-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>Marcar como pagado</h2>
    <mat-dialog-content>
      <p class="pay-confirm__lead">
        ¿Confirmás el pago de <strong>{{ data.payment.title || 'Sin concepto' }}</strong> por
        <strong>$ {{ amountLabel }}</strong>? Se crea un movimiento contable.
      </p>
      <form [formGroup]="form" class="pay-confirm__form">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Cuenta que paga</mat-label>
          <mat-select formControlName="accountId">
            @for (a of data.accounts; track a.id) {
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
        [disabled]="form.invalid"
        (click)="confirm()"
      >
        <mat-icon>paid</mat-icon>
        Confirmar pago
      </button>
    </mat-dialog-actions>
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
    `,
  ],
})
export class PaymentPayDialogComponent {
  readonly data = inject<PaymentPayDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<PaymentPayDialogComponent, PaymentPayDialogResult | null>);
  private readonly fb = inject(FormBuilder);

  readonly methods = PAYMENT_METHOD_OPTIONS;
  readonly amountLabel = Number(this.data.payment.amount ?? 0).toLocaleString('es-AR');

  readonly form = this.fb.group({
    accountId: [
      this.data.payment.accountId || this.data.accounts[0]?.id || null,
      Validators.required,
    ],
    paymentMethod: [
      (this.data.payment.paymentMethod as PaymentMethod | null) ??
        ('transfer' as PaymentMethod),
      Validators.required,
    ],
  });

  confirm(): void {
    if (this.form.invalid) return;
    const paymentMethod = this.form.controls.paymentMethod.value;
    const accountId = this.form.controls.accountId.value;
    if (!paymentMethod || !accountId) return;
    this.ref.close({ paymentMethod, accountId });
  }
}
