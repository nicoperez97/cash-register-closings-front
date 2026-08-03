import { Injectable, inject, DestroyRef } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BodyScrollLockService } from './body-scroll-lock.service';

/**
 * Bloquea el scroll del documento mientras hay un MatDialog abierto.
 */
@Injectable({ providedIn: 'root' })
export class DialogBodyScrollLockService {
  private readonly dialog = inject(MatDialog);
  private readonly bodyLock = inject(BodyScrollLockService);
  private readonly destroyRef = inject(DestroyRef);

  start(): void {
    this.dialog.afterOpened.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.bodyLock.lock('dialog');
    });
    this.dialog.afterAllClosed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.bodyLock.unlock('dialog');
    });
  }
}
