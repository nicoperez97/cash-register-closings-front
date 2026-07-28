import { Component, Input } from '@angular/core';
import { PageHeaderComponent } from '../../shared/components/page-header';

@Component({
  selector: 'app-docs-shell',
  imports: [PageHeaderComponent],
  template: `
    <app-page-header [title]="title" [subtitle]="subtitle" />
    <div class="panel-card mb-3">
      <p class="mb-0">{{ description }}</p>
    </div>
    <ng-content />
  `,
})
export class DocsShellComponent {
  @Input({ required: true }) title!: string;
  @Input() subtitle = '';
  @Input() description = '';
}
