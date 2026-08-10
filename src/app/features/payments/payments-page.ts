import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { ClosingsApiService } from '../closings/closings-api.service';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import {
  PaymentsApiService,
  PaymentStatus,
  ShopPayment,
  paymentMethodLabel as formatPaymentMethod,
} from './payments-api.service';
import { PaymentsInboxService } from './payments-inbox.service';
import { isUserVisible } from '../../shared/user-visibility';
import type { UserVisibility } from '../../shared/user-visibility';
import { PaymentDialogComponent } from './payment-dialog';
import { PaymentPayDialogComponent } from './payment-pay-dialog';
import { PaymentFilePreviewDialogComponent } from './payment-file-preview-dialog';
import { SuppliersApiService, ShopSupplier } from '../suppliers/suppliers-api.service';
import { Employee, EmployeesApiService } from '../employees/employees-api.service';
import { usePageRefresh } from '../../core/page-refresh.service';
import { formatIsoDateDisplay } from '../../core/shop/business-date';
import { RecordSavedDialogComponent } from '../../shared/components/record-saved-dialog';
import {
  paymentDeepLink,
  paymentPaidDialogData,
  paymentSharePayload,
} from '../../shared/components/record-share-builders';
import { copyText, shareText } from '../../shared/utils/share-text';
import { FiltersCollapseBtnComponent } from '../../shared/components/filters-collapse-btn';
import { createFiltersCollapsed } from '../../shared/utils/filters-collapse';
import { SpinnerComponent } from '../../shared/components/spinner';
import { firstValueFrom } from 'rxjs';

type PaymentKind = 'supplier' | 'employee';

const STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING_VALIDATION: 'Pendiente de validar',
  VALIDATED: 'Validado · por pagar',
  REJECTED: 'Rechazado',
  PAID: 'Pagado',
  CANCELLED: 'Cancelado',
};

