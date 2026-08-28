import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export type UserAvatarPreviewData = {
  title: string;
  src: string;
  subtitle?: string | null;
};

@Component({
  selector: 'app-user-avatar-preview-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>account_circle</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ data.title }}</strong>
        @if (data.subtitle) {
          <span>{{ data.subtitle }}</span>
        }
      </span>
    </h2>

    <mat-dialog-content class="avatar-preview__body">
      <img class="avatar-preview__img" [src]="data.src" [alt]="data.title" />
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" type="button" (click)="ref.close()">Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .avatar-preview__body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-width: min(92vw, 420px);
      padding-top: 0.35rem !important;
    }
    .avatar-preview__img {
      width: min(72vw, 360px);
      height: min(72vw, 360px);
      max-height: 70vh;
      object-fit: cover;
      border-radius: 999px;
      background: color-mix(in srgb, var(--guy-border, #e4e0d8) 40%, #fff);
      box-shadow: 0 10px 28px color-mix(in srgb, var(--guy-navy, #003366) 12%, transparent);
    }
  `,
})
export class UserAvatarPreviewDialogComponent {
  readonly data = inject<UserAvatarPreviewData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<UserAvatarPreviewDialogComponent>);
}
