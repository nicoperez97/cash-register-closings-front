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
import { EqualizeApplyDialogComponent } from './equalize-apply-dialog';
import {
  EqualizePartnerRow,
  EqualizePreview,
  PartnerSplitsApiService,
} from './partner-splits-api.service';

function money(value: number): string {
  const n = Number(value || 0);
  const abs = Math.abs(n).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${abs}` : `$${abs}`;
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
    <p class="hint">
      El <strong>monto</strong> es la referencia: cada socio apunta a monto × su %. Si uno tiene de
      más y otro de menos, se arman pases. Podés aplicarlos como <strong>pago</strong> o
      <strong>movimiento</strong>.
    </p>

    <div class="toolbar">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="amount-field">
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
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="!canManage() || applying() || !hasTransfers()"
        (click)="openApply()"
      >
        <app-busy-label [busy]="applying()" busyLabel="Aplicando…">Aplicar pases</app-busy-label>
      </button>
    </div>

    @if (proposedHint()) {
      <p class="warn">
        Los socios no tienen % guardados: se proponen partes iguales. Guardá % para fijarlos.
      </p>
    }
    @if (percentSumError()) {
      <p class="warn">{{ percentSumError() }}</p>
    }

    @if (statusBanner(); as banner) {
      <p class="info" [class.info--warn]="banner.warn">{{ banner.text }}</p>
    }

    @if (loading()) {
      <p class="muted">Calculando…</p>
    } @else if (partners().length) {
      <div class="kpis">
        <div>
          <span>Saldos</span>
          <strong>{{ money(preview()?.totals?.balances ?? 0) }}</strong>
        </div>
        <div>
          <span>Objetivos</span>
          <strong>{{ money(preview()?.totals?.targets ?? 0) }}</strong>
        </div>
        <div>
          <span>Sobrante</span>
          <strong>{{ money(preview()?.surplusTotal ?? 0) }}</strong>
        </div>
        <div>
          <span>Pases</span>
          <strong>{{ preview()?.transfers?.length ?? 0 }}</strong>
        </div>
      </div>

      <div class="table-wrap">
        <table class="eq-table">
          <thead>
            <tr>
              <th>Socio</th>
              <th>Saldo</th>
              <th>%</th>
              <th>Objetivo</th>
              <th>Diff</th>
            </tr>
          </thead>
          <tbody>
            @for (row of partners(); track row.accountId) {
              <tr>
                <td>{{ row.name }}</td>
                <td class="num">{{ money(row.current) }}</td>
                <td>
                  <input
                    class="pct-input"
                    type="number"
                    inputmode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    [ngModel]="percentOf(row.accountId)"
                    (ngModelChange)="setPercent(row.accountId, $event)"
                    [disabled]="!canManage()"
                  />
                </td>
                <td class="num">{{ money(row.target) }}</td>
                <td
                  class="num"
                  [class.pos]="row.difference > 0.004"
                  [class.neg]="row.difference < -0.004"
                >
                  {{ diffLabel(row) }}
                </td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td class="num">{{ money(preview()?.totals?.balances ?? 0) }}</td>
              <td class="num">{{ (preview()?.totals?.ownershipSum ?? percentSum()).toFixed(2) }}%</td>
              <td class="num">{{ money(preview()?.totals?.targets ?? 0) }}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section class="transfers">
        <div class="transfers__head">
          <h3>Pases entre socios</h3>
          @if (canManage() && isSurplusOnly() && (preview()?.surplusTotal ?? 0) > 0.004) {
            <button
              mat-stroked-button
              color="primary"
              type="button"
              [disabled]="applying()"
              (click)="sendSurplusToDividends()"
            >
              <mat-icon>savings</mat-icon>
              Enviar sobrante a Dividendos
            </button>
          }
        </div>

        @if (!(preview()?.transfers?.length)) {
          <p class="muted">{{ emptyTransfersMessage() }}</p>
        } @else {
          <ul>
            @for (t of preview()!.transfers; track $index) {
              <li>
                <strong>{{ t.fromName }} → {{ t.toName }}</strong>
                <span>{{ money(t.amount) }}</span>
              </li>
            }
          </ul>
          <p class="tip">
            Tocá <strong>Aplicar pases</strong> y elegí si cada uno es pago o movimiento.
          </p>
        }
      </section>
    } @else if (!loading()) {
      <p class="muted">No hay cuentas de socio en este local.</p>
    }
  `,
  styles: `
    .hint,
    .muted,
    .warn,
    .info,
    .tip {
      margin: 0 0 0.85rem;
      font-size: 0.88rem;
      line-height: 1.4;
    }
    .hint,
    .muted,
    .tip {
      color: var(--guy-muted, #5f6f76);
    }
    .warn,
    .info {
      border-radius: 10px;
      padding: 0.55rem 0.75rem;
    }
    .warn {
      color: #9a3412;
      background: #fff7ed;
      border: 1px solid #fed7aa;
    }
    .info {
      color: #1e3a5f;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
    }
    .info--warn {
      color: #9a3412;
      background: #fff7ed;
      border-color: #fed7aa;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
      align-items: center;
      margin-bottom: 0.85rem;
    }
    .amount-field {
      width: min(100%, 220px);
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
      gap: 0.55rem;
      margin-bottom: 0.85rem;
    }
    .kpis > div {
      padding: 0.55rem 0.7rem;
      border-radius: 12px;
      border: 1px solid var(--guy-border, #e4e0d8);
      background: #fff;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .kpis span {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--guy-muted, #5f6f76);
      font-weight: 650;
    }
    .kpis strong {
      font-variant-numeric: tabular-nums;
      font-size: 0.95rem;
    }
    .table-wrap {
      overflow-x: auto;
      margin-bottom: 1rem;
    }
    .eq-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
    }
    .eq-table th,
    .eq-table td {
      padding: 0.45rem 0.5rem;
      border-bottom: 1px solid var(--guy-border, #e4e0d8);
      text-align: left;
    }
    .eq-table th {
      font-size: 0.75rem;
      color: var(--guy-muted, #5f6f76);
      font-weight: 650;
    }
    .num {
      font-variant-numeric: tabular-nums;
      text-align: right !important;
      white-space: nowrap;
    }
    .pos {
      color: #166534;
    }
    .neg {
      color: #b42318;
    }
    .pct-input {
      width: 4.5rem;
      padding: 0.3rem 0.4rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 8px;
      font: inherit;
      text-align: right;
    }
    .transfers__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.55rem;
      margin-bottom: 0.45rem;
    }
    .transfers h3 {
      margin: 0;
      font-size: 0.95rem;
    }
    .transfers ul {
      list-style: none;
      margin: 0 0 0.55rem;
      padding: 0;
      display: grid;
      gap: 0.4rem;
    }
    .transfers li {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.55rem 0.7rem;
      border: 1px solid var(--guy-border, #e4e0d8);
      border-radius: 10px;
      background: #fff;
    }
    .transfers span {
      font-variant-numeric: tabular-nums;
      font-weight: 650;
    }
  `,
})
export class SplitsEqualizePanelComponent {
  readonly applied = output<void>();