function dueTime(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(`${String(iso).slice(0, 10)}T12:00:00`);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function compareDueDate(a: string | null | undefined, b: string | null | undefined): number {
  return dueTime(a) - dueTime(b);
}

/** Días hasta el vencimiento (negativo = vencido). null si no hay fecha. */
function daysUntilDue(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const due = Date.parse(`${String(iso).slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(due)) return null;
  const now = new Date();
  const today = Date.parse(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T12:00:00`,
  );
  return Math.round((due - today) / 86_400_000);
}

@Component({
  selector: 'app-payments-page',
  imports: [
    PageHeaderComponent,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatInputModule,
    MatDialogModule,
    MatMenuModule,
    MatSnackBarModule,
    MatTooltipModule,
    FiltersCollapseBtnComponent,
    SpinnerComponent,
  ],
  template: `
    <app-page-header
      [title]="pageTitle()"
      [subtitle]="pageSubtitle()"
      [actionLabel]="canManage() ? 'Nuevo pago' : ''"
      actionIcon="add"
      [actionLarge]="true"
      (action)="openCreate()"
    />

    <div
      class="panel-card guy-filters mb-3"
      [class.guy-filters--collapsed]="filtersCollapsed()"
    >
      <div class="guy-filters__head">
        <div>
          <h2 class="guy-filters__title">Filtros</h2>
          <p class="guy-filters__subtitle">
            @if (activeFilterCount() > 0) {
              {{ activeFilterCount() }} filtro{{ activeFilterCount() === 1 ? '' : 's' }} activo{{
                activeFilterCount() === 1 ? '' : 's'
              }}
            } @else {
              Sin filtros
            }
          </p>
        </div>
        <div class="guy-filters__tools">
          <button
            mat-stroked-button
            type="button"
            class="pay-export-btn"
            [disabled]="!shopId() || exporting()"
            (click)="exportExcel()"
          >
            <mat-icon>download</mat-icon>
            <span class="pay-export-btn__full">{{
              exporting() ? 'Descargando…' : 'Descargar Excel'
            }}</span>
            <span class="pay-export-btn__short">{{ exporting() ? '…' : 'Excel' }}</span>
          </button>
          <app-filters-collapse-btn
            [collapsed]="filtersCollapsed()"
            [badgeCount]="activeFilterCount()"
            (toggle)="toggleFilters()"
          />
        </div>
      </div>
      <div class="guy-filters__body pay-filters">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Estado</mat-label>
          <mat-select [formControl]="statusFilter" multiple>
            @for (opt of statusOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Valida</mat-label>
          <mat-select [formControl]="validatorFilter" multiple>
            @if (currentUserId()) {
              <mat-option [value]="currentUserId()">Yo</mat-option>
            }
            @for (u of filterUsers(); track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Paga</mat-label>
          <mat-select [formControl]="payerFilter" multiple>
            @if (currentUserId()) {
              <mat-option [value]="currentUserId()">Yo</mat-option>
            }
            @for (u of filterUsers(); track u.id) {
              <mat-option [value]="u.id">{{ u.fullName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field
          appearance="outline"
          class="pay-filters__range"
          subscriptSizing="dynamic"
        >
          <mat-label>Vencimiento</mat-label>
          <mat-date-range-input [formGroup]="dueRange" [rangePicker]="duePicker">
            <input matStartDate formControlName="start" placeholder="Desde" />
            <input matEndDate formControlName="end" placeholder="Hasta" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="duePicker" />
          <mat-date-range-picker #duePicker />
        </mat-form-field>
        <mat-form-field
          appearance="outline"
          class="pay-filters__range"
          subscriptSizing="dynamic"
        >
          <mat-label>Realizado</mat-label>
          <mat-date-range-input [formGroup]="paidRange" [rangePicker]="paidPicker">
            <input matStartDate formControlName="start" placeholder="Desde" />
            <input matEndDate formControlName="end" placeholder="Hasta" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="paidPicker" />
          <mat-date-range-picker #paidPicker />
        </mat-form-field>
        @if (isSupplierKind()) {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Proveedor</mat-label>
            <mat-select [formControl]="supplierFilter" multiple>
              @for (s of suppliers(); track s.id) {
                <mat-option [value]="s.id">{{ s.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        } @else {
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>Empleado</mat-label>
            <mat-select [formControl]="employeeFilter" multiple>
              @for (e of employees(); track e.id) {
                <mat-option [value]="e.id">{{ e.fullName }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Monto desde</mat-label>
          <input
            matInput
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            [formControl]="amountMinFilter"
            placeholder="0"
          />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Monto hasta</mat-label>
          <input
            matInput
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            [formControl]="amountMaxFilter"
            placeholder="Sin tope"
          />
        </mat-form-field>
        @if (currentUserId()) {
          <button
            mat-stroked-button
            type="button"
            class="pay-filters__mine"
            [class.pay-filters__mine--on]="mineOnly()"
            (click)="filterMine()"
          >
            <mat-icon>person</mat-icon>
            {{ mineOnly() ? 'Viendo solo míos' : 'Solo míos' }}
          </button>
        }
      </div>
    </div>

    <div class="pay-list">
      @if (loading()) {
        <div class="panel-card guy-empty guy-empty--loading" role="status" aria-live="polite" aria-busy="true">
          <app-spinner [size]="28" tone="accent" />
          <div>
            <strong>Cargando…</strong>
            <div class="small">Obteniendo pagos</div>
          </div>
        </div>
      } @else {
        @for (p of visibleRows(); track p.id) {
          <article
            class="panel-card pay-card"
            [attr.id]="'payment-' + p.id"
            [attr.data-status]="p.status"
            [attr.data-due]="dueUrgency(p)"
            [class.pay-card--focus]="focusedPaymentId() === p.id"
          >
            <div class="pay-card__top">
              <div>
                <h3 class="pay-card__title">{{ p.title || 'Sin concepto' }}</h3>
                <p class="pay-card__meta" [class.pay-card__due--overdue]="dueUrgency(p) === 'overdue'" [class.pay-card__due--soon]="dueUrgency(p) === 'soon'">
                  @if (p.dueDate) {
                    @if (dueUrgency(p) === 'overdue') {
                      <mat-icon class="pay-card__due-icon">warning</mat-icon>
                      Vencido {{ formatDate(p.dueDate) }}
                    } @else if (dueUrgency(p) === 'soon') {
                      <mat-icon class="pay-card__due-icon">schedule</mat-icon>
                      Vence {{ formatDate(p.dueDate) }}
                    } @else {
                      Vence {{ formatDate(p.dueDate) }}
                    }
                  } @else {
                    Sin fecha
                  }
                  @if (p.paidAt) {
                    · Pagado {{ formatDate(p.paidAt) }}
                  }
                </p>
              </div>
              <div class="pay-card__amount">$ {{ (p.amount || 0).toLocaleString('es-AR') }}</div>
            </div>

            <div class="pay-card__grid">
              <div>
                <span class="pay-card__label">Estado</span>
                <strong class="pay-card__status">{{ statusLabel(p.status) }}</strong>
              </div>
              @if (isSupplierKind()) {
                <div>
                  <span class="pay-card__label">Proveedor</span>
                  <strong>{{ p.supplierName || '—' }}</strong>
                </div>
              } @else {
                <div>
                  <span class="pay-card__label">Empleado</span>
                  <strong>{{ p.employeeName || '—' }}</strong>
                </div>
              }
              <div>
                <span class="pay-card__label">Paga</span>
              <strong>{{ p.payerName || '—' }}</strong>
            </div>
            <div>
              <span class="pay-card__label">Valida</span>
              <strong>{{ p.validatorName || '—' }}</strong>
            </div>
            <div>
              <span class="pay-card__label">Creado por</span>
              <strong>{{ p.createdByName || '—' }}</strong>
            </div>
            <div>
              <span class="pay-card__label">Cuenta que paga</span>
              <strong>{{ p.accountName || '—' }}</strong>
            </div>
            <div>
              <span class="pay-card__label">Forma de pago</span>
              <strong>{{ paymentMethodLabel(p.paymentMethod) }}</strong>
            </div>
          </div>

          @if (p.status === 'PENDING_VALIDATION' || p.status === 'VALIDATED') {
            <div class="pay-card__pay-data">
              @if (isSupplierKind()) {
                <div class="pay-card__pay-row">
                  <div>
                    <span class="pay-card__label">Alias / CBU</span>
                    <code class="pay-card__code">{{ p.supplierBankAlias || '—' }}</code>
                  </div>
                  @if (p.status === 'VALIDATED' && p.supplierBankAlias) {
                    <button
                      mat-icon-button
                      type="button"
                      matTooltip="Copiar alias"
                      aria-label="Copiar alias"
                      (click)="copyAlias(p)"
                    >
                      <mat-icon>content_copy</mat-icon>
                    </button>
                  }
                </div>
              }
              <div class="pay-card__pay-row">
                <div>
                  <span class="pay-card__label">Monto</span>
                  <strong class="pay-card__code">$ {{ formatAmount(p.amount) }}</strong>
                </div>
                @if (p.status === 'VALIDATED') {
                  <button
                    mat-icon-button
                    type="button"
                    matTooltip="Copiar monto"
                    aria-label="Copiar monto"
                    (click)="copyAmount(p)"
                  >
                    <mat-icon>content_copy</mat-icon>
                  </button>
                }
              </div>
            </div>
          }

          @if (p.notes) {
            <p class="pay-card__notes">{{ p.notes }}</p>
          }

          @if (isSupplierKind() && hasInvoiceData(p)) {
            <details class="pay-card__invoice">
              <summary>
                <mat-icon>receipt_long</mat-icon>
                Datos de facturación
                @if (p.invoiceNumber) {
                  <span class="pay-card__invoice-num"
                    >{{ p.invoiceType || '' }} {{ p.invoiceNumber }}</span
                  >
                }
              </summary>
              <div class="pay-card__invoice-grid">
                @if (p.invoiceLegalName) {
                  <div>
                    <span class="pay-card__label">Razón social</span>
                    <strong>{{ p.invoiceLegalName }}</strong>
                  </div>
                }
                @if (p.invoiceTaxId) {
                  <div>
                    <span class="pay-card__label">CUIT</span>
                    <strong>{{ p.invoiceTaxId }}</strong>
                  </div>
                }
                @if (p.invoiceType) {
                  <div>
                    <span class="pay-card__label">Tipo</span>
                    <strong>{{ p.invoiceType }}</strong>
                  </div>
                }
                @if (p.invoiceNumber) {
                  <div>
                    <span class="pay-card__label">Nº factura</span>
                    <strong>{{ p.invoiceNumber }}</strong>
                  </div>
                }
                @if (p.invoiceNetAmount != null) {
                  <div>
                    <span class="pay-card__label">Monto neto</span>
                    <strong>$ {{ formatAmount(p.invoiceNetAmount) }}</strong>
                  </div>
                }
                @if (p.invoiceIvaAmount != null) {
                  <div>
                    <span class="pay-card__label">IVA</span>
                    <strong>$ {{ formatAmount(p.invoiceIvaAmount) }}</strong>
                  </div>
                }
                @if (p.invoicePerceptionsAmount != null) {
                  <div>
                    <span class="pay-card__label">Percepciones</span>
                    <strong>$ {{ formatAmount(p.invoicePerceptionsAmount) }}</strong>
                  </div>
                }
                @if (p.invoiceOtherTaxesAmount != null) {
                  <div>
                    <span class="pay-card__label">Otros impuestos</span>
                    <strong>$ {{ formatAmount(p.invoiceOtherTaxesAmount) }}</strong>
                  </div>
                }
              </div>
              @if (p.hasInvoiceFile) {
                <button mat-stroked-button type="button" (click)="viewInvoice(p)">
                  <mat-icon>visibility</mat-icon>
                  Ver factura
                </button>
              }
            </details>
          }

          <div class="pay-card__actions">
            @if (canValidate(p)) {
              <button mat-flat-button color="primary" type="button" (click)="validate(p)">
                <mat-icon>verified</mat-icon>
                Validar
              </button>
            }
            @if (canPay(p)) {
              <button mat-flat-button color="primary" type="button" (click)="pay(p)">
                <mat-icon>paid</mat-icon>
                Marcar pagado
              </button>
            }

            @if (hasMoreActions(p)) {
              <button
                mat-stroked-button
                type="button"
                [matMenuTriggerFor]="payMoreMenu"
                aria-label="Más acciones"
              >
                Más
                <mat-icon iconPositionEnd>expand_more</mat-icon>
              </button>
              <mat-menu #payMoreMenu="matMenu" class="pay-card__more-menu">
                @if (canValidate(p)) {
                  <button mat-menu-item type="button" (click)="reject(p)">
                    <mat-icon>block</mat-icon>
                    <span>Rechazar</span>
                  </button>
                }
                @if (canManage() && p.status === 'VALIDATED') {
                  <button mat-menu-item type="button" (click)="revertStatus(p)">
                    <mat-icon>undo</mat-icon>
                    <span>Volver a validar</span>
                  </button>
                }
                @if (canManage() && p.status === 'PAID') {
                  <button mat-menu-item type="button" (click)="revertStatus(p)">
                    <mat-icon>undo</mat-icon>
                    <span>Marcar no pagado</span>
                  </button>
                }
                @if (p.status === 'PAID') {
                  <button mat-menu-item type="button" (click)="startReceiptPick(p)">
                    <mat-icon>attach_file</mat-icon>
                    <span>{{ p.hasReceiptFile ? 'Cambiar comprobante' : 'Adjuntar comprobante' }}</span>
                  </button>
                  @if (p.hasReceiptFile) {
                    <button mat-menu-item type="button" (click)="viewReceipt(p)">
                      <mat-icon>visibility</mat-icon>
                      <span>Ver comprobante</span>
                    </button>
                  }
                }
                <button mat-menu-item type="button" (click)="sharePayment(p)">
                  <mat-icon>share</mat-icon>
                  <span>Compartir</span>
                </button>
                @if (canResendNotification(p)) {
                  <button mat-menu-item type="button" (click)="resendNotification(p)">
                    <mat-icon>notifications_active</mat-icon>
                    <span>Reenviar aviso</span>
                  </button>
                }
                @if (canManage()) {
                  <button mat-menu-item type="button" (click)="openDuplicate(p)">
                    <mat-icon>content_copy</mat-icon>
                    <span>Duplicar</span>
                  </button>
                }
                @if (
                  canManage() &&
                  (p.status === 'PENDING_VALIDATION' ||
                    p.status === 'VALIDATED' ||
                    p.status === 'PAID')
                ) {
                  <button mat-menu-item type="button" (click)="openEdit(p)">
                    <mat-icon>edit</mat-icon>
                    <span>Editar</span>
                  </button>
                }
                @if (canManage() && (p.status === 'PENDING_VALIDATION' || p.status === 'VALIDATED')) {
                  <button mat-menu-item type="button" (click)="cancel(p)">
                    <mat-icon>cancel</mat-icon>
                    <span>Cancelar</span>
                  </button>
                }
                @if (canManage() && p.status !== 'PAID') {
                  <button mat-menu-item type="button" class="pay-card__danger" (click)="remove(p)">
                    <mat-icon>delete</mat-icon>
                    <span>Eliminar</span>
                  </button>
                }
              </mat-menu>
            }
          </div>
        </article>
      } @empty {
        <div class="panel-card guy-empty">
          <mat-icon>{{ isSupplierKind() ? 'local_shipping' : 'badge' }}</mat-icon>
          <div>
            <strong>{{ emptyTitle() }}</strong>
            <div class="small">{{ emptyHint() }}</div>
          </div>
        </div>
      }
      }
    </div>

    <input
      #receiptPicker
      type="file"
      accept="application/pdf,image/*"
      hidden
      (change)="onSharedReceiptPicked($event)"
    />
  `,
  styles: [
    `
      .pay-filters {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.65rem 0.85rem;
        align-items: start;
      }
      .pay-export-btn__short {
        display: none;
      }
      @media (max-width: 560px) {
        .pay-export-btn__full {
          display: none;
        }
        .pay-export-btn__short {
          display: inline;
        }
      }
      @media (min-width: 720px) {
        .pay-filters {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .pay-filters__range {
          grid-column: span 1;
        }
        .pay-filters__mine {
          grid-column: 1 / -1;
          justify-self: start;
          align-self: center;
        }
      }
      .pay-filters__mine {
        height: 40px;
        border-radius: 999px;
      }
      .pay-filters__mine--on {
        border-color: var(--guy-green, #2e7d32);
        color: var(--guy-green, #2e7d32);
      }
      .pay-list {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }
      .pay-card--focus {
        outline: 2px solid color-mix(in srgb, var(--guy-primary, #003366) 55%, transparent);
        box-shadow:
          0 0 0 4px color-mix(in srgb, var(--guy-primary, #003366) 12%, transparent),
          var(--guy-shadow, 0 1px 3px rgba(0, 0, 0, 0.08));
        scroll-margin-top: 5.5rem;
      }
      .pay-card__top {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: flex-start;
        margin-bottom: 0.85rem;
      }
      .pay-card__title {
        margin: 0 0 0.2rem;
        font-size: 1.05rem;
        color: var(--guy-navy, #003366);
      }
      .pay-card__meta {
        margin: 0;
        font-size: 0.85rem;
        color: var(--guy-muted, #5f6f76);
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.2rem 0.35rem;
      }
      .pay-card__due-icon {
        width: 16px;
        height: 16px;
        font-size: 16px;
      }
      .pay-card__due--overdue {
        color: #c62828;
        font-weight: 700;
      }
      .pay-card__due--soon {
        color: #e65100;
        font-weight: 700;
      }
      .pay-card[data-due='overdue'] {
        border-color: color-mix(in srgb, #c62828 55%, var(--guy-border, #d7e0d9));
        background: color-mix(in srgb, #c62828 6%, var(--guy-surface, #fff));
      }
      .pay-card[data-due='soon'] {
        border-color: color-mix(in srgb, #e65100 50%, var(--guy-border, #d7e0d9));
        background: color-mix(in srgb, #e65100 6%, var(--guy-surface, #fff));
      }
      .pay-card__amount {
        font-size: 1.2rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--guy-navy, #003366);
        white-space: nowrap;
      }
      .pay-card__grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.65rem 1rem;
        margin-bottom: 0.75rem;
      }
      @media (min-width: 720px) {
        .pay-card__grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }
      .pay-card__label {
        display: block;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--guy-muted, #5f6f76);
        margin-bottom: 0.15rem;
      }
      .pay-card__status {
        color: var(--guy-green, #2e7d32);
      }
      .pay-card[data-status='REJECTED'] .pay-card__status,
      .pay-card[data-status='CANCELLED'] .pay-card__status {
        color: #c62828;
      }
      .pay-card[data-status='PAID'] .pay-card__status {
        color: #1565c0;
      }
      .pay-card__notes {
        margin: 0 0 0.75rem;
        font-size: 0.88rem;
        color: var(--guy-muted, #5f6f76);
      }
      .pay-card__invoice {
        margin: 0 0 0.85rem;
        padding: 0.55rem 0.75rem;
        border-radius: 10px;
        background: color-mix(in srgb, var(--guy-green, #2e7d32) 6%, white);
        border: 1px solid color-mix(in srgb, var(--guy-green, #2e7d32) 18%, var(--guy-border, #d7e0d9));
      }
      .pay-card__invoice summary {
        cursor: pointer;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.35rem;
        font-weight: 600;
        color: var(--guy-navy, #003366);
        list-style: none;
      }
      .pay-card__invoice summary::-webkit-details-marker {
        display: none;
      }
      .pay-card__invoice summary mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
      .pay-card__invoice-num {
        font-weight: 500;
        color: var(--guy-muted, #5f6f76);
        font-variant-numeric: tabular-nums;
      }
      .pay-card__invoice-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.55rem 0.85rem;
        margin: 0.65rem 0;
      }
      .pay-card__pay-data {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        margin: 0 0 0.85rem;
        padding: 0.65rem 0.75rem;
        border-radius: 10px;
        background: color-mix(in srgb, var(--guy-navy, #003366) 5%, white);
      }
      .pay-card__pay-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      .pay-card__code {
        display: block;
        margin-top: 0.1rem;
        font-size: 0.95rem;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        word-break: break-all;
        color: var(--guy-navy, #003366);
      }
      .pay-card__actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.45rem;
      }
      .pay-card__danger {
        color: #c62828;
      }
      :host ::ng-deep .pay-card__more-menu .pay-card__danger {
        color: #c62828;
      }
    `,
  ],
})
export class PaymentsPage {
  private readonly filtersUi = createFiltersCollapsed('payments');
  readonly filtersCollapsed = this.filtersUi.collapsed;
  readonly toggleFilters = this.filtersUi.toggleFilters;

  private readonly api = inject(PaymentsApiService);
  private readonly suppliersApi = inject(SuppliersApiService);
  private readonly employeesApi = inject(EmployeesApiService);
  private readonly closingsApi = inject(ClosingsApiService);
  private readonly paymentsInbox = inject(PaymentsInboxService);
  private readonly http = inject(HttpClient);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  readonly shops = inject(ShopContextService);

  /** Pago resaltado al abrir un enlace directo (?payment=…). */
  readonly focusedPaymentId = signal<string | null>(null);
  private deepLinkHandled = false;
  private focusClearTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly routeData = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });

  readonly kind = computed<PaymentKind>(() =>
    this.routeData()['paymentKind'] === 'employee' ? 'employee' : 'supplier',
  );
  readonly isSupplierKind = computed(() => this.kind() === 'supplier');

  readonly pageTitle = computed(() =>
    this.isSupplierKind() ? 'Pagos a proveedores' : 'Pagos a empleados',
  );
  readonly pageSubtitle = computed(() => {
    const shop = this.shops.selectedShop()?.name ?? 'Sin local';
    return this.isSupplierKind()
      ? `${shop} · con proveedor asignado`
      : `${shop} · internos (sueldos, reintegros, etc.)`;
  });
  readonly emptyTitle = computed(() =>
    this.isSupplierKind() ? 'Sin pagos a proveedores' : 'Sin pagos a empleados',
  );
  readonly emptyHint = computed(() =>
    this.isSupplierKind()
      ? 'Creá un pago y asignale un proveedor.'
      : 'Creá un pago sin proveedor para esta sección.',
  );

  readonly rows = signal<ShopPayment[]>([]);
  readonly loading = signal(true);
  readonly users = signal<
    Array<{
      id: string;
      fullName: string;
      visibility?: Partial<UserVisibility> | null;
      hideFromCashWithdraw?: boolean;
    }>
  >([]);
  readonly accounts = signal<Array<{ id: string; name: string }>>([]);
  readonly suppliers = signal<ShopSupplier[]>([]);
  readonly employees = signal<Employee[]>([]);
  readonly statusFilter = new FormControl<PaymentStatus[]>(
    ['PENDING_VALIDATION', 'VALIDATED'],
    { nonNullable: true },
  );
  readonly validatorFilter = new FormControl<string[]>([], { nonNullable: true });
  readonly payerFilter = new FormControl<string[]>([], { nonNullable: true });
  readonly dueRange = this.fb.group({
    start: this.fb.control<Date | null>(null),
    end: this.fb.control<Date | null>(null),
  });
  readonly paidRange = this.fb.group({
    start: this.fb.control<Date | null>(null),
    end: this.fb.control<Date | null>(null),
  });
  readonly supplierFilter = new FormControl<string[]>([], { nonNullable: true });
  readonly employeeFilter = new FormControl<string[]>([], { nonNullable: true });
  readonly amountMinFilter = new FormControl<number | null>(null);
  readonly amountMaxFilter = new FormControl<number | null>(null);
  readonly mineOnly = signal(false);
  readonly exporting = signal(false);

  readonly statusOptions = (
    Object.entries(STATUS_LABEL) as Array<[PaymentStatus, string]>
  ).map(([value, label]) => ({ value, label }));

  private readonly statusFilterValue = toSignal(this.statusFilter.valueChanges, {
    initialValue: this.statusFilter.value,
  });
  private readonly validatorFilterValue = toSignal(this.validatorFilter.valueChanges, {
    initialValue: this.validatorFilter.value,
  });
  private readonly payerFilterValue = toSignal(this.payerFilter.valueChanges, {
    initialValue: this.payerFilter.value,
  });
  private readonly dueRangeValue = toSignal(this.dueRange.valueChanges, {
    initialValue: this.dueRange.getRawValue(),
  });
  private readonly paidRangeValue = toSignal(this.paidRange.valueChanges, {
    initialValue: this.paidRange.getRawValue(),
  });
  private readonly supplierFilterValue = toSignal(this.supplierFilter.valueChanges, {
    initialValue: this.supplierFilter.value,
  });
  private readonly employeeFilterValue = toSignal(this.employeeFilter.valueChanges, {
    initialValue: this.employeeFilter.value,
  });
  private readonly amountMinFilterValue = toSignal(this.amountMinFilter.valueChanges, {
    initialValue: this.amountMinFilter.value,
  });
  private readonly amountMaxFilterValue = toSignal(this.amountMaxFilter.valueChanges, {
    initialValue: this.amountMaxFilter.value,
  });

  readonly currentUserId = computed(() => this.auth.currentUser()?.id ?? '');

  /** Usuarios del local sin duplicar la opción "Yo". */
  readonly filterUsers = computed(() => {
    const me = this.currentUserId();
    return this.users().filter(
      (u) => u.id !== me && isUserVisible(u, 'payments'),
    );
  });

  readonly activeFilterCount = computed(() => {
    let n = this.statusFilterValue()?.length ?? 0;
    if (this.mineOnly()) n += 1;
    else {
      n += this.validatorFilterValue()?.length ?? 0;
      n += this.payerFilterValue()?.length ?? 0;
    }
    const due = this.dueRangeValue();
    if (due?.start || due?.end) n += 1;
    const paid = this.paidRangeValue();
    if (paid?.start || paid?.end) n += 1;
    if (this.isSupplierKind()) n += this.supplierFilterValue()?.length ?? 0;
    else n += this.employeeFilterValue()?.length ?? 0;
    const min = this.amountMinFilterValue();
    const max = this.amountMaxFilterValue();
    if (min != null && min !== ('' as any) && Number.isFinite(Number(min))) n += 1;
    if (max != null && max !== ('' as any) && Number.isFinite(Number(max))) n += 1;
    return n;
  });

  readonly shopId = computed(() => this.shops.selectedShopId());

  readonly visibleRows = computed(() => {
    const list = this.rows().filter((p) =>
      this.isSupplierKind() ? !!p.supplierId : !p.supplierId,
    );
    return [...list].sort((a, b) => compareDueDate(a.dueDate, b.dueDate));
  });

  canManage(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'payments.manage');
  }

  /** Reenviar aviso: validar (pendiente) o abonar (validado), con destinatario asignado. */
  canResendNotification(p: ShopPayment): boolean {
    if (!this.canManage()) return false;
    if (p.status === 'PENDING_VALIDATION') return !!p.validatorUserId;
    if (p.status === 'VALIDATED') return !!p.payerUserId;
    return false;
  }

  canManageSuppliers(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'suppliers.manage');
  }

  statusLabel(status: PaymentStatus): string {
    return STATUS_LABEL[status] ?? status;
  }

  paymentMethodLabel(method: ShopPayment['paymentMethod']): string {
    return formatPaymentMethod(method);
  }

  /** overdue | soon (≤3 días) | ok | none — solo para pagos abiertos. */
  dueUrgency(p: ShopPayment): 'overdue' | 'soon' | 'ok' | 'none' {
    if (!p.dueDate) return 'none';
    if (p.status !== 'PENDING_VALIDATION' && p.status !== 'VALIDATED') return 'none';
    const days = daysUntilDue(p.dueDate);
    if (days == null) return 'none';
    if (days < 0) return 'overdue';
    if (days <= 3) return 'soon';
    return 'ok';
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return formatIsoDateDisplay(iso);
  }

  formatAmount(amount: number | null | undefined): string {
    return Number(amount || 0).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  hasInvoiceData(p: ShopPayment): boolean {
    return !!(
      p.hasInvoiceFile ||
      p.invoiceLegalName ||
      p.invoiceTaxId ||
      p.invoiceType ||
      p.invoiceNumber ||
      p.invoiceNetAmount != null ||
      p.invoiceIvaAmount != null ||
      p.invoicePerceptionsAmount != null ||
      p.invoiceOtherTaxesAmount != null
    );
  }

  private triggerDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  private openFilePreview(title: string, fileName: string, blob: Blob): void {
    this.dialogTitle.track(
      this.dialog.open(PaymentFilePreviewDialogComponent, {
        width: '920px',
        maxWidth: '96vw',
        maxHeight: '92vh',
        panelClass: 'guy-dialog',
        data: { title, fileName, blob },
      }),
      title,
    );
  }

  viewInvoice(p: ShopPayment): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.downloadInvoiceFile(shopId, p.id).subscribe({
      next: (blob) =>
        this.openFilePreview('Factura', p.invoiceFileName || 'factura.pdf', blob),
      error: (err) => this.showErr(err),
    });
  }

  viewReceipt(p: ShopPayment): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.downloadReceiptFile(shopId, p.id).subscribe({
      next: (blob) =>
        this.openFilePreview(
          'Comprobante de pago',
          p.receiptFileName || 'comprobante.pdf',
          blob,
        ),
      error: (err) => this.showErr(err),
    });
  }

  downloadInvoice(p: ShopPayment): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.downloadInvoiceFile(shopId, p.id).subscribe({
      next: (blob) => this.triggerDownload(blob, p.invoiceFileName || 'factura.pdf'),
      error: (err) => this.showErr(err),
    });
  }

  downloadReceipt(p: ShopPayment): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.downloadReceiptFile(shopId, p.id).subscribe({
      next: (blob) => this.triggerDownload(blob, p.receiptFileName || 'comprobante.pdf'),
      error: (err) => this.showErr(err),
    });
  }

  onReceiptPicked(ev: Event, p: ShopPayment): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.uploadReceiptFile(shopId, p.id, file).subscribe({
      next: () => {
        this.snack.open('Comprobante de pago guardado', 'OK', { duration: 2500 });
        this.reload();
      },
      error: (err) => this.showErr(err),
    });
  }

  async copyAlias(p: ShopPayment): Promise<void> {
    const text = (p.supplierBankAlias ?? '').trim();
    if (!text) return;
    const ok = await copyText(text);
    this.snack.open(ok ? 'Alias / CBU copiado' : 'No se pudo copiar', 'OK', {
      duration: ok ? 2000 : 2500,
    });
  }

  async copyAmount(p: ShopPayment): Promise<void> {
    const text = this.formatAmount(p.amount);
    const ok = await copyText(text);
    this.snack.open(ok ? 'Monto copiado' : 'No se pudo copiar', 'OK', {
      duration: ok ? 2000 : 2500,
    });
  }

  canValidate(p: ShopPayment): boolean {
    if (p.status !== 'PENDING_VALIDATION') return false;
    const uid = this.auth.currentUser()?.id;
    return this.canManage() || !p.validatorUserId || uid === p.validatorUserId;
  }

  canPay(p: ShopPayment): boolean {
    if (p.status !== 'VALIDATED') return false;
    const uid = this.auth.currentUser()?.id;
    return this.canManage() || !p.payerUserId || uid === p.payerUserId;
  }

  hasMoreActions(_p: ShopPayment): boolean {
    // Siempre hay al menos "Compartir".
    return true;
  }

  private readonly receiptPicker = viewChild<ElementRef<HTMLInputElement>>('receiptPicker');
  private pendingReceiptPayment: ShopPayment | null = null;

  startReceiptPick(p: ShopPayment): void {
    this.pendingReceiptPayment = p;
    const input = this.receiptPicker()?.nativeElement;
    if (!input) return;
    input.value = '';
    input.click();
  }

  onSharedReceiptPicked(ev: Event): void {
    const p = this.pendingReceiptPayment;
    this.pendingReceiptPayment = null;
    if (!p) return;
    this.onReceiptPicked(ev, p);
  }

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const shopId = this.shopId();
      if (!shopId) {
        this.rows.set([]);
        this.loading.set(false);
        return;
      }
      this.reloadMeta(shopId);
      this.reload();
    });
    this.statusFilter.valueChanges.subscribe(() => this.reload());
    this.validatorFilter.valueChanges.subscribe(() => {
      if (this.validatorFilter.value.length) this.mineOnly.set(false);
      this.reload();
    });
    this.payerFilter.valueChanges.subscribe(() => {
      if (this.payerFilter.value.length) this.mineOnly.set(false);
      this.reload();
    });
    this.dueRange.valueChanges.subscribe(() => this.reload());
    this.paidRange.valueChanges.subscribe(() => this.reload());
    this.supplierFilter.valueChanges.subscribe(() => this.reload());
    this.employeeFilter.valueChanges.subscribe(() => this.reload());
    this.amountMinFilter.valueChanges.subscribe(() => this.reload());
    this.amountMaxFilter.valueChanges.subscribe(() => this.reload());

    // Enlace profundo: /payments/...?payment=id&shop=shopId
    const qp = this.route.snapshot.queryParamMap;
    const paymentId = (qp.get('payment') || '').trim();
    const shopFromLink = (qp.get('shop') || '').trim();
    if (paymentId) {
      this.focusedPaymentId.set(paymentId);
      if (shopFromLink && shopFromLink !== this.shopId()) {
        this.shops.selectShop(shopFromLink);
      }
    }
  }

  private toIsoDate(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10) || null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private amountOrUndefined(v: number | null | undefined): number | undefined {
    if (v === null || v === undefined || (v as any) === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }

  filterMine(): void {
    if (!this.currentUserId()) return;
    if (this.mineOnly()) {
      this.mineOnly.set(false);
      this.reload();
      return;
    }
    this.mineOnly.set(true);
    this.validatorFilter.setValue([], { emitEvent: false });
    this.payerFilter.setValue([], { emitEvent: false });
    this.reload();
  }

  private listFilterOpts() {
    const statuses = this.statusFilter.value;
    const dates = {
      dueFrom: this.toIsoDate(this.dueRange.controls.start.value) || undefined,
      dueTo: this.toIsoDate(this.dueRange.controls.end.value) || undefined,
      paidFrom: this.toIsoDate(this.paidRange.controls.start.value) || undefined,
      paidTo: this.toIsoDate(this.paidRange.controls.end.value) || undefined,
    };
    const amounts = {
      amountMin: this.amountOrUndefined(this.amountMinFilter.value),
      amountMax: this.amountOrUndefined(this.amountMaxFilter.value),
    };
    const party = this.isSupplierKind()
      ? {
          supplierId: this.supplierFilter.value.length
            ? this.supplierFilter.value
            : undefined,
        }
      : {
          employeeId: this.employeeFilter.value.length
            ? this.employeeFilter.value
            : undefined,
        };
    if (this.mineOnly()) {
      return {
        status: statuses.length ? statuses : undefined,
        mine: true as const,
        ...dates,
        ...amounts,
        ...party,
      };
    }
    const validators = this.validatorFilter.value;
    const payers = this.payerFilter.value;
    return {
      status: statuses.length ? statuses : undefined,
      validatorUserId: validators.length ? validators : undefined,
      payerUserId: payers.length ? payers : undefined,
      ...dates,
      ...amounts,
      ...party,
    };
  }

  reloadMeta(shopId: string): void {
    this.closingsApi.shopUsers(shopId).subscribe({
      next: (rows) =>
        this.users.set(
          rows.map((u) => ({
            id: u.id,
            fullName: u.fullName,
            visibility: u.visibility,
            hideFromCashWithdraw: u.hideFromCashWithdraw,
          })),
        ),
      error: () => this.users.set([]),
    });
    this.http
      .get<Array<{ id: string; name: string; type?: string; active?: boolean }>>(
        `${environment.apiUrl}/shops/${shopId}/accounts`,
      )
      .subscribe({
        next: (rows) =>
          this.accounts.set(
            rows
              .filter(
                (a) =>
                  a.active !== false &&
                  a.type !== 'SUPPLIER' &&
                  a.type !== 'SYSTEM',
              )
              .map((a) => ({ id: a.id, name: a.name })),
          ),
        error: () => this.accounts.set([]),
      });
    this.suppliersApi.list(shopId).subscribe({
      next: (rows) => this.suppliers.set(rows),
      error: () => this.suppliers.set([]),
    });
    this.employeesApi.list(shopId).subscribe({
      next: (rows) => this.employees.set(rows),
      error: () => this.employees.set([]),
    });
  }

  reload(): void {
    const shopId = this.shopId();
    if (!shopId) {
      this.loading.set(false);
      return;
    }
    const opts = this.listFilterOpts();
    this.loading.set(true);
    this.api.list(shopId, opts).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        this.paymentsInbox.refresh();
        void this.afterListLoaded();
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar los pagos', 'OK', { duration: 3000 });
      },
    });
  }

  private async afterListLoaded(): Promise<void> {
    const focusId = this.focusedPaymentId();
    if (!focusId || this.deepLinkHandled) {
      if (focusId) this.scrollToFocusedPayment();
      return;
    }
    await this.ensureFocusedPaymentVisible();
  }

  /** Si el pago del enlace no está en la lista (filtros), abre filtros y lo busca. */
  private ensureFocusedPaymentVisible(): void {
    const focusId = this.focusedPaymentId();
    const shopId = this.shopId();
    if (!focusId || !shopId || this.deepLinkHandled) return;

    if (this.visibleRows().some((p) => p.id === focusId)) {
      this.deepLinkHandled = true;
      this.scrollToFocusedPayment();
      this.clearDeepLinkQuery();
      return;
    }

    this.api.get(shopId, focusId).subscribe({
      next: (p) => {
        // Ajustar sección si el link apunta al otro tipo.
        const wantsSupplier = !!p.supplierId;
        if (wantsSupplier !== this.isSupplierKind()) {
          const path = wantsSupplier ? '/payments/suppliers' : '/payments/employees';
          void this.router.navigate([path], {
            queryParams: { payment: p.id, shop: p.shopId },
            replaceUrl: true,
          });
          return;
        }

        // Limpiar filtros que lo ocultan y volver a listar.
        this.mineOnly.set(false);
        this.validatorFilter.setValue([], { emitEvent: false });
        this.payerFilter.setValue([], { emitEvent: false });
        this.supplierFilter.setValue([], { emitEvent: false });
        this.employeeFilter.setValue([], { emitEvent: false });
        this.amountMinFilter.setValue(null, { emitEvent: false });
        this.amountMaxFilter.setValue(null, { emitEvent: false });
        this.dueRange.reset({ start: null, end: null }, { emitEvent: false });
        this.paidRange.reset({ start: null, end: null }, { emitEvent: false });
        this.statusFilter.setValue([p.status], { emitEvent: false });
        this.filtersCollapsed.set(false);
        this.deepLinkHandled = true;
        this.loading.set(true);
        this.api.list(shopId, this.listFilterOpts()).subscribe({
          next: (rows) => {
            this.rows.set(rows);
            this.loading.set(false);
            this.scrollToFocusedPayment();
            this.clearDeepLinkQuery();
          },
          error: () => {
            this.loading.set(false);
            this.snack.open('No se pudo abrir el pago del enlace', 'OK', { duration: 3500 });
          },
        });
      },
      error: () => {
        this.deepLinkHandled = true;
        this.snack.open('No se encontró el pago del enlace', 'OK', { duration: 3500 });
        this.clearDeepLinkQuery();
      },
    });
  }

  private scrollToFocusedPayment(): void {
    const id = this.focusedPaymentId();
    if (!id) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(`payment-${id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    if (this.focusClearTimer) clearTimeout(this.focusClearTimer);
    this.focusClearTimer = setTimeout(() => {
      if (this.focusedPaymentId() === id) this.focusedPaymentId.set(null);
    }, 8000);
  }

  private clearDeepLinkQuery(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { payment: null, shop: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  openCreate(): void {
    this.openDialog('create', undefined, this.kind());
  }

  exportExcel(): void {
    const shopId = this.shopId();
    const shop = this.shops.selectedShop();
    if (!shopId || this.exporting()) return;
    const opts = this.listFilterOpts();
    const kind = this.kind();
    this.exporting.set(true);
    this.api.exportExcel(shopId, { ...opts, kind }).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const stamp = new Date().toISOString().slice(0, 10);
        const kindSlug = kind === 'supplier' ? 'proveedores' : 'empleados';
        a.download = `pagos-${kindSlug}-${this.shopFileSlug(shop?.name ?? shop?.slug)}-${stamp}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.exporting.set(false);
        this.snack.open('No se pudo descargar el Excel', 'OK', { duration: 3000 });
      },
    });
  }

  private shopFileSlug(name?: string | null): string {
    const raw = (name ?? 'local')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
    return raw || 'local';
  }

  openEdit(p: ShopPayment): void {
    this.openDialog('edit', p);
  }

  openDuplicate(p: ShopPayment): void {
    this.openDialog('duplicate', p);
  }

  private openDialog(
    mode: 'create' | 'edit' | 'duplicate',
    payment?: ShopPayment,
    kind: PaymentKind = this.kind(),
  ): void {
    const shopId = this.shopId();
    const shop = this.shops.selectedShop();
    if (!shopId || !shop) return;
    const title =
      mode === 'edit' ? 'Editar pago' : mode === 'duplicate' ? 'Duplicar pago' : 'Nuevo pago';
    const prefill =
      mode === 'create' && kind === 'employee'
        ? { supplierId: null as string | null }
        : undefined;
    // Incluir la cuenta actual del pago aunque esté filtrada en el catálogo.
    const accounts = [...this.accounts()];
    if (
      payment?.accountId &&
      payment.accountName &&
      !accounts.some((a) => a.id === payment.accountId)
    ) {
      accounts.unshift({ id: payment.accountId, name: payment.accountName });
    }
    this.dialogTitle
      .track(
        this.dialog.open(PaymentDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: {
            mode,
            kind,
            shopId,
            shopName: shop.name,
            users: this.users().filter(
              (u) =>
                isUserVisible(u, 'payments') ||
                u.id === payment?.payerUserId ||
                u.id === payment?.validatorUserId,
            ),
            accounts,
            suppliers: this.suppliers(),
            employees: this.employees(),
            canManageSuppliers: this.canManageSuppliers(),
            ...(payment && (mode === 'edit' || mode === 'duplicate') ? { payment } : {}),
            ...(mode === 'create' && prefill ? { prefill } : {}),
          },
        }),
        title,
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) {
          this.reload();
          this.reloadMeta(shopId);
        }
      });
  }

  validate(p: ShopPayment): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.validate(shopId, p.id).subscribe({
      next: () => {
        this.snack.open('Pago validado', 'OK', { duration: 2500 });
        this.reload();
      },
      error: (err) => this.showErr(err),
    });
  }

  resendNotification(p: ShopPayment): void {
    const shopId = this.shopId();
    if (!shopId || !this.canResendNotification(p)) return;
    const kind = p.status === 'PENDING_VALIDATION' ? 'VALIDATE' : 'PAY';
    const label =
      kind === 'VALIDATE'
        ? `aviso de validación a ${p.validatorName || 'quien valida'}`
        : `aviso de pago a ${p.payerName || 'quien paga'}`;
    this.api.resendNotification(shopId, p.id, kind).subscribe({
      next: () => {
        this.snack.open(`Reenviado: ${label}`, 'OK', { duration: 3000 });
      },
      error: (err) => this.showErr(err),
    });
  }

  async reject(p: ShopPayment): Promise<void> {
    const ok = await this.confirm.confirm('Rechazar pago', `¿Rechazar "${p.title}"?`);
    if (!ok) return;
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.reject(shopId, p.id).subscribe({
      next: () => {
        this.snack.open('Pago rechazado', 'OK', { duration: 2500 });
        this.reload();
      },
      error: (err) => this.showErr(err),
    });
  }

  async pay(p: ShopPayment): Promise<void> {
    const result = await firstValueFrom(
      this.dialogTitle
        .track(
          this.dialog.open(PaymentPayDialogComponent, {
            width: '420px',
            maxWidth: '95vw',
            panelClass: 'guy-dialog',
            data: { payment: p },
          }),
          'Marcar como pagado',
        )
        .afterClosed(),
    );
    if (!result?.paymentMethod) return;
    const shopId = this.shopId();
    if (!shopId) return;
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    this.api.pay(shopId, p.id, { paymentMethod: result.paymentMethod }).subscribe({
      next: (paid) => {
        this.reload();
        this.dialogTitle.track(
          this.dialog.open(RecordSavedDialogComponent, {
            width: '440px',
            maxWidth: '95vw',
            panelClass: 'guy-dialog',
            data: paymentPaidDialogData(paid, shopName),
          }),
          'Pago registrado',
        );
        // Ofrece adjuntar comprobante de pago de inmediato
        void this.promptReceiptAfterPay(paid);
      },
      error: (err) => this.showErr(err),
    });
  }

  async revertStatus(p: ShopPayment): Promise<void> {
    if (!this.canManage()) return;
    const shopId = this.shopId();
    if (!shopId) return;
    const goingBackToValidate = p.status === 'VALIDATED';
    const ok = await this.confirm.confirm(
      goingBackToValidate ? 'Volver a validar' : 'Marcar no pagado',
      goingBackToValidate
        ? `¿Devolver "${p.title}" a pendiente de validación?`
        : `¿Marcar "${p.title}" como no pagado? Se anula el movimiento contable asociado.`,
    );
    if (!ok) return;
    this.api.revertStatus(shopId, p.id).subscribe({
      next: () => {
        this.snack.open(
          goingBackToValidate ? 'Volvió a pendiente de validar' : 'Marcado como no pagado',
          'OK',
          { duration: 2500 },
        );
        this.reload();
      },
      error: (err) => this.showErr(err),
    });
  }

  private async promptReceiptAfterPay(paid: ShopPayment): Promise<void> {
    const ok = await this.confirm.confirm(
      'Comprobante de pago',
      '¿Querés adjuntar el comprobante de pago ahora?',
    );
    if (!ok) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const shopId = this.shopId();
      if (!shopId) return;
      this.api.uploadReceiptFile(shopId, paid.id, file).subscribe({
        next: () => {
          this.snack.open('Comprobante de pago guardado', 'OK', { duration: 2500 });
          this.reload();
        },
        error: (err) => this.showErr(err),
      });
    };
    input.click();
  }

  async sharePayment(p: ShopPayment): Promise<void> {
    const shopName = this.shops.selectedShop()?.name ?? 'Local';
    const payload = paymentSharePayload(p, shopName, { link: paymentDeepLink(p) });
    const result = await shareText(payload);
    if (result === 'copied') {
      this.snack.open('Copiado al portapapeles', 'OK', { duration: 2200 });
    } else if (result === 'failed') {
      this.snack.open('No se pudo compartir', 'OK', { duration: 3000 });
    }
  }

  async cancel(p: ShopPayment): Promise<void> {
    const ok = await this.confirm.confirm('Cancelar pago', `¿Cancelar "${p.title}"?`);
    if (!ok) return;
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.cancel(shopId, p.id).subscribe({
      next: () => {
        this.snack.open('Pago cancelado', 'OK', { duration: 2500 });
        this.reload();
      },
      error: (err) => this.showErr(err),
    });
  }

  async remove(p: ShopPayment): Promise<void> {
    const ok = await this.confirm.confirm('Eliminar pago', `¿Eliminar "${p.title}"?`);
    if (!ok) return;
    const shopId = this.shopId();
    if (!shopId) return;
    this.api.remove(shopId, p.id).subscribe({
      next: () => {
        this.snack.open('Pago eliminado', 'OK', { duration: 2500 });
        this.reload();
      },
      error: (err) => this.showErr(err),
    });
  }

  private showErr(err: any): void {
    const msg = err?.error?.message ?? 'No se pudo completar la acción';
    this.snack.open(Array.isArray(msg) ? msg.join(', ') : msg, 'OK', { duration: 4000 });
  }
}
