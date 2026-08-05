import { Component, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { appendClosingUnitsAndCarrier } from '../../shared/components/record-share-builders';
import { shareText } from '../../shared/utils/share-text';

export type ClosingSaveSummary = {
  shopName: string;
  date: string;
  pvs: string;
  cash: string;
  accountDni: string;
  posSystem: string;
  total: string;
  unitsLabel?: string | null;
  unitsSold?: number | null;
  cashWithdrawnByName?: string | null;
  /** Texto completo para compartir (incluye todos los datos del cierre). */
  shareTitle?: string;
  shareText?: string;
  /** Tras guardar, dispara el share automáticamente. */
  shareAfterSave?: boolean;
};

export type ClosingSaveDialogData = ClosingSaveSummary & {
  /** Ejecuta el POST de creación. */
  save$: () => Observable<unknown>;
};

export type ClosingSaveDialogResult = 'saved' | 'cancelled';

@Component({
  selector: 'app-closing-save-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatSnackBarModule, BusyLabelComponent],
  template: `
    <h2 mat-dialog-title>
      <span
        class="guy-dialog__title-icon"
        [class.guy-dialog__title-icon--ok]="phase() === 'saved'"
        [class.guy-dialog__title-icon--warn]="phase() === 'error'"
        aria-hidden="true"
      >
        <mat-icon>
          {{
            phase() === 'saved'
              ? 'check_circle'
              : phase() === 'error'
                ? 'error'
                : 'save'
          }}
        </mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>
          @switch (phase()) {
            @case ('saved') {
              Cierre guardado
            }
            @case ('error') {
              No se pudo guardar
            }
            @case ('saving') {
              Guardando cierre…
            }
            @default {
              Confirmar cierre
            }
          }
        </strong>
        <span>
          @switch (phase()) {
            @case ('saved') {
              El cierre de {{ data.shopName }} quedó registrado. Podés compartirlo o cerrar.
            }
            @case ('error') {
              {{ errorMsg() }}
            }
            @case ('saving') {
              Un momento…
            }
            @default {
              Revisá el resumen y confirmá para guardar.
            }
          }
        </span>
      </span>
    </h2>

    <mat-dialog-content>
      <dl class="closing-save-summary">
        <div>
          <dt>Fecha</dt>
          <dd>{{ data.date }}</dd>
        </div>
        <div>
          <dt>PVS</dt>
          <dd>{{ data.pvs }}</dd>
        </div>
        <div>
          <dt>Efectivo</dt>
          <dd>{{ data.cash }}</dd>
        </div>
        <div>
          <dt>Cuenta DNI</dt>
          <dd>{{ data.accountDni }}</dd>
        </div>
        <div>
          <dt>Caja sistema</dt>
          <dd>{{ data.posSystem }}</dd>
        </div>
        <div class="closing-save-summary__total">
          <dt>Total</dt>
          <dd>{{ data.total }}</dd>
        </div>
        @if (data.unitsLabel && data.unitsSold != null) {
          <div>
            <dt>{{ data.unitsLabel }}</dt>
            <dd>{{ data.unitsSold }}</dd>
          </div>
        }
        @if (data.cashWithdrawnByName) {
          <div>
            <dt>Quién se lo lleva</dt>
            <dd>{{ data.cashWithdrawnByName }}</dd>
          </div>
        }
      </dl>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      @if (phase() === 'confirm' || phase() === 'error') {
        <button mat-button type="button" (click)="ref.close('cancelled')" [disabled]="phase() === 'saving'">
          Cancelar
        </button>
        <button mat-flat-button color="primary" type="button" (click)="confirmSave()" [disabled]="phase() === 'saving'">
          <app-busy-label [busy]="phase() === 'saving'" busyLabel="Guardando…">
            <mat-icon>save</mat-icon>
            Guardar
          </app-busy-label>
        </button>
      } @else if (phase() === 'saving') {
        <button mat-flat-button color="primary" type="button" disabled>
          <app-busy-label [busy]="true" busyLabel="Guardando…">
            Guardar
          </app-busy-label>
        </button>
      } @else {
        <button mat-stroked-button type="button" (click)="share()" [disabled]="sharing()">
          <mat-icon>share</mat-icon>
          Compartir
        </button>
        <button mat-flat-button color="primary" type="button" (click)="ref.close('saved')">
          Cerrar
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .closing-save-summary {
      display: grid;
      gap: 0.55rem;
      margin: 0.25rem 0 0;
      padding: 0;
    }
    .closing-save-summary > div {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: baseline;
    }
    .closing-save-summary dt {
      margin: 0;
      font-size: 0.85rem;
      color: var(--guy-muted, #5f6f76);
    }
    .closing-save-summary dd {
      margin: 0;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--guy-navy, #003366);
    }
    .closing-save-summary__total {
      margin-top: 0.35rem;
      padding-top: 0.55rem;
      border-top: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 80%, transparent);
    }
    .closing-save-summary__total dd {
      font-size: 1.05rem;
    }
  `,
})
export class ClosingSaveDialogComponent {
  readonly data = inject<ClosingSaveDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ClosingSaveDialogComponent, ClosingSaveDialogResult>);
  private readonly snack = inject(MatSnackBar);

  readonly phase = signal<'confirm' | 'saving' | 'saved' | 'error'>('confirm');
  readonly errorMsg = signal('Revisá los datos e intentá de nuevo.');
  readonly sharing = signal(false);

  confirmSave(): void {
    this.phase.set('saving');
    this.data.save$().subscribe({
      next: () => {
        this.phase.set('saved');
        if (this.data.shareAfterSave) {
          void this.share();
        }
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        const msg = err?.error?.message ?? 'No se pudo guardar el cierre';
        this.errorMsg.set(Array.isArray(msg) ? msg.join(', ') : String(msg));
        this.phase.set('error');
      },
    });
  }

  async share(): Promise<void> {
    const fallbackLines = [
      `Cierre de caja — ${this.data.shopName}`,
      `Fecha: ${this.data.date}`,
      `PVS: ${this.data.pvs}`,
      `Efectivo: ${this.data.cash}`,
      `Cuenta DNI: ${this.data.accountDni}`,
      `Caja sistema: ${this.data.posSystem}`,
      `Total: ${this.data.total}`,
    ];
    appendClosingUnitsAndCarrier(fallbackLines, {
      unitsLabel: this.data.unitsLabel,
      unitsSold: this.data.unitsSold,
      cashWithdrawnByName: this.data.cashWithdrawnByName,
    });

    this.sharing.set(true);
    const result = await shareText({
      title: this.data.shareTitle || `Cierre ${this.data.shopName}`,
      text: this.data.shareText || fallbackLines.join('\n'),
    });
    this.sharing.set(false);

    if (result === 'copied') {
      this.snack.open('Copiado al portapapeles', 'OK', { duration: 2200 });
    } else if (result === 'failed') {
      this.snack.open('No se pudo compartir', 'OK', { duration: 3000 });
    }
  }
}
