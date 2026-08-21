import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { environment } from '../../../environments/environment';
import { usePageRefresh } from '../../core/page-refresh.service';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import {
  EMAIL_MESSAGE_TYPE_OPTIONS,
  EmailMessageTemplates,
} from './email-message-types';
import { AdminMessageDialogComponent } from './admin-message-dialog';

type MessageOption = (typeof EMAIL_MESSAGE_TYPE_OPTIONS)[number];

type MessageRow = {
  option: MessageOption;
  subject: string;
  body: string;
  custom: boolean;
};

@Component({
  selector: 'app-admin-messages',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    PageHeaderComponent,
  ],
  template: `
    <app-page-header
      title="Mensajes"
      [subtitle]="shops.selectedShop()?.name ?? 'Textos de email del local'"
    />

    <p class="msg-hint">
      Tocá un mensaje para editarlo. Reiniciá desde el diálogo para volver al texto original.
    </p>

    @if (loading()) {
      <div class="msg-loading" aria-live="polite">
        <mat-spinner diameter="36"></mat-spinner>
      </div>
    } @else {
      <div class="msg-page">
        <section class="panel-card panel-card--flush">
          <h2 class="msg-section__title">Al comensal</h2>
          <ul class="msg-list">
            @for (row of guestRows(); track row.option.value) {
              <li>
                <button type="button" class="msg-row" (click)="openEdit(row)">
                  <span class="msg-row__text">
                    <span class="msg-row__label">{{ row.option.label }}</span>
                    <span class="msg-row__preview">{{ row.subject }}</span>
                  </span>
                  @if (row.custom) {
                    <span class="msg-row__badge">Editado</span>
                  }
                  <mat-icon class="msg-row__chevron" aria-hidden="true">chevron_right</mat-icon>
                </button>
              </li>
            }
          </ul>
        </section>

        <section class="panel-card panel-card--flush">
          <h2 class="msg-section__title">Al equipo</h2>
          <ul class="msg-list">
            @for (row of staffRows(); track row.option.value) {
              <li>
                <button type="button" class="msg-row" (click)="openEdit(row)">
                  <span class="msg-row__text">
                    <span class="msg-row__label">{{ row.option.label }}</span>
                    <span class="msg-row__preview">{{ row.subject }}</span>
                  </span>
                  @if (row.custom) {
                    <span class="msg-row__badge">Editado</span>
                  }
                  <mat-icon class="msg-row__chevron" aria-hidden="true">chevron_right</mat-icon>
                </button>
              </li>
            }
          </ul>
        </section>
      </div>
    }
  `,
  styles: `
    .msg-hint {
      margin: 0 0 1rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }
    .msg-loading {
      display: grid;
      place-items: center;
      min-height: 8rem;
    }
    .msg-page {
      display: grid;
      gap: 1rem;
    }
    .msg-section__title {
      margin: 0;
      padding: 0.9rem 1rem 0.35rem;
      font-size: 1rem;
      color: var(--guy-navy, #003366);
    }
    .msg-list {
      list-style: none;
      margin: 0;
      padding: 0 0 0.35rem;
    }
    .msg-row {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      width: 100%;
      margin: 0;
      padding: 0.85rem 0.85rem 0.85rem 1rem;
      border: 0;
      border-top: 1px solid var(--guy-border, #e6ebf0);
      background: transparent;
      text-align: left;
      cursor: pointer;
      color: inherit;
      font: inherit;
      -webkit-tap-highlight-color: transparent;
    }
    .msg-row:active {
      background: color-mix(in srgb, var(--guy-navy, #003366) 5%, #fff);
    }
    .msg-row__text {
      flex: 1 1 auto;
      min-width: 0;
      display: grid;
      gap: 0.2rem;
    }
    .msg-row__label {
      font-size: 0.92rem;
      font-weight: 700;
      color: var(--guy-navy, #003366);
    }
    .msg-row__preview {
      font-size: 0.82rem;
      color: var(--guy-muted, #5f6f76);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .msg-row__badge {
      flex-shrink: 0;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      padding: 0.2rem 0.45rem;
      border-radius: 999px;
      color: var(--guy-navy, #003366);
      background: color-mix(in srgb, var(--guy-navy, #003366) 10%, #fff);
    }
    .msg-row__chevron {
      flex-shrink: 0;
      color: var(--guy-muted, #5f6f76);
    }
  `,
})
export class AdminMessagesPage {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  readonly shops = inject(ShopContextService);

  readonly loading = signal(false);
  readonly templates = signal<EmailMessageTemplates>({});

  readonly shopId = computed(() => this.shops.selectedShopId());

  readonly guestRows = computed(() =>
    this.buildRows(EMAIL_MESSAGE_TYPE_OPTIONS.filter((o) => o.group === 'guest')),
  );
  readonly staffRows = computed(() =>
    this.buildRows(EMAIL_MESSAGE_TYPE_OPTIONS.filter((o) => o.group === 'staff')),
  );

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shopId();
      if (!shopId) return;
      this.reload();
    });
  }

  private buildRows(options: MessageOption[]): MessageRow[] {
    const templates = this.templates();
    return options.map((option) => {
      const stored = templates[option.value];
      const storedSubject = String(stored?.subject ?? '').trim();
      const storedBody = String(stored?.body ?? '').trim();
      return {
        option,
        subject: storedSubject || option.defaultSubject,
        body: storedBody || option.defaultBody,
        custom: !!(storedSubject || storedBody),
      };
    });
  }

  reload(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.loading.set(true);
    this.http
      .get<{ emailMessageTemplates?: EmailMessageTemplates | null }>(
        `${environment.apiUrl}/shops/${shopId}`,
      )
      .subscribe({
        next: (shop) => {
          this.loading.set(false);
          const raw = shop.emailMessageTemplates ?? {};
          this.templates.set(raw && typeof raw === 'object' ? { ...raw } : {});
        },
        error: () => {
          this.loading.set(false);
          this.snack.open('No se pudieron cargar los mensajes', 'OK', { duration: 3000 });
        },
      });
  }

  openEdit(row: MessageRow): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.dialogTitle
      .track(
        this.dialog.open(AdminMessageDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          maxHeight: '92vh',
          panelClass: 'guy-dialog',
          autoFocus: 'dialog',
          data: {
            shopId,
            option: row.option,
            subject: row.subject,
            body: row.body,
            templates: { ...this.templates() },
          },
        }),
        row.option.label,
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }
}
