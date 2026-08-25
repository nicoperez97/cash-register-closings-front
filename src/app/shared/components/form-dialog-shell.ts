import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { BusyLabelComponent } from './busy-label';

@Component({
  selector: 'app-form-dialog-shell',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, BusyLabelComponent],
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
        [disabled]="busy() || !canSave()"
        (click)="save.emit()"
      >
        <app-busy-label [busy]="busy()" [busyLabel]="busyLabel()">
          <mat-icon>{{ saveIcon() }}</mat-icon>
          {{ saveLabel() }}
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
})
export class FormDialogShellComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly icon = input('edit');
  readonly busy = input(false);
  readonly canSave = input(true);
  readonly saveLabel = input('Guardar');
  readonly busyLabel = input('Guardando…');
  readonly saveIcon = input('save');

  readonly save = output<void>();
  readonly cancel = output<void>();
}
