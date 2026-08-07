import { Component, OnInit, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { SpinnerComponent } from '../../shared/components/spinner';
import {
  StockApiService,
  StockShareAdmin,
  StockShareResult,
} from './stock-api.service';

export type StockShareDialogData = {
  shopId: string;
  shopName: string;
};

@Component({
  selector: 'app-stock-share-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatSnackBarModule,
    BusyLabelComponent,
    SpinnerComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>send</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Enviar stock</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="share-hint">
        Se envía una notificación y un mail a los administradores de stock
        seleccionados, con un botón para abrir el inventario en la app.
      </p>

      @if (loading()) {
        <app-spinner label="Cargando administradores…" />
      } @else if (!admins().length) {
        <p class="share-empty">
          No hay administradores de stock en este local. Marcá la opción
          «Admin de stock» en Usuarios.
        </p>
      } @else {
        <div class="share-toolbar">
          <button mat-button type="button" (click)="toggleAll()">
            {{ allSelected() ? 'Quitar todos' : 'Seleccionar todos' }}
          </button>
          <span class="share-toolbar__meta"
            >{{ selectedIds().size }} de {{ admins().length }}</span
          >
        </div>
        <ul class="share-list">
          @for (admin of admins(); track admin.id) {
            <li>
              <mat-checkbox
                [checked]="isSelected(admin.id)"
                (change)="toggle(admin.id)"
              >
                <span class="share-list__name">{{ admin.fullName }}</span>
                <span class="share-list__email">{{ admin.email }}</span>
              </mat-checkbox>
            </li>
          }
        </ul>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" [disabled]="sending()" (click)="ref.close()">
        Cancelar
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="sending() || loading() || !selectedIds().size"
        (click)="send()"
      >
        <app-busy-label [busy]="sending()" busyLabel="Enviando…">
          <mat-icon>send</mat-icon>
          Enviar
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .share-hint {
      margin: 0 0 1rem;
      color: var(--mat-sys-on-surface-variant, #5f6368);
      font-size: 0.9rem;
      line-height: 1.45;
    }
    .share-empty {
      margin: 0.5rem 0 0;
      color: var(--mat-sys-on-surface-variant, #5f6368);
    }
    .share-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.35rem;
    }
    .share-toolbar__meta {
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant, #5f6368);
    }
    .share-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    .share-list__name {
      display: block;
      font-weight: 500;
    }
    .share-list__email {
      display: block;
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant, #5f6368);
    }
  `,
})
export class StockShareDialogComponent implements OnInit {
  readonly data = inject<StockShareDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<StockShareDialogComponent, StockShareResult | false>);
  private readonly api = inject(StockApiService);
  private readonly snack = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly admins = signal<StockShareAdmin[]>([]);
  readonly selectedIds = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.api.listStockAdmins(this.data.shopId).subscribe({
      next: (rows) => {
        this.admins.set(rows);
        this.selectedIds.set(new Set(rows.map((r) => r.id)));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar los administradores', 'OK', {
          duration: 3500,
        });
      },
    });
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  allSelected(): boolean {
    const admins = this.admins();
    if (!admins.length) return false;
    const sel = this.selectedIds();
    return admins.every((a) => sel.has(a.id));
  }

  toggle(id: string): void {
    this.selectedIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  toggleAll(): void {
    if (this.allSelected()) {
      this.selectedIds.set(new Set());
    } else {
      this.selectedIds.set(new Set(this.admins().map((a) => a.id)));
    }
  }

  send(): void {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    this.sending.set(true);
    this.api.shareStock(this.data.shopId, ids).subscribe({
      next: (res) => {
        this.sending.set(false);
        this.ref.close(res);
      },
      error: (err) => {
        this.sending.set(false);
        const msg = err?.error?.message ?? 'No se pudo compartir el stock';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', {
          duration: 4000,
        });
      },
    });
  }
}
