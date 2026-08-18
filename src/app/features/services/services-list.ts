import { Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { SpinnerComponent } from '../../shared/components/spinner';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { ShopService, ServicesApiService } from './services-api.service';
import { ServiceDialogComponent } from './service-dialog';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';

@Component({
  selector: 'app-services-list',
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
    PageHeaderComponent,
    SpinnerComponent,
    FiltersCollapseBtnComponent,
  ],
  template: `
    <app-page-header
      title="Servicios"
      [subtitle]="shops.selectedShop()?.name ?? 'Administración'"
      [actionLabel]="canManage() ? 'Nuevo servicio' : ''"
      [actionDisabled]="!canManage()"
      actionIcon="add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    <div
      class="panel-card guy-filters mb-3"
      [class.guy-filters--collapsed]="filtersCollapsed()"
    >
      <div class="guy-filters__head">
        <div>
          <h3 class="guy-filters__title">Filtros</h3>
          <p class="guy-filters__subtitle">Incluí servicios ocultos</p>
        </div>
        <div class="guy-filters__tools">
          <app-filters-collapse-btn
            [collapsed]="filtersCollapsed()"
            (toggle)="toggleFilters()"
          />
        </div>
      </div>
      <div class="guy-filters__body">
      <mat-slide-toggle [ngModel]="includeInactive()" (ngModelChange)="onToggleInactive($event)">
        Mostrar ocultos
      </mat-slide-toggle>
      </div>
    </div>

    <div class="service-list">
      @if (loading()) {
        <div class="panel-card guy-empty guy-empty--loading" role="status" aria-live="polite" aria-busy="true">
          <app-spinner [size]="28" tone="accent" />
          <div>
            <strong>Cargando…</strong>
            <div class="small">Obteniendo servicios</div>
          </div>
        </div>
      } @else {
        @for (row of rows(); track row.id) {
          <article class="panel-card service-card" [class.service-card--hidden]="!row.active">
            <div class="service-card__main">
              <div>
                <h3 class="service-card__name">{{ row.name }}</h3>
                <p class="service-card__meta">
                  {{ row.accountName || 'Sin cuenta' }}
                  @if (!row.active) {
                    · Oculto
                  }
                </p>
              </div>
              @if (canManage()) {
                <div class="service-card__actions">
                  <button mat-icon-button type="button" matTooltip="Editar" (click)="openEdit(row)">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    type="button"
                    [matTooltip]="row.active ? 'Ocultar' : 'Mostrar'"
                    (click)="onToggleVisibility(row)"
                  >
                    <mat-icon>{{ row.active ? 'visibility_off' : 'visibility' }}</mat-icon>
                  </button>
                </div>
              }
            </div>

            <div class="service-card__alias">
              <span class="service-card__label">Alias / CBU</span>
              <div class="service-card__alias-row">
                <code class="service-card__value">{{ row.bankAlias || '—' }}</code>
                @if (row.bankAlias) {
                  <button
                    mat-stroked-button
                    type="button"
                    (click)="copyAlias(row)"
                  >
                    <mat-icon>content_copy</mat-icon>
                    Copiar
                  </button>
                }
              </div>
            </div>
            @if (row.legalName || row.taxId) {
              <div class="service-card__alias">
                <span class="service-card__label">Datos fiscales</span>
                <div class="service-card__value">
                  @if (row.legalName) {
                    {{ row.legalName }}
                  }
                  @if (row.legalName && row.taxId) {
                    ·
                  }
                  @if (row.taxId) {
                    CUIT {{ row.taxId }}
                  }
                </div>
              </div>
            }
          </article>
        } @empty {
          <div class="panel-card guy-empty">
            <mat-icon>home_repair_service</mat-icon>
            <div>
              <strong>Sin servicios todavía</strong>
              <div class="small">Creá el primero para asociarle una cuenta y su alias/CBU.</div>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .service-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .service-card__main {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 0.85rem;
      }
      .service-card__name {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
      }
      .service-card__meta {
        margin: 0.2rem 0 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
      }
      .service-card__actions {
        display: flex;
        gap: 0.15rem;
      }
      .service-card__label {
        display: block;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--guy-muted, #5f6f76);
        margin-bottom: 0.25rem;
      }
      .service-card__alias-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
      }
      .service-card__value {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 0.95rem;
        word-break: break-all;
      }
      .service-card--hidden {
        opacity: 0.72;
      }
    `,
  ],
})
export class ServicesListPage {
  private readonly filtersUi = createFiltersCollapsed('services');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  private readonly api = inject(ServicesApiService);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly rows = signal<ShopService[]>([]);
  readonly loading = signal(true);
  readonly includeInactive = signal(false);

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
      'services.manage',
    );
  }

  onToggleInactive(value: boolean): void {
    this.includeInactive.set(value);
    this.reload();
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.list(shopId, this.includeInactive()).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar los servicios', 'OK', { duration: 3000 });
      },
    });
  }

  openCreate(): void {
    this.openDialog({ mode: 'create' });
  }

  openEdit(row: ShopService): void {
    this.openDialog({ mode: 'edit', service: row });
  }

  async copyAlias(row: ShopService): Promise<void> {
    const text = (row.bankAlias ?? '').trim();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      this.snack.open('Alias / CBU copiado', 'OK', { duration: 2000 });
    } catch {
      this.snack.open('No se pudo copiar', 'OK', { duration: 2500 });
    }
  }

  async onToggleVisibility(row: ShopService): Promise<void> {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;

    if (row.active) {
      const ok = await this.confirmDialog.confirm(
        'Ocultar servicio',
        `¿Ocultar a "${row.name}"?`,
      );
      if (!ok) return;
      this.api.remove(shopId, row.id).subscribe({
        next: () => {
          this.snack.open('Servicio oculto', 'OK', { duration: 2500 });
          this.reload();
        },
        error: () => this.snack.open('No se pudo ocultar', 'OK', { duration: 3500 }),
      });
      return;
    }

    this.api.update(shopId, row.id, { active: true }).subscribe({
      next: () => {
        this.snack.open('Servicio visible de nuevo', 'OK', { duration: 2500 });
        this.reload();
      },
      error: () => this.snack.open('No se pudo mostrar', 'OK', { duration: 3500 }),
    });
  }

  private openDialog(
    mode: { mode: 'create' } | { mode: 'edit'; service: ShopService },
  ): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    this.dialogTitle
      .track(
        this.dialog.open(ServiceDialogComponent, {
          width: '480px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { ...mode, shopId, shopName },
        }),
        mode.mode === 'edit' ? 'Editar servicio' : 'Nuevo servicio',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }
}
