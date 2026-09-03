import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { map } from 'rxjs';
import { PageHeaderComponent } from '../../shared/components/page-header';
import { NavMenuService } from '../../core/layout/nav-menu.service';
import {
  groupIdFromRoute,
  NAV_GROUP_DEFS,
  navGroupPagePath,
} from '../../core/layout/nav-config';

@Component({
  selector: 'app-nav-group-page',
  imports: [RouterLink, MatIconModule, PageHeaderComponent],
  template: `
    <app-page-header
      helpId="nav-group"
      [title]="title()"
      [subtitle]="subtitle()"
    />

    @if (modules().length) {
      <div class="panel-card home-modules mb-3">
        <div class="home-modules__grid">
          @for (m of modules(); track m.route) {
            <a class="home-module-tile" [routerLink]="m.route">
              <mat-icon class="home-module-tile__icon">{{ m.icon }}</mat-icon>
              <span class="home-module-tile__label">{{ m.label }}</span>
              @if (m.badge && m.badge > 0) {
                <span class="home-module-tile__badge">{{ m.badge > 9 ? '9+' : m.badge }}</span>
              }
            </a>
          }
        </div>
      </div>
    } @else {
      <p class="text-muted">No hay módulos visibles en este grupo.</p>
    }
  `,
  styles: `
    .home-modules__grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.45rem;
    }
    .home-module-tile {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      min-height: 4.5rem;
      padding: 0.55rem 0.35rem;
      border: 1px solid rgba(0, 51, 102, 0.12);
      border-radius: 10px;
      background: #fff;
      color: var(--guy-navy, #003366);
      text-decoration: none;
      font: inherit;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .home-module-tile:hover,
    .home-module-tile:focus-visible {
      background: rgba(0, 51, 102, 0.04);
      border-color: rgba(0, 51, 102, 0.22);
    }
    .home-module-tile__icon {
      font-size: 1.55rem;
      width: 1.55rem;
      height: 1.55rem;
      color: var(--guy-primary, #5c1a1a);
    }
    .home-module-tile__label {
      font-size: 0.8rem;
      font-weight: 600;
      line-height: 1.2;
      text-align: center;
      word-break: break-word;
    }
    .home-module-tile__badge {
      position: absolute;
      top: 0.35rem;
      right: 0.4rem;
      min-width: 1.15rem;
      height: 1.15rem;
      padding: 0 0.28rem;
      border-radius: 999px;
      background: #c62828;
      color: #fff;
      font-size: 0.68rem;
      font-weight: 700;
      line-height: 1.15rem;
      text-align: center;
    }
  `,
})
export class NavGroupPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly navMenu = inject(NavMenuService);

  private readonly groupId = toSignal(
    this.route.paramMap.pipe(map((p) => (p.get('groupId') || '').trim())),
    { initialValue: (this.route.snapshot.paramMap.get('groupId') || '').trim() },
  );

  readonly groupItem = computed(() => {
    const id = this.groupId();
    if (!id) return null;
    const hub = navGroupPagePath(id);
    return (
      this.navMenu.items().find((item) => {
        if (item.defaultRoute === hub) return true;
        return groupIdFromRoute(item.route) === id;
      }) ?? null
    );
  });

  readonly title = computed(() => {
    const item = this.groupItem();
    if (item?.label) return item.label;
    const id = this.groupId();
    return NAV_GROUP_DEFS.find((g) => g.id === id)?.label ?? 'Módulos';
  });

  readonly subtitle = computed(() => 'Elegí un módulo');

  readonly modules = computed(() => this.groupItem()?.children ?? []);

  constructor() {
    const id = this.groupId();
    if (!id) {
      void this.router.navigateByUrl('/');
    }
  }
}
