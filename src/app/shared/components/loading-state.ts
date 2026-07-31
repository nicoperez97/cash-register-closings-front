import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SpinnerComponent } from './spinner';

@Component({
  selector: 'app-loading-state',
  imports: [SpinnerComponent, MatProgressBarModule, MatIconModule],
  template: `
    @if (refreshing()) {
      <div class="refresh-banner" role="status" aria-live="polite">
        <mat-progress-bar mode="indeterminate" class="guy-progress" aria-label="Actualizando datos" />
        <div class="refresh-banner__row">
          <app-spinner [size]="20" tone="accent" />
          <div class="refresh-banner__text">
            <strong>{{ refreshTitle() }}</strong>
            <span>{{ refreshMessage() }}</span>
          </div>
        </div>
      </div>
    } @else if (loading()) {
      <div class="loading-card" role="status" aria-live="polite" aria-busy="true">
        <div class="loading-card__orb">
          <app-spinner [size]="28" tone="accent" />
        </div>
        <div class="loading-card__text">
          <strong>{{ title() }}</strong>
          <span>{{ message() }}</span>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .refresh-banner {
        margin-bottom: 1rem;
        overflow: hidden;
        border-radius: 12px;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: linear-gradient(105deg, #ffffff 0%, #eef6f0 55%, #e8f0f8 100%);
        box-shadow: var(--guy-shadow, 0 8px 24px rgba(0, 51, 102, 0.06));
        animation: guy-slide-down var(--guy-dur, 240ms) var(--guy-ease, cubic-bezier(0.22, 1, 0.36, 1))
          both;
      }

      .refresh-banner mat-progress-bar {
        --mdc-linear-progress-active-indicator-color: var(--guy-accent, #f27d16);
        --mdc-linear-progress-track-color: rgba(242, 125, 22, 0.12);
        height: 3px;
      }

      .refresh-banner__row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.7rem 0.9rem;
      }

      .refresh-banner__text {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
      }

      .refresh-banner__text strong {
        color: var(--guy-navy, #003366);
        font-size: 0.92rem;
        line-height: 1.2;
      }

      .refresh-banner__text span {
        color: var(--guy-muted, #5f6f76);
        font-size: 0.8rem;
      }

      .loading-card {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        margin: 0.25rem 0 1rem;
        padding: 1.5rem 1.25rem;
        border-radius: 14px;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: linear-gradient(145deg, #ffffff 0%, #f4f8f5 100%);
        box-shadow: var(--guy-shadow, 0 8px 24px rgba(0, 51, 102, 0.08));
        animation: guy-scale-in var(--guy-dur-slow, 380ms) var(--guy-ease, cubic-bezier(0.22, 1, 0.36, 1))
          both;
      }

      .loading-card__orb {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--guy-green-soft, #e8f5e9);
        flex-shrink: 0;
      }

      .loading-card__text {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }

      .loading-card__text strong {
        color: var(--guy-navy, #003366);
        font-size: 1rem;
      }

      .loading-card__text span {
        color: var(--guy-muted, #5f6f76);
        font-size: 0.85rem;
      }

      @media (max-width: 600px) {
        .loading-card {
          flex-direction: column;
          text-align: center;
          padding: 1.35rem 1rem;
        }
      }
    `,
  ],
})
export class LoadingStateComponent {
  /** Carga inicial: ocupa el lugar del contenido. */
  readonly loading = input(false);
  /** Refresh en segundo plano: barra + banner, sin vaciar la pantalla. */
  readonly refreshing = input(false);
  readonly title = input('Cargando…');
  readonly message = input('Preparando la información');
  readonly refreshTitle = input('Actualizando…');
  readonly refreshMessage = input('Obteniendo los datos más recientes');
}
