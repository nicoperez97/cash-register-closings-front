import { Component, Input, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MovementsApiService } from '../../features/movements/movements-api.service';
import { AccountMovementsDialogComponent } from '../../features/movements/account-movements-dialog';
import { DialogTitleService } from '../services/dialog-title.service';
import { ExportMenuComponent, ExportFormat } from './export-menu';
import { downloadTablePdf } from '../pdf/html-pdf';

export interface BalanceAccountRow {
  accountId?: string;
  name: string;
  balance: number;
}

function downloadBlobFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

@Component({
  selector: 'app-balances-table',
  imports: [MatButtonModule, MatIconModule, MatSnackBarModule, MatDialogModule, ExportMenuComponent],
  template: `
    <div class="guy-saldos" role="region" [attr.aria-label]="title">
      @if (showHeader) {
        <header class="guy-saldos__head">
          <div class="guy-saldos__head-main">
            <span class="guy-saldos__badge" aria-hidden="true">
              <mat-icon>account_balance_wallet</mat-icon>
            </span>
            <div>
              <h3 class="guy-saldos__title">{{ title }}</h3>
              @if (subtitle) {
                <p class="guy-saldos__subtitle">{{ subtitle }}</p>
              }
            </div>
          </div>
          <div class="guy-saldos__head-actions">
            @if (shopId) {
              <app-export-menu
                label="Descargar"
                [disabled]="exporting() || !accounts.length"
                [busy]="exporting()"
                (pick)="onExport($event)"
              />
            }
            <div
              class="guy-saldos__total-pill"
              [class.guy-saldos__total-pill--neg]="total < 0"
              [class.guy-saldos__total-pill--pos]="total > 0"
            >
              <span class="guy-saldos__total-label">Total</span>
              <strong class="guy-saldos__total-value">{{ formatMoney(total) }}</strong>
            </div>
          </div>
        </header>
      }

      <div class="guy-saldos__list" role="list">
        @for (row of accounts; track row.name; let i = $index) {
          <div
            class="guy-saldos__row"
            [class.guy-saldos__row--click]="canOpen(row)"
            role="listitem"
            [attr.role]="canOpen(row) ? 'button' : 'listitem'"
            [attr.tabindex]="canOpen(row) ? 0 : null"
            [style.--i]="i"
            (click)="openAccount(row)"
            (keydown.enter)="openAccount(row)"
            (keydown.space)="$event.preventDefault(); openAccount(row)"
          >
            <span
              class="guy-saldos__avatar"
              [attr.data-tone]="avatarTone(row.name)"
              aria-hidden="true"
            >
              {{ initials(row.name) }}
            </span>
            <span class="guy-saldos__name">{{ row.name }}</span>
            <span
              class="guy-saldos__amount"
              [class.guy-saldos__amount--neg]="row.balance < 0"
              [class.guy-saldos__amount--pos]="row.balance > 0"
              [class.guy-saldos__amount--zero]="row.balance === 0"
            >
              {{ formatMoney(row.balance) }}
            </span>
          </div>
        } @empty {
          <div class="guy-saldos__empty">
            <mat-icon>inbox</mat-icon>
            <span>Sin cuentas</span>
          </div>
        }
      </div>

      @if (accounts.length && showFooter) {
        <footer class="guy-saldos__foot">
          <span class="guy-saldos__foot-label">Total</span>
          <strong
            class="guy-saldos__foot-amount"
            [class.guy-saldos__amount--neg]="total < 0"
            [class.guy-saldos__amount--pos]="total > 0"
          >
            {{ formatMoney(total) }}
          </strong>
        </footer>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    .guy-saldos {
      width: 100%;
      background: transparent;
    }

    .guy-saldos__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
      padding: 1rem 1.1rem 0.85rem;
      border-bottom: 1px solid var(--guy-border, #d7e0d9);
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--guy-primary, #1d65a0) 6%, var(--guy-card, #fff)) 0%,
        var(--guy-card, #fff) 100%
      );
    }

    .guy-saldos__head-main {
      display: flex;
      align-items: center;
      gap: 0.7rem;
      min-width: 0;
    }

    .guy-saldos__head-actions {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      flex-wrap: wrap;
      margin-left: auto;
    }

    .guy-saldos__export {
      flex: none;
    }

    .guy-saldos__export mat-icon {
      margin-right: 0.2rem;
      font-size: 1.1rem;
      width: 1.1rem;
      height: 1.1rem;
    }

    .guy-saldos__badge {
      flex: none;
      display: grid;
      place-items: center;
      width: 2.35rem;
      height: 2.35rem;
      border-radius: 0.7rem;
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 14%, transparent);
      color: var(--guy-primary, #1d65a0);
    }

    .guy-saldos__badge mat-icon {
      font-size: 1.25rem;
      width: 1.25rem;
      height: 1.25rem;
    }

    .guy-saldos__title {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--guy-navy-deep, #003366);
      line-height: 1.2;
    }

    .guy-saldos__subtitle {
      margin: 0.15rem 0 0;
      font-size: 0.78rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.3;
    }

    .guy-saldos__total-pill {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.1rem;
      padding: 0.4rem 0.75rem;
      border-radius: 0.65rem;
      background: color-mix(in srgb, var(--guy-muted, #5f6f76) 8%, transparent);
      border: 1px solid var(--guy-border, #d7e0d9);
    }

    .guy-saldos__total-pill--pos {
      background: color-mix(in srgb, #2e7d32 10%, transparent);
      border-color: color-mix(in srgb, #2e7d32 28%, transparent);
    }

    .guy-saldos__total-pill--neg {
      background: color-mix(in srgb, #c62828 10%, transparent);
      border-color: color-mix(in srgb, #c62828 28%, transparent);
    }

    .guy-saldos__total-label {
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
    }

    .guy-saldos__total-value {
      font-size: 1rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
      color: var(--guy-text, #1b2a33);
      line-height: 1.2;
    }

    .guy-saldos__total-pill--pos .guy-saldos__total-value {
      color: #2e7d32;
    }

    .guy-saldos__total-pill--neg .guy-saldos__total-value {
      color: #c62828;
    }

    .guy-saldos__list {
      display: flex;
      flex-direction: column;
    }

    .guy-saldos__row {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 0.7rem;
      padding: 0.65rem 1.1rem;
      border-bottom: 1px solid color-mix(in srgb, var(--guy-border, #d7e0d9) 70%, transparent);
      animation: guy-saldos-in 320ms var(--guy-ease-out, cubic-bezier(0.16, 1, 0.3, 1)) both;
      animation-delay: calc(var(--i, 0) * 18ms);
      transition:
        background var(--guy-dur-fast, 140ms) var(--guy-ease, ease),
        transform var(--guy-dur-fast, 140ms) var(--guy-ease, ease);
    }

    .guy-saldos__row:last-child {
      border-bottom: none;
    }

    .guy-saldos__row:hover {
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 5%, transparent);
    }

    .guy-saldos__row--click {
      cursor: pointer;
    }

    .guy-saldos__row--click:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--guy-primary, #1d65a0) 55%, transparent);
      outline-offset: -2px;
    }

    @keyframes guy-saldos-in {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .guy-saldos__avatar {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border-radius: 0.55rem;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: #fff;
      background: var(--guy-primary, #1d65a0);
      flex: none;
    }

    .guy-saldos__avatar[data-tone='1'] {
      background: #1d65a0;
    }
    .guy-saldos__avatar[data-tone='2'] {
      background: #2e7d32;
    }
    .guy-saldos__avatar[data-tone='3'] {
      background: #f27d16;
    }
    .guy-saldos__avatar[data-tone='4'] {
      background: #6a1b9a;
    }
    .guy-saldos__avatar[data-tone='5'] {
      background: #00838f;
    }
    .guy-saldos__avatar[data-tone='6'] {
      background: #c62828;
    }

    .guy-saldos__name {
      min-width: 0;
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--guy-text, #1b2a33);
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .guy-saldos__amount {
      font-size: 0.9rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      letter-spacing: -0.01em;
      color: var(--guy-text, #1b2a33);
    }

    .guy-saldos__amount--pos {
      color: #2e7d32;
    }

    .guy-saldos__amount--neg {
      color: #c62828;
    }

    .guy-saldos__amount--zero {
      color: var(--guy-muted, #5f6f76);
      font-weight: 500;
    }

    .guy-saldos__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      padding: 2rem 1rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }

    .guy-saldos__empty mat-icon {
      font-size: 1.75rem;
      width: 1.75rem;
      height: 1.75rem;
      opacity: 0.55;
    }

    .guy-saldos__foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.85rem 1.1rem;
      border-top: 1px solid var(--guy-border, #d7e0d9);
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--guy-primary, #1d65a0) 8%, var(--guy-card, #fff)) 0%,
        color-mix(in srgb, var(--guy-primary, #1d65a0) 4%, var(--guy-card, #fff)) 100%
      );
    }

    .guy-saldos__foot-label {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
    }

    .guy-saldos__foot-amount {
      font-size: 1.05rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
      color: var(--guy-navy-deep, #003366);
    }

    :host-context(html[data-theme='dark']) .guy-saldos__title,
    :host-context(html[data-theme='dark']) .guy-saldos__foot-amount {
      color: var(--guy-text);
    }

    :host-context(html[data-theme='dark']) .guy-saldos__amount--pos,
    :host-context(html[data-theme='dark']) .guy-saldos__total-pill--pos .guy-saldos__total-value {
      color: #81c784;
    }

    :host-context(html[data-theme='dark']) .guy-saldos__amount--neg,
    :host-context(html[data-theme='dark']) .guy-saldos__total-pill--neg .guy-saldos__total-value {
      color: #ff8a80;
    }

    @media (prefers-reduced-motion: reduce) {
      .guy-saldos__row {
        animation: none;
      }
    }
  `,
})
export class BalancesTableComponent {
  private readonly api = inject(MovementsApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);

