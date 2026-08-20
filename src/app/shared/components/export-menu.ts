import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

export type ExportFormat = 'xlsx' | 'pdf';

@Component({
  selector: 'app-export-menu',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  template: `
    @if (flat()) {
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="disabled()"
        [matMenuTriggerFor]="menu"
        [attr.aria-label]="label()"
      >
        <mat-icon>download</mat-icon>
        {{ busy() ? 'Descargando…' : label() }}
      </button>
    } @else {
      <button
        mat-stroked-button
        type="button"
        [disabled]="disabled()"
        [matMenuTriggerFor]="menu"
        [attr.aria-label]="label()"
      >
        <mat-icon>download</mat-icon>
        {{ busy() ? 'Descargando…' : label() }}
      </button>
    }
    <mat-menu #menu="matMenu">
      <button mat-menu-item type="button" (click)="pick.emit('xlsx')">
        <mat-icon>grid_on</mat-icon>
        <span>Excel</span>
      </button>
      <button mat-menu-item type="button" (click)="pick.emit('pdf')">
        <mat-icon>picture_as_pdf</mat-icon>
        <span>PDF</span>
      </button>
    </mat-menu>
  `,
})
export class ExportMenuComponent {
  readonly label = input('Descargar');
  readonly disabled = input(false);
  readonly busy = input(false);
  readonly flat = input(false);
  readonly pick = output<ExportFormat>();
}
