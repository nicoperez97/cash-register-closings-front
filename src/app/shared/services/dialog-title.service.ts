import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { MatDialogRef } from '@angular/material/dialog';
import { formatAppTitle } from '../../core/routing/app-title.strategy';

/**
 * Actualiza el título de la pestaña mientras un diálogo está abierto
 * y lo restaura al cerrar (soporta diálogos anidados).
 */
@Injectable({ providedIn: 'root' })
export class DialogTitleService {
  private readonly title = inject(Title);
  private readonly stack: string[] = [];

  track<T, R>(ref: MatDialogRef<T, R>, pageTitle: string): MatDialogRef<T, R> {
    this.stack.push(this.title.getTitle());
    this.title.setTitle(formatAppTitle(pageTitle));
    ref.afterClosed().subscribe(() => {
      const prev = this.stack.pop();
      if (prev !== undefined) this.title.setTitle(prev);
    });
    return ref;
  }
}
