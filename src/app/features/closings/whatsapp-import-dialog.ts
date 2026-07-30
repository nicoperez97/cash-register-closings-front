import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  ClosingsApiService,
  WhatsappImportItem,
} from './closings-api.service';

export interface WhatsappImportDialogData {
  shopId: string;
  shopName: string;
}

@Component({
  selector: 'app-whatsapp-import-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>folder_zip</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Importar desde WhatsApp</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="text-muted mb-3">
        Adjuntá el ZIP de “Exportar chat” de WhatsApp (sin incluir medios). Se detectan
        PVS, efectivo, cambio y retiros automáticamente.
      </p>

      <div class="wa-upload mb-3">
        <input
          #fileInput
          type="file"
          accept=".zip,application/zip"
          hidden
          (change)="onFile($event)"
        />
        <button mat-stroked-button type="button" (click)="fileInput.click()" [disabled]="busy()">
          <mat-icon>attach_file</mat-icon>
          {{ fileName() || 'Elegir archivo ZIP' }}
        </button>
      </div>

      @if (busy()) {
        <mat-progress-bar mode="indeterminate" class="mb-3" />
      }

      @if (items().length) {
        <p class="mb-2">
          {{ items().length }} cierres detectados ·
          {{ creatableCount() }} nuevos ·
          {{ existingCount() }} ya cargados
          @if (newUsersCount() > 0) {
            · {{ newUsersCount() }} usuarios nuevos (Visor / 123456)
          }
        </p>
        <div class="wa-preview">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>PVS</th>
                <th>Efectivo</th>
                <th>Cambio</th>
                <th>Quién</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.businessDate) {
                <tr [class.wa-preview__exists]="row.alreadyExists">
                  <td>{{ row.businessDate }}</td>
                  <td>{{ money(row.cardAmount) }}</td>
                  <td>{{ money(row.cashAmount) }}</td>
                  <td>{{ money(row.cashLeftInRegister) }}</td>
                  <td>
                    {{ row.cashWithdrawnByName || '—' }}
                    @if (row.willCreateUser) {
                      <span class="wa-new-user">nuevo</span>
                    }
                  </td>
                  <td>
                    @if (row.alreadyExists) {
                      Ya existe
                    } @else {
                      {{ confidenceLabel(row.confidence) }}
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">
        Cancelar
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="busy() || !file() || creatableCount() === 0"
        (click)="commit()"
      >
        <mat-icon>cloud_upload</mat-icon>
        Confirmar importación
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .wa-preview {
        overflow: auto;
        max-height: 360px;
        border: 1px solid var(--guy-border, #ddd);
        border-radius: 10px;
      }
      .wa-preview table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
      }
      .wa-preview th,
      .wa-preview td {
        padding: 0.45rem 0.6rem;
        text-align: left;
        border-bottom: 1px solid var(--guy-border, #eee);
        white-space: nowrap;
      }
      .wa-preview th {
        position: sticky;
        top: 0;
        background: var(--guy-card, #fff);
        font-weight: 600;
      }
      .wa-preview__exists {
        opacity: 0.55;
      }
      .wa-new-user {
        display: inline-block;
        margin-left: 0.35rem;
        padding: 0.05rem 0.4rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 600;
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 18%, transparent);
        color: var(--guy-accent, #2e7d32);
      }
    `,
  ],
})
export class WhatsappImportDialogComponent {
  readonly data = inject<WhatsappImportDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<WhatsappImportDialogComponent, boolean>);
  private readonly api = inject(ClosingsApiService);
  private readonly snack = inject(MatSnackBar);

  readonly file = signal<File | null>(null);
  readonly fileName = signal('');
  readonly items = signal<WhatsappImportItem[]>([]);
  readonly busy = signal(false);

  creatableCount(): number {
    return this.items().filter((i) => !i.alreadyExists && (i.cardAmount > 0 || i.cashAmount > 0))
      .length;
  }

  existingCount(): number {
    return this.items().filter((i) => i.alreadyExists).length;
  }

  newUsersCount(): number {
    const names = new Set(
      this.items()
        .filter((i) => i.willCreateUser && i.cashWithdrawnByName)
        .map((i) => i.cashWithdrawnByName!.toLowerCase()),
    );
    return names.size;
  }

  money(n: number): string {
    return `$ ${Number(n || 0).toLocaleString('es-AR')}`;
  }

  confidenceLabel(c: string): string {
    if (c === 'high') return 'Alta';
    if (c === 'medium') return 'Media';
    return 'Baja';
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.file.set(f);
    this.fileName.set(f.name);
    this.busy.set(true);
    this.api.previewWhatsappImport(this.data.shopId, f).subscribe({
      next: (rows) => {
        this.items.set(Array.isArray(rows) ? rows : (rows as any)?.preview ?? []);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.items.set([]);
        const msg = err?.error?.message ?? 'No se pudo analizar el ZIP';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }

  commit(): void {
    const f = this.file();
    if (!f) return;
    this.busy.set(true);
    this.api.commitWhatsappImport(this.data.shopId, f).subscribe({
      next: (res) => {
        this.busy.set(false);
        const usersMsg =
          res.createdUsers?.length
            ? ` Usuarios nuevos: ${res.createdUsers.join(', ')} (Visor / 123456).`
            : '';
        this.snack.open(
          `Importados ${res.createdCount}. Omitidos ${res.skippedCount}.${usersMsg}`,
          'OK',
          { duration: 5000 },
        );
        this.ref.close(true);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'No se pudo importar';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }
}
