import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  HelpBlock,
  HelpBodyPart,
  helpBlockIcon,
  helpBlockTone,
  helpBodyParts,
} from '../../core/help/module-help';

@Component({
  selector: 'app-help-blocks',
  imports: [MatIconModule],
  template: `
    @if (!blocks.length) {
      <p class="help-empty">No tenés acceso a las funciones de este módulo.</p>
    } @else {
      <div class="help-blocks" [class.help-blocks--compact]="compact">
        @for (b of blocks; track b.title; let i = $index) {
          <article class="help-card" [attr.data-tone]="tone(b)">
            <div class="help-card__icon" aria-hidden="true">
              <mat-icon>{{ icon(b) }}</mat-icon>
            </div>
            <div class="help-card__body">
              <header class="help-card__head">
                <span class="help-card__step">{{ i + 1 }}</span>
                <h3>{{ b.title }}</h3>
              </header>
              <p>
                @for (part of parts(b.body); track $index) {
                  @if (part.kind === 'code') {
                    <code>{{ part.value }}</code>
                  } @else {
                    {{ part.value }}
                  }
                }
              </p>
              @if (b.items?.length) {
                <ul class="help-card__items">
                  @for (item of b.items; track item) {
                    <li>{{ item }}</li>
                  }
                </ul>
              }
              @if (b.tip) {
                <p class="help-card__tip">
                  <mat-icon>lightbulb</mat-icon>
                  <span>{{ b.tip }}</span>
                </p>
              }
            </div>
          </article>
        }
      </div>
    }
  `,
  styles: `
    .help-empty {
      margin: 0;
      padding: 1rem 1.1rem;
      border-radius: 14px;
      background: color-mix(in srgb, var(--guy-muted, #5f6f76) 8%, var(--guy-card, #fff));
      color: var(--guy-muted, #5f6f76);
      line-height: 1.5;
    }

    .help-blocks {
      display: grid;
      gap: 0.75rem;
    }

    .help-card {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.85rem;
      align-items: start;
      margin: 0;
      padding: 0.95rem 1rem;
      border-radius: 16px;
      border: 1px solid var(--guy-border, #d7e0d9);
      background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 55%, var(--guy-card, #fff));
      box-shadow: 0 1px 0 color-mix(in srgb, #fff 50%, transparent) inset;
    }

    .help-card__icon {
      display: grid;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 12px;
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 14%, transparent);
      color: var(--guy-primary, #1d65a0);
    }

    .help-card[data-tone='do'] .help-card__icon {
      background: color-mix(in srgb, var(--guy-accent-secondary, #2e7d32) 16%, transparent);
      color: var(--guy-accent-secondary, #2e7d32);
    }

    .help-card[data-tone='read'] .help-card__icon {
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 14%, transparent);
      color: var(--guy-primary, #1d65a0);
    }

    .help-card[data-tone='lock'] .help-card__icon {
      background: color-mix(in srgb, #c62828 12%, transparent);
      color: #c62828;
    }

    .help-card__icon mat-icon {
      font-size: 1.25rem;
      width: 1.25rem;
      height: 1.25rem;
    }

    .help-card__head {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      margin: 0 0 0.35rem;
    }

    .help-card__step {
      display: inline-grid;
      place-items: center;
      min-width: 1.2rem;
      height: 1.2rem;
      padding: 0 0.28rem;
      border-radius: 999px;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: var(--guy-muted, #5f6f76);
      background: color-mix(in srgb, var(--guy-muted, #5f6f76) 12%, transparent);
    }

    .help-card h3 {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--guy-navy, #003366);
    }

    .help-card p {
      margin: 0;
      color: var(--guy-text, #1b2a33);
      line-height: 1.55;
      font-size: 0.92rem;
    }

    .help-card__items {
      margin: 0.55rem 0 0;
      padding: 0 0 0 1.1rem;
      display: grid;
      gap: 0.28rem;
      color: var(--guy-text, #1b2a33);
      font-size: 0.88rem;
      line-height: 1.45;
    }

    .help-card__tip {
      display: flex;
      align-items: flex-start;
      gap: 0.4rem;
      margin: 0.7rem 0 0 !important;
      padding: 0.55rem 0.7rem;
      border-radius: 12px;
      background: color-mix(in srgb, #f9a825 16%, var(--guy-card, #fff));
      color: #6d4c00 !important;
      font-size: 0.84rem !important;
      line-height: 1.4;
    }

    .help-card__tip mat-icon {
      font-size: 1.05rem;
      width: 1.05rem;
      height: 1.05rem;
      margin-top: 0.05rem;
      color: #f9a825;
    }

    .help-card code {
      display: inline-block;
      margin: 0 0.12em;
      padding: 0.05em 0.4em;
      border-radius: 6px;
      font-size: 0.84em;
      font-weight: 650;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 10%, var(--guy-card, #fff));
      color: var(--guy-navy, #003366);
      border: 1px solid color-mix(in srgb, var(--guy-primary, #1d65a0) 16%, transparent);
    }

    .help-blocks--compact .help-card {
      padding: 0.8rem 0.85rem;
    }

    @media (max-width: 520px) {
      .help-card {
        gap: 0.7rem;
        padding: 0.85rem 0.8rem;
      }
      .help-card__icon {
        width: 2.2rem;
        height: 2.2rem;
      }
    }
  `,
})
export class HelpBlocksComponent {
  @Input({ required: true }) blocks: HelpBlock[] = [];
  @Input() compact = false;

  icon(block: HelpBlock): string {
    return helpBlockIcon(block);
  }

  tone(block: HelpBlock): string {
    return helpBlockTone(block);
  }

  parts(body: string): HelpBodyPart[] {
    return helpBodyParts(body);
  }
}
