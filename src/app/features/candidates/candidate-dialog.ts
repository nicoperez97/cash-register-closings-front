import { Component, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import {
  Candidate,
  CandidatePayload,
  CandidatesApiService,
  CandidateStatus,
  ParsedCv,
} from './candidates-api.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { takeInputFiles } from '../../shared/utils/input-file';

export type CandidateDialogData = {
  shopId: string;
  shopName: string;
} & (
  | { mode: 'from-cv' }
  | { mode: 'manual' }
  | { mode: 'edit'; candidate: Candidate }
);

type Step = 'pick' | 'parsing' | 'form';

const STATUS_OPTIONS: Array<{ value: CandidateStatus; label: string }> = [
  { value: 'new', label: 'Nuevo' },
  { value: 'reviewing', label: 'En revisión' },
  { value: 'hired', label: 'Contratado' },
  { value: 'rejected', label: 'Descartado' },
];

@Component({
  selector: 'app-candidate-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressBarModule,
    MatExpansionModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ titleIcon() }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ title() }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      @if (step() === 'pick') {
        <div class="cv-pick">
          <p class="cv-pick__hint">
            Podés sacar varias fotos o cargar varios archivos del mismo CV. Se lee el texto de todas
            y se completa un solo registro (las imágenes no se guardan).
          </p>
          <div class="cv-pick__actions">
            <button mat-stroked-button type="button" (click)="cameraInput.click()">
              <mat-icon>photo_camera</mat-icon>
              Sacar foto
            </button>
            <button mat-stroked-button type="button" (click)="fileInput.click()">
              <mat-icon>upload_file</mat-icon>
              Cargar archivos
            </button>
          </div>
          <input
            #cameraInput
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            (change)="onFilesPicked($event)"
          />
          <input
            #fileInput
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            (change)="onFilesPicked($event)"
          />

          @if (pendingFiles().length) {
            <ul class="cv-pick__list">
              @for (item of pendingFiles(); track item.id; let i = $index) {
                <li class="cv-pick__item">
                  @if (item.previewUrl) {
                    <img [src]="item.previewUrl" alt="" class="cv-pick__thumb" />
                  } @else {
                    <mat-icon class="cv-pick__file-icon">picture_as_pdf</mat-icon>
                  }
                  <span class="cv-pick__name">{{ item.file.name }}</span>
                  <button
                    mat-icon-button
                    type="button"
                    aria-label="Quitar"
                    (click)="removePending(i)"
                  >
                    <mat-icon>close</mat-icon>
                  </button>
                </li>
              }
            </ul>
            <button
              mat-flat-button
              color="primary"
              type="button"
              class="cv-pick__submit"
              (click)="startParse()"
            >
              <mat-icon>document_scanner</mat-icon>
              Leer CV ({{ pendingFiles().length }})
            </button>
          }
        </div>
      } @else if (step() === 'parsing') {
        <div class="cv-parsing" role="status" aria-live="polite">
          <div class="cv-parsing__orb" aria-hidden="true">
            <span class="cv-parsing__ring"></span>
            <span class="cv-parsing__ring cv-parsing__ring--delay"></span>
            <mat-icon class="cv-parsing__icon">document_scanner</mat-icon>
          </div>
          <div class="cv-parsing__copy">
            <p class="cv-parsing__title">Leyendo CV…</p>
            <p class="cv-parsing__hint">
              @if (pendingCount() > 1) {
                Extrayendo texto de {{ pendingCount() }} archivos · puede tardar unos segundos
              } @else {
                Extrayendo texto · puede tardar unos segundos
              }
            </p>
          </div>
          <mat-progress-bar mode="indeterminate" class="guy-progress cv-parsing__bar" />
        </div>
      } @else {
        <form class="guy-dialog__form candidate-form" [formGroup]="form" (ngSubmit)="save()">
          <div class="guy-form-grid guy-form-grid--2">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Nombre</mat-label>
              <input matInput formControlName="firstName" autocomplete="given-name" />
              @if (form.controls.firstName.touched && form.controls.firstName.hasError('required')) {
                <mat-error>Requerido</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Apellido</mat-label>
              <input matInput formControlName="lastName" autocomplete="family-name" />
              @if (form.controls.lastName.touched && form.controls.lastName.hasError('required')) {
                <mat-error>Requerido</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Email</mat-label>
              <input matInput formControlName="email" type="email" autocomplete="email" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Teléfono</mat-label>
              <input matInput formControlName="phone" autocomplete="tel" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Documento</mat-label>
              <input matInput formControlName="documentId" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Fecha de nacimiento</mat-label>
              <input matInput type="date" formControlName="birthDate" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Nacionalidad</mat-label>
              <input matInput formControlName="nationality" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Estado</mat-label>
              <mat-select formControlName="status">
                @for (s of statusOptions; track s.value) {
                  <mat-option [value]="s.value">{{ s.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="span-2">
              <mat-label>Dirección</mat-label>
              <input matInput formControlName="address" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Ciudad</mat-label>
              <input matInput formControlName="city" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>País</mat-label>
              <input matInput formControlName="country" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>LinkedIn</mat-label>
              <input matInput formControlName="linkedIn" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Sitio web</mat-label>
              <input matInput formControlName="website" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="span-2">
              <mat-label>Perfil / objetivo</mat-label>
              <textarea matInput rows="3" formControlName="summary"></textarea>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="span-2">
              <mat-label>Habilidades (separadas por coma)</mat-label>
              <textarea matInput rows="2" formControlName="skillsText"></textarea>
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="span-2">
              <mat-label>Notas internas</mat-label>
              <textarea matInput rows="2" formControlName="notes"></textarea>
            </mat-form-field>
          </div>

          <div class="candidate-form__section">
            <div class="candidate-form__section-head">
              <h3>Educación</h3>
              <button mat-button type="button" (click)="addEducation()">
                <mat-icon>add</mat-icon>
                Agregar
              </button>
            </div>
            @for (group of education.controls; track $index; let i = $index) {
              <div class="candidate-form__card" [formGroup]="educationAt(i)">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Institución</mat-label>
                  <input matInput formControlName="institution" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Título / carrera</mat-label>
                  <input matInput formControlName="degree" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Período</mat-label>
                  <input matInput formControlName="period" />
                </mat-form-field>
                <button
                  mat-icon-button
                  type="button"
                  aria-label="Quitar educación"
                  (click)="education.removeAt(i)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </div>

          <div class="candidate-form__section">
            <div class="candidate-form__section-head">
              <h3>Experiencia</h3>
              <button mat-button type="button" (click)="addExperience()">
                <mat-icon>add</mat-icon>
                Agregar
              </button>
            </div>
            @for (group of experience.controls; track $index; let i = $index) {
              <div class="candidate-form__card candidate-form__card--exp" [formGroup]="experienceAt(i)">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Empresa</mat-label>
                  <input matInput formControlName="company" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Puesto</mat-label>
                  <input matInput formControlName="role" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Período</mat-label>
                  <input matInput formControlName="period" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="span-full">
                  <mat-label>Descripción</mat-label>
                  <textarea matInput rows="2" formControlName="description"></textarea>
                </mat-form-field>
                <button
                  mat-icon-button
                  type="button"
                  class="candidate-form__card-del"
                  aria-label="Quitar experiencia"
                  (click)="experience.removeAt(i)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </div>

          <div class="candidate-form__section">
            <div class="candidate-form__section-head">
              <h3>Idiomas</h3>
              <button mat-button type="button" (click)="addLanguage()">
                <mat-icon>add</mat-icon>
                Agregar
              </button>
            </div>
            @for (group of languages.controls; track $index; let i = $index) {
              <div class="candidate-form__card" [formGroup]="languagesAt(i)">
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Idioma</mat-label>
                  <input matInput formControlName="name" />
                </mat-form-field>
                <mat-form-field appearance="outline" subscriptSizing="dynamic">
                  <mat-label>Nivel</mat-label>
                  <input matInput formControlName="level" />
                </mat-form-field>
                <button
                  mat-icon-button
                  type="button"
                  aria-label="Quitar idioma"
                  (click)="languages.removeAt(i)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </div>

          @if (form.controls.rawText.value) {
            <mat-expansion-panel class="candidate-form__raw">
              <mat-expansion-panel-header>
                <mat-panel-title>Texto OCR completo</mat-panel-title>
              </mat-expansion-panel-header>
              <mat-form-field appearance="outline" class="w-100" subscriptSizing="dynamic">
                <textarea matInput rows="8" formControlName="rawText" readonly></textarea>
              </mat-form-field>
            </mat-expansion-panel>
          }
        </form>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">
        Cancelar
      </button>
      @if (step() === 'form') {
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="form.invalid || busy()"
          (click)="save()"
        >
          <app-busy-label [busy]="busy()" [busyLabel]="isEdit ? 'Guardando…' : 'Creando…'">
            <mat-icon>{{ isEdit ? 'save' : 'person_add' }}</mat-icon>
            {{ isEdit ? 'Guardar' : 'Crear candidato' }}
          </app-busy-label>
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [
    `
      .cv-pick {
        display: grid;
        gap: 1rem;
        padding: 0.5rem 0 1rem;
      }
      .cv-pick__hint {
        margin: 0;
        color: var(--guy-muted, #666);
        line-height: 1.45;
      }
      .cv-pick__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }
      .cv-pick__list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.5rem;
      }
      .cv-pick__item {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        padding: 0.4rem 0.5rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 10px;
        background: #fff;
      }
      .cv-pick__thumb {
        width: 44px;
        height: 44px;
        object-fit: cover;
        border-radius: 8px;
        flex: 0 0 auto;
      }
      .cv-pick__file-icon {
        width: 44px;
        height: 44px;
        display: grid;
        place-items: center;
        color: var(--guy-accent, #2e7d32);
      }
      .cv-pick__name {
        flex: 1 1 auto;
        min-width: 0;
        font-size: 0.85rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cv-pick__submit {
        justify-self: start;
      }
      .cv-parsing {
        display: grid;
        justify-items: center;
        gap: 1.15rem;
        margin: 0.35rem 0 0.75rem;
        padding: 1.75rem 1.25rem 1.5rem;
        text-align: center;
        border-radius: 16px;
        border: 1px solid color-mix(in srgb, var(--guy-accent, #2e7d32) 22%, var(--guy-border, #d7e0d9));
        background:
          radial-gradient(
            120% 80% at 50% 0%,
            color-mix(in srgb, var(--guy-accent, #2e7d32) 16%, transparent),
            transparent 55%
          ),
          linear-gradient(
            160deg,
            color-mix(in srgb, var(--guy-accent-secondary, #f9a825) 10%, #fff),
            #fff 60%
          );
      }
      .cv-parsing__orb {
        position: relative;
        width: 88px;
        height: 88px;
        display: grid;
        place-items: center;
      }
      .cv-parsing__ring {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 3px solid transparent;
        border-top-color: var(--guy-accent, #2e7d32);
        border-right-color: color-mix(in srgb, var(--guy-accent, #2e7d32) 45%, transparent);
        animation: cv-spin 1.05s linear infinite;
      }
      .cv-parsing__ring--delay {
        inset: 10px;
        border-top-color: var(--guy-accent-secondary, #f9a825);
        border-right-color: color-mix(in srgb, var(--guy-accent-secondary, #f9a825) 40%, transparent);
        animation-duration: 1.55s;
        animation-direction: reverse;
      }
      .cv-parsing__icon {
        width: 36px;
        height: 36px;
        font-size: 36px;
        color: var(--guy-accent, #2e7d32);
        animation: cv-pulse 1.6s ease-in-out infinite;
      }
      .cv-parsing__copy {
        display: grid;
        gap: 0.2rem;
      }
      .cv-parsing__title {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--guy-text, #1b2a33);
      }
      .cv-parsing__hint {
        margin: 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #667788);
      }
      .cv-parsing__bar {
        width: min(280px, 100%);
        border-radius: 999px;
        overflow: hidden;
      }
      @keyframes cv-spin {
        to {
          transform: rotate(360deg);
        }
      }
      @keyframes cv-pulse {
        0%,
        100% {
          transform: scale(1);
          opacity: 0.85;
        }
        50% {
          transform: scale(1.08);
          opacity: 1;
        }
      }
      .candidate-form {
        display: grid;
        gap: 1rem;
        min-width: min(720px, 92vw);
      }
      .guy-form-grid--2 {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem 1rem;
      }
      .span-2 {
        grid-column: 1 / -1;
      }
      .candidate-form__section {
        display: grid;
        gap: 0.5rem;
      }
      .candidate-form__section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .candidate-form__section-head h3 {
        margin: 0;
        font-size: 0.95rem;
      }
      .candidate-form__card {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 0.5rem 0.75rem;
        align-items: start;
        padding: 0.65rem;
        border: 1px solid var(--guy-border, #d7e0d9);
        border-radius: 10px;
        background: color-mix(in srgb, var(--guy-accent, #2e7d32) 4%, #fff);
      }
      .candidate-form__card--exp {
        grid-template-columns: 1fr 1fr 1fr;
        position: relative;
        padding-right: 2.5rem;
      }
      .candidate-form__card--exp .span-full {
        grid-column: 1 / -1;
      }
      .candidate-form__card-del {
        position: absolute;
        top: 0.35rem;
        right: 0.25rem;
      }
      .candidate-form__raw {
        margin-top: 0.25rem;
      }
      .w-100 {
        width: 100%;
      }
      @media (max-width: 700px) {
        .guy-form-grid--2,
        .candidate-form__card,
        .candidate-form__card--exp {
          grid-template-columns: 1fr;
        }
        .candidate-form {
          min-width: 0;
        }
      }
    `,
  ],
})
export class CandidateDialogComponent {
  readonly data = inject<CandidateDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<CandidateDialogComponent, boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CandidatesApiService);
  private readonly snack = inject(MatSnackBar);

  readonly statusOptions = STATUS_OPTIONS;
  readonly busy = signal(false);
  readonly step = signal<Step>(this.data.mode === 'from-cv' ? 'pick' : 'form');
  readonly pendingFiles = signal<Array<{ id: string; file: File; previewUrl: string | null }>>(
    [],
  );
  /** Cantidad al iniciar OCR (la lista se limpia al terminar). */
  readonly pendingCount = signal(0);

  readonly isEdit = this.data.mode === 'edit';
  private readonly candidate = this.data.mode === 'edit' ? this.data.candidate : null;
  private pendingId = 0;

  readonly form = this.fb.nonNullable.group({
    firstName: [this.candidate?.firstName ?? '', Validators.required],
    lastName: [this.candidate?.lastName ?? '', Validators.required],
    email: [this.candidate?.email ?? ''],
    phone: [this.candidate?.phone ?? ''],
    documentId: [this.candidate?.documentId ?? ''],
    address: [this.candidate?.address ?? ''],
    city: [this.candidate?.city ?? ''],
    country: [this.candidate?.country ?? ''],
    birthDate: [this.candidate?.birthDate ?? ''],
    nationality: [this.candidate?.nationality ?? ''],
    linkedIn: [this.candidate?.linkedIn ?? ''],
    website: [this.candidate?.website ?? ''],
    summary: [this.candidate?.summary ?? ''],
    skillsText: [(this.candidate?.skills ?? []).join(', ')],
    notes: [this.candidate?.notes ?? ''],
    status: [this.candidate?.status ?? ('new' as CandidateStatus)],
    rawText: [this.candidate?.rawText ?? ''],
    education: this.fb.array(
      (this.candidate?.education?.length
        ? this.candidate.education
        : []
      ).map((e) => this.eduGroup(e)),
    ),
    experience: this.fb.array(
      (this.candidate?.experience?.length
        ? this.candidate.experience
        : []
      ).map((e) => this.expGroup(e)),
    ),
    languages: this.fb.array(
      (this.candidate?.languages?.length
        ? this.candidate.languages
        : []
      ).map((e) => this.langGroup(e)),
    ),
  });

  get education(): FormArray {
    return this.form.controls.education;
  }
  get experience(): FormArray {
    return this.form.controls.experience;
  }
  get languages(): FormArray {
    return this.form.controls.languages;
  }

  title(): string {
    if (this.data.mode === 'from-cv') {
      return this.step() === 'form' ? 'Revisar CV' : 'Nuevo desde CV';
    }
    return this.isEdit ? 'Editar candidato' : 'Nuevo candidato';
  }

  titleIcon(): string {
    if (this.data.mode === 'from-cv') return 'document_scanner';
    return this.isEdit ? 'edit' : 'person_add';
  }

  educationAt(i: number): FormGroup {
    return this.education.at(i) as FormGroup;
  }
  experienceAt(i: number): FormGroup {
    return this.experience.at(i) as FormGroup;
  }
  languagesAt(i: number): FormGroup {
    return this.languages.at(i) as FormGroup;
  }

  addEducation(): void {
    this.education.push(this.eduGroup());
  }
  addExperience(): void {
    this.experience.push(this.expGroup());
  }
  addLanguage(): void {
    this.languages.push(this.langGroup());
  }

  onFilesPicked(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const files = takeInputFiles(input);
    if (!files.length) return;

    const next = [...this.pendingFiles()];
    for (const file of files) {
      if (next.length >= 10) {
        this.snack.open('Máximo 10 archivos por CV', 'OK', { duration: 3000 });
        break;
      }
      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      next.push({ id: `f-${++this.pendingId}`, file, previewUrl });
    }
    this.pendingFiles.set(next);
  }

  removePending(index: number): void {
    const next = [...this.pendingFiles()];
    const [removed] = next.splice(index, 1);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    this.pendingFiles.set(next);
  }

  startParse(): void {
    const files = this.pendingFiles().map((p) => p.file);
    if (!files.length) return;
    this.pendingCount.set(files.length);
    this.step.set('parsing');
    this.api.parse(this.data.shopId, files).subscribe({
      next: (parsed) => {
        this.clearPendingPreviews();
        this.applyParsed(parsed);
        this.step.set('form');
      },
      error: (err) => {
        this.step.set('pick');
        const msg = err?.error?.message ?? 'No se pudo leer el CV';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
      },
    });
  }

  private clearPendingPreviews(): void {
    for (const p of this.pendingFiles()) {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    }
    this.pendingFiles.set([]);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const body: CandidatePayload = {
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      email: raw.email.trim() || null,
      phone: raw.phone.trim() || null,
      documentId: raw.documentId.trim() || null,
      address: raw.address.trim() || null,
      city: raw.city.trim() || null,
      country: raw.country.trim() || null,
      birthDate: raw.birthDate || null,
      nationality: raw.nationality.trim() || null,
      linkedIn: raw.linkedIn.trim() || null,
      website: raw.website.trim() || null,
      summary: raw.summary.trim() || null,
      skills: raw.skillsText
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
      education: raw.education.map((e) => ({
        institution: e.institution?.trim() || undefined,
        degree: e.degree?.trim() || undefined,
        period: e.period?.trim() || undefined,
      })),
      experience: raw.experience.map((e) => ({
        company: e.company?.trim() || undefined,
        role: e.role?.trim() || undefined,
        period: e.period?.trim() || undefined,
        description: e.description?.trim() || undefined,
      })),
      languages: raw.languages.map((e) => ({
        name: e.name?.trim() || undefined,
        level: e.level?.trim() || undefined,
      })),
      rawText: raw.rawText || null,
      notes: raw.notes.trim() || null,
      status: raw.status,
    };

    this.busy.set(true);
    if (this.isEdit && this.candidate) {
      this.api.update(this.data.shopId, this.candidate.id, body).subscribe({
        next: () => {
          this.busy.set(false);
          this.snack.open('Candidato actualizado', 'OK', { duration: 2500 });
          this.ref.close(true);
        },
        error: (err) => this.fail(err),
      });
      return;
    }

    this.api.create(this.data.shopId, body).subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open('Candidato creado', 'OK', { duration: 2500 });
        this.ref.close(true);
      },
      error: (err) => this.fail(err),
    });
  }

  private applyParsed(p: ParsedCv): void {
    this.form.patchValue({
      firstName: p.firstName || '',
      lastName: p.lastName || '',
      email: p.email || '',
      phone: p.phone || '',
      documentId: p.documentId || '',
      address: p.address || '',
      city: p.city || '',
      country: p.country || '',
      birthDate: p.birthDate || '',
      nationality: p.nationality || '',
      linkedIn: p.linkedIn || '',
      website: p.website || '',
      summary: p.summary || '',
      skillsText: (p.skills ?? []).join(', '),
      rawText: p.rawText || '',
      status: 'new',
    });
    this.education.clear();
    for (const e of p.education ?? []) this.education.push(this.eduGroup(e));
    this.experience.clear();
    for (const e of p.experience ?? []) this.experience.push(this.expGroup(e));
    this.languages.clear();
    for (const e of p.languages ?? []) this.languages.push(this.langGroup(e));
  }

  private eduGroup(e?: { institution?: string; degree?: string; period?: string }) {
    return this.fb.nonNullable.group({
      institution: [e?.institution ?? ''],
      degree: [e?.degree ?? ''],
      period: [e?.period ?? ''],
    });
  }

  private expGroup(e?: {
    company?: string;
    role?: string;
    period?: string;
    description?: string;
  }) {
    return this.fb.nonNullable.group({
      company: [e?.company ?? ''],
      role: [e?.role ?? ''],
      period: [e?.period ?? ''],
      description: [e?.description ?? ''],
    });
  }

  private langGroup(e?: { name?: string; level?: string }) {
    return this.fb.nonNullable.group({
      name: [e?.name ?? ''],
      level: [e?.level ?? ''],
    });
  }

  private fail(err: { error?: { message?: string | string[] } }): void {
    this.busy.set(false);
    const msg = err?.error?.message ?? 'No se pudo guardar';
    this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
  }
}
