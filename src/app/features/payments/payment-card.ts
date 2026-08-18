import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth/auth.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { paymentDeepLink, paymentSharePayload } from '../../shared/components/record-share-builders';
import { copyText, shareText } from '../../shared/utils/share-text';
import { PaymentsApiService, ShopPayment } from './payments-api.service';
import { PaymentFilePreviewDialogComponent } from './payment-file-preview-dialog';
import type { PaymentKind } from './payments-page-actions';
import {
  formatPaymentAmount,
  formatPaymentDate,
  paymentDueUrgency,
  paymentHasInvoiceData,
  paymentMethodDisplay,
  paymentPriorityDisplay,
  paymentStatusLabel,
} from './payments-display.util';

@Component({
  selector: 'app-payment-card',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatIconModule,
    MatMenuModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  host: {
    class: 'panel-card pay-card',
    '[class.pay-card--list]': 'viewMode() === "list"',
    '[class.pay-card--selected]': 'selected()',
    '[class.pay-card--pick]': 'selecting()',
    '[class.pay-card--focus]': 'focused()',
    '[attr.id]': '"payment-" + payment().id',
    '[attr.data-status]': 'payment().status',
    '[attr.data-priority]': 'payment().priority || null',
    '[attr.data-due]': 'dueUrgency(payment())',
  },
  template: `
    @if (selecting()) {
      <mat-checkbox
        class="pay-card__check"
        [checked]="selected()"
        (click)="$event.stopPropagation()"
        (change)="toggleSelected.emit()"
        [attr.aria-label]="'Seleccionar ' + (payment().title || 'pago')"
      />
    }
    <div class="pay-card__top">
      <div>
        <h3 class="pay-card__title">
          {{ payment().title || 'Sin concepto' }}
          @if (payment().priority) {
            <span class="pay-card__prio" [attr.data-priority]="payment().priority">{{
              priorityLabel(payment().priority)
            }}</span>
          }
        </h3>
        <p
          class="pay-card__meta"
          [class.pay-card__due--overdue]="dueUrgency(payment()) === 'overdue'"
          [class.pay-card__due--soon]="dueUrgency(payment()) === 'soon'"
        >
          @if (payment().dueDate) {
            @if (dueUrgency(payment()) === 'overdue') {
              <mat-icon class="pay-card__due-icon">warning</mat-icon>
              Vencido {{ formatDate(payment().dueDate) }}
            } @else if (dueUrgency(payment()) === 'soon') {
              <mat-icon class="pay-card__due-icon">schedule</mat-icon>
              Vence {{ formatDate(payment().dueDate) }}
            } @else {
              Vence {{ formatDate(payment().dueDate) }}
            }
          } @else {
            Sin fecha
          }
          @if (payment().paidAt) {
            · Pagado {{ formatDate(payment().paidAt) }}
          }
          @if (payment().createdAt) {
            · Creado {{ formatDate(payment().createdAt) }}
          }
        </p>
      </div>
      <div class="pay-card__amount">$ {{ (payment().amount || 0).toLocaleString('es-AR') }}</div>
    </div>

    <div class="pay-card__grid">
      <div>
        <span class="pay-card__label">Estado</span>
        <strong class="pay-card__status">{{ statusLabel(payment().status) }}</strong>
      </div>
      <div>
        <span class="pay-card__label">Prioridad</span>
        <strong>{{ priorityLabel(payment().priority) }}</strong>
      </div>
      @if (kind() === 'supplier') {
        <div>
          <span class="pay-card__label">Proveedor</span>
          <strong>{{ payment().supplierName || '—' }}</strong>
        </div>
      } @else if (kind() === 'service') {
        <div>
          <span class="pay-card__label">Servicio</span>
          <strong>{{ payment().serviceName || '—' }}</strong>
        </div>
      } @else {
        <div>
          <span class="pay-card__label">Empleado</span>
          <strong>{{ payment().employeeName || '—' }}</strong>
        </div>
      }
      <div>
        <span class="pay-card__label">Paga</span>
        <strong>{{ payment().payerName || '—' }}</strong>
      </div>
      <div>
        <span class="pay-card__label">Valida</span>
        <strong>{{ payment().validatorName || '—' }}</strong>
      </div>
      <div>
        <span class="pay-card__label">Creado por</span>
        <strong>{{ payment().createdByName || '—' }}</strong>
      </div>
      <div>
        <span class="pay-card__label">Fecha de creación</span>
        <strong>{{ formatDate(payment().createdAt) || '—' }}</strong>
      </div>
      <div>
        <span class="pay-card__label">Cuenta que paga</span>
        <strong>{{ payment().accountName || '—' }}</strong>
      </div>
      <div>
        <span class="pay-card__label">Forma de pago</span>
        <strong>{{ paymentMethodLabel(payment().paymentMethod) }}</strong>
      </div>
    </div>

    @if (payment().status === 'PENDING_VALIDATION' || payment().status === 'VALIDATED') {
      <div class="pay-card__pay-data">
        @if (kind() === 'supplier' || kind() === 'service') {
          <div class="pay-card__pay-row">
            <div>
              <span class="pay-card__label">Alias / CBU</span>
              <code class="pay-card__code">{{ partyBankAlias() || '—' }}</code>
            </div>
            @if (payment().status === 'VALIDATED' && partyBankAlias()) {
              <button
                mat-icon-button
                type="button"
                matTooltip="Copiar alias"
                aria-label="Copiar alias"
                (click)="copyAlias(payment())"
              >
                <mat-icon>content_copy</mat-icon>
              </button>
            }
          </div>
        }
        <div class="pay-card__pay-row">
          <div>
            <span class="pay-card__label">Monto</span>
            <strong class="pay-card__code">$ {{ formatAmount(payment().amount) }}</strong>
          </div>
          @if (payment().status === 'VALIDATED') {
            <button
              mat-icon-button
              type="button"
              matTooltip="Copiar monto"
              aria-label="Copiar monto"
              (click)="copyAmount(payment())"
            >
              <mat-icon>content_copy</mat-icon>
            </button>
          }
        </div>
      </div>
    }

    @if (payment().notes || payment().conceptDescription) {
      <p class="pay-card__notes">{{ payment().notes || payment().conceptDescription }}</p>
    }

    @if (billedKind() && hasInvoiceData(payment())) {
      <details class="pay-card__invoice">
        <summary>
          <mat-icon>receipt_long</mat-icon>
          Datos de facturación
          @if (payment().invoiceNumber) {
            <span class="pay-card__invoice-num"
              >{{ payment().invoiceType || '' }} {{ payment().invoiceNumber }}</span
            >
          }
        </summary>
        <div class="pay-card__invoice-grid">
          @if (payment().invoiceLegalName) {
            <div>
              <span class="pay-card__label">Razón social</span>
              <strong>{{ payment().invoiceLegalName }}</strong>
            </div>
          }
          @if (payment().invoiceTaxId) {
            <div>
              <span class="pay-card__label">CUIT</span>
              <strong>{{ payment().invoiceTaxId }}</strong>
            </div>
          }
          @if (payment().invoiceType) {
            <div>
              <span class="pay-card__label">Tipo</span>
              <strong>{{ payment().invoiceType }}</strong>
            </div>
          }
          @if (payment().invoiceNumber) {
            <div>
              <span class="pay-card__label">Nº factura</span>
              <strong>{{ payment().invoiceNumber }}</strong>
            </div>
          }
          @if (payment().invoiceNetAmount != null) {
            <div>
              <span class="pay-card__label">Monto neto</span>
              <strong>$ {{ formatAmount(payment().invoiceNetAmount) }}</strong>
            </div>
          }
          @if (payment().invoiceIvaAmount != null) {
            <div>
              <span class="pay-card__label">IVA</span>
              <strong>$ {{ formatAmount(payment().invoiceIvaAmount) }}</strong>
            </div>
          }
          @if (payment().invoicePerceptionsAmount != null) {
            <div>
              <span class="pay-card__label">Percepciones</span>
              <strong>$ {{ formatAmount(payment().invoicePerceptionsAmount) }}</strong>
            </div>
          }
          @if (payment().invoiceOtherTaxesAmount != null) {
            <div>
              <span class="pay-card__label">Otros impuestos</span>
              <strong>$ {{ formatAmount(payment().invoiceOtherTaxesAmount) }}</strong>
            </div>
          }
        </div>
        @if (payment().hasInvoiceFile) {
          <button mat-stroked-button type="button" (click)="viewInvoice(payment())">
            <mat-icon>visibility</mat-icon>
            Ver factura
          </button>
        }
      </details>
    }

    <div class="pay-card__actions">
      @if (canValidate(payment())) {
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="isBusy()"
          (click)="validate(payment())"
        >
          <mat-icon>verified</mat-icon>
          Validar
        </button>
      }
      @if (canPay(payment())) {
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="payBusy()"
          (click)="payRequested.emit(payment())"
        >
          <mat-icon>paid</mat-icon>
          Marcar pagado
        </button>
      }

      @if (hasMoreActions()) {
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
          @if (canValidate(payment())) {
            <button mat-menu-item type="button" (click)="reject(payment())">
              <mat-icon>block</mat-icon>
              <span>Rechazar</span>
            </button>
          }
          @if (canManage() && payment().status === 'VALIDATED') {
            <button mat-menu-item type="button" (click)="revertStatus(payment())">
              <mat-icon>undo</mat-icon>
              <span>Volver a validar</span>
            </button>
          }
          @if (canManage() && payment().status === 'PAID') {
            <button mat-menu-item type="button" (click)="revertStatus(payment())">
              <mat-icon>undo</mat-icon>
              <span>Marcar no pagado</span>
            </button>
          }
          @if (payment().status === 'PAID') {
            <button mat-menu-item type="button" (click)="receiptPickRequested.emit(payment())">
              <mat-icon>attach_file</mat-icon>
              <span>{{
                payment().hasReceiptFile ? 'Cambiar comprobante' : 'Adjuntar comprobante'
              }}</span>
            </button>
            @if (payment().hasReceiptFile) {
              <button mat-menu-item type="button" (click)="viewReceipt(payment())">
                <mat-icon>visibility</mat-icon>
                <span>Ver comprobante</span>
              </button>
            }
          }
          <button mat-menu-item type="button" (click)="sharePayment(payment())">
            <mat-icon>share</mat-icon>
            <span>Compartir</span>
          </button>
          @if (canResendNotification(payment())) {
            <button mat-menu-item type="button" (click)="resendNotification(payment())">
              <mat-icon>notifications_active</mat-icon>
              <span>Reenviar aviso</span>
            </button>
          }
          @if (canManage()) {
            <button mat-menu-item type="button" (click)="duplicateRequested.emit(payment())">
              <mat-icon>content_copy</mat-icon>
              <span>Duplicar</span>
            </button>
          }
          @if (
            canManage() &&
            (payment().status === 'PENDING_VALIDATION' ||
              payment().status === 'VALIDATED' ||
              payment().status === 'PAID')
          ) {
            <button mat-menu-item type="button" (click)="editRequested.emit(payment())">
              <mat-icon>edit</mat-icon>
              <span>Editar</span>
            </button>
          }
          @if (
            canManage() &&
            (payment().status === 'PENDING_VALIDATION' || payment().status === 'VALIDATED')
          ) {
            <button mat-menu-item type="button" (click)="cancel(payment())">
              <mat-icon>cancel</mat-icon>
              <span>Cancelar</span>
            </button>
          }
          @if (canManage() && payment().status !== 'PAID') {
            <button mat-menu-item type="button" class="pay-card__danger" (click)="remove(payment())">
              <mat-icon>delete</mat-icon>
              <span>Eliminar</span>
            </button>
          }
        </mat-menu>
      }
    </div>
  `,
  styleUrl: './payment-card.scss',
})
export class PaymentCardComponent {
  private readonly api = inject(PaymentsApiService);
  private readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly confirm = inject(ConfirmDialogService);

