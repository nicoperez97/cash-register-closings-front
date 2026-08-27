import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { PartnerSplitPreview } from './partner-splits-api.service';

export type PartnerGenerateMode = 'skip' | 'payment' | 'movement';

export type PartnerSplitApplyResult = {
  partnerActions: Array<{
    fromAccountId: string;
    toAccountId: string;
    generate: PartnerGenerateMode;
  }>;
  partnerComplete: Array<{
    fromAccountId: string;
    toAccountId: string;
    complete: boolean;
  }>;
};

export type PartnerSplitApplyDialogData = {
  preview: PartnerSplitPreview;
};

type Transfer = PartnerSplitPreview['transfers'][number];

type ApplyRow = {
  fromAccountId: string;
  toAccountId: string;
  fromName: string;
  toName: string;
  amount: number;
  generate: PartnerGenerateMode;
  complete: boolean;
};

function money(value: number): string {
  return `$${Math.abs(Number(value || 0)).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

@Component({
  selector: 'app-partner-split-apply-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>call_split</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Aplicar división</strong>
        <span>{{ step() === 1 ? 'Socios: pago o pase' : 'Canales: marcar completo' }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      @if (step() === 1) {
        <p class="hint">
          Cada tarjeta es un pase entre socios. Por defecto no se hace nada y queda pendiente.
          Elegí Pago (A socios) o Movimiento si querés anotarlo ahora.
        </p>
        <div class="rows">
          @for (row of partnerRows; track row.fromAccountId + row.toAccountId) {
            <div class="row">
              <div class="row__info">
                <strong>{{ row.fromName }} → {{ row.toName }}</strong>
                <span>{{ money(row.amount) }}</span>
              </div>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Generar</mat-label>
                <mat-select [(ngModel)]="row.generate" (ngModelChange)="onGenerateChange()">
                  <mat-option value="skip">No hacer nada</mat-option>
                  <mat-option value="payment">Pago</mat-option>
                  <mat-option value="movement">Movimiento</mat-option>
                </mat-select>
              </mat-form-field>
            </div>
          }
        </div>
      } @else {
        <p class="hint">
          Marcá Completo en el pase que ya transferiste: solo esos se anotan. El resto
          vuelve a aparecer la próxima vez.
        </p>
        <div class="rows">
          @for (row of channelRows; track row.fromAccountId + row.toAccountId) {
            <div class="row row--complete">
              <div class="row__info">
                <strong>{{ row.fromName }} → {{ row.toName }}</strong>
                <span>{{ money(row.amount) }}</span>
              </div>
              <mat-slide-toggle
                [(ngModel)]="row.complete"
                color="primary"
                (ngModelChange)="onCompleteChange()"
              >
                Completo
              </mat-slide-toggle>
            </div>
          }
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="onBack()">
        {{ step() === 1 ? 'Cancelar' : 'Atrás' }}
      </button>
      @if (step() === 1) {
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="!channelRows.length && !hasChanges()"
          (click)="goNext()"
        >
          {{ channelRows.length ? 'Siguiente' : 'Aplicar' }}
        </button>
      } @else {
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="!hasChanges()"
          (click)="confirm()"
        >
          Aplicar
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .hint {
      margin: 0 0 1rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
      line-height: 1.4;
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 10.5rem;
      gap: 0.75rem;
      align-items: center;
      padding: 0.65rem 0.75rem;
      border: 1px solid var(--guy-border, #e4e0d8);
      border-radius: 12px;
      background: #fff;
    }
    .row--complete {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .row__info {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      min-width: 0;
    }
    .row__info strong {
      font-size: 0.95rem;
    }
    .row__info span {
      color: var(--guy-muted, #5f6f76);
      font-size: 0.8rem;
    }
    @media (max-width: 640px) {
      .row {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class PartnerSplitApplyDialogComponent {
  private readonly ref = inject(MatDialogRef<
    PartnerSplitApplyDialogComponent,
    PartnerSplitApplyResult | null
  >);
  readonly data = inject<PartnerSplitApplyDialogData>(MAT_DIALOG_DATA);

  readonly money = money;
  readonly partnerRows = this.buildRows('partner');
  readonly channelRows = this.buildRows('channel');
  readonly step = signal<1 | 2>(this.partnerRows.length ? 1 : 2);
  private readonly changeTick = signal(0);

  hasChanges(): boolean {
    this.changeTick();
    return (
      this.partnerRows.some((r) => r.generate !== 'skip') ||
      this.channelRows.some((r) => r.complete)
    );
  }

  onGenerateChange(): void {
    this.changeTick.update((n) => n + 1);
  }

  onCompleteChange(): void {
    this.changeTick.update((n) => n + 1);
  }

  private partnerIds(): Set<string> {
    return new Set((this.data.preview.partners ?? []).map((p) => p.accountId));
  }

  private isPartnerToPartner(t: Transfer, partnerIds: Set<string>): boolean {
    return partnerIds.has(t.fromAccountId) && partnerIds.has(t.toAccountId);
  }

  private buildRows(kind: 'partner' | 'channel'): ApplyRow[] {
    const partnerIds = this.partnerIds();
    return (this.data.preview.transfers ?? [])
      .filter((t) => {
        const betweenPartners = this.isPartnerToPartner(t, partnerIds);
        return kind === 'partner' ? betweenPartners : !betweenPartners;
      })
      .map((t) => ({
        fromAccountId: t.fromAccountId,
        toAccountId: t.toAccountId,
        fromName: t.fromName,
        toName: t.toName,
        amount: t.amount,
        generate: 'skip' as PartnerGenerateMode,
        complete: false,
      }));
  }

  goNext(): void {
    if (!this.channelRows.length) {
      this.confirm();
      return;
    }
    this.step.set(2);
  }

  onBack(): void {
    if (this.step() === 2 && this.partnerRows.length) {
      this.step.set(1);
      return;
    }
    this.ref.close(null);
  }

  confirm(): void {
    if (!this.hasChanges()) return;
    this.ref.close({
      partnerActions: this.partnerRows.map((p) => ({
        fromAccountId: p.fromAccountId,
        toAccountId: p.toAccountId,
        generate: p.generate,
      })),
      partnerComplete: this.channelRows.map((p) => ({
        fromAccountId: p.fromAccountId,
        toAccountId: p.toAccountId,
        complete: p.complete,
      })),
    });
  }
}
