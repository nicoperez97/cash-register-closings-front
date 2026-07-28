import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DocsShellComponent } from './docs-shell';
import { OfflineBannerComponent } from '../../shared/components/offline-banner';
import { OfflineService } from '../../core/offline/offline.service';

@Component({
  selector: 'app-docs-offline',
  imports: [
    DocsShellComponent,
    OfflineBannerComponent,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  template: `
    <app-docs-shell
      title="PWA y offline"
      subtitle="Instalable, Service Worker y conectividad"
      description="El template es una Progressive Web App: manifest, íconos, SW en producción y OfflineService para UI."
    >
      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Demo conectividad</h2>
        <p class="small text-muted">
          Estado real: {{ offline.online() ? 'online' : 'offline' }} ·
          Simulado: {{ offline.simulatedOffline() ? 'sí' : 'no' }} ·
          Efectivo: {{ offline.effectivelyOnline() ? 'online' : 'offline' }}
        </p>
        <button mat-flat-button color="primary" type="button" (click)="offline.toggleSimulatedOffline()">
          <mat-icon>{{ offline.effectivelyOnline() ? 'cloud_off' : 'cloud_done' }}</mat-icon>
          {{ offline.effectivelyOnline() ? 'Simular offline' : 'Volver online (simulado)' }}
        </button>
        <div class="mt-3">
          <app-offline-banner
            [show]="!offline.effectivelyOnline()"
            title="Sin conexión"
            message="Los cambios se encolan y se sincronizan cuando vuelva la red."
          />
        </div>
      </div>

      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Snack de actualización</h2>
        <p class="small text-muted mb-2">
          En producción, cuando el Service Worker detecta una nueva versión
          (evento VERSION_READY), se muestra esta snackbar. El SW solo está
          activo fuera de ng serve.
        </p>
        <button mat-stroked-button type="button" (click)="previewUpdateSnack()">
          <mat-icon>system_update</mat-icon>
          Probar snack “Actualizar”
        </button>
        <pre class="docs-code mt-3">{{ updateSnippet }}</pre>
      </div>

      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Cómo instalar la PWA</h2>
        <p class="small text-muted mb-3">
          Primero publicá un build de producción por HTTPS (o localhost):
          <code>npm run build</code> y serví
          <code>dist/angular-globaluy-template/browser</code>.
          En <code>ng serve</code> el Service Worker no está activo.
        </p>

        <div class="row g-3">
          <div class="col-12 col-md-6">
            <div class="pwa-install-card">
              <div class="pwa-install-card__head">
                <mat-icon>phone_iphone</mat-icon>
                <h3>iOS (Safari)</h3>
              </div>
              <ol class="mb-2">
                <li>Abrí la app en <strong>Safari</strong> (no Chrome ni otros).</li>
                <li>Tocá el botón <strong>Compartir</strong> (cuadrado con flecha hacia arriba).</li>
                <li>Desplazate y elegí <strong>Agregar a pantalla de inicio</strong>.</li>
                <li>Confirmá el nombre y tocá <strong>Agregar</strong>.</li>
              </ol>
              <p class="small text-muted mb-0">
                El ícono queda en la home y abre en modo standalone (sin barra de Safari).
                Requiere iOS 16.4+ para Service Worker en PWA instalada.
              </p>
            </div>
          </div>

          <div class="col-12 col-md-6">
            <div class="pwa-install-card">
              <div class="pwa-install-card__head">
                <mat-icon>android</mat-icon>
                <h3>Android (Chrome / Edge)</h3>
              </div>
              <ol class="mb-2">
                <li>Abrí la app en <strong>Chrome</strong> o <strong>Edge</strong>.</li>
                <li>
                  Si aparece el banner, tocá <strong>Instalar</strong> /
                  <strong>Agregar a la pantalla de inicio</strong>.
                </li>
                <li>
                  Si no: menú <strong>⋮</strong> →
                  <strong>Instalar app</strong> o
                  <strong>Agregar a pantalla de inicio</strong>.
                </li>
                <li>Confirmá la instalación.</li>
              </ol>
              <p class="small text-muted mb-0">
                En desktop Chrome/Edge también podés usar el ícono ⊕ de la barra de
                direcciones para instalar como app de escritorio.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Qué incluye</h2>
        <ul class="mb-0">
          <li><code>public/manifest.webmanifest</code> + íconos en <code>public/icons/</code></li>
          <li><code>ngsw-config.json</code> + <code>provideServiceWorker</code> (solo prod)</li>
          <li>Snack de actualización cuando hay nueva versión del SW</li>
          <li><code>OfflineService</code> + <code>app-offline-banner</code> para UX offline</li>
        </ul>
      </div>

      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Cómo usarlo en código</h2>
        <ol class="mb-2">
          <li>Inyectá <code>OfflineService</code> y leé <code>effectivelyOnline()</code>.</li>
          <li>Mostrá <code>app-offline-banner</code> cuando esté offline.</li>
          <li>Deshabilitá escrituras si no hay red.</li>
          <li>Opcional: <code>app-pull-to-refresh</code> para reintentar sync.</li>
        </ol>
        <pre class="docs-code">{{ snippet }}</pre>
      </div>

      <div class="panel-card">
        <h2 class="guy-section-title">Regenerar íconos</h2>
        <pre class="docs-code">{{ iconsSnippet }}</pre>
      </div>
    </app-docs-shell>
  `,
})
export class DocsOfflinePage {
  readonly offline = inject(OfflineService);
  private readonly snack = inject(MatSnackBar);

  previewUpdateSnack(): void {
    this.snack
      .open('Hay una nueva versión disponible', 'Actualizar', {
        duration: 0,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      })
      .onAction()
      .subscribe(() => {
        this.snack.open('En prod recargaría la app', 'OK', { duration: 2500 });
      });
  }

  readonly updateSnippet = `// app.config.ts — provideAppInitializer(watchAppUpdates)
updates.versionUpdates
  .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
  .subscribe(() => {
    snackBar.open('Hay una nueva versión disponible', 'Actualizar', { duration: 0 })
      .onAction()
      .subscribe(() => void updates.activateUpdate().then(() => location.reload()));
  });`;

  readonly snippet = `readonly offline = inject(OfflineService);

@if (!offline.effectivelyOnline()) {
  <app-offline-banner title="Sin conexión" message="Modo lectura" />
}

<button [disabled]="!offline.effectivelyOnline()">Guardar</button>`;

  readonly iconsSnippet = `npm i -D sharp   # si hace falta
node scripts/generate-pwa-icons.mjs`;
}
