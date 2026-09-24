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
import { ClosingFormStepNavComponent } from './closing-form-step-nav';
import {
  ClosingFormStepFilesComponent,
  closingStepFilesMissing,
  showClosingStepFiles,
  type ClosingStepFileView,
} from './closing-form-step-files';
import { closingMoney, closingNum } from './closings-form.utils';

@Component({
  selector: 'app-closing-form-caja-otros-step',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ClosingFormStepNavComponent,
    ClosingFormStepFilesComponent,
  ],
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
  template: `
    @if (sourceCount() > 0) {
      <div class="closing-form__pane">
        <div class="closing-form__block-head">
          <div class="closing-form__block-title">
            <h3>Cuentas del local</h3>
            <span class="closing-form__meta">Posnets o montos libres · se suman por cuenta</span>
          </div>
        </div>
        <div class="closing-form__block-body">
          <div class="closing-form__source-grid" formArrayName="sourceAmounts">
            @for (row of sourceAmounts().controls; track row; let i = $index) {
              <div
                class="closing-form__source-card"
                [class.closing-form__source-card--declared]="isDeclared(i)"
                [formGroupName]="i"
              >
                <div class="closing-form__source-card-head">
                  <div class="closing-form__source-card-copy">
                    <h4 class="closing-form__source-card-title">{{ rowName(i) }}</h4>
                    <p class="closing-form__source-card-meta">{{ rowHint(i) }}</p>
                  </div>
                  <span
                    class="closing-form__source-chip"
                    [class.closing-form__source-chip--declared]="isDeclared(i)"
                  >
                    {{ rowChip(i) }}
                  </span>
                </div>
                @if (hasPosnets(i)) {
                  <div class="closing-form__source-lines" formArrayName="posnetAmounts">
                    @for (p of sourcePosnets(i).controls; track p; let j = $index) {
                      <div class="closing-form__source-line" [formGroupName]="j">
                        <mat-form-field
                          appearance="outline"
                          subscriptSizing="dynamic"
                          floatLabel="always"
                          class="closing-field--money"
                        >
                          <mat-label>{{ posnetLabel(i, j) }}</mat-label>
                          <span matTextPrefix class="closing-field__prefix">$</span>
                          <input
                            matInput
                            type="number"
                            inputmode="decimal"
                            formControlName="amount"
                          />
                        </mat-form-field>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="closing-form__source-lines" formArrayName="lines">
                    @for (line of sourceLines(i).controls; track line; let j = $index) {
                      <div class="closing-form__source-line" [formGroupName]="j">
                        <mat-form-field
                          appearance="outline"
                          subscriptSizing="dynamic"
                          floatLabel="always"
                          class="closing-field--money"
                        >
                          <mat-label>{{ lineLabel(i, j) }}</mat-label>
                          <span matTextPrefix class="closing-field__prefix">$</span>
                          <input
                            matInput
                            type="number"
                            inputmode="decimal"
                            formControlName="amount"
                          />
                        </mat-form-field>
                        @if (sourceLines(i).length > 1 && j < sourceLines(i).length - 1) {
                          <button
                            mat-icon-button
                            type="button"
                            class="closing-form__row-remove"
                            aria-label="Quitar monto"
                            (click)="removeSourceLine.emit({ sourceIndex: i, lineIndex: j })"
                          >
                            <mat-icon>delete</mat-icon>
                          </button>
                        }
                      </div>
                    }
                  </div>
                }
                <div class="closing-form__source-total">
                  <span>{{ hasPosnets(i) && sourcePosnets(i).length > 1 ? 'Suma' : filledLineCount(i) > 1 ? 'Suma' : 'Total' }}</span>
                  <strong>{{ money(rowTotal(i)) }}</strong>
                </div>
                @if (showSourceFiles(i)) {
                  <app-closing-form-step-files
                    [files]="sourceFiles()[rowSourceId(i)] ?? []"
                    [busy]="filesBusyKey() === 'channel:' + rowSourceId(i)"
                    [disabled]="filesDisabled()"
                    [requiredMissing]="sourceFilesMissing(i)"
                    (picked)="filePicked.emit({ sourceId: rowSourceId(i), files: $event })"
                    (view)="fileView.emit($event)"
                    (remove)="fileRemove.emit({ sourceId: rowSourceId(i), file: $event })"
                  />
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
    @if (showNav()) {
      <app-closing-form-step-nav />
    }
  `,
  styleUrl: './closing-form-caja-otros-step.scss',
})
export class ClosingFormCajaOtrosStepComponent {
  readonly sourceAmounts = input.required<FormArray>();
  readonly sourceCount = input(0);
  readonly showNav = input(true);
  readonly sourceFiles = input<Record<string, ClosingStepFileView[]>>({});
  readonly filesBusyKey = input<string | null>(null);
  readonly filesDisabled = input(false);
  readonly requireClosingFiles = input(false);

