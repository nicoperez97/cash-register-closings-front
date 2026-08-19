import { Component, ViewEncapsulation } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { HELP_TOPICS } from '../../core/help/module-help';

@Component({
  selector: 'app-admin-help-page',
  encapsulation: ViewEncapsulation.None,
  imports: [MatButtonModule, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      title="Instrucciones"
      subtitle="Manual completo para administradores"
      actionLabel="Imprimir / PDF"
      actionIcon="picture_as_pdf"
      (action)="print()"
    />

    <p class="help-admin__lead">
      Alcance de cada módulo. El botón del encabezado abre el diálogo de impresión: en el navegador
      elegí “Guardar como PDF”.
    </p>

    <div class="help-admin__doc">
      @for (topic of topics; track topic.id) {
        <section class="help-admin__topic">
          <h2>{{ topic.title }}</h2>
          <p class="help-admin__summary">{{ topic.summary }}</p>
          @for (b of topic.blocks; track b.title) {
            <h3>{{ b.title }}</h3>
            <p>{{ b.body }}</p>
          }
        </section>
      }
    </div>
  `,
  styles: `
    .help-admin__lead {
      margin: 0 0 1rem;
      color: var(--guy-muted, #5f6f76);
    }
    .help-admin__doc {
      background: var(--guy-card, #fff);
      border: 1px solid var(--guy-border, #d7e0d9);
      border-radius: 12px;
      padding: 1.25rem 1.4rem 2rem;
    }
    .help-admin__topic {
      break-inside: avoid;
      margin: 0 0 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--guy-border, #e6ebf0);
    }
    .help-admin__topic:last-child {
      border-bottom: 0;
      margin-bottom: 0;
    }
    .help-admin__topic h2 {
      margin: 0 0 0.25rem;
      font-size: 1.15rem;
      color: var(--guy-navy, #003366);
    }
    .help-admin__topic h3 {
      margin: 0.7rem 0 0.2rem;
      font-size: 0.92rem;
    }
    .help-admin__summary,
    .help-admin__topic p {
      margin: 0;
      line-height: 1.5;
    }
    .help-admin__summary {
      color: var(--guy-muted, #5f6f76);
      font-size: 0.9rem;
    }
    @media print {
      .layout-sidenav,
      app-toolbar,
      app-main-pwa-install-banner,
      app-pull-to-refresh,
      .guy-page-header,
      .help-admin__lead {
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
        border: 0;
        padding: 0;
        box-shadow: none;
        background: #fff;
      }
      .help-admin__topic {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  `,
})
export class AdminHelpPage {
  readonly topics = HELP_TOPICS;

  print(): void {
    window.print();
  }
}
