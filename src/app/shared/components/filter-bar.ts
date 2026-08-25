import { Component, input, model } from '@angular/core';

export type FilterOption<T extends string = string> = {
  id: T;
  label: string;
};

@Component({
  selector: 'app-segment-tabs',
  template: `
    <nav
      class="seg-tabs"
      [class.seg-tabs--fill]="fill()"
      role="tablist"
      [attr.aria-label]="ariaLabel()"
    >
      @for (opt of options(); track opt.id) {
        <button
          type="button"
          class="seg-tabs__btn"
          role="tab"
          [class.seg-tabs__btn--on]="value() === opt.id"
          [attr.aria-selected]="value() === opt.id"
          (click)="value.set(opt.id)"
        >
          {{ opt.label }}
        </button>
      }
    </nav>
  `,
  styles: `
    :host {
      display: block;
    }
    .seg-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      padding: 0.28rem;
      width: fit-content;
      max-width: 100%;
      border-radius: 14px;
      background: color-mix(in srgb, var(--guy-navy, #003366) 5%, var(--guy-card, #fff));
      border: 1px solid var(--guy-border, #d7e0d9);
    }
    .seg-tabs--fill {
      display: grid;
      width: 100%;
      grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
    }
    .seg-tabs__btn {
      border: 0;
      background: transparent;
      color: var(--guy-muted, #5f6f76);
      border-radius: 11px;
      padding: 0.55rem 0.85rem;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .seg-tabs__btn--on {
      background: var(--guy-card, #fff);
      color: var(--guy-navy, #003366);
      box-shadow: 0 1px 3px rgba(0, 30, 50, 0.08);
    }
  `,
})
export class SegmentTabsComponent<T extends string = string> {
  readonly options = input.required<FilterOption<T>[]>();
  readonly value = model.required<T>();
  readonly ariaLabel = input('Secciones');
  readonly fill = input(false);
}

@Component({
  selector: 'app-filter-chips',
  template: `
    <div class="filter-chips">
      @if (label()) {
        <span class="filter-chips__label">{{ label() }}</span>
      }
      @for (opt of options(); track opt.id) {
        <button
          type="button"
          class="filter-chips__chip"
          [class.filter-chips__chip--on]="value() === opt.id"
          (click)="value.set(opt.id)"
        >
          {{ opt.label }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }
    .filter-chips {
      display: contents;
    }
    .filter-chips__label {
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--guy-muted, #5f6f76);
      margin-left: 0.15rem;
    }
    .filter-chips__chip {
      border: 1px solid var(--guy-border, #d7e0d9);
      background: var(--guy-card, #fff);
      color: var(--guy-text, #1b2a33);
      border-radius: 999px;
      padding: 0.28rem 0.75rem;
      font: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
    }
    .filter-chips__chip--on {
      border-color: var(--guy-green, #2e7d32);
      color: var(--guy-green, #2e7d32);
      background: color-mix(in srgb, var(--guy-green, #2e7d32) 10%, #fff);
    }
  `,
})
export class FilterChipsComponent<T extends string = string> {
  readonly options = input.required<FilterOption<T>[]>();
  readonly value = model.required<T>();
  readonly label = input('');
}
