import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  ClosingsApiService,
  ReloadIncomeItem,
  ReloadIncomesPreview,
} from './closings-api.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';

export interface ReloadIncomesDialogData {
  shopId: string;
  shopName: string;
}

@Component({
  selector: 'app-reload-incomes-dialog',
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
        <mat-icon>sync</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Volver a cargar</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="text-muted mb-3">
        Recorre todos los cierres y busca ingresos de caja (PVS, efectivo, MP, etc.) que
        todavía no estén en el libro, o que no coincidan con un ingreso existente.
      </p>

      @if (busy()) {
        <mat-progress-bar mode="indeterminate" class="guy-progress mb-3" />
        <p class="text-muted mb-3">Procesando cierres…</p>
      }

      @if (preview()) {
        <div class="xl-stats mb-3">
          <div class="xl-stat">
            <strong>{{ preview()!.closingsCount }}</strong>
            <span>cierres</span>
          </div>
          <div class="xl-stat xl-stat--ok">
            <strong>{{ preview()!.counts.new }}</strong>
            <span>nuevos</span>
          </div>
          <div class="xl-stat">
            <strong>{{ preview()!.counts.exists }}</strong>
            <span>ya están</span>
          </div>
          <div class="xl-stat" [class.xl-stat--warn]="preview()!.counts.mismatch > 0">
            <strong>{{ preview()!.counts.mismatch }}</strong>
            <span>no coinciden</span>
          </div>
        </div>

        <h3 class="xl-block__title">Ingresos a revisar</h3>
        <p class="text-muted mb-2">
          Solo se van a cargar los <strong>nuevos</strong>. Los que no coinciden no se tocan:
          el libro ya tiene otro importe ese día.
        </p>
        <div class="xl-preview mb-3">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cuenta</th>
                <th>Del cierre</th>
                <th>En el libro</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (row of visibleItems(); track row.closingId + row.label + row.amount) {
                <tr [class.xl-preview__exists]="row.status === 'exists'">
                  <td>{{ row.businessDate }}</td>
                  <td>{{ row.toAccountName }}</td>
                  <td>{{ money(row.amount) }}</td>
                  <td>{{ row.status === 'new' ? '—' : money(row.existingAmount) }}</td>
                  <td>{{ statusLabel(row) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (reviewItems().length > 80) {
          <p class="text-muted mb-3">Se muestran 80 filas de {{ reviewItems().length }}.</p>
        }

        <h3 class="xl-block__title">Saldos al cargar</h3>
        <div class="xl-preview">
          <table>
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Hoy</th>
                <th>Entra</th>
                <th>Quedaría</th>
              </tr>
            </thead>
            <tbody>
              @for (row of preview()!.balances; track row.accountId) {
                <tr>
                  <td>{{ row.name }}</td>
                  <td>{{ money(row.current) }}</td>
                  <td>{{ money(row.incoming) }}</td>
                  <td
                    [class.xl-amt--neg]="row.projected < 0"
                    [class.xl-amt--pos]="row.projected > 0"
                  >
                    {{ money(row.projected) }}
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
        [disabled]="busy() || !preview() || preview()!.counts.new === 0"
        (click)="commit()"
      >
        <app-busy-label [busy]="busy()" busyLabel="Cargando…">
          <mat-icon>sync</mat-icon>
          Cargar {{ preview()?.counts?.new ?? 0 }} nuevos
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .xl-stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.5rem;
      }
      .xl-stat {
        display: grid;
        gap: 0.1rem;
        padding: 0.55rem 0.7rem;
        border-radius: 12px;
        border: 1px solid var(--guy-border, #ddd);
      }
      .xl-stat span {
        font-size: 0.75rem;
        color: var(--guy-muted, #667);
      }
      .xl-stat--ok {
        border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 35%, var(--guy-border, #ddd));
      }
      .xl-stat--warn {
        border-color: color-mix(in srgb, #e65100 45%, var(--guy-border, #ddd));
      }
      .xl-block__title {
        margin: 0 0 0.4rem;
        font-size: 0.95rem;
        font-weight: 650;
      }
      .xl-preview {
        overflow: auto;
        max-height: 240px;
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
      }
      .xl-preview__exists {
        opacity: 0.55;
      }
      .xl-amt--neg {
        color: #c62828;
        font-weight: 650;
      }
      .xl-amt--pos {
        color: #2e7d32;
        font-weight: 650;
      }
      @media (min-width: 720px) {
        .xl-stats {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }
    `,
  ],
})
export class ReloadIncomesDialogComponent {
  readonly data = inject<ReloadIncomesDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ReloadIncomesDialogComponent, boolean>);
  private readonly api = inject(ClosingsApiService);
  private readonly snack = inject(MatSnackBar);

  readonly busy = signal(false);
  readonly preview = signal<ReloadIncomesPreview | null>(null);

  constructor() {
    this.load();
  }

  reviewItems(): ReloadIncomeItem[] {
    return (this.preview()?.items ?? []).filter((i) => i.status !== 'exists');
  }

  visibleItems(): ReloadIncomeItem[] {
    return this.reviewItems().slice(0, 80);
  }

  statusLabel(row: ReloadIncomeItem): string {
    if (row.status === 'new') return 'Nuevo';
    if (row.status === 'mismatch') return 'No coincide';
    if (row.status === 'skipped') return 'Sin cuenta';
    return 'Ya está';
  }

  money(n: number): string {
    return `$ ${Number(n || 0).toLocaleString('es-AR')}`;
  }

  load(): void {
    this.busy.set(true);
    this.api.previewReloadIncomes(this.data.shopId).subscribe({
      next: (res) => {
        this.preview.set(res);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'No se pudieron procesar los cierres';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }

  commit(): void {
    if (!this.preview()?.counts.new) return;
    this.busy.set(true);
    this.api.commitReloadIncomes(this.data.shopId).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.snack.open(`Se cargaron ${res.createdCount} ingresos de cierres.`, 'OK', {
          duration: 4500,
        });
        this.ref.close(true);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'No se pudieron cargar los ingresos';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }
}
