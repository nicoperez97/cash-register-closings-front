import {
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

export interface BottomNavItem {
  label: string;
  route: string;
  icon: string;
  exact?: boolean;
}

@Component({
  selector: 'app-bottom-nav',
  imports: [RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.scss',
  host: {
    class: 'bottom-nav-host',
    '[class.bottom-nav-host--hidden]': 'sidenavOpen()',
    '[attr.aria-hidden]': 'sidenavOpen() ? "true" : null',
  },
})
export class BottomNavComponent implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  readonly items = input.required<BottomNavItem[]>();
  readonly moreActive = input(false);
  /** Oculta la barra mientras el drawer está abierto (evita pelear con el overlay). */
  readonly sidenavOpen = input(false);
  readonly navigate = output<void>();
  readonly openMore = output<void>();

  private readonly onPin = () => this.pinToVisualViewport();
  private pinRaf = 0;

  constructor() {
    // Montar en <body>: ningún ancestro con transform (Material sidenav)
    // puede convertir position:fixed en “flotante” a mitad de pantalla.
    afterNextRender(() => {
      this.ensureOnBody();
      this.pinToVisualViewport();
      this.bindViewportPin();
    });

    this.destroyRef.onDestroy(() => {
      this.unbindViewportPin();
      if (this.pinRaf) cancelAnimationFrame(this.pinRaf);
    });
  }

  ngOnDestroy(): void {
    this.host.nativeElement.remove();
  }

  onNavClick(): void {
    this.navigate.emit();
  }

  onMoreClick(): void {
    this.openMore.emit();
  }

  private ensureOnBody(): void {
    const el = this.host.nativeElement;
    if (!el.isConnected) return;
    if (el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
    // Evitar duplicados si el layout se re-crea sin destroy limpio.
    document.querySelectorAll('app-bottom-nav.bottom-nav-host').forEach((node) => {
      if (node !== el && node.parentElement === document.body) {
        node.remove();
      }
    });
  }

  /**
   * iOS/PWA: tras update + scroll, fixed+bottom:0 queda desfasado del viewport visible.
   * Anclamos al borde inferior del visualViewport (no al layout viewport).
   */
  private pinToVisualViewport(): void {
    const el = this.host.nativeElement;
    if (!el.isConnected) return;

    el.style.setProperty('position', 'fixed', 'important');
    el.style.setProperty('left', '0px', 'important');
    el.style.setProperty('right', '0px', 'important');
    el.style.setProperty('width', '100%', 'important');
    el.style.setProperty('transform', 'none', 'important');
    el.style.setProperty('margin', '0', 'important');

    const vv = window.visualViewport;
    if (!vv) {
      el.style.setProperty('top', 'auto', 'important');
      el.style.setProperty('bottom', '0px', 'important');
      return;
    }

    const height = el.getBoundingClientRect().height || 56;
    const top = Math.round(vv.offsetTop + vv.height - height);
    el.style.setProperty('bottom', 'auto', 'important');
    el.style.setProperty('top', `${top}px`, 'important');
  }

  private schedulePin(): void {
    if (this.pinRaf) cancelAnimationFrame(this.pinRaf);
    this.pinRaf = requestAnimationFrame(() => {
      this.pinRaf = 0;
      this.ensureOnBody();
      this.pinToVisualViewport();
    });
  }

  private bindViewportPin(): void {
    const vv = window.visualViewport;
    vv?.addEventListener('resize', this.onPin);
    vv?.addEventListener('scroll', this.onPin);
    window.addEventListener('resize', this.onPin);
    window.addEventListener('orientationchange', this.onPin);
    window.addEventListener('scroll', this.onPin, { passive: true, capture: true });
    window.addEventListener('pageshow', this.onPin);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private unbindViewportPin(): void {
    const vv = window.visualViewport;
    vv?.removeEventListener('resize', this.onPin);
    vv?.removeEventListener('scroll', this.onPin);
    window.removeEventListener('resize', this.onPin);
    window.removeEventListener('orientationchange', this.onPin);
    window.removeEventListener('scroll', this.onPin, true);
    window.removeEventListener('pageshow', this.onPin);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible') this.schedulePin();
  };
}