  readonly payment = input.required<ShopPayment>();
  readonly viewMode = input.required<'cards' | 'list'>();
  readonly selecting = input(false);
  readonly selected = input(false);
  readonly focused = input(false);
  readonly payBusy = input(false);
  readonly kind = input<PaymentKind>('supplier');
  readonly billedKind = computed(() => this.kind() !== 'employee');
  readonly partyBankAlias = computed(() => {
    const p = this.payment();
    return this.kind() === 'service' ? p.serviceBankAlias : p.supplierBankAlias;
  });
  readonly canManage = input(false);

  readonly toggleSelected = output<void>();
  readonly changed = output<void>();
  readonly payRequested = output<ShopPayment>();
  readonly editRequested = output<ShopPayment>();
  readonly duplicateRequested = output<ShopPayment>();
  readonly receiptPickRequested = output<ShopPayment>();

  private readonly actionBusy = signal(false);

  readonly dueUrgency = paymentDueUrgency;
  readonly statusLabel = paymentStatusLabel;
  readonly paymentMethodLabel = paymentMethodDisplay;
  readonly priorityLabel = paymentPriorityDisplay;
  readonly formatDate = formatPaymentDate;
  readonly formatAmount = formatPaymentAmount;
  readonly hasInvoiceData = paymentHasInvoiceData;

