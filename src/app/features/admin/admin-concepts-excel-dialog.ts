import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { conceptKindLabel, yesNoLabel } from '../../core/i18n/labels';
import { formatConceptCategories } from '../../shared/concept-categories';
import { BusyLabelComponent } from '../../shared/components/busy-label';

export interface ConceptsExcelImportDialogData {
  shopId: string;
  shopName: string;
}

export interface ConceptImportItem {
  rowNumber: number;
  name: string;
  description: string | null;
  kind: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  categories?: string[];
  validated: boolean;
  exists: boolean;
  valid: boolean;
  error?: string;
}

export interface ConceptImportResult {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  items: ConceptImportItem[];
}

@Component({
  selector: 'app-admin-concepts-excel-dialog',
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
        <strong>Importar conceptos</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="text-muted mb-3">
        Descargá la plantilla (hoja <em>Conceptos</em>), completala y subila acá. Columnas:
        Nombre, Descripción, Tipo (Ingreso / Egreso / Transferencia), Categorías
        (Empleados, Servicios, Proveedores, Movimientos, Otros) y Validado (Sí / No).
        Si el nombre ya existe, se actualiza. Solo los validados aparecen en movimientos y pagos.
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
          {{ items().length }} filas · {{ validNewCount() }} nuevas · {{ validUpdateCount() }} a
          actualizar · {{ invalidCount() }} con error
        </p>
        <div class="xl-preview">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Tipo</th>
                <th>Categorías</th>
                <th>Validado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (row of visibleItems(); track row.rowNumber) {
                <tr [class.xl-preview__exists]="!row.valid">
                  <td>{{ row.name || '—' }}</td>
                  <td>{{ row.description || '—' }}</td>
                  <td>{{ kindLabel(row.kind) }}</td>
                  <td>{{ formatCats(row.categories) }}</td>
                  <td>{{ yesNo(row.validated) }}</td>
                  <td>
                    @if (!row.valid) {
                      {{ row.error || 'Error' }}
                    } @else if (row.exists) {
                      Actualizar
                    } @else {
                      Nuevo
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
          Importar {{ validCount() }}
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
    `,
  ],
})
export class AdminConceptsExcelDialogComponent {
  readonly data = inject<ConceptsExcelImportDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AdminConceptsExcelDialogComponent, boolean>);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly file = signal<File | null>(null);
  readonly fileName = signal('');
  readonly items = signal<ConceptImportItem[]>([]);
  readonly busy = signal(false);

  readonly visibleItems = computed(() => this.items().slice(0, 100));

  validCount(): number {
    return this.items().filter((i) => i.valid).length;
  }

  validNewCount(): number {
    return this.items().filter((i) => i.valid && !i.exists).length;
  }

  validUpdateCount(): number {
    return this.items().filter((i) => i.valid && i.exists).length;
  }

  invalidCount(): number {
    return this.items().filter((i) => !i.valid).length;
  }

  kindLabel(kind: string): string {
    return conceptKindLabel(kind);
  }

  formatCats(categories?: string[]): string {
    return formatConceptCategories(categories);
  }

  yesNo(value: boolean): string {
    return yesNoLabel(value);
  }

  downloadTemplate(): void {
    this.busy.set(true);
    this.http
      .get(`${environment.apiUrl}/shops/${this.data.shopId}/concepts/import-template.xlsx`, {
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.busy.set(false);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'plantilla-conceptos.xlsx';
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
    const body = new FormData();
    body.append('file', f);
    this.http
      .post<ConceptImportItem[]>(
        `${environment.apiUrl}/shops/${this.data.shopId}/concepts/import-excel`,
        body,
      )
      .subscribe({
        next: (rows) => {
          this.items.set(Array.isArray(rows) ? rows : []);
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
    const body = new FormData();
    body.append('file', f);
    this.http
      .post<ConceptImportResult>(
        `${environment.apiUrl}/shops/${this.data.shopId}/concepts/import-excel`,
        body,
        { params: { commit: 'true' } },
      )
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          this.snack.open(
            `Creados ${res.createdCount}. Actualizados ${res.updatedCount}. Omitidos ${res.skippedCount}.`,
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
