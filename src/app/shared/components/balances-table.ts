import { Component, Input } from '@angular/core';

export interface BalanceAccountRow {
  name: string;
  balance: number;
}

@Component({
  selector: 'app-balances-table',
  template: `
    <div class="guy-saldos" role="region" [attr.aria-label]="title">
      <div class="guy-saldos__banner">{{ title }}</div>
      <table class="guy-saldos__table">
        <thead>
          <tr>
            <th scope="col">Cuenta</th>
            <th scope="col" class="guy-saldos__col-saldo">Saldo</th>
          </tr>
        </thead>
        <tbody>
          @for (row of accounts; track row.name) {
            <tr>
              <td>{{ row.name }}</td>
              <td
                class="guy-saldos__amount"
                [class.guy-saldos__amount--neg]="row.balance < 0"
              >
                {{ formatMoney(row.balance) }}
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="2" class="guy-saldos__empty">Sin cuentas</td>
            </tr>
          }
        </tbody>
        @if (accounts.length) {
          <tfoot>
            <tr>
              <td>TOTAL</td>
              <td
                class="guy-saldos__amount"
                [class.guy-saldos__amount--neg]="total < 0"
              >
                {{ formatMoney(total) }}
              </td>
            </tr>
          </tfoot>
        }
      </table>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    .guy-saldos {
      width: 100%;
      overflow: hidden;
      background: transparent;
    }

    .guy-saldos__banner {
      padding: 0.75rem 1rem;
      text-align: center;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #fff;
      background: linear-gradient(
        135deg,
        var(--guy-navy-deep) 0%,
        var(--guy-primary) 100%
      );
    }

    .guy-saldos__table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      color: var(--guy-text);
    }

    .guy-saldos__table th,
    .guy-saldos__table td {
      padding: 0.55rem 0.85rem;
      border-bottom: 1px solid var(--guy-table-cell-border);
      line-height: 1.35;
      vertical-align: middle;
    }

    .guy-saldos__table thead th {
      background: var(--guy-table-header-bg);
      color: var(--guy-muted);
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-align: left;
    }

    .guy-saldos__col-saldo {
      text-align: right !important;
      min-width: 7.5rem;
    }

    .guy-saldos__table tbody tr:nth-child(even) {
      background: var(--guy-table-row-even);
    }

    .guy-saldos__table tbody tr:hover {
      background: color-mix(in srgb, var(--guy-primary) 6%, transparent);
    }

    .guy-saldos__amount {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      font-weight: 500;
      color: var(--guy-text);
    }

    .guy-saldos__amount--neg {
      color: #c0392b;
    }

    .guy-saldos__empty {
      text-align: center;
      color: var(--guy-muted);
      font-style: italic;
      padding: 1.25rem 0.85rem !important;
    }

    .guy-saldos__table tfoot td {
      border-bottom: none;
      border-top: 1px solid var(--guy-border);
      background: color-mix(in srgb, var(--guy-primary) 7%, var(--guy-card));
      font-weight: 700;
      color: var(--guy-navy-deep);
      padding-top: 0.7rem;
      padding-bottom: 0.7rem;
    }

    :host-context(html[data-theme='dark']) .guy-saldos__table tfoot td {
      color: var(--guy-text);
    }

    :host-context(html[data-theme='dark']) .guy-saldos__amount--neg {
      color: #ff8a80;
    }
  `,
})
export class BalancesTableComponent {
  @Input() title = 'Saldos';
  @Input() accounts: BalanceAccountRow[] = [];

  get total(): number {
    return this.accounts.reduce((sum, row) => sum + Number(row.balance ?? 0), 0);
  }

  formatMoney(value: number): string {
    const n = Number(value ?? 0);
    return `$${n.toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}
