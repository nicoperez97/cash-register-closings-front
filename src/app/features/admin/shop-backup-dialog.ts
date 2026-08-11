import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FormsModule } from '@angular/forms';
import { ShopBackupApiService } from './shop-backup-api.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { takeInputFile } from '../../shared/utils/input-file';

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
    MatProgressBarModule,
    FormsModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>shield</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Backup y reset</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      @if (busy()) {
        <mat-progress-bar mode="indeterminate" class="guy-progress mb-3" />
      }

      <p class="lead">
        Herramientas de super admin. Se conservan nombre, logo, color, moneda, POS y usuarios
        asignados.
      </p>

      <section class="block">
        <div class="block__head">
          <mat-icon>cloud_download</mat-icon>
          <div>
            <h3>Backup</h3>
            <p>Descargá o restaurá un Excel con todos los datos del local.</p>
          </div>
        </div>
        <div class="block__actions">
          <button mat-flat-button color="primary" type="button" [disabled]="busy()" (click)="download()">
            <app-busy-label [busy]="busy()" busyLabel="Descargando…">
              <mat-icon>download</mat-icon>
              Descargar backup
            </app-busy-label>
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
      </section>

      <section class="block block--danger">
        <div class="block__head">
          <span class="danger-ico" aria-hidden="true">
            <mat-icon>warning</mat-icon>
          </span>
          <div class="block__head-text">
            <div class="danger-title-row">
              <h3>Resetear local</h3>
              <span class="danger-badge">Irreversible</span>
            </div>
            <p class="danger-shop">{{ data.shopName }}</p>
          </div>
        </div>

        <div class="keep-lose">
          <div class="keep-lose__col keep-lose__col--keep">
            <span class="keep-lose__label">Se conserva</span>
            <ul>
              <li>Configuración y marca</li>
              <li>Usuarios asignados</li>
            </ul>
          </div>
          <div class="keep-lose__col keep-lose__col--lose">
            <span class="keep-lose__label">Se borra</span>
            <ul>
              <li>Cierres, movimientos, POS</li>
              <li>Personal y nómina</li>
              <li>Cuentas y conceptos</li>
            </ul>
          </div>
        </div>

        <p class="danger-hint">
          El local queda vacío: no se recrea el catálogo por defecto.
        </p>

        <div class="confirm-row">
          <mat-form-field appearance="outline" class="confirm-field" subscriptSizing="dynamic">
            <mat-label>Confirmación</mat-label>
            <input
              matInput
              [ngModel]="confirmText()"
              (ngModelChange)="confirmText.set($event)"
              autocomplete="off"
              spellcheck="false"
              placeholder="RESET"
              [disabled]="busy()"
            />
            <mat-hint>Escribí exactamente RESET</mat-hint>
          </mat-form-field>
          <button
            mat-flat-button
            type="button"
            class="danger-btn"
            [class.danger-btn--ready]="canReset()"
            [disabled]="busy() || !canReset()"
            (click)="reset()"
          >
            <app-busy-label [busy]="busy()" busyLabel="Reseteando…">
              <mat-icon>delete_forever</mat-icon>
              Vaciar datos
            </app-busy-label>
          </button>
        </div>
      </section>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" [disabled]="busy()" (click)="ref.close(false)">Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .lead {
        margin: 0 0 1.1rem;
        font-size: 0.9rem;
        line-height: 1.45;
        color: var(--guy-muted, #5f6f76);
      }
      .block {
        margin-bottom: 1rem;
        padding: 1rem 1.05rem;
        border-radius: 14px;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 55%, var(--guy-card, #fff));
      }
      .block--danger {
        border-color: color-mix(in srgb, #c62828 42%, var(--guy-border, #ddd));
        background:
          linear-gradient(180deg, color-mix(in srgb, #c62828 10%, #fff) 0%, #fff 72%);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, #c62828 8%, transparent);
      }
      .danger-ico {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background: color-mix(in srgb, #c62828 14%, #fff);
        color: #b71c1c;
      }
      .danger-ico mat-icon {
        margin: 0;
        color: inherit;
      }
      .block__head-text {
        min-width: 0;
        flex: 1;
      }
      .danger-title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.45rem 0.6rem;
      }
      .danger-badge {
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #b71c1c;
        background: color-mix(in srgb, #c62828 12%, #fff);
        border: 1px solid color-mix(in srgb, #c62828 28%, #fff);
        border-radius: 999px;
        padding: 0.15rem 0.5rem;
      }
      .danger-shop {
        margin: 0.2rem 0 0 !important;
        font-size: 0.85rem !important;
        font-weight: 600;
        color: var(--guy-navy, #003366) !important;
      }
      .keep-lose {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem;
        margin-bottom: 0.75rem;
      }
      @media (max-width: 520px) {
        .keep-lose {
          grid-template-columns: 1fr;
        }
      }
      .keep-lose__col {
        border-radius: 10px;
        padding: 0.65rem 0.75rem;
        border: 1px solid var(--guy-border, #ddd);
        background: #fff;
      }
      .keep-lose__col--keep {
        border-color: color-mix(in srgb, #2e7d32 30%, #ddd);
        background: color-mix(in srgb, #2e7d32 6%, #fff);
      }
      .keep-lose__col--lose {
        border-color: color-mix(in srgb, #c62828 30%, #ddd);
        background: color-mix(in srgb, #c62828 5%, #fff);
      }
      .keep-lose__label {
        display: block;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        margin-bottom: 0.35rem;
      }
      .keep-lose__col--keep .keep-lose__label {
        color: #1b5e20;
      }
      .keep-lose__col--lose .keep-lose__label {
        color: #b71c1c;
      }
      .keep-lose ul {
        margin: 0;
        padding-left: 1rem;
        font-size: 0.8rem;
        line-height: 1.45;
        color: var(--guy-ink, #1a2a33);
      }
      .danger-hint {
        margin: 0 0 0.85rem;
        font-size: 0.8rem;
        color: var(--guy-muted, #5f6f76);
      }
      .confirm-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 0.65rem;
        align-items: start;
      }
      @media (max-width: 520px) {
        .confirm-row {
          grid-template-columns: 1fr;
        }
      }
      .confirm-field {
        width: 100%;
      }
      .danger-btn {
        min-height: 48px;
        border-radius: 10px !important;
        white-space: nowrap;
        background: color-mix(in srgb, #c62828 18%, #e0e0e0) !important;
        color: #6b6b6b !important;
      }
      .danger-btn--ready {
        background: #c62828 !important;
        color: #fff !important;
        box-shadow: 0 8px 18px rgba(198, 40, 40, 0.28);
      }
      .danger-btn mat-icon {
        margin-right: 0.15rem;
      }
      .block__head {
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
        margin-bottom: 0.85rem;
      }
      .block__head mat-icon {
        margin-top: 0.1rem;
        color: var(--guy-navy, #003366);
      }
      .block--danger .block__head mat-icon {
        color: inherit;
      }
      .block__head h3 {
        margin: 0 0 0.2rem;
        font-size: 0.98rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
      }
      .block--danger .block__head h3 {
        color: #b71c1c;
      }
      .block__head p {
        margin: 0;
        font-size: 0.82rem;
        line-height: 1.4;
        color: var(--guy-muted, #5f6f76);
      }
      .block__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
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
  readonly confirmText = signal('');
  readonly canReset = computed(() => this.confirmText().trim() === 'RESET');

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
    const file = takeInputFile(input);
    if (!file) return;
    const ok = window.confirm(
      `¿Restaurar backup en “${this.data.shopName}”? Se borrarán los datos actuales (incl. cuentas y conceptos) y se cargará el Excel.`,
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
    if (!this.canReset()) return;
    const ok = window.confirm(
      `¿Vaciar “${this.data.shopName}”? Se borran cuentas, conceptos y todo el resto de datos operativos. No se puede deshacer sin un backup.`,
    );
    if (!ok) return;
    this.busy.set(true);
    this.api.resetShop(this.data.shopId).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmText.set('');
        this.snack.open('Local vaciado (sin cuentas ni conceptos por defecto)', 'OK', {
          duration: 3500,
        });
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
