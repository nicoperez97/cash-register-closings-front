import { Component, computed, inject, input } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { userAvatarSrc } from '../../core/utils/drive-url';
import { openUserAvatarPreview } from './open-user-avatar-preview';

@Component({
  selector: 'app-user-avatar',
  template: `
    @if (src()) {
      <img
        class="ua"
        [class.ua--sm]="size() === 'sm'"
        [class.ua--lg]="size() === 'lg'"
        [class.ua--preview]="previewable()"
        [src]="src()!"
        [alt]="alt()"
        [attr.role]="previewable() ? 'button' : null"
        [attr.tabindex]="previewable() ? 0 : null"
        [attr.aria-label]="previewable() ? previewAriaLabel() : null"
        (click)="onPreview($event)"
        (keydown.enter)="onPreviewKey($event)"
        (keydown.space)="onPreviewKey($event)"
      />
    } @else {
      <span
        class="ua ua--fallback"
        [class.ua--sm]="size() === 'sm'"
        [class.ua--lg]="size() === 'lg'"
        [attr.data-initial]="initial()"
        [attr.aria-label]="alt()"
        role="img"
      ></span>
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
    .ua--preview {
      cursor: zoom-in;
    }
    .ua--preview:focus-visible {
      outline: 2px solid var(--guy-primary, #1d65a0);
      outline-offset: 2px;
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
      font-weight: 700;
      line-height: 1;
    }
    .ua--fallback::before {
      content: attr(data-initial);
      font-size: 0.72rem;
      font-weight: 750;
    }
    .ua--sm.ua--fallback::before {
      font-size: 0.62rem;
    }
    .ua--lg.ua--fallback::before {
      font-size: 1.65rem;
    }
  `,
})
export class UserAvatarComponent {
  private readonly dialog = inject(MatDialog);

  readonly userId = input<string | null>(null);
  readonly avatarUrl = input<string | null>(null);
  readonly hasAvatar = input(false);
  readonly cacheKey = input<string | number | null>(null);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly alt = input('Foto de perfil');
  readonly previewable = input(false);
  readonly previewSubtitle = input<string | null>(null);

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

  readonly initial = computed(() => {
    const letter = (this.alt() || '').trim().charAt(0);
    return letter ? letter.toLocaleUpperCase('es') : '?';
  });

  previewAriaLabel(): string {
    return `Ver foto de ${this.alt()}`;
  }

  onPreview(ev: Event): void {
    if (!this.previewable() || !this.src()) return;
    ev.stopPropagation();
    openUserAvatarPreview(
      this.dialog,
      {
        title: this.alt(),
        src: this.src()!,
        subtitle: this.previewSubtitle(),
      },
      'Foto de perfil',
    );
  }

  onPreviewKey(ev: Event): void {
    if (!this.previewable()) return;
    ev.preventDefault();
    this.onPreview(ev);
  }
}
