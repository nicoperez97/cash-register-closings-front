import { Component, input, output } from '@angular/core';
import {
  ControlContainer,
  FormArray,
  FormGroupDirective,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ClosingFormStepNavComponent } from './closing-form-step-nav';

type PosnetRow = {
  posnetId?: string;
  name?: string;
  type?: string;
};

@Component({
  selector: 'app-closing-form-posnets-step',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    ClosingFormStepNavComponent,
  ],
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
  template: `
    <div class="closing-form__block">
      <div class="closing-form__block-head">
        <div class="closing-form__block-title">
          <h3>Posnets</h3>
          <span class="closing-form__meta">{{ panelHint() }}</span>
        </div>
        <button mat-stroked-button type="button" class="closing-form__add-btn" (click)="add.emit()">
          <mat-icon>add</mat-icon>
          Agregar
        </button>
      </div>
      <div class="closing-form__block-body">
        <div class="closing-form__stack" formArrayName="posnetAmounts">
          @for (row of posnetAmounts().controls; track row; let i = $index) {
            <div class="closing-form__posnet-card" [formGroupName]="i">
              <div class="closing-form__posnet-card-head">
                <div class="closing-form__posnet-card-title">
                  <span class="closing-form__posnet-index">{{ i + 1 }}</span>
                  <div>
                    <strong>{{ rowTitle(i) }}</strong>
                    <span>{{ rowTypeLabel(i) }}</span>
                  </div>
                </div>
                @if (!isConfigured(i)) {
                  <button
                    mat-icon-button
                    type="button"
                    class="closing-form__row-remove"
                    aria-label="Quitar posnet"
                    (click)="remove.emit(i)"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                }
              </div>
              <div
                class="closing-form__posnet-row"
                [class.closing-form__posnet-row--amount-only]="isConfigured(i)"
              >
                @if (!isConfigured(i)) {
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Nombre</mat-label>
                    <input matInput formControlName="name" placeholder="ej. Caja 1" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Tipo</mat-label>
                    <mat-select formControlName="type">
                      @for (opt of posnetTypes(); track opt.value) {
                        <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                }
                <mat-form-field
                  appearance="outline"
                  subscriptSizing="dynamic"
                  floatLabel="always"
                  class="closing-field--money"
                >
                  <mat-label>Monto</mat-label>
                  <span matTextPrefix class="closing-field__prefix">$</span>
                  <input matInput type="number" inputmode="decimal" formControlName="amount" />
                </mat-form-field>
              </div>
            </div>
          } @empty {
            <p class="closing-form__hint">Sin terminales. Completá PVS y Mercado Pago abajo.</p>
          }
        </div>
        <div class="closing-form__fields closing-form__fields--totals">
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            floatLabel="always"
            class="closing-field--money"
          >
            <mat-label>PVS{{ locksCard() ? ' (suma)' : '' }}</mat-label>
            <span matTextPrefix class="closing-field__prefix">$</span>
            <input
              matInput
              type="number"
              inputmode="decimal"
              formControlName="cardAmount"
              [readonly]="locksCard()"
            />
          </mat-form-field>
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            floatLabel="always"
            class="closing-field--money"
          >
            <mat-label>Mercado Pago{{ locksMp() ? ' (suma)' : '' }}</mat-label>
            <span matTextPrefix class="closing-field__prefix">$</span>
            <input
              matInput
              type="number"
              inputmode="decimal"
              formControlName="mercadoPagoAmount"
              [readonly]="locksMp()"
            />
          </mat-form-field>
        </div>
      </div>
    </div>
    <app-closing-form-step-nav [showBack]="false" />
  `,
  styleUrl: './closing-form-posnets-step.scss',
})
export class ClosingFormPosnetsStepComponent {
  readonly posnetAmounts = input.required<FormArray>();
  readonly panelHint = input('');
  readonly locksCard = input(false);
  readonly locksMp = input(false);
  readonly configuredIds = input<ReadonlySet<string>>(new Set());
  readonly posnetTypes = input.required<Array<{ value: string; label: string }>>();
  readonly typeLabels = input<Record<string, string>>({});

  readonly add = output<void>();
  readonly remove = output<number>();

  private rowAt(index: number): PosnetRow | undefined {
    return this.posnetAmounts().at(index)?.getRawValue() as PosnetRow | undefined;
  }

  isConfigured(index: number): boolean {
    const row = this.rowAt(index);
    return !!row?.posnetId && this.configuredIds().has(row.posnetId);
  }

  rowTitle(index: number): string {
    const row = this.rowAt(index);
    return (row?.name || '').trim() || `Posnet ${index + 1}`;
  }

  rowTypeLabel(index: number): string {
    const row = this.rowAt(index);
    const type = row?.type || '';
    return this.typeLabels()[type] || type || '—';
  }
}
