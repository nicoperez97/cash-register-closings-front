import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { PaymentsInboxService } from '../payments/payments-inbox.service';
import { EqualizeApplyDialogComponent } from './equalize-apply-dialog';
import { AnalyticsService } from '../../core/analytics/analytics.service';
import { AnalyticsEvents } from '../../core/analytics/analytics.events';
import {
  EqualizePartnerRow,
  EqualizePreview,
  PartnerSplitsApiService,
} from './partner-splits-api.service';
import { formatMoney } from '../../shared/utils/money';

function money(value: number): string {
  return formatMoney(value);
}

function initials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

@Component({
  selector: 'app-splits-equalize-panel',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    BusyLabelComponent,
  ],
  template: `
    <section class="eq">
      <header class="eq-setup panel-card">
        <div class="eq-setup__copy">
          <h2>Equilibrar socios</h2>
          <p>
            Definí el monto de referencia. Cada socio apunta a <strong>monto × su %</strong>. Lo que
            sobra o falta arma pases: al aplicar elegís <strong>pago</strong> o
            <strong>movimiento</strong>. El dinero va a <strong>Dividendos</strong> (plata que ya no
            es del local / personal del socio; anotado para quien faltaba) y
            <strong>no le suma saldo</strong>, así que ese socio puede seguir mostrando Falta.
          </p>
        </div>

        <div class="eq-setup__controls">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="eq-amount">
            <mat-label>Monto a equilibrar</mat-label>
            <span matTextPrefix>$&nbsp;</span>
            <input
              matInput
              type="number"
              inputmode="decimal"
              min="0"
              step="0.01"
              [ngModel]="amount()"
              (ngModelChange)="onAmountChange($event)"
            />
          </mat-form-field>

          <div class="eq-setup__actions">
            <button
              mat-stroked-button
              type="button"
              [disabled]="!canManage() || !partners().length"
              (click)="useTotalBalances()"
            >
              <mat-icon>functions</mat-icon>
              Usar total saldos
            </button>
            <button
              mat-stroked-button
              type="button"
              [disabled]="!canManage() || savingPct() || (!percentDirty() && !proposedHint())"
              (click)="savePercents()"
            >
              <app-busy-label [busy]="savingPct()" busyLabel="Guardando…">Guardar %</app-busy-label>
            </button>
            @if (isSurplusOnly()) {
              <button
                mat-flat-button
                color="primary"
                type="button"
                class="eq-setup__primary"
                [disabled]="!canManage() || applying() || (preview()?.surplusTotal ?? 0) <= 0.004"
                (click)="sendSurplusToDividends()"
              >
                <mat-icon>savings</mat-icon>
                <app-busy-label [busy]="applying()" busyLabel="Enviando…">
                  Enviar sobrante
                </app-busy-label>
              </button>
            } @else if (isBalancedExtractable()) {
              <button
                mat-flat-button
                color="primary"
                type="button"
                class="eq-setup__primary"
                [disabled]="!canManage() || applying()"
                (click)="sendBalancedToDividends()"
              >
                <mat-icon>savings</mat-icon>
                <app-busy-label [busy]="applying()" busyLabel="Enviando…">
                  Enviar a Dividendos
                </app-busy-label>
              </button>
            } @else {
              <button
                mat-flat-button
                color="primary"
                type="button"
                class="eq-setup__primary"
                [disabled]="!canManage() || applying() || !hasTransfers()"
                (click)="applyEqualize()"
              >
                <mat-icon>balance</mat-icon>
                <app-busy-label [busy]="applying()" busyLabel="Aplicando…">
                  Aplicar
                </app-busy-label>
              </button>
            }
          </div>
        </div>
      </header>

      @if (proposedHint() || percentSumError() || statusBanner()) {
        <div class="eq-alerts">
          @if (proposedHint()) {
            <p class="eq-alert eq-alert--warn">
              <mat-icon>percent</mat-icon>
              <span
                >Los socios no tienen % guardados: se proponen partes iguales. Guardá % para
                fijarlos.</span
              >
            </p>
          }
          @if (percentSumError(); as err) {
            <p class="eq-alert eq-alert--warn">
              <mat-icon>error</mat-icon>
              <span>{{ err }}</span>
            </p>
          }
          @if (statusBanner(); as banner) {
            <p class="eq-alert" [class.eq-alert--warn]="banner.warn" [class.eq-alert--ok]="!banner.warn">
              <mat-icon>{{ banner.warn ? 'info' : 'check_circle' }}</mat-icon>
              <span>{{ banner.text }}</span>
            </p>
          }
        </div>
      }

      @if (loading()) {
        <p class="eq-muted">Calculando…</p>
      } @else if (partners().length) {
        <div class="eq-kpis">
          <article class="eq-kpi">
            <span class="eq-kpi__icon" aria-hidden="true"><mat-icon>account_balance_wallet</mat-icon></span>
            <div>
              <span>Saldos</span>
              <strong>{{ money(preview()?.totals?.balances ?? 0) }}</strong>
            </div>
          </article>
          <article class="eq-kpi">
            <span class="eq-kpi__icon" aria-hidden="true"><mat-icon>flag</mat-icon></span>
            <div>
              <span>Objetivos</span>
              <strong>{{ money(preview()?.totals?.targets ?? 0) }}</strong>
            </div>
          </article>
          <article class="eq-kpi" [class.eq-kpi--hot]="(preview()?.surplusTotal ?? 0) > 0.004">
            <span class="eq-kpi__icon" aria-hidden="true"><mat-icon>trending_up</mat-icon></span>
            <div>
              <span>Sobrante</span>
              <strong>{{ money(preview()?.surplusTotal ?? 0) }}</strong>
            </div>
          </article>
          <article class="eq-kpi" [class.eq-kpi--hot]="hasTransfers()">
            <span class="eq-kpi__icon" aria-hidden="true"><mat-icon>swap_horiz</mat-icon></span>
            <div>
              <span>Pases</span>
              <strong>{{ preview()?.transfers?.length ?? 0 }}</strong>
            </div>
          </article>
        </div>

        <section class="eq-partners panel-card panel-card--flush">
          <header class="eq-section-head">
            <div>
              <h3>Socios</h3>
              <p>Editá el % de cada uno. La suma tiene que dar 100.</p>
            </div>
            <span class="eq-pct-sum" [class.eq-pct-sum--bad]="!!percentSumError()">
              {{ (preview()?.totals?.ownershipSum ?? percentSum()).toFixed(2) }}%
            </span>
          </header>

          <div class="eq-partner-list">
            @for (row of partners(); track row.accountId; let i = $index) {
              <article class="eq-partner" [style.--i]="i">
                <span class="eq-partner__avatar" aria-hidden="true">{{ initials(row.name) }}</span>
                <div class="eq-partner__main">
                  <strong>{{ row.name }}</strong>
                  <span class="eq-partner__meta">Saldo {{ money(row.current) }}</span>
                </div>
                <label class="eq-partner__pct">
                  <span>%</span>
                  <input
                    type="number"
                    inputmode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    [ngModel]="percentOf(row.accountId)"
                    (ngModelChange)="setPercent(row.accountId, $event)"
                    [disabled]="!canManage()"
                  />
                </label>
                <div class="eq-partner__target">
                  <span>Objetivo</span>
                  <strong>{{ money(row.target) }}</strong>
                </div>
                <span
                  class="eq-pill"
                  [class.eq-pill--ok]="Math.abs(row.difference) < 0.005"
                  [class.eq-pill--pos]="row.difference > 0.004"
                  [class.eq-pill--neg]="row.difference < -0.004"
                >
                  {{ diffLabel(row) }}
                </span>
              </article>
            }
          </div>

          <footer class="eq-partners__foot">
            <span>Total saldos</span>
            <strong>{{ money(preview()?.totals?.balances ?? 0) }}</strong>
            <span>Total objetivos</span>
            <strong>{{ money(preview()?.totals?.targets ?? 0) }}</strong>
          </footer>
        </section>

        @if (isSurplusOnly() && (preview()?.surplusTotal ?? 0) > 0.004) {
          <section class="eq-cta panel-card">
            <div class="eq-cta__icon" aria-hidden="true">
              <mat-icon>savings</mat-icon>
            </div>
            <div class="eq-cta__copy">
              <h3>Sobrante sin receptor</h3>
              <p>
                Todos están por encima del objetivo ({{ money(preview()?.surplusTotal ?? 0) }}). No
                hay pases entre socios. Podés subir el monto o mandar ese sobrante a Dividendos.
              </p>
            </div>
            @if (canManage()) {
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="applying()"
                (click)="sendSurplusToDividends()"
              >
                <mat-icon>savings</mat-icon>
                <app-busy-label [busy]="applying()" busyLabel="Enviando…">
                  Enviar sobrante a Dividendos
                </app-busy-label>
              </button>
            }
          </section>
        }

        <section class="eq-transfers panel-card">
          <header class="eq-section-head">
            <div>
              <h3>Pases → Dividendos</h3>
              <p>Al aplicar: pago (A socios) o movimiento. Destino Dividendos · no suma saldo al beneficiario.</p>
            </div>
          </header>

          @if (!(preview()?.transfers?.length)) {
            <p class="eq-muted eq-transfers__empty">{{ emptyTransfersMessage() }}</p>
          } @else {
            <ul class="eq-xfer-list">
              @for (t of preview()!.transfers; track $index; let i = $index) {
                <li [style.--i]="i">
                  <span class="eq-xfer__flow" aria-hidden="true">
                    <mat-icon>south_east</mat-icon>
                  </span>
                  <div class="eq-xfer__text">
                    <strong>{{ t.fromName }} → Dividendos</strong>
                    <span>para {{ t.toName }}</span>
                  </div>
                  <strong class="eq-xfer__amt">{{ money(t.amount) }}</strong>
                </li>
              }
            </ul>
            <p class="eq-tip">
              Tocá <strong>Aplicar</strong> arriba y elegí pago o movimiento en cada pase.
            </p>
          }
        </section>
      } @else if (!loading()) {
        <p class="eq-muted">No hay cuentas de socio en este local.</p>
      }
    </section>
  `,
  styles: `
    .eq {
      display: grid;
      gap: 0.9rem;
    }
    .eq-setup {
      padding: 1rem 1.1rem 1.05rem;
      display: grid;
      gap: 0.85rem;
    }
    .eq-setup__copy h2 {
      margin: 0 0 0.3rem;
      font-size: 1.15rem;
      font-weight: 750;
      color: var(--guy-navy, #003366);
    }
    .eq-setup__copy p {
      margin: 0;
      max-width: 52rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
      line-height: 1.45;
    }
    .eq-setup__controls {
      display: grid;
      gap: 0.65rem;
    }
    .eq-amount {
      width: min(100%, 240px);
    }
    .eq-setup__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      align-items: center;
    }
    .eq-setup__primary {
      margin-left: auto;
    }
    @media (max-width: 720px) {
      .eq-setup__primary {
        margin-left: 0;
        width: 100%;
      }
      .eq-setup__actions > button {
        flex: 1 1 auto;
      }
    }

    .eq-alerts {
      display: grid;
      gap: 0.45rem;
    }
    .eq-alert {
      display: flex;
      align-items: flex-start;
      gap: 0.55rem;
      margin: 0;
      padding: 0.65rem 0.8rem;
      border-radius: 12px;
      font-size: 0.88rem;
      line-height: 1.4;
    }
    .eq-alert mat-icon {
      flex-shrink: 0;
      margin-top: 0.05rem;
    }
    .eq-alert--warn {
      color: #9a3412;
      background: #fff7ed;
      border: 1px solid #fed7aa;
    }
    .eq-alert--ok {
      color: #1e3a5f;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
    }

    .eq-muted {
      margin: 0;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }

    .eq-kpis {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.55rem;
    }
    @media (max-width: 900px) {
      .eq-kpis {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    .eq-kpi {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.7rem 0.8rem;
      border-radius: 14px;
      border: 1px solid var(--guy-border, #e4e0d8);
      background: #fff;
      min-width: 0;
    }
    .eq-kpi--hot {
      border-color: color-mix(in srgb, var(--guy-navy, #003366) 28%, #e4e0d8);
      background: color-mix(in srgb, var(--guy-navy, #003366) 5%, #fff);
    }
    .eq-kpi__icon {
      width: 2.2rem;
      height: 2.2rem;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--guy-green, #2e7d32) 12%, transparent);
      color: var(--guy-green, #2e7d32);
      flex-shrink: 0;
    }
    .eq-kpi__icon mat-icon {
      font-size: 1.15rem;
      width: 1.15rem;
      height: 1.15rem;
    }
    .eq-kpi span {
      display: block;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--guy-muted, #5f6f76);
      font-weight: 700;
    }
    .eq-kpi strong {
      display: block;
      margin-top: 0.1rem;
      font-variant-numeric: tabular-nums;
      font-size: 0.95rem;
      line-height: 1.2;
      word-break: break-word;
    }

    .eq-section-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.9rem 1rem 0.55rem;
    }
    .eq-section-head h3 {
      margin: 0 0 0.15rem;
      font-size: 1rem;
      font-weight: 750;
      color: var(--guy-navy, #003366);
    }
    .eq-section-head p {
      margin: 0;
      font-size: 0.82rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.35;
    }
    .eq-pct-sum {
      font-variant-numeric: tabular-nums;
      font-weight: 750;
      font-size: 0.95rem;
      padding: 0.3rem 0.55rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--guy-green, #2e7d32) 12%, #fff);
      color: var(--guy-green, #2e7d32);
    }
    .eq-pct-sum--bad {
      background: #fff1f0;
      color: #b42318;
    }

    .eq-partner-list {
      display: grid;
      gap: 0.45rem;
      padding: 0 0.75rem 0.75rem;
    }
    .eq-partner {
      display: grid;
      grid-template-columns: auto minmax(0, 1.3fr) 5.5rem minmax(6rem, 0.9fr) auto;
      gap: 0.65rem;
      align-items: center;
      padding: 0.7rem 0.75rem;
      border-radius: 14px;
      border: 1px solid var(--guy-border, #e8ebe9);
      background: #fff;
      animation: eq-in 0.28s ease both;
      animation-delay: calc(var(--i, 0) * 35ms);
    }
    @media (max-width: 820px) {
      .eq-partner {
        grid-template-columns: auto minmax(0, 1fr) auto;
        grid-template-areas:
          'av main pill'
          'av pct target';
      }
      .eq-partner__avatar { grid-area: av; align-self: start; }
      .eq-partner__main { grid-area: main; }
      .eq-partner__pct { grid-area: pct; }
      .eq-partner__target { grid-area: target; justify-self: end; text-align: right; }
      .eq-pill { grid-area: pill; }
    }
    .eq-partner__avatar {
      width: 2.35rem;
      height: 2.35rem;
      border-radius: 11px;
      display: grid;
      place-items: center;
      font-size: 0.78rem;
      font-weight: 750;
      letter-spacing: 0.02em;
      background: color-mix(in srgb, var(--guy-navy, #003366) 10%, #fff);
      color: var(--guy-navy, #003366);
    }
    .eq-partner__main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }
    .eq-partner__main strong {
      font-size: 0.95rem;
    }
    .eq-partner__meta {
      font-size: 0.8rem;
      color: var(--guy-muted, #5f6f76);
      font-variant-numeric: tabular-nums;
    }
    .eq-partner__pct {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      margin: 0;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--guy-muted, #5f6f76);
    }
    .eq-partner__pct input {
      width: 4.4rem;
      padding: 0.4rem 0.45rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 10px;
      font: inherit;
      font-weight: 650;
      text-align: right;
      font-variant-numeric: tabular-nums;
      background: #fff;
    }
    .eq-partner__pct input:focus {
      outline: 2px solid color-mix(in srgb, var(--guy-navy, #003366) 35%, transparent);
      outline-offset: 1px;
    }
    .eq-partner__target {
      display: flex;
      flex-direction: column;
      gap: 0.05rem;
      text-align: right;
    }
    .eq-partner__target span {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--guy-muted, #5f6f76);
      font-weight: 700;
    }
    .eq-partner__target strong {
      font-variant-numeric: tabular-nums;
      font-size: 0.9rem;
    }
    .eq-pill {
      justify-self: end;
      padding: 0.28rem 0.55rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      background: #f3f4f6;
      color: #4b5563;
    }
    .eq-pill--ok {
      background: color-mix(in srgb, var(--guy-green, #2e7d32) 14%, #fff);
      color: var(--guy-green, #2e7d32);
    }
    .eq-pill--pos {
      background: #ecfdf3;
      color: #166534;
    }
    .eq-pill--neg {
      background: #fff1f0;
      color: #b42318;
    }
    .eq-partners__foot {
      display: grid;
      grid-template-columns: auto 1fr auto 1fr;
      gap: 0.35rem 0.75rem;
      align-items: center;
      padding: 0.75rem 1rem;
      border-top: 1px solid var(--guy-border, #e8ebe9);
      background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 70%, #fff);
      font-size: 0.85rem;
    }
    .eq-partners__foot span {
      color: var(--guy-muted, #5f6f76);
    }
    .eq-partners__foot strong {
      font-variant-numeric: tabular-nums;
      justify-self: start;
    }

    .eq-cta {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 0.85rem;
      align-items: center;
      padding: 1rem 1.1rem;
      border: 1px solid color-mix(in srgb, var(--guy-navy, #003366) 22%, #e4e0d8);
      background:
        linear-gradient(
          135deg,
          color-mix(in srgb, var(--guy-navy, #003366) 6%, #fff),
          #fff 55%
        );
    }
    @media (max-width: 720px) {
      .eq-cta {
        grid-template-columns: auto minmax(0, 1fr);
      }
      .eq-cta > button {
        grid-column: 1 / -1;
        width: 100%;
      }
    }
    .eq-cta__icon {
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 14px;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--guy-navy, #003366) 12%, #fff);
      color: var(--guy-navy, #003366);
    }
    .eq-cta__copy h3 {
      margin: 0 0 0.2rem;
      font-size: 1rem;
      color: var(--guy-navy, #003366);
    }
    .eq-cta__copy p {
      margin: 0;
      font-size: 0.86rem;
      line-height: 1.4;
      color: var(--guy-muted, #5f6f76);
    }

    .eq-transfers {
      padding-bottom: 0.85rem;
    }
    .eq-transfers__empty {
      padding: 0 1rem 0.35rem;
    }
    .eq-xfer-list {
      list-style: none;
      margin: 0;
      padding: 0 0.75rem;
      display: grid;
      gap: 0.45rem;
    }
    .eq-xfer-list li {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 0.65rem;
      align-items: center;
      padding: 0.7rem 0.8rem;
      border-radius: 12px;
      border: 1px solid var(--guy-border, #e8ebe9);
      background: #fff;
      animation: eq-in 0.28s ease both;
      animation-delay: calc(var(--i, 0) * 40ms);
    }
    .eq-xfer__flow {
      width: 2rem;
      height: 2rem;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: color-mix(in srgb, var(--guy-green, #2e7d32) 12%, #fff);
      color: var(--guy-green, #2e7d32);
    }
    .eq-xfer__flow mat-icon {
      font-size: 1.1rem;
      width: 1.1rem;
      height: 1.1rem;
    }
    .eq-xfer__text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }
    .eq-xfer__text strong {
      font-size: 0.92rem;
    }
    .eq-xfer__text span {
      font-size: 0.8rem;
      color: var(--guy-muted, #5f6f76);
    }
    .eq-xfer__amt {
      font-variant-numeric: tabular-nums;
      font-size: 0.95rem;
      color: var(--guy-navy, #003366);
    }
    .eq-tip {
      margin: 0.65rem 1rem 0;
      font-size: 0.84rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.4;
    }

    @keyframes eq-in {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
  `,
})
export class SplitsEqualizePanelComponent {
  readonly applied = output<void>();
  readonly Math = Math;

