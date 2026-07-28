import { Injectable, inject, Component } from '@angular/core';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { DialogTitleService } from '../services/dialog-title.service';

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
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
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)">Cancelar</button>
      <button mat-flat-button color="warn" type="button" (click)="ref.close(true)">Confirmar</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<{ title: string; message: string }>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ConfirmDialogComponent>);
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);

  confirm(title: string, message: string): Promise<boolean> {
    return firstValueFrom(
      this.dialogTitle
        .track(
          this.dialog.open(ConfirmDialogComponent, {
            data: { title, message },
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
