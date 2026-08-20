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

@Component({
  selector: 'app-closing-form-retiro-step',
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
          <h3>Retiro y extras</h3>
          <span class="closing-form__meta">{{ withdrawHint() }}</span>
        </div>
      </div>
      <div class="closing-form__block-body">
        <div class="closing-form__fields">
          @if (unitsLabel()) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>{{ unitsLabel() }}</mat-label>
              <input matInput type="number" inputmode="numeric" pattern="[0-9]*" formControlName="unitsSold" />
            </mat-form-field>
          }
          @if (coversEnabled()) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Comensales</mat-label>
              <input matInput type="number" inputmode="numeric" pattern="[0-9]*" formControlName="coversCount" />
            </mat-form-field>
          }
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Efectivo retirado</mat-label>
            <input matInput type="number" inputmode="decimal" formControlName="cashWithdrawn" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="closing-notes" subscriptSizing="dynamic">
            <mat-label>Notas</mat-label>
            <textarea matInput rows="2" formControlName="notes"></textarea>
          </mat-form-field>
        </div>
      </div>
    </div>
    <div class="closing-form__block">
      <div class="closing-form__block-head">
        <div class="closing-form__block-title">
          <h3>Egresos del día</h3>
          <span class="closing-form__meta">{{ expensesHint() }}</span>
        </div>
        <button mat-stroked-button type="button" class="closing-form__add-btn" (click)="addExpense.emit()">
          <mat-icon>add</mat-icon>
          Agregar
        </button>
      </div>
      <div class="closing-form__block-body">
        <div class="closing-form__expenses-list" formArrayName="expenses">
          @for (row of expenses().controls; track row; let i = $index) {
            <div class="expense-row" [formGroupName]="i">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Concepto</mat-label>
                <mat-select formControlName="conceptId" (selectionChange)="syncLabel(i, $event.value)">
                  @for (c of closingConcepts(); track c.id) {
                    <mat-option [value]="c.id">{{ c.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Monto</mat-label>
                <input matInput type="number" inputmode="decimal" formControlName="amount" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Descripción</mat-label>
                <input matInput formControlName="notes" />
              </mat-form-field>
              <button
                mat-icon-button
                type="button"
                class="expense-row__remove"
                aria-label="Quitar egreso"
                (click)="removeExpense.emit(i)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          } @empty {
            <p class="closing-form__hint">No hay egresos cargados.</p>
          }
        </div>
      </div>
    </div>
    <app-closing-form-step-nav />
  `,
  styleUrl: './closing-form-retiro-step.scss',
})
export class ClosingFormRetiroStepComponent {
  readonly expenses = input.required<FormArray>();
  readonly withdrawHint = input('');
  readonly expensesHint = input('');
  readonly unitsLabel = input<string | null>(null);
  readonly coversEnabled = input(false);
  readonly closingConcepts = input<Array<{ id: string; name: string }>>([]);

  readonly addExpense = output<void>();
  readonly removeExpense = output<number>();

  syncLabel(index: number, conceptId: string): void {
    const name = this.closingConcepts().find((c) => c.id === conceptId)?.name ?? '';
    this.expenses().at(index)?.patchValue({ label: name, conceptId });
  }
}
