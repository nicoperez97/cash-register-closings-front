import { Component, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { Employee } from '../employees/employees-api.service';
import { PaymentStatus } from './payments-api.service';
import { ShopSupplier } from '../suppliers/suppliers-api.service';

type PaymentsViewMode = 'cards' | 'list';

type FilterUser = {
  id: string;
  fullName: string;
};

@Component({
  selector: 'app-payments-filters-panel',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    FiltersCollapseBtnComponent,
  ],
  host: {
    class: 'panel-card guy-filters mb-3',
    '[class.guy-filters--collapsed]': 'collapsed()',
  },
  template: `
    <div class="guy-filters__head">
      <div>
        <h2 class="guy-filters__title">Filtros</h2>
        <p class="guy-filters__subtitle">
          @if (activeFilterCount() > 0) {
            {{ activeFilterCount() }} filtro{{ activeFilterCount() === 1 ? '' : 's' }} activo{{
              activeFilterCount() === 1 ? '' : 's'
            }}
          } @else {
            Sin filtros
          }
        </p>
      </div>
      <div class="guy-filters__tools">
        <mat-button-toggle-group
          class="pay-view"
          hideSingleSelectionIndicator
          [value]="viewMode()"
          (change)="viewModeChange.emit($event.value)"
          aria-label="Vista de pagos"
        >
          <mat-button-toggle value="cards" matTooltip="Vista tarjetas">
            <mat-icon>grid_view</mat-icon>
          </mat-button-toggle>
          <mat-button-toggle value="list" matTooltip="Vista lista">
            <mat-icon>view_list</mat-icon>
          </mat-button-toggle>
        </mat-button-toggle-group>
        <button
          mat-stroked-button
          type="button"
          class="pay-select-btn"
          [class.pay-select-btn--on]="selecting()"
          (click)="toggleSelecting.emit()"
        >
          <mat-icon>{{ selecting() ? 'close' : 'checklist' }}</mat-icon>
          {{ selecting() ? 'Listo' : 'Seleccionar' }}
        </button>
        <button
          mat-stroked-button
          type="button"
          class="pay-export-btn"
          [disabled]="!shopId() || exporting()"
          (click)="exportExcel.emit()"
        >
          <mat-icon>download</mat-icon>
          <span class="pay-export-btn__full">{{
            exporting() ? 'Descargando…' : 'Descargar Excel'
          }}</span>
          <span class="pay-export-btn__short">{{ exporting() ? '…' : 'Excel' }}</span>
        </button>
        <app-filters-collapse-btn
          [collapsed]="collapsed()"
          [badgeCount]="activeFilterCount()"
          (toggle)="toggleFilters.emit()"
        />
      </div>
    </div>
    <div class="guy-filters__body pay-filters">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Estado</mat-label>
        <mat-select [formControl]="statusFilter()" multiple>
          @for (opt of statusOptions(); track opt.value) {
            <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Valida</mat-label>
        <mat-select [formControl]="validatorFilter()" multiple>
          @if (currentUserId()) {
            <mat-option [value]="currentUserId()">Yo</mat-option>
          }
          @for (u of filterUsers(); track u.id) {
            <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Paga</mat-label>
        <mat-select [formControl]="payerFilter()" multiple>
          @if (currentUserId()) {
            <mat-option [value]="currentUserId()">Yo</mat-option>
          }
          @for (u of filterUsers(); track u.id) {
            <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="pay-filters__range" subscriptSizing="dynamic">
        <mat-label>Vencimiento</mat-label>
        <mat-date-range-input [formGroup]="dueRange()" [rangePicker]="duePicker">
          <input matStartDate formControlName="start" placeholder="Desde" />
          <input matEndDate formControlName="end" placeholder="Hasta" />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="duePicker" />
        <mat-date-range-picker #duePicker />
      </mat-form-field>
      <mat-form-field appearance="outline" class="pay-filters__range" subscriptSizing="dynamic">
        <mat-label>Realizado</mat-label>
        <mat-date-range-input [formGroup]="paidRange()" [rangePicker]="paidPicker">
          <input matStartDate formControlName="start" placeholder="Desde" />
          <input matEndDate formControlName="end" placeholder="Hasta" />
        </mat-date-range-input>
        <mat-datepicker-toggle matIconSuffix [for]="paidPicker" />
        <mat-date-range-picker #paidPicker />
      </mat-form-field>
      @if (supplierKind()) {
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Proveedor</mat-label>
          <mat-select [formControl]="supplierFilter()" multiple>
            @for (s of suppliers(); track s.id) {
              <mat-option [value]="s.id">{{ s.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      } @else {
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Empleado</mat-label>
          <mat-select [formControl]="employeeFilter()" multiple>
            @for (e of employees(); track e.id) {
              <mat-option [value]="e.id">{{ e.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Monto desde</mat-label>
        <input
          matInput
          type="number"
          min="0"
          step="0.01"
          inputmode="decimal"
          [formControl]="amountMinFilter()"
          placeholder="0"
        />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Monto hasta</mat-label>
        <input
          matInput
          type="number"
          min="0"
          step="0.01"
          inputmode="decimal"
          [formControl]="amountMaxFilter()"
          placeholder="Sin tope"
        />
      </mat-form-field>
      @if (currentUserId()) {
        <button
          mat-stroked-button
          type="button"
          class="pay-filters__mine"
          [class.pay-filters__mine--on]="mineOnly()"
          (click)="filterMine.emit()"
        >
          <mat-icon>person</mat-icon>
          {{ mineOnly() ? 'Viendo solo míos' : 'Solo míos' }}
        </button>
      }
    </div>
  `,
  styleUrl: './payments-filters-panel.scss',
})
export class PaymentsFiltersPanelComponent {
  readonly collapsed = input(false);
  readonly activeFilterCount = input(0);
  readonly viewMode = input<PaymentsViewMode>('list');
  readonly selecting = input(false);
  readonly exporting = input(false);
  readonly shopId = input<string | null>(null);
  readonly mineOnly = input(false);
  readonly supplierKind = input(true);
  readonly currentUserId = input('');
  readonly statusOptions = input<Array<{ value: PaymentStatus; label: string }>>([]);
  readonly filterUsers = input<FilterUser[]>([]);
  readonly suppliers = input<ShopSupplier[]>([]);
  readonly employees = input<Employee[]>([]);

  readonly statusFilter = input.required<FormControl<PaymentStatus[]>>();
  readonly validatorFilter = input.required<FormControl<string[]>>();
  readonly payerFilter = input.required<FormControl<string[]>>();
  readonly dueRange = input.required<FormGroup>();
  readonly paidRange = input.required<FormGroup>();
  readonly supplierFilter = input.required<FormControl<string[]>>();
  readonly employeeFilter = input.required<FormControl<string[]>>();
  readonly amountMinFilter = input.required<FormControl<number | null>>();
  readonly amountMaxFilter = input.required<FormControl<number | null>>();

  readonly viewModeChange = output<PaymentsViewMode | null | undefined>();
  readonly toggleSelecting = output<void>();
  readonly exportExcel = output<void>();
  readonly toggleFilters = output<void>();
  readonly filterMine = output<void>();
}
