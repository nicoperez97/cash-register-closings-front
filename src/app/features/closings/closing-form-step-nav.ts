import { Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatStepperModule } from '@angular/material/stepper';

@Component({
  selector: 'app-closing-form-step-nav',
  imports: [MatButtonModule, MatStepperModule],
  template: `
    <div class="closing-stepper__nav">
      @if (showBack()) {
        <button mat-stroked-button type="button" matStepperPrevious>Atrás</button>
      } @else {
        <span></span>
      }
      <button mat-flat-button color="primary" type="button" matStepperNext>Siguiente</button>
    </div>
  `,
  styleUrl: './closing-form-step-nav.scss',
})
export class ClosingFormStepNavComponent {
  readonly showBack = input(true);
}
