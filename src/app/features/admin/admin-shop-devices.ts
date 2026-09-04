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
      <h2 class="guy-section-title">Posnets</h2>
      <div class="shop-admin__posnets-head">
        <p class="text-muted small mb-0">
          Posnet = terminal en el local (PVS / Mercado Pago) que aparece en el cierre. Si cobrás por
          Pedidos Ya u otra fuente aparte, usá <strong>Cuentas aparte</strong> más abajo, no un
          posnet.
        </p>
        <button mat-stroked-button type="button" (click)="addPosnet.emit()">
          <mat-icon>add</mat-icon>
          Agregar posnet
        </button>
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
            <button
              mat-icon-button
              type="button"
              class="shop-admin__posnet-remove"
              aria-label="Quitar posnet"
              (click)="removePosnet.emit(i)"
            >
              <mat-icon>delete</mat-icon>
            </button>
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
                  @if (canManageAccounts()) {
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
            <button
              mat-icon-button
              type="button"
              class="shop-admin__posnet-remove"
              aria-label="Quitar fuente"
              (click)="removeClosingSource.emit(i)"
            >
              <mat-icon>delete</mat-icon>
            </button>
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
  readonly posnetTypes = input<readonly AdminShopPosnetTypeOption[]>([]);
  readonly closingSourceKinds = input<readonly AdminShopClosingSourceKindOption[]>([]);
  readonly sourceSaving = input(false);
  readonly canManageAccounts = input(false);
  readonly sourcesLoading = input(false);
  readonly sourcesLoadFailed = input(false);
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
