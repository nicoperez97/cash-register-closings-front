import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { environment } from '../../../environments/environment';
import { BusyLabelComponent } from '../../shared/components/busy-label';

import { apiErrorMessage } from '../../core/http/api-error-message';
export type PosMenuLinkDialogData = {
  shopId: string;
};

type MenuItemOption = {
  menuItemId: string;
  name: string;
  menuTitle: string;
  sectionName: string;
};

type PosProductLink = {
  id: string;
  productCode: string;
  productName: string | null;
  menuItemId: string | null;
};

type SuggestResponse = {
  products: Array<{
    productCode: string;
    productName: string | null;
    currentMenuItemId: string | null;
  }>;
  menuItems: MenuItemOption[];
  suggestions: Array<{
    productCode: string;
    menuItemId: string;
    confidence: number;
    reason: string;
  }>;
  source: 'gemini' | 'local';
  warnings: string[];
};

type LinkRow = PosProductLink & {
  reason?: string;
  confidence: number;
};

@Component({
  selector: 'app-pos-menu-link-dialog',
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>Enlazar POS ↔ Carta</h2>
    <mat-dialog-content class="body">
      <p class="hint">
        Asociá cada plato del POS con un ítem de la carta. Podés sugerir con Gemini y corregir a mano.
      </p>

      <div class="toolbar">
        <button
          mat-stroked-button
          type="button"
          [disabled]="busy() || suggesting()"
          (click)="suggest()"
        >
          <app-busy-label [busy]="suggesting()" busyLabel="Sugiriendo…">
            <mat-icon>auto_awesome</mat-icon>
            Sugerir con Gemini
          </app-busy-label>
        </button>
        @if (source()) {
          <span class="source">Fuente: {{ source() === 'gemini' ? 'Gemini' : 'nombres locales' }}</span>
        }
      </div>

      @if (warnings().length) {
        <ul class="warnings">
          @for (w of warnings(); track w) {
            <li>{{ w }}</li>
          }
        </ul>
      }

      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else {
        <div class="filter-row">
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="filter">
            <mat-label>Filtrar platos</mat-label>
            <input matInput [formControl]="filter" placeholder="Código o nombre" />
          </mat-form-field>
        </div>
        <div class="table-wrap">
          <table class="link-table">
            <thead>
              <tr>
                <th>POS</th>
                <th>Carta</th>
              </tr>
            </thead>
            <tbody>
              @for (row of filteredRows(); track row.id) {
                <tr>
                  <td>
                    <div class="pos-name">{{ row.productName || '—' }}</div>
                    <div class="pos-code">{{ row.productCode }}</div>
                    @if (row.reason) {
                      <div class="reason" [matTooltip]="row.reason">
                        Sugerido {{ row.confidence * 100 | number: '1.0-0' }}%
                      </div>
                    }
                  </td>
                  <td>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="select">
                      <mat-select
                        [value]="row.menuItemId ?? ''"
                        (selectionChange)="setLink(row.id, $event.value)"
                      >
                        <mat-option value="">Sin enlace</mat-option>
                        @for (m of menuItems(); track m.menuItemId) {
                          <mat-option [value]="m.menuItemId">
                            {{ m.name }} · {{ m.sectionName }}
                          </mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button type="button" [mat-dialog-close]="false" [disabled]="busy()">
        Cancelar
      </button>
      <button mat-flat-button color="primary" type="button" [disabled]="busy() || loading()" (click)="confirm()">
        <app-busy-label [busy]="busy()" busyLabel="Guardando…">
          Confirmar
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .body {
      min-width: min(720px, 92vw);
      max-width: 92vw;
    }
    .hint {
      margin: 0 0 0.75rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }
    .source {
      font-size: 0.78rem;
      color: var(--guy-muted, #5f6f76);
    }
    .warnings {
      margin: 0 0 0.75rem;
      padding-left: 1.1rem;
      color: #8a5a00;
      font-size: 0.82rem;
    }
    .filter-row {
      margin-bottom: 0.5rem;
    }
    .filter,
    .select {
      width: 100%;
    }
    .table-wrap {
      max-height: min(55vh, 480px);
      overflow: auto;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 8px;
    }
    .link-table {
      width: 100%;
      border-collapse: collapse;
    }
    .link-table th,
    .link-table td {
      padding: 0.55rem 0.65rem;
      border-bottom: 1px solid var(--guy-border, #d7e0d9);
      vertical-align: top;
      text-align: left;
    }
    .link-table th {
      position: sticky;
      top: 0;
      background: #f7faf8;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--guy-muted, #5f6f76);
    }
    .pos-name {
      font-weight: 650;
    }
    .pos-code,
    .reason {
      font-size: 0.75rem;
      color: var(--guy-muted, #5f6f76);
    }
    .muted {
      color: var(--guy-muted, #5f6f76);
    }
  `,
})
export class PosMenuLinkDialogComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly ref = inject(MatDialogRef<PosMenuLinkDialogComponent, boolean>);
  private readonly data = inject<PosMenuLinkDialogData>(MAT_DIALOG_DATA);

  readonly loading = signal(true);
  readonly suggesting = signal(false);
  readonly busy = signal(false);
  readonly source = signal<'gemini' | 'local' | null>(null);
  readonly warnings = signal<string[]>([]);
  readonly menuItems = signal<MenuItemOption[]>([]);
  readonly rows = signal<LinkRow[]>([]);
  readonly filter = new FormControl('', { nonNullable: true });
  private readonly filterText = signal('');

  readonly filteredRows = computed(() => {
    const q = this.filterText().trim().toLowerCase();
    const all = this.rows();
    if (!q) return all;
    return all.filter(
      (r) =>
        r.productCode.toLowerCase().includes(q) ||
        (r.productName ?? '').toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    this.filter.valueChanges.subscribe((v) => this.filterText.set(v));
    this.loadBase();
  }

  private loadBase(): void {
    this.loading.set(true);
    this.http
      .get<PosProductLink[]>(`${environment.apiUrl}/shops/${this.data.shopId}/pos-products`)
      .subscribe({
        next: (products) => {
          this.rows.set(
            products.map((p) => ({
              id: p.id,
              productCode: p.productCode,
              productName: p.productName ?? null,
              menuItemId: p.menuItemId ?? null,
              confidence: 0,
            })),
          );
          this.loading.set(false);
          this.suggest(true);
        },
        error: () => {
          this.loading.set(false);
          this.snack.open('No se pudieron cargar los platos POS', 'OK', { duration: 3000 });
        },
      });
  }

  suggest(silent = false): void {
    if (!silent) this.suggesting.set(true);
    this.http
      .post<SuggestResponse>(
        `${environment.apiUrl}/shops/${this.data.shopId}/pos-catalog/link-suggest`,
        {},
      )
      .subscribe({
        next: (res) => {
          this.menuItems.set(res.menuItems ?? []);
          this.source.set(res.source);
          this.warnings.set(res.warnings ?? []);
          const byCode = new Map(
            (res.suggestions ?? []).map((s) => [s.productCode, s] as const),
          );
          this.rows.update((prev) =>
            prev.map((row) => {
              const sug = byCode.get(row.productCode);
              if (!sug) return { ...row, reason: undefined, confidence: 0 };
              if (row.menuItemId) {
                return {
                  ...row,
                  reason: sug.reason,
                  confidence: sug.confidence,
                };
              }
              return {
                ...row,
                menuItemId: sug.menuItemId,
                reason: sug.reason,
                confidence: sug.confidence,
              };
            }),
          );
          this.suggesting.set(false);
        },
        error: () => {
          this.suggesting.set(false);
          if (!silent) {
            this.snack.open('No se pudieron obtener sugerencias', 'OK', { duration: 3000 });
          }
        },
      });
  }

  setLink(productId: string, menuItemId: string): void {
    this.rows.update((prev) =>
      prev.map((r) =>
        r.id === productId
          ? { ...r, menuItemId: menuItemId || null, reason: undefined, confidence: 0 }
          : r,
      ),
    );
  }

  confirm(): void {
    const links = this.rows().map((r) => ({
      productId: r.id,
      menuItemId: r.menuItemId,
    }));
    this.busy.set(true);
    this.http
      .post<{ updated: number }>(
        `${environment.apiUrl}/shops/${this.data.shopId}/pos-catalog/link-commit`,
        { links },
      )
      .subscribe({
        next: (r) => {
          this.busy.set(false);
          this.snack.open(`Enlaces guardados (${r.updated})`, 'OK', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err) => {
          this.busy.set(false);
          const msg = apiErrorMessage(err, 'No se pudieron guardar los enlaces');
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }
}
