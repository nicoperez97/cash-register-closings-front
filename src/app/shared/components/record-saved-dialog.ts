import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { shareText } from '../utils/share-text';

export type RecordSavedField = {
  label: string;
  value: string;
  emphasize?: boolean;
};

export type RecordSavedDialogData = {
  title: string;
  subtitle: string;
  shareTitle: string;
  fields: RecordSavedField[];
  /** Texto completo a compartir. Si no viene, se arma desde fields. */
  shareText?: string;
};

@Component({
  selector: 'app-record-saved-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon guy-dialog__title-icon--ok" aria-hidden="true">
        <mat-icon>check_circle</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ data.title }}</strong>
        <span>{{ data.subtitle }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <dl class="record-saved-summary">
        @for (f of data.fields; track f.label) {
          <div [class.record-saved-summary__total]="f.emphasize">
            <dt>{{ f.label }}</dt>
            <dd>{{ f.value }}</dd>
          </div>
        }
      </dl>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button type="button" (click)="share()" [disabled]="sharing()">
        <mat-icon>share</mat-icon>
        Compartir
      </button>
      <button mat-flat-button color="primary" type="button" (click)="ref.close(true)">
        Cerrar
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .record-saved-summary {
      display: grid;
      gap: 0.55rem;
      margin: 0.25rem 0 0;
      padding: 0;
    }
    .record-saved-summary > div {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: baseline;
    }
    .record-saved-summary dt {
      margin: 0;
      font-size: 0.85rem;
      color: var(--guy-muted, #5f6f76);
    }
    .record-saved-summary dd {
      margin: 0;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--guy-navy, #003366);
      text-align: right;
    }
    .record-saved-summary__total {
      margin-top: 0.35rem;
      padding-top: 0.55rem;
      border-top: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 80%, transparent);
    }
    .record-saved-summary__total dd {
      font-size: 1.05rem;
    }
  `,
})
export class RecordSavedDialogComponent {
  readonly data = inject<RecordSavedDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<RecordSavedDialogComponent, boolean>);
  private readonly snack = inject(MatSnackBar);

  readonly sharing = signal(false);

  async share(): Promise<void> {
    const text =
      this.data.shareText ||
      [this.data.shareTitle, ...this.data.fields.map((f) => `${f.label}: ${f.value}`)].join('\n');

    this.sharing.set(true);
    const result = await shareText({ title: this.data.shareTitle, text });
    this.sharing.set(false);

    if (result === 'copied') {
      this.snack.open('Copiado al portapapeles', 'OK', { duration: 2200 });
    } else if (result === 'failed') {
      this.snack.open('No se pudo compartir en este dispositivo', 'OK', { duration: 3000 });
    }
  }
}
