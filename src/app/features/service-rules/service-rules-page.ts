import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth/auth.service';
import { hasShopPermission } from '../../core/auth/auth.models';
import { usePageRefresh } from '../../core/page-refresh.service';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { BusyLabelComponent } from '../../shared/components/busy-label';
import { ConfirmDialogService } from '../../shared/components/confirm-dialog';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { SpinnerComponent } from '../../shared/components/spinner';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { copyText } from '../../shared/utils/share-text';
import {
  SERVICE_RULE_PHASES,
  ServiceRule,
  ServiceRuleCategory,
  ServiceRulePhase,
  ServiceRulesApiService,
} from './service-rules-api.service';

type CategoryDialogData = {
  shopId: string;
  shopName: string;
} & ({ mode: 'create' } | { mode: 'edit'; category: ServiceRuleCategory });

type RuleDialogData = {
  shopId: string;
  shopName: string;
  categories: ServiceRuleCategory[];
  defaultPhase: ServiceRulePhase;
  defaultCategoryId: string | null;
} & ({ mode: 'create' } | { mode: 'edit'; rule: ServiceRule });

@Component({
  selector: 'app-service-rule-category-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'folder' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar categoría' : 'Nueva categoría' }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>
    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Nombre</mat-label>
          <mat-icon matPrefix>label</mat-icon>
          <input matInput formControlName="name" autocomplete="off" placeholder="Cocina, Salón…" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">Cancelar</button>
      <button mat-flat-button color="primary" type="button" [disabled]="form.invalid || busy()" (click)="save()">
        <app-busy-label [busy]="busy()" [busyLabel]="isEdit ? 'Guardando…' : 'Creando…'">
          <mat-icon>{{ isEdit ? 'save' : 'add' }}</mat-icon>
          {{ isEdit ? 'Guardar' : 'Crear' }}
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
})
export class ServiceRuleCategoryDialogComponent {
  readonly data = inject<CategoryDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ServiceRuleCategoryDialogComponent, ServiceRuleCategory | boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ServiceRulesApiService);
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = this.data.mode === 'edit';
  readonly category = this.data.mode === 'edit' ? this.data.category : null;
  readonly busy = signal(false);
  readonly form = this.fb.nonNullable.group({
    name: [this.category?.name ?? '', Validators.required],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const name = this.form.getRawValue().name.trim();
    this.busy.set(true);
    const req =
      this.isEdit && this.category
        ? this.api.updateCategory(this.data.shopId, this.category.id, { name })
        : this.api.createCategory(this.data.shopId, { name });
    req.subscribe({
      next: (row) => {
        this.busy.set(false);
        this.snack.open(this.isEdit ? 'Categoría actualizada' : 'Categoría creada', 'OK', {
          duration: 2200,
        });
        this.ref.close(row);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message || 'No se pudo guardar';
        this.snack.open(Array.isArray(msg) ? msg[0] : msg, 'OK', { duration: 3500 });
      },
    });
  }
}

