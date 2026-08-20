import { Component, input, output } from '@angular/core';
import {
  ControlContainer,
  FormGroupDirective,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Employee } from '../employees/employees-api.service';
import { TipsEditorComponent, TipsEditorState } from '../tips/tips-editor';
import { ClosingFormStepNavComponent } from './closing-form-step-nav';

@Component({
  selector: 'app-closing-form-tips-step',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    TipsEditorComponent,
    ClosingFormStepNavComponent,
  ],
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
  template: `
    <div class="closing-form__block">
      <div class="closing-form__block-head">
        <div class="closing-form__block-title">
          <h3>Propinas</h3>
          <span class="closing-form__meta">Separadas del retiro y los egresos</span>
        </div>
      </div>
      <div class="closing-form__block-body">
        @if (tipsEnabled()) {
          <app-tips-editor
            [employees]="tipEmployees()"
            [value]="tipEditorValue()"
            [readonly]="tipsReadonly()"
            [showDelivery]="false"
            (valueChange)="tipChange.emit($event)"
          />
        } @else {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Propinas</mat-label>
            <input matInput type="number" inputmode="decimal" formControlName="tipsAmount" />
          </mat-form-field>
        }
      </div>
    </div>
    <app-closing-form-step-nav />
  `,
  styleUrl: './closing-form-tips-step.scss',
})
export class ClosingFormTipsStepComponent {
  readonly tipsEnabled = input(false);
  readonly tipsReadonly = input(false);
  readonly tipEmployees = input<Employee[]>([]);
  readonly tipEditorValue = input<TipsEditorState | null>(null);
  readonly tipChange = output<TipsEditorState>();
}
