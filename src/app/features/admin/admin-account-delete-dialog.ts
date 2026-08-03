import { Component, Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { AdminAccountRow } from './admin-account-dialog';

export interface AccountDeleteTarget {
  id: string;
  name: string;
  code?: string;
}

export type AdminAccountDeleteDialogData = {
  accountName: string;
  balance: number;
  targets: AccountDeleteTarget[];
};

export type AdminAccountDeleteDialogResult =
  | { confirmed: true; transferToAccountId: string }
  | { confirmed: false };

@Component({
  selector: 'app-admin-account-delete-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon guy-dialog__title-icon--warn" aria-hidden="true">
        <mat-icon>swap_horiz</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Transferir saldo</strong>
        <span>
          «{{ data.accountName }}» tiene saldo {{ money(data.balance) }}. Elegí a qué cuenta
          transferirlo antes de eliminarla.
        </span>
      </span>
    </h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="delete-transfer-form">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="w-100">
          <mat-label>Cuenta destino</mat-label>
          <mat-select formControlName="transferToAccountId">
            @for (t of data.targets; track t.id) {
              <mat-option [value]="t.id">{{ t.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close({ confirmed: false })">Cancelar</button>
      <button mat-flat-button color="warn" type="button" [disabled]="form.invalid" (click)="confirm()">
        Transferir y eliminar
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .delete-transfer-form {
      padding-top: 0.25rem;
    }
    .w-100 {
      width: 100%;
    }
  `,
})
export class AdminAccountDeleteDialogComponent {
  readonly data = inject<AdminAccountDeleteDialogData>(MAT_DIALOG_DATA);
  readonly ref =
    inject(MatDialogRef<AdminAccountDeleteDialogComponent, AdminAccountDeleteDialogResult>);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    transferToAccountId: ['', Validators.required],
  });

  money(value: number): string {
    return `$ ${Number(value).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.ref.close({
      confirmed: true,
      transferToAccountId: this.form.getRawValue().transferToAccountId,
    });
  }
}

/** Flujo compartido: confirmar borrado y, si hay saldo, transferir a otra cuenta. */
@Injectable({ providedIn: 'root' })
export class AdminAccountDeleteService {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly snack = inject(MatSnackBar);

  /** @returns true si se eliminó la cuenta */
  async remove(shopId: string, row: AdminAccountRow): Promise<boolean> {
    if (row.type === 'SYSTEM') return false;

    let balance = 0;
    try {
      const res = await firstValueFrom(
        this.http.get<{ balance: number }>(
          `${environment.apiUrl}/shops/${shopId}/accounts/${row.id}/balance`,
        ),
      );
      balance = Number(res.balance ?? 0);
    } catch {
      this.snack.open('No se pudo consultar el saldo de la cuenta', 'OK', { duration: 3000 });
      return false;
    }

    let transferToAccountId: string | undefined;

    if (Math.abs(balance) >= 0.01) {
      let targets: AccountDeleteTarget[] = [];
      try {
        const accounts = await firstValueFrom(
          this.http.get<AdminAccountRow[]>(`${environment.apiUrl}/shops/${shopId}/accounts`),
        );
        targets = accounts.filter((a) => a.id !== row.id && a.type !== 'SYSTEM');
      } catch {
        this.snack.open('No se pudieron cargar las cuentas destino', 'OK', { duration: 3000 });
        return false;
      }
      if (!targets.length) {
        this.snack.open(
          `«${row.name}» tiene saldo y no hay otra cuenta destino disponible`,
          'OK',
          { duration: 4000 },
        );
        return false;
      }
      const result = await firstValueFrom(
        this.dialogTitle
          .track(
            this.dialog.open(AdminAccountDeleteDialogComponent, {
              width: '440px',
              maxWidth: '95vw',
              panelClass: 'guy-dialog',
              data: {
                accountName: row.name,
                balance,
                targets,
              } satisfies AdminAccountDeleteDialogData,
            }),
            'Transferir saldo',
          )
          .afterClosed(),
      );
      if (!result?.confirmed) return false;
      transferToAccountId = result.transferToAccountId;
    } else {
      const ok = await this.confirmDialog.confirm('Eliminar cuenta', `¿Eliminar "${row.name}"?`);
      if (!ok) return false;
    }

    try {
      await firstValueFrom(
        this.http.delete(`${environment.apiUrl}/shops/${shopId}/accounts/${row.id}`, {
          params: transferToAccountId ? { transferToAccountId } : {},
        }),
      );
      this.snack.open(
        transferToAccountId ? 'Saldo transferido y cuenta eliminada' : 'Cuenta eliminada',
        'OK',
        { duration: 2500 },
      );
      return true;
    } catch (err: unknown) {
      const msg =
        (err as { error?: { message?: string | string[] } })?.error?.message ??
        'No se pudo eliminar la cuenta';
      this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
      return false;
    }
  }
}
