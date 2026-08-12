import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import {
  formatBusinessDayHint,
  formatIsoDateDisplay,
  resolveShopBusinessDate,
} from '../../core/shop/business-date';
import { EmployeesApiService, Employee } from '../employees/employees-api.service';
import { TipsApiService, TipDay } from './tips-api.service';
import { TipsInboxService } from './tips-inbox.service';
import {
  TipsEditorComponent,
  TipsEditorState,
  tipDayToEditorState,
} from './tips-editor';
import { usePageRefresh } from '../../core/page-refresh.service';
import { firstValueFrom } from 'rxjs';

function toDateInput(value?: string | null): Date {
  if (!value) return new Date();
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toDateString(value: Date | null | string | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(value);
}

@Component({
  selector: 'app-tips-page',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatSnackBarModule,
    PageHeaderComponent,
    DataTableComponent,
    TipsEditorComponent,
  ],
  template: `
    <app-page-header
      title="Propinas"
      [subtitle]="shops.selectedShop()?.name ?? ''"
    />

    <div class="panel-card mb-3">
      <div class="panel-card__body tips-page__day">
        <div class="tips-page__day-head">
          <div>
            <h2 class="guy-list-head__title">Caja del día</h2>
            <p class="guy-list-head__meta">
              {{ dateLabel() }} · efectivo y recibos
            </p>
          </div>
          <div class="tips-page__day-controls">
            <button
              mat-stroked-button
              type="button"
              [disabled]="isBusinessToday()"
              (click)="goBusinessToday()"
            >
              <mat-icon>today</mat-icon>
              Hoy laboral
            </button>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Fecha</mat-label>
              <input matInput [matDatepicker]="picker" [formControl]="dateCtrl" />
              <mat-datepicker-toggle matIconSuffix [for]="picker" />
              <mat-datepicker #picker touchUi />
              @if (businessDayHint()) {
                <mat-hint>{{ businessDayHint() }}</mat-hint>
              }
            </mat-form-field>
          </div>
        </div>

        <app-tips-editor
          [employees]="employees()"
          [value]="editorValue()"
          [readonly]="!canEdit()"
          [showDelivery]="canEdit()"
          [shopId]="shops.selectedShopId()"
          [businessDate]="selectedDate()"
          (valueChange)="onEditorChange($event)"
          (deliveredChange)="onDelivered()"
        />

        @if (canEdit()) {
          <div class="tips-page__actions">
            <button
              mat-flat-button
              color="primary"
              type="button"
              [disabled]="saving()"
              (click)="save()"
            >
              <mat-icon>save</mat-icon>
              Guardar propinas
            </button>
          </div>
        }
      </div>
    </div>

    <div class="panel-card panel-card--flush mb-3">
      <div class="panel-card__body">
        <div class="guy-list-head">
          <div>
            <h2 class="guy-list-head__title">Histórico reciente</h2>
            <p class="guy-list-head__meta">Últimos días con propinas cargadas</p>
          </div>
          <form class="tips-page__range" [formGroup]="range">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Período</mat-label>
              <mat-date-range-input [rangePicker]="rangePicker">
                <input matStartDate formControlName="start" placeholder="Desde" />
                <input matEndDate formControlName="end" placeholder="Hasta" />
              </mat-date-range-input>
              <mat-datepicker-toggle matIconSuffix [for]="rangePicker" />
              <mat-date-range-picker #rangePicker />
            </mat-form-field>
            <button mat-stroked-button type="button" (click)="loadHistory()">
              <mat-icon>refresh</mat-icon>
              Actualizar
            </button>
          </form>
        </div>
        <app-data-table
          [columns]="historyColumns"
          [rows]="historyRows()"
          [sortable]="true"
          [showActions]="true"
          [canRemove]="never"
          [canEdit]="always"
          editLabel="Ver"
          editIcon="event"
          (edit)="onHistoryClick($event)"
        />
      </div>
    </div>
  `,
  styles: [
    `
      .tips-page__day-head {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 0.75rem;
        align-items: flex-start;
        margin-bottom: 1rem;
      }
      .tips-page__day-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 0.55rem;
        align-items: flex-start;
      }
      .tips-page__day-controls mat-form-field {
        min-width: min(100%, 12.5rem);
      }
      .tips-page__actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 1rem;
      }
      .tips-page__range {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }
    `,
  ],
})
export class TipsPage {
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly api = inject(TipsApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  private readonly inbox = inject(TipsInboxService);
  private readonly snack = inject(MatSnackBar);

  private readonly editor = viewChild(TipsEditorComponent);

  readonly never = () => false;
  readonly always = () => true;
  readonly saving = signal(false);
  readonly employees = signal<Employee[]>([]);
  readonly editorValue = signal<TipsEditorState | null>(null);
  readonly draft = signal<TipsEditorState | null>(null);
  readonly history = signal<TipDay[]>([]);

  readonly dateCtrl = new FormControl<Date | null>(toDateInput(this.defaultDate()), {
    nonNullable: false,
  });

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(
      new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ),
    end: new FormControl<Date | null>(new Date()),
  });

  readonly selectedDate = computed(() => toDateString(this.dateCtrl.value));
  readonly dateLabel = computed(() => formatIsoDateDisplay(this.selectedDate()));
  readonly businessDayHint = computed(() => {
    const date = this.selectedDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    return formatBusinessDayHint(date, this.shops.selectedShop()?.openingTime);
  });
  readonly isBusinessToday = computed(() => this.selectedDate() === this.defaultDate());

  readonly canEdit = computed(() => {
    const shopId = this.shops.selectedShopId();
    return !!shopId && hasShopPermission(this.auth.currentUser(), shopId, 'tips.create');
  });

  readonly historyRows = computed(() =>
    this.history().map((d) => ({
      businessDate: d.businessDate,
      totalAmount: d.totalAmount,
      cashAmount: d.cashAmount,
      transferAmount: d.transferAmount,
      ticketsAmount: d.ticketsAmount,
      pendingCount: d.pendingCount,
      employeeCount: d.allocations?.length ?? 0,
    })),
  );

  readonly historyColumns: DataTableColumn[] = [
    {
      key: 'businessDate',
      label: 'Fecha',
      format: (r) => formatIsoDateDisplay(String(r['businessDate'] ?? '')),
    },
    {
      key: 'totalAmount',
      label: 'Total',
      format: (r) => formatMoney(Number(r['totalAmount'] ?? 0)),
    },
    {
      key: 'cashAmount',
      label: 'Efectivo',
      format: (r) => formatMoney(Number(r['cashAmount'] ?? 0)),
    },
    {
      key: 'transferAmount',
      label: 'Recibos',
      format: (r) =>
        formatMoney(
          Number(r['transferAmount'] ?? 0) + Number(r['ticketsAmount'] ?? 0),
        ),
    },
    { key: 'employeeCount', label: 'Empleados' },
    { key: 'pendingCount', label: 'Pendientes' },
  ];

  constructor() {
    usePageRefresh(() => {
      void this.loadDay();
      this.loadHistory();
    });

    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) return;
      // Misma lógica que cierres: día laboral del local (TZ + openingTime).
      this.dateCtrl.setValue(toDateInput(this.defaultDate()), { emitEvent: false });
      this.employeesApi.list(shopId).subscribe({
        next: (rows) => this.employees.set(rows.filter((e) => e.active)),
        error: () => this.employees.set([]),
      });
      void this.loadDay();
      this.loadHistory();
    });

    this.dateCtrl.valueChanges.subscribe(() => {
      void this.loadDay();
    });
  }

  private defaultDate(): string {
    const shop = this.shops.selectedShop();
    return resolveShopBusinessDate(new Date(), {
      timezone: shop?.timezone,
      openingTime: shop?.openingTime,
    });
  }

  goBusinessToday(): void {
    this.dateCtrl.setValue(toDateInput(this.defaultDate()));
  }

  onEditorChange(v: TipsEditorState) {
    this.draft.set(v);
  }

  onDelivered() {
    this.inbox.refresh();
    void this.loadDay();
    this.loadHistory();
  }

  async loadDay() {
    const shopId = this.shops.selectedShopId();
    const date = this.selectedDate();
    if (!shopId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    try {
      const day = await firstValueFrom(this.api.getByDate(shopId, date));
      this.editorValue.set(tipDayToEditorState(day));
      this.draft.set(null);
    } catch {
      this.editorValue.set({
        cashAmount: 0,
        receipts: [],
        transferAmount: 0,
        ticketsAmount: 0,
        notes: '',
        allocations: [],
      });
    }
  }

  loadHistory() {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const from = toDateString(this.range.value.start);
    const to = toDateString(this.range.value.end);
    this.api.list(shopId, from || undefined, to || undefined).subscribe({
      next: (rows) => this.history.set(rows),
      error: () => this.history.set([]),
    });
  }

  onHistoryClick(row: Record<string, unknown>) {
    const date = String(row['businessDate'] ?? '');
    if (!date) return;
    this.dateCtrl.setValue(toDateInput(date));
  }

  save() {
    const shopId = this.shops.selectedShopId();
    const date = this.selectedDate();
    if (!shopId || !date) return;
    const payload = this.editor()?.toPayload();
    if (!payload) {
      this.snack.open('Revisá el reparto: debe sumar el total', 'OK', {
        duration: 3000,
      });
      return;
    }
    this.saving.set(true);
    this.api.upsert(shopId, date, payload).subscribe({
      next: (day) => {
        this.saving.set(false);
        this.editorValue.set(tipDayToEditorState(day));
        this.draft.set(null);
        this.inbox.refresh();
        this.loadHistory();
        this.snack.open('Propinas guardadas', 'OK', { duration: 2200 });
      },
      error: (err) => {
        this.saving.set(false);
        this.snack.open(
          err?.error?.message ?? 'No se pudo guardar',
          'OK',
          { duration: 3500 },
        );
      },
    });
  }
}
