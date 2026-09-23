import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { environment } from '../../../environments/environment';

/** URL absoluta que pide Cierres-Comandas → Conexión (…/api/v1). */
export function resolvePrintAgentApiUrl(): string {
  const raw = String(environment.apiUrl || '')
    .trim()
    .replace(/\/+$/, '');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (typeof window === 'undefined' || !window.location?.origin) return raw;
  const origin = window.location.origin.replace(/\/+$/, '');
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return `${origin}${path}`;
}

@Component({
  selector: 'app-admin-shop-comanderas',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <div class="cmd">
      <section class="panel-card cmd__card">
        <header class="cmd__head cmd__head--row">
          <div>
            <h2 class="cmd__title">Cierres-Comandas</h2>
            <p class="cmd__lead">
              Token para <strong>Cierres-Comandas.exe</strong>. Las comanderas y qué platos salen en
              cada una se configuran en el exe (Carta). El token se copia al generarlo; después no se
              puede ver. Si hay dos PCs escuchando con el mismo token, cada comanda sale una sola vez.
              Si una comandera falla y otra ya imprimió, el reintento solo va a las que faltan.
            </p>
          </div>
          <div class="cmd__actions">
            @if (canEdit() && printAgentConfigured()) {
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
          </div>
        </header>

        <div class="cmd__conn">
          <h3 class="cmd__section-title">API y local</h3>
          <p class="cmd__hint">
            Igual que en Cierres-Comandas → Conexión. Copiá y pegá estos dos campos en el exe.
          </p>

          @if (apiEndpointUrl(); as apiUrl) {
            <div class="cmd__token">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="cmd__token-field">
                <mat-label>URL de la API</mat-label>
                <input matInput readonly [value]="apiUrl" />
              </mat-form-field>
              <button mat-stroked-button type="button" (click)="copyPrintAgentApiUrl.emit()">
                <mat-icon>content_copy</mat-icon>
                Copiar
              </button>
            </div>
          }

          @if (printAgentLoading()) {
            <p class="cmd__muted">Cargando…</p>
          } @else if (printAgentConfigured()) {
            <p class="cmd__muted">
              Token activo:
              <code>{{ printAgentTokenPrefix() || 'pa_…' }}</code>
            </p>
            @if (printAgentFreshToken()) {
              <div class="cmd__token">
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="cmd__token-field">
                  <mat-label>Token del local</mat-label>
                  <input matInput readonly [value]="printAgentFreshToken()" />
                </mat-form-field>
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  (click)="copyPrintAgentToken.emit()"
                >
                  <mat-icon>content_copy</mat-icon>
                  Copiar
                </button>
              </div>
              <p class="cmd__hint">
                El token solo se muestra ahora. Si lo cerrás, usá Regenerar token otra vez.
              </p>
            } @else {
              <div class="cmd__token">
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="cmd__token-field">
                  <mat-label>Token del local</mat-label>
                  <input matInput readonly value="••••••••••••••••••••" />
                </mat-form-field>
                <button
                  mat-stroked-button
                  type="button"
                  [disabled]="printAgentBusy()"
                  (click)="generatePrintAgentToken.emit()"
                >
                  <mat-icon>vpn_key</mat-icon>
                  Regenerar token
                </button>
              </div>
              <p class="cmd__muted">
                El token completo solo se muestra al generarlo. Regeneralo para copiarlo y pegarlo en el
                exe.
              </p>
            }
          } @else {
            <div class="cmd__token">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="cmd__token-field">
                <mat-label>Token del local</mat-label>
                <input matInput readonly placeholder="pa_…" value="" />
              </mat-form-field>
              <button
                mat-flat-button
                color="primary"
                type="button"
                [disabled]="printAgentBusy()"
                (click)="generatePrintAgentToken.emit()"
              >
                <mat-icon>vpn_key</mat-icon>
                Generar token
              </button>
            </div>
            <p class="cmd__muted">Todavía no hay token. Generá uno y pegalo en el exe junto con la URL.</p>
          }
        </div>

        <div class="cmd__installer">
          <p class="cmd__muted">Instaladores publicados</p>
          <p class="cmd__hint">
            Requiere Windows 10/11 de 64 bits (Intel/AMD o ARM). Preferí el instalador Setup: detecta
            la arquitectura sola. Si el .exe no abre, volvé a descargarlo desde acá (no uses un archivo
            a medias de Google Drive).
          </p>
          @if (installerLoading()) {
            <p class="cmd__muted">Buscando instaladores…</p>
          } @else if (installerItems().length) {
            <div class="cmd__installer-list">
              @for (item of installerItems(); track item.os) {
                <div class="cmd__installer-row">
                  <p class="cmd__muted">
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
            <p class="cmd__muted">
              Todavía no hay instalador publicado. Pedile a un super admin que lo cargue en Locales.
            </p>
          }
        </div>
      </section>
    </div>
  `,
  styleUrl: './admin-shop-comanderas.scss',
})
export class AdminShopComanderasComponent {
  readonly canEdit = input(true);
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

  readonly generatePrintAgentToken = output<void>();
  readonly revokePrintAgentToken = output<void>();
  readonly copyPrintAgentToken = output<void>();
  readonly copyPrintAgentApiUrl = output<void>();
  readonly downloadInstaller = output<string>();

  readonly apiEndpointUrl = computed(() => resolvePrintAgentApiUrl());

  osLabel(os: string): string {
    if (os === 'windows') return 'Windows';
    if (os === 'macos') return 'macOS';
    if (os === 'linux') return 'Linux';
    return os;
  }

  sizeLabel(size: number): string | null {
    if (!size || size < 1) return null;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
}
