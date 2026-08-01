import {
  Component,
  DestroyRef,
  OnInit,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SpinnerComponent } from './spinner';

const THRESHOLD_PX = 72;
const MAX_PULL_PX = 120;
const RESISTANCE = 0.45;

@Component({
  selector: 'app-pull-to-refresh',
  imports: [MatIconModule, SpinnerComponent],
  template: `
    <div
      class="ptr"
      [class.ptr--visible]="pullDistance() > 0 || refreshing() || pending()"
      [class.ptr--ready]="ready()"
      [class.ptr--refreshing]="refreshing() || pending()"
      [style.height.px]="indicatorHeight()"
      aria-hidden="true"
    >
      <div class="ptr-inner">
        @if (refreshing() || pending()) {
          <app-spinner [size]="20" tone="accent" />
        } @else {
          <mat-icon>{{ ready() ? 'refresh' : 'arrow_downward' }}</mat-icon>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        pointer-events: none;
      }

      .ptr {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        overflow: hidden;
        height: 0;
        transition: height 0.18s ease;
        color: var(--guy-navy, #003366);
      }

      .ptr--visible {
        transition: none;
      }

      .ptr--refreshing {
        transition: height 0.18s ease;
      }

      .ptr-inner {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        margin-bottom: 4px;
        border-radius: 50%;
        background: var(--guy-card, #fff);
        box-shadow: var(--guy-shadow, 0 8px 24px rgba(0, 51, 102, 0.08));
        transform: scale(0.85);
        opacity: 0.85;
        transition:
          transform 0.15s ease,
          opacity 0.15s ease,
          background 0.15s ease;
      }

      .ptr--ready .ptr-inner {
        transform: scale(1);
        opacity: 1;
        background: var(--guy-green-soft, #e8f5e9);
        color: var(--guy-green, #2e7d32);
      }

      .ptr--refreshing .ptr-inner {
        transform: scale(1);
        opacity: 1;
      }

      .ptr mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    `,
  ],
})
export class PullToRefreshComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  /** Solo activo en móvil / touch. */
  readonly enabled = input(true);
  /** Bloquea el gesto (offline, sync en curso, etc.). */
  readonly disabled = input(false);
  /** Sync en curso: mantiene el indicador visible. */
  readonly refreshing = input(false);

  readonly refresh = output<void>();

  readonly pullDistance = signal(0);
  /** Entre el gesto y el momento en que el padre marca syncing. */
  readonly pending = signal(false);
  private wasRefreshing = false;

  readonly ready = () => this.pullDistance() >= THRESHOLD_PX;

  readonly indicatorHeight = () => {
    if (this.refreshing() || this.pending()) return 56;
    return Math.min(this.pullDistance(), MAX_PULL_PX);
  };

  private tracking = false;
  private startY = 0;
  private pulling = false;

  constructor() {
    effect(() => {
      const refreshing = this.refreshing();
      if (refreshing) {
        this.wasRefreshing = true;
        this.pending.set(false);
        return;
      }
      if (this.wasRefreshing) {
        this.wasRefreshing = false;
        this.pending.set(false);
        this.pullDistance.set(0);
      }
    });
  }

  ngOnInit(): void {
    if (typeof window === 'undefined') return;

    const onStart = (e: TouchEvent) => this.onTouchStart(e);
    const onMove = (e: TouchEvent) => this.onTouchMove(e);
    const onEnd = () => this.onTouchEnd();

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    });
  }

  private canStart(e?: TouchEvent): boolean {
    if (!this.enabled() || this.disabled() || this.refreshing() || this.pending()) {
      return false;
    }
    // No interferir con gestos dentro del sidenav / overlays.
    if (e && this.isInsideScrollTrap(e.target)) {
      return false;
    }
    return this.isAtScrollTop();
  }

  private isInsideScrollTrap(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return !!target.closest(
      '.mat-drawer, .mat-sidenav, .layout-sidenav, .sidebar-nav, [data-scroll-trap]',
    );
  }

  private isAtScrollTop(): boolean {
    if (this.scrollTop() > 0) return false;
    // Si algún contenedor interno (tabla, etc.) está scrolleado, no tirar refresh.
    const el = document.elementFromPoint(
      Math.min(window.innerWidth / 2, window.innerWidth - 1),
      Math.min(80, window.innerHeight - 1),
    );
    let node: Element | null = el;
    while (node && node !== document.body) {
      if (node instanceof HTMLElement) {
        const style = window.getComputedStyle(node);
        const oy = style.overflowY;
        if (
          (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
          node.scrollTop > 0
        ) {
          return false;
        }
      }
      node = node.parentElement;
    }
    return true;
  }

  private scrollTop(): number {
    return (
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    );
  }

  private onTouchStart(e: TouchEvent): void {
    if (!this.canStart(e) || e.touches.length !== 1) {
      this.tracking = false;
      return;
    }
    this.tracking = true;
    this.pulling = false;
    this.startY = e.touches[0].clientY;
    this.pullDistance.set(0);
  }

  private onTouchMove(e: TouchEvent): void {
    if (!this.tracking || e.touches.length !== 1) return;
    if (this.disabled() || this.refreshing() || this.isInsideScrollTrap(e.target)) {
      this.reset();
      return;
    }

    const delta = e.touches[0].clientY - this.startY;
    if (delta <= 0 || !this.isAtScrollTop()) {
      if (this.pulling) {
        e.preventDefault();
        this.pullDistance.set(0);
      }
      this.pulling = false;
      return;
    }

    this.pulling = true;
    e.preventDefault();
    const resisted = Math.min(delta * RESISTANCE, MAX_PULL_PX);
    this.pullDistance.set(resisted);
  }

  private onTouchEnd(): void {
    if (!this.tracking) return;

    const shouldRefresh = this.pulling && this.pullDistance() >= THRESHOLD_PX;
    this.tracking = false;
    this.pulling = false;

    if (shouldRefresh && !this.disabled() && !this.refreshing()) {
      this.pending.set(true);
      this.pullDistance.set(THRESHOLD_PX);
      this.refresh.emit();
      window.setTimeout(() => {
        if (!this.refreshing() && this.pending()) {
          this.pending.set(false);
          this.pullDistance.set(0);
        }
      }, 10_000);
    } else {
      this.pullDistance.set(0);
    }
  }

  private reset(): void {
    this.tracking = false;
    this.pulling = false;
    this.pullDistance.set(0);
  }
}

