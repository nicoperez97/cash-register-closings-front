import { Component, inject, input, model, output } from '@angular/core';
import {
  AbstractControl,
  ControlContainer,
  FormArray,
  FormGroupDirective,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { SelectSearchComponent } from '../../shared/components/select-search';
import { ADMIN_SHOP_HOST } from './admin-shop-host';

export interface AdminShopPosnetTypeOption {
  value: string;
  label: string;
}

export interface AdminShopClosingSourceKindOption {
  value: string;
  label: string;
}

export interface AdminShopAccountOption {
  id: string;
  name: string;
}

export const CREATE_DESTINATION_ACCOUNT_VALUE = '__create_account__';

@Component({
  selector: 'app-admin-shop-devices',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    SelectSearchComponent,
  ],
  viewProviders: [{ provide: ControlContainer, useExisting: FormGroupDirective }],
  template: `
    <section class="panel-card guy-form-section">
      <h2 class="guy-section-title">Comandas (impresora)</h2>
      <div class="shop-admin__posnets-head">
        <p class="text-muted small mb-0">
          Token para <strong>Cierres-Comandas.exe</strong>. Las comanderas y qué platos salen en cada una
          se configuran en el exe (Carta).
        </p>
        <div class="shop-admin__source-actions">
          @if (canEdit()) {
            @if (printAgentConfigured()) {
              <button
                mat-stroked-button
                type="button"
                color="warn"
                [disabled]="printAgentBusy()"
                (click)="revokePrintAgentToken.emit()"
              >
                <mat-icon>link_off</mat-icon>
                Revocar
              </button>
            }
            <button
              mat-stroked-button
              type="button"
              [disabled]="printAgentBusy()"
              (click)="generatePrintAgentToken.emit()"
            >
              <mat-icon>vpn_key</mat-icon>
              {{ printAgentConfigured() ? 'Regenerar token' : 'Generar token' }}
            </button>
          }
        </div>
      </div>
      @if (printAgentLoading()) {
        <p class="text-muted small mb-0">Cargando…</p>
      } @else if (printAgentConfigured()) {
        <div class="shop-admin__token-active">
          <p class="text-muted small mb-0">
            Token activo:
            <code>{{ printAgentTokenPrefix() || 'pa_…' }}</code>
          </p>
        </div>
        @if (printAgentFreshToken()) {
          <div class="shop-admin__print-token">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="shop-admin__print-token-field">
              <mat-label>Token</mat-label>
              <input matInput readonly [value]="printAgentFreshToken()" />
            </mat-form-field>
            <button mat-flat-button color="primary" type="button" (click)="copyPrintAgentToken.emit()">
              <mat-icon>content_copy</mat-icon>
              Copiar
            </button>
          </div>
        } @else {
          <div class="shop-admin__token-legacy">
            @if (canEdit()) {
              <p class="text-muted small mb-0">
                Este token es anterior y no se puede copiar así. Regeneralo una vez (el agent pide el token nuevo) o dejá Cierres-Comandas conectado y recargá.
              </p>
              <button
                mat-stroked-button
                type="button"
                [disabled]="printAgentLoading()"
                (click)="reloadPrintAgentStatus.emit()"
              >
                <mat-icon>refresh</mat-icon>
                Recargar
              </button>
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="printAgentBusy()"
                (click)="generatePrintAgentToken.emit()"
              >
                <mat-icon>vpn_key</mat-icon>
                Regenerar para poder copiar
              </button>
            } @else {
              <p class="text-muted small mb-0">
                Este token es anterior. Abrí Cierres-Comandas con este token, esperá que conecte y recargá esta página para poder copiarlo. Si no, pedile a quien administre el local que lo regenere una vez.
              </p>
              <button
                mat-stroked-button
                type="button"
                [disabled]="printAgentLoading()"
                (click)="reloadPrintAgentStatus.emit()"
              >
                <mat-icon>refresh</mat-icon>
                Recargar
              </button>
            }
          </div>
        }
      } @else if (canEdit()) {
        <p class="text-muted small mb-0">Todavía no hay token. Generá uno y pegalo en Cierres-Comandas → Conexión.</p>
      } @else {
        <p class="text-muted small mb-0">Todavía no hay token de Comandas.</p>
      }
      <div class="shop-admin__installer-block">
        <p class="text-muted small mb-0">Instaladores publicados</p>
        @if (installerLoading()) {
          <p class="text-muted small mb-0">Buscando instaladores…</p>
        } @else if (installerItems().length) {
          <div class="shop-admin__installer-list">
            @for (item of installerItems(); track item.os) {
              <div class="shop-admin__installer-row">
                <p class="text-muted small mb-0">
                  <strong>{{ osLabel(item.os) }}</strong>
                  · v{{ item.version }}
                  · {{ item.source === 'url' ? 'Link' : 'Archivo' }}
                  · {{ item.fileName }}
                  @if (item.source !== 'url') {
                    @if (sizeLabel(item.size); as sz) {
                      · {{ sz }}
                    }
                  }
                </p>
                <button
                  mat-stroked-button
                  type="button"
                  [disabled]="installerBusy()"
                  (click)="downloadInstaller.emit(item.os)"
                >
                  <mat-icon>download</mat-icon>
                  Descargar
                </button>
              </div>
            }
          </div>
        } @else {
          <p class="text-muted small mb-0">
            Todavía no hay instalador publicado. Pedile a un super admin que lo cargue en Locales.
          </p>
        }
      </div>
    </section>

    <section class="panel-card guy-form-section">
      <h2 class="guy-section-title">Posnets</h2>
      <div class="shop-admin__posnets-head">
        <p class="text-muted small mb-0">
          Posnet = terminal en el local (PVS / Mercado Pago) que aparece en el cierre. Si cobrás por
          Pedidos Ya u otra fuente aparte, usá <strong>Cuentas aparte</strong> más abajo, no un
          posnet.
        </p>
        @if (canEdit()) {
          <button mat-stroked-button type="button" (click)="addPosnet.emit()">
            <mat-icon>add</mat-icon>
            Agregar posnet
          </button>
        }
      </div>
      <div class="shop-admin__posnets" formArrayName="posnets">
        @for (row of posnets.controls; track row; let i = $index) {
          <div class="shop-admin__posnet-row" [formGroupName]="i">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Nombre</mat-label>
              <input matInput formControlName="name" placeholder="ej. Caja 1" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Tipo</mat-label>
              <mat-select formControlName="type">
                @for (opt of posnetTypes(); track opt.value) {
                  <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            @if (canEdit()) {
              <button
                mat-icon-button
                type="button"
                class="shop-admin__posnet-remove"
                aria-label="Quitar posnet"
                (click)="removePosnet.emit(i)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            }
          </div>
        } @empty {
          <p class="text-muted small mb-0">
            Sin posnets. En el cierre, PVS y Mercado Pago se cargan a mano; Cuenta DNI por
            transferencias.
          </p>
        }
      </div>
    </section>

    <section class="panel-card guy-form-section">
      <h2 class="guy-section-title">Cuentas aparte</h2>
      <div class="shop-admin__posnets-head">
        <p class="text-muted small mb-0">
          Fuentes que no deben sumar al total declarado (Pedidos Ya, delivery propio, etc.). Si
          rinden después o van a una cuenta, elegí el destino (o creá una cuenta nueva desde el
          selector). Guardá con el botón de esta sección (es aparte del Guardar cambios del pie).
        </p>
        <div class="shop-admin__source-actions">
          @if (canEdit()) {
            <button mat-stroked-button type="button" (click)="addClosingSource.emit()">
              <mat-icon>add</mat-icon>
              Agregar fuente
            </button>
            <button
              mat-stroked-button
              type="button"
              [disabled]="sourceSaving()"
              (click)="saveClosingSources.emit()"
            >
              <mat-icon>save</mat-icon>
              {{ sourceSaving() ? 'Guardando…' : 'Guardar fuentes' }}
            </button>
          }
        </div>
      </div>
      <div class="shop-admin__sources" formArrayName="closingSources">
        @for (row of closingSources.controls; track row; let i = $index) {
          <div class="shop-admin__source-row" [formGroupName]="i">
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Nombre</mat-label>
              <input matInput formControlName="name" placeholder="ej. Pedidos Ya" />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic">
              <mat-label>Qué hacer con el monto</mat-label>
              <mat-select
                formControlName="kind"
                (selectionChange)="closingSourceKindChange.emit(i)"
              >
                @for (opt of closingSourceKinds(); track opt.value) {
                  <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            @if (sourceNeedsAccount()(i)) {
              <mat-form-field appearance="outline" subscriptSizing="dynamic">
                <mat-label>Cuenta destino</mat-label>
                <mat-select
                  formControlName="accountId"
                  panelClass="guy-select-search-panel"
                  (openedChange)="selectOpened.emit($event)"
                  (selectionChange)="onDestinationPicked(i, $event.value)"
                >
                  <mat-option disabled class="select-search-opt">
                    <app-select-search [(query)]="accountSearchQuery" placeholder="Buscar cuenta…" />
                  </mat-option>
                  @if (canEdit() && canManageAccounts()) {
                    <mat-option [value]="createAccountValue">+ Nueva cuenta…</mat-option>
                  }
                  <mat-option [value]="null">Elegí una cuenta</mat-option>
                  @for (a of filteredSourceAccounts()(accountIdOf(row)); track a.id) {
                    <mat-option [value]="a.id">{{ a.name }}</mat-option>
                  }
                  @if (
                    accountSearchQuery() &&
                    !filteredSourceAccounts()(accountIdOf(row)).length
                  ) {
                    <mat-option disabled>Sin resultados</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            } @else {
              <span class="shop-admin__source-spacer" aria-hidden="true"></span>
            }
            <mat-checkbox formControlName="includeInDeclared">Suma al declarado</mat-checkbox>
            @if (canEdit()) {
              <button
                mat-icon-button
                type="button"
                class="shop-admin__posnet-remove"
                aria-label="Quitar fuente"
                (click)="removeClosingSource.emit(i)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            }
          </div>
        } @empty {
          @if (sourcesLoading()) {
            <p class="text-muted small mb-0">Cargando fuentes…</p>
          } @else if (sourcesLoadFailed()) {
            <div class="shop-admin__sources-empty-error">
              <p class="text-muted small mb-0">No se pudieron cargar las fuentes extra.</p>
              <button mat-stroked-button type="button" (click)="reloadClosingSources.emit()">
                <mat-icon>refresh</mat-icon>
                Reintentar
              </button>
            </div>
          } @else {
            <p class="text-muted small mb-0">
              Sin fuentes extra. El cierre usa solo PVS, efectivo, MP, DNI, delivery y transferencia.
            </p>
          }
        }
      </div>
    </section>
  `,
  styleUrl: './admin-shop.scss',
})
export class AdminShopDevicesComponent {
  private readonly host = inject(ADMIN_SHOP_HOST);

