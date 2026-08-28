import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { KpiStripComponent, KpiItem } from '../../shared/components/kpi-strip';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { UserAvatarComponent } from '../../shared/components/user-avatar';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { usePageRefresh } from '../../core/page-refresh.service';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import {
  UserActivityApiService,
  UserActivityBreakdown,
  UserActivityRow,
} from './user-activity-api.service';

const BREAKDOWN_LABELS: Record<keyof UserActivityBreakdown, string> = {
  closings: 'Cierres',
  settlements: 'Rendiciones',
  withdrawalsPicked: 'Retiros tomados',
  withdrawalsConfirmed: 'Retiros confirmados',
  paymentsCreated: 'Pagos creados',
  paymentsValidated: 'Pagos validados',
  paymentsPaid: 'Pagos abonados',
  tipsLoaded: 'Propinas cargadas',
  tipsDelivered: 'Propinas entregadas',
  reimbursementsCreated: 'Reintegros',
  reimbursementsPaid: 'Reintegros pagados',
  orders: 'Pedidos',
  posImports: 'Imports POS',
  partnerSplits: 'Divisiones',
};

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function breakdownSummary(b: UserActivityBreakdown): string {
  return (Object.keys(BREAKDOWN_LABELS) as Array<keyof UserActivityBreakdown>)
    .filter((k) => b[k] > 0)
    .map((k) => `${BREAKDOWN_LABELS[k]} (${b[k]})`)
    .join(' · ') || '—';
}

@Component({
  selector: 'app-user-activity-page',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatSnackBarModule,
    PageHeaderComponent,
    KpiStripComponent,
    DataTableComponent,
    UserAvatarComponent,
    FiltersCollapseBtnComponent,
  ],
  template: `
    <app-page-header
      title="Actividad de usuarios"
      [subtitle]="shops.selectedShop()?.name ?? ''"
    />

    <div
      class="panel-card guy-filters mb-3"
      [class.guy-filters--collapsed]="filtersCollapsed()"
    >
      <div class="guy-filters__head">
        <div>
          <h2 class="guy-filters__title">Período</h2>
          <p class="guy-filters__subtitle">Sumamos acciones reales en el local</p>
        </div>
        <app-filters-collapse-btn
          [collapsed]="filtersCollapsed()"
          (toggle)="toggleFilters()"
        />
      </div>
      <div class="guy-filters__body">
        <form class="guy-filters__grid guy-filters__grid--dense">
          <mat-form-field appearance="outline" class="guy-filters__span-2" subscriptSizing="dynamic">
            <mat-label>Rango</mat-label>
            <mat-date-range-input [formGroup]="range" [rangePicker]="picker">
              <input matStartDate formControlName="start" placeholder="Desde" />
              <input matEndDate formControlName="end" placeholder="Hasta" />
            </mat-date-range-input>
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-date-range-picker #picker />
          </mat-form-field>
        </form>
        <div class="guy-filters__actions">
          <button mat-flat-button color="primary" type="button" [disabled]="!hasRange() || loading()" (click)="load()">
            <mat-icon>refresh</mat-icon>
            Actualizar
          </button>
        </div>
      </div>
    </div>

    <app-kpi-strip class="mb-3" [items]="kpis()" />

    @if (loading()) {
      <p class="hint">Cargando ranking…</p>
    } @else if (topThree().length) {
      <section class="podium panel-card mb-3" aria-label="Top 3 usuarios">
        <h2 class="podium__title">Top 3</h2>
        <div class="podium__grid">
          @for (row of podiumOrder(); track row.userId) {
            <article class="podium-card" [attr.data-place]="row.podiumPlace">
              <span class="podium-card__medal" aria-hidden="true">{{ row.podiumPlace }}°</span>
              <app-user-avatar
                [userId]="row.userId"
                [avatarUrl]="row.avatarUrl"
                [hasAvatar]="row.hasAvatar"
                [previewable]="row.hasAvatar || !!row.avatarUrl"
                [previewSubtitle]="row.email"
                size="lg"
                [alt]="row.fullName"
              />
              <strong class="podium-card__name">{{ row.fullName }}</strong>
              <span class="podium-card__score">{{ formatScore(row.score) }} pts</span>
              <span class="podium-card__meta">{{ row.totalActions }} acciones</span>
            </article>
          }
        </div>
      </section>
    }

    <div class="panel-card panel-card--flush">
      <div class="panel-card__body">
        <div class="guy-list-head">
          <div>
            <h2 class="guy-list-head__title">Ranking completo</h2>
            <p class="guy-list-head__meta">
              @if (restRows().length) {
                {{ restRows().length }} usuarios después del podio
              } @else {
                Todos los usuarios del local
              }
            </p>
          </div>
        </div>
        <app-data-table
          [columns]="columns"
          [rows]="tableRows()"
          [loading]="loading()"
          [showActions]="false"
          [showSearch]="true"
          [sortable]="true"
          [previewAvatars]="true"
          [canRemove]="never"
        />
      </div>
    </div>
  `,
  styles: `
    .hint {
      margin: 0 0 1rem;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }
    .podium {
      padding: 1rem 1rem 1.25rem;
    }
    .podium__title {
      margin: 0 0 1rem;
      font-size: 1rem;
      font-weight: 800;
      color: var(--guy-navy, #003366);
    }
    .podium__grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.75rem;
      align-items: end;
    }
    .podium-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      padding: 0.85rem 0.65rem 1rem;
      border-radius: 14px;
      border: 1px solid var(--guy-border, #e4e0d8);
      background: #fff;
      text-align: center;
      min-width: 0;
    }
    .podium-card[data-place='1'] {
      order: 2;
      transform: translateY(-0.35rem);
      border-color: color-mix(in srgb, #c9a227 45%, var(--guy-border, #e4e0d8));
      background: linear-gradient(180deg, #fff9e8 0%, #fff 72%);
      box-shadow: 0 8px 24px color-mix(in srgb, #c9a227 18%, transparent);
    }
    .podium-card[data-place='2'] {
      order: 1;
    }
    .podium-card[data-place='3'] {
      order: 3;
    }
    .podium-card__medal {
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
    }
    .podium-card[data-place='1'] .podium-card__medal {
      color: #9a7b12;
    }
    .podium-card__name {
      font-size: 0.95rem;
      line-height: 1.25;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .podium-card__score {
      font-size: 1.15rem;
      font-weight: 800;
      color: var(--guy-navy, #003366);
    }
    .podium-card__meta {
      font-size: 0.78rem;
      color: var(--guy-muted, #5f6f76);
    }
    @media (max-width: 720px) {
      .podium__grid {
        grid-template-columns: 1fr;
      }
      .podium-card[data-place='1'] {
        order: 0;
        transform: none;
      }
      .podium-card[data-place='2'],
      .podium-card[data-place='3'] {
        order: 0;
      }
    }
  `,
})
export class UserActivityPage {
  private readonly filtersUi = createFiltersCollapsed('admin-user-activity');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  readonly shops = inject(ShopContextService);
  private readonly api = inject(UserActivityApiService);
  private readonly snack = inject(MatSnackBar);

