import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { userAvatarSrc } from '../../core/utils/drive-url';

@Component({
  selector: 'app-user-avatar',
  imports: [MatIconModule],
  template: `
    @if (src()) {
      <img class="ua" [class.ua--sm]="size() === 'sm'" [class.ua--lg]="size() === 'lg'" [src]="src()!" [alt]="alt()" />
    } @else {
      <span
        class="ua ua--fallback"
        [class.ua--sm]="size() === 'sm'"
        [class.ua--lg]="size() === 'lg'"
        aria-hidden="true"
      >
        <mat-icon>account_circle</mat-icon>
      </span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
      line-height: 0;
      overflow: hidden;
      border-radius: 999px;
    }
    .ua {
      width: 2rem;
      height: 2rem;
      min-width: 2rem;
      min-height: 2rem;
      max-width: 2rem;
      max-height: 2rem;
      aspect-ratio: 1;
      border-radius: 999px;
      object-fit: cover;
      object-position: center;
      display: block;
      flex-shrink: 0;
    }
    .ua--sm {
      width: 1.5rem;
      height: 1.5rem;
      min-width: 1.5rem;
      min-height: 1.5rem;
      max-width: 1.5rem;
      max-height: 1.5rem;
    }
    .ua--lg {
      width: 4rem;
      height: 4rem;
      min-width: 4rem;
      min-height: 4rem;
      max-width: 4rem;
      max-height: 4rem;
    }
    .ua--fallback {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--guy-accent, #2e7d32) 16%, transparent);
      color: var(--guy-accent, #2e7d32);
    }
    .ua--fallback mat-icon {
      font-size: 1.35rem;
      width: 1.35rem;
      height: 1.35rem;
    }
    .ua--lg.ua--fallback mat-icon {
      font-size: 2.5rem;
      width: 2.5rem;
      height: 2.5rem;
    }
  `,
})
export class UserAvatarComponent {
  readonly userId = input<string | null>(null);
  readonly avatarUrl = input<string | null>(null);
  readonly hasAvatar = input(false);
  readonly cacheKey = input<string | number | null>(null);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly alt = input('Foto de perfil');

  readonly src = computed(() =>
    userAvatarSrc(
      {
        id: this.userId(),
        avatarUrl: this.avatarUrl(),
        hasAvatar: this.hasAvatar() || !!this.avatarUrl(),
      },
      this.cacheKey(),
    ),
  );
}
