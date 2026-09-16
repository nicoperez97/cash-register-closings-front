import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { environment } from '../../../environments/environment';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { apiErrorMessage } from '../customer-orders/ordering-ui.util';
import {
  CLOSING_SOURCE_KIND_OPTIONS,
  ClosingSourceKind,
  closingSourceKindNeedsAccount,
} from '../closings/closings-api.service';
import {
  DeliverateConfig,
  IntegrationsApiService,
  UpsertDeliverateConfigBody,
} from './integrations-api.service';

type AccountOption = { id: string; name: string };

@Component({
  selector: 'app-integrations-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    PageHeaderComponent,
  ],
  templateUrl: './integrations-page.html',
  styleUrl: './integrations-page.scss',
})
export class IntegrationsPage implements OnInit {
  private readonly api = inject(IntegrationsApiService);
  private readonly http = inject(HttpClient);
  readonly shops = inject(ShopContextService);
  private readonly auth = inject(AuthService);
  private readonly snack = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly config = signal<DeliverateConfig | null>(null);
  readonly error = signal<string | null>(null);
  readonly accounts = signal<AccountOption[]>([]);

  readonly closingKindOptions = CLOSING_SOURCE_KIND_OPTIONS;

  enabled = false;
  testMode = true;
  username = '';
  password = '';
  integrationId = '';
  shopPassword = '';
  shopZone: string | null = 'La Plata';
  businessName = '';
  cuit = '';
  taxType: string | null = 'juridica';
  ivaCondition: string | null = null;
  gender: string | null = null;
  birthDate = '';
  ownerName = '';
  textAddress = '';
  cellphone = '';
  telephone = '';
  emailsText = '';
  locationLat: number | null = null;
  locationLng: number | null = null;
  webhookBaseUrl = '';
  closingAccountId: string | null = null;
  closingKind: ClosingSourceKind = 'RECORD_ONLY';
  closingIncludeInDeclared = false;

  get canManage(): boolean {
    const shopId = this.shops.selectedShopId();
    return hasShopPermission(this.auth.currentUser(), shopId, 'integrations.manage');
  }

  needsClosingAccount(): boolean {
    return closingSourceKindNeedsAccount(this.closingKind);
  }

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId) {
      this.loading.set(false);
      this.error.set('Seleccioná un local');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.loadAccounts(shopId);
    this.api.getDeliverate(shopId).subscribe({
      next: (cfg) => {
        this.applyConfig(cfg);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err, 'No pudimos cargar Deliverate'));
      },
    });
  }

  private loadAccounts(shopId: string): void {
    this.http.get<AccountOption[]>(`${environment.apiUrl}/shops/${shopId}/accounts`).subscribe({
      next: (rows) =>
        this.accounts.set(
          (rows ?? [])
            .map((r) => ({ id: r.id, name: r.name }))
            .sort((a, b) => a.name.localeCompare(b.name, 'es')),
        ),
      error: () => this.accounts.set([]),
    });
  }

  private applyConfig(cfg: DeliverateConfig): void {
    this.config.set(cfg);
    this.enabled = cfg.enabled;
    this.testMode = cfg.testMode;
    this.username = cfg.username ?? '';
    this.password = '';
    this.integrationId = cfg.integrationId ?? '';
    this.shopPassword = '';
    this.shopZone = cfg.shopZone ?? 'La Plata';
    this.businessName = cfg.businessName ?? '';
    this.cuit = cfg.cuit ?? '';
    this.taxType = cfg.taxType ?? 'juridica';
    this.ivaCondition = cfg.ivaCondition;
    this.gender = cfg.gender;
    this.birthDate = cfg.birthDate ?? '';
    this.ownerName = cfg.ownerName ?? '';
    this.textAddress = cfg.textAddress ?? '';
    this.cellphone = cfg.cellphone ?? '';
    this.telephone = cfg.telephone ?? '';
    this.emailsText = (cfg.emails ?? []).join(', ');
    this.locationLat = cfg.locationLat;
    this.locationLng = cfg.locationLng;
    this.webhookBaseUrl = cfg.webhookBaseUrl ?? '';
    this.closingAccountId = cfg.closingAccountId;
    this.closingKind = cfg.closingKind ?? 'RECORD_ONLY';
    this.closingIncludeInDeclared = !!cfg.closingIncludeInDeclared;
  }

  onClosingKindChange(): void {
    if (!this.needsClosingAccount()) {
      this.closingAccountId = null;
    }
  }

  private body(extra?: Partial<UpsertDeliverateConfigBody>): UpsertDeliverateConfigBody {
    const emails = this.emailsText
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    const body: UpsertDeliverateConfigBody = {
      enabled: this.enabled,
      testMode: this.testMode,
      username: this.username.trim() || null,
      integrationId: this.integrationId.trim() || null,
      shopZone: this.shopZone,
      businessName: this.businessName.trim() || null,
      cuit: this.cuit.trim() || null,
      taxType: this.taxType,
      ivaCondition: this.ivaCondition,
      gender: this.gender,
      birthDate: this.birthDate.trim() || null,
      ownerName: this.ownerName.trim() || null,
      textAddress: this.textAddress.trim() || null,
      cellphone: this.cellphone.trim() || null,
      telephone: this.telephone.trim() || null,
      emails,
      locationLat: this.locationLat,
      locationLng: this.locationLng,
      webhookBaseUrl: this.webhookBaseUrl.trim() || null,
      closingKind: this.closingKind,
      closingIncludeInDeclared: this.closingIncludeInDeclared,
      closingAccountId: this.needsClosingAccount() ? this.closingAccountId : null,
      ...extra,
    };
    if (this.password.trim()) body.password = this.password.trim();
    if (this.shopPassword.trim()) body.shopPassword = this.shopPassword.trim();
    return body;
  }

  save(extra?: Partial<UpsertDeliverateConfigBody>): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage) return;
    this.saving.set(true);
    this.api.upsertDeliverate(shopId, this.body(extra)).subscribe({
      next: (cfg) => {
        this.applyConfig(cfg);
        this.saving.set(false);
        this.snack.open('Guardado', 'OK', { duration: 2500 });
      },
      error: (err) => {
        this.saving.set(false);
        this.snack.open(apiErrorMessage(err, 'No se pudo guardar'), 'OK', {
          duration: 4500,
        });
        this.reload();
      },
    });
  }

  connect(): void {
    this.save({ connect: true });
  }

  createShop(): void {
    this.save({ createShop: true });
  }

  test(): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage) return;
    this.saving.set(true);
    this.api.testDeliverate(shopId).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.snack.open(
          res.ok
            ? res.warning
              ? `Login OK · ${res.warning}`
              : `Conexión OK (${res.username ?? 'ok'})${
                  res.shops?.length ? ` · shops: ${res.shops.join(', ')}` : ''
                }`
            : 'Falló el test',
          'OK',
          { duration: 5500 },
        );
      },
      error: (err) => {
        this.saving.set(false);
        this.snack.open(apiErrorMessage(err, 'Test fallido'), 'OK', { duration: 4500 });
      },
    });
  }
}
