import { Injectable, inject, Component } from '@angular/core';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { DialogTitleService } from '../services/dialog-title.service';

export type ConfirmDialogOptions = {
  confirmLabel?: string;
  cancelLabel?: string;
  /** Default: warn (acciones destructivas). Usá primary para confirmaciones neutrales. */
  confirmColor?: 'primary' | 'warn';
  icon?: string;
};

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title id="confirm-dialog-title">
      <span
        class="guy-dialog__title-icon"
        [class.guy-dialog__title-icon--warn]="data.confirmColor !== 'primary'"
        [class.guy-dialog__title-icon--ok]="data.confirmColor === 'primary'"
        aria-hidden="true"
      >
        <mat-icon>{{ data.icon || 'delete' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ data.title }}</strong>
        <span id="confirm-dialog-message">{{ data.message }}</span>
      </span>
    </h2>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)">
        {{ data.cancelLabel || 'Cancelar' }}
      </button>
      <button
        mat-flat-button
        [color]="data.confirmColor || 'warn'"
        type="button"
        aria-describedby="confirm-dialog-message"
        (click)="ref.close(true)"
      >
        {{ data.confirmLabel || 'Confirmar' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<
    { title: string; message: string } & ConfirmDialogOptions
  >(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ConfirmDialogComponent>);
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);

  confirm(title: string, message: string, opts?: ConfirmDialogOptions): Promise<boolean> {
    return firstValueFrom(
      this.dialogTitle
        .track(
          this.dialog.open(ConfirmDialogComponent, {
            data: {
              title,
              message,
              confirmLabel: opts?.confirmLabel,
              cancelLabel: opts?.cancelLabel,
              confirmColor: opts?.confirmColor ?? 'warn',
              icon: opts?.icon,
            },
            width: '400px',
            maxWidth: '95vw',
            panelClass: 'guy-dialog',
          }),
          title,
        )
        .afterClosed(),
    ).then((v) => !!v);
  }
}
