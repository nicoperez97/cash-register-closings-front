import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { HelpBlock, HelpTopic, helpTopicIcon } from '../../core/help/module-help';
import { HelpBlocksComponent } from './help-blocks';

export type HelpDialogData = {
  topic: HelpTopic;
  blocks: HelpBlock[];
};

@Component({
  selector: 'app-help-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, HelpBlocksComponent],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ icon }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ data.topic.title }}</strong>
        <span>{{ data.topic.summary }}</span>
      </span>
    </h2>
    <mat-dialog-content>
      <p class="help-dialog__kicker">Qué podés hacer acá</p>
      <app-help-blocks [blocks]="data.blocks" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" type="button" (click)="ref.close()">Entendido</button>
    </mat-dialog-actions>
  `,
  styles: `
    .help-dialog__kicker {
      margin: 0 0 0.75rem;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
    }
  `,
})
export class HelpDialogComponent {
  readonly data = inject<HelpDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<HelpDialogComponent>);
  readonly icon = helpTopicIcon(this.data.topic.id);
}
