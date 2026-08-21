import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import {
  EMAIL_MESSAGE_TYPE_OPTIONS,
  EmailMessageTemplates,
} from './email-message-types';

export type AdminMessageDialogData = {
  shopId: string;
  option: (typeof EMAIL_MESSAGE_TYPE_OPTIONS)[number];
  subject: string;
  body: string;
  /** Plantillas actuales del local (solo las personalizadas). */
  templates: EmailMessageTemplates;
};

@Component({
  selector: 'app-admin-message-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSnackBarModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>mail</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ data.option.label }}</strong>
        <span>{{ data.option.group === 'guest' ? 'Al comensal' : 'Al equipo' }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      <p class="msg-dlg__hint">
        Placeholders:
        <code>{{ '{' }}shop{{ '}' }}</code>
        <code>{{ '{' }}guest{{ '}' }}</code>
        <code>{{ '{' }}name{{ '}' }}</code>
        <code>{{ '{' }}detail{{ '}' }}</code>
        <code>{{ '{' }}title{{ '}' }}</code>
        <code>{{ '{' }}body{{ '}' }}</code>
      </p>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Asunto</mat-label>
          <input matInput formControlName="subject" [placeholder]="data.option.defaultSubject" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Cuerpo</mat-label>
          <textarea
            matInput
            rows="8"
            formControlName="body"
            [placeholder]="data.option.defaultBody"
          ></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="resetToDefault()" [disabled]="busy()">
        <mat-icon>restart_alt</mat-icon>
        Reiniciar
      </button>
      <span class="msg-dlg__spacer"></span>
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">
        Cancelar
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="busy()"
        (click)="save()"
      >
        <app-busy-label [busy]="busy()" busyLabel="Guardando…">
          <mat-icon>save</mat-icon>
          Guardar
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .msg-dlg__hint {
      margin: 0 0 0.75rem;
      font-size: 0.82rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.45;
    }
    .msg-dlg__hint code {
      font-size: 0.78rem;
      margin-right: 0.2rem;
    }
    .msg-dlg__spacer {
      flex: 1 1 auto;
    }
    mat-dialog-actions {
      flex-wrap: wrap;
      gap: 0.35rem;
    }
  `,
})
export class AdminMessageDialogComponent {
  readonly data = inject<AdminMessageDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<AdminMessageDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);

  readonly busy = signal(false);

  readonly form = this.fb.nonNullable.group({
    subject: [this.data.subject],
    body: [this.data.body],
  });

  resetToDefault(): void {
    this.form.setValue({
      subject: this.data.option.defaultSubject,
      body: this.data.option.defaultBody,
    });
    this.form.markAsDirty();
  }

  private sameText(a: string, b: string): boolean {
    return a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim();
  }

  save(): void {
    if (this.busy()) return;
    const opt = this.data.option;
    const raw = this.form.getRawValue();
    const subject = String(raw.subject ?? '').trim();
    const body = String(raw.body ?? '').trim();
    const persistSubject =
      subject && !this.sameText(subject, opt.defaultSubject) ? subject : '';
    const persistBody = body && !this.sameText(body, opt.defaultBody) ? body : '';

    const emailMessageTemplates: EmailMessageTemplates = { ...this.data.templates };
    if (!persistSubject && !persistBody) {
      delete emailMessageTemplates[opt.value];
    } else {
      emailMessageTemplates[opt.value] = {
        ...(persistSubject ? { subject: persistSubject } : {}),
        ...(persistBody ? { body: persistBody } : {}),
      };
    }

    this.busy.set(true);
    this.http
      .patch(`${environment.apiUrl}/shops/${this.data.shopId}`, { emailMessageTemplates })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.snack.open('Mensaje guardado', 'OK', { duration: 2200 });
          this.ref.close(true);
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err?.error?.message ?? 'No se pudo guardar';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 3500 });
        },
      });
  }
}
