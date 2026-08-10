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
import { Employee } from '../employees/employees-api.service';
import { TipAllocation, TipAllocationInput } from './tips-api.service';
import { TipsApiService } from './tips-api.service';

export interface TipsEditorState {
  cashAmount: number;
  transferAmount: number;
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
  ],
  template: `
    <div class="tips-editor" [class.tips-editor--readonly]="readonly()">
      <div class="tips-editor__amounts">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
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
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Transferencia</mat-label>
          <input
            matInput
            type="number"
            inputmode="decimal"
            [ngModel]="transferAmount()"
            (ngModelChange)="onTransfer($event)"
            [disabled]="readonly()"
          />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Tickets</mat-label>
          <input
            matInput
            type="number"
            inputmode="decimal"
            [ngModel]="ticketsAmount()"
            (ngModelChange)="onTickets($event)"
            [disabled]="readonly()"
          />
        </mat-form-field>
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
              {{ selectedEmployeeIds().length }} de {{ employees().length }} seleccionados
            </p>
          </div>
          <div class="tips-editor__emps-actions">
            @if (!readonly() && employees().length) {
              <button mat-stroked-button type="button" (click)="toggleSelectAll()">
                <mat-icon>{{ allSelected() ? 'deselect' : 'select_all' }}</mat-icon>
                {{ allSelected() ? 'Desmarcar todos' : 'Seleccionar todos' }}
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
                <mat-checkbox
                  [checked]="isSelected(e.id)"
                  [disabled]="readonly()"
                  (change)="toggleEmployee(e.id)"
                >
                  {{ e.fullName }}
                </mat-checkbox>
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
        grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
        gap: 0.65rem;
        align-items: start;
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
      .tips-chip {
        font-size: 0.72rem;
        font-weight: 600;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
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
          grid-template-columns: 1fr 1fr;
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
  readonly transferAmount = signal(0);
  readonly ticketsAmount = signal(0);
  readonly notes = signal('');
  readonly allocations = signal<TipsEditorState['allocations']>([]);
  readonly deliveryBusy = signal<string | null>(null);

  readonly total = computed(() =>
    round2(this.cashAmount() + this.transferAmount() + this.ticketsAmount()),
  );

  readonly selectedEmployeeIds = computed(() =>
    this.allocations().map((a) => a.employeeId),
  );

  readonly allSelected = computed(() => {
    const emps = this.employees();
    if (!emps.length) return false;
    const selected = new Set(this.selectedEmployeeIds());
    return emps.every((e) => selected.has(e.id));
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
      this.transferAmount.set(n(v.transferAmount));
      this.ticketsAmount.set(n(v.ticketsAmount));
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

  onCash(v: unknown) {
    this.cashAmount.set(Math.max(0, n(v)));
    this.emit();
  }

  onTransfer(v: unknown) {
    this.transferAmount.set(Math.max(0, n(v)));
    this.emit();
  }

  onTickets(v: unknown) {
    this.ticketsAmount.set(Math.max(0, n(v)));
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
    if (this.allSelected()) {
      this.onEmployeesChange([]);
    } else {
      this.onEmployeesChange(this.employees().map((e) => e.id));
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
    notes: string | null;
    allocations: TipAllocationInput[];
  } | null {
    const s = this.snapshot();
    if (!s) return null;
    return {
      cashAmount: s.cashAmount,
      transferAmount: s.transferAmount,
      ticketsAmount: s.ticketsAmount,
      notes: s.notes.trim() || null,
      allocations: s.allocations.map((a) => ({
        employeeId: a.employeeId,
        amount: a.amount,
        delivered: a.delivered,
      })),
    };
  }

  private currentState(): TipsEditorState {
    return {
      cashAmount: this.cashAmount(),
      transferAmount: this.transferAmount(),
      ticketsAmount: this.ticketsAmount(),
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
  notes?: string | null;
  allocations?: TipAllocation[];
}): TipsEditorState {
  return {
    cashAmount: n(day.cashAmount),
    transferAmount: n(day.transferAmount),
    ticketsAmount: n(day.ticketsAmount),
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
