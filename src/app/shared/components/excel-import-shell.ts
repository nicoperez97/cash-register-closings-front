import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { BusyLabelComponent } from './busy-label';
import { takeInputFile } from '../utils/input-file';

@Component({
  selector: 'app-excel-import-shell',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ icon() }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ title() }}</strong>
        @if (subtitle()) {
          <span>{{ subtitle() }}</span>
        }
      </span>
    </h2>

    <mat-dialog-content>
      <div class="xl-hint">
        <ng-content select="[hint]" />
      </div>

      <div class="xl-actions mb-3">
        @if (showTemplate()) {
          <button
            mat-stroked-button
            type="button"
            (click)="downloadTemplate.emit()"
            [disabled]="busy()"
          >
            <mat-icon>download</mat-icon>
            {{ templateLabel() }}
          </button>
        }
        <input
          #fileInput
          type="file"
          [accept]="accept()"
          hidden
          (change)="onFile($event)"
        />
        <button
          mat-stroked-button
          type="button"
          (click)="fileInput.click()"
          [disabled]="busy()"
        >
          <mat-icon>attach_file</mat-icon>
          {{ fileName() || pickLabel() }}
        </button>
        <ng-content select="[excelActions]" />
      </div>

      @if (busy()) {
        <mat-progress-bar mode="indeterminate" class="guy-progress mb-3" />
        @if (busyHint()) {
          <p class="text-muted mb-3">{{ busyHint() }}</p>
        }
      }

      <ng-content />
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="cancel.emit()" [disabled]="busy()">
        Cancelar
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="busy() || !canCommit()"
        (click)="commit.emit()"
      >
        <app-busy-label [busy]="busy()" [busyLabel]="busyLabel()">
          <mat-icon>cloud_upload</mat-icon>
          {{ commitLabel() }}
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .xl-hint:empty {
      display: none;
    }
    .xl-hint:not(:empty) {
      margin-bottom: 0.85rem;
    }
    .xl-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    :host ::ng-deep .xl-preview {
      overflow: auto;
      max-height: 360px;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 10px;
    }
    :host ::ng-deep .xl-preview table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    :host ::ng-deep .xl-preview th,
    :host ::ng-deep .xl-preview td {
      padding: 0.45rem 0.6rem;
      text-align: left;
      border-bottom: 1px solid var(--guy-border, #eee);
      white-space: nowrap;
    }
    :host ::ng-deep .xl-preview th {
      position: sticky;
      top: 0;
      background: var(--guy-card, #fff);
      font-weight: 600;
    }
    :host ::ng-deep .xl-preview__exists {
      opacity: 0.55;
    }
    :host ::ng-deep .xl-new-user {
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
})
export class ExcelImportShellComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly icon = input('table_view');
  readonly hint = input('');
  readonly showTemplate = input(true);
  readonly templateLabel = input('Descargar plantilla');
  readonly pickLabel = input('Elegir Excel');
  readonly accept = input(
    '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  readonly busy = input(false);
  readonly busyHint = input('');
  readonly busyLabel = input('Importando…');
  readonly fileName = input('');
  readonly canCommit = input(false);
  readonly commitLabel = input('Confirmar importación');

  readonly downloadTemplate = output<void>();
  readonly fileSelected = output<File>();
  readonly commit = output<void>();
  readonly cancel = output<void>();

  async onFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = await takeInputFile(input);
    if (file) this.fileSelected.emit(file);
  }
}
