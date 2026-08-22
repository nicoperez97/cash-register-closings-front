import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { forkJoin } from 'rxjs';
import {
  AccountImportMapping,
  Concept,
  ConceptImportMapping,
  LedgerAccount,
  MovementImportItem,
  MovementsApiService,
} from './movements-api.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';

export type LedgerImportKind = 'expense' | 'income' | 'transfer';

export interface MovementsExcelImportDialogData {
  shopId: string;
  shopName: string;
  kind?: LedgerImportKind;
}

const CREATE_VALUE = '__create__';

type NameChoice = {
  excelName: string;
  usageCount: number;
  selectedId: string;
};

function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

@Component({
  selector: 'app-movements-excel-import-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTabsModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>table_view</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ title() }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="text-muted mb-3">
        Subí el Excel del contador. Asigná cuentas y conceptos a los del local, o crealos.
        Las filas que ya existen no se duplican.
      </p>

      <div class="xl-actions mb-3">
        <button mat-stroked-button type="button" (click)="downloadTemplate()" [disabled]="busy()">
          <mat-icon>download</mat-icon>
          Descargar plantilla
        </button>
        <input
          #fileInput
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          (change)="onFile($event)"
        />
        <button mat-stroked-button type="button" (click)="fileInput.click()" [disabled]="busy()">
          <mat-icon>attach_file</mat-icon>
          {{ fileName() || 'Elegir Excel' }}
        </button>
      </div>

      @if (busy()) {
        <mat-progress-bar mode="indeterminate" class="guy-progress mb-3" />
      }

      @if (items().length) {
        <mat-tab-group animationDuration="0" class="xl-tabs" dynamicHeight mat-stretch-tabs>
          <mat-tab>
            <ng-template mat-tab-label>
              Cargar
              @if (invalidCount() > 0) {
                <span class="xl-tab-badge">{{ invalidCount() }}</span>
              }
            </ng-template>
            <div class="xl-tab-body">
        <div class="xl-modules mb-3">
          <span class="xl-section-label">Cargar en</span>
          <mat-checkbox
            [checked]="modules().expense"
            (change)="toggleModule('expense', $event.checked)"
          >
            Gastos ({{ kindCount('expense') }})
          </mat-checkbox>
          <mat-checkbox
            [checked]="modules().income"
            (change)="toggleModule('income', $event.checked)"
          >
            Ingresos ({{ kindCount('income') }})
          </mat-checkbox>
          <mat-checkbox
            [checked]="modules().transfer"
            (change)="toggleModule('transfer', $event.checked)"
          >
            Movimientos ({{ kindCount('transfer') }})
          </mat-checkbox>
        </div>

        <div class="xl-stats mb-3">
          <div class="xl-stat">
            <strong>{{ items().length }}</strong>
            <span>filas</span>
          </div>
          <div class="xl-stat xl-stat--ok">
            <strong>{{ validCount() }}</strong>
            <span>nuevas</span>
          </div>
          <div class="xl-stat">
            <strong>{{ existsCount() }}</strong>
            <span>ya existen</span>
          </div>
          <div class="xl-stat" [class.xl-stat--error]="invalidCount() > 0">
            <strong>{{ invalidCount() }}</strong>
            <span>con error</span>
          </div>
        </div>

        @if (errorRows().length) {
          <section class="xl-block mb-3">
            <h3 class="xl-block__title xl-block__title--error">
              Errores ({{ errorRows().length }})
            </h3>
            <p class="text-muted mb-2">Estas filas no se importan. Revisá el Excel o el mapeo.</p>
            <div class="xl-error-list">
              @for (row of errorRows(); track row.rowNumber) {
                <article class="xl-error-card">
                  <header>
                    <strong>Fila {{ row.rowNumber }}</strong>
                    <span>{{ row.businessDate || 'sin fecha' }} · {{ money(row.amountUyu) }}</span>
                  </header>
                  <p>{{ row.error || 'Fila inválida' }}</p>
                  <p class="xl-error-card__meta">
                    {{ row.fromAccountName || '—' }} → {{ row.toAccountName || '—' }}
                    @if (row.conceptName) {
                      · {{ row.conceptName }}
                    }
                  </p>
                </article>
              }
            </div>
          </section>
        }

        <section class="xl-block">
          <h3 class="xl-block__title">Vista previa</h3>
          <div class="xl-preview-cards">
            @for (row of visibleCards(); track row.rowNumber) {
              <article
                class="xl-card"
                [class.xl-card--muted]="row.alreadyExists || !row.valid"
              >
                <header>
                  <strong>{{ row.businessDate }}</strong>
                  <span>{{ kindLabel(row.detectedKind) }} · {{ money(row.amountUyu) }}</span>
                </header>
                <p>
                  {{ mappedAccountLabel(row.fromAccountName) }}
                  → {{ mappedAccountLabel(row.toAccountName) }}
                </p>
                <p>
                  {{ mappedConceptLabel(row.conceptName) }}
                  @if (willCreateConcept(row.conceptName)) {
                    <span class="xl-new-user">nuevo</span>
                  }
                </p>
                <p>
                  @if (row.alreadyExists) {
                    Ya existe
                  } @else if (row.valid) {
                    Listo
                  } @else {
                    {{ row.error || 'Error' }}
                  }
                </p>
              </article>
            }
          </div>
          <div class="xl-preview">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Emisora</th>
                  <th>Receptora</th>
                  <th>Concepto</th>
                  <th>Importe</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                @for (row of visibleItems(); track row.rowNumber) {
                  <tr [class.xl-preview__exists]="row.alreadyExists || !row.valid">
                    <td>{{ row.businessDate }}</td>
                    <td>{{ kindLabel(row.detectedKind) }}</td>
                    <td>{{ mappedAccountLabel(row.fromAccountName) }}</td>
                    <td>{{ mappedAccountLabel(row.toAccountName) }}</td>
                    <td>
                      {{ mappedConceptLabel(row.conceptName) }}
                      @if (willCreateConcept(row.conceptName)) {
                        <span class="xl-new-user">nuevo</span>
                      }
                    </td>
                    <td>{{ money(row.amountUyu) }}</td>
                    <td>
                      @if (row.alreadyExists) {
                        Ya existe
                      } @else if (row.valid) {
                        Listo
                      } @else {
                        {{ row.error || 'Error' }}
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (items().length > 40) {
            <p class="text-muted mt-2">
              En el celular se muestran 40 filas. En escritorio, las primeras 100 de {{ items().length }}.
            </p>
          }
        </section>
            </div>
          </mat-tab>

          <mat-tab>
            <ng-template mat-tab-label>
              Cuentas
              <span class="xl-tab-count">{{ accountChoices().length }}</span>
            </ng-template>
            <div class="xl-tab-body">
              <p class="text-muted mb-2">
                Elegí qué cuenta del local es cada nombre del Excel. Si no está, creala.
              </p>
              <div class="xl-map-list">
                @for (row of accountChoices(); track row.excelName) {
                  <div class="xl-map-card">
                    <div>
                      <strong>{{ row.excelName }}</strong>
                      <span class="xl-map__count">{{ row.usageCount }} filas</span>
                    </div>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="xl-map__select">
                      <mat-label>Cuenta del local</mat-label>
                      <mat-select
                        [value]="row.selectedId"
                        (selectionChange)="setAccountChoice(row.excelName, $event.value)"
                      >
                        <mat-option [value]="createValue">Crear «{{ row.excelName }}»</mat-option>
                        @for (account of systemAccounts(); track account.id) {
                          <mat-option [value]="account.id">{{ account.name }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                    @if (row.selectedId === createValue) {
                      <span class="xl-new-user">se crea</span>
                    } @else {
                      <span class="xl-map__ok">asignada</span>
                    }
                  </div>
                }
              </div>
            </div>
          </mat-tab>

          <mat-tab>
            <ng-template mat-tab-label>
              Conceptos
              <span class="xl-tab-count">{{ conceptChoices().length }}</span>
            </ng-template>
            <div class="xl-tab-body">
              <p class="text-muted mb-2">
                Asigná cada concepto del Excel a uno del local, o crealo.
              </p>
              <div class="xl-map-list">
                @for (row of conceptChoices(); track row.excelName) {
                  <div class="xl-map-card">
                    <div>
                      <strong>{{ row.excelName }}</strong>
                      <span class="xl-map__count">{{ row.usageCount }} filas</span>
                    </div>
                    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="xl-map__select">
                      <mat-label>Concepto del local</mat-label>
                      <mat-select
                        [value]="row.selectedId"
                        (selectionChange)="setConceptChoice(row.excelName, $event.value)"
                      >
                        <mat-option [value]="createValue">Crear «{{ row.excelName }}»</mat-option>
                        @for (concept of systemConcepts(); track concept.id) {
                          <mat-option [value]="concept.id">
                            {{ concept.name }}
                            <span class="xl-kind-hint">{{ conceptKindLabel(concept.kind) }}</span>
                          </mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                    @if (row.selectedId === createValue) {
                      <span class="xl-new-user">se crea</span>
                    } @else {
                      <span class="xl-map__ok">asignado</span>
                    }
                  </div>
                }
              </div>
            </div>
          </mat-tab>
        </mat-tab-group>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">
        Cancelar
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="busy() || !file() || validCount() === 0"
        (click)="commit()"
      >
        <app-busy-label [busy]="busy()" busyLabel="Importando…">
          <mat-icon>cloud_upload</mat-icon>
          Importar {{ validCount() }} nuevas
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .xl-tabs {
        margin: 0 -0.15rem;
      }
      .xl-tabs ::ng-deep .mat-mdc-tab-body-content {
        overflow: visible;
      }
      .xl-tab-body {
        padding-top: 0.85rem;
      }
      .xl-tab-count,
      .xl-tab-badge {
        margin-left: 0.35rem;
        min-width: 1.25rem;
        padding: 0.05rem 0.4rem;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 650;
        text-align: center;
        background: color-mix(in srgb, var(--guy-navy, #003366) 12%, transparent);
      }
      .xl-tab-badge {
        background: color-mix(in srgb, #b3261e 18%, transparent);
        color: #b3261e;
      }
      .xl-actions {
        display: grid;
        gap: 0.5rem;
      }
      .xl-section-label,
      .xl-block__title {
        display: block;
        margin: 0 0 0.4rem;
        font-size: 0.95rem;
        font-weight: 650;
      }
      .xl-block__title--error {
        color: #b3261e;
      }
      .xl-modules {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.25rem 0.75rem;
      }
      .xl-stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.45rem;
      }
      .xl-stat {
        display: grid;
        gap: 0.1rem;
        padding: 0.55rem 0.7rem;
        border-radius: 12px;
        border: 1px solid var(--guy-border, #ddd);
        background: color-mix(in srgb, var(--guy-card, #fff) 88%, #f3f5f2);
      }
      .xl-stat strong {
        font-size: 1.05rem;
      }
      .xl-stat span {
        font-size: 0.75rem;
        color: var(--guy-muted, #667);
      }
      .xl-stat--ok {
        border-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 35%, var(--guy-border, #ddd));
      }
      .xl-stat--error {
        border-color: color-mix(in srgb, #b3261e 45%, var(--guy-border, #ddd));
      }
      .xl-map-list,
      .xl-error-list,
      .xl-preview-cards {
        display: grid;
        gap: 0.55rem;
      }
      .xl-map-card,
      .xl-error-card,
      .xl-card {
        display: grid;
        gap: 0.35rem;
        padding: 0.75rem 0.8rem;
        border: 1px solid var(--guy-border, #ddd);
        border-radius: 12px;
        background: var(--guy-card, #fff);
      }
      .xl-map__count {
        display: block;
        font-size: 0.75rem;
        color: var(--guy-muted, #667);
      }
      .xl-map__select {
        width: 100%;
      }
      .xl-map__ok {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--guy-accent, #2e7d32);
      }
      .xl-kind-hint {
        color: var(--guy-muted, #667);
        font-size: 0.78rem;
      }
      .xl-error-card header,
      .xl-card header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 0.35rem;
      }
      .xl-error-card p,
      .xl-card p {
        margin: 0;
        font-size: 0.85rem;
      }
      .xl-error-card__meta {
        color: var(--guy-muted, #667);
      }
      .xl-card--muted {
        opacity: 0.65;
      }
      .xl-preview {
        display: none;
        overflow: auto;
        max-height: 280px;
        border: 1px solid var(--guy-border, #ddd);
        border-radius: 10px;
      }
      .xl-preview table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
      }
      .xl-preview th,
      .xl-preview td {
        padding: 0.45rem 0.6rem;
        text-align: left;
        border-bottom: 1px solid var(--guy-border, #eee);
        white-space: nowrap;
      }
      .xl-preview th {
        position: sticky;
        top: 0;
        background: var(--guy-card, #fff);
      }
      .xl-preview__exists {
        opacity: 0.55;
      }
      .xl-new-user {
        display: inline-block;
        margin-left: 0.25rem;
        padding: 0.05rem 0.4rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 600;
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 18%, transparent);
        color: var(--guy-accent, #2e7d32);
      }
      @media (min-width: 720px) {
        .xl-actions {
          display: flex;
          flex-wrap: wrap;
        }
        .xl-stats {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .xl-map-card {
          grid-template-columns: minmax(7rem, 1fr) minmax(12rem, 1.4fr) auto;
          align-items: center;
        }
        .xl-preview-cards {
          display: none;
        }
        .xl-preview {
          display: block;
        }
      }
    `,
  ],
})
export class MovementsExcelImportDialogComponent {
  readonly data = inject<MovementsExcelImportDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<MovementsExcelImportDialogComponent, boolean>);
  private readonly api = inject(MovementsApiService);
  private readonly snack = inject(MatSnackBar);

  readonly createValue = CREATE_VALUE;
  readonly file = signal<File | null>(null);
  readonly fileName = signal('');
  readonly items = signal<MovementImportItem[]>([]);
  readonly systemAccounts = signal<LedgerAccount[]>([]);
  readonly systemConcepts = signal<Concept[]>([]);
  readonly accountChoices = signal<NameChoice[]>([]);
  readonly conceptChoices = signal<NameChoice[]>([]);
  readonly busy = signal(false);
  readonly modules = signal<Record<LedgerImportKind, boolean>>({
    expense: this.data.kind !== 'income' && this.data.kind !== 'transfer',
    income: this.data.kind === 'income' || !this.data.kind,
    transfer: this.data.kind === 'transfer' || !this.data.kind,
  });

  readonly title = () => 'Importar libro (gastos, ingresos y movimientos)';
  readonly noun = () => 'movimientos';

  readonly visibleItems = computed(() => this.items().slice(0, 100));
  readonly visibleCards = computed(() => this.items().slice(0, 40));
  readonly errorRows = computed(() => this.items().filter((i) => !i.valid));

  toggleModule(kind: LedgerImportKind, checked: boolean): void {
    this.modules.update((m) => ({ ...m, [kind]: checked }));
  }

  selectedModules(): LedgerImportKind[] {
    const m = this.modules();
    return (['expense', 'income', 'transfer'] as const).filter((k) => m[k]);
  }

  kindCount(kind: LedgerImportKind): number {
    return this.items().filter((i) => (i.detectedKind ?? this.fallbackKind(i)) === kind).length;
  }

  kindLabel(kind?: LedgerImportKind | null): string {
    if (kind === 'income') return 'Ingreso';
    if (kind === 'transfer') return 'Movimiento';
    if (kind === 'expense') return 'Gasto';
    return '—';
  }

  conceptKindLabel(kind?: string | null): string {
    if (kind === 'INCOME') return 'Ingreso';
    if (kind === 'EXPENSE') return 'Gasto';
    if (kind === 'TRANSFER') return 'Movimiento';
    return '';
  }

  private fallbackKind(_item: MovementImportItem): LedgerImportKind {
    return this.data.kind ?? 'expense';
  }

  setAccountChoice(excelName: string, selectedId: string): void {
    this.accountChoices.update((rows) =>
      rows.map((row) => (row.excelName === excelName ? { ...row, selectedId } : row)),
    );
  }

  setConceptChoice(excelName: string, selectedId: string): void {
    this.conceptChoices.update((rows) =>
      rows.map((row) => (row.excelName === excelName ? { ...row, selectedId } : row)),
    );
  }

  private accountChoice(excelName: string): NameChoice | undefined {
    const key = nameKey(excelName || '');
    return this.accountChoices().find((row) => nameKey(row.excelName) === key);
  }

  private conceptChoice(excelName: string): NameChoice | undefined {
    const key = nameKey(excelName || '');
    return this.conceptChoices().find((row) => nameKey(row.excelName) === key);
  }

  mappedAccountLabel(excelName: string): string {
    if (!excelName) return '—';
    const choice = this.accountChoice(excelName);
    if (!choice || choice.selectedId === CREATE_VALUE) return excelName;
    return this.systemAccounts().find((a) => a.id === choice.selectedId)?.name ?? excelName;
  }

  mappedConceptLabel(excelName: string | null): string {
    if (!excelName) return '—';
    const choice = this.conceptChoice(excelName);
    if (!choice || choice.selectedId === CREATE_VALUE) return excelName;
    return this.systemConcepts().find((c) => c.id === choice.selectedId)?.name ?? excelName;
  }

  willCreateConcept(excelName: string | null): boolean {
    if (!excelName) return false;
    const choice = this.conceptChoice(excelName);
    if (!choice) return false;
    return choice.selectedId === CREATE_VALUE;
  }

  validCount(): number {
    const selected = new Set(this.selectedModules());
    return this.items().filter(
      (i) =>
        i.valid &&
        !i.alreadyExists &&
        selected.has((i.detectedKind ?? this.fallbackKind(i)) as LedgerImportKind),
    ).length;
  }

  existsCount(): number {
    return this.items().filter((i) => i.alreadyExists).length;
  }

  invalidCount(): number {
    return this.items().filter((i) => !i.valid).length;
  }

  money(n: number): string {
    return `$ ${Number(n || 0).toLocaleString('es-AR')}`;
  }

  downloadTemplate(): void {
    this.busy.set(true);
    this.api.downloadImportTemplate(this.data.shopId, this.data.kind).subscribe({
      next: (blob) => {
        this.busy.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'plantilla-libro-diario.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('No se pudo descargar la plantilla', 'OK', { duration: 3500 });
      },
    });
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.file.set(f);
    this.fileName.set(f.name);
    this.busy.set(true);
    forkJoin({
      rows: this.api.previewExcelImport(this.data.shopId, f),
      accounts: this.api.accounts(this.data.shopId),
      concepts: this.api.concepts(this.data.shopId, { for: 'movement' }),
    }).subscribe({
      next: ({ rows, accounts, concepts }) => {
        const list: MovementImportItem[] = Array.isArray(rows) ? rows : [];
        const systemAccounts = (accounts ?? []).filter((a) => a.active !== false);
        const systemConcepts = (concepts ?? []).filter((c) => c.active !== false);
        this.items.set(list);
        this.systemAccounts.set(
          [...systemAccounts].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        );
        this.systemConcepts.set(
          [...systemConcepts].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        );
        this.accountChoices.set(
          this.buildChoices(list, (i) => [i.fromAccountName, i.toAccountName], systemAccounts.map((a) => ({ id: a.id, name: a.name }))),
        );
        this.conceptChoices.set(
          this.buildChoices(list, (i) => [i.conceptName], systemConcepts.map((c) => ({ id: c.id, name: c.name }))),
        );
        const present: Record<LedgerImportKind, boolean> = {
          expense: false,
          income: false,
          transfer: false,
        };
        for (const i of list) {
          const k = i.detectedKind;
          if (k === 'expense') present.expense = true;
          else if (k === 'income') present.income = true;
          else if (k === 'transfer') present.transfer = true;
        }
        this.modules.set(present);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.items.set([]);
        this.accountChoices.set([]);
        this.conceptChoices.set([]);
        const msg = err?.error?.message ?? 'No se pudo analizar el Excel';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }

  private buildChoices(
    items: MovementImportItem[],
    pickNames: (item: MovementImportItem) => Array<string | null | undefined>,
    catalog: Array<{ id: string; name: string }>,
  ): NameChoice[] {
    const counts = new Map<string, { name: string; count: number }>();
    for (const item of items) {
      for (const name of pickNames(item)) {
        const trimmed = (name || '').trim();
        if (!trimmed) continue;
        const key = nameKey(trimmed);
        const cur = counts.get(key) ?? { name: trimmed, count: 0 };
        cur.count += 1;
        counts.set(key, cur);
      }
    }
    return [...counts.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map((row) => ({
        excelName: row.name,
        usageCount: row.count,
        selectedId: this.suggestId(row.name, catalog),
      }));
  }

  private suggestId(excelName: string, catalog: Array<{ id: string; name: string }>): string {
    const key = nameKey(excelName);
    const exact = catalog.find((item) => nameKey(item.name) === key);
    return exact?.id ?? CREATE_VALUE;
  }

  private toAccountMap(): AccountImportMapping[] {
    return this.accountChoices().map((row) =>
      row.selectedId === CREATE_VALUE
        ? { excelName: row.excelName, create: true }
        : { excelName: row.excelName, accountId: row.selectedId },
    );
  }

  private toConceptMap(): ConceptImportMapping[] {
    return this.conceptChoices().map((row) =>
      row.selectedId === CREATE_VALUE
        ? { excelName: row.excelName, create: true }
        : { excelName: row.excelName, conceptId: row.selectedId },
    );
  }

  commit(): void {
    const f = this.file();
    if (!f) return;
    const modules = this.selectedModules();
    if (!modules.length) {
      this.snack.open('Elegí al menos un módulo para cargar', 'OK', { duration: 3500 });
      return;
    }
    this.busy.set(true);
    this.api
      .commitExcelImport(
        this.data.shopId,
        f,
        undefined,
        modules,
        this.toAccountMap(),
        this.toConceptMap(),
      )
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          const extra = [
            res.createdAccounts?.length ? `Cuentas: ${res.createdAccounts.join(', ')}` : '',
            res.createdConcepts?.length ? `Conceptos: ${res.createdConcepts.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join('. ');
          this.snack.open(
            `Importados ${res.createdCount} ${this.noun()}.${
              res.skippedCount ? ` Omitidos ${res.skippedCount} (ya existían).` : ''
            }${extra ? ' ' + extra : ''}`,
            'OK',
            { duration: 5500 },
          );
          this.ref.close(true);
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudo importar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
        },
      });
  }
}
