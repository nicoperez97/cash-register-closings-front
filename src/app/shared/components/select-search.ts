import { AfterViewInit, Component, DestroyRef, ElementRef, inject, input, model, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSelect } from '@angular/material/select';

export function normalizeSelectQuery(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterBySelectQuery<T>(
  items: T[],
  query: string,
  getLabel: (item: T) => string,
  keepIds?: string | Array<string | null | undefined> | null,
): T[] {
  const q = normalizeSelectQuery(query);
  const keep = new Set(
    (Array.isArray(keepIds) ? keepIds : keepIds ? [keepIds] : [])
      .map((id) => id ?? '')
      .filter(Boolean),
  );
  if (!q) return items;
  return items.filter(
    (item) =>
      keep.has(String((item as { id?: string }).id ?? '')) ||
      normalizeSelectQuery(getLabel(item)).includes(q),
  );
}

export function onSelectSearchOpened(
  open: boolean,
  query: { set(value: string): void },
): void {
  if (!open) query.set('');
}

@Component({
  selector: 'app-select-search',
  imports: [FormsModule, MatIconModule],
  template: `
    <div class="select-search" (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation()">
      <mat-icon class="select-search__icon" aria-hidden="true">search</mat-icon>
      <input
        #input
        type="search"
        class="select-search__input"
        [placeholder]="placeholder()"
        [ngModel]="query()"
        (ngModelChange)="query.set($event)"
        autocomplete="off"
        (click)="$event.stopPropagation()"
        (keydown.enter)="$event.preventDefault(); $event.stopPropagation()"
        (keydown.space)="$event.stopPropagation()"
      />
      @if (query()) {
        <button
          type="button"
          class="select-search__clear"
          aria-label="Limpiar búsqueda"
          (click)="clear(); $event.stopPropagation()"
        >
          <mat-icon>close</mat-icon>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .select-search {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      width: 100%;
    }
    .select-search__icon,
    .select-search__clear mat-icon {
      font-size: 1.1rem;
      width: 1.1rem;
      height: 1.1rem;
      color: var(--guy-muted, #5f6f76);
    }
    .select-search__input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      font: inherit;
      font-size: 0.92rem;
      color: inherit;
    }
    .select-search__clear {
      appearance: none;
      display: inline-flex;
      border: 0;
      padding: 0;
      background: transparent;
      cursor: pointer;
      color: inherit;
    }
  `,
})
export class SelectSearchComponent implements AfterViewInit {
  readonly placeholder = input('Buscar…');
  readonly query = model('');
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');
  private readonly matSelect = inject(MatSelect, { optional: true });

  constructor() {
    this.matSelect?.openedChange.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((open) => {
      this.onOpened(open);
    });
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => this.input()?.nativeElement.focus());
  }

  onOpened(opened: boolean): void {
    if (!opened) {
      this.query.set('');
      return;
    }
    queueMicrotask(() => this.input()?.nativeElement.focus());
  }

  clear(): void {
    this.query.set('');
    this.input()?.nativeElement.focus();
  }
}
