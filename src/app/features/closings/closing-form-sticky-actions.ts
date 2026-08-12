import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-closing-form-sticky-actions',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="closing-form-actions closing-form-actions--sticky" aria-label="Acciones del cierre">
      @if (!cashierOnly()) {
        <button mat-stroked-button type="button" (click)="cancelClicked.emit()">Cancelar</button>
      }
      @if (isLocked() && isAdmin()) {
        <button mat-stroked-button type="button" (click)="unlockClicked.emit()">
          <mat-icon>lock_open</mat-icon>
          Desbloquear
        </button>
      }
      <button
        mat-flat-button
        color="primary"
        type="submit"
        form="closing-form"
        [disabled]="saving() || (isLocked() && !isAdmin())"
      >
        {{ saving() ? 'Guardando…' : 'Guardar cierre' }}
      </button>
    </div>
  `,
  styleUrl: './closing-form-sticky-actions.scss',
})
export class ClosingFormStickyActionsComponent {
  readonly cashierOnly = input(false);
  readonly isLocked = input(false);
  readonly isAdmin = input(false);
  readonly saving = input(false);

  readonly cancelClicked = output<void>();
  readonly unlockClicked = output<void>();
}