  private readonly shops = inject(ShopContextService);
  private readonly api = inject(PartnerSplitsApiService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirm = inject(ConfirmDialogService);

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
          text: `Todos tienen sobrante (${money(p.surplusTotal ?? 0)}) respecto al objetivo: no hay a quién pasarle entre socios. Subí el monto, o enviá el sobrante a Dividendos.`,
        };
      case 'deficit_only':
        return {
          warn: true,
          text: 'Todos tienen faltante respecto al objetivo: no hay quién ponga entre socios. Bajá el monto o meté plata a las cuentas antes.',
        };
      case 'transfers':
        return {
          warn: false,
          text: `${p.transfers.length} pase(s) por ${money(p.totals.transferAmount)}. Aplicá como pago o movimiento.`,
        };
      case 'balanced':
        return amountOk(p)
          ? { warn: false, text: 'Los saldos ya coinciden con el objetivo (sin pases).' }
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
      this.queuePreview();
    });
  }

  money = money;

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
      return 'Sin pases entre socios: el sobrante no tiene receptor. Usá Enviar sobrante a Dividendos.';
    }
    if (p.transferStatus === 'deficit_only') {
      return 'Sin pases: todos necesitan recibir y nadie tiene de más.';
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

  openApply(): void {
    const shopId = this.shops.selectedShopId();
    const preview = this.preview();
    const amount = Number(this.amount());
    if (!shopId || !preview?.transfers?.length || !this.canManage() || !(amount > 0)) return;
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
              this.applyPreview(res);
              const pays = res.createdPaymentCount ?? 0;
              const movs = res.createdMovementCount ?? 0;
              const bits = [
                pays ? `${pays} pago(s)` : null,
                movs ? `${movs} movimiento(s)` : null,
              ].filter(Boolean);
              this.snack.open(
                bits.length ? `Se generaron ${bits.join(' y ')}` : 'Equilibrado aplicado',
                'OK',
                { duration: 3500 },
              );
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
