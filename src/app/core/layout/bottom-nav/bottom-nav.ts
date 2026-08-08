import {
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  input,
  output,
  signal,
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
    '[class.bottom-nav-host--hidden]': 'sidenavOpen() || keyboardOpen()',
    '[attr.aria-hidden]': 'sidenavOpen() || keyboardOpen() ? "true" : null',
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

  /** iOS/Android: teclado abierto → ocultar (evita la barra flotando a mitad de pantalla). */
  readonly keyboardOpen = signal(false);

  private syncRaf = 0;

  constructor() {
    // Montar en <body>: ningún ancestro con transform (Material sidenav)
    // puede convertir position:fixed en “flotante” a mitad de pantalla.
    afterNextRender(() => {
      this.ensureOnBody();
      this.clearInlinePin();
      this.syncKeyboardState();
      this.bindListeners();
    });

    this.destroyRef.onDestroy(() => {
      this.unbindListeners();
      if (this.syncRaf) cancelAnimationFrame(this.syncRaf);
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
    document.querySelectorAll('app-bottom-nav.bottom-nav-host').forEach((node) => {
      if (node !== el && node.parentElement === document.body) {
        node.remove();
      }
    });
  }

  /** Quita el pin JS viejo (top calculado) que dejaba la barra trabada. */
  private clearInlinePin(): void {
    const el = this.host.nativeElement;
    el.style.removeProperty('top');
    el.style.removeProperty('bottom');
    el.style.removeProperty('left');
    el.style.removeProperty('right');
    el.style.removeProperty('width');
    el.style.removeProperty('position');
    el.style.removeProperty('transform');
    el.style.removeProperty('margin');
  }

  private syncKeyboardState(): void {
    const vv = window.visualViewport;
    if (!vv) {
      this.keyboardOpen.set(false);
      return;
    }
    // Cuando el teclado abre, el visualViewport se achica respecto al layout.
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    this.keyboardOpen.set(covered > 100);
  }

  private scheduleSync(): void {
    if (this.syncRaf) cancelAnimationFrame(this.syncRaf);
    this.syncRaf = requestAnimationFrame(() => {
      this.syncRaf = 0;
      this.ensureOnBody();
      this.clearInlinePin();
      this.syncKeyboardState();
    });
  }

  private readonly onViewport = (): void => this.scheduleSync();

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible') this.scheduleSync();
  };

  private bindListeners(): void {
    const vv = window.visualViewport;
    vv?.addEventListener('resize', this.onViewport);
    vv?.addEventListener('scroll', this.onViewport);
    window.addEventListener('resize', this.onViewport);
    window.addEventListener('orientationchange', this.onViewport);
    window.addEventListener('pageshow', this.onViewport);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('focusin', this.onViewport);
    window.addEventListener('focusout', this.onViewport);
  }

  private unbindListeners(): void {
    const vv = window.visualViewport;
    vv?.removeEventListener('resize', this.onViewport);
    vv?.removeEventListener('scroll', this.onViewport);
    window.removeEventListener('resize', this.onViewport);
    window.removeEventListener('orientationchange', this.onViewport);
    window.removeEventListener('pageshow', this.onViewport);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('focusin', this.onViewport);
    window.removeEventListener('focusout', this.onViewport);
  }
}
