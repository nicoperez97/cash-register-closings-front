import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Employee } from '../employees/employees-api.service';
import { TipAllocation, TipAllocationInput } from './tips-api.service';
import { TipsApiService } from './tips-api.service';
import { CashBillCounterDialogComponent } from '../closings/cash-bill-counter-dialog';

export interface TipsEditorState {
  cashAmount: number;
  /** Montos de recibos (sin filas vacías). */
  receipts: number[];
  /** @deprecated suma de recibos; se mantiene por compat. */
  transferAmount: number;
  /** @deprecated siempre 0 en UI nueva. */
  ticketsAmount: number;
  notes: string;
  allocations: Array<{
    employeeId: string;
    employeeName?: string | null;
    amount: number;
    delivered: boolean;
    id?: string | null;
  }>;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

/** Filas de UI: recibos con valor + una fila vacía al final para cargar el siguiente. */
function withTrailingEmpty(receipts: number[]): number[] {
  const filled = receipts.map((v) => round2(Math.max(0, n(v)))).filter((v) => v > 0);
  return [...filled, 0];
}

function filledReceipts(rows: number[]): number[] {
  return rows.map((v) => round2(Math.max(0, n(v)))).filter((v) => v > 0);
}

function receiptsFromLegacy(
  receipts?: number[] | null,
  transfer = 0,
  tickets = 0,
): number[] {
  if (Array.isArray(receipts) && receipts.some((v) => n(v) > 0)) {
    return filledReceipts(receipts);
  }
  const out: number[] = [];
  if (transfer > 0) out.push(round2(transfer));
  if (tickets > 0) out.push(round2(tickets));
  return out;
}

@Component({
  selector: 'app-tips-editor',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  template: `
    <div class="tips-editor" [class.tips-editor--readonly]="readonly()">
      <div class="tips-editor__amounts">
        <div class="tips-editor__cash">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="tips-editor__cash-field">
            <mat-label>Efectivo</mat-label>
            <input
              matInput
              type="number"
              inputmode="decimal"
              [ngModel]="cashAmount()"
              (ngModelChange)="onCash($event)"
              [disabled]="readonly()"
            />
          </mat-form-field>
          @if (!readonly()) {
            <button mat-stroked-button type="button" (click)="openBillCounter()">
              <mat-icon>payments</mat-icon>
              Contar billetes
            </button>
          }
        </div>

        <div class="tips-editor__receipts">
          <div class="tips-editor__receipts-head">
            <span class="tips-editor__receipts-title">Recibos</span>
            <span class="tips-editor__receipts-sum">{{ formatMoney(receiptsSum()) }}</span>
          </div>
          <div class="tips-editor__receipt-list">
            @for (row of receiptRows(); track $index; let i = $index; let last = $last) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>{{ last ? 'Nuevo recibo' : 'Recibo ' + (i + 1) }}</mat-label>
                <input
                  matInput
                  type="number"
                  inputmode="decimal"
                  [ngModel]="row || null"
                  (ngModelChange)="onReceipt(i, $event)"
                  [disabled]="readonly()"
                />
              </mat-form-field>
            }
          </div>
        </div>

        <div class="tips-editor__total">
          <span class="tips-editor__total-label">Total</span>
          <strong>{{ formatMoney(total()) }}</strong>
        </div>
      </div>

      <mat-form-field appearance="outline" class="tips-editor__notes" subscriptSizing="dynamic">
        <mat-label>Notas</mat-label>
        <textarea
          matInput
          rows="2"
          [ngModel]="notes()"
          (ngModelChange)="onNotes($event)"
          [disabled]="readonly()"
        ></textarea>
      </mat-form-field>

      <div class="tips-editor__emps">
        <div class="tips-editor__emps-head">
          <div>
            <h3 class="tips-editor__emps-title">Empleados en el reparto</h3>
            <p class="tips-editor__emps-meta">
              {{ selectedEmployeeIds().length }} seleccionados
              @if (fixedEmployees().length) {
                · {{ fixedSelectedCount() }} de {{ fixedEmployees().length }} fijos
              }
            </p>
          </div>
          <div class="tips-editor__emps-actions">
            @if (!readonly() && fixedEmployees().length) {
              <button mat-stroked-button type="button" (click)="toggleSelectAll()">
                <mat-icon>{{ allFixedSelected() ? 'deselect' : 'select_all' }}</mat-icon>
                {{ allFixedSelected() ? 'Desmarcar fijos' : 'Seleccionar fijos' }}
              </button>
            }
            @if (!readonly() && selectedEmployeeIds().length) {
              <button mat-stroked-button type="button" (click)="splitEqual()">
                <mat-icon>balance</mat-icon>
                Reparto igualitario
              </button>
            }
          </div>
        </div>

        @if (!employees().length) {
          <p class="tips-editor__empty">No hay empleados activos en este local.</p>
        } @else {
          <ul class="tips-editor__emp-list">
            @for (e of employees(); track e.id) {
              <li class="tips-editor__emp-row" [class.tips-editor__emp-row--on]="isSelected(e.id)">
                <div class="tips-editor__emp-check">
                  <mat-checkbox
                    [checked]="isSelected(e.id)"
                    [disabled]="readonly()"
                    (change)="toggleEmployee(e.id)"
                  >
                    {{ e.fullName }}
                  </mat-checkbox>
                  @if (e.type === 'ROTATING') {
                    <span class="tips-chip tips-chip--rotating">Rotativo</span>
                  } @else {
                    <span class="tips-chip tips-chip--fixed">Fijo</span>
                  }
                </div>
                @if (isSelected(e.id)) {
                  <div class="tips-editor__emp-amount">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Monto</mat-label>
                      <input
                        matInput
                        type="number"
                        inputmode="decimal"
                        [ngModel]="allocationAmount(e.id)"
                        (ngModelChange)="onAllocAmount(e.id, $event)"
                        [disabled]="readonly()"
                      />
                    </mat-form-field>
                    @if (allocationOf(e.id); as a) {
                      @if (a.delivered) {
                        <span class="tips-chip tips-chip--ok">Entregada</span>
                      } @else {
                        <span class="tips-chip tips-chip--pending">Falta entregar</span>
                      }
                      @if (showDelivery() && a.id && businessDate() && shopId()) {
                        <button
                          mat-stroked-button
                          type="button"
                          [disabled]="deliveryBusy() === a.id"
                          (click)="toggleDelivered(a)"
                        >
                          <mat-icon>{{ a.delivered ? 'undo' : 'check' }}</mat-icon>
                          {{ a.delivered ? 'Pendiente' : 'Entregada' }}
                        </button>
                      }
                    }
                  </div>
                }
              </li>
            }
          </ul>
        }
      </div>

      @if (allocationSumError()) {
        <p class="tips-editor__error">{{ allocationSumError() }}</p>
      }
    </div>
  `,
  styles: [
    `
      .tips-editor {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }
      .tips-editor__amounts {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.2fr) auto;
        gap: 0.85rem;
        align-items: start;
      }
      .tips-editor__cash {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .tips-editor__cash-field {
        width: 100%;
      }
      .tips-editor__cash button {
        align-self: flex-start;
      }
      .tips-editor__receipts {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        min-width: 0;
      }
      .tips-editor__receipts-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0 0.15rem;
      }
      .tips-editor__receipts-title {
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--guy-muted, #5a6b5e);
      }
      .tips-editor__receipts-sum {
        font-size: 0.85rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--guy-navy, #003366);
      }
      .tips-editor__receipt-list {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }
      .tips-editor__receipt-list mat-form-field {
        width: 100%;
      }
      .tips-editor__total {
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-width: 6.5rem;
        padding: 0.35rem 0.5rem;
      }
      .tips-editor__total-label {
        font-size: 0.75rem;
        color: var(--guy-muted, #5a6b5e);
      }
      .tips-editor__notes {
        width: 100%;
      }
      .tips-editor__emps {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }
      .tips-editor__emps-head {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 0.65rem;
        align-items: flex-start;
      }
      .tips-editor__emps-title {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 600;
      }
      .tips-editor__emps-meta {
        margin: 0.15rem 0 0;
        font-size: 0.8rem;
        color: var(--guy-muted, #5a6b5e);
      }
      .tips-editor__emps-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .tips-editor__emp-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
        max-height: 22rem;
        overflow: auto;
      }
      .tips-editor__emp-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem 1rem;
        align-items: center;
        justify-content: space-between;
        padding: 0.55rem 0.75rem;
        border: 1px solid color-mix(in srgb, var(--guy-border, #d5ddd7) 80%, transparent);
        border-radius: 10px;
      }
      .tips-editor__emp-row--on {
        border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 35%, var(--guy-border, #d5ddd7));
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 6%, transparent);
      }
      .tips-editor__emp-amount {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        margin-left: auto;
      }
      .tips-editor__emp-amount mat-form-field {
        width: 8.5rem;
      }
      .tips-editor__emp-check {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.4rem 0.55rem;
        min-width: 0;
      }
      .tips-chip {
        font-size: 0.72rem;
        font-weight: 600;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
      }
      .tips-chip--fixed {
        background: color-mix(in srgb, var(--guy-navy, #003366) 12%, white);
        color: var(--guy-navy, #003366);
      }
      .tips-chip--rotating {
        background: color-mix(in srgb, #5f6f76 14%, white);
        color: #455a64;
      }
      .tips-chip--ok {
        background: color-mix(in srgb, #2e7d32 18%, white);
        color: #1b5e20;
      }
      .tips-chip--pending {
        background: color-mix(in srgb, #ed6c02 18%, white);
        color: #e65100;
      }
      .tips-editor__error {
        margin: 0;
        color: #c62828;
        font-size: 0.85rem;
      }
      .tips-editor__empty {
        margin: 0;
        color: var(--guy-muted, #5a6b5e);
        font-size: 0.85rem;
      }
      @media (max-width: 720px) {
        .tips-editor__amounts {
          grid-template-columns: 1fr;
        }
        .tips-editor__total {
          grid-column: 1 / -1;
        }
        .tips-editor__emp-amount {
          width: 100%;
          margin-left: 0;
        }
        .tips-editor__emp-amount mat-form-field {
          flex: 1 1 8rem;
        }
      }
    `,
  ],
})
export class TipsEditorComponent {
  private readonly api = inject(TipsApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly employees = input<Employee[]>([]);
  readonly readonly = input(false);
  readonly showDelivery = input(false);
  readonly shopId = input<string | null>(null);
  readonly businessDate = input<string | null>(null);
  /** Valor inicial / externo (cierre o carga de día). */
  readonly value = input<TipsEditorState | null>(null);

  readonly valueChange = output<TipsEditorState>();
  readonly deliveredChange = output<void>();

  readonly cashAmount = signal(0);
  /** Filas de UI (incluye vacía al final). */
  readonly receiptRows = signal<number[]>([0]);
  readonly notes = signal('');
  readonly allocations = signal<TipsEditorState['allocations']>([]);
  readonly deliveryBusy = signal<string | null>(null);

  readonly receiptsSum = computed(() =>
    round2(filledReceipts(this.receiptRows()).reduce((s, v) => s + v, 0)),
  );

  readonly total = computed(() => round2(this.cashAmount() + this.receiptsSum()));

  readonly selectedEmployeeIds = computed(() =>
    this.allocations().map((a) => a.employeeId),
  );

  readonly fixedEmployees = computed(() =>
    this.employees().filter((e) => e.type !== 'ROTATING'),
  );

  readonly fixedSelectedCount = computed(() => {
    const selected = new Set(this.selectedEmployeeIds());
    return this.fixedEmployees().filter((e) => selected.has(e.id)).length;
  });

  /** “Todos” = todos los fijos; los rotativos se eligen a mano. */
  readonly allFixedSelected = computed(() => {
    const fixed = this.fixedEmployees();
    if (!fixed.length) return false;
    const selected = new Set(this.selectedEmployeeIds());
    return fixed.every((e) => selected.has(e.id));
  });

  readonly allocationSumError = computed(() => {
    const allocs = this.allocations();
    if (!allocs.length) return null;
    const sum = round2(allocs.reduce((s, a) => s + n(a.amount), 0));
    const total = this.total();
    if (Math.abs(sum - total) > 0.02) {
      return `La suma del reparto ($${sum.toFixed(2)}) debe igualar el total ($${total.toFixed(2)})`;
    }
    return null;
  });

  private applyingExternal = false;

  constructor() {
    effect(() => {
      const v = this.value();
      if (!v) return;
      this.applyingExternal = true;
      this.cashAmount.set(n(v.cashAmount));
      this.receiptRows.set(
        withTrailingEmpty(
          receiptsFromLegacy(v.receipts, n(v.transferAmount), n(v.ticketsAmount)),
        ),
      );
      this.notes.set(v.notes ?? '');
      this.allocations.set(
        (v.allocations ?? []).map((a) => ({
          employeeId: a.employeeId,
          employeeName: a.employeeName ?? this.employeeName(a.employeeId),
          amount: n(a.amount),
          delivered: !!a.delivered,
          id: a.id ?? null,
        })),
      );
      queueMicrotask(() => {
        this.applyingExternal = false;
      });
    });
  }

  employeeName(id: string): string {
    return this.employees().find((e) => e.id === id)?.fullName ?? '—';
  }

  isSelected(id: string): boolean {
    return this.allocations().some((a) => a.employeeId === id);
  }

  allocationOf(id: string) {
    return this.allocations().find((a) => a.employeeId === id) ?? null;
  }

  allocationAmount(id: string): number {
    return this.allocationOf(id)?.amount ?? 0;
  }

  formatMoney(value: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 2,
    }).format(value);
  }

