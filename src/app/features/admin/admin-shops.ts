import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { activeLabel } from '../../core/i18n/labels';
import { AdminShopDialogComponent, AdminShopRow } from './admin-shop-dialog';
import { ShopBackupDialogComponent } from './shop-backup-dialog';
import { usePageRefresh } from '../../core/page-refresh.service';
import { MatIconModule } from '@angular/material/icon';

export type PrintAgentInstallerOs = 'windows' | 'macos' | 'linux';

export type PrintAgentInstallerItem = {
  os: PrintAgentInstallerOs;
  version: string;
  source?: 'file' | 'url';
  fileName: string;
  size: number;
  uploadedAt: string;
  downloadUrl?: string;
};

const INSTALLER_OS_OPTIONS: { value: PrintAgentInstallerOs; label: string }[] = [
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
];

function formatInstallerSize(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n < 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

@Component({
  selector: 'app-admin-shops',
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatIconModule,
    PageHeaderComponent,
    DataTableComponent,
  ],
  template: `
    <app-page-header
      title="Locales"
      subtitle="Crear, editar y habilitar / deshabilitar locales"
      actionLabel="Nuevo local"
      actionIcon="add_business"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    <div class="panel-card installer-card">
      <div class="installer-card__intro">
        <h2>Instalador Cierres-Comandas</h2>
        <p>
          Podés subir el archivo o pegar el link de descarga, por sistema operativo y versión. Los
          locales lo bajan desde Configuración → Operación (Comandas / impresora).
        </p>
      </div>

      <div class="installer-card__mode">
        <button
          type="button"
          class="mode-pill"
          [class.mode-pill--active]="uploadMode === 'file'"
          (click)="uploadMode = 'file'"
        >
          Archivo
        </button>
        <button
          type="button"
          class="mode-pill"
          [class.mode-pill--active]="uploadMode === 'url'"
          (click)="uploadMode = 'url'"
        >
          Link
        </button>
      </div>

      <div class="installer-card__upload">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Sistema operativo</mat-label>
          <mat-select [(ngModel)]="uploadOs">
            @for (opt of osOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Versión</mat-label>
          <input matInput [(ngModel)]="uploadVersion" placeholder="ej. 1.2.0" />
        </mat-form-field>
        @if (uploadMode === 'url') {
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="installer-url-field">
            <mat-label>Link de descarga</mat-label>
            <input matInput [(ngModel)]="uploadUrl" placeholder="https://…" />
          </mat-form-field>
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="installerBusy()"
            (click)="saveInstallerLink()"
          >
            <mat-icon>link</mat-icon>
            {{ itemFor(uploadOs) ? 'Reemplazar link' : 'Guardar link' }}
          </button>
        } @else {
          <input
            #installerInput
            type="file"
            accept=".exe,.msi,.zip,.dmg,.pkg,.AppImage,.deb,.rpm,.tar.gz,application/octet-stream"
            hidden
            (change)="onInstallerPicked($event)"
          />
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="installerBusy()"
            (click)="installerInput.click()"
          >
            <mat-icon>upload_file</mat-icon>
            {{ itemFor(uploadOs) ? 'Reemplazar' : 'Cargar' }}
          </button>
        }
      </div>

      @if (installerLoading()) {
        <p class="text-muted small mb-0">Cargando instaladores…</p>
      } @else {
        <div class="installer-card__list">
          @for (opt of osOptions; track opt.value) {
            <div class="installer-card__row">
              <div class="installer-card__row-text">
                <strong>{{ opt.label }}</strong>
                @if (itemFor(opt.value); as item) {
                  <span>
                    v{{ item.version }} ·
                    {{ item.source === 'url' ? 'Link' : 'Archivo' }} ·
                    {{ item.fileName }}
                    @if (item.source !== 'url') {
                      @if (sizeLabel(item.size); as sz) {
                        · {{ sz }}
                      }
                    }
                  </span>
                } @else {
                  <span class="text-muted">Sin instalador</span>
                }
              </div>
              <div class="installer-card__row-actions">
                @if (itemFor(opt.value); as item) {
                  <button
                    mat-stroked-button
                    type="button"
                    [disabled]="installerBusy()"
                    (click)="downloadInstaller(opt.value, item)"
                  >
                    <mat-icon>download</mat-icon>
                    Descargar
                  </button>
                  <button
                    mat-stroked-button
                    type="button"
                    color="warn"
                    [disabled]="installerBusy()"
                    (click)="removeInstaller(opt.value)"
                  >
                    <mat-icon>delete</mat-icon>
                    Quitar
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>

    <div class="panel-card panel-card--flush">
      <div class="panel-card__body">
        <app-data-table
          [columns]="columns"
          [rows]="rows()"
          [loading]="loading()"
          [sortable]="true"
          [showActions]="true"
          [canDuplicate]="canBackupTools"
          duplicateLabel="Dump / reset"
          duplicateIcon="backup"
          [canRemove]="always"
          removeLabel="Habilitar / deshabilitar"
          removeIcon="storefront"
          editLabel="Editar"
          (edit)="openEdit($event)"
          (duplicate)="openBackupTools($event)"
          (remove)="toggleActive($event)"
        />
      </div>
    </div>
  `,
  styles: [
    `
      .installer-card {
        margin-bottom: 1rem;
        padding: 1rem 1.1rem;
      }
      .installer-card__intro h2 {
        margin: 0 0 0.35rem;
        font-size: 1.05rem;
        font-weight: 800;
      }
      .installer-card__intro p {
        margin: 0 0 0.85rem;
        color: var(--guy-muted, #5f6f76);
        font-size: 0.9rem;
        line-height: 1.4;
      }
      .installer-card__upload {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        align-items: center;
        margin-bottom: 0.85rem;
      }
      .installer-card__mode {
        display: inline-flex;
        gap: 0.35rem;
        margin-bottom: 0.75rem;
      }
      .mode-pill {
        border: 1px solid var(--guy-border, #d7e0d9);
        background: #fff;
        border-radius: 999px;
        padding: 0.25rem 0.75rem;
        font-size: 0.8rem;
        font-weight: 650;
        cursor: pointer;
        color: var(--guy-muted, #5f6f76);
      }
      .mode-pill--active {
        background: var(--guy-primary, #5c4033);
        border-color: var(--guy-primary, #5c4033);
        color: #fff;
      }
      .installer-url-field {
        min-width: min(100%, 18rem) !important;
        flex: 1 1 18rem !important;
      }
      .installer-card__upload mat-form-field {
        min-width: 9.5rem;
        flex: 0 1 11rem;
      }
      .installer-card__list {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }
      .installer-card__row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.55rem 1rem;
        align-items: center;
        justify-content: space-between;
        padding: 0.55rem 0.65rem;
        border: 1px solid color-mix(in srgb, var(--guy-border, #d7e0e4) 85%, transparent);
        border-radius: 0.55rem;
      }
      .installer-card__row-text {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        min-width: min(100%, 14rem);
        flex: 1 1 14rem;
        font-size: 0.9rem;
      }
      .installer-card__row-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
    `,
  ],
})
export class AdminShopsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly rows = signal<AdminShopRow[]>([]);
  readonly loading = signal(true);
  readonly never = () => false;
  readonly always = () => true;
  readonly canBackupTools = () => this.auth.isSuperAdmin();

  readonly osOptions = INSTALLER_OS_OPTIONS;
  readonly installerLoading = signal(false);
  readonly installerBusy = signal(false);
  readonly installerItems = signal<PrintAgentInstallerItem[]>([]);

  uploadOs: PrintAgentInstallerOs = 'windows';
  uploadVersion = '';
  uploadUrl = '';
  uploadMode: 'file' | 'url' = 'file';

  readonly columns: DataTableColumn[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'slug', label: 'Slug' },
    { key: 'currency', label: 'Moneda' },
    {
      key: 'unitsLabel',
      label: 'Unidades',
      format: (r) => String(r['unitsLabel'] ?? '—'),
    },
    { key: 'active', label: 'Estado', format: (r) => activeLabel(!!r['active']) },
  ];

  constructor() {
    usePageRefresh(() => this.reload());
  }

  ngOnInit(): void {
    if (!this.auth.isSuperAdmin()) {
      void this.router.navigate(['/']);
      return;
    }
    this.reload();
    this.reloadInstaller();
  }

  itemFor(os: PrintAgentInstallerOs): PrintAgentInstallerItem | null {
    return this.installerItems().find((x) => x.os === os) ?? null;
  }

  sizeLabel(n: number | null | undefined): string | null {
    return formatInstallerSize(n);
  }

  reloadInstaller(): void {
    this.installerLoading.set(true);
    this.http
      .get<{ items: PrintAgentInstallerItem[] }>(`${environment.apiUrl}/admin/print-agent-installer`)
      .subscribe({
        next: (res) => {
          this.installerLoading.set(false);
          this.installerItems.set(Array.isArray(res.items) ? res.items : []);
        },
        error: () => {
          this.installerLoading.set(false);
          this.installerItems.set([]);
        },
      });
  }

  onInstallerPicked(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.installerBusy()) return;
    const version = this.uploadVersion.trim();
    if (!version) {
      this.snack.open('Indicá la versión antes de cargar', 'OK', { duration: 3000 });
      return;
    }
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('os', this.uploadOs);
    form.append('version', version);
    this.installerBusy.set(true);
    this.http
      .post<{ items: PrintAgentInstallerItem[] }>(
        `${environment.apiUrl}/admin/print-agent-installer`,
        form,
      )
      .subscribe({
        next: (res) => {
          this.installerBusy.set(false);
          this.installerItems.set(Array.isArray(res.items) ? res.items : []);
          this.snack.open('Instalador cargado', 'OK', { duration: 2500 });
        },
        error: (err) => {
          this.installerBusy.set(false);
          const msg = err?.error?.message || 'No se pudo cargar el instalador';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
        },
      });
  }

  saveInstallerLink(): void {
    if (this.installerBusy()) return;
    const version = this.uploadVersion.trim();
    const downloadUrl = this.uploadUrl.trim();
    if (!version) {
      this.snack.open('Indicá la versión antes de guardar', 'OK', { duration: 3000 });
      return;
    }
    if (!downloadUrl) {
      this.snack.open('Pegá el link de descarga', 'OK', { duration: 3000 });
      return;
    }
    this.installerBusy.set(true);
    this.http
      .post<{ items: PrintAgentInstallerItem[] }>(
        `${environment.apiUrl}/admin/print-agent-installer/link`,
        { os: this.uploadOs, version, downloadUrl },
      )
      .subscribe({
        next: (res) => {
          this.installerBusy.set(false);
          this.installerItems.set(Array.isArray(res.items) ? res.items : []);
          this.snack.open('Link de instalador guardado', 'OK', { duration: 2500 });
        },
        error: (err) => {
          this.installerBusy.set(false);
          const msg = err?.error?.message || 'No se pudo guardar el link';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
        },
      });
  }

  downloadInstaller(os: PrintAgentInstallerOs, item: PrintAgentInstallerItem): void {
    if (this.installerBusy()) return;
    if (item.source === 'url' && item.downloadUrl) {
      window.open(item.downloadUrl, '_blank', 'noopener');
      return;
    }
    this.installerBusy.set(true);
    this.http
      .get(`${environment.apiUrl}/admin/print-agent-installer/${os}/download`, {
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.installerBusy.set(false);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = item.fileName || `Cierres-Comandas-${os}`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => {
          this.installerBusy.set(false);
          this.snack.open('No se pudo descargar el instalador', 'OK', { duration: 3500 });
        },
      });
  }

  removeInstaller(os: PrintAgentInstallerOs): void {
    if (this.installerBusy()) return;
    const label = INSTALLER_OS_OPTIONS.find((x) => x.value === os)?.label ?? os;
    if (!window.confirm(`¿Quitar el instalador de ${label}?`)) return;
    this.installerBusy.set(true);
    this.http
      .delete<{ items: PrintAgentInstallerItem[] }>(
        `${environment.apiUrl}/admin/print-agent-installer/${os}`,
      )
      .subscribe({
        next: (res) => {
          this.installerBusy.set(false);
          this.installerItems.set(Array.isArray(res.items) ? res.items : []);
          this.snack.open('Instalador quitado', 'OK', { duration: 2500 });
        },
        error: (err) => {
          this.installerBusy.set(false);
          const msg = err?.error?.message || 'No se pudo quitar el instalador';
          this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
        },
      });
  }

  reload(): void {
    this.loading.set(true);
    this.http.get<AdminShopRow[]>(`${environment.apiUrl}/shops`).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar los locales', 'OK', { duration: 3000 });
      },
    });
  }

  openCreate(): void {
    this.openDialog({ mode: 'create' });
  }

  openEdit(row: AdminShopRow): void {
    this.openDialog({ mode: 'edit', shop: row });
  }

  openBackupTools(row: AdminShopRow): void {
    if (!this.auth.isSuperAdmin()) return;
    this.dialogTitle
      .track(
        this.dialog.open(ShopBackupDialogComponent, {
          width: '640px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { shopId: row.id, shopName: row.name, shopSlug: row.slug },
        }),
        'Dump y reset',
      )
      .afterClosed()
      .subscribe();
  }

  toggleActive(row: AdminShopRow): void {
    const next = !row.active;
    this.http.patch<AdminShopRow>(`${environment.apiUrl}/shops/${row.id}`, { active: next }).subscribe({
      next: () => {
        this.snack.open(
          next ? 'Local habilitado' : 'Local deshabilitado · no aparece en el selector',
          'OK',
          { duration: 3000 },
        );
        this.reload();
        void this.auth.refreshMe();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo cambiar el estado';
        this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
      },
    });
  }

  private openDialog(mode: { mode: 'create' } | { mode: 'edit'; shop: AdminShopRow }): void {
    this.dialogTitle
      .track(
        this.dialog.open(AdminShopDialogComponent, {
          width: '560px',
          maxWidth: '96vw',
          maxHeight: '94vh',
          panelClass: 'guy-dialog',
          data: mode,
        }),
        mode.mode === 'edit' ? 'Editar local' : 'Nuevo local',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) {
          this.reload();
          void this.auth.refreshMe();
        }
      });
  }
}