  readonly removeSourceLine = output<{ sourceIndex: number; lineIndex: number }>();
  readonly filePicked = output<{ sourceId: string; files: File[] }>();
  readonly fileView = output<ClosingStepFileView>();
  readonly fileRemove = output<{ sourceId: string; file: ClosingStepFileView }>();

  sourceLines(index: number): FormArray {
    return this.sourceAmounts().at(index)?.get('lines') as FormArray;
  }

  sourcePosnets(index: number): FormArray {
    return this.sourceAmounts().at(index)?.get('posnetAmounts') as FormArray;
  }

  hasPosnets(index: number): boolean {
    return (this.sourcePosnets(index)?.length ?? 0) > 0;
  }

  rowTotal(index: number): number {
    if (this.hasPosnets(index)) {
      return this.sourcePosnets(index).controls.reduce(
        (sum, line) => sum + closingNum(line.get('amount')?.value),
        0,
      );
    }
    return this.sourceLines(index).controls.reduce(
      (sum, line) => sum + closingNum(line.get('amount')?.value),
      0,
    );
  }

  filledLineCount(index: number): number {
    const arr = this.hasPosnets(index) ? this.sourcePosnets(index) : this.sourceLines(index);
    return arr.controls.filter((line) => closingNum(line.get('amount')?.value) > 0).length;
  }

  posnetLabel(sourceIndex: number, posnetIndex: number): string {
    const name = String(
      this.sourcePosnets(sourceIndex).at(posnetIndex)?.get('name')?.value ?? '',
    ).trim();
    return name || `Posnet ${posnetIndex + 1}`;
  }

  lineLabel(sourceIndex: number, lineIndex: number): string {
    const lines = this.sourceLines(sourceIndex);
    const isLast = lineIndex === lines.length - 1;
    const empty = closingNum(lines.at(lineIndex)?.get('amount')?.value) <= 0;
    if (isLast && empty) {
      return this.filledLineCount(sourceIndex) > 0 ? 'Otro monto' : 'Monto';
    }
    return `Monto ${lineIndex + 1}`;
  }

  money(value: number): string {
    return closingMoney(value);
  }

  rowName(index: number): string {
    const row = this.sourceAmounts().at(index);
    return String(row?.get('name')?.value ?? '').trim() || 'Cuenta';
  }

  rowSourceId(index: number): string {
    return String(this.sourceAmounts().at(index)?.get('sourceId')?.value ?? '');
  }

  isDeclared(index: number): boolean {
    return !!this.sourceAmounts().at(index)?.get('includeInDeclared')?.value;
  }

  rowChip(index: number): string {
    if (this.isDeclared(index)) return 'Al declarado';
    const kind = String(this.sourceAmounts().at(index)?.get('kind')?.value ?? '');
    if (kind === 'OWN_ACCOUNT') return 'Hoy';
    if (kind === 'SETTLE_CASH') return 'Después';
    if (kind === 'SETTLE_ACCOUNT') return 'Deposita';
    return 'Aparte';
  }

  rowHint(index: number): string {
    if (this.hasPosnets(index)) {
      const n = this.sourcePosnets(index).length;
      return n === 1 ? '1 posnet' : `${n} posnets · se suman`;
    }
    if (this.isDeclared(index)) return 'Suma al total declarado';
    const kind = String(this.sourceAmounts().at(index)?.get('kind')?.value ?? '');
    if (kind === 'OWN_ACCOUNT') return 'Va a la cuenta del local hoy';
    if (kind === 'SETTLE_CASH') return 'Rinde después en efectivo';
    if (kind === 'SETTLE_ACCOUNT') return 'Se deposita después en una cuenta';
    return 'Queda a cuenta aparte';
  }

  showSourceFiles(index: number): boolean {
    return showClosingStepFiles(
      this.rowTotal(index) > 0,
      this.sourceFiles()[this.rowSourceId(index)] ?? [],
    );
  }

  sourceFilesMissing(index: number): boolean {
    return closingStepFilesMissing(
      this.requireClosingFiles(),
      this.rowTotal(index) > 0,
      this.sourceFiles()[this.rowSourceId(index)] ?? [],
    );
  }
}
