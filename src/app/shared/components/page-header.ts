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
          [attr.aria-label]="actionAriaLabel || actionLabel"
          (click)="action.emit()"
        >
          <mat-icon aria-hidden="true">{{ actionIcon }}</mat-icon>
          {{ actionLabel }}
        </button>
      }
    </header>
  `,
  styleUrl: './page-header.scss',
})
export class PageHeaderComponent {
  readonly brand = APP_BRAND;

  @Input({ required: true }) title!: string;
  @Input() subtitle = '';
  @Input() eyebrow = '';
  @Input() actionLabel = '';
  @Input() actionIcon = 'add';
  @Input() actionAriaLabel = '';
  @Input() actionDisabled = false;
  @Input() actionLarge = false;
  @Output() action = new EventEmitter<void>();
}