  openBillCounter(): void {
    this.dialog
      .open(CashBillCounterDialogComponent, {
        width: '440px',
        maxWidth: '96vw',
        maxHeight: 'calc(100dvh - 4.5rem)',
        autoFocus: 'dialog',
        panelClass: 'guy-dialog',
        data: { initialTotal: this.cashAmount() },
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result || result.total <= 0) return;
        this.cashAmount.set(result.total);
        this.emit();
      });
  }

  onCash(v: unknown) {
    this.cashAmount.set(Math.max(0, n(v)));
    this.emit();
  }

  onReceipt(index: number, raw: unknown) {
    const value = Math.max(0, n(raw));
    const next = [...this.receiptRows()];
    next[index] = value;
    this.receiptRows.set(withTrailingEmpty(next));
    this.emit();
  }

  onNotes(v: string) {
    this.notes.set(v ?? '');
    this.emit();
  }

  toggleEmployee(id: string) {
    if (this.readonly()) return;
    if (this.isSelected(id)) {
      this.onEmployeesChange(this.selectedEmployeeIds().filter((x) => x !== id));
    } else {
      this.onEmployeesChange([...this.selectedEmployeeIds(), id]);
    }
  }

  toggleSelectAll() {
    if (this.readonly()) return;
    const fixedIds = new Set(this.fixedEmployees().map((e) => e.id));
    const current = this.selectedEmployeeIds();
    if (this.allFixedSelected()) {
      // Desmarcar solo fijos; dejar rotativos elegidos a mano.
      this.onEmployeesChange(current.filter((id) => !fixedIds.has(id)));
    } else {
      const rotatingKept = current.filter((id) => !fixedIds.has(id));
      this.onEmployeesChange([...this.fixedEmployees().map((e) => e.id), ...rotatingKept]);
    }
  }

  onEmployeesChange(ids: string[]) {
    const prev = new Map(this.allocations().map((a) => [a.employeeId, a]));
    const next = ids.map((id) => {
      const existing = prev.get(id);
      if (existing) return existing;
      return {
        employeeId: id,
        employeeName: this.employeeName(id),
        amount: 0,
        delivered: false,
        id: null as string | null,
      };
    });
    this.allocations.set(next);
    this.splitEqual(false);
    this.emit();
  }

  onAllocAmount(employeeId: string, v: unknown) {
    this.allocations.update((rows) =>
      rows.map((a) =>
        a.employeeId === employeeId ? { ...a, amount: Math.max(0, n(v)) } : a,
      ),
    );
    this.emit();
  }

  splitEqual(emit = true) {
    const ids = this.allocations();
    if (!ids.length) {
      if (emit) this.emit();
      return;
    }
    const total = this.total();
    const base = Math.floor((total * 100) / ids.length) / 100;
    let rem = round2(total - base * ids.length);
    this.allocations.set(
      ids.map((a) => {
        let amount = base;
        if (rem > 0) {
          amount = round2(amount + 0.01);
          rem = round2(rem - 0.01);
        }
        return { ...a, amount };
      }),
    );
    if (emit) this.emit();
  }

  toggleDelivered(a: TipsEditorState['allocations'][number]) {
    const shopId = this.shopId();
    const date = this.businessDate();
    if (!shopId || !date || !a.id) return;
    const next = !a.delivered;
    this.deliveryBusy.set(a.id);
    this.api.setDelivered(shopId, date, a.id, next).subscribe({
      next: (row) => {
        this.allocations.update((rows) =>
          rows.map((x) =>
            x.id === row.id
              ? { ...x, delivered: row.delivered, id: row.id }
              : x,
          ),
        );
        this.deliveryBusy.set(null);
        this.deliveredChange.emit();
        this.emit();
      },
      error: (err) => {
        this.deliveryBusy.set(null);
        this.snack.open(
          err?.error?.message ?? 'No se pudo actualizar la entrega',
          'OK',
          { duration: 3500 },
        );
      },
    });
  }

  /** Snapshot válido para guardar (null si hay error de suma). */
  snapshot(): TipsEditorState | null {
    if (this.allocationSumError()) return null;
    return this.currentState();
  }

  toPayload(): {
    cashAmount: number;
    transferAmount: number;
    ticketsAmount: number;
    receipts: number[];
    notes: string | null;
    allocations: TipAllocationInput[];
  } | null {
    const s = this.snapshot();
    if (!s) return null;
    return {
      cashAmount: s.cashAmount,
      transferAmount: s.transferAmount,
      ticketsAmount: s.ticketsAmount,
      receipts: s.receipts,
      notes: s.notes.trim() || null,
      allocations: s.allocations.map((a) => ({
        employeeId: a.employeeId,
        amount: a.amount,
        delivered: a.delivered,
      })),
    };
  }

  private currentState(): TipsEditorState {
    const receipts = filledReceipts(this.receiptRows());
    return {
      cashAmount: this.cashAmount(),
      receipts,
      transferAmount: round2(receipts.reduce((s, v) => s + v, 0)),
      ticketsAmount: 0,
      notes: this.notes(),
      allocations: this.allocations().map((a) => ({ ...a })),
    };
  }

  private emit() {
    if (this.applyingExternal) return;
    this.valueChange.emit(this.currentState());
  }
}

export function tipDayToEditorState(day: {
  cashAmount: number;
  transferAmount: number;
  ticketsAmount: number;
  receipts?: number[] | null;
  notes?: string | null;
  allocations?: TipAllocation[];
}): TipsEditorState {
  const receipts = receiptsFromLegacy(day.receipts, n(day.transferAmount), n(day.ticketsAmount));
  return {
    cashAmount: n(day.cashAmount),
    receipts,
    transferAmount: round2(receipts.reduce((s, v) => s + v, 0)),
    ticketsAmount: 0,
    notes: day.notes ?? '',
    allocations: (day.allocations ?? []).map((a) => ({
      employeeId: a.employeeId,
      employeeName: a.employeeName,
      amount: n(a.amount),
      delivered: !!a.delivered,
      id: a.id,
    })),
  };
}
