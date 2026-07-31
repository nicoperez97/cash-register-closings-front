import { Component, input } from '@angular/core';

export type SpinnerTone = 'primary' | 'accent' | 'on-primary' | 'muted' | 'inherit';
export type SpinnerSize = 16 | 18 | 20 | 22 | 24 | 28 | 36 | 48;

/**
 * Spinner CSS confiable (evita el mat-spinner de Material que a veces se ve como un punto).
 */
@Component({
  selector: 'app-spinner',
  template: `<span class="guy-spinner" role="presentation" aria-hidden="true"></span>`,
  host: {
    class: 'guy-spinner-host',
    '[class.guy-spinner-host--primary]': 'tone() === "primary"',
    '[class.guy-spinner-host--accent]': 'tone() === "accent"',
    '[class.guy-spinner-host--on-primary]': 'tone() === "on-primary"',
    '[class.guy-spinner-host--muted]': 'tone() === "muted"',
    '[class.guy-spinner-host--inherit]': 'tone() === "inherit"',
    '[style.--guy-spinner-size.px]': 'size()',
    '[attr.aria-label]': 'label()',
    role: 'status',
  },
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--guy-spinner-size, 20px);
        height: var(--guy-spinner-size, 20px);
        flex-shrink: 0;
        color: var(--guy-primary, #1d65a0);
        vertical-align: middle;
      }

      :host.guy-spinner-host--inherit {
        color: inherit;
      }

      :host.guy-spinner-host--accent {
        color: var(--guy-accent, #f27d16);
      }

      :host.guy-spinner-host--on-primary {
        color: #fff;
      }

      :host.guy-spinner-host--muted {
        color: var(--guy-muted, #5f6f76);
      }

      .guy-spinner {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 2.5px solid color-mix(in srgb, currentColor 22%, transparent);
        border-top-color: currentColor;
        border-right-color: color-mix(in srgb, currentColor 55%, transparent);
        animation: guy-spinner-rotate 0.65s linear infinite;
      }

      @keyframes guy-spinner-rotate {
        to {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .guy-spinner {
          animation-duration: 1.4s;
        }
      }
    `,
  ],
})
export class SpinnerComponent {
  readonly size = input<SpinnerSize | number>(20);
  readonly tone = input<SpinnerTone>('primary');
  readonly label = input('Cargando');
}
