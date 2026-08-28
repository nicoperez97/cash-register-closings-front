import { MatDialog } from '@angular/material/dialog';
import {
  UserAvatarPreviewData,
  UserAvatarPreviewDialogComponent,
} from './user-avatar-preview-dialog';

export function openUserAvatarPreview(
  dialog: MatDialog,
  data: UserAvatarPreviewData,
  dialogTitle?: string,
): void {
  if (!data.src?.trim()) return;
  dialog.open(UserAvatarPreviewDialogComponent, {
    width: '480px',
    maxWidth: '96vw',
    panelClass: 'guy-dialog',
    data,
    ...(dialogTitle ? { ariaLabel: dialogTitle } : {}),
  });
}
