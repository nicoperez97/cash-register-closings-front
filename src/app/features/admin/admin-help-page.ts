import { Component, ViewEncapsulation, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { HelpBlocksComponent } from '../../shared/components/help-blocks';
import { HELP_TOPICS, HelpTopic, helpTopicIcon } from '../../core/help/module-help';
import { downloadCaptureRootPdf } from '../../shared/pdf/html-pdf';

@Component({
  selector: 'app-admin-help-page',
  encapsulation: ViewEncapsulation.None,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    PageHeaderComponent,
    HelpBlocksComponent,
  ],
  template: `
    <div id="help-pdf-root">
    <app-page-header
      title="Instrucciones"
      subtitle="Manual completo para administradores"
      actionLabel="Descargar PDF"
      actionIcon="picture_as_pdf"
      [actionDisabled]="printing()"
      (action)="downloadPdf()"
    />

    <section class="help-admin__hero">
      <div class="help-admin__hero-icon" aria-hidden="true">
        <mat-icon>menu_book</mat-icon>
      </div>
      <div>
        <p class="help-admin__hero-kicker">Guía de la app</p>
        <p class="help-admin__lead">
          Alcance de cada módulo, en lenguaje de uso diario.
        </p>
      </div>
    </section>

    <div class="help-admin__toolbar pdf-chrome">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="help-admin__search">
        <mat-label>Buscar módulo</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input matInput [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Cierres, normas, stock…" />
      </mat-form-field>
      <p class="help-admin__count">{{ filtered().length }} de {{ topics.length }} módulos</p>
    </div>

    <nav class="help-admin__toc pdf-chrome" aria-label="Módulos">
      @for (topic of filtered(); track topic.id) {
        <a class="help-admin__chip" [href]="'#' + topic.id" (click)="jump($event, topic.id)">
          <mat-icon>{{ icon(topic.id) }}</mat-icon>
          {{ topic.title }}
        </a>
      }
    </nav>

    <div class="help-admin__doc">
      @for (topic of filtered(); track topic.id) {
        <section class="help-admin__topic" [id]="topic.id">
          <header class="help-admin__topic-head">
            <span class="help-admin__topic-icon" aria-hidden="true">
              <mat-icon>{{ icon(topic.id) }}</mat-icon>
            </span>
            <div>
              <h2>{{ topic.title }}</h2>
              <p class="help-admin__summary">{{ topic.summary }}</p>
            </div>
          </header>
          <app-help-blocks [blocks]="topic.blocks" [compact]="true" />
        </section>
      } @empty {
        <p class="help-admin__empty">No hay módulos que coincidan con “{{ query() }}”.</p>
      }
    </div>
    </div>
  `,
  styles: `
    .help-admin__hero {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 1rem;
      align-items: center;
      margin: 0 0 1.1rem;
      padding: 1.05rem 1.15rem;
      border-radius: 16px;
      border: 1px solid var(--guy-border, #d7e0d9);
      background:
        linear-gradient(
          135deg,
          color-mix(in srgb, var(--guy-primary, #1d65a0) 10%, var(--guy-card, #fff)),
          var(--guy-card, #fff) 55%
        );
    }
    .help-admin__hero-icon {
      display: grid;
      place-items: center;
      width: 3rem;
      height: 3rem;
      border-radius: 14px;
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 16%, transparent);
      color: var(--guy-primary, #1d65a0);
    }
    .help-admin__hero-kicker {
      margin: 0 0 0.2rem;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
    }
    .help-admin__lead {
      margin: 0;
      color: var(--guy-text, #1b2a33);
      line-height: 1.5;
    }
    .help-admin__toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem 1rem;
      align-items: center;
      margin: 0 0 0.85rem;
    }
    .help-admin__search {
      flex: 1 1 16rem;
      max-width: 28rem;
    }
    .help-admin__count {
      margin: 0;
      font-size: 0.85rem;
      color: var(--guy-muted, #5f6f76);
    }
    .help-admin__toc {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      margin: 0 0 1.1rem;
    }
    .help-admin__chip {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.32rem 0.7rem 0.32rem 0.45rem;
      border-radius: 999px;
      border: 1px solid var(--guy-border, #d7e0d9);
      background: var(--guy-card, #fff);
      color: var(--guy-navy, #003366);
      text-decoration: none;
      font-size: 0.82rem;
      font-weight: 600;
    }
    .help-admin__chip mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
      color: var(--guy-muted, #5f6f76);
    }
    .help-admin__chip:hover {
      border-color: color-mix(in srgb, var(--guy-primary, #1d65a0) 40%, var(--guy-border, #d7e0d9));
      background: color-mix(in srgb, var(--guy-primary, #1d65a0) 8%, var(--guy-card, #fff));
    }
    .help-admin__doc {
      display: grid;
      gap: 1rem;
    }
    .help-admin__topic {
      break-inside: avoid;
      margin: 0;
      padding: 1.15rem 1.2rem 1.25rem;
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 16px;
      background: var(--guy-card, #fff);
    }
    .help-admin__topic-head {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.8rem;
      align-items: start;
      margin: 0 0 0.9rem;
    }
    .help-admin__topic-icon {
      display: grid;
      place-items: center;
      width: 2.6rem;
      height: 2.6rem;
      border-radius: 12px;
      background: color-mix(in srgb, var(--guy-accent-secondary, #2e7d32) 14%, transparent);
      color: var(--guy-accent-secondary, #2e7d32);
    }
    .help-admin__topic h2 {
      margin: 0 0 0.2rem;
      font-size: 1.15rem;
      letter-spacing: -0.02em;
      color: var(--guy-navy, #003366);
    }
    .help-admin__summary {
      margin: 0;
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
      line-height: 1.45;
    }
    .help-admin__empty {
      margin: 0;
      padding: 1.2rem;
      border-radius: 14px;
      background: var(--guy-card, #fff);
      color: var(--guy-muted, #5f6f76);
    }
    @media print {
      .layout-sidenav,
      app-toolbar,
      app-main-pwa-install-banner,
      app-pull-to-refresh,
      .guy-page-header,
      .help-admin__hero,
      .help-admin__toolbar,
      .help-admin__toc {
        display: none !important;
      }
      .layout-shell,
      .layout-main-scroll,
      .layout-content,
      .mat-sidenav-content,
      .mat-drawer-content {
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }
      .help-admin__doc {
        display: block;
      }
      .help-admin__topic {
        page-break-inside: avoid;
        break-inside: avoid;
        border: 0;
        padding: 0 0 1rem;
        margin: 0 0 1rem;
        box-shadow: none;
        background: #fff;
      }
    }
  `,
})
export class AdminHelpPage {
  readonly topics = HELP_TOPICS;
  readonly query = signal('');
  readonly printing = signal(false);
  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.topics;
    return this.topics.filter((t) => this.matches(t, q));
  });

  icon(id: string): string {
    return helpTopicIcon(id);
  }

  async downloadPdf(): Promise<void> {
    if (this.printing()) return;
    const prev = this.query();
    this.query.set('');
    this.printing.set(true);
    try {
      await new Promise((r) => window.setTimeout(r, 40));
      await downloadCaptureRootPdf('help-pdf-root', 'instrucciones.pdf', {
        hide: '.guy-page-header__action, .pdf-chrome',
      });
    } finally {
      this.query.set(prev);
      this.printing.set(false);
    }
  }

  jump(ev: Event, id: string): void {
    ev.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private matches(topic: HelpTopic, q: string): boolean {
    if (topic.title.toLowerCase().includes(q) || topic.summary.toLowerCase().includes(q)) return true;
    return topic.blocks.some(
      (b) => b.title.toLowerCase().includes(q) || b.body.toLowerCase().includes(q),
    );
  }
}