  isBusy(): boolean {
    return this.actionBusy() || this.payBusy();
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

  canResendNotification(p: ShopPayment): boolean {
    if (!this.canManage()) return false;
    if (p.status === 'PENDING_VALIDATION') return !!p.validatorUserId;
    if (p.status === 'VALIDATED') return !!p.payerUserId;
    return false;
  }

  hasMoreActions(): boolean {
    return true;
  }

  validate(p: ShopPayment): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.actionBusy()) return;
    this.actionBusy.set(true);
    this.api.validate(shopId, p.id).subscribe({
      next: () => {
        this.actionBusy.set(false);
        this.snack.open('Pago validado', 'OK', { duration: 2500 });
        this.changed.emit();
      },
      error: (err) => {
        this.actionBusy.set(false);
        this.showErr(err);
      },
    });
  }

  resendNotification(p: ShopPayment): void {
    const shopId = this.shops.selectedShopId();
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
    const shopId = this.shops.selectedShopId();
    if (!shopId || this.actionBusy()) return;
    this.actionBusy.set(true);
    this.api.reject(shopId, p.id).subscribe({
      next: () => {
        this.actionBusy.set(false);
        this.snack.open('Pago rechazado', 'OK', { duration: 2500 });
        this.changed.emit();
      },
      error: (err) => {
        this.actionBusy.set(false);
        this.showErr(err);
      },
    });
  }

  async revertStatus(p: ShopPayment): Promise<void> {
    if (!this.canManage()) return;
    const shopId = this.shops.selectedShopId();
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
        this.changed.emit();
      },
      error: (err) => this.showErr(err),
    });
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
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.cancel(shopId, p.id).subscribe({
      next: () => {
        this.snack.open('Pago cancelado', 'OK', { duration: 2500 });
        this.changed.emit();
      },
      error: (err) => this.showErr(err),
    });
  }

  async remove(p: ShopPayment): Promise<void> {
    const ok = await this.confirm.confirm('Eliminar pago', `¿Eliminar "${p.title}"?`);
    if (!ok) return;
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.remove(shopId, p.id).subscribe({
      next: () => {
        this.snack.open('Pago eliminado', 'OK', { duration: 2500 });
        this.changed.emit();
      },
      error: (err) => this.showErr(err),
    });
  }

  viewInvoice(p: ShopPayment): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) return;
    this.api.downloadInvoiceFile(shopId, p.id).subscribe({
      next: (blob) =>
        this.openFilePreview('Factura', p.invoiceFileName || 'factura.pdf', blob),
      error: (err) => this.showErr(err),
    });
  }

  viewReceipt(p: ShopPayment): void {
    const shopId = this.shops.selectedShopId();
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

  async copyAlias(p: ShopPayment): Promise<void> {
    const text = (
      (this.kind() === 'service' ? p.serviceBankAlias : p.supplierBankAlias) ?? ''
    ).trim();
    if (!text) return;
    const ok = await copyText(text);
    this.snack.open(ok ? 'Alias / CBU copiado' : 'No se pudo copiar', 'OK', {
      duration: ok ? 2000 : 2500,
    });
  }

  async copyAmount(p: ShopPayment): Promise<void> {
    const text = formatPaymentAmount(p.amount);
    const ok = await copyText(text);
    this.snack.open(ok ? 'Monto copiado' : 'No se pudo copiar', 'OK', {
      duration: ok ? 2000 : 2500,
    });
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

  private showErr(err: any): void {
    const msg = err?.error?.message ?? 'No se pudo completar la acción';
    this.snack.open(msg, 'OK', { duration: 4000 });
  }
}
