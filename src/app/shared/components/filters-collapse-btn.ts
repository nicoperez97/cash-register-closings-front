import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-filters-collapse-btn',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <button
      mat-stroked-button
      type="button"
      class="guy-filters__collapse"
      [attr.aria-expanded]="!collapsed()"
      [attr.aria-label]="collapseAriaLabel()"
      (click)="toggle.emit()"
    >
      <mat-icon>{{ collapsed() ? 'filter_list' : 'filter_list_off' }}</mat-icon>
      {{ collapsed() ? 'Mostrar' : 'Ocultar' }}
      @if (collapsed() && badgeCount() > 0) {
        <span class="guy-filters__collapse-badge" aria-hidden="true">{{ badgeCount() }}</span>
      }
    </button>
  `,
})
export class FiltersCollapseBtnComponent {
  readonly collapsed = input.required<boolean>();
  /** Cantidad de filtros activos; se muestra como badge solo cuando está colapsado. */
  readonly badgeCount = input(0);
  readonly toggle = output<void>();

  collapseAriaLabel(): string {
    const n = this.badgeCount();
    if (this.collapsed()) {
      return n > 0 ? `Mostrar filtros (${n} activos)` : 'Mostrar filtros';
    }
    return 'Ocultar filtros';
  }
}
