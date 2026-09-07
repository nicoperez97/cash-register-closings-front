import { Component, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AnalyticsService } from '../../core/analytics/analytics.service';
import { AnalyticsEvents } from '../../core/analytics/analytics.events';
import { helpIdFromPath } from '../../core/help/module-help';

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
      <button mat-menu-item type="button" (click)="emitPick('xlsx')">
        <mat-icon>grid_on</mat-icon>
        <span>Excel</span>
      </button>
      <button mat-menu-item type="button" (click)="emitPick('pdf')">
        <mat-icon>picture_as_pdf</mat-icon>
        <span>PDF</span>
      </button>
    </mat-menu>
  `,
})
export class ExportMenuComponent {
  private readonly analytics = inject(AnalyticsService);
  private readonly router = inject(Router);

  readonly label = input('Descargar');
  readonly disabled = input(false);
  readonly busy = input(false);
  readonly flat = input(false);
  readonly module = input('');
  readonly pick = output<ExportFormat>();

  emitPick(format: ExportFormat): void {
    this.analytics.event(AnalyticsEvents.exportDownloaded, {
      format,
      module: this.module() || helpIdFromPath(this.router.url) || 'unknown',
    });
    this.pick.emit(format);
  }
}
