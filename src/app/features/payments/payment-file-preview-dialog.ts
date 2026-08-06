import { Component, OnDestroy, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export type PaymentFilePreviewData = {
  title: string;
  fileName: string;
  blob: Blob;
};

@Component({
  selector: 'app-payment-file-preview-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isImage() ? 'image' : 'picture_as_pdf' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ data.title }}</strong>
        <span>{{ data.fileName }}</span>
      </span>
    </h2>

    <mat-dialog-content class="preview-body">
      @if (isImage()) {
        <img class="preview-img" [src]="objectUrl()" [alt]="data.fileName" />
      } @else if (isPdf()) {
        <iframe class="preview-frame" [src]="safeUrl()" title="Vista previa"></iframe>
      } @else {
        <div class="preview-fallback">
          <mat-icon>insert_drive_file</mat-icon>
          <p>Este tipo de archivo no se puede previsualizar acá.</p>
          <p class="small">Podés descargarlo para abrirlo.</p>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button type="button" (click)="download()">
        <mat-icon>download</mat-icon>
        Descargar
      </button>
      <button mat-flat-button color="primary" type="button" (click)="ref.close()">
        Cerrar
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .preview-body {
      min-height: min(70vh, 640px);
      max-height: 75vh;
      padding-top: 0.5rem !important;
      display: flex;
      flex-direction: column;
    }
    .preview-img {
      max-width: 100%;
      max-height: 70vh;
      object-fit: contain;
      margin: 0 auto;
      border-radius: 8px;
      background: #f3f5f4;
    }
    .preview-frame {
      flex: 1;
      width: 100%;
      min-height: min(70vh, 640px);
      border: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 90%, transparent);
      border-radius: 8px;
      background: #f8faf9;
    }
    .preview-fallback {
      display: grid;
      place-items: center;
      gap: 0.35rem;
      min-height: 220px;
      color: var(--guy-muted, #5f6f76);
      text-align: center;
    }
    .preview-fallback mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
    }
    .preview-fallback .small {
      margin: 0;
      font-size: 0.85rem;
    }
  `,
})
export class PaymentFilePreviewDialogComponent implements OnDestroy {
  readonly data = inject<PaymentFilePreviewData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<PaymentFilePreviewDialogComponent>);
  private readonly sanitizer = inject(DomSanitizer);

  private readonly url = URL.createObjectURL(this.data.blob);
  readonly objectUrl = signal(this.url);
  readonly safeUrl = signal<SafeResourceUrl>(
    this.sanitizer.bypassSecurityTrustResourceUrl(this.url),
  );

  readonly isImage = signal((this.data.blob.type || '').startsWith('image/'));
  readonly isPdf = signal(
    (this.data.blob.type || '') === 'application/pdf' ||
      /\.pdf$/i.test(this.data.fileName || ''),
  );

  ngOnDestroy(): void {
    URL.revokeObjectURL(this.url);
  }

  download(): void {
    const a = document.createElement('a');
    a.href = this.url;
    a.download = this.data.fileName || 'archivo';
    a.click();
  }
}
