import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  MovementImportItem,
  MovementsApiService,
} from './movements-api.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';

export interface MovementsExcelImportDialogData {
  shopId: string;
  shopName: string;
  kind?: 'expense' | 'transfer';
}

@Component({
  selector: 'app-movements-excel-import-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>table_view</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ title() }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="text-muted mb-3">
        @if (isTransfer()) {
          Descargá la plantilla, completá transferencias entre cuentas (sin concepto) y subí el Excel.
          Filas ya existentes se omiten: podés importar el mismo archivo dos veces sin duplicar.
        } @else {
          Descargá la plantilla o subí el Excel del contador (hoja <em>Movimientos</em>).
          Si faltan cuentas o conceptos, se crean al confirmar. Filas ya existentes se omiten.
        }
      </p>

      <div class="xl-actions mb-3">
        <button mat-stroked-button type="button" (click)="downloadTemplate()" [disabled]="busy()">
          <mat-icon>download</mat-icon>
          Descargar plantilla
        </button>
        <input
          #fileInput
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          (change)="onFile($event)"
        />
        <button mat-stroked-button type="button" (click)="fileInput.click()" [disabled]="busy()">
          <mat-icon>attach_file</mat-icon>
          {{ fileName() || 'Elegir Excel' }}
        </button>
      </div>

      @if (busy()) {
        <mat-progress-bar mode="indeterminate" class="guy-progress mb-3" />
      }

      @if (items().length) {
        <p class="mb-2">
          {{ items().length }} filas · {{ validCount() }} nuevas · {{ existsCount() }} ya existen ·
          {{ invalidCount() }} con error
          @if (newAccountsCount() > 0) {
            · {{ newAccountsCount() }} cuentas nuevas
          }
          @if (newConceptsCount() > 0) {
            · {{ newConceptsCount() }} conceptos nuevos
          }
        </p>
        <div class="xl-preview">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Emisora</th>
                <th>Receptora</th>
                <th>Concepto</th>
                <th>Importe</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (row of visibleItems(); track row.rowNumber) {
                <tr [class.xl-preview__exists]="row.alreadyExists || !row.valid">
                  <td>{{ row.businessDate }}</td>
                  <td>
                    {{ row.fromAccountName || '—' }}
                    @if (row.willCreateFromAccount) {
                      <span class="xl-new-user">nueva</span>
                    }
                  </td>
                  <td>
                    {{ row.toAccountName || '—' }}
                    @if (row.willCreateToAccount) {
                      <span class="xl-new-user">nueva</span>
                    }
                  </td>
                  <td>
                    {{ row.conceptName || '—' }}
                    @if (row.willCreateConcept) {
                      <span class="xl-new-user">nuevo</span>
                    }
                  </td>
                  <td>{{ money(row.amountUyu) }}</td>
                  <td>
                    @if (row.alreadyExists) {
                      Ya existe
                    } @else if (row.valid) {
                      Listo
                    } @else {
                      {{ row.error || 'Error' }}
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (items().length > 100) {
          <p class="text-muted mt-2">Mostrando las primeras 100 filas de {{ items().length }}.</p>
        }
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
        [disabled]="busy() || !file() || validCount() === 0"
        (click)="commit()"
      >
        <app-busy-label [busy]="busy()" busyLabel="Importando…">
          <mat-icon>cloud_upload</mat-icon>
          Importar {{ validCount() }} nuevas
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .xl-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .xl-preview {
        overflow: auto;
        max-height: 360px;
        border: 1px solid var(--guy-border, #ddd);
        border-radius: 10px;
      }
      .xl-preview table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
      }
      .xl-preview th,
      .xl-preview td {
        padding: 0.45rem 0.6rem;
        text-align: left;
        border-bottom: 1px solid var(--guy-border, #eee);
        white-space: nowrap;
      }
      .xl-preview th {
        position: sticky;
        top: 0;
        background: var(--guy-card, #fff);
        font-weight: 600;
      }
      .xl-preview__exists {
        opacity: 0.55;
      }
      .xl-new-user {
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
export class MovementsExcelImportDialogComponent {
  readonly data = inject<MovementsExcelImportDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<MovementsExcelImportDialogComponent, boolean>);
  private readonly api = inject(MovementsApiService);
  private readonly snack = inject(MatSnackBar);

  readonly file = signal<File | null>(null);
  readonly fileName = signal('');
  readonly items = signal<MovementImportItem[]>([]);
  readonly busy = signal(false);

  readonly isTransfer = () => this.data.kind === 'transfer';
  readonly title = () =>
    this.isTransfer() ? 'Importar transferencias' : 'Importar gastos';
  readonly noun = () => (this.isTransfer() ? 'transferencias' : 'gastos');

  readonly visibleItems = computed(() => this.items().slice(0, 100));

  validCount(): number {
    return this.items().filter((i) => i.valid && !i.alreadyExists).length;
  }

  existsCount(): number {
    return this.items().filter((i) => i.alreadyExists).length;
  }

  invalidCount(): number {
    return this.items().filter((i) => !i.valid).length;
  }

  newAccountsCount(): number {
    const names = new Set<string>();
    for (const i of this.items()) {
      if (i.willCreateFromAccount && i.fromAccountName) names.add(i.fromAccountName.toLowerCase());
      if (i.willCreateToAccount && i.toAccountName) names.add(i.toAccountName.toLowerCase());
    }
    return names.size;
  }

  newConceptsCount(): number {
    return new Set(
      this.items()
        .filter((i) => i.willCreateConcept && i.conceptName)
        .map((i) => i.conceptName!.toLowerCase()),
    ).size;
  }

  money(n: number): string {
    return `$ ${Number(n || 0).toLocaleString('es-AR')}`;
  }

  downloadTemplate(): void {
    this.busy.set(true);
    this.api.downloadImportTemplate(this.data.shopId, this.data.kind).subscribe({
      next: (blob) => {
        this.busy.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.isTransfer()
          ? 'plantilla-transferencias.xlsx'
          : 'plantilla-gastos.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('No se pudo descargar la plantilla', 'OK', { duration: 3500 });
      },
    });
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.file.set(f);
    this.fileName.set(f.name);
    this.busy.set(true);
    this.api.previewExcelImport(this.data.shopId, f, this.data.kind).subscribe({
      next: (rows) => {
        this.items.set(Array.isArray(rows) ? rows : (rows as any)?.preview ?? []);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.items.set([]);
        const msg = err?.error?.message ?? 'No se pudo analizar el Excel';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }

  commit(): void {
    const f = this.file();
    if (!f) return;
    this.busy.set(true);
    this.api.commitExcelImport(this.data.shopId, f, this.data.kind).subscribe({
      next: (res) => {
        this.busy.set(false);
        const extra = [
          res.createdAccounts?.length ? `Cuentas: ${res.createdAccounts.join(', ')}` : '',
          res.createdConcepts?.length ? `Conceptos: ${res.createdConcepts.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('. ');
        this.snack.open(
          `Importados ${res.createdCount} ${this.noun()}.${
            res.skippedCount ? ` Omitidos ${res.skippedCount} (ya existían).` : ''
          }${extra ? ' ' + extra : ''}`,
          'OK',
          { duration: 5500 },
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
