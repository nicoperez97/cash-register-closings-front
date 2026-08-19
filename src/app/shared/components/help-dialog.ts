import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { HelpBlock, HelpTopic } from '../../core/help/module-help';

export type HelpDialogData = {
  topic: HelpTopic;
  blocks: HelpBlock[];
};

@Component({
  selector: 'app-help-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>info</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ data.topic.title }}</strong>
        <span>{{ data.topic.summary }}</span>
      </span>
    </h2>
    <mat-dialog-content>
      @if (!data.blocks.length) {
        <p class="help-empty">No tenés acceso a las funciones de este módulo.</p>
      } @else {
        @for (b of data.blocks; track b.title) {
          <section class="help-block">
            <h3>{{ b.title }}</h3>
            <p>{{ b.body }}</p>
          </section>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" type="button" (click)="ref.close()">Entendido</button>
    </mat-dialog-actions>
  `,
  styles: `
    .help-block {
      margin: 0 0 1rem;
    }
    .help-block h3 {
      margin: 0 0 0.35rem;
      font-size: 0.95rem;
      color: var(--guy-navy, #003366);
    }
    .help-block p,
    .help-empty {
      margin: 0;
      color: var(--guy-text, #1b2a33);
      line-height: 1.5;
      font-size: 0.92rem;
    }
  `,
})
export class HelpDialogComponent {
  readonly data = inject<HelpDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<HelpDialogComponent>);
}
