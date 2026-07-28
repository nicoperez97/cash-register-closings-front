import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-offline-banner',
  imports: [MatIconModule],
  template: `
    @if (show()) {
      <div
        class="offline-banner panel-card mb-3 guy-enter-down"
        [class.offline-banner--stale]="stale()"
      >
        <mat-icon>{{ stale() ? 'sync_problem' : 'cloud_off' }}</mat-icon>
        <div>
          <strong>{{ title() }}</strong>
          @if (message()) {
            <div class="small">{{ message() }}</div>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .offline-banner {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        background: #fff8e8;
        border-color: #f0c36a;
      }

      .offline-banner mat-icon {
        color: var(--guy-orange, #e67e22);
        flex-shrink: 0;
      }

      .offline-banner--stale {
        background: #fff5f0;
        border-color: #e8a07a;
      }
    `,
  ],
})
export class OfflineBannerComponent {
  readonly show = input(true);
  readonly stale = input(false);
  readonly title = input('Sin conexión');
  readonly message = input('');
}
