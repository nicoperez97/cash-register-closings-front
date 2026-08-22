import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { NotifyRecipientsFieldComponent } from './notify-recipients-field';

export type NotifyConfirmDialogData = {
  title: string;
  message: string;
  confirmLabel?: string;
  shopId: string;
  excludeUserId?: string | null;
  enabledLabel?: string;
  hint?: string;
};

export type NotifyConfirmDialogResult = {
  confirmed: true;
  notifyUserIds: string[];
};

@Component({
  selector: 'app-notify-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, NotifyRecipientsFieldComponent],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon guy-dialog__title-icon--warn" aria-hidden="true">
        <mat-icon>delete</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ data.title }}</strong>
        <span>{{ data.message }}</span>
      </span>
    </h2>
    <mat-dialog-content>
      <app-notify-recipients-field
        [shopId]="data.shopId"
        [excludeUserId]="data.excludeUserId ?? null"
        [enabledLabel]="data.enabledLabel || 'Avisar de la eliminación'"
        [hint]="data.hint || 'Si marcás personas, reciben aviso en la app y por mail.'"
        [(enabled)]="notifyEnabled"
        [(selectedIds)]="notifyIds"
      />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)">Cancelar</button>
      <button mat-flat-button color="warn" type="button" (click)="confirm()">
        {{ data.confirmLabel || 'Eliminar' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class NotifyConfirmDialogComponent {
  readonly data = inject<NotifyConfirmDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<NotifyConfirmDialogComponent, NotifyConfirmDialogResult | false>);

  readonly notifyEnabled = signal(false);
  readonly notifyIds = signal<string[]>([]);

  confirm(): void {
    this.ref.close({
      confirmed: true,
      notifyUserIds: this.notifyEnabled() ? this.notifyIds() : [],
    });
  }
}
