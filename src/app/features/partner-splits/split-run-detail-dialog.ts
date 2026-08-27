import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type {
  PartnerSplitPreview,
  PartnerSplitRow,
  PartnerSplitRun,
} from './partner-splits-api.service';

export type SplitRunSnapshot = PartnerSplitPreview & {
  createdIds?: string[];
  createdMovementIds?: string[];
  createdPaymentIds?: string[];
  partnerActions?: Array<{
    accountId?: string;
    fromAccountId?: string;
    toAccountId?: string;
    generate: 'skip' | 'payment' | 'movement';
  }>;
  partnerComplete?: Array<{
    accountId?: string;
    fromAccountId?: string;
    toAccountId?: string;
    complete: boolean;
  }>;
};

export type SplitRunDetailDialogData = {
  run: PartnerSplitRun;
  shopName: string;
};

function money(value: number): string {
  const n = Number(value || 0);
  const abs = Math.abs(n).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

function moved(row: PartnerSplitRow): boolean {
  return (
    Math.abs(Number(row.current || 0)) > 0.004 ||
    Math.abs(Number(row.leaveAmount || 0)) > 0.004 ||
    Math.abs(Number(row.difference || 0)) > 0.004
  );
}

function actionLabel(difference: number): string {
  const n = Number(difference || 0);
  if (Math.abs(n) < 0.005) return 'Sin cambio';
  return n < 0 ? `Pasa ${money(Math.abs(n))}` : `Recibe ${money(n)}`;
}

@Component({
  selector: 'app-split-run-detail-dialog',
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>receipt_long</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>División aplicada</strong>
        <span>
          {{ run.appliedAt | date: 'dd/MM/yyyy HH:mm' }}
          · {{ run.appliedByName || '—' }}
        </span>
      </span>
    </h2>

    <mat-dialog-content>
      @if (snap; as s) {
        <div class="kpis">
          <div>
            <span>A repartir</span>
            <strong>{{ money(s.totals.toDistribute) }}</strong>
          </div>
          <div>
            <span>Parte</span>
            <strong>{{ money(s.totals.share) }}</strong>
          </div>
          <div>
            <span>Generado</span>
            <strong>{{ generatedLabel }}</strong>
          </div>
        </div>

        <section>
          <h3>Socios</h3>
          <div class="rows">
            @for (row of s.partners; track row.accountId) {
              <article class="row">
                <strong>{{ row.name }}</strong>
                <span>Saldo {{ money(row.current) }} · Dejar {{ money(row.leaveAmount ?? 0) }}</span>
                <span>Se queda {{ money(row.target) }} · {{ actionLabel(row.difference) }}</span>
              </article>
            }
          </div>
        </section>

        @if (channels.length) {
          <section>
            <h3>Canales</h3>
            <div class="rows">
              @for (row of channels; track row.accountId) {
                <article class="row">
                  <strong>{{ row.name }}</strong>
                  <span>Saldo {{ money(row.current) }} · Dejar {{ money(row.leaveAmount ?? 0) }}</span>
                  <span>Se queda {{ money(row.target) }} · {{ actionLabel(row.difference) }}</span>
                </article>
              }
            </div>
          </section>
        }

        @if (extras.length) {
          <section>
            <h3>Extras</h3>
            <div class="rows">
              @for (e of extras; track e.id) {
                <article class="row">
                  <strong>{{ e.label.trim() || 'Extra' }}</strong>
                  <span>{{ money(e.amount) }}</span>
                </article>
              }
            </div>
          </section>
        }

        <section>
          <h3>Pases</h3>
          @if (!transfers.length) {
            <p class="hint">No hubo pases: las cuentas ya estaban en el objetivo.</p>
          } @else {
            <div class="rows">
              @for (t of transfers; track $index) {
                <article class="row">
                  <strong>{{ t.fromName }} → {{ t.toName }}</strong>
                  <span>{{ money(t.amount) }} · {{ t.kind }}</span>
                </article>
              }
            </div>
          }
        </section>
      } @else {
        <p class="hint">Esa división no tiene el detalle guardado.</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close()">Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .kpis {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.5rem;
      margin: 0 0 1rem;
    }
    .kpis div {
      padding: 0.55rem 0.7rem;
      border: 1px solid var(--guy-border, #e4e0d8);
      border-radius: 10px;
      background: #fff;
    }
    .kpis span {
      display: block;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.75rem;
    }
    .kpis strong {
      font-size: 0.92rem;
      font-variant-numeric: tabular-nums;
    }
    section {
      margin: 0 0 1rem;
    }
    h3 {
      margin: 0 0 0.45rem;
      font-size: 0.95rem;
    }
    .rows {
      display: grid;
      gap: 0.5rem;
    }
    .row {
      display: grid;
      gap: 0.15rem;
      padding: 0.6rem 0.75rem;
      border: 1px solid var(--guy-border, #e4e0d8);
      border-radius: 12px;
      background: #fff;
    }
    .row strong {
      font-size: 0.92rem;
    }
    .row span,
    .hint {
      color: var(--guy-muted, #5f6f76);
      font-size: 0.82rem;
      line-height: 1.35;
    }
    .hint {
      margin: 0;
    }
    @media (max-width: 640px) {
      .kpis {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class SplitRunDetailDialogComponent {
  readonly ref = inject(MatDialogRef<SplitRunDetailDialogComponent>);
  readonly data = inject<SplitRunDetailDialogData>(MAT_DIALOG_DATA);
  readonly run = this.data.run;
  readonly snap = this.run.snapshot as SplitRunSnapshot | undefined;
  readonly money = money;
  readonly actionLabel = actionLabel;

  readonly channels = (this.snap?.channels ?? []).filter(moved);
  readonly extras = (this.snap?.extras ?? []).filter(
    (e) => e.label.trim() || Number(e.amount),
  );
  readonly transfers = this.buildTransfers();
  readonly generatedLabel = this.buildGeneratedLabel();

  private buildGeneratedLabel(): string {
    const s = this.snap;
    const payments = s?.createdPaymentIds?.length ?? 0;
    const movements = s?.createdMovementIds?.length ?? 0;
    const bits: string[] = [];
    if (movements) bits.push(`${movements} ${movements === 1 ? 'pase' : 'pases'}`);
    if (payments) bits.push(`${payments} ${payments === 1 ? 'pago' : 'pagos'}`);
    return bits.length ? bits.join(' · ') : 'Sin asientos';
  }

  private buildTransfers() {
    const s = this.snap;
    if (!s) return [];
    const partnerIds = new Set((s.partners ?? []).map((p) => p.accountId));
    const transferKey = (from?: string, to?: string) => `${from ?? ''}|${to ?? ''}`;
    const actionBy = new Map(
      (s.partnerActions ?? []).map((a) => [
        a.fromAccountId && a.toAccountId
          ? transferKey(a.fromAccountId, a.toAccountId)
          : (a.accountId ?? ''),
        a.generate,
      ]),
    );
    const completeBy = new Map(
      (s.partnerComplete ?? []).map((a) => [
        a.fromAccountId && a.toAccountId
          ? transferKey(a.fromAccountId, a.toAccountId)
          : (a.accountId ?? ''),
        a.complete,
      ]),
    );
    return (s.transfers ?? []).map((t) => {
      const key = transferKey(t.fromAccountId, t.toAccountId);
      const betweenPartners =
        partnerIds.has(t.fromAccountId) && partnerIds.has(t.toAccountId);
      if (betweenPartners) {
        const raw =
          actionBy.get(key) ?? actionBy.get(t.fromAccountId) ?? actionBy.get(t.toAccountId);
        const kind =
          raw === 'payment'
            ? 'Pago'
            : raw === 'movement'
              ? 'Movimiento'
              : 'Sin asiento';
        return { ...t, kind };
      }
      const partnerId = partnerIds.has(t.toAccountId) ? t.toAccountId : t.fromAccountId;
      const done = completeBy.get(key) ?? completeBy.get(partnerId);
      const kind = done === true ? 'Canal · completo' : done === false ? 'Canal · pendiente' : 'Canal';
      return { ...t, kind };
    });
  }
}
