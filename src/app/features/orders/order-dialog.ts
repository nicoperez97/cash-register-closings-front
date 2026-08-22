import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import {
  SelectSearchComponent,
  filterBySelectQuery,
  normalizeSelectQuery,
  onSelectSearchOpened,
} from '../../shared/components/select-search';
import { StockApiService, StockCategory, StockProduct } from '../stock/stock-api.service';
import { ShortagesApiService, Shortage } from '../shortages/shortages-api.service';
import {
  ORDER_SOURCE_OPTIONS,
  Order,
  OrderSource,
  OrdersApiService,
} from './orders-api.service';

export type OrderDialogData = {
  shopId: string;
};

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toDateString(value: Date | null): string {
  if (!value) return isoToday();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

const CREATE_VALUE = '__create__';

@Component({
  selector: 'app-order-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatIconModule,
    MatSnackBarModule,
    BusyLabelComponent,
    SelectSearchComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>local_shipping</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Nuevo pedido</strong>
        <span>Fecha, materiales y factura</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="ord-form" [formGroup]="form">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Fecha del pedido</mat-label>
          <input matInput [matDatepicker]="picker" formControlName="orderDate" />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Notas (opcional)</mat-label>
          <input matInput formControlName="notes" />
        </mat-form-field>

        <div class="ord-file">
          <span>Factura</span>
          <input #fileInput type="file" accept="application/pdf,image/*" hidden (change)="onFile($event)" />
          <button mat-stroked-button type="button" (click)="fileInput.click()">
            <mat-icon>attach_file</mat-icon>
            {{ fileName() || 'Adjuntar factura' }}
          </button>
        </div>

        <div class="ord-lines">
          <div class="ord-lines__head">
            <strong>Materiales</strong>
            <button mat-stroked-button type="button" (click)="addLine()">
              <mat-icon>add</mat-icon>
              Agregar
            </button>
          </div>
          @for (line of lines.controls; track $index; let i = $index) {
            <div class="ord-line" [formGroup]="line">
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Tipo</mat-label>
                <mat-select formControlName="source" (selectionChange)="onSourceChange(i)">
                  @for (opt of sources; track opt.value) {
                    <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Material</mat-label>
                <mat-select
                  formControlName="itemId"
                  panelClass="guy-select-search-panel"
                  (openedChange)="onSelectSearchOpened($event, queryRef(i))"
                  (selectionChange)="onItemPicked(i, $event.value)"
                >
                  <mat-option disabled class="select-search-opt">
                    <app-select-search
                      [query]="queryAt(i)"
                      (queryChange)="setQuery(i, $event)"
                      placeholder="Buscar o escribir para crear…"
                    />
                  </mat-option>
                  <mat-option disabled>Si no está, escribí el nombre y crealo</mat-option>
                  @for (item of filteredItems(i); track item.id) {
                    <mat-option [value]="item.id">{{ item.name }}</mat-option>
                  }
                  @if (canCreateMaterial(i)) {
                    <mat-option [value]="createValue">
                      Crear «{{ queryAt(i).trim() }}»
                    </mat-option>
                  } @else if (queryAt(i) && !filteredItems(i).length) {
                    <mat-option disabled>Sin resultados. Escribí el nombre para crearlo.</mat-option>
                  }
                </mat-select>
                <mat-hint>Buscá o escribí el nombre para crear uno nuevo</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Cantidad</mat-label>
                <input matInput type="number" min="0.01" step="0.01" formControlName="quantity" />
              </mat-form-field>
              <button mat-icon-button type="button" aria-label="Quitar" (click)="removeLine(i)">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          }
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">Cancelar</button>
      <button mat-flat-button color="primary" type="button" [disabled]="busy() || creating() || form.invalid || !file()" (click)="save()">
        <app-busy-label [busy]="busy()" busyLabel="Guardando…">
          <mat-icon>save</mat-icon>
          Guardar pedido
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .ord-form {
      display: grid;
      gap: 0.75rem;
    }
    .ord-file {
      display: grid;
      gap: 0.35rem;
    }
    .ord-file span {
      font-size: 0.82rem;
      font-weight: 650;
    }
    .ord-lines__head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }
    .ord-line {
      display: grid;
      gap: 0.45rem;
      grid-template-columns: 1fr;
      align-items: start;
      padding: 0.65rem 0 0;
      border-top: 1px solid var(--guy-border, #eee);
    }
    @media (min-width: 720px) {
      .ord-line {
        grid-template-columns: 8.5rem minmax(0, 1fr) 7rem auto;
      }
    }
  `,
})
export class OrderDialogComponent {
  readonly data = inject<OrderDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<OrderDialogComponent, Order | false>);
  private readonly api = inject(OrdersApiService);
  private readonly stockApi = inject(StockApiService);
  private readonly shortagesApi = inject(ShortagesApiService);
  private readonly snack = inject(MatSnackBar);

  readonly sources = ORDER_SOURCE_OPTIONS;
  readonly createValue = CREATE_VALUE;
  readonly onSelectSearchOpened = onSelectSearchOpened;
  readonly busy = signal(false);
  readonly creating = signal(false);
  readonly file = signal<File | null>(null);
  readonly fileName = signal('');
  readonly foodItems = signal<StockProduct[]>([]);
  readonly beverageItems = signal<StockProduct[]>([]);
  readonly shortageItems = signal<Shortage[]>([]);
  readonly foodCategories = signal<StockCategory[]>([]);
  readonly beverageCategories = signal<StockCategory[]>([]);
  readonly materialQueries = signal<string[]>(['']);

  readonly form = new FormGroup({
    orderDate: new FormControl(parseIso(isoToday()), { nonNullable: true, validators: [Validators.required] }),
    notes: new FormControl('', { nonNullable: true }),
    lines: new FormArray([this.newLine()]),
  });

  get lines(): FormArray<FormGroup<{
    source: FormControl<OrderSource>;
    itemId: FormControl<string>;
    quantity: FormControl<number>;
  }>> {
    return this.form.controls.lines as FormArray<FormGroup<{
      source: FormControl<OrderSource>;
      itemId: FormControl<string>;
      quantity: FormControl<number>;
    }>>;
  }

  constructor() {
    this.stockApi.listProducts(this.data.shopId, 'food').subscribe({
      next: (rows) => this.foodItems.set(rows.filter((r) => r.active !== false)),
      error: () => this.foodItems.set([]),
    });
    this.stockApi.listProducts(this.data.shopId, 'beverage').subscribe({
      next: (rows) => this.beverageItems.set(rows.filter((r) => r.active !== false)),
      error: () => this.beverageItems.set([]),
    });
    this.shortagesApi.list(this.data.shopId).subscribe({
      next: (rows) => this.shortageItems.set(rows.filter((r) => r.active !== false)),
      error: () => this.shortageItems.set([]),
    });
    this.stockApi.listCategories(this.data.shopId, 'food').subscribe({
      next: (rows) => this.foodCategories.set(rows.filter((r) => r.active !== false)),
      error: () => this.foodCategories.set([]),
    });
    this.stockApi.listCategories(this.data.shopId, 'beverage').subscribe({
      next: (rows) => this.beverageCategories.set(rows.filter((r) => r.active !== false)),
      error: () => this.beverageCategories.set([]),
    });
  }

  queryAt(index: number): string {
    return this.materialQueries()[index] ?? '';
  }

  setQuery(index: number, value: string): void {
    this.materialQueries.update((rows) => {
      const next = [...rows];
      while (next.length <= index) next.push('');
      next[index] = value;
      return next;
    });
  }

  queryRef(index: number): { set(value: string): void } {
    return { set: (value) => this.setQuery(index, value) };
  }

  filteredItems(index: number): Array<{ id: string; name: string }> {
    const source = this.lines.at(index).controls.source.value;
    const selected = this.lines.at(index).controls.itemId.value;
    return filterBySelectQuery(this.itemsFor(source), this.queryAt(index), (item) => item.name, selected);
  }

  canCreateMaterial(index: number): boolean {
    const name = this.queryAt(index).trim();
    if (name.length < 2) return false;
    const key = normalizeSelectQuery(name);
    return !this.itemsFor(this.lines.at(index).controls.source.value).some(
      (item) => normalizeSelectQuery(item.name) === key,
    );
  }

  onItemPicked(index: number, value: string): void {
    if (value !== CREATE_VALUE) return;
    this.lines.at(index).controls.itemId.setValue('', { emitEvent: false });
    void this.createMaterial(index);
  }

  async createMaterial(index: number): Promise<void> {
    const name = this.queryAt(index).trim();
    if (name.length < 2 || this.creating()) return;
    const source = this.lines.at(index).controls.source.value;
    this.creating.set(true);
    try {
      if (source === 'shortage') {
        const created = await firstValueFrom(
          this.shortagesApi.create(this.data.shopId, { name, level: 'NORMAL' }),
        );
        this.shortageItems.update((rows) =>
          [...rows, created].sort((a, b) => a.name.localeCompare(b.name, 'es')),
        );
        this.lines.at(index).controls.itemId.setValue(created.id);
      } else {
        const cats = source === 'beverage' ? this.beverageCategories() : this.foodCategories();
        const created = await firstValueFrom(
          this.stockApi.createProduct(this.data.shopId, source, {
            name,
            quantity: 0,
            ...(cats[0]
              ? { categoryId: cats[0].id }
              : { newCategory: { name: 'General' } }),
          }),
        );
        if (!cats[0]) {
          this.stockApi.listCategories(this.data.shopId, source).subscribe({
            next: (rows) => {
              const list = rows.filter((r) => r.active !== false);
              if (source === 'beverage') this.beverageCategories.set(list);
              else this.foodCategories.set(list);
            },
          });
        }
        const target = source === 'beverage' ? this.beverageItems : this.foodItems;
        target.update((rows) => [...rows, created].sort((a, b) => a.name.localeCompare(b.name, 'es')));
        this.lines.at(index).controls.itemId.setValue(created.id);
      }
      this.setQuery(index, '');
    } catch (err: unknown) {
      const msg = (err as { error?: { message?: string | string[] } })?.error?.message ?? 'No se pudo crear el material';
      this.snack.open(Array.isArray(msg) ? msg.join(', ') : String(msg), 'OK', { duration: 4000 });
    } finally {
      this.creating.set(false);
    }
  }

  private newLine() {
    return new FormGroup({
      source: new FormControl<OrderSource>('food', { nonNullable: true }),
      itemId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      quantity: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(0.01)] }),
    });
  }

  itemsFor(source: OrderSource): Array<{ id: string; name: string }> {
    if (source === 'beverage') return this.beverageItems();
    if (source === 'shortage') return this.shortageItems();
    return this.foodItems();
  }

  onSourceChange(index: number): void {
    this.lines.at(index).controls.itemId.setValue('');
    this.setQuery(index, '');
  }

  addLine(): void {
    this.lines.push(this.newLine());
    this.materialQueries.update((rows) => [...rows, '']);
  }

  removeLine(index: number): void {
    if (this.lines.length === 1) return;
    this.lines.removeAt(index);
    this.materialQueries.update((rows) => rows.filter((_, i) => i !== index));
  }

  onFile(ev: Event): void {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.file.set(f);
    this.fileName.set(f.name);
  }

  save(): void {
    const file = this.file();
    if (!file || this.form.invalid) {
      this.form.markAllAsTouched();
      if (!file) this.snack.open('Adjuntá la factura', 'OK', { duration: 3000 });
      return;
    }
    const raw = this.form.getRawValue();
    const lines = raw.lines.map((line) => ({
      source: line.source,
      productId: line.source === 'shortage' ? null : line.itemId,
      shortageId: line.source === 'shortage' ? line.itemId : null,
      quantity: Number(line.quantity),
    }));
    this.busy.set(true);
    this.api
      .create(
        this.data.shopId,
        {
          orderDate: toDateString(raw.orderDate),
          notes: raw.notes.trim() || null,
          lines,
        },
        file,
      )
      .subscribe({
        next: (saved) => {
          this.busy.set(false);
          this.ref.close(saved);
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar el pedido';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
        },
      });
  }
}
