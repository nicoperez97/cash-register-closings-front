import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { takeInputFile, takeInputFiles } from '../../shared/utils/input-file';

export type ClosingStepFileView = {
  key: string;
  name: string;
  savedId?: string;
  pendingId?: string;
};

export function showClosingStepFiles(
  hasAmount: boolean,
  files: ClosingStepFileView[],
): boolean {
  return hasAmount || files.length > 0;
}

export function closingStepFilesMissing(
  requireFiles: boolean,
  hasAmount: boolean,
  files: ClosingStepFileView[],
): boolean {
  return requireFiles && hasAmount && files.length === 0;
}

@Component({
  selector: 'app-closing-form-step-files',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="step-files">
      <div class="step-files__actions">
        <button
          mat-stroked-button
          type="button"
          [disabled]="disabled() || busy()"
          (click)="cameraInput.click()"
        >
          <mat-icon>photo_camera</mat-icon>
          Foto
        </button>
        <button
          mat-stroked-button
          type="button"
          [disabled]="disabled() || busy()"
          (click)="fileInput.click()"
        >
          <mat-icon>upload_file</mat-icon>
          {{ busy() ? 'Leyendo…' : 'Archivo' }}
        </button>
      </div>
      @if (requiredMissing()) {
        <p class="step-files__warn">Falta foto o archivo</p>
      } @else {
        <p class="step-files__hint">Podés adjuntar más de uno.</p>
      }
      <input
        #cameraInput
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        (change)="onPhoto($event)"
      />
      <input
        #fileInput
        type="file"
        accept="image/*,application/pdf,.pdf,.xlsx,.xls,.csv"
        multiple
        hidden
        (change)="onFiles($event)"
      />
      @for (file of files(); track file.key) {
        <div class="step-files__row">
          <button type="button" class="step-files__name" (click)="view.emit(file)">
            <mat-icon>attach_file</mat-icon>
            {{ file.name }}
          </button>
          @if (!disabled()) {
            <button
              mat-icon-button
              type="button"
              aria-label="Quitar archivo"
              (click)="remove.emit(file)"
            >
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .step-files {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .step-files__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
    }
    .step-files__actions button {
      min-height: 36px;
    }
    .step-files__hint {
      margin: 0;
      font-size: 0.72rem;
      color: var(--guy-muted, #5f6f76);
    }
    .step-files__warn {
      margin: 0;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--guy-danger, #b42318);
    }
    .step-files__row {
      display: flex;
      align-items: center;
      gap: 0.15rem;
      min-width: 0;
    }
    .step-files__name {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      min-width: 0;
      margin: 0;
      padding: 0.15rem 0.1rem;
      border: 0;
      background: transparent;
      color: var(--guy-navy, #003366);
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
    }
    .step-files__name mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
      color: var(--guy-muted, #5f6f76);
    }
    .step-files__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .step-files__row button[mat-icon-button] {
      width: 32px;
      height: 32px;
      flex-shrink: 0;
    }
  `,
})
export class ClosingFormStepFilesComponent {
  readonly files = input<ClosingStepFileView[]>([]);
  readonly busy = input(false);
  readonly disabled = input(false);
  readonly requiredMissing = input(false);

  readonly picked = output<File[]>();
  readonly view = output<ClosingStepFileView>();
  readonly remove = output<ClosingStepFileView>();

  async onPhoto(ev: Event): Promise<void> {
    const file = await takeInputFile(ev.target as HTMLInputElement);
    if (file) this.picked.emit([file]);
  }

  async onFiles(ev: Event): Promise<void> {
    const files = await takeInputFiles(ev.target as HTMLInputElement);
    if (files.length) this.picked.emit(files);
  }
}