  @Input() title = 'Saldos';
  @Input() subtitle = '';
  @Input() showHeader = true;
  /** Pie con total; en home conviene false si el total ya va en el header. */
  @Input() showFooter = true;
  @Input() accounts: BalanceAccountRow[] = [];
  /** Si hay shopId se muestra el botón de descarga Excel. */
  @Input() shopId: string | null = null;
  @Input() from: string | null = null;
  @Input() to: string | null = null;
  @Input() fileSlug = 'local';

  readonly exporting = signal(false);

  get total(): number {
    return this.accounts.reduce((sum, row) => sum + Number(row.balance ?? 0), 0);
  }

  canOpen(row: BalanceAccountRow): boolean {
    return !!this.shopId && !!row.accountId;
  }

  openAccount(row: BalanceAccountRow): void {
    if (!this.canOpen(row) || !this.shopId || !row.accountId) return;
    this.dialogTitle.track(
      this.dialog.open(AccountMovementsDialogComponent, {
        width: '960px',
        maxWidth: '96vw',
        maxHeight: '92vh',
        panelClass: 'guy-dialog',
        autoFocus: 'first-tabbable',
        data: {
          shopId: this.shopId,
          accountId: row.accountId,
          accountName: row.name,
          from: this.from,
          to: this.to,
        },
      }),
      row.name,
    );
  }

