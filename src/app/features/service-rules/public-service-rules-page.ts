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
        <header class="poster__hero">
          <div class="poster__identity">
            @if (logoUrl()) {
              <img class="poster__logo" [src]="logoUrl()!" [alt]="data.shop.name" />
            }
            <div class="poster__titles">
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

        <div class="poster__phases">
          @for (phase of phases; track phase.value) {
            @if (groupsOf(phase.value); as groups) {
              @if (groups.length) {
                <section class="poster__phase" [attr.data-phase]="phase.value">
                  <header class="poster__phase-head">
                    <span class="poster__phase-mark" aria-hidden="true"></span>
                    <h2>{{ phase.label }}</h2>
                  </header>
                  <div class="poster__phase-body">
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
                  </div>
                </section>
              }
            }
          }
        </div>
      </div>
    }
  `,
  styles: `
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Outfit:wght@400;500;600;700;800&display=swap');

    :host {
      display: block;
      min-height: 100vh;
      color: #1a2428;
      font-family: Outfit, system-ui, sans-serif;
      background:
        radial-gradient(ellipse 80% 50% at 10% -10%, color-mix(in srgb, var(--page-accent, #2e7d32) 16%, transparent), transparent 55%),
        radial-gradient(ellipse 70% 40% at 100% 0%, color-mix(in srgb, var(--page-accent, #2e7d32) 10%, transparent), transparent 50%),
        #f3f5f4;
      --page-accent: #2e7d32;
    }
    .poster {
      --accent: #2e7d32;
      max-width: 84rem;
      margin: 0 auto;
      padding: 1.1rem 1rem 2.5rem;
      box-sizing: border-box;
    }
    .poster.pdf-capturing {
      max-width: none;
      margin: 0;
      width: 100%;
      padding: 1.25rem 1.1rem 1.75rem;
      background: #f3f5f4;
    }
    .poster.pdf-capturing .poster__phases {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    .poster.pdf-capturing .poster__logo {
      width: 3.4rem;
      height: 3.4rem;
    }
    .poster.pdf-capturing h1 {
      font-size: 1.85rem;
    }
    .poster.pdf-capturing .poster__phase h2 {
      font-size: 1.15rem;
    }
    .poster.pdf-capturing .poster__rule h4 {
      font-size: 0.98rem;
    }
    .poster.pdf-capturing .poster__rule p {
      font-size: 0.84rem;
      line-height: 1.4;
    }
    .poster.pdf-capturing .pdf-chrome {
      display: none !important;
    }
    .poster--error {
      min-height: 100vh;
      display: grid;
      place-content: center;
      gap: 0.8rem;
      text-align: center;
      padding: 1.5rem;
    }
    .poster__hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.85rem 1.25rem;
      flex-wrap: wrap;
      margin-bottom: 1.15rem;
      padding: 0.85rem 1rem;
      border-radius: 16px;
      background: color-mix(in srgb, #fff 88%, var(--accent));
      border: 1px solid color-mix(in srgb, var(--accent) 18%, #dfe6e2);
      box-shadow: 0 8px 28px color-mix(in srgb, var(--accent) 8%, transparent);
    }
    .poster__identity {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
    }
    .poster__logo {
      width: 3.25rem;
      height: 3.25rem;
      object-fit: contain;
      flex-shrink: 0;
      background: #fff;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--accent) 14%, #e5ebe8);
      padding: 0.2rem;
    }
    .poster__titles {
      min-width: 0;
    }
    .poster__eyebrow {
      margin: 0;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      font-size: 0.62rem;
      font-weight: 700;
      color: var(--accent);
    }
    h1 {
      margin: 0.12rem 0 0;
      font-family: Fraunces, Georgia, serif;
      font-size: clamp(1.35rem, 2.6vw, 1.85rem);
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -0.02em;
      color: #142018;
    }
    .poster__print {
      border: 0;
      background: var(--accent);
      color: #fff;
      font-family: inherit;
      font-weight: 700;
      font-size: 0.82rem;
      border-radius: 999px;
      padding: 0.5rem 0.95rem;
      cursor: pointer;
      box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 28%, transparent);
    }
    .poster__print:disabled {
      opacity: 0.7;
      cursor: wait;
    }
    .poster__pdf-error {
      flex-basis: 100%;
      margin: 0;
      font-size: 0.8rem;
      color: #8a1f11;
    }
    .poster__phases {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.9rem;
      align-items: start;
    }
    .poster__phase {
      min-width: 0;
      border-radius: 16px;
      background: #fff;
      border: 1px solid color-mix(in srgb, var(--accent) 14%, #e2e8e5);
      box-shadow: 0 10px 26px rgba(20, 32, 24, 0.05);
      overflow: hidden;
    }
    .poster__phase-head {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      padding: 0.65rem 0.8rem;
      background: linear-gradient(
        120deg,
        color-mix(in srgb, var(--accent) 14%, #fff),
        color-mix(in srgb, var(--accent) 5%, #fff)
      );
      border-bottom: 1px solid color-mix(in srgb, var(--accent) 12%, #e8eeeb);
    }
    .poster__phase-mark {
      width: 0.45rem;
      height: 0.45rem;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
      flex-shrink: 0;
    }
    .poster__phase h2 {
      margin: 0;
      font-family: Fraunces, Georgia, serif;
      font-size: clamp(0.98rem, 1.5vw, 1.12rem);
      font-weight: 700;
      line-height: 1.2;
      color: color-mix(in srgb, var(--accent) 72%, #122018);
      letter-spacing: -0.01em;
    }
    .poster__phase-body {
      display: grid;
      gap: 0.65rem;
      padding: 0.7rem;
      background: color-mix(in srgb, var(--accent) 3%, #f7f9f8);
    }
    .poster__cat {
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
      border: 1px solid color-mix(in srgb, var(--accent) 12%, #e6ece9);
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .poster__cat-head {
      padding: 0.4rem 0.65rem;
      background: color-mix(in srgb, var(--accent) 9%, #fff);
      border-bottom: 1px solid color-mix(in srgb, var(--accent) 10%, #edf1ef);
    }
    .poster__cat-head h3 {
      margin: 0;
      font-size: 0.66rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .poster__cat-body {
      display: grid;
      gap: 0.45rem;
      padding: 0.5rem;
    }
    .poster__rule {
      border-radius: 9px;
      padding: 0.5rem 0.6rem 0.55rem;
      background: color-mix(in srgb, var(--accent) 3.5%, #fff);
      border: 1px solid color-mix(in srgb, var(--accent) 8%, #eef2f0);
    }
    .poster__rule h4 {
      margin: 0;
      font-size: 0.92rem;
      line-height: 1.25;
      font-weight: 700;
      color: #152018;
      letter-spacing: -0.01em;
    }
    .poster__rule p {
      margin: 0.28rem 0 0;
      white-space: pre-wrap;
      font-size: 0.78rem;
      line-height: 1.4;
      color: #556169;
      font-weight: 400;
    }

    @media (min-width: 720px) {
      .poster {
        padding: 1.25rem 1.25rem 2.75rem;
      }
      .poster__phases {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
      }
    }

    @media (min-width: 1100px) {
      .poster {
        padding: 1.35rem 1.5rem 3rem;
      }
      .poster__phases {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 1.05rem;
      }
      .poster__hero {
        padding: 0.95rem 1.15rem;
      }
    }

    @media (max-width: 480px) {
      .poster__hero {
        padding: 0.75rem 0.8rem;
      }
      .poster__print {
        width: 100%;
      }
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
      .pdf-chrome {
        display: none !important;
      }
      .poster__phases {
        grid-template-columns: 1fr;
        gap: 0.85rem;
      }
      .poster__hero,
      .poster__phase,
      .poster__cat {
        box-shadow: none;
      }
      .poster__hero {
        border: 1px solid #ddd;
      }
    }
  `,
  host: {
    '[style.--page-accent]': 'accent()',
  },
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
        background: '#f3f5f4',
        hide: '.poster__print, .poster__pdf-error, .pdf-chrome',
        widthPx: 720,
      });
    } catch {
      this.pdfError.set('No se pudo generar el PDF');
    } finally {
      this.printing.set(false);
    }
  }
}
