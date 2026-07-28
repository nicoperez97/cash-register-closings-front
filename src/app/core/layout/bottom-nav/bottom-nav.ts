import { Component, input, output } from '@angular/core';
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
})
export class BottomNavComponent {
  readonly items = input.required<BottomNavItem[]>();
  readonly moreActive = input(false);
  readonly navigate = output<void>();
  readonly openMore = output<void>();

  onNavClick(): void {
    this.navigate.emit();
  }

  onMoreClick(): void {
    this.openMore.emit();
  }
}
