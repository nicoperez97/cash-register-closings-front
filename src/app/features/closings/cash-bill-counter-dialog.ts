import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';

/** Billetes en circulación (BCRA) — de mayor a menor uso típico en caja. */
export const ARS_BILL_DENOMS = [20_000, 10_000, 2_000, 1_000, 500, 200, 100, 50, 20, 10] as const;

export type CashBillCounterData = {
  initialTotal?: number | null;
};

export type CashBillCounterResult = {
  total: number;
  counts: Record<number, number>;
  coins: number;
};

function formatDenom(value: number): string {
  return `$ ${value.toLocaleString('es-AR')}`;
}

function formatMoney(value: number): string {
  return `$ ${value.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

@Component({
  selector: 'app-cash-bill-counter-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, FormsModule],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>payments</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Contar billetes</strong>
        <span>Pesos argentinos · suma automática</span>
      </span>
    </h2>

    <mat-dialog-content>
      <div class="bill-counter">
        <div class="bill-counter__total" aria-live="polite">
          <span>Total</span>
          <strong>{{ money(total()) }}</strong>
        </div>

        <div class="bill-counter__list">
          @for (denom of denoms; track denom) {
            <div class="bill-row" [class.bill-row--active]="countOf(denom) > 0">
              <div class="bill-row__denom">
                <span class="bill-row__badge" [attr.data-denom]="denom">{{ labelOf(denom) }}</span>
                <span class="bill-row__sub">{{ money(denom * countOf(denom)) }}</span>
              </div>
              <div class="bill-row__qty">
                <button
                  type="button"
                  class="bill-row__btn"
                  aria-label="Restar"
                  [disabled]="countOf(denom) <= 0"
                  (click)="bump(denom, -1)"
                >
                  <mat-icon>remove</mat-icon>
                </button>
                <input
                  class="bill-row__input"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  step="1"
                  [ngModel]="countOf(denom) || null"
                  (ngModelChange)="setCount(denom, $event)"
                  [attr.aria-label]="'Cantidad de billetes de ' + labelOf(denom)"
                />
                <button
                  type="button"
                  class="bill-row__btn"
                  aria-label="Sumar"
                  (click)="bump(denom, 1)"
                >
                  <mat-icon>add</mat-icon>
                </button>
              </div>
            </div>
          }
        </div>

        <div class="bill-row bill-row--coins">
          <div class="bill-row__denom">
            <span class="bill-row__badge bill-row__badge--coins">Monedas / otros</span>
            <span class="bill-row__sub">Suelto o montos sueltos</span>
          </div>
          <div class="bill-row__coins">
            <span class="bill-row__currency" aria-hidden="true">$</span>
            <input
              class="bill-row__input bill-row__input--money"
              type="number"
              inputmode="decimal"
              min="0"
              step="1"
              [ngModel]="coins() || null"
              (ngModelChange)="setCoins($event)"
              aria-label="Monedas u otros"
            />
          </div>
        </div>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="clear()" [disabled]="total() <= 0">
        Limpiar
      </button>
      <button mat-button type="button" (click)="ref.close()">Cancelar</button>
      <button mat-flat-button color="primary" type="button" (click)="apply()" [disabled]="total() <= 0">
        Usar total
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
        max-height: 100%;
        overflow: hidden;
      }
      mat-dialog-content {
        flex: 1 1 auto;
        min-height: 0;
        max-height: min(70vh, 640px);
        overflow-x: hidden;
        overflow-y: scroll;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        touch-action: pan-y;
      }
      @media (max-width: 960px) {
        mat-dialog-content {
          max-height: calc(100dvh - 56px - 11.5rem);
        }
      }
      mat-dialog-actions {
        flex: 0 0 auto;
      }

      .bill-counter {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding-bottom: 0.25rem;
      }

      .bill-counter__total {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
        border-radius: 14px;
        border: 1px solid color-mix(in srgb, var(--guy-accent, #2e7d32) 28%, var(--guy-border, #d7e0d9));
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--guy-accent, #2e7d32) 12%, #fff) 0%,
          #fff 70%
        );
      }

      .bill-counter__total span {
        font-size: 0.82rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--guy-muted, #5f6f76);
      }

      .bill-counter__total strong {
        font-size: 1.35rem;
        font-variant-numeric: tabular-nums;
        color: var(--guy-accent, #2e7d32);
      }

      .bill-counter__list {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }

      .bill-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 0.65rem;
        align-items: center;
        padding: 0.55rem 0.65rem;
        border-radius: 12px;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: var(--guy-card, #fff);
        transition:
          border-color 0.15s ease,
          background 0.15s ease;
      }

      .bill-row--active {
        border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 40%, var(--guy-border, #d7e0d9));
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 6%, #fff);
      }

      .bill-row__denom {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
      }

      .bill-row__badge {
        display: inline-flex;
        align-items: center;
        width: fit-content;
        padding: 0.15rem 0.55rem;
        border-radius: 999px;
        font-size: 0.88rem;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.01em;
        color: #fff;
        background: #1b2a33;
      }

      .bill-row__badge[data-denom='20000'] {
        background: #1a237e;
      }
      .bill-row__badge[data-denom='10000'] {
        background: #00695c;
      }
      .bill-row__badge[data-denom='2000'] {
        background: #546e7a;
      }
      .bill-row__badge[data-denom='1000'] {
        background: #ef6c00;
      }
      .bill-row__badge[data-denom='500'] {
        background: #2e7d32;
      }
      .bill-row__badge[data-denom='200'] {
        background: #1565c0;
      }
      .bill-row__badge[data-denom='100'] {
        background: #6a1b9a;
      }
      .bill-row__badge[data-denom='50'] {
        background: #00838f;
      }
      .bill-row__badge[data-denom='20'] {
        background: #c62828;
      }
      .bill-row__badge[data-denom='10'] {
        background: #5d4037;
      }

      .bill-row__badge--coins {
        background: color-mix(in srgb, var(--guy-navy, #003366) 72%, #888);
      }

      .bill-row__sub {
        font-size: 0.72rem;
        color: var(--guy-muted, #5f6f76);
        font-variant-numeric: tabular-nums;
      }

      .bill-row__qty {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
      }

      .bill-row__btn {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 10px;
        background: #fff;
        color: var(--guy-navy, #003366);
        cursor: pointer;
        padding: 0;
        -webkit-tap-highlight-color: transparent;
      }

      .bill-row__btn:disabled {
        opacity: 0.35;
        cursor: default;
      }

      .bill-row__btn mat-icon {
        font-size: 1.15rem;
        width: 1.15rem;
        height: 1.15rem;
      }

      .bill-row__input {
        width: 3.25rem;
        height: 40px;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 10px;
        text-align: center;
        font: inherit;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--guy-navy, #003366);
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 70%, #fff);
        outline: none;
      }

      .bill-row__input:focus {
        border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 55%, var(--guy-border));
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--guy-accent, #2e7d32) 16%, transparent);
      }

      .bill-row__input::-webkit-outer-spin-button,
      .bill-row__input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      .bill-row__input[type='number'] {
        -moz-appearance: textfield;
        appearance: textfield;
      }

      .bill-row--coins {
        margin-top: 0.15rem;
      }

      .bill-row__coins {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
      }

      .bill-row__currency {
        font-weight: 700;
        color: var(--guy-muted, #5f6f76);
      }

      .bill-row__input--money {
        width: 6.5rem;
        text-align: right;
        padding-inline: 0.55rem;
      }
    `,
  ],
})
export class CashBillCounterDialogComponent {
  readonly data = inject<CashBillCounterData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  readonly ref = inject(MatDialogRef<CashBillCounterDialogComponent, CashBillCounterResult | undefined>);

