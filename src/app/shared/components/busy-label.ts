import { Component, input } from '@angular/core';
import { SpinnerComponent, SpinnerSize, SpinnerTone } from './spinner';

/**
 * Contenido de botón con estado busy: spinner + texto, o proyección idle.
 *
 * @example
 * ```html
 * <button mat-flat-button [disabled]="busy()">
 *   <app-busy-label [busy]="busy()" busyLabel="Guardando…">
 *     <mat-icon>save</mat-icon>
 *     Guardar
 *   </app-busy-label>
 * </button>
 * ```
 */
@Component({
  selector: 'app-busy-label',
  imports: [SpinnerComponent],
  template: `
    @if (busy()) {
      <app-spinner [size]="spinnerSize()" [tone]="spinnerTone()" />
      <span>{{ busyLabel() }}</span>
    } @else {
      <ng-content />
    }
  `,
  host: {
    class: 'guy-busy-label',
    '[attr.aria-busy]': 'busy() ? "true" : null',
  },
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        min-width: 0;
        line-height: 1.2;
        vertical-align: middle;
      }

      :host ::ng-deep mat-icon {
        font-size: 1.125rem;
        width: 1.125rem;
        height: 1.125rem;
        line-height: 1;
        margin: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
    `,
  ],
})
export class BusyLabelComponent {
  readonly busy = input(false);
  readonly busyLabel = input('Procesando…');
  readonly spinnerSize = input<SpinnerSize | number>(18);
  readonly spinnerTone = input<SpinnerTone>('inherit');
}
