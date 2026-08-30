import { Component, input, output } from '@angular/core';
import { ControlContainer, FormGroupDirective, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-admin-shop-advanced',
  imports: [ReactiveFormsModule, MatButtonModule, MatSlideToggleModule, MatIconModule],
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
  template: `
    <section class="panel-card guy-form-section">
      <h2 class="guy-section-title">Estado</h2>
      <div class="shop-admin__toggle">
        <div>
          <strong>Local habilitado</strong>
          <p class="text-muted small mb-0">
            Si está deshabilitado no aparece en el selector de locales.
          </p>
        </div>
        <mat-slide-toggle formControlName="active" aria-label="Local habilitado" />
      </div>
    </section>

    @if (isSuperAdmin()) {
      <section class="panel-card guy-form-section shop-admin__danger">
        <h2 class="guy-section-title">Zona peligrosa</h2>
        <p class="text-muted small mb-3">
          Solo super admin. Dump por módulo o total (Excel o SQL), cargar Excel, y reset parcial o
          total. Se conserva configuración y usuarios.
        </p>
        <div class="shop-admin__danger-actions">
          <button mat-flat-button color="warn" type="button" (click)="openBackup.emit()">
            <mat-icon>shield</mat-icon>
            Dump y reset…
          </button>
        </div>
      </section>
    }
  `,
  styleUrl: './admin-shop.scss',
})
export class AdminShopAdvancedComponent {
  readonly isSuperAdmin = input(false);
  readonly openBackup = output<void>();
}
