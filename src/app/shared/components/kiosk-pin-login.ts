import { Component, computed, input, output } from '@angular/core';

const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;

/**
 * Login kiosk (logo + PIN pad) compartido por /fichar y /mozo.
 * Estilos propios: no suman al budget de waiter-page.
 */
@Component({
  selector: 'app-kiosk-pin-login',
  template: `
    <div class="kiosk">
      <header class="hero">
        @if (logoUrl(); as logo) {
          <img class="logo" [src]="logo" [alt]="brand()" />
        } @else {
          <div class="mark" aria-hidden="true">{{ brandInitial() }}</div>
        }
        <p class="eyebrow">{{ eyebrow() }}</p>
        <h1 class="brand">{{ brand() || 'Local' }}</h1>
        <p class="lead">{{ lead() }}</p>
      </header>

      @if (error(); as err) {
        <p class="err" role="alert">{{ err }}</p>
      }

      <section class="sheet" aria-label="Código">
        <div class="dots" aria-hidden="true">
          @for (filled of pinDots(); track $index) {
            <span class="dot" [class.dot--on]="filled"></span>
          }
        </div>
        <div class="pad">
          @for (key of padKeys; track $index) {
            @if (key === '') {
              <span class="pad-spacer"></span>
            } @else {
              <button
                type="button"
                class="pad-key"
                [class.pad-key--action]="key === '⌫'"
                (click)="padKey.emit(key)"
                [disabled]="busy()"
              >
                {{ key }}
              </button>
            }
          }
        </div>
        <button
          type="button"
          class="btn"
          [style.background]="accent()"
          [style.color]="onAccent()"
          (click)="submit.emit()"
          [disabled]="busy() || !canSubmit()"
        >
          {{ busy() ? busyLabel() : submitLabel() }}
        </button>
      </section>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      --accent: #2e7d32;
      --on-accent: #fff;
      --ink: #142018;
      --muted: #5a686f;
      font-family: Figtree, system-ui, sans-serif;
      color: var(--ink);
    }
    .kiosk {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      width: 100%;
    }
    .hero {
      text-align: center;
      padding: 1.25rem 0 0.25rem;
    }
    .logo,
    .mark {
      width: 5.25rem;
      height: 5.25rem;
      margin: 0 auto 0.85rem;
      display: grid;
      place-items: center;
      border-radius: 1.25rem;
      background: #fff;
      border: 1px solid #e2e6e2;
      box-shadow: 0 8px 20px rgba(20, 32, 24, 0.08);
    }
    .logo {
      object-fit: contain;
      padding: 0.35rem;
    }
    .mark {
      font-size: 1.85rem;
      font-weight: 800;
      color: var(--accent);
      letter-spacing: -0.02em;
    }
    .eyebrow {
      margin: 0;
      font-size: 0.72rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 800;
    }
    .brand {
      margin: 0.3rem 0 0;
      font-size: clamp(1.85rem, 7vw, 2.35rem);
      line-height: 1.1;
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .lead {
      margin: 0.55rem 0 0;
      color: var(--muted);
      font-size: 0.98rem;
      line-height: 1.35;
    }
    .err {
      margin: 0;
      padding: 0.7rem 0.9rem;
      border-radius: 0.9rem;
      background: #fdecea;
      color: #b71c1c;
      font-size: 0.9rem;
      font-weight: 650;
      text-align: center;
    }
    .sheet {
      display: flex;
      flex-direction: column;
      gap: 0.95rem;
      margin-top: 0.15rem;
      padding: 1.15rem 1.05rem 1.2rem;
      border-radius: 1.35rem;
      background: #fff;
      border: 1px solid #e2e6e2;
      box-shadow: 0 12px 28px rgba(20, 32, 24, 0.07);
    }
    .dots {
      display: flex;
      justify-content: center;
      gap: 0.65rem;
      padding: 0.35rem 0 0.15rem;
    }
    .dot {
      width: 0.85rem;
      height: 0.85rem;
      border-radius: 999px;
      border: 2px solid color-mix(in srgb, var(--accent) 35%, #c5cdc6);
      background: transparent;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
    }
    .dot--on {
      background: var(--accent);
      border-color: var(--accent);
      transform: scale(1.08);
    }
    .pad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.55rem;
    }
    .pad-spacer {
      min-height: 3.4rem;
    }
    .pad-key {
      appearance: none;
      border: 1px solid #e0e5e1;
      border-radius: 1rem;
      min-height: 3.4rem;
      font-family: inherit;
      font-size: 1.35rem;
      font-weight: 750;
      color: var(--ink);
      background: #f7f8f7;
      cursor: pointer;
      touch-action: manipulation;
      transition: transform 0.12s ease, background 0.12s ease;
    }
    .pad-key:active:not(:disabled) {
      transform: scale(0.96);
      background: #eef1ee;
    }
    .pad-key--action {
      font-size: 1.15rem;
      color: var(--accent);
    }
    .pad-key:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn {
      appearance: none;
      border: none;
      border-radius: 1rem;
      padding: 1rem 1.15rem;
      min-height: 3.15rem;
      font-size: 1.05rem;
      font-weight: 800;
      font-family: inherit;
      background: var(--accent);
      color: var(--on-accent);
      cursor: pointer;
      width: 100%;
      touch-action: manipulation;
      transition: transform 0.12s ease, filter 0.12s ease, opacity 0.12s ease;
    }
    .btn:active:not(:disabled) {
      transform: scale(0.98);
      filter: brightness(0.96);
    }
    .btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  `,
  host: {
    '[style.--accent]': 'accent()',
    '[style.--on-accent]': 'onAccent()',
  },
})
export class KioskPinLoginComponent {
  readonly padKeys = PAD_KEYS;

  readonly eyebrow = input('Comanda');
  readonly brand = input('');
  readonly lead = input('Ingresá tu código');
  readonly logoUrl = input<string | null>(null);
  readonly accent = input('#2e7d32');
  readonly onAccent = input('#ffffff');
  readonly pin = input('');
  readonly pinLength = input(4);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly submitLabel = input('Continuar');
  readonly busyLabel = input('Entrando…');

  readonly padKey = output<string>();
  readonly submit = output<void>();

  readonly brandInitial = computed(() => {
    const name = this.brand().trim();
    return name ? name.charAt(0).toUpperCase() : 'C';
  });

  readonly pinDots = computed(() => {
    const len = this.pin().length;
    const slots = Math.max(1, this.pinLength());
    return Array.from({ length: slots }, (_, i) => i < len);
  });

  canSubmit(): boolean {
    const n = this.pinLength();
    return new RegExp(`^\\d{${n}}$`).test(this.pin().trim());
  }
}