  readonly createAccountValue = CREATE_DESTINATION_ACCOUNT_VALUE;
  readonly canEdit = input(true);
  readonly posnetTypes = input<readonly AdminShopPosnetTypeOption[]>([]);
  readonly closingSourceKinds = input<readonly AdminShopClosingSourceKindOption[]>([]);
  readonly sourceSaving = input(false);
  readonly canManageAccounts = input(false);
  readonly sourcesLoading = input(false);
  readonly sourcesLoadFailed = input(false);
  readonly printAgentLoading = input(false);
  readonly printAgentBusy = input(false);
  readonly printAgentConfigured = input(false);
  readonly printAgentTokenPrefix = input<string | null>(null);
  readonly printAgentFreshToken = input<string | null>(null);
  readonly installerLoading = input(false);
  readonly installerBusy = input(false);
  readonly installerItems = input<
    readonly {
      os: string;
      version: string;
      source?: 'file' | 'url';
      fileName: string;
      size: number;
      uploadedAt: string;
      downloadUrl?: string;
    }[]
  >([]);
  readonly accountSearchQuery = model('');
  readonly sourceNeedsAccount = input<(index: number) => boolean>(() => false);
  readonly filteredSourceAccounts = input<(keepId?: string | null) => AdminShopAccountOption[]>(
    () => [],
  );

