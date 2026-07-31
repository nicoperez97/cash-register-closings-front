import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormsModule } from '@angular/forms';
import { ShopBackupApiService } from './shop-backup-api.service';

export interface ShopBackupDialogData {
  shopId: string;
  shopName: string;
  shopSlug?: string;
}

@Component({
  selector: 'app-shop-backup-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    FormsModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>warning</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Backup y reset</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="text-muted">
        Solo super admin. Se conservan la configuración del local y los usuarios asignados.
        Se borran cierres, movimientos, POS, personal, nómina y catálogo (sin recrear defaults).
      </p>

      <div class="danger-actions">
        <button mat-stroked-button type="button" [disabled]="busy()" (click)="download()">
          <mat-icon>download</mat-icon>
          Descargar backup
        </button>

        <input
          #fileInput
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          (change)="onFile($event)"
        />
        <button mat-stroked-button type="button" [disabled]="busy()" (click)="fileInput.click()">
          <mat-icon>upload_file</mat-icon>
          Cargar backup
        </button>
      </div>

      <div class="reset-box">
        <p class="reset-box__title">Resetear local</p>
        <p class="text-muted small">
          Vacía todos los datos operativos. Escribí <strong>RESET</strong> para confirmar.
        </p>
        <mat-form-field appearance="outline" class="w-100" subscriptSizing="dynamic">
          <mat-label>Confirmación</mat-label>
          <input matInput [(ngModel)]="confirmText" autocomplete="off" />
        </mat-form-field>
        <button
          mat-flat-button
          color="warn"
          type="button"
          [disabled]="busy() || confirmText.trim() !== 'RESET'"
          (click)="reset()"
        >
          <mat-icon>delete_forever</mat-icon>
          Resetear local
        </button>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" [disabled]="busy()" (click)="ref.close(false)">Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .danger-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin: 1rem 0;
      }
      .reset-box {
        margin-top: 0.5rem;
        padding: 1rem;
        border-radius: 12px;
        border: 1px solid color-mix(in srgb, #c62828 35%, var(--guy-border, #ddd));
        background: color-mix(in srgb, #c62828 6%, var(--guy-card, #fff));
      }
      .reset-box__title {
        margin: 0 0 0.35rem;
        font-weight: 700;
        color: #b71c1c;
      }
    `,
  ],
})
export class ShopBackupDialogComponent {
  readonly data = inject<ShopBackupDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ShopBackupDialogComponent, boolean>);
  private readonly api = inject(ShopBackupApiService);
  private readonly snack = inject(MatSnackBar);

  readonly busy = signal(false);
  confirmText = '';

  download(): void {
    this.busy.set(true);
    this.api.downloadBackup(this.data.shopId).subscribe({
      next: (blob) => {
        this.busy.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const slug = this.data.shopSlug || 'local';
        a.download = `backup-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.snack.open('Backup descargado', 'OK', { duration: 2500 });
      },
      error: (err) => {
        this.busy.set(false);
        this.showErr(err, 'No se pudo descargar el backup');
      },
    });
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const ok = window.confirm(
      `¿Restaurar backup en “${this.data.shopName}”? Se borrarán los datos actuales del local y se cargará el Excel.`,
    );
    if (!ok) return;
    this.busy.set(true);
    this.api.restoreBackup(this.data.shopId, file).subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open('Backup restaurado', 'OK', { duration: 3000 });
        this.ref.close(true);
      },
      error: (err) => {
        this.busy.set(false);
        this.showErr(err, 'No se pudo restaurar el backup');
      },
    });
  }

  reset(): void {
    if (this.confirmText.trim() !== 'RESET') return;
    const ok = window.confirm(
      `¿Resetear “${this.data.shopName}”? Esta acción no se puede deshacer (salvo que tengas un backup).`,
    );
    if (!ok) return;
    this.busy.set(true);
    this.api.resetShop(this.data.shopId).subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open('Local reseteado', 'OK', { duration: 3000 });
        this.ref.close(true);
      },
      error: (err) => {
        this.busy.set(false);
        this.showErr(err, 'No se pudo resetear el local');
      },
    });
  }

  private showErr(err: any, fallback: string): void {
    const msg = err?.error?.message ?? fallback;
    this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
  }
}
