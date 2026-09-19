import { Component, effect, inject, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { ShopContextService } from '../../core/shop/shop-context.service';
import {
  SelectSearchComponent,
  filterBySelectQuery,
  onSelectSearchOpened,
} from '../../shared/components/select-search';
import { usePageRefresh } from '../../core/page-refresh.service';
import {
  AdminAccountRow,
  LINKED_PAYMENT_METHOD_OPTIONS,
} from './admin-account-dialog';

export const CLOSING_DEPOSIT_FIELDS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'PVS / Tarjeta' },
  { value: 'mercadoPago', label: 'Mercado Pago' },
  { value: 'accountDni', label: 'Cuenta DNI' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'other', label: 'Otros' },
] as const;

export function paymentMethodLabel(value?: string | null): string {
  if (!value) return '—';
  return LINKED_PAYMENT_METHOD_OPTIONS.find((o) => o.value === value)?.label ?? '—';
}

@Component({
  selector: 'app-admin-closing-deposits',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSnackBarModule,
    SelectSearchComponent,
  ],
  template: `
    <section class="dep panel-card" id="shop-admin-closing-deposits">
      <header class="dep__head">
        <div>
          <h2 class="dep__title">Depósito del cierre</h2>
          <p class="dep__lead">
            A qué cuenta canal va cada campo del cierre. El efectivo del día sale de Ingreso hacia
            la cuenta de Efectivo.
          </p>
        </div>
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="saving() || loading()"
          (click)="save()"
        >
          <mat-icon>save</mat-icon>
          {{ saving() ? 'Guardando…' : 'Guardar depósitos' }}
        </button>
      </header>

      @if (loading()) {
        <p class="dep__muted">Cargando cuentas…</p>
      } @else if (!channels().length) {
        <p class="dep__muted">
          No hay cuentas canal. Creá una (por ejemplo Efectivo Caja) y volvé a vincularla acá.
        </p>
      } @else {
        <div class="dep__rows" [formGroup]="form">
          @for (field of fields; track field.value) {
            <div class="dep__row">
              <span class="dep__label">{{ field.label }}</span>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Cuenta destino</mat-label>
                <mat-select
                  [formControlName]="field.value"
                  panelClass="guy-select-search-panel"
                  (openedChange)="onSelectSearchOpened($event, accountQuery)"
                >
                  <mat-option disabled class="select-search-opt">
                    <app-select-search [(query)]="accountQuery" placeholder="Buscar cuenta…" />
                  </mat-option>
                  <mat-option [value]="null">Sin vincular</mat-option>
                  @for (a of filteredAccounts(form.get(field.value)?.value); track a.id) {
                    <mat-option [value]="a.id">{{ a.name }}</mat-option>
                  }
                  @if (accountQuery() && !filteredAccounts(form.get(field.value)?.value).length) {
                    <mat-option disabled>Sin resultados</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: `
    .dep {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      padding: 1.05rem 1.15rem 1.2rem;
      margin: 0 0 0.85rem;
    }
    .dep__head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem 1rem;
    }
    .dep__title {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--guy-navy, #003366);
    }
    .dep__lead {
      margin: 0.2rem 0 0;
      font-size: 0.86rem;
      line-height: 1.4;
      color: var(--guy-muted, #5f6f76);
      max-width: 58ch;
    }
    .dep__muted {
      margin: 0;
      font-size: 0.86rem;
      color: var(--guy-muted, #5f6f76);
    }
    .dep__rows {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
    }
    .dep__row {
      display: grid;
      grid-template-columns: minmax(120px, 180px) minmax(0, 1fr);
      gap: 0.75rem;
      align-items: center;
    }
    .dep__label {
      font-size: 0.9rem;
      font-weight: 650;
      color: var(--guy-navy, #003366);
    }
    @media (max-width: 600px) {
      .dep__row {
        grid-template-columns: 1fr;
        gap: 0.2rem;
      }
    }
  `,
})
export class AdminClosingDepositsComponent {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly snack = inject(MatSnackBar);
  private readonly shops = inject(ShopContextService);

  readonly saved = output<AdminAccountRow[]>();

  readonly fields = CLOSING_DEPOSIT_FIELDS;
  readonly channels = signal<AdminAccountRow[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly accountQuery = signal('');
  readonly onSelectSearchOpened = onSelectSearchOpened;

  readonly form = this.fb.nonNullable.group({
    cash: this.fb.control<string | null>(null),
    card: this.fb.control<string | null>(null),
    mercadoPago: this.fb.control<string | null>(null),
    accountDni: this.fb.control<string | null>(null),
    delivery: this.fb.control<string | null>(null),
    transfer: this.fb.control<string | null>(null),
    other: this.fb.control<string | null>(null),
  });

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.channels.set([]);
        this.loading.set(false);
        return;
      }
      this.reload();
    });
  }

  filteredAccounts(keepId?: string | null) {
    return filterBySelectQuery(this.channels(), this.accountQuery(), (a) => a.name, keepId);
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.channels.set([]);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.http
      .get<AdminAccountRow[]>(`${environment.apiUrl}/shops/${shopId}/accounts`, {
        params: { includeInactive: '1' },
      })
      .subscribe({
        next: (rows) => {
          const channels = rows.filter((r) => r.type === 'CHANNEL' && r.active);
          this.channels.set(channels);
          this.syncForm(channels);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snack.open('No se pudieron cargar los depósitos', 'OK', { duration: 3000 });
        },
      });
  }

  save(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const raw = this.form.getRawValue();
    const used = Object.values(raw).filter((id): id is string => !!id);
    if (new Set(used).size !== used.length) {
      this.snack.open('Cada cuenta solo puede recibir un medio del cierre', 'OK', {
        duration: 3500,
      });
      return;
    }
    this.saving.set(true);
    this.http
      .put<AdminAccountRow[]>(`${environment.apiUrl}/shops/${shopId}/accounts/payment-deposits`, raw)
      .subscribe({
        next: (rows) => {
          this.saving.set(false);
          const channels = rows.filter((r) => r.type === 'CHANNEL' && r.active);
          this.channels.set(channels);
          this.syncForm(channels);
          this.saved.emit(rows);
          this.snack.open('Depósitos del cierre actualizados', 'OK', { duration: 2500 });
        },
        error: (err) => {
          this.saving.set(false);
          const msg = err?.error?.message ?? 'No se pudieron guardar los depósitos';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }

  private syncForm(channels: AdminAccountRow[]): void {
    const next: Record<(typeof CLOSING_DEPOSIT_FIELDS)[number]['value'], string | null> = {
      cash: null,
      card: null,
      mercadoPago: null,
      accountDni: null,
      delivery: null,
      transfer: null,
      other: null,
    };
    for (const a of channels) {
      const method = a.linkedPaymentMethod;
      if (method && method in next) {
        next[method as keyof typeof next] = a.id;
      }
    }
    this.form.patchValue(next, { emitEvent: false });
  }
}
