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
import { closingSourceKindEnablesSettlements } from '../closings/closings-api.service';

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
    <section class="panel-card guy-form-section shop-admin__sources-section">
      <div class="shop-admin__sources-head">
        <div class="shop-admin__sources-head-copy">
          <h2 class="guy-section-title">Cuentas del local</h2>
          <p class="shop-admin__sources-hint">
            Cada cuenta (PVS, Mercado Pago, Pedidos Ya…) tiene destino contable y, si aplica, posnets
            que aparecen en el cierre. Efectivo es fijo. Guardá con
            <strong>Guardar cuentas</strong>.
          </p>
        </div>
        @if (canEdit()) {
          <div class="shop-admin__source-actions">
            <button mat-stroked-button type="button" class="shop-admin__source-add" (click)="addClosingSource.emit()">
              <mat-icon>add</mat-icon>
              Agregar cuenta
            </button>
            <button
              mat-flat-button
              color="primary"
              type="button"
              class="shop-admin__source-save"
              [disabled]="sourceSaving()"
              (click)="saveClosingSources.emit()"
            >
              <mat-icon>save</mat-icon>
              {{ sourceSaving() ? 'Guardando…' : 'Guardar cuentas' }}
            </button>
          </div>
        }
      </div>
      <div class="shop-admin__sources" formArrayName="closingSources">
        @for (row of closingSources.controls; track row; let i = $index) {
          <article class="shop-admin__source-card" [formGroupName]="i">
            <header class="shop-admin__source-card-head">
              <div class="shop-admin__source-card-title">
                <span class="shop-admin__source-card-index" aria-hidden="true">{{ i + 1 }}</span>
                <strong>{{ sourceDisplayName(row, i) }}</strong>
                @if (isCashSource(row)) {
                  <span class="shop-admin__source-badge">Sistema</span>
                }
              </div>
              @if (canEdit() && !isCashSource(row)) {
                <button
                  mat-icon-button
                  type="button"
                  class="shop-admin__posnet-remove shop-admin__source-card-remove"
                  aria-label="Quitar cuenta"
                  (click)="removeClosingSource.emit(i)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              }
            </header>

            <div class="shop-admin__source-card-fields">
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="shop-admin__source-field shop-admin__source-field--name">
                <mat-label>Nombre</mat-label>
                <input matInput formControlName="name" placeholder="ej. Pedidos Ya" [readonly]="isCashSource(row)" />
              </mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic" class="shop-admin__source-field shop-admin__source-field--kind">
                <mat-label>Qué hacer con el monto</mat-label>
                <mat-select
                  formControlName="kind"
                  [disabled]="isCashSource(row)"
                  (selectionChange)="closingSourceKindChange.emit(i)"
                >
                  @for (opt of closingSourceKinds(); track opt.value) {
                    <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              @if (sourceNeedsAccount()(i) || isCashSource(row)) {
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="shop-admin__source-field shop-admin__source-field--account">
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
              }
              @if (sourceEnablesSettlements(row)) {
                <mat-form-field appearance="outline" subscriptSizing="dynamic" class="shop-admin__source-field shop-admin__source-field--lag">
                  <mat-label>Días hasta acreditación</mat-label>
                  <input
                    matInput
                    type="number"
                    min="0"
                    max="90"
                    step="1"
                    formControlName="settlementLagDays"
                    inputmode="numeric"
                  />
                  <mat-hint>0 = mismo día del cierre</mat-hint>
                </mat-form-field>
              }
            </div>

            @if (!isCashSource(row)) {
              <div class="shop-admin__source-posnets" formArrayName="posnets">
                <div class="shop-admin__posnets-head">
                  <p class="text-muted small mb-0">Posnets de esta cuenta (aparecen en el cierre)</p>
                  @if (canEdit()) {
                    <button mat-stroked-button type="button" (click)="addSourcePosnet.emit(i)">
                      <mat-icon>add</mat-icon>
                      Agregar posnet
                    </button>
                  }
                </div>
                @for (p of sourcePosnets(row).controls; track p; let pi = $index) {
                  <div class="shop-admin__posnet-row" [formGroupName]="pi">
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>Nombre del posnet</mat-label>
                      <input matInput formControlName="name" placeholder="ej. Posnet PVS 1" />
                    </mat-form-field>
                    @if (canEdit()) {
                      <button
                        mat-icon-button
                        type="button"
                        class="shop-admin__posnet-remove"
                        aria-label="Quitar posnet"
                        (click)="removeSourcePosnet.emit({ sourceIndex: i, posnetIndex: pi })"
                      >
                        <mat-icon>delete</mat-icon>
                      </button>
                    }
                  </div>
                } @empty {
                  <p class="text-muted small mb-0">
                    Sin posnets: en el cierre cargás montos con líneas libres.
                  </p>
                }
              </div>
            }

            <footer class="shop-admin__source-card-foot">
              <mat-checkbox
                formControlName="includeInDeclared"
                class="shop-admin__source-declared"
                [disabled]="isCashSource(row)"
              >
                Suma al declarado
              </mat-checkbox>
              <span class="shop-admin__source-declared-hint">Si está marcado, entra en el total del cierre</span>
            </footer>
          </article>
        } @empty {
          @if (sourcesLoading()) {
            <p class="text-muted small mb-0">Cargando cuentas…</p>
          } @else if (sourcesLoadFailed()) {
            <div class="shop-admin__sources-empty-error">
              <p class="text-muted small mb-0">No se pudieron cargar las cuentas del local.</p>
              <button mat-stroked-button type="button" (click)="reloadClosingSources.emit()">
                <mat-icon>refresh</mat-icon>
                Reintentar
              </button>
            </div>
          } @else {
            <div class="shop-admin__sources-empty">
              <p class="text-muted small mb-0">
                Todavía no hay cuentas. Se crean al abrir esta pantalla (Efectivo, PVS, Mercado Pago…).
              </p>
              @if (canEdit()) {
                <button mat-stroked-button type="button" (click)="addClosingSource.emit()">
                  <mat-icon>add</mat-icon>
                  Agregar cuenta
                </button>
              }
            </div>
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

  readonly addClosingSource = output<void>();
  readonly removeClosingSource = output<number>();
  readonly addSourcePosnet = output<number>();
  readonly removeSourcePosnet = output<{ sourceIndex: number; posnetIndex: number }>();
  readonly closingSourceKindChange = output<number>();
  readonly saveClosingSources = output<void>();
  readonly reloadClosingSources = output<void>();
  readonly selectOpened = output<boolean>();
  readonly createDestinationAccount = output<number>();

  get closingSources(): FormArray {
    return this.host.form.get('closingSources') as FormArray;
  }

  sourcePosnets(row: AbstractControl): FormArray {
    return row.get('posnets') as FormArray;
  }

  isCashSource(row: AbstractControl): boolean {
    return String(row.get('role')?.value ?? '') === 'CASH';
  }

  accountIdOf(row: AbstractControl): string | null {
    const v = row.get('accountId')?.value;
    return v == null || v === '' ? null : String(v);
  }

  sourceDisplayName(row: AbstractControl, index: number): string {
    const name = String(row.get('name')?.value ?? '').trim();
    return name || `Cuenta ${index + 1}`;
  }

  sourceEnablesSettlements(row: AbstractControl): boolean {
    return closingSourceKindEnablesSettlements(String(row.get('kind')?.value ?? ''));
  }

  onDestinationPicked(index: number, value: string | null): void {
    if (value !== CREATE_DESTINATION_ACCOUNT_VALUE) return;
    this.closingSources.at(index)?.patchValue({ accountId: null }, { emitEvent: false });
    this.createDestinationAccount.emit(index);
  }
}
