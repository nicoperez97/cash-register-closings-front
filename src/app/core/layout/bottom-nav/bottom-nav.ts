import {
  Component,
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

  readonly items = input.required<BottomNavItem[]>();
  readonly moreActive = input(false);
  /** Oculta la barra mientras el drawer está abierto (evita pelear con el overlay). */
  readonly sidenavOpen = input(false);
  readonly navigate = output<void>();
  readonly openMore = output<void>();

  constructor() {
    // Montar en <body>: ningún ancestro con transform (Material sidenav) puede
    // convertir position:fixed en “flotante” a mitad de pantalla.
    afterNextRender(() => {
      const el = this.host.nativeElement;
      if (el.parentElement !== document.body) {
        document.body.appendChild(el);
      }
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
}
