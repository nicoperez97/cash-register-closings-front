import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import {
  Concept,
  Movement,
  MovementFilters,
  MovementKind,
  MovementsApiService,
  expensePaymentMethodLabel,
} from './movements-api.service';

export interface AccountMovementsDialogData {
  shopId: string;
  accountId: string;
  accountName: string;
  from?: string | null;
  to?: string | null;
}

@Component({
  selector: 'app-account-movements-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatSnackBarModule,
    ReactiveFormsModule,
    DataTableComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>account_balance_wallet</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ data.accountName }}</strong>
        <span>Movimientos de la cuenta</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="acc-filters" [formGroup]="filters">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Período</mat-label>
          <mat-date-range-input [formGroup]="range" [rangePicker]="picker">
            <input matStartDate formControlName="start" placeholder="Desde" />
            <input matEndDate formControlName="end" placeholder="Hasta" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-date-range-picker #picker />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Tipo</mat-label>
          <mat-select formControlName="kind">
            <mat-option value="">Todos</mat-option>
            <mat-option value="expense">Gastos</mat-option>
            <mat-option value="income">Ingresos</mat-option>
            <mat-option value="transfer">Movimientos</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Concepto</mat-label>
          <mat-select formControlName="conceptId">
            <mat-option value="">Todos</mat-option>
            @for (c of concepts(); track c.id) {
              <mat-option [value]="c.id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Origen</mat-label>
          <mat-select formControlName="source">
            <mat-option value="">Todos</mat-option>
            <mat-option value="closing">Cierre</mat-option>
            <mat-option value="payment">Pago</mat-option>
            <mat-option value="manual">Manual</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Tipo de pago</mat-label>
          <mat-select formControlName="partyType">
            <mat-option value="">Todos</mat-option>
            <mat-option value="supplier">A proveedores</mat-option>
            <mat-option value="service">A servicios</mat-option>
            <mat-option value="employee">A empleados</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Facturado</mat-label>
          <mat-select formControlName="invoiced">
            <mat-option value="">Todos</mat-option>
            <mat-option value="true">Sí</mat-option>
            <mat-option value="false">No</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="acc-filters__q" subscriptSizing="dynamic">
          <mat-label>Buscar</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input matInput formControlName="q" placeholder="Descripción, concepto…" />
        </mat-form-field>

        <div class="acc-filters__actions">
          <button mat-flat-button color="primary" type="button" (click)="load()">
            <mat-icon>filter_alt</mat-icon>
            Filtrar
          </button>
          <button mat-stroked-button type="button" (click)="clearFilters()">
            <mat-icon>filter_alt_off</mat-icon>
            Limpiar
          </button>
        </div>
      </form>

      <p class="text-muted acc-count">{{ rows().length }} movimiento{{ rows().length === 1 ? '' : 's' }}</p>

      <app-data-table
        [columns]="columns"
        [rows]="rows()"
        [loading]="loading()"
        [sortable]="true"
        [showActions]="false"
        [dense]="true"
      />
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .acc-filters {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.55rem 0.75rem;
      margin-bottom: 0.75rem;
    }
    .acc-filters__q,
    .acc-filters__actions {
      grid-column: 1 / -1;
    }
    .acc-filters__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }
    .acc-count {
      margin: 0 0 0.55rem;
      font-size: 0.85rem;
    }
    @media (min-width: 720px) {
      .acc-filters {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `,
})
export class AccountMovementsDialogComponent {
  readonly data = inject<AccountMovementsDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AccountMovementsDialogComponent>);
  private readonly api = inject(MovementsApiService);
  private readonly snack = inject(MatSnackBar);

  readonly loading = signal(false);
  readonly rows = signal<Movement[]>([]);
  readonly concepts = signal<Concept[]>([]);

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(this.parseDate(this.data.from)),
    end: new FormControl<Date | null>(this.parseDate(this.data.to)),
  });

  readonly filters = new FormGroup({
    kind: new FormControl('', { nonNullable: true }),
    conceptId: new FormControl('', { nonNullable: true }),
    source: new FormControl('', { nonNullable: true }),
    partyType: new FormControl('', { nonNullable: true }),
    invoiced: new FormControl('', { nonNullable: true }),
    q: new FormControl('', { nonNullable: true }),
  });

  readonly columns: DataTableColumn[] = [
    { key: 'businessDate', label: 'Fecha' },
    {
      key: 'kindLabel',
      label: 'Tipo',
      format: (r) => this.kindLabel(r as Movement),
    },
    {
      key: 'fromAccountName',
      label: 'Sale de',
      format: (r) => String(r['fromAccountName'] || r['fromUserName'] || '—'),
    },
    {
      key: 'toAccountName',
      label: 'Entra a',
      format: (r) => String(r['toAccountName'] || r['toUserName'] || '—'),
    },
    {
      key: 'conceptName',
      label: 'Concepto',
      format: (r) => r['conceptName'] ?? '—',
    },
    { key: 'description', label: 'Descripción' },
    {
      key: 'amountUyu',
      label: 'Monto',
      format: (r) => this.signedMoney(r as Movement),
    },
    {
      key: 'source',
      label: 'Origen',
      format: (r) => this.sourceLabel(r as Movement),
    },
  ];

  constructor() {
    this.api.concepts(this.data.shopId, { for: 'movement' }).subscribe({
      next: (rows) =>
        this.concepts.set((rows ?? []).filter((c) => c.active !== false)),
      error: () => this.concepts.set([]),
    });
    this.load();
  }

  clearFilters(): void {
    this.range.reset({ start: null, end: null });
    this.filters.reset({
      kind: '',
      conceptId: '',
      source: '',
      partyType: '',
      invoiced: '',
      q: '',
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.list(this.data.shopId, this.currentFilters()).subscribe({
      next: (rows) => {
        this.rows.set(rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar los movimientos', 'OK', { duration: 3500 });
      },
    });
  }

  private currentFilters(): MovementFilters {
    const f = this.filters.getRawValue();
    const kind = (f.kind || null) as MovementKind | null;
    return {
      accountId: this.data.accountId,
      from: this.formatDate(this.range.controls.start.value),
      to: this.formatDate(this.range.controls.end.value),
      kind,
      conceptId: f.conceptId || null,
      source: (f.source || null) as MovementFilters['source'],
      partyType: (f.partyType || null) as MovementFilters['partyType'],
      invoiced: (f.invoiced || null) as MovementFilters['invoiced'],
      q: f.q || null,
    };
  }

  private kindLabel(m: Movement): string {
    const conceptKind = String(m.conceptKind ?? '').toUpperCase();
    const toName = String(m.toAccountName ?? '').toLowerCase();
    const fromName = String(m.fromAccountName ?? '').toLowerCase();
    if (conceptKind === 'EXPENSE' || toName.includes('egreso')) return 'Gasto';
    if (conceptKind === 'INCOME' || fromName.includes('ingreso')) return 'Ingreso';
    return 'Movimiento';
  }

  private sourceLabel(m: Movement): string {
    if (m.source === 'payment') {
      if (m.paymentPartyType === 'supplier') return 'Pago · Proveedor';
      if (m.paymentPartyType === 'service') return 'Pago · Servicio';
      if (m.paymentPartyType === 'employee') return 'Pago · Empleado';
      return 'Pago';
    }
    if (m.source === 'closing' || m.closingId) return 'Cierre';
    return 'Manual';
  }

  private signedMoney(m: Movement): string {
    const amt = Number(m.amountUyu ?? 0);
    const signed = m.fromAccountId === this.data.accountId ? -amt : amt;
    const abs = Math.abs(signed).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return signed < 0 ? `- $${abs}` : `$ ${abs}`;
  }

  private formatDate(d: Date | null): string | null {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private parseDate(value?: string | null): Date | null {
    if (!value) return null;
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
}
