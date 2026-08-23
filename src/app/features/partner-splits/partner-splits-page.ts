import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { LoadingStateComponent } from '../../shared/components/loading-state';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { usePageRefresh } from '../../core/page-refresh.service';
import { AccountMovementsDialogComponent } from '../movements/account-movements-dialog';
import {
  PartnerSplitConfig,
  PartnerSplitPreview,
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
  selector: 'app-partner-splits-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatSnackBarModule,
    PageHeaderComponent,
    LoadingStateComponent,
  ],
  template: `
    <app-page-header
      title="División de socios"
      [subtitle]="shops.selectedShop()?.name ?? ''"
    />

    @if (loading() && !preview()) {
      <app-loading-state label="Armando la división" />
    } @else if (preview(); as data) {
      <section class="panel-card mb-3">
        <div class="panel-card__body">
          <h2 class="split-title">Socios que participan</h2>
          <p class="hint">
            El total se reparte en partes iguales entre los socios marcados. Lo que dejes en
            canales y los extras se restan antes de repartir.
          </p>
          <div class="split-partners">
            @for (p of data.availablePartners; track p.accountId) {
              <div class="split-partner">
                <mat-checkbox
                  [checked]="p.included"
                  (change)="togglePartner(p.accountId, $event.checked)"
                >
                  {{ p.name }}
                </mat-checkbox>
                <span class="split-partner__amt" [class.neg]="p.current < 0">
                  {{ money(p.current) }}
                </span>
              </div>
            }
          </div>
        </div>
      </section>

      <section class="panel-card mb-3 split-sheet">
        <div class="split-cards">
          @for (row of data.partners; track row.accountId) {
            <button type="button" class="split-card" (click)="openAccount(row.accountId, row.name)">
              <strong>{{ row.name }}</strong>
              <span>Saldo <b [class.neg]="row.current < 0">{{ money(row.current) }}</b></span>
              <span>
                A saldar
                <b [class.neg]="row.difference < 0" [class.pos]="row.difference > 0">
                  {{ money(row.difference) }}
                </b>
              </span>
            </button>
          }
          @for (row of data.channels; track row.accountId) {
            <div class="split-card split-card--channel">
              <button type="button" class="split-link" (click)="openAccount(row.accountId, row.name)">
                {{ row.name }}
              </button>
              <span>Saldo <b [class.neg]="row.current < 0">{{ money(row.current) }}</b></span>
              <span>
                A saldar
                <b [class.neg]="row.difference < 0" [class.pos]="row.difference > 0">
                  {{ money(row.difference) }}
                </b>
              </span>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Dejar en la cuenta</mat-label>
                <input
                  matInput
                  type="number"
                  step="0.01"
                  [ngModel]="row.leaveAmount"
                  (ngModelChange)="setLeave(row.accountId, $event)"
                />
              </mat-form-field>
            </div>
          }
          <div class="split-card split-card--total">
            <strong>TOTAL</strong>
            <span>Saldo <b>{{ money(data.totals.balances) }}</b></span>
            <span>A saldar <b>{{ money(data.totals.differences) }}</b></span>
          </div>
        </div>

        <div class="split-table-wrap">
          <table class="split-table">
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Saldo</th>
                <th>A saldar</th>
                <th>Dejar</th>
              </tr>
            </thead>
            <tbody>
              @for (row of data.partners; track row.accountId) {
                <tr class="split-table__click" (click)="openAccount(row.accountId, row.name)">
                  <td>{{ row.name }}</td>
                  <td [class.neg]="row.current < 0">{{ money(row.current) }}</td>
                  <td [class.neg]="row.difference < 0" [class.pos]="row.difference > 0">
                    {{ money(row.difference) }}
                  </td>
                  <td></td>
                </tr>
              }
              @if (data.channels.length) {
                <tr class="split-table__section">
                  <td colspan="4">Canales</td>
                </tr>
              }
              @for (row of data.channels; track row.accountId) {
                <tr>
                  <td>
                    <button
                      type="button"
                      class="split-link"
                      (click)="openAccount(row.accountId, row.name)"
                    >
                      {{ row.name }}
                    </button>
                  </td>
                  <td [class.neg]="row.current < 0">{{ money(row.current) }}</td>
                  <td [class.neg]="row.difference < 0" [class.pos]="row.difference > 0">
                    {{ money(row.difference) }}
                  </td>
                  <td class="split-table__leave">
                    <input
                      class="split-leave-input"
                      type="number"
                      step="0.01"
                      [ngModel]="row.leaveAmount"
                      (ngModelChange)="setLeave(row.accountId, $event)"
                      aria-label="Dejar en la cuenta"
                    />
                  </td>
                </tr>
              }
              <tr class="split-table__total">
                <td>TOTAL</td>
                <td>{{ money(data.totals.balances) }}</td>
                <td>{{ money(data.totals.differences) }}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="split-bottom">
          <div class="split-extras">
            @for (extra of data.extras; track extra.id) {
              <div class="split-extra">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Concepto</mat-label>
                  <input matInput [ngModel]="extra.label" (ngModelChange)="setExtraLabel(extra.id, $event)" />
                </mat-form-field>
                <div class="split-extra__row">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Importe</mat-label>
                    <input
                      matInput
                      type="number"
                      step="0.01"
                      [ngModel]="extra.amount"
                      (ngModelChange)="setExtraAmount(extra.id, $event)"
                    />
                  </mat-form-field>
                  <button mat-icon-button type="button" aria-label="Quitar extra" (click)="removeExtra(extra.id)">
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
              </div>
            }
            <button mat-stroked-button type="button" (click)="addExtra()">
              <mat-icon>add</mat-icon>
              Agregar extra
            </button>
          </div>
          <div class="split-summary">
            <div><span>Reservado en canales</span><strong>{{ money(data.totals.reserves) }}</strong></div>
            <div><span>Extras</span><strong>{{ money(data.totals.extras) }}</strong></div>
            <div class="split-summary__total">
              <span>TOTAL a repartir</span>
              <strong>{{ money(data.totals.toDistribute) }}</strong>
            </div>
            <p class="hint">
              Cada socio queda con {{ money(data.totals.share) }} si la división cierra.
            </p>
          </div>
        </div>
      </section>

      @if (data.transfers.length) {
        <section class="panel-card mb-3">
          <div class="panel-card__body">
            <h2 class="split-title">Pases que se van a crear</h2>
            <ul class="split-transfers">
              @for (t of data.transfers; track t.fromAccountId + t.toAccountId + t.amount) {
                <li>
                  <span>{{ t.fromName }} → {{ t.toName }}</span>
                  <strong>{{ money(t.amount) }}</strong>
                </li>
              }
            </ul>
          </div>
        </section>
      }

      <div class="split-actions">
        <button mat-stroked-button type="button" [disabled]="busy()" (click)="save()">
          Guardar armado
        </button>
        @if (canManage()) {
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="busy() || !data.transfers.length"
            (click)="apply()"
          >
            Aplicar división
          </button>
        }
      </div>
    }
  `,
  styles: `
    .hint {
      margin: 0 0 0.75rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.88rem;
    }
    .split-title {
      margin: 0 0 0.35rem;
      font-size: 1.05rem;
    }
    .split-partners {
      display: grid;
      gap: 0.45rem;
    }
    .split-partner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      min-width: 0;
      padding: 0.2rem 0;
    }
    .split-partner mat-checkbox {
      min-width: 0;
    }
    .split-partner__amt {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      font-size: 0.88rem;
    }
    .split-sheet {
      padding: 0.85rem;
      min-width: 0;
    }
    .split-sheet mat-form-field {
      width: 100%;
      min-width: 0;
    }
    .split-cards {
      display: grid;
      gap: 0.65rem;
    }
    .split-card {
      display: grid;
      gap: 0.28rem;
      width: 100%;
      margin: 0;
      padding: 0.75rem 0.85rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 12px;
      background: var(--guy-card, #fff);
      font: inherit;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .split-card span {
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      font-size: 0.88rem;
    }
    .split-card b {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .split-card mat-form-field {
      width: 100%;
    }
    .split-card--channel {
      cursor: default;
    }
    .split-card--total {
      font-weight: 650;
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 7%, #fff);
    }
    .split-table-wrap {
      display: none;
      overflow: auto;
    }
    .split-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.92rem;
    }
    .split-table th,
    .split-table td {
      border-bottom: 1px solid var(--guy-border, #d7e0d9);
      padding: 0.45rem 0.75rem;
      text-align: right;
      vertical-align: middle;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .split-table th:first-child,
    .split-table td:first-child {
      text-align: left;
      width: 28%;
    }
    .split-table thead th {
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 8%, #fff);
      font-weight: 700;
    }
    .split-table__section td {
      text-align: left;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
      background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 80%, #fff);
      padding: 0.45rem 0.75rem;
    }
    .split-table__total td {
      font-weight: 700;
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 6%, #fff);
    }
    .split-table__click {
      cursor: pointer;
    }
    .split-table__click:hover {
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 5%, #fff);
    }
    .split-table__leave {
      width: 8.5rem;
    }
    .split-leave-input {
      width: 8.2rem;
      box-sizing: border-box;
      padding: 0.35rem 0.5rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 8px;
      font: inherit;
      font-variant-numeric: tabular-nums;
      text-align: right;
      background: #fff;
    }
    .split-leave-input:focus {
      outline: 2px solid color-mix(in srgb, var(--guy-primary, #1d65a0) 35%, transparent);
      outline-offset: 1px;
    }
    .split-link {
      display: block;
      border: 0;
      background: none;
      padding: 0;
      font: inherit;
      color: inherit;
      cursor: pointer;
      text-align: left;
    }
    .neg {
      color: #c62828;
    }
    .pos {
      color: #2e7d32;
    }
    .split-bottom {
      display: grid;
      gap: 1rem;
      margin-top: 1rem;
    }
    .split-extras {
      display: grid;
      gap: 0.65rem;
    }
    .split-extra {
      display: grid;
      gap: 0.5rem;
    }
    .split-extra__row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.35rem;
      align-items: center;
    }
    .split-extra__row mat-form-field {
      width: 100%;
    }
    .split-extras > button,
    .split-actions button {
      width: 100%;
    }
    .split-summary {
      display: grid;
      gap: 0.45rem;
      padding: 0.85rem 0.95rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 12px;
      background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 70%, #fff);
    }
    .split-summary > div {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: baseline;
    }
    .split-summary strong {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .split-summary__total {
      font-size: 1.05rem;
    }
    .split-summary .hint {
      margin: 0.25rem 0 0;
    }
    .split-transfers {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.35rem;
    }
    .split-transfers li {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: baseline;
    }
    .split-transfers strong {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .split-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      margin-bottom: 1.5rem;
    }
    @media (min-width: 720px) {
      .split-partners {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 0.75rem;
      }
      .split-partner {
        flex: 0 1 17.5rem;
        padding: 0.4rem 0.7rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 10px;
        background: #fff;
      }
      .split-cards {
        display: none;
      }
      .split-table-wrap {
        display: block;
      }
      .split-extra {
        grid-template-columns: minmax(0, 1fr) 9.5rem auto;
        align-items: center;
      }
      .split-extra__row {
        display: contents;
      }
      .split-extras > button,
      .split-actions button {
        width: auto;
      }
    }
    @media (min-width: 960px) {
      .split-bottom {
        grid-template-columns: minmax(0, 1.35fr) minmax(18rem, 0.75fr);
        align-items: start;
      }
      .split-transfers {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.4rem 1.5rem;
      }
    }
  `,
})
export class PartnerSplitsPage {
  private readonly api = inject(PartnerSplitsApiService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);

  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly preview = signal<PartnerSplitPreview | null>(null);