  readonly never = () => false;
  readonly loading = signal(false);
  readonly ranking = signal<UserActivityRow[]>([]);

  readonly range = new FormGroup({
    start: new FormControl<Date | null>(this.daysAgo(29)),
    end: new FormControl<Date | null>(new Date()),
  });

  readonly topThree = computed(() =>
    this.ranking().filter((r) => r.score > 0).slice(0, 3),
  );

  readonly podiumOrder = computed(() => {
    const top = this.topThree();
    if (top.length < 2) return top.map((row, i) => ({ ...row, podiumPlace: i + 1 }));
    return [
      { ...top[1], podiumPlace: 2 },
      { ...top[0], podiumPlace: 1 },
      ...(top[2] ? [{ ...top[2], podiumPlace: 3 }] : []),
    ];
  });

  readonly restRows = computed(() => {
    const topIds = new Set(this.topThree().map((r) => r.userId));
    return this.ranking().filter((r) => !topIds.has(r.userId));
  });

  readonly tableRows = computed(() =>
    this.restRows().map((r) => ({
      ...r,
      breakdownLabel: breakdownSummary(r.breakdown),
      lastActionLabel: r.lastActionAt
        ? new Date(r.lastActionAt).toLocaleString('es-AR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '—',
    })),
  );

  readonly kpis = computed<KpiItem[]>(() => {
    const rows = this.ranking();
    const active = rows.filter((r) => r.score > 0);
    const leader = active[0];
    return [
      {
        label: 'Usuarios activos',
        value: String(active.length),
        hint: `${rows.length} en el local`,
        icon: 'groups',
      },
      {
        label: 'Acciones',
        value: String(rows.reduce((s, r) => s + r.totalActions, 0)),
        icon: 'touch_app',
      },
      {
        label: 'Líder del período',
        value: leader?.fullName ?? '—',
        hint: leader ? `${leader.score} pts` : 'Sin actividad',
        icon: 'emoji_events',
      },
    ];
  });

  readonly columns: DataTableColumn[] = [
    { key: 'rank', label: '#', sortable: true },
    { key: 'fullName', label: 'Usuario', kind: 'person' },
    { key: 'score', label: 'Score', sortable: true },
    { key: 'totalActions', label: 'Acciones', sortable: true },
    {
      key: 'breakdownLabel',
      label: 'Qué hizo',
      sortable: false,
    },
    { key: 'lastActionLabel', label: 'Última actividad', sortable: false },
  ];

  constructor() {
    usePageRefresh(() => this.load());
    effect(() => {
      const shopId = this.shops.selectedShopId();
      if (shopId) this.load();
    });
  }

  hasRange(): boolean {
    return !!(this.range.controls.start.value && this.range.controls.end.value);
  }

  load(): void {
    const shopId = this.shops.selectedShopId();
    const start = this.range.controls.start.value;
    const end = this.range.controls.end.value;
    if (!shopId || !start || !end) return;
    this.loading.set(true);
    this.api.ranking(shopId, isoDate(start), isoDate(end)).subscribe({
      next: (res) => {
        this.ranking.set(res.ranking ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudo cargar la actividad', 'OK', { duration: 3500 });
      },
    });
  }

  private daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  }

  formatScore(value: number): string {
    return Number(value || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
  }
}
