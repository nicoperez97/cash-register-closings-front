import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DocsShellComponent } from './docs-shell';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';

@Component({
  selector: 'app-docs-dialogs',
  imports: [DocsShellComponent, MatButtonModule, MatSnackBarModule],
  template: `
    <app-docs-shell
      title="Diálogos"
      subtitle="ConfirmDialogService"
      description="Confirmación genérica con Material Dialog y título de pestaña sincronizado."
    >
      <div class="panel-card mb-3">
        <h2 class="guy-section-title">Demo</h2>
        <button mat-flat-button color="primary" type="button" (click)="open()">
          Abrir confirmación
        </button>
      </div>
      <div class="panel-card">
        <pre class="docs-code">{{ snippet }}</pre>
      </div>
    </app-docs-shell>
  `,
})
export class DocsDialogsPage {
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly snack = inject(MatSnackBar);

  readonly snippet = `const ok = await confirmDialog.confirm(
  'Eliminar',
  '¿Seguro que querés borrar este ítem?'
);
if (ok) { /* ... */ }`;

  async open(): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      'Eliminar ítem',
      '¿Confirmás esta acción de demo?',
    );
    this.snack.open(ok ? 'Confirmado' : 'Cancelado', 'OK', { duration: 2000 });
  }
}
