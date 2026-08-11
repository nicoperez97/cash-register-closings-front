import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { APP_BRAND } from '../../core/config/app-brand';

@Component({
  selector: 'app-page-header',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <header class="guy-page-header">
      <div class="guy-page-header__text">
        <div class="guy-page-header__eyebrow">{{ eyebrow || brand.eyebrow }}</div>
        <h1>{{ title }}</h1>
        @if (subtitle) {
          <p class="subtitle">{{ subtitle }}</p>
        }
      </div>
      @if (actionLabel) {
        <button
          mat-flat-button
          color="primary"
          type="button"
          class="guy-page-header__action"
          [class.guy-page-header__action--large]="actionLarge"
          [disabled]="actionDisabled"
          (click)="action.emit()"
        >
          <mat-icon>{{ actionIcon }}</mat-icon>
          {{ actionLabel }}
        </button>
      }
    </header>
  `,
  styles: [
    `
      .guy-page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1.25rem;
        padding: 1rem 1.15rem;
        background: linear-gradient(
          105deg,
          var(--guy-card, #ffffff) 0%,
          color-mix(in srgb, var(--guy-accent, #2e7d32) 10%, var(--guy-card, #fff)) 55%,
          color-mix(in srgb, var(--guy-primary, #0b5cab) 10%, var(--guy-card, #fff)) 100%
        );
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 14px;
        border-left: 5px solid var(--guy-green, #2e7d32);
        box-shadow: var(--guy-shadow, 0 8px 24px rgba(0, 51, 102, 0.08));
        max-width: 100%;
        box-sizing: border-box;
        min-width: 0;
        animation: guy-fade-up var(--guy-dur-slow, 380ms) var(--guy-ease, cubic-bezier(0.22, 1, 0.36, 1))
          both;
      }
      .guy-page-header__text {
        min-width: 0;
        flex: 1 1 auto;
      }
      .guy-page-header__eyebrow {
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--guy-green, #2e7d32);
        margin-bottom: 0.2rem;
      }
      h1 {
        margin: 0;
        color: var(--guy-navy, #003366);
        font-size: 1.45rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.2;
      }
      .subtitle {
        margin: 0.3rem 0 0;
        color: var(--guy-muted, #5f6f76);
        font-size: 0.9rem;
      }
      .guy-page-header__action {
        white-space: nowrap;
        flex: 0 0 auto;
      }
      .guy-page-header__action--large {
        min-height: 3.25rem;
        padding: 0.85rem 1.75rem;
        font-size: 1.1rem;
        font-weight: 700;
        border-radius: 12px;
        letter-spacing: 0.01em;
      }
      .guy-page-header__action--large mat-icon {
        font-size: 1.5rem;
        width: 1.5rem;
        height: 1.5rem;
        margin-right: 0.15rem;
      }
      @media (max-width: 720px) {
        .guy-page-header {
          flex-wrap: nowrap;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.65rem;
          padding: 0.55rem 0.75rem;
        }
        .guy-page-header__eyebrow,
        .subtitle {
          display: none;
        }
        h1 {
          font-size: 1.12rem;
        }
        .guy-page-header__action {
          width: auto;
          min-height: 2.4rem;
          padding: 0 0.8rem;
          font-size: 0.82rem;
        }
      }
    `,
  ],
})
export class PageHeaderComponent {
  readonly brand = APP_BRAND;

  @Input({ required: true }) title!: string;
  @Input() subtitle = '';
  @Input() eyebrow = '';
  @Input() actionLabel = '';
  @Input() actionIcon = 'add';
  @Input() actionDisabled = false;
  @Input() actionLarge = false;
  @Output() action = new EventEmitter<void>();
}
