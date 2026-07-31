import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { KpiStripComponent, KpiItem } from '../../shared/components/kpi-strip';
import { APP_BRAND } from '../../core/config/app-brand';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import {
  canManageShop,
  effectiveRoleForShop,
  hasShopPermission,
  userRoleLabel,
} from '../../core/auth/auth.models';
import { ClosingsApiService } from '../closings/closings-api.service';
import { usePageRefresh } from '../../core/page-refresh.service';

@Component({
  selector: 'app-home-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    PageHeaderComponent,
    KpiStripComponent,
  ],
  template: `
    <app-page-header
      title="Cierres de caja"
      subtitle="Varios locales · roles · reportes"
      [actionLabel]="canCreateShop() ? 'Crear local' : canCreateClosing() ? 'Nuevo cierre' : ''"
      [actionIcon]="canCreateShop() ? 'add_business' : 'add'"
      [actionLarge]="true"
      (action)="canCreateShop() ? goCreateShop() : goCreate()"
    />

    <app-kpi-strip [items]="kpis()" class="mb-3" />

    <div class="panel-card mb-3">
      <h2 class="guy-section-title">Local activo</h2>
      <p class="text-muted mb-3">
        @if (shopContext.selectedShop(); as shop) {
          {{ shop.name }}. Si tenés más de un local, cambiálo desde el menú lateral.
        } @else if (canCreateShop()) {
          Todavía no hay locales. Creá el primero para empezar a operar.
        } @else {
          Sin local asignado. Pedile a un administrador que te asigne uno.
        }
      </p>
      <div class="d-flex flex-wrap gap-2">
        @if (canCreateShop()) {
          <a mat-flat-button color="primary" routerLink="/admin/shops">
            <mat-icon>add_business</mat-icon>
            Crear local
          </a>
        }
        @if (canReadClosings()) {
          <a mat-flat-button color="primary" routerLink="/closings">
            <mat-icon>point_of_sale</mat-icon>
            Ver cierres
          </a>
        }
        @if (canViewReports()) {
          <a mat-stroked-button routerLink="/reports">
            <mat-icon>insights</mat-icon>
            Ver reportes
          </a>
        }
        @if (canEditShop()) {
          <a mat-stroked-button routerLink="/admin/shop">
            <mat-icon>storefront</mat-icon>
            Administrar local
          </a>
        }
      </div>
    </div>

    @if (canViewReports()) {
      <div class="panel-card mb-3">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div>
            <h2 class="guy-section-title mb-1">Reportes del mes</h2>
            <p class="text-muted mb-0 small">{{ periodLabel() }}</p>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <a mat-stroked-button routerLink="/reports">
              <mat-icon>open_in_new</mat-icon>
              Detalle
            </a>
            @if (canExport()) {
              <button mat-flat-button color="primary" type="button" (click)="exportMonth()">
                <mat-icon>download</mat-icon>
                Excel
              </button>
            }
          </div>
        </div>

        <app-kpi-strip [items]="reportKpis()" class="mb-2" />
        <p class="mb-0 text-muted">
          {{ reportCount() }} cierres en el período
        </p>
      </div>
    }

    <p class="text-center text-muted mt-4 mb-0 small">{{ brand.tagline }}</p>
  `,
})
export class HomePageComponent {
  readonly brand = APP_BRAND;
  readonly shopContext = inject(ShopContextService);
  readonly auth = inject(AuthService);
  private readonly api = inject(ClosingsApiService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  private readonly reportSummary = signal<any>(null);
  private readonly refreshTick = signal(0);

  readonly kpis = computed((): KpiItem[] => {
    const user = this.auth.currentUser();
    const shopId = this.shopContext.selectedShopId();
    const hasShop = !!shopId;
    return [
      { label: 'Locales', value: this.shopContext.shops().length || '—', hint: 'Asignados' },
      {
        label: 'Rol en local',
        value: (() => {
          const role = effectiveRoleForShop(user, shopId);
          return role ? userRoleLabel(role) : '—';
        })(),
        hint: 'Permisos activos',
      },
      {
        label: 'Cierres',
        value: hasShop && hasShopPermission(user, shopId, 'closings.read') ? 'Sí' : '—',
        hint: 'Lectura',
      },
      {
        label: 'Exportar',
        value: hasShop && hasShopPermission(user, shopId, 'reports.export') ? 'Sí' : '—',
        hint: 'Excel',
      },
    ];
  });

  readonly reportKpis = computed((): KpiItem[] => {
    const s = this.reportSummary();
    if (!s?.totals) {
      return [
        { label: 'Total declarado', value: '—' },
        { label: 'PVS', value: '—' },
        { label: 'Efectivo', value: '—' },
        { label: 'Retiros', value: '—' },
      ];
    }
    return [
      { label: 'Total declarado', value: `$ ${Number(s.totals.declared).toLocaleString('es-AR')}` },
      { label: 'PVS', value: `$ ${Number(s.totals.card).toLocaleString('es-AR')}` },
      { label: 'Efectivo', value: `$ ${Number(s.totals.cash).toLocaleString('es-AR')}` },
      { label: 'Retiros', value: `$ ${Number(s.totals.withdrawn).toLocaleString('es-AR')}` },
    ];
  });

  readonly reportCount = computed(() => this.reportSummary()?.count ?? 0);

  constructor() {
    usePageRefresh(() => this.refreshTick.update((n) => n + 1));
    effect(() => {
      this.refreshTick();
      const shopId = this.shopContext.selectedShopId();
      const canView = hasShopPermission(this.auth.currentUser(), shopId, 'reports.view');
      if (!shopId || !canView) {
        this.reportSummary.set(null);
        return;
      }
      const { from, to } = this.monthRange();
      this.api.summary(shopId, { from, to }).subscribe({
        next: (s) => this.reportSummary.set(s),
        error: () => this.reportSummary.set(null),
      });
    });
  }

  periodLabel(): string {
    const { from, to } = this.monthRange();
    return `${this.formatDisplay(from)} – ${this.formatDisplay(to)}`;
  }

  canReadClosings(): boolean {
    const shopId = this.shopContext.selectedShopId();
    return !!shopId && hasShopPermission(this.auth.currentUser(), shopId, 'closings.read');
  }

  canViewReports(): boolean {
    const shopId = this.shopContext.selectedShopId();
    return !!shopId && hasShopPermission(this.auth.currentUser(), shopId, 'reports.view');
  }

  canExport(): boolean {
    const shopId = this.shopContext.selectedShopId();
    return !!shopId && hasShopPermission(this.auth.currentUser(), shopId, 'reports.export');
  }

  canCreateClosing(): boolean {
    const shopId = this.shopContext.selectedShopId();
    return !!shopId && hasShopPermission(this.auth.currentUser(), shopId, 'closings.create');
  }

  canCreateShop(): boolean {
    return this.auth.isSuperAdmin() && this.shopContext.shops().length === 0;
  }

  goCreate(): void {
    void this.router.navigate(['/closings/new']);
  }

  goCreateShop(): void {
    void this.router.navigate(['/admin/shops']);
  }

  canEditShop(): boolean {
    const shopId = this.shopContext.selectedShopId();
    return !!shopId && canManageShop(this.auth.currentUser(), shopId);
  }

  exportMonth(): void {
    const shopId = this.shopContext.selectedShopId();
    const shop = this.shopContext.selectedShop();
    if (!shopId || !this.canExport()) return;
    const { from, to } = this.monthRange();
    this.api.exportExcel(shopId, { from, to }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cierres-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${from}_${to}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open('No se pudo exportar', 'OK', { duration: 3000 }),
    });
  }

  private shopFileSlug(name?: string | null): string {
    const raw = (name || 'local')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return raw || 'local';
  }

  private monthRange(): { from: string; to: string } {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      from: this.toIso(from),
      to: this.toIso(now),
    };
  }

  private toIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private formatDisplay(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
}
