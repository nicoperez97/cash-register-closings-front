import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { usePageRefresh } from '../../core/page-refresh.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { SpinnerComponent } from '../../shared/components/spinner';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import {
  isCriticalShortageLevel,
  SHORTAGE_LEVEL_OPTIONS,
  Shortage,
  ShortageLevel,
  ShortagesApiService,
  shortageLevelLabel,
} from './shortages-api.service';

export type ShortageDialogData = {
  shopId: string;
  shopName: string;
} & ({ mode: 'create' } | { mode: 'edit'; shortage: Shortage });

@Component({
  selector: 'app-shortage-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSnackBarModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'report' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar faltante' : 'Nuevo faltante' }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <mat-icon matPrefix>label</mat-icon>
          <input matInput formControlName="name" autocomplete="off" />
        </mat-form-field>

        <div class="level-field">
          <span class="level-field__label">Nivel</span>
          <mat-button-toggle-group
            formControlName="level"
            class="level-toggle"
            hideSingleSelectionIndicator
            aria-label="Nivel del faltante"
          >
            @for (opt of levelOptions; track opt.value) {
              <mat-button-toggle [value]="opt.value">{{ opt.label }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
        </div>

        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Notas</mat-label>
          <mat-icon matPrefix>notes</mat-icon>
          <textarea matInput rows="2" formControlName="notes"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">
        Cancelar
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="form.invalid || busy()"
        (click)="save()"
      >
        <app-busy-label [busy]="busy()" [busyLabel]="isEdit ? 'Guardando…' : 'Creando…'">
          <mat-icon>{{ isEdit ? 'save' : 'add' }}</mat-icon>
          {{ isEdit ? 'Guardar' : 'Crear' }}
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .level-field {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin-bottom: 0.25rem;
      }
      .level-field__label {
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--guy-muted, #5f6f76);
      }
      .level-toggle {
        width: 100%;
        display: grid !important;
        grid-template-columns: repeat(4, 1fr);
        border-radius: 12px;
        overflow: hidden;
      }
      .level-toggle .mat-button-toggle-button {
        width: 100%;
      }
      .level-toggle .mat-button-toggle-label-content {
        width: 100%;
        text-align: center;
        padding: 0.45rem 0.35rem !important;
        font-size: 0.85rem;
      }
    `,
  ],
})
export class ShortageDialogComponent {
  readonly data = inject<ShortageDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ShortageDialogComponent, Shortage | boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ShortagesApiService);
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = this.data.mode === 'edit';
  readonly shortage = this.data.mode === 'edit' ? this.data.shortage : null;
  readonly busy = signal(false);
  readonly levelOptions = SHORTAGE_LEVEL_OPTIONS;

  readonly form = this.fb.nonNullable.group({
    name: [this.shortage?.name ?? '', Validators.required],
    level: [this.shortage?.level ?? ('NORMAL' as ShortageLevel), Validators.required],
    notes: [this.shortage?.notes ?? ''],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const body = {
      name: raw.name.trim(),
      level: raw.level,
      notes: raw.notes.trim() || null,
    };
    this.busy.set(true);
    const req =
      this.isEdit && this.shortage
        ? this.api.update(this.data.shopId, this.shortage.id, body)
        : this.api.create(this.data.shopId, body);
    req.subscribe({
      next: (row) => {
        this.busy.set(false);
        this.snack.open(this.isEdit ? 'Faltante actualizado' : 'Faltante creado', 'OK', {
          duration: 2500,
        });
        this.ref.close(row);
      },
      error: (err) => {
        this.busy.set(false);
        const msg =
          err?.error?.message || (this.isEdit ? 'No se pudo guardar' : 'No se pudo crear');
        this.snack.open(Array.isArray(msg) ? msg[0] : msg, 'OK', { duration: 3500 });
      },
    });
  }
}

@Component({
  selector: 'app-shortages-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatDialogModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
    PageHeaderComponent,
    SpinnerComponent,
  ],
  template: `
    <app-page-header
      title="Faltantes"
      [subtitle]="shops.selectedShop()?.name ?? 'Local'"
      [actionLabel]="canManage() ? 'Nuevo faltante' : ''"
      [actionDisabled]="!canManage()"
      actionIcon="add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    <div class="panel-card shortages-toolbar mb-3">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="shortages-search">
        <mat-label>Buscar</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input
          matInput
          [ngModel]="searchQuery()"
          (ngModelChange)="searchQuery.set($event)"
          placeholder="Nombre o notas"
          autocomplete="off"
        />
        @if (searchQuery().trim()) {
          <button
            matSuffix
            mat-icon-button
            type="button"
            aria-label="Limpiar búsqueda"
            (click)="searchQuery.set('')"
          >
            <mat-icon>close</mat-icon>
          </button>
        }
      </mat-form-field>

      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="shortages-sort">
        <mat-label>Ordenar</mat-label>
        <mat-icon matPrefix>sort</mat-icon>
        <mat-select [ngModel]="sortBy()" (ngModelChange)="sortBy.set($event)">
          <mat-option value="level-asc">Nivel (crítico → mucho)</mat-option>
          <mat-option value="level-desc">Nivel (mucho → crítico)</mat-option>
          <mat-option value="name-asc">Nombre A–Z</mat-option>
          <mat-option value="name-desc">Nombre Z–A</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-slide-toggle [ngModel]="criticalOnly()" (ngModelChange)="criticalOnly.set($event)">
        Solo críticos
      </mat-slide-toggle>
      <span class="shortages-toolbar__meta">
        {{ filteredRows().length }}
        faltante{{ filteredRows().length === 1 ? '' : 's' }}
        @if (criticalOnly()) {
          · Nada / Poco
        }
      </span>
    </div>

    <div class="shortage-list">
      @if (loading()) {
        <div
          class="panel-card guy-empty guy-empty--loading"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <app-spinner [size]="28" tone="accent" />
          <div>
            <strong>Cargando…</strong>
            <div class="small">Obteniendo faltantes</div>
          </div>
        </div>
      } @else {
        @for (row of filteredRows(); track row.id) {
          <article
            class="panel-card shortage-card"
            [class.shortage-card--critical]="isCritical(row.level)"
            [attr.data-level]="row.level"
          >
            <div class="shortage-card__main">
              <div class="shortage-card__info">
                <div class="shortage-card__title-row">
                  <h3 class="shortage-card__name">{{ row.name }}</h3>
                  @if (!canManage()) {
                    <span class="level-chip" [attr.data-level]="row.level">
                      {{ levelLabel(row.level) }}
                    </span>
                  }
                </div>
                @if (row.notes) {
                  <p class="shortage-card__notes">{{ row.notes }}</p>
                }
              </div>
              @if (canManage()) {
                <div class="shortage-card__actions">
                  <button mat-icon-button type="button" matTooltip="Editar" (click)="openEdit(row)">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    type="button"
                    matTooltip="Eliminar"
                    (click)="onDelete(row)"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              }
            </div>
            @if (canManage()) {
              <div class="shortage-card__level">
                <mat-button-toggle-group
                  class="level-toggle"
                  [attr.data-level]="row.level"
                  [ngModel]="row.level"
                  [disabled]="updatingId() === row.id"
                  hideSingleSelectionIndicator
                  [attr.aria-label]="'Nivel de ' + row.name"
                  (ngModelChange)="onLevelChange(row, $event)"
                >
                  @for (opt of levelOptions; track opt.value) {
                    <mat-button-toggle [value]="opt.value">{{ opt.label }}</mat-button-toggle>
                  }
                </mat-button-toggle-group>
              </div>
            }
          </article>
        } @empty {
          <div class="panel-card guy-empty">
            <mat-icon>report</mat-icon>
            <div>
              <strong>
                {{ criticalOnly() ? 'Sin faltantes críticos' : 'Sin faltantes todavía' }}
              </strong>
              <div class="small">
                @if (criticalOnly()) {
                  No hay ítems en Nada o Poco.
                } @else if (canManage()) {
                  Creá el primero con “Nuevo faltante”.
                } @else {
                  No hay faltantes cargados.
                }
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .shortages-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
      }
      .shortages-search {
        flex: 1 1 12rem;
        min-width: 10rem;
        max-width: 22rem;
        margin: 0;
      }
      .shortages-sort {
        flex: 0 1 14rem;
        min-width: 11rem;
        margin: 0;
      }
      .shortages-toolbar__meta {
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
        margin-left: auto;
      }
      .shortage-list {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }
      .shortage-card {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }
      .shortage-card__main {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
      }
      .shortage-card__info {
        min-width: 0;
        flex: 1 1 auto;
      }
      .shortage-card__title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem 0.65rem;
      }
      .shortage-card__name {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
      }
      .shortage-card__notes {
        margin: 0.4rem 0 0;
        font-size: 0.88rem;
        color: var(--guy-muted, #5f6f76);
        white-space: pre-wrap;
      }
      .shortage-card__actions {
        display: flex;
        gap: 0.1rem;
        flex-shrink: 0;
      }
      .shortage-card__level {
        width: 100%;
      }
      .shortage-card--critical {
        border-left: 4px solid #c62828;
      }
      .level-toggle {
        width: 100%;
        display: grid !important;
        grid-template-columns: repeat(4, 1fr);
        border-radius: 12px;
        overflow: hidden;
      }
      .level-toggle .mat-button-toggle-button {
        width: 100%;
      }
      .level-toggle .mat-button-toggle-label-content {
        width: 100%;
        text-align: center;
        padding: 0.4rem 0.25rem !important;
        font-size: 0.82rem;
        font-weight: 650;
      }
      .level-toggle[data-level='NONE'] .mat-button-toggle-checked {
        background: color-mix(in srgb, #c62828 16%, #fff) !important;
        color: #b71c1c;
      }
      .level-toggle[data-level='LOW'] .mat-button-toggle-checked {
        background: color-mix(in srgb, #f59e0b 20%, #fff) !important;
        color: #b45309;
      }
      .level-chip {
        display: inline-flex;
        align-items: center;
        min-height: 1.45rem;
        padding: 0.1rem 0.55rem;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        border: 1px solid transparent;
        background: color-mix(in srgb, var(--guy-muted, #5f6f76) 12%, #fff);
        color: var(--guy-muted, #5f6f76);
      }
      .level-chip[data-level='NONE'] {
        background: color-mix(in srgb, #c62828 14%, #fff);
        border-color: color-mix(in srgb, #c62828 35%, transparent);
        color: #b71c1c;
      }
      .level-chip[data-level='LOW'] {
        background: color-mix(in srgb, #f59e0b 18%, #fff);
        border-color: color-mix(in srgb, #f59e0b 40%, transparent);
        color: #b45309;
      }
      .level-chip[data-level='NORMAL'],
      .level-chip[data-level='HIGH'] {
        background: color-mix(in srgb, var(--guy-navy, #003366) 8%, #fff);
        border-color: color-mix(in srgb, var(--guy-navy, #003366) 16%, transparent);
        color: color-mix(in srgb, var(--guy-navy, #003366) 75%, #5f6f76);
      }
    `,
  ],
})
export class ShortagesPage {
  private readonly api = inject(ShortagesApiService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly rows = signal<Shortage[]>([]);
  readonly loading = signal(true);
  readonly criticalOnly = signal(false);
  readonly searchQuery = signal('');
  readonly sortBy = signal<'level-asc' | 'level-desc' | 'name-asc' | 'name-desc'>('level-asc');
  readonly updatingId = signal<string | null>(null);
  readonly levelOptions = SHORTAGE_LEVEL_OPTIONS;

  private readonly levelRank: Record<ShortageLevel, number> = {
    NONE: 0,
    LOW: 1,
    NORMAL: 2,
    HIGH: 3,
  };

  readonly filteredRows = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    let list = this.rows();
    if (this.criticalOnly()) {
      list = list.filter((r) => isCriticalShortageLevel(r.level));
    }
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.notes ?? '').toLowerCase().includes(q) ||
          shortageLevelLabel(r.level).toLowerCase().includes(q),
      );
    }
    const sort = this.sortBy();
    const ranked = [...list];
    ranked.sort((a, b) => {
      if (sort === 'name-asc') return a.name.localeCompare(b.name, 'es');
      if (sort === 'name-desc') return b.name.localeCompare(a.name, 'es');
      const diff = this.levelRank[a.level] - this.levelRank[b.level];
      if (sort === 'level-desc') return -diff || a.name.localeCompare(b.name, 'es');
      return diff || a.name.localeCompare(b.name, 'es');
    });
    return ranked;
  });

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (!shopId) {
        this.rows.set([]);
        this.loading.set(false);
        return;
      }
      this.reload();
    });
  }

  canManage(): boolean {
    return hasShopPermission(
      this.auth.currentUser(),
      this.shops.selectedShopId(),
      'shortages.manage',
    );
  }

  levelLabel(level: ShortageLevel): string {
    return shortageLevelLabel(level);
  }

  isCritical(level: ShortageLevel): boolean {
    return isCriticalShortageLevel(level);
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.list(shopId).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar los faltantes', 'OK', { duration: 3000 });
      },
    });
  }

  onLevelChange(row: Shortage, level: ShortageLevel): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage() || level === row.level || this.updatingId()) return;

    const previous = row.level;
    this.rows.update((list) =>
      list.map((r) => (r.id === row.id ? { ...r, level, levelLabel: shortageLevelLabel(level) } : r)),
    );
    this.updatingId.set(row.id);

    this.api.update(shopId, row.id, { level }).subscribe({
      next: (updated) => {
        this.updatingId.set(null);
        this.rows.update((list) => list.map((r) => (r.id === updated.id ? updated : r)));
        if (isCriticalShortageLevel(level) && !isCriticalShortageLevel(previous)) {
          this.snack.open('Nivel actualizado · se avisó a los administradores', 'OK', {
            duration: 2800,
          });
        } else {
          this.snack.open('Nivel actualizado', 'OK', { duration: 1800 });
        }
      },
      error: () => {
        this.updatingId.set(null);
        this.rows.update((list) =>
          list.map((r) =>
            r.id === row.id
              ? { ...r, level: previous, levelLabel: shortageLevelLabel(previous) }
              : r,
          ),
        );
        this.snack.open('No se pudo actualizar el nivel', 'OK', { duration: 3500 });
      },
    });
  }

  openCreate(): void {
    this.openDialog({ mode: 'create' });
  }

  openEdit(row: Shortage): void {
    this.openDialog({ mode: 'edit', shortage: row });
  }

  async onDelete(row: Shortage): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const ok = await this.confirmDialog.confirm(
      'Eliminar faltante',
      `¿Eliminar «${row.name}»?`,
    );
    if (!ok) return;
    this.api.remove(shopId, row.id).subscribe({
      next: () => {
        this.snack.open('Faltante eliminado', 'OK', { duration: 2500 });
        this.reload();
      },
      error: () => this.snack.open('No se pudo eliminar', 'OK', { duration: 3500 }),
    });
  }

  private openDialog(
    mode: { mode: 'create' } | { mode: 'edit'; shortage: Shortage },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    this.dialogTitle
      .track(
        this.dialog.open(ShortageDialogComponent, {
          width: '480px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { ...mode, shopId, shopName },
        }),
        mode.mode === 'edit' ? 'Editar faltante' : 'Nuevo faltante',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }
}