@Component({
  selector: 'app-service-rule-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    BusyLabelComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <span class="guy-dialog__title-icon" aria-hidden="true">
        <mat-icon>{{ isEdit ? 'edit' : 'rule' }}</mat-icon>
      </span>
      <span class="guy-dialog__title-text">
        <strong>{{ isEdit ? 'Editar norma' : 'Nueva norma' }}</strong>
        <span>{{ data.shopName }}</span>
      </span>
    </h2>
    <mat-dialog-content>
      <form class="guy-dialog__form" [formGroup]="form" (ngSubmit)="save()">
        <div class="phase-field">
          <span class="phase-field__label">Momento</span>
          <mat-button-toggle-group formControlName="phase" hideSingleSelectionIndicator>
            @for (opt of phases; track opt.value) {
              <mat-button-toggle [value]="opt.value">{{ opt.label }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
        </div>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Categoría</mat-label>
          <mat-select formControlName="categoryId">
            @for (c of data.categories; track c.id) {
              <mat-option [value]="c.id">{{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Título</mat-label>
          <input matInput formControlName="title" autocomplete="off" />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Texto</mat-label>
          <textarea matInput rows="5" formControlName="body"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)" [disabled]="busy()">Cancelar</button>
      <button mat-flat-button color="primary" type="button" [disabled]="form.invalid || busy()" (click)="save()">
        <app-busy-label [busy]="busy()" [busyLabel]="isEdit ? 'Guardando…' : 'Creando…'">
          <mat-icon>{{ isEdit ? 'save' : 'add' }}</mat-icon>
          {{ isEdit ? 'Guardar' : 'Crear' }}
        </app-busy-label>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .phase-field {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      margin-bottom: 0.35rem;
    }
    .phase-field__label {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
    }
    mat-button-toggle-group {
      width: 100%;
      display: grid !important;
      grid-template-columns: 1fr 1fr;
    }
  `,
})
export class ServiceRuleDialogComponent {
  readonly data = inject<RuleDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<ServiceRuleDialogComponent, ServiceRule | boolean>);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ServiceRulesApiService);
  private readonly snack = inject(MatSnackBar);

  readonly isEdit = this.data.mode === 'edit';
  readonly rule = this.data.mode === 'edit' ? this.data.rule : null;
  readonly phases = SERVICE_RULE_PHASES;
  readonly busy = signal(false);
  readonly form = this.fb.nonNullable.group({
    phase: [this.rule?.phase ?? this.data.defaultPhase, Validators.required],
    categoryId: [
      this.rule?.categoryId ?? this.data.defaultCategoryId ?? this.data.categories[0]?.id ?? '',
      Validators.required,
    ],
    title: [this.rule?.title ?? '', Validators.required],
    body: [this.rule?.body ?? '', Validators.required],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const body = {
      phase: raw.phase,
      categoryId: raw.categoryId,
      title: raw.title.trim(),
      body: raw.body.trim(),
    };
    this.busy.set(true);
    const req =
      this.isEdit && this.rule
        ? this.api.updateRule(this.data.shopId, this.rule.id, body)
        : this.api.createRule(this.data.shopId, body);
    req.subscribe({
      next: (row) => {
        this.busy.set(false);
        this.snack.open(this.isEdit ? 'Norma actualizada' : 'Norma creada', 'OK', { duration: 2200 });
        this.ref.close(row);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err?.error?.message || 'No se pudo guardar';
        this.snack.open(Array.isArray(msg) ? msg[0] : msg, 'OK', { duration: 3500 });
      },
    });
  }
}

@Component({
  selector: 'app-service-rules-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    RouterLink,
    PageHeaderComponent,
    SpinnerComponent,
  ],
  template: `
    <app-page-header
      title="Normas de servicio"
      [subtitle]="shops.selectedShop()?.name ?? 'Local'"
      [actionLabel]="canManage() ? 'Nueva categoría' : ''"
      actionIcon="create_new_folder"
      [actionLarge]="true"
      (action)="openCategory()"
    />

    @if (publicUrl()) {
      <div class="sr-public">
        <a class="sr-public__btn" [href]="publicUrl()" target="_blank" rel="noopener">
          <mat-icon>open_in_new</mat-icon>
          Abrir
        </a>
        <button type="button" class="sr-public__btn sr-public__btn--ghost" (click)="copyPublicUrl()">
          <mat-icon>content_copy</mat-icon>
          Copiar link
        </button>
        @if (!publicEnabled()) {
          <p class="sr-public__hint">
            El link todavía no está publicado.
            @if (canManageShop()) {
              Activalo en
              <a routerLink="/admin/shop">Local → Normas públicas</a>.
            } @else {
              Pedile a un admin que active “Normas públicas” en el local.
            }
          </p>
        }
      </div>
    }

    @if (loading()) {
      <app-spinner />
    } @else if (!categories().length) {
      <p class="sr-empty">
        @if (canManage()) {
          Creá una categoría (Cocina, Salón, Caja…) y después las normas de antes y después del servicio.
        } @else {
          Todavía no hay normas cargadas.
        }
      </p>
    } @else {
      <div class="sr-grid">
        @for (phase of phases; track phase.value) {
          <section class="panel-card sr-phase">
            <header class="sr-phase__head">
              <h2>{{ phase.label }}</h2>
              @if (canManage()) {
                <button mat-stroked-button type="button" (click)="openRule(phase.value, null)">
                  <mat-icon>add</mat-icon>
                  Norma
                </button>
              }
            </header>
            @for (cat of categories(); track cat.id) {
              <article class="sr-cat">
                <div class="sr-cat__head">
                  <h3>{{ cat.name }}</h3>
                  @if (canManage()) {
                    <div class="sr-cat__actions">
                      <button mat-icon-button type="button" matTooltip="Subir" (click)="moveCategory(cat, -1)">
                        <mat-icon>arrow_upward</mat-icon>
                      </button>
                      <button mat-icon-button type="button" matTooltip="Bajar" (click)="moveCategory(cat, 1)">
                        <mat-icon>arrow_downward</mat-icon>
                      </button>
                      <button mat-icon-button type="button" matTooltip="Editar categoría" (click)="openCategory(cat)">
                        <mat-icon>edit</mat-icon>
                      </button>
                      <button mat-icon-button type="button" matTooltip="Borrar categoría" (click)="removeCategory(cat)">
                        <mat-icon>delete</mat-icon>
                      </button>
                      <button
                        mat-icon-button
                        type="button"
                        matTooltip="Nueva norma"
                        (click)="openRule(phase.value, cat.id)"
                      >
                        <mat-icon>add</mat-icon>
                      </button>
                    </div>
                  }
                </div>
                @for (rule of rulesOf(cat.id, phase.value); track rule.id) {
                  <div class="sr-rule">
                    <div class="sr-rule__text">
                      <strong>{{ rule.title }}</strong>
                      <p>{{ rule.body }}</p>
                    </div>
                    @if (canManage()) {
                      <div class="sr-rule__actions">
                        <button mat-icon-button type="button" matTooltip="Subir" (click)="moveRule(rule, -1)">
                          <mat-icon>keyboard_arrow_up</mat-icon>
                        </button>
                        <button mat-icon-button type="button" matTooltip="Bajar" (click)="moveRule(rule, 1)">
                          <mat-icon>keyboard_arrow_down</mat-icon>
                        </button>
                        <button mat-icon-button type="button" matTooltip="Editar" (click)="openRule(rule.phase, rule.categoryId, rule)">
                          <mat-icon>edit</mat-icon>
                        </button>
                        <button mat-icon-button type="button" matTooltip="Borrar" (click)="removeRule(rule)">
                          <mat-icon>delete</mat-icon>
                        </button>
                      </div>
                    }
                  </div>
                } @empty {
                  <p class="sr-cat__empty">Sin normas en este momento</p>
                }
              </article>
            }
          </section>
        }
      </div>
    }
  `,
  styles: `
    .sr-public {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      margin: 0 0 1rem;
    }
    .sr-public__btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 10px;
      padding: 0.45rem 0.8rem;
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 10%, #fff);
      color: var(--guy-navy, #003366);
      text-decoration: none;
      font-size: 0.88rem;
      font-weight: 650;
      cursor: pointer;
    }
    .sr-public__btn mat-icon {
      font-size: 1.1rem;
      width: 1.1rem;
      height: 1.1rem;
    }
    .sr-public__btn--ghost {
      background: transparent;
    }
    .sr-public__hint {
      margin: 0;
      flex: 1 1 100%;
      font-size: 0.82rem;
      color: var(--guy-muted, #5f6f76);
      line-height: 1.4;
    }
    .sr-public__hint a {
      color: var(--guy-navy, #003366);
      font-weight: 650;
    }
    .sr-empty {
      color: var(--guy-muted, #5f6f76);
    }
    .sr-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      align-items: start;
    }
    .sr-phase__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .sr-phase__head h2 {
      margin: 0;
      font-size: 1.05rem;
      color: var(--guy-navy, #003366);
    }
    .sr-cat {
      border: 1px solid var(--guy-border, #e6ebf0);
      border-radius: 14px;
      padding: 0.55rem 0.65rem 0.7rem;
      margin: 0 0 0.75rem;
      background: color-mix(in srgb, var(--guy-navy, #003366) 3%, #fff);
    }
    .sr-cat__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.35rem;
      margin-bottom: 0.35rem;
      padding: 0.15rem 0.2rem 0.45rem;
      border-bottom: 1px solid var(--guy-border, #e6ebf0);
    }
    .sr-cat__head h3 {
      margin: 0;
      font-size: 0.78rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      font-weight: 800;
      color: var(--guy-navy, #003366);
    }
    .sr-cat__actions,
    .sr-rule__actions {
      display: flex;
      flex-wrap: wrap;
    }
    .sr-cat__empty {
      margin: 0.35rem 0 0;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.85rem;
    }
    .sr-rule {
      display: flex;
      gap: 0.35rem;
      align-items: flex-start;
      margin-top: 0.5rem;
      padding: 0.65rem 0.7rem;
      border-radius: 10px;
      background: #fff;
      border: 1px solid color-mix(in srgb, var(--guy-border, #e6ebf0) 80%, #fff);
    }
    .sr-rule__text {
      flex: 1;
      min-width: 0;
    }
    .sr-rule__text strong {
      display: block;
      margin-bottom: 0.28rem;
      font-size: 1.02rem;
      line-height: 1.25;
      color: var(--guy-navy, #003366);
    }
    .sr-rule__text p {
      margin: 0;
      white-space: pre-wrap;
      line-height: 1.5;
      font-size: 0.86rem;
      font-weight: 400;
      color: var(--guy-muted, #5f6f76);
    }
    @media (max-width: 900px) {
      .sr-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class ServiceRulesPage {
  private readonly api = inject(ServiceRulesApiService);
  private readonly auth = inject(AuthService);
  readonly shops = inject(ShopContextService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly snack = inject(MatSnackBar);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly phases = SERVICE_RULE_PHASES;
  readonly loading = signal(false);
  readonly categories = signal<ServiceRuleCategory[]>([]);
  readonly rules = signal<ServiceRule[]>([]);
  readonly shopId = computed(() => this.shops.selectedShopId());

  constructor() {
    usePageRefresh(() => this.reload());
    effect(() => {
      const id = this.shopId();
      if (id) this.reload();
    });
  }

  canManage(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'serviceRules.manage');
  }

  canManageShop(): boolean {
    return hasShopPermission(this.auth.currentUser(), this.shopId(), 'shops.manage');
  }

  publicEnabled(): boolean {
    return this.shops.selectedShop()?.publicServiceRulesEnabled === true;
  }

  publicUrl(): string {
    const slug = this.shops.selectedShop()?.slug;
    if (!slug) return '';
    return `${window.location.origin}/n/${encodeURIComponent(slug)}`;
  }

  async copyPublicUrl(): Promise<void> {
    const url = this.publicUrl();
    if (!url) return;
    const ok = await copyText(url);
    this.snack.open(ok ? 'Link de normas copiado' : 'No se pudo copiar la URL', 'OK', {
      duration: 2500,
    });
  }

  rulesOf(categoryId: string, phase: ServiceRulePhase): ServiceRule[] {
    return this.rules()
      .filter((r) => r.categoryId === categoryId && r.phase === phase)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }

  reload(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.loading.set(true);
    this.api.list(shopId).subscribe({
      next: (bundle) => {
        this.categories.set(bundle.categories ?? []);
        this.rules.set(bundle.rules ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudieron cargar las normas', 'OK', { duration: 3500 });
      },
    });
  }

  openCategory(category?: ServiceRuleCategory): void {
    const shopId = this.shopId();
    if (!shopId) return;
    const data: CategoryDialogData = category
      ? { shopId, shopName: this.shops.selectedShop()?.name ?? '', mode: 'edit', category }
      : { shopId, shopName: this.shops.selectedShop()?.name ?? '', mode: 'create' };
    this.dialogTitle
      .track(
        this.dialog.open(ServiceRuleCategoryDialogComponent, {
          width: '420px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data,
        }),
        category ? 'Editar categoría' : 'Nueva categoría',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }

  openRule(phase: ServiceRulePhase, categoryId: string | null, rule?: ServiceRule): void {
    const shopId = this.shopId();
    if (!shopId) return;
    if (!this.categories().length) {
      this.snack.open('Primero creá una categoría', 'OK', { duration: 2500 });
      return;
    }
    const data: RuleDialogData = rule
      ? {
          shopId,
          shopName: this.shops.selectedShop()?.name ?? '',
          categories: this.categories(),
          defaultPhase: rule.phase,
          defaultCategoryId: rule.categoryId,
          mode: 'edit',
          rule,
        }
      : {
          shopId,
          shopName: this.shops.selectedShop()?.name ?? '',
          categories: this.categories(),
          defaultPhase: phase,
          defaultCategoryId: categoryId,
          mode: 'create',
        };
    this.dialogTitle
      .track(
        this.dialog.open(ServiceRuleDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data,
        }),
        rule ? 'Editar norma' : 'Nueva norma',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.reload();
      });
  }

  async removeCategory(cat: ServiceRuleCategory): Promise<void> {
    const shopId = this.shopId();
    if (!shopId) return;
    const ok = await this.confirmDialog.confirm(
      'Borrar categoría',
      `Se van a borrar «${cat.name}» y todas sus normas.`,
      { confirmLabel: 'Borrar', icon: 'delete' },
    );
    if (!ok) return;
    this.api.removeCategory(shopId, cat.id).subscribe({
      next: () => {
        this.snack.open('Categoría borrada', 'OK', { duration: 2200 });
        this.reload();
      },
      error: () => this.snack.open('No se pudo borrar', 'OK', { duration: 3500 }),
    });
  }

  async removeRule(rule: ServiceRule): Promise<void> {
    const shopId = this.shopId();
    if (!shopId) return;
    const ok = await this.confirmDialog.confirm('Borrar norma', `¿Borrar «${rule.title}»?`, {
      confirmLabel: 'Borrar',
      icon: 'delete',
    });
    if (!ok) return;
    this.api.removeRule(shopId, rule.id).subscribe({
      next: () => {
        this.snack.open('Norma borrada', 'OK', { duration: 2200 });
        this.reload();
      },
      error: () => this.snack.open('No se pudo borrar', 'OK', { duration: 3500 }),
    });
  }

  moveCategory(cat: ServiceRuleCategory, dir: -1 | 1): void {
    const shopId = this.shopId();
    if (!shopId) return;
    const list = this.categories();
    const i = list.findIndex((c) => c.id === cat.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const other = list[j];
    this.api.updateCategory(shopId, cat.id, { sortOrder: other.sortOrder }).subscribe({
      next: () => {
        this.api.updateCategory(shopId, other.id, { sortOrder: cat.sortOrder }).subscribe({
          next: () => this.reload(),
          error: () => this.reload(),
        });
      },
      error: () => this.snack.open('No se pudo reordenar', 'OK', { duration: 3000 }),
    });
  }

  moveRule(rule: ServiceRule, dir: -1 | 1): void {
    const shopId = this.shopId();
    if (!shopId) return;
    const list = this.rulesOf(rule.categoryId, rule.phase);
    const i = list.findIndex((r) => r.id === rule.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const other = list[j];
    this.api.updateRule(shopId, rule.id, { sortOrder: other.sortOrder }).subscribe({
      next: () => {
        this.api.updateRule(shopId, other.id, { sortOrder: rule.sortOrder }).subscribe({
          next: () => this.reload(),
          error: () => this.reload(),
        });
      },
      error: () => this.snack.open('No se pudo reordenar', 'OK', { duration: 3000 }),
    });
  }
}