  async onExport(format: ExportFormat): Promise<void> {
    if (format === 'pdf') {
      await downloadTablePdf({
        title: this.title,
        subtitle: this.subtitle,
        filename: `saldos-${this.shopFileSlug(this.fileSlug)}.pdf`,
        headers: ['Cuenta', 'Saldo'],
        rows: this.accounts.map((a) => [a.name, this.formatMoney(a.balance)]),
      });
      return;
    }
    this.exportExcel();
  }

  exportExcel(): void {
    const shopId = this.shopId;
    if (!shopId || this.exporting()) return;
    this.exporting.set(true);
    const from = this.from || undefined;
    const to = this.to || undefined;
    this.api.exportBalancesExcel(shopId, { from, to }).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const stamp = new Date().toISOString().slice(0, 10);
        const range =
          from || to ? `-${from || 'inicio'}_${to || 'hoy'}` : `-${stamp}`;
        downloadBlobFile(blob, `saldos-${this.shopFileSlug(this.fileSlug)}${range}.xlsx`);
      },
      error: () => {
        this.exporting.set(false);
        this.snack.open('No se pudo descargar el Excel de saldos', 'OK', { duration: 3000 });
      },
    });
  }

  private shopFileSlug(name?: string | null): string {
    return (name ?? 'local')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'local';
  }

  formatMoney(value: number): string {
    const n = Number(value ?? 0);
    return `$${n.toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  initials(name: string): string {
    const parts = String(name ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  avatarTone(name: string): string {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 1)) % 6;
    return String(h + 1);
  }
}
