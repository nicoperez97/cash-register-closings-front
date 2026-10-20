import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { DialogTitleService } from '../services/dialog-title.service';
import type { AccountSwitchDialogData } from './account-switch-dialog';

/**
 * Abre el diálogo de agregar cuenta / confirmar identidad. El componente se
 * carga bajo demanda para no sumar form-field/input al bundle inicial del shell.
 */
@Injectable({ providedIn: 'root' })
export class AccountSwitchDialogService {
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);

  async open(data: AccountSwitchDialogData): Promise<boolean> {
    const { AccountSwitchDialogComponent } = await import('./account-switch-dialog');
    const title = data.mode === 'add' ? 'Agregar cuenta' : 'Confirmar identidad';
    return firstValueFrom(
      this.dialogTitle
        .track(
          this.dialog.open(AccountSwitchDialogComponent, {
            data,
            width: '420px',
            maxWidth: '95vw',
            panelClass: 'guy-dialog',
            disableClose: false,
          }),
          title,
        )
        .afterClosed(),
    ).then((r) => !!r);
  }
}
