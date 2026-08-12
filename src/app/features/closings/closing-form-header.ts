import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-closing-form-header',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <header class="closing-form-head">
      <div>
        <h1>{{ isEdit() ? 'Editar cierre' : 'Nuevo cierre' }}</h1>
        <p>{{ shopName() }}</p>
      </div>
      <div class="closing-form-actions closing-form-actions--top">
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
    </header>
  `,
  styleUrl: './closing-form-header.scss',
})
export class ClosingFormHeaderComponent {
  readonly isEdit = input(false);
  readonly shopName = input('');
  readonly cashierOnly = input(false);
  readonly isLocked = input(false);
  readonly isAdmin = input(false);
  readonly saving = input(false);

  readonly cancelClicked = output<void>();
  readonly unlockClicked = output<void>();
}