  private readonly shops = inject(ShopContextService);
  private readonly api = inject(PartnerSplitsApiService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly paymentsInbox = inject(PaymentsInboxService);
  private readonly analytics = inject(AnalyticsService);

  readonly canManage = () => this.auth.hasPermission('partnerSplits.manage');

  readonly amount = signal<number | null>(null);
  readonly loading = signal(false);
  readonly savingPct = signal(false);
  readonly applying = signal(false);
  readonly preview = signal<EqualizePreview | null>(null);
  readonly partners = signal<EqualizePartnerRow[]>([]);
  readonly percentEdits = signal<Record<string, number>>({});
  readonly percentDirty = signal(false);
  readonly proposedHint = signal(false);
  readonly percentSumError = signal<string | null>(null);

  private previewTimer: ReturnType<typeof setTimeout> | null = null;

  readonly statusBanner = computed(() => {
    const p = this.preview();
    if (!p) return null;
    switch (p.transferStatus) {
      case 'need_amount':
        return {
          warn: false,
          text: 'Ingresá un monto (o Usar total saldos) para calcular objetivos y pases.',
        };
      case 'surplus_only':
        return {
          warn: true,
          text: `Todos tienen sobrante (${money(p.surplusTotal ?? 0)}) y nadie falta: no hay pases. Subí el monto (o Usar total saldos) para armar pases, o enviá el sobrante a Dividendos.`,
        };
      case 'deficit_only':
        return {
          warn: true,
          text:
            'Hay faltante y nadie con sobrante entre socios. Con Dividendos la plata no entra al saldo de quien falta: bajá el monto de referencia, o cargá saldo en esa cuenta.',
        };
      case 'transfers':
        return {
          warn: false,
          text: `${p.transfers.length} pase(s) por ${money(p.totals.transferAmount)}. Van a Dividendos (anotados para quien falta; no le suman saldo).`,
        };
      case 'balanced':
        return amountOk(p)
          ? {
              warn: false,
              text:
                'Los saldos ya coinciden con el objetivo. Podés enviar esa división a Dividendos: baja de cada socio y sale del pool del local (no aparece en Saldos).',
            }
          : null;
      default:
        return null;
    }
  });

  constructor() {
    effect(() => {
      const shopId = this.shops.selectedShopId();
      this.amount();
      this.percentDirty();
      if (!shopId) {
        this.preview.set(null);
        this.partners.set([]);
        return;
      }
      this.queuePreview(this.percentDirty());
    });
  }

  money = money;
  initials = initials;

  percentOf(accountId: string): number {
    const edits = this.percentEdits();
    if (accountId in edits) return edits[accountId];
    return this.partners().find((p) => p.accountId === accountId)?.ownershipPercent ?? 0;
  }

  percentSum(): number {
    return (
      Math.round(this.partners().reduce((s, p) => s + this.percentOf(p.accountId), 0) * 100) / 100
    );
  }

  hasTransfers(): boolean {
    return (this.preview()?.transfers?.length ?? 0) > 0;
  }

  isSurplusOnly(): boolean {
    return this.preview()?.transferStatus === 'surplus_only';
  }

  /** Ya están en el objetivo y hay saldo para sacar a Dividendos. */
  isBalancedExtractable(): boolean {
    const p = this.preview();
    if (!p || p.transferStatus !== 'balanced' || !amountOk(p)) return false;
    return (p.totals?.balances ?? 0) > 0.004;
  }

  diffLabel(row: EqualizePartnerRow): string {
    const d = Number(row.difference || 0);
    if (Math.abs(d) < 0.005) return 'OK';
    return d < 0 ? `Sobra ${money(-d)}` : `Falta ${money(d)}`;
  }

  emptyTransfersMessage(): string {
    const p = this.preview();
    if (!p || p.transferStatus === 'need_amount') {
      return 'Falta monto o %.';
    }
    if (p.transferStatus === 'surplus_only') {
      return 'Sin pases entre socios: usá el bloque de sobrante de arriba.';
    }
    if (p.transferStatus === 'deficit_only') {
      return 'Sin pases: hay faltante y nadie con sobrante. Con Dividendos no se completa el saldo de quien falta.';
    }
    if (p.transferStatus === 'balanced') {
      return 'Sin pases: ya están en el objetivo. Usá Enviar a Dividendos para sacar esa división de los saldos.';
    }
    return 'Sin pases: ya están en el objetivo.';
  }

  setPercent(accountId: string, raw: number | string): void {
    const v = Math.max(0, Math.min(100, Number(raw) || 0));
    this.percentEdits.update((m) => ({ ...m, [accountId]: Math.round(v * 100) / 100 }));
    this.percentDirty.set(true);
    this.validateLocalPercents();
    this.queuePreview(true);
  }

  onAmountChange(raw: number | string | null): void {
    const n = raw === null || raw === '' ? null : Number(raw);
    this.amount.set(n !== null && Number.isFinite(n) ? n : null);
  }

  useTotalBalances(): void {
    const total = Number(this.preview()?.totals?.balances ?? 0);
    if (!(total > 0)) {
      this.snack.open('No hay saldos para usar', 'OK', { duration: 3000 });
      return;
    }
    this.amount.set(Math.round(total * 100) / 100);
  }

  savePercents(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage()) return;
    const err = this.validateLocalPercents();
    if (err) {
      this.snack.open(err, 'OK', { duration: 3500 });
      return;
    }
    const items = this.partners().map((p) => ({
      accountId: p.accountId,
      ownershipPercent: this.percentOf(p.accountId),
    }));
    this.savingPct.set(true);
    this.api.saveOwnership(shopId, items).subscribe({
      next: () => {
        this.savingPct.set(false);
        this.percentDirty.set(false);
        this.proposedHint.set(false);
        this.snack.open('% guardados', 'OK', { duration: 2500 });
        this.runPreview();
      },
      error: (err) => {
        this.savingPct.set(false);
        const msg = err?.error?.message ?? 'No se pudieron guardar los %';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  applyEqualize(): void {
    const shopId = this.shops.selectedShopId();
    const preview = this.preview();
    const amount = Number(this.amount());
    const count = preview?.transfers?.length ?? 0;
    if (!shopId || !preview || !count || !this.canManage() || !(amount > 0)) return;
    if (this.percentDirty()) {
      this.snack.open('Guardá los % antes de aplicar', 'OK', { duration: 3500 });
      return;
    }
    this.dialogTitle
      .track(
        this.dialog.open(EqualizeApplyDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { preview },
        }),
        'Aplicar equilibrado',
      )
      .afterClosed()
      .subscribe((result) => {
        if (!result?.transferActions?.length) return;
        this.applying.set(true);
        this.api
          .equalizeApply(shopId, {
            amount,
            partnerAccountIds: this.partners().map((p) => p.accountId),
            transferActions: result.transferActions,
          })
          .subscribe({
            next: (res) => {
              this.applying.set(false);
              if (typeof res.amount === 'number' && Number.isFinite(res.amount)) {
                this.amount.set(res.amount);
              }
              this.applyPreview(res);
              const pays = res.createdPaymentCount ?? 0;
              const movs = res.createdMovementCount ?? 0;
              const bits = [
                pays ? `${pays} pago(s)` : null,
                movs ? `${movs} movimiento(s)` : null,
              ].filter(Boolean);
              this.snack.open(
                bits.length
                  ? `${bits.join(' y ')} a Dividendos. Quien faltaba no recibe saldo (solo queda anotado).`
                  : 'Equilibrado aplicado',
                'OK',
                { duration: 4500 },
              );
              if (pays) this.paymentsInbox.refresh();
              this.analytics.event(AnalyticsEvents.equalizeApplied, {
                amount,
                payments_created: pays,
                movements_created: movs,
              });
              this.applied.emit();
            },
            error: (err) => {
              this.applying.set(false);
              const msg = err?.error?.message ?? 'No se pudo aplicar';
              this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
            },
          });
      });
  }

  async sendSurplusToDividends(): Promise<void> {
    const shopId = this.shops.selectedShopId();
    const amount = Number(this.amount());
    const surplus = Number(this.preview()?.surplusTotal ?? 0);
    if (!shopId || !this.canManage() || !(amount > 0) || !(surplus > 0.004)) return;
    if (this.percentDirty()) {
      this.snack.open('Guardá los % antes de enviar', 'OK', { duration: 3500 });
      return;
    }
    const ok = await this.confirm.confirm(
      'Enviar sobrante a Dividendos',
      `Se van a crear movimientos desde cada socio con sobrante hacia Dividendos (total ${money(surplus)}). No suma saldo a otro socio.`,
      { confirmLabel: 'Enviar', cancelLabel: 'Cancelar', confirmColor: 'primary', icon: 'savings' },
    );
    if (!ok) return;
    this.applying.set(true);
    this.api
      .equalizeApply(shopId, {
        amount,
        partnerAccountIds: this.partners().map((p) => p.accountId),
        sendSurplusToDividends: true,
      })
      .subscribe({
        next: (res) => {
          this.applying.set(false);
          this.applyPreview(res);
          this.snack.open(
            `Se enviaron ${res.createdMovementCount ?? res.createdCount ?? 0} movimiento(s) a Dividendos`,
            'OK',
            { duration: 3500 },
          );
          this.analytics.event(AnalyticsEvents.surplusToDividends, {
            amount,
            movements_created: res.createdMovementCount ?? res.createdCount ?? 0,
          });
          this.applied.emit();
        },
        error: (err) => {
          this.applying.set(false);
          const msg = err?.error?.message ?? 'No se pudo enviar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }

  async sendBalancedToDividends(): Promise<void> {
    const shopId = this.shops.selectedShopId();
    const amount = Number(this.amount());
    const total = Number(this.preview()?.totals?.balances ?? 0);
    if (!shopId || !this.canManage() || !(amount > 0) || !this.isBalancedExtractable()) return;
    if (this.percentDirty()) {
      this.snack.open('Guardá los % antes de enviar', 'OK', { duration: 3500 });
      return;
    }
    const ok = await this.confirm.confirm(
      'Enviar división a Dividendos',
      `Los saldos ya están en el objetivo. Se va a enviar el saldo de cada socio a Dividendos (total ${money(total)}): baja de sus cuentas y sale del pool del local (no aparece en Saldos).`,
      {
        confirmLabel: 'Enviar',
        cancelLabel: 'Cancelar',
        confirmColor: 'primary',
        icon: 'savings',
      },
    );
    if (!ok) return;
    this.applying.set(true);
    this.api
      .equalizeApply(shopId, {
        amount,
        partnerAccountIds: this.partners().map((p) => p.accountId),
        sendBalancedToDividends: true,
      })
      .subscribe({
        next: (res) => {
          this.applying.set(false);
          const left = Number(res.totals?.balances ?? 0);
          this.amount.set(left > 0.004 ? left : null);
          this.applyPreview(
            left > 0.004
              ? res
              : {
                  ...res,
                  amount: 0,
                  transferStatus: 'need_amount',
                  partners: (res.partners ?? []).map((p) => ({
                    ...p,
                    target: 0,
                    difference: 0,
                  })),
                  totals: {
                    ...res.totals,
                    amount: 0,
                    targets: 0,
                    differences: 0,
                    transferCount: 0,
                    transferAmount: 0,
                  },
                },
          );
          this.snack.open(
            `Se enviaron ${res.createdMovementCount ?? res.createdCount ?? 0} movimiento(s) a Dividendos · saldos de socios en cero`,
            'OK',
            { duration: 4500 },
          );
          this.analytics.event(AnalyticsEvents.balancedToDividends, {
            amount: total,
            movements_created: res.createdMovementCount ?? res.createdCount ?? 0,
          });
          this.applied.emit();
        },
        error: (err) => {
          this.applying.set(false);
          const msg = err?.error?.message ?? 'No se pudo enviar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }

  private validateLocalPercents(): string | null {
    if (!this.partners().length) {
      this.percentSumError.set(null);
      return null;
    }
    const sum = this.percentSum();
    if (Math.abs(sum - 100) > 0.01) {
      const msg = `Los % deben sumar 100 (ahora ${sum.toFixed(2)})`;
      this.percentSumError.set(msg);
      return msg;
    }
    this.percentSumError.set(null);
    return null;
  }

  private queuePreview(forceLocal = false): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.runPreview(forceLocal), 320);
  }

  private runPreview(useLocalPercents = false): void {
    const shopId = this.shops.selectedShopId();
    const amount = Math.max(0, Number(this.amount() ?? 0));
    if (!shopId) {
      this.preview.set(null);
      this.partners.set([]);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.equalizePreview(shopId, { amount }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (useLocalPercents && this.percentDirty()) {
          this.applyLocalTargets(res, amount);
        } else {
          this.applyPreview(res);
        }
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err?.error?.message ?? 'No se pudo calcular';
        this.percentSumError.set(Array.isArray(msg) ? msg.join(', ') : String(msg));
        this.preview.set(null);
      },
    });
  }

  private applyPreview(res: EqualizePreview): void {
    this.preview.set(res);
    this.partners.set(res.partners);
    this.proposedHint.set(!!res.proposedEqualPercents);
    if (!this.percentDirty()) {
      const next: Record<string, number> = {};
      for (const p of res.partners) next[p.accountId] = p.ownershipPercent;
      this.percentEdits.set(next);
    }
    this.validateLocalPercents();
  }

  private applyLocalTargets(base: EqualizePreview, amount: number): void {
    const err = this.validateLocalPercents();
    const rowsBase = base.partners.map((p) => ({
      ...p,
      ownershipPercent: this.percentOf(p.accountId),
    }));
    if (err) {
      this.preview.set(null);
      this.partners.set(
        rowsBase.map((p) => ({
          ...p,
          target: 0,
          difference: 0,
        })),
      );
      return;
    }
    const rows = rowsBase.map((p) => {
      const target = Math.round(((amount * p.ownershipPercent) / 100) * 100) / 100;
      return {
        ...p,
        proposedPercent: false,
        target,
        difference: Math.round((target - p.current) * 100) / 100,
      };
    });
    const drift = Math.round((amount - rows.reduce((s, r) => s + r.target, 0)) * 100) / 100;
    if (rows.length && Math.abs(drift) >= 0.01) {
      const last = rows[rows.length - 1];
      last.target = Math.round((last.target + drift) * 100) / 100;
      last.difference = Math.round((last.target - last.current) * 100) / 100;
    }
    const payers = rows
      .filter((r) => r.difference < -0.004)
      .map((r) => ({ ...r, left: -r.difference }));
    const receivers = rows
      .filter((r) => r.difference > 0.004)
      .map((r) => ({ ...r, left: r.difference }));
    const transfers: EqualizePreview['transfers'] = [];
    let i = 0;
    let j = 0;
    while (i < payers.length && j < receivers.length) {
      const from = payers[i];
      const to = receivers[j];
      const amt = Math.round(Math.min(from.left, to.left) * 100) / 100;
      if (amt > 0.004) {
        transfers.push({
          fromAccountId: from.accountId,
          fromName: from.name,
          toAccountId: to.accountId,
          toName: to.name,
          amount: amt,
        });
        from.left = Math.round((from.left - amt) * 100) / 100;
        to.left = Math.round((to.left - amt) * 100) / 100;
      }
      if (from.left <= 0.004) i += 1;
      if (to.left <= 0.004) j += 1;
    }
    const surplusTotal =
      Math.round(
        rows.filter((r) => r.difference < -0.004).reduce((s, r) => s + -r.difference, 0) * 100,
      ) / 100;
    const deficitTotal =
      Math.round(
        rows.filter((r) => r.difference > 0.004).reduce((s, r) => s + r.difference, 0) * 100,
      ) / 100;
    let transferStatus: EqualizePreview['transferStatus'] = 'balanced';
    if (!(amount > 0)) transferStatus = 'need_amount';
    else if (transfers.length) transferStatus = 'transfers';
    else if (surplusTotal > 0.004 && deficitTotal < 0.004) transferStatus = 'surplus_only';
    else if (deficitTotal > 0.004 && surplusTotal < 0.004) transferStatus = 'deficit_only';

    this.partners.set(rows);
    this.preview.set({
      kind: 'equalize',
      amount,
      partners: rows,
      totals: {
        amount,
        ownershipSum: this.percentSum(),
        balances: Math.round(rows.reduce((s, r) => s + r.current, 0) * 100) / 100,
        targets: Math.round(rows.reduce((s, r) => s + r.target, 0) * 100) / 100,
        differences: Math.round(rows.reduce((s, r) => s + r.difference, 0) * 100) / 100,
        transferCount: transfers.length,
        transferAmount: Math.round(transfers.reduce((s, t) => s + t.amount, 0) * 100) / 100,
      },
      transfers,
      surplusTotal,
      deficitTotal,
      transferStatus,
      proposedEqualPercents: false,
    });
  }
}

function amountOk(p: EqualizePreview): boolean {
  return Number(p.amount) > 0;
}
