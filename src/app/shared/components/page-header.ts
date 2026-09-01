import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { APP_BRAND } from '../../core/config/app-brand';
import { AuthService } from '../../core/auth/auth.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { hasShopPermission, Permission, canViewClosingsList } from '../../core/auth/auth.models';
import { helpIdFromPath, topicById } from '../../core/help/module-help';
import { HelpDialogComponent } from './help-dialog';
import { DialogTitleService } from '../services/dialog-title.service';
import { ExportMenuComponent, ExportFormat } from './export-menu';

@Component({
  selector: 'app-page-header',
  imports: [MatButtonModule, MatIconModule, MatDialogModule, MatTooltipModule, ExportMenuComponent],
  template: `
    <header class="guy-page-header">
      <div class="guy-page-header__text">
        <div class="guy-page-header__eyebrow">{{ eyebrow || brand.eyebrow }}</div>
        <div class="guy-page-header__title-row">
          <h1>{{ title }}</h1>
          @if (hasHelp()) {
            <button
              type="button"
              class="guy-page-header__info"
              mat-icon-button
              matTooltip="Instrucciones de este módulo"
              aria-label="Instrucciones de este módulo"
              (click)="openHelp()"
            >
              <mat-icon>info_outline</mat-icon>
            </button>
          }
        </div>
        @if (subtitle) {
          <p class="subtitle">{{ subtitle }}</p>
        }
      </div>
      @if (exportMenu && actionLabel) {
        <app-export-menu
          [label]="actionLabel"
          [disabled]="actionDisabled"
          [flat]="true"
          (pick)="exportPick.emit($event)"
        />
      } @else if (actionLabel) {
        <button
          mat-flat-button
          color="primary"
          type="button"
          class="guy-page-header__action"
          [class.guy-page-header__action--large]="actionLarge"
          [disabled]="actionDisabled"
          [attr.aria-label]="actionAriaLabel || actionLabel"
          (click)="action.emit()"
        >
          <mat-icon aria-hidden="true">{{ actionIcon }}</mat-icon>
          {{ actionLabel }}
        </button>
      }
    </header>
  `,
  styleUrl: './page-header.scss',
})
export class PageHeaderComponent {
  readonly brand = APP_BRAND;
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly auth = inject(AuthService);
  private readonly shops = inject(ShopContextService);

  @Input({ required: true }) title!: string;
  @Input() subtitle = '';
  @Input() eyebrow = '';
  /** Si no se indica, se infiere de la URL. */
  @Input() helpId = '';
  @Input() actionLabel = '';
  @Input() actionIcon = 'add';
  @Input() actionAriaLabel = '';
  @Input() actionDisabled = false;
  @Input() actionLarge = false;
  /** Si es true, el botón de acción abre Excel o PDF (ligados). */
  @Input() exportMenu = false;
  @Output() action = new EventEmitter<void>();
  @Output() exportPick = new EventEmitter<ExportFormat>();

  hasHelp(): boolean {
    return !!topicById(this.helpId || helpIdFromPath(this.router.url));
  }

  openHelp(): void {
    const id = this.helpId || helpIdFromPath(this.router.url);
    const topic = topicById(id);
    if (!topic) return;
    const user = this.auth.currentUser();
    const shopId = this.shops.selectedShopId();
    const blocks = topic.blocks.filter((b) => {
      if (!b.anyOf?.length) return true;
      if (topic.id === 'closings' && b.title === 'La lista') {
        return canViewClosingsList(user, shopId);
      }
      return b.anyOf.some((p: Permission) => hasShopPermission(user, shopId, p));
    });
    this.dialogTitle.track(
      this.dialog.open(HelpDialogComponent, {
        width: '640px',
        maxWidth: '96vw',
        panelClass: ['guy-dialog', 'help-dialog-panel'],
        data: { topic, blocks },
      }),
      topic.title,
    );
  }
}
