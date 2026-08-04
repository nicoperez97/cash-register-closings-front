import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { BusyLabelComponent } from './busy-label';

export type AppUpdateDialogData = {
  activate: () => Promise<void>;
};

@Component({
  selector: 'app-update-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, BusyLabelComponent],
  template: `
    <div class="upd" role="alertdialog" aria-labelledby="upd-title" aria-describedby="upd-desc">
      <div class="upd__glow" aria-hidden="true"></div>
      <div class="upd__orb" aria-hidden="true">
        <span class="upd__ring upd__ring--a"></span>
        <span class="upd__ring upd__ring--b"></span>
        <span class="upd__icon-wrap">
          <mat-icon>system_update_alt</mat-icon>
        </span>
      </div>

      <h2 id="upd-title" class="upd__title">Nueva versión lista</h2>
      <p id="upd-desc" class="upd__lead">
        Hay una actualización disponible. Para seguir usando la app con seguridad y las últimas
        mejoras, tenés que actualizar ahora.
      </p>

      <ul class="upd__points" aria-hidden="true">
        <li>
          <mat-icon>bolt</mat-icon>
          <span>Mejoras y correcciones</span>
        </li>
        <li>
          <mat-icon>verified_user</mat-icon>
          <span>Versión alineada con el servidor</span>
        </li>
        <li>
          <mat-icon>timer</mat-icon>
          <span>Tarda unos segundos</span>
        </li>
      </ul>

      <button
        mat-flat-button
        color="primary"
        type="button"
        class="upd__cta"
        [disabled]="busy()"
        (click)="update()"
      >
        <app-busy-label [busy]="busy()" busyLabel="Actualizando…">
          <mat-icon>refresh</mat-icon>
          Actualizar ahora
        </app-busy-label>
      </button>

      @if (error()) {
        <p class="upd__error" role="alert">{{ error() }}</p>
      } @else {
        <p class="upd__hint">La app se reinicia sola al terminar.</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .upd {
      position: relative;
      overflow: hidden;
      padding: 1.75rem 1.35rem 1.4rem;
      text-align: center;
      color: var(--guy-text, #1b2a33);
    }

    .upd__glow {
      position: absolute;
      inset: -40% -20% auto;
      height: 70%;
      background:
        radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--guy-primary, #1d65a0) 28%, transparent), transparent 70%),
        radial-gradient(ellipse at 80% 20%, color-mix(in srgb, var(--guy-accent, #f27d16) 18%, transparent), transparent 55%);
      pointer-events: none;
    }

    .upd__orb {
      position: relative;
      width: 5.5rem;
      height: 5.5rem;
      margin: 0.15rem auto 1.15rem;
      display: grid;
      place-items: center;
    }

    .upd__ring {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      border: 1.5px solid color-mix(in srgb, var(--guy-primary, #1d65a0) 28%, transparent);
      animation: upd-pulse 2.4s var(--guy-ease, ease) infinite;
    }

    .upd__ring--b {
      inset: 0.55rem;
      border-color: color-mix(in srgb, var(--guy-accent, #f27d16) 35%, transparent);
      animation-delay: 0.45s;
    }

    .upd__icon-wrap {
      position: relative;
      z-index: 1;
      width: 3.35rem;
      height: 3.35rem;
      border-radius: 1.05rem;
      display: grid;
      place-items: center;
      color: #fff;
      background:
        linear-gradient(
          145deg,
          color-mix(in srgb, var(--guy-primary, #1d65a0) 92%, #fff),
          var(--guy-navy-deep, #154a75)
        );
      box-shadow:
        0 12px 28px color-mix(in srgb, var(--guy-primary, #1d65a0) 32%, transparent),
        inset 0 1px 0 rgba(255, 255, 255, 0.25);
      animation: upd-float 3.2s var(--guy-ease, ease) infinite;
    }

    .upd__icon-wrap mat-icon {
      font-size: 1.7rem;
      width: 1.7rem;
      height: 1.7rem;
    }

    .upd__title {
      position: relative;
      margin: 0 0 0.45rem;
      font-size: 1.45rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--guy-navy, #1d65a0);
      line-height: 1.2;
    }

    .upd__lead {
      position: relative;
      margin: 0 auto 1.1rem;
      max-width: 28rem;
      font-size: 0.95rem;
      line-height: 1.5;
      color: var(--guy-muted, #5f6f76);
    }

    .upd__points {
      position: relative;
      list-style: none;
      margin: 0 0 1.25rem;
      padding: 0.75rem 0.85rem;
      display: grid;
      gap: 0.55rem;
      text-align: left;
      border-radius: 14px;
      background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 88%, var(--guy-card, #fff));
      border: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 90%, transparent);
    }

    .upd__points li {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--guy-text, #1b2a33);
    }

    .upd__points mat-icon {
      font-size: 1.15rem;
      width: 1.15rem;
      height: 1.15rem;
      color: var(--guy-primary, #1d65a0);
      flex-shrink: 0;
    }

    .upd__cta {
      position: relative;
      width: 100%;
      min-height: 48px;
      font-size: 1rem !important;
      font-weight: 700 !important;
      border-radius: 999px !important;
      box-shadow: 0 10px 24px color-mix(in srgb, var(--guy-primary, #1d65a0) 28%, transparent);
    }

    .upd__hint,
    .upd__error {
      position: relative;
      margin: 0.85rem 0 0;
      font-size: 0.8rem;
      line-height: 1.35;
    }

    .upd__hint {
      color: var(--guy-muted, #5f6f76);
    }

    .upd__error {
      color: #b42318;
      font-weight: 600;
    }

    @keyframes upd-pulse {
      0%,
      100% {
        transform: scale(0.92);
        opacity: 0.55;
      }
      50% {
        transform: scale(1.05);
        opacity: 1;
      }
    }

    @keyframes upd-float {
      0%,
      100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-4px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .upd__ring,
      .upd__icon-wrap {
        animation: none;
      }
    }
  `,
})
export class AppUpdateDialogComponent {
  private readonly data = inject<AppUpdateDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<AppUpdateDialogComponent, boolean>);

  readonly busy = signal(false);
  readonly error = signal('');

  constructor() {
    this.ref.disableClose = true;
  }

  async update(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.data.activate();
    } catch {
      this.busy.set(false);
      this.error.set('No se pudo actualizar. Reintentá en unos segundos.');
    }
  }
}
