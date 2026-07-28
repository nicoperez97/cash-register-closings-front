import { Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { DocsShellComponent } from './docs-shell';
import { LoadingStateComponent } from '../../shared/components/loading-state';
import { OfflineBannerComponent } from '../../shared/components/offline-banner';
import { PullToRefreshComponent } from '../../shared/components/pull-to-refresh';

@Component({
  selector: 'app-docs-loading-offline',
  imports: [
    DocsShellComponent,
    LoadingStateComponent,
    OfflineBannerComponent,
    PullToRefreshComponent,
    MatButtonModule,
  ],
  template: `
    <app-docs-shell
      title="Loading / offline"
      subtitle="Estados de carga, banner offline y pull-to-refresh"
      description="Tres componentes para feedback de red y carga. El PTR está pensado para touch/móvil."
    >
      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Loading state</h2>
        <div class="d-flex flex-wrap gap-2 mb-3">
          <button mat-stroked-button type="button" (click)="toggleLoading()">
            Toggle loading
          </button>
          <button mat-stroked-button type="button" (click)="toggleRefreshing()">
            Toggle refreshing
          </button>
        </div>
        <app-loading-state [loading]="loading()" [refreshing]="refreshing()" />
      </div>

      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Offline banner</h2>
        <app-offline-banner
          [show]="true"
          title="Sin conexión (demo)"
          message="Los cambios se sincronizarán cuando vuelva la red."
        />
        <app-offline-banner
          [show]="true"
          [stale]="true"
          title="Datos desactualizados"
          message="Última sync hace 2 h."
        />
      </div>

      <div class="panel-card">
        <h2 class="guy-section-title">Pull to refresh</h2>
        <p class="small text-muted">En móvil, arrastrá hacia abajo desde el tope de la página.</p>
        <app-pull-to-refresh
          [enabled]="true"
          [refreshing]="ptrBusy()"
          (refresh)="onPull()"
        />
        <p class="mb-0 small">Estado PTR: {{ ptrBusy() ? 'refrescando…' : 'idle' }}</p>
      </div>
    </app-docs-shell>
  `,
})
export class DocsLoadingOfflinePage {
  readonly loading = signal(false);
  readonly refreshing = signal(false);
  readonly ptrBusy = signal(false);

  toggleLoading(): void {
    this.loading.update((v) => !v);
    if (this.loading()) this.refreshing.set(false);
  }

  toggleRefreshing(): void {
    this.refreshing.update((v) => !v);
    if (this.refreshing()) this.loading.set(false);
  }

  onPull(): void {
    this.ptrBusy.set(true);
    setTimeout(() => this.ptrBusy.set(false), 1200);
  }
}
