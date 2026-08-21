import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FormsModule } from '@angular/forms';
import { ShopBackupApiService, BackupFormat } from './shop-backup-api.service';
import {
  BACKUP_MODULE_OPTIONS,
  BackupModuleId,
  alsoClearsHint,
  backupModuleLabel,
  expandBackupModulesClient,
} from './shop-backup-modules';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { takeInputFile } from '../../shared/utils/input-file';

export interface ShopBackupDialogData {
  shopId: string;
  shopName: string;
  shopSlug?: string;
}

@Component({
  selector: 'app-shop-backup-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatSnackBarModule,
    MatProgressBarModule,
    FormsModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>shield</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>Dump y reset</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>

    <mat-dialog-content>
      @if (busy()) {
        <mat-progress-bar mode="indeterminate" class="guy-progress mb-3" />
      }

      <p class="lead">
        Herramientas de super admin. Se conservan nombre, logo, color, moneda, POS y usuarios
        asignados. El restore solo acepta Excel.
      </p>

      <section class="block">
        <div class="block__head">
          <mat-icon>tune</mat-icon>
          <div>
            <h3>Alcance</h3>
            <p>Elegí todo el local o módulos concretos (para dump y reset).</p>
          </div>
        </div>

        <mat-radio-group
          class="scope-radios"
          [ngModel]="scopeMode()"
          (ngModelChange)="onScopeMode($event)"
          [disabled]="busy()"
        >
          <mat-radio-button value="all">Todo el local</mat-radio-button>
          <mat-radio-button value="modules">Por módulos</mat-radio-button>
        </mat-radio-group>

        @if (scopeMode() === 'modules') {
          <div class="module-grid">
            @for (m of moduleOptions; track m.id) {
              <mat-checkbox
                [checked]="selectedModules().includes(m.id)"
                [disabled]="busy()"
                (change)="toggleModule(m.id, $event.checked)"
              >
                {{ m.label }}
              </mat-checkbox>
            }
          </div>
          @if (depsHint()) {
            <p class="deps-hint">
              <mat-icon>info</mat-icon>
              También se incluye: {{ depsHint() }}
            </p>
          }
        }
      </section>

      <section class="block">
        <div class="block__head">
          <mat-icon>cloud_download</mat-icon>
          <div>
            <h3>Dump del sistema</h3>
            <p>Descargá un backup o cargá un Excel previo.</p>
          </div>
        </div>

        <div class="format-row">
          <span class="format-row__label">Formato al descargar</span>
          <mat-button-toggle-group
            [value]="format()"
            (change)="format.set($event.value)"
            [disabled]="busy()"
            hideSingleSelectionIndicator
          >
            <mat-button-toggle value="xlsx">Excel</mat-button-toggle>
            <mat-button-toggle value="sql">SQL</mat-button-toggle>
          </mat-button-toggle-group>
        </div>

        <div class="block__actions">
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="busy() || !canAct()"
            (click)="download()"
          >
            <app-busy-label [busy]="busy()" busyLabel="Descargando…">
              <mat-icon>download</mat-icon>
              Descargar dump
            </app-busy-label>
          </button>
          <input
            #fileInput
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            (change)="onFile($event)"
          />
          <button mat-stroked-button type="button" [disabled]="busy()" (click)="fileInput.click()">
            <mat-icon>upload_file</mat-icon>
            Cargar dump (Excel)
          </button>
        </div>
      </section>

      <section class="block block--danger">
        <div class="block__head">
          <span class="danger-ico" aria-hidden="true">
            <mat-icon>warning</mat-icon>
          </span>
          <div class="block__head-text">
            <div class="danger-title-row">
              <h3>Resetear</h3>
              <span class="danger-badge">Irreversible</span>
            </div>
            <p class="danger-shop">{{ data.shopName }}</p>
          </div>
        </div>

        <div class="keep-lose">
          <div class="keep-lose__col keep-lose__col--keep">
            <span class="keep-lose__label">Se conserva</span>
            <ul>
              <li>Configuración y marca</li>
              <li>Usuarios asignados</li>
            </ul>
          </div>
          <div class="keep-lose__col keep-lose__col--lose">
            <span class="keep-lose__label">Se borra</span>
            <ul>
              @for (label of wipeLabels(); track label) {
                <li>{{ label }}</li>
              }
            </ul>
          </div>
        </div>

        <p class="danger-hint">
          @if (scopeMode() === 'all') {
            El local queda vacío: no se recrea el catálogo por defecto.
          } @else {
            Solo se vacían los módulos elegidos (y sus dependencias).
          }
        </p>

        <div class="confirm-row">
          <mat-form-field appearance="outline" class="confirm-field" subscriptSizing="dynamic">
            <mat-label>Confirmación</mat-label>
            <input
              matInput
              [ngModel]="confirmText()"
              (ngModelChange)="confirmText.set($event)"
              autocomplete="off"
              spellcheck="false"
              placeholder="RESET"
              [disabled]="busy()"
            />
            <mat-hint>Escribí exactamente RESET</mat-hint>
          </mat-form-field>
          <button
            mat-flat-button
            type="button"
            class="danger-btn"
            [class.danger-btn--ready]="canReset()"
            [disabled]="busy() || !canReset() || !canAct()"
            (click)="reset()"
          >
            <app-busy-label [busy]="busy()" busyLabel="Reseteando…">
              <mat-icon>delete_forever</mat-icon>
              Vaciar datos
            </app-busy-label>
          </button>
        </div>
      </section>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" [disabled]="busy()" (click)="ref.close(false)">Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .lead {
        margin: 0 0 1.1rem;
        font-size: 0.9rem;
        line-height: 1.45;
        color: var(--guy-muted, #5f6f76);
      }
      .block {
        margin-bottom: 1rem;
        padding: 1rem 1.05rem;
        border-radius: 14px;
        border: 1px solid var(--guy-border, #d7e0d9);
        background: color-mix(in srgb, var(--guy-surface, #f3f6f4) 55%, var(--guy-card, #fff));
      }
      .block--danger {
        border-color: color-mix(in srgb, #c62828 42%, var(--guy-border, #ddd));
        background: linear-gradient(180deg, color-mix(in srgb, #c62828 10%, #fff) 0%, #fff 72%);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, #c62828 8%, transparent);
      }
      .danger-ico {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background: color-mix(in srgb, #c62828 14%, #fff);
        color: #b71c1c;
      }
      .danger-ico mat-icon {
        color: inherit !important;
      }
      .block__head-text {
        min-width: 0;
        flex: 1;
      }
      .danger-title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.45rem 0.65rem;
      }
      .danger-badge {
        font-size: 0.65rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #b71c1c;
        background: color-mix(in srgb, #c62828 12%, #fff);
        border: 1px solid color-mix(in srgb, #c62828 28%, transparent);
        border-radius: 999px;
        padding: 0.15rem 0.5rem;
      }
      .danger-shop {
        margin: 0.25rem 0 0 !important;
        font-weight: 600;
        color: var(--guy-navy, #003366) !important;
      }
      .keep-lose {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.65rem;
        margin: 0.85rem 0 0.75rem;
      }
      @media (max-width: 520px) {
        .keep-lose {
          grid-template-columns: 1fr;
        }
      }
      .keep-lose__col {
        border-radius: 10px;
        padding: 0.65rem 0.75rem;
        border: 1px solid var(--guy-border, #e5e5e5);
      }
      .keep-lose__col--keep {
        background: color-mix(in srgb, #2e7d32 8%, #fff);
      }
      .keep-lose__col--lose {
        background: color-mix(in srgb, #c62828 7%, #fff);
      }
      .keep-lose__label {
        display: block;
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        margin-bottom: 0.35rem;
        color: var(--guy-muted, #666);
      }
      .keep-lose__col ul {
        margin: 0;
        padding-left: 1.1rem;
        font-size: 0.82rem;
        line-height: 1.45;
      }
      .danger-hint {
        margin: 0 0 0.85rem;
        font-size: 0.82rem;
        color: var(--guy-muted, #5f6f76);
      }
      .confirm-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        align-items: flex-start;
      }
      .confirm-field {
        flex: 1 1 12rem;
        min-width: 0;
      }
      .danger-btn {
        min-height: 2.75rem;
        background: color-mix(in srgb, #c62828 22%, #e0e0e0) !important;
        color: #fff !important;
      }
      .danger-btn--ready {
        background: #c62828 !important;
      }
      .block__head {
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
        margin-bottom: 0.85rem;
      }
      .block__head mat-icon {
        margin-top: 0.1rem;
        color: var(--guy-navy, #003366);
      }
      .block--danger .block__head mat-icon {
        color: inherit;
      }
      .block__head h3 {
        margin: 0 0 0.2rem;
        font-size: 0.98rem;
        font-weight: 700;
        color: var(--guy-navy, #003366);
      }
      .block--danger .block__head h3 {
        color: #b71c1c;
      }
      .block__head p {
        margin: 0;
        font-size: 0.82rem;
        line-height: 1.4;
        color: var(--guy-muted, #5f6f76);
      }
      .block__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .scope-radios {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem 1.25rem;
        margin-bottom: 0.75rem;
      }
      .module-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
        gap: 0.35rem 0.75rem;
      }
      .deps-hint {
        display: flex;
        align-items: flex-start;
        gap: 0.35rem;
        margin: 0.75rem 0 0;
        font-size: 0.82rem;
        color: var(--guy-muted, #5f6f76);
        line-height: 1.4;
      }
      .deps-hint mat-icon {
        font-size: 1.05rem;
        width: 1.05rem;
        height: 1.05rem;
        margin-top: 0.1rem;
        color: var(--guy-primary, #1d65a0);
      }
      .format-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.65rem 1rem;
        margin-bottom: 0.85rem;
      }
      .format-row__label {
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--guy-navy, #003366);
      }
    `,
  ],
})
export class ShopBackupDialogComponent {
  readonly data = inject<ShopBackupDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ShopBackupDialogComponent, boolean>);
  private readonly api = inject(ShopBackupApiService);
  private readonly snack = inject(MatSnackBar);

  readonly moduleOptions = BACKUP_MODULE_OPTIONS;
  readonly busy = signal(false);
  readonly confirmText = signal('');
  readonly scopeMode = signal<'all' | 'modules'>('all');
  readonly selectedModules = signal<BackupModuleId[]>([]);
  readonly format = signal<BackupFormat>('xlsx');

  readonly canReset = computed(() => this.confirmText().trim() === 'RESET');
  readonly canAct = computed(
    () => this.scopeMode() === 'all' || this.selectedModules().length > 0,
  );
  readonly depsHint = computed(() => alsoClearsHint(this.selectedModules()));
  readonly wipeLabels = computed(() => {
    if (this.scopeMode() === 'all') {
      return ['Cierres, movimientos, POS', 'Personal y nómina', 'Cuentas y conceptos'];
    }
    return expandBackupModulesClient(this.selectedModules()).map(backupModuleLabel);
  });

  onScopeMode(mode: 'all' | 'modules'): void {
    this.scopeMode.set(mode);
  }

  toggleModule(id: BackupModuleId, checked: boolean): void {
    this.selectedModules.update((list) => {
      if (checked) return list.includes(id) ? list : [...list, id];
      return list.filter((x) => x !== id);
    });
  }

  private modulesParam(): BackupModuleId[] | 'all' {
    return this.scopeMode() === 'all' ? 'all' : this.selectedModules();
  }

  download(): void {
    if (!this.canAct()) return;
    const format = this.format();
    this.busy.set(true);
    this.api
      .downloadBackup(this.data.shopId, { modules: this.modulesParam(), format })
      .subscribe({
        next: (blob) => {
          this.busy.set(false);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const slug = this.data.shopSlug || 'local';
          const ext = format === 'sql' ? 'sql' : 'xlsx';
          a.download = `dump-${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
          a.click();
          URL.revokeObjectURL(url);
          this.snack.open(
            format === 'sql' ? 'Dump SQL descargado' : 'Dump Excel descargado',
            'OK',
            { duration: 2500 },
          );
        },
        error: (err) => {
          this.busy.set(false);
          this.showErr(err, 'No se pudo descargar el dump');
        },
      });
  }

  async onFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = await takeInputFile(input);
    if (!file) return;
    const ok = window.confirm(
      `¿Cargar dump en “${this.data.shopName}”? Se borrarán los datos del alcance del Excel (o todo si es dump completo) y se cargará el archivo.`,
    );
    if (!ok) return;
    this.busy.set(true);
    this.api.restoreBackup(this.data.shopId, file).subscribe({
      next: () => {
        this.busy.set(false);
        this.snack.open('Dump restaurado', 'OK', { duration: 3000 });
        this.ref.close(true);
      },
      error: (err) => {
        this.busy.set(false);
        this.showErr(err, 'No se pudo cargar el dump');
      },
    });
  }

  reset(): void {
    if (!this.canReset() || !this.canAct()) return;
    const scope =
      this.scopeMode() === 'all'
        ? 'todo el local'
        : expandBackupModulesClient(this.selectedModules()).map(backupModuleLabel).join(', ');
    const ok = window.confirm(
      `¿Vaciar “${this.data.shopName}” (${scope})? No se puede deshacer sin un dump.`,
    );
    if (!ok) return;
    this.busy.set(true);
    this.api.resetShop(this.data.shopId, { modules: this.modulesParam() }).subscribe({
      next: () => {
        this.busy.set(false);
        this.confirmText.set('');
        this.snack.open('Datos vaciados', 'OK', { duration: 3500 });
        this.ref.close(true);
      },
      error: (err) => {
        this.busy.set(false);
        this.showErr(err, 'No se pudo resetear el local');
      },
    });
  }

  private showErr(err: any, fallback: string): void {
    const msg = err?.error?.message ?? fallback;
    this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4500 });
  }
}
