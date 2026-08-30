import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MovementsApiService } from '../movements/movements-api.service';
import {
  buildPaymentDialogAccounts,
  filterActivePaymentAccounts,
} from './payments-page-actions';
import { ShopPayment } from './payments-api.service';

export type PaymentValidateDialogData = {
  payment: ShopPayment;
  shopId?: string;
  /** Semilla opcional; el diálogo siempre recarga al abrir. */
  accounts?: Array<{ id: string; name: string }>;
};

export type PaymentValidateDialogResult = {
  accountId: string;
};

@Component({
  selector: 'app-payment-validate-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>Validar pago</h2>
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
          ¿Validás <strong>{{ data.payment.title || 'Sin concepto' }}</strong> por
          <strong>$ {{ amountLabel }}</strong>?
        </p>
        <form [formGroup]="form" class="pay-confirm__form">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Cuenta que paga</mat-label>
            <mat-select formControlName="accountId">
              @for (a of accounts(); track a.id) {
                <mat-option [value]="a.id">{{ a.name }}</mat-option>
              }
            </mat-select>
            <mat-hint>Cuenta desde la que va a salir el dinero</mat-hint>
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
          <mat-icon>check</mat-icon>
          Validar
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
export class PaymentValidateDialogComponent implements OnInit {
  readonly data = inject<PaymentValidateDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(
    MatDialogRef<PaymentValidateDialogComponent, PaymentValidateDialogResult | null>,
  );
  private readonly fb = inject(FormBuilder);
  private readonly movementsApi = inject(MovementsApiService);

  readonly amountLabel = Number(this.data.payment.amount ?? 0).toLocaleString('es-AR');
  readonly loadingLists = signal(true);
  readonly listsFailed = signal(false);
  readonly accounts = signal<Array<{ id: string; name: string }>>(this.data.accounts ?? []);

  readonly form = this.fb.group({
    accountId: [
      this.data.payment.accountId || (this.data.accounts?.[0]?.id ?? null),
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

  confirm(): void {
    if (this.form.invalid) return;
    const accountId = this.form.controls.accountId.value;
    if (!accountId) return;
    this.ref.close({ accountId });
  }
}
