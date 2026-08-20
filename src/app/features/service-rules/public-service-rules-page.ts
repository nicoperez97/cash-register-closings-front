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
import { downloadCaptureRootPdf } from '../../shared/pdf/html-pdf';

@Component({
  selector: 'app-public-service-rules-page',
  template: `
    @if (error()) {
      <div class="poster poster--error">
        <p>{{ error() }}</p>
        <button type="button" class="poster__print" (click)="reload()">Reintentar</button>
      </div>
    } @else if (bundle(); as data) {
      <div class="poster" id="rules-pdf-root" [style.--accent]="accent()">
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
            class="poster__print pdf-chrome"
            [disabled]="printing()"
            (click)="downloadPdf()"
          >
            {{ printing() ? 'Generando…' : 'Imprimir / PDF' }}
          </button>
          @if (pdfError()) {
            <p class="poster__pdf-error pdf-chrome">{{ pdfError() }}</p>
          }
        </header>

        @for (phase of phases; track phase.value) {
          @if (groupsOf(phase.value); as groups) {
            @if (groups.length) {
              <section class="poster__phase">
                <h2>{{ phase.label }}</h2>
                @for (g of groups; track g.category.id) {
                  <article class="poster__cat">
                    <header class="poster__cat-head">
                      <h3>{{ g.category.name }}</h3>
                    </header>
                    <div class="poster__cat-body">
                      @for (rule of g.rules; track rule.id) {
                        <div class="poster__rule">
                          <h4>{{ rule.title }}</h4>
                          @if (rule.body) {
                            <p>{{ rule.body }}</p>
                          }
                        </div>
                      }
                    </div>
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
      background: #f4f1ea;
    }
    .poster.pdf-capturing {
      max-width: none;
      margin: 0;
      width: 100%;
      box-sizing: border-box;
      padding: 1.65rem 1.45rem 2rem;
    }
    .poster.pdf-capturing .poster__logo {
      width: 5.1rem;
      height: 5.1rem;
    }
    .poster.pdf-capturing .poster__eyebrow {
      font-size: 0.82rem;
    }
    .poster.pdf-capturing h1 {
      font-size: 2.45rem;
    }
    .poster.pdf-capturing .poster__phase h2 {
      font-size: 1.85rem;
    }
    .poster.pdf-capturing .poster__cat {
      padding: 0;
    }
    .poster.pdf-capturing .poster__cat-head h3 {
      font-size: 0.86rem;
    }
    .poster.pdf-capturing .poster__rule h4 {
      font-size: 1.38rem;
    }
    .poster.pdf-capturing .poster__rule p {
      font-size: 1.05rem;
      line-height: 1.5;
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
    .poster.pdf-capturing .poster__hero {
      justify-content: flex-start;
    }
    .poster.pdf-capturing .pdf-chrome {
      display: none !important;
    }
    .poster__pdf-error {
      flex-basis: 100%;
      margin: 0;
      font-family: Segoe UI, sans-serif;
      font-size: 0.85rem;
      color: #8a1f11;
    }
    .poster__phase {
      margin: 0 0 2rem;
    }
    .poster__phase h2 {
      margin: 0 0 0.85rem;
      font-size: 1.55rem;
      color: var(--accent);
    }
    .poster__cat {
      background: #fff;
      border: 1px solid color-mix(in srgb, var(--accent) 22%, #e7e0d4);
      border-radius: 18px;
      margin-bottom: 1rem;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
      box-shadow: 0 10px 28px rgba(27, 20, 15, 0.07);
    }
    .poster__cat-head {
      padding: 0.7rem 1.1rem;
      background: color-mix(in srgb, var(--accent) 12%, #fff);
      border-bottom: 1px solid color-mix(in srgb, var(--accent) 18%, #eee3d4);
    }
    .poster__cat-head h3 {
      margin: 0;
      font-family: Segoe UI, sans-serif;
      font-size: 0.78rem;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .poster__cat-body {
      display: grid;
      gap: 0.7rem;
      padding: 0.85rem 0.9rem 1rem;
      background: #fbf8f2;
    }
    .poster__rule {
      background: #fff;
      border-radius: 12px;
      padding: 0.85rem 0.95rem 0.9rem;
      border: 1px solid #eee6d8;
    }
    .poster__rule h4 {
      margin: 0;
      font-size: 1.22rem;
      line-height: 1.2;
      color: #1b140f;
      font-weight: 700;
    }
    .poster__rule p {
      margin: 0.4rem 0 0;
      white-space: pre-wrap;
      font-family: Segoe UI, sans-serif;
      font-size: 0.95rem;
      line-height: 1.5;
      color: #5c5349;
      font-weight: 400;
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
      .poster__cat {
        box-shadow: none;
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

  async downloadPdf(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!slug || this.printing()) return;
    this.printing.set(true);
    this.pdfError.set('');
    try {
      await downloadCaptureRootPdf(`rules-pdf-root`, `normas-${slug}.pdf`, {
        background: '#f4f1ea',
        hide: '.poster__print, .poster__pdf-error, .pdf-chrome',
        widthPx: 640,
      });
    } catch {
      this.pdfError.set('No se pudo generar el PDF');
    } finally {
      this.printing.set(false);
    }
  }
}