  readonly addPosnet = output<void>();
  readonly removePosnet = output<number>();
  readonly addClosingSource = output<void>();
  readonly removeClosingSource = output<number>();
  readonly closingSourceKindChange = output<number>();
  readonly saveClosingSources = output<void>();
  readonly reloadClosingSources = output<void>();
  readonly selectOpened = output<boolean>();
  readonly createDestinationAccount = output<number>();
  readonly generatePrintAgentToken = output<void>();
  readonly revokePrintAgentToken = output<void>();
  readonly copyPrintAgentToken = output<void>();
  readonly reloadPrintAgentStatus = output<void>();
  readonly downloadInstaller = output<string>();

  osLabel(os: string): string {
    if (os === 'windows') return 'Windows';
    if (os === 'macos') return 'macOS';
    if (os === 'linux') return 'Linux';
    return os;
  }

  sizeLabel(n: number | null | undefined): string | null {
    if (n == null || !Number.isFinite(n) || n < 0) return null;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  get posnets(): FormArray {
    return this.host.form.get('posnets') as FormArray;
  }

  get closingSources(): FormArray {
    return this.host.form.get('closingSources') as FormArray;
  }

  accountIdOf(row: AbstractControl): string | null {
    const v = row.get('accountId')?.value;
    return v == null || v === '' ? null : String(v);
  }

  onDestinationPicked(index: number, value: string | null): void {
    if (value !== CREATE_DESTINATION_ACCOUNT_VALUE) return;
    this.closingSources.at(index)?.patchValue({ accountId: null }, { emitEvent: false });
    this.createDestinationAccount.emit(index);
  }
}