  readonly denoms = ARS_BILL_DENOMS;

  private readonly counts = signal<Record<number, number>>(
    Object.fromEntries(ARS_BILL_DENOMS.map((d) => [d, 0])),
  );
  readonly coins = signal(0);

  readonly total = computed(() => {
    let sum = this.coins();
    for (const d of ARS_BILL_DENOMS) {
      sum += d * (this.counts()[d] ?? 0);
    }
    return sum;
  });

  labelOf(denom: number): string {
    return formatDenom(denom);
  }

  money(value: number): string {
    return formatMoney(value);
  }

  countOf(denom: number): number {
    return this.counts()[denom] ?? 0;
  }

  setCount(denom: number, raw: unknown): void {
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    this.counts.update((prev) => ({ ...prev, [denom]: n }));
  }

  bump(denom: number, delta: number): void {
    this.setCount(denom, this.countOf(denom) + delta);
  }

  setCoins(raw: unknown): void {
    const n = Math.max(0, Number(raw) || 0);
    this.coins.set(Number.isFinite(n) ? n : 0);
  }

  clear(): void {
    this.counts.set(Object.fromEntries(ARS_BILL_DENOMS.map((d) => [d, 0])));
    this.coins.set(0);
  }

  apply(): void {
    this.ref.close({
      total: this.total(),
      counts: { ...this.counts() },
      coins: this.coins(),
    });
  }
}
