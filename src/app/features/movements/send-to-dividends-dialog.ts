import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { resolveShopCalendarDate } from '../../core/shop/business-date';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { MoneyInputDirective } from '../../shared/directives/money-input';
import { parseLocaleNumber } from '../../shared/utils/money';
import { LedgerAccount, MovementsApiService } from './movements-api.service';

export type SendToDividendsDialogData = {
  shopId: string;
  accounts: LedgerAccount[];
  /** Prefill cuenta socio (opcional). */
  fromAccountId?: string | null;
};

function toDateInput(value?: string | null): string {
  if (!value) {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(value).slice(0, 10);
}

function toDateString(value: string | Date | null | undefined): string {
  if (!value) return toDateInput();
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Component({
  selector: 'app-send-to-dividends-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    BusyLabelComponent,
    MoneyInputDirective,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>savings</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Enviar a dividendos</strong>
        <span>Sale del saldo del socio y va a Dividendos</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Fecha</mat-label>
          <input matInput type="date" formControlName="businessDate" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Cuenta socio</mat-label>
          <mat-select formControlName="fromAccountId">
            @for (a of partnerAccounts; track a.id) {
              <mat-option [value]="a.id">{{ a.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Para socio (opcional)</mat-label>
          <mat-select formControlName="beneficiaryAccountId">
            <mat-option value="">Sin beneficiario</mat-option>
            @for (a of partnerAccounts; track a.id) {
              @if (a.id !== form.controls.fromAccountId.value) {
                <mat-option [value]="a.id">{{ a.name }}</mat-option>
              }
            }
          </mat-select>
          <mat-hint>No le suma saldo; el dinero va a Dividendos</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Monto ($)</mat-label>
          <input matInput type="text" inputmode="decimal" appMoney formControlName="amountUyu" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nota</mat-label>
          <input matInput formControlName="description" placeholder="Opcional" />
        </mat-form-field>
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
        <app-busy-label [busy]="busy()" busyLabel="Enviando…">Enviar</app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
})
export class SendToDividendsDialogComponent {
  readonly data = inject<SendToDividendsDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<SendToDividendsDialogComponent>);
  private readonly api = inject(MovementsApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly shops = inject(ShopContextService);
  private readonly fb = inject(FormBuilder);

  readonly busy = signal(false);
  readonly partnerAccounts = (this.data.accounts ?? []).filter(
    (a) => a.type === 'PARTNER' && a.active !== false,
  );

  private defaultDate(): string {
    const shop = this.shops.selectedShop();
    return resolveShopCalendarDate(new Date(), { timezone: shop?.timezone });
  }

  readonly form = this.fb.nonNullable.group({
    businessDate: [toDateInput(this.defaultDate()), Validators.required],
    fromAccountId: [
      this.data.fromAccountId &&
      this.partnerAccounts.some((a) => a.id === this.data.fromAccountId)
        ? this.data.fromAccountId
        : (this.partnerAccounts[0]?.id ?? ''),
      Validators.required,
    ],
    amountUyu: [0, [Validators.required, Validators.min(0.01)]],
    description: [''],
    beneficiaryAccountId: [''],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    if (raw.beneficiaryAccountId && raw.beneficiaryAccountId === raw.fromAccountId) {
      this.snack.open('El beneficiario tiene que ser otro socio', 'OK', { duration: 3500 });
      return;
    }
    this.busy.set(true);
    this.api
      .sendToDividends(this.data.shopId, {
        fromAccountId: raw.fromAccountId,
        amountUyu: parseLocaleNumber(raw.amountUyu),
        businessDate: toDateString(raw.businessDate),
        description: raw.description.trim() || null,
        beneficiaryAccountId: raw.beneficiaryAccountId || null,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.snack.open('Enviado a dividendos', 'OK', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudo enviar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }
}