  readonly money = money;

  constructor() {
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.preview.set(null);
        return;
      }
      this.load();
    });
    usePageRefresh(() => this.load());
  }

  canManage(): boolean {
    return hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'partnerSplits.manage',
    );
  }

  private config(): PartnerSplitConfig {
    const data = this.preview();
    return {
      partnerAccountIds: data?.config.partnerAccountIds ?? [],
      channelLeaves: data?.config.channelLeaves ?? [],
      extras: data?.config.extras ?? [],
    };
  }

  load(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.loading.set(true);
    this.api.get(shopId).subscribe({
      next: (res) => {
        this.preview.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudo armar la división', 'OK', { duration: 3500 });
      },
    });
  }

  refresh(config: PartnerSplitConfig): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.preview(shopId, config).subscribe({
      next: (res) => this.preview.set(res),
      error: () => this.snack.open('No se pudo recalcular', 'OK', { duration: 3000 }),
    });
  }

  togglePartner(accountId: string, included: boolean): void {
    const cfg = this.config();
    const set = new Set(cfg.partnerAccountIds);
    if (included) set.add(accountId);
    else set.delete(accountId);
    this.refresh({ ...cfg, partnerAccountIds: [...set] });
  }

  setLeave(accountId: string, raw: number | string): void {
    const cfg = this.config();
    const leaveAmount = Number(raw || 0);
    const channelLeaves = [...cfg.channelLeaves];
    const idx = channelLeaves.findIndex((c) => c.accountId === accountId);
    if (idx >= 0) channelLeaves[idx] = { accountId, leaveAmount };
    else channelLeaves.push({ accountId, leaveAmount });
    this.refresh({ ...cfg, channelLeaves });
  }

  setExtraLabel(id: string, label: string): void {
    const cfg = this.config();
    this.refresh({
      ...cfg,
      extras: cfg.extras.map((e) => (e.id === id ? { ...e, label } : e)),
    });
  }

  setExtraAmount(id: string, raw: number | string): void {
    const cfg = this.config();
    this.refresh({
      ...cfg,
      extras: cfg.extras.map((e) => (e.id === id ? { ...e, amount: Number(raw || 0) } : e)),
    });
  }

  addExtra(): void {
    const cfg = this.config();
    this.refresh({
      ...cfg,
      extras: [
        ...cfg.extras,
        { id: `extra-${Date.now()}`, label: '', amount: 0 },
      ],
    });
  }

  removeExtra(id: string): void {
    const cfg = this.config();
    this.refresh({ ...cfg, extras: cfg.extras.filter((e) => e.id !== id) });
  }

  save(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.busy.set(true);
    this.api.save(shopId, this.config()).subscribe({
      next: (res) => {
        this.preview.set(res);
        this.busy.set(false);
        this.snack.open('Armado guardado', 'OK', { duration: 2500 });
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('No se pudo guardar', 'OK', { duration: 3500 });
      },
    });
  }

  async apply(): Promise<void> {
    const shopId = this.shops.selectedShopId();
    const data = this.preview();
    if (!shopId || !data?.transfers.length) return;
    const ok = await this.confirm.confirm(
      'Aplicar división',
      `Se van a crear ${data.transfers.length} pases entre cuentas para dejar a cada socio con ${money(data.totals.share)}.`,
      { confirmLabel: 'Aplicar' },
    );
    if (!ok) return;
    this.busy.set(true);
    this.api.apply(shopId, this.config()).subscribe({
      next: (res) => {
        this.preview.set(res);
        this.busy.set(false);
        this.snack.open(`Se crearon ${res.createdCount ?? 0} pases`, 'OK', { duration: 4000 });
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message ?? 'No se pudo aplicar la división';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  openAccount(accountId: string, accountName: string): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.dialogTitle.track(
      this.dialog.open(AccountMovementsDialogComponent, {
        width: '960px',
        maxWidth: '96vw',
        maxHeight: '92vh',
        panelClass: 'guy-dialog',
        data: { shopId, accountId, accountName },
      }),
      accountName,
    );
  }
}
