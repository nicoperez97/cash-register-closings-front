import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  PublicServiceRulesBundle,
  SERVICE_RULE_PHASES,
  ServiceRule,
  ServiceRuleCategory,
  ServiceRulePhase,
  ServiceRulesApiService,
} from './service-rules-api.service';
import { normalizeLogoUrl, resolveShopLogoSrc } from '../../core/utils/drive-url';

@Component({
  selector: 'app-public-service-rules-page',
  template: `
    @if (error()) {
      <div class="poster poster--error">
        <p>{{ error() }}</p>
        <button type="button" class="poster__print" (click)="reload()">Reintentar</button>
      </div>
    } @else if (bundle(); as data) {
      <div class="poster" [style.--accent]="accent()">
        <header class="poster__hero no-print-hide">
          <div class="poster__identity">
            @if (logoUrl()) {
              <img class="poster__logo" [src]="logoUrl()!" [alt]="data.shop.name" />
            }
            <div>
              <p class="poster__eyebrow">Normas de servicio</p>
              <h1>{{ data.shop.name }}</h1>
            </div>
          </div>
          <button
            type="button"
            class="poster__print"
            [disabled]="printing()"
            (click)="downloadPdf()"
          >
            {{ printing() ? 'Generando…' : 'Imprimir / PDF' }}
          </button>
          @if (pdfError()) {
            <p class="poster__pdf-error">{{ pdfError() }}</p>
          }
        </header>

        @for (phase of phases; track phase.value) {
          @if (groupsOf(phase.value); as groups) {
            @if (groups.length) {
              <section class="poster__phase">
                <h2>{{ phase.label }}</h2>
                @for (g of groups; track g.category.id) {
                  <article class="poster__block">
                    <h3>{{ g.category.name }}</h3>
                    @for (rule of g.rules; track rule.id) {
                      <div class="poster__rule">
                        <h4>{{ rule.title }}</h4>
                        <p>{{ rule.body }}</p>
                      </div>
                    }
                  </article>
                }
              </section>
            }
          }
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
      background: #f4f1ea;
      color: #1b140f;
      font-family: Georgia, 'Times New Roman', serif;
    }
    .poster {
      max-width: 52rem;
      margin: 0 auto;
      padding: 1.5rem 1.25rem 3rem;
      --accent: #2e7d32;
    }
    .poster--error {
      min-height: 100vh;
      display: grid;
      place-content: center;
      gap: 0.8rem;
      text-align: center;
    }
    .poster__hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 4px solid var(--accent);
    }
    .poster__identity {
      display: flex;
      align-items: center;
      gap: 0.9rem;
    }
    .poster__logo {
      width: 4.2rem;
      height: 4.2rem;
      object-fit: contain;
      background: #fff;
      border-radius: 12px;
    }
    .poster__eyebrow {
      margin: 0;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      font-size: 0.72rem;
      font-family: Segoe UI, sans-serif;
      color: var(--accent);
      font-weight: 700;
    }
    h1 {
      margin: 0.1rem 0 0;
      font-size: clamp(1.8rem, 4vw, 2.6rem);
      line-height: 1.1;
    }
    .poster__print {
      border: 0;
      background: var(--accent);
      color: #fff;
      font-family: Segoe UI, sans-serif;
      font-weight: 700;
      border-radius: 999px;
      padding: 0.55rem 1rem;
      cursor: pointer;
    }
    .poster__print:disabled {
      opacity: 0.65;
      cursor: wait;
    }
    .poster__pdf-error {
      flex-basis: 100%;
      margin: 0;
      font-family: Segoe UI, sans-serif;
      font-size: 0.85rem;
      color: #8a1f11;
    }
    .poster__phase {
      margin: 0 0 1.75rem;
    }
    .poster__phase h2 {
      margin: 0 0 0.8rem;
      font-size: 1.55rem;
      color: var(--accent);
    }
    .poster__block {
      background: #fff;
      border-radius: 16px;
      padding: 1rem 1.15rem 1.1rem;
      margin-bottom: 0.9rem;
      break-inside: avoid;
      page-break-inside: avoid;
      box-shadow: 0 8px 24px rgba(27, 20, 15, 0.06);
    }
    .poster__block h3 {
      margin: 0 0 0.65rem;
      font-size: 1.2rem;
      border-bottom: 1px solid #eee3d4;
      padding-bottom: 0.35rem;
    }
    .poster__rule + .poster__rule {
      margin-top: 0.85rem;
    }
    .poster__rule h4 {
      margin: 0 0 0.2rem;
      font-size: 1.05rem;
    }
    .poster__rule p {
      margin: 0;
      white-space: pre-wrap;
      font-size: 1.05rem;
      line-height: 1.45;
    }
    @media print {
      :host {
        background: #fff;
      }
      .poster {
        max-width: none;
        padding: 0;
      }
      .poster__print,
      .no-print-hide .poster__print {
        display: none !important;
      }
      .poster__hero {
        border-bottom-width: 3px;
      }
      .poster__block {
        box-shadow: none;
        border: 1px solid #ddd;
      }
    }
  `,
})
export class PublicServiceRulesPageComponent implements OnInit {
  private readonly api = inject(ServiceRulesApiService);
  private readonly route = inject(ActivatedRoute);

  readonly phases = SERVICE_RULE_PHASES;
  readonly bundle = signal<PublicServiceRulesBundle | null>(null);
  readonly error = signal('');
  readonly printing = signal(false);
  readonly pdfError = signal('');

  readonly accent = computed(() => this.bundle()?.shop.accentColor || '#2e7d32');
  readonly logoUrl = computed(() => {
    const shop = this.bundle()?.shop;
    if (!shop) return null;
    const raw = shop.logoUrl;
    return resolveShopLogoSrc(raw, shop.id) || normalizeLogoUrl(raw) || raw?.trim() || null;
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!slug) {
      this.error.set('Local no encontrado');
      return;
    }
    this.error.set('');
    this.api.publicBySlug(slug).subscribe({
      next: (data) => this.bundle.set(data),
      error: () => {
        this.bundle.set(null);
        this.error.set('Las normas de este local no están disponibles');
      },
    });
  }

  groupsOf(
    phase: ServiceRulePhase,
  ): Array<{ category: ServiceRuleCategory; rules: ServiceRule[] }> {
    const data = this.bundle();
    if (!data) return [];
    return data.categories
      .map((category) => ({
        category,
        rules: data.rules
          .filter((r) => r.categoryId === category.id && r.phase === phase)
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)),
      }))
      .filter((g) => g.rules.length);
  }

  downloadPdf(): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!slug || this.printing()) return;
    this.printing.set(true);
    this.pdfError.set('');
    this.api.publicPdf(slug).subscribe({
      next: (blob) => {
        this.printing.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `normas-${slug}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.printing.set(false);
        this.pdfError.set('No se pudo generar el PDF');
      },
    });
  }
}
