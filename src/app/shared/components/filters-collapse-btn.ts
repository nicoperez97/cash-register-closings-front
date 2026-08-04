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
      [attr.aria-label]="collapsed() ? 'Mostrar filtros' : 'Ocultar filtros'"
      (click)="toggle.emit()"
    >
      <mat-icon>{{ collapsed() ? 'filter_list' : 'filter_list_off' }}</mat-icon>
      {{ collapsed() ? 'Mostrar' : 'Ocultar' }}
    </button>
  `,
})
export class FiltersCollapseBtnComponent {
  readonly collapsed = input.required<boolean>();
  readonly toggle = output<void>();
}
