import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
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
import { CashWithdrawalsInboxService } from '../cash-withdrawals/cash-withdrawals-inbox.service';
import {
  Concept,
  LedgerAccount,
  Movement,
  MovementsApiService,
} from './movements-api.service';

export type QuickExpenseDialogData = {
  shopId: string;
  shopName: string;
  accounts: LedgerAccount[];
  concepts: Concept[];
};

function todayIso(timezone?: string | null): string {
  return resolveShopCalendarDate(new Date(), { timezone: timezone ?? undefined });
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
    MatCheckboxModule,
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
        <strong>{{ saved() ? 'Gasto registrado' : 'Gasto rápido' }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    @if (saved(); as movement) {
      <mat-dialog-content>
        <p class="quick-exp__ok">Quedó registrado. Podés compartirlo o cerrar.</p>
        <dl class="quick-exp__summary">
          @for (f of savedFields(movement); track f.label) {
            <div [class.quick-exp__total]="f.emphasize">
              <dt>{{ f.label }}</dt>
              <dd>{{ f.value }}</dd>
            </div>
          }
        </dl>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-stroked-button type="button" (click)="share(movement)" [disabled]="sharing()">
          <mat-icon>share</mat-icon>
          Compartir
        </button>
        <button mat-flat-button color="primary" type="button" (click)="ref.close(movement)">
          Cerrar
        </button>
      </mat-dialog-actions>
    } @else {
      <mat-dialog-content>
        <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Monto</mat-label>
            <mat-icon matPrefix>attach_money</mat-icon>
            <input matInput type="number" inputmode="decimal" formControlName="amountUyu" />
          </mat-form-field>

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
              @if (conceptQuery() && !filteredExpenseConcepts().length) {
                <mat-option disabled>Sin resultados</mat-option>
              }
            </mat-select>
            @if (form.controls.conceptId.touched && form.controls.conceptId.hasError('required')) {
              <mat-error>Elegí un concepto</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Sale de</mat-label>
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
              @if (accountQuery() && !filteredFromAccounts().length) {
                <mat-option disabled>Sin resultados</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>A quién</mat-label>
            <mat-icon matPrefix>account_balance</mat-icon>
            <mat-select
              formControlName="toAccountId"
              panelClass="guy-select-search-panel"
              (openedChange)="onSelectSearchOpened($event, destQuery)"
            >
              <mat-option disabled class="select-search-opt">
                <app-select-search [(query)]="destQuery" placeholder="Buscar cuenta…" />
              </mat-option>
              <mat-option value="">Egreso (por defecto)</mat-option>
              @for (a of filteredDestAccounts(); track a.id) {
                <mat-option [value]="a.id">{{ a.name }}</mat-option>
              }
              @if (destQuery() && !filteredDestAccounts().length) {
                <mat-option disabled>Sin resultados</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Descripción (opcional)</mat-label>
            <mat-icon matPrefix>notes</mat-icon>
            <input matInput formControlName="description" autocomplete="off" />
          </mat-form-field>

          <label class="quick-exp__notify">
            <mat-checkbox formControlName="notifyAdmins"></mat-checkbox>
            <span>
              <strong>Enviar notificación a administradores</strong>
              <small>Aviso en la app y por mail</small>
            </span>
          </label>
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
          [disabled]="form.invalid || busy() || !egresoAccountId()"
          (click)="save()"
        >
          <app-busy-label [busy]="busy()" busyLabel="Guardando…">
            <mat-icon>check</mat-icon>
            Registrar gasto
          </app-busy-label>
        </button>
      </mat-dialog-actions>
    }
  `,
  styles: `
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
    .quick-exp__notify {
      display: flex;
      align-items: flex-start;
      gap: 0.35rem;
      cursor: pointer;
    }
    .quick-exp__notify span {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      padding-top: 0.2rem;
    }
    .quick-exp__notify strong {
      font-size: 0.9rem;
      font-weight: 650;
      color: var(--guy-navy, #003366);
    }
    .quick-exp__notify small {
      font-size: 0.75rem;
      color: var(--guy-muted, #5f6f76);
    }
  `,
})
export class QuickExpenseDialogComponent {
  readonly data = inject<QuickExpenseDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<QuickExpenseDialogComponent, Movement | boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(MovementsApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly shops = inject(ShopContextService);
  private readonly cashWithdrawalsInbox = inject(CashWithdrawalsInboxService);

  readonly busy = signal(false);
  readonly sharing = signal(false);
  readonly saved = signal<Movement | null>(null);

  readonly egresoAccountId = computed(() => {
    const hit = this.data.accounts.find(
      (a) =>
        a.active !== false &&
        (a.code?.toUpperCase() === 'EGRESO' ||
          a.name.toLowerCase().includes('egreso')),
    );
    return hit?.id ?? null;
  });

  readonly expenseConcepts = computed(() =>
    this.data.concepts.filter((c) => c.active !== false && c.kind === 'EXPENSE'),
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
    this.data.accounts.filter(
      (a) =>
        a.active !== false &&
        a.id !== this.egresoAccountId() &&
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

  readonly destQuery = signal('');
  readonly destAccounts = computed(() =>
    this.data.accounts.filter(
      (a) =>
        a.active !== false &&
        a.id !== this.egresoAccountId() &&
        a.id !== this.form.controls.fromAccountId.value &&
        (a.type === 'CHANNEL' || a.type === 'SYSTEM' || a.type === 'PARTNER'),
    ),
  );
  readonly filteredDestAccounts = computed(() =>
    filterBySelectQuery(
      this.destAccounts(),
      this.destQuery(),
      (a) => a.name,
      this.form.controls.toAccountId.value,
    ),
  );

  readonly form = this.fb.nonNullable.group({
    amountUyu: [null as number | null, [Validators.required, Validators.min(0.01)]],
    conceptId: ['', Validators.required],
    fromAccountId: ['', Validators.required],
    toAccountId: [''],
    description: [''],
    notifyAdmins: [true],
  });

  constructor() {
    const from =
      this.fromAccounts().find((a) => /caja|efectivo|cash/i.test(a.name))?.id ??
      this.fromAccounts()[0]?.id ??
      '';
    this.form.patchValue({
      fromAccountId: from,
    });
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

  save(): void {
    if (this.form.invalid || !this.egresoAccountId()) {
      this.form.markAllAsTouched();
      if (!this.egresoAccountId()) {
        this.snack.open('No hay cuenta de Egreso configurada', 'OK', { duration: 3500 });
      }
      return;
    }
    const raw = this.form.getRawValue();
    const tz = this.shops.selectedShop()?.timezone;
    this.busy.set(true);
    this.api
      .create(this.data.shopId, {
        businessDate: todayIso(tz),
        fromAccountId: raw.fromAccountId,
        toAccountId: raw.toAccountId || this.egresoAccountId()!,
        conceptId: raw.conceptId,
        employeeId: null,
        description: raw.description.trim() || null,
        amountUyu: Number(raw.amountUyu),
        invoiced: false,
        notifyAdmins: !!raw.notifyAdmins,
        kind: 'expense',
      })
      .subscribe({
        next: (saved) => {
          this.busy.set(false);
          this.saved.set(saved);
          this.cashWithdrawalsInbox.refresh();
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudo registrar el gasto';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', {
            duration: 4000,
          });
        },
      });
  }
}
