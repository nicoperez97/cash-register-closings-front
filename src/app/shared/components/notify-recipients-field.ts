import { Component, OnInit, computed, inject, input, model, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ClosingsApiService, ShopNotifyRecipient } from '../../features/closings/closings-api.service';
import { SpinnerComponent } from './spinner';

@Component({
  selector: 'app-notify-recipients-field',
  imports: [MatButtonModule, MatCheckboxModule, SpinnerComponent],
  template: `
    <div class="notify-field">
      <label class="notify-field__enable">
        <mat-checkbox
          [checked]="enabled()"
          (change)="toggleEnabled($event.checked)"
        ></mat-checkbox>
        <span>
          <strong>{{ enabledLabel() }}</strong>
          <small>{{ hint() }}</small>
        </span>
      </label>

      @if (enabled()) {
        @if (loading()) {
          <div class="notify-field__loading">
            <app-spinner label="Cargando personas…" />
            <span>Cargando personas…</span>
          </div>
        } @else if (!visiblePeople().length) {
          <p class="notify-field__empty">No hay a quién avisarle en este local.</p>
        } @else {
          <div class="notify-field__toolbar">
            <button mat-button type="button" (click)="selectAdmins()">Todos los admins</button>
            <button mat-button type="button" (click)="clearAll()">Quitar todos</button>
            <span class="notify-field__meta"
              >{{ selectedIds().length }} de {{ visiblePeople().length }}</span
            >
          </div>
          <ul class="notify-field__list">
            @for (person of visiblePeople(); track person.id) {
              <li>
                <mat-checkbox
                  [checked]="isSelected(person.id)"
                  (change)="toggle(person.id)"
                >
                  <span class="notify-field__name">{{ person.fullName }}</span>
                  @if (person.isAdmin) {
                    <span class="notify-field__badge">Admin</span>
                  }
                  <span class="notify-field__email">{{ person.email }}</span>
                </mat-checkbox>
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
  styles: `
    .notify-field {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      margin: 0.15rem 0 0.25rem;
    }
    .notify-field__enable {
      display: flex;
      align-items: flex-start;
      gap: 0.35rem;
      cursor: pointer;
    }
    .notify-field__enable span {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      padding-top: 0.2rem;
    }
    .notify-field__enable strong {
      font-size: 0.9rem;
      font-weight: 650;
    }
    .notify-field__enable small {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant, #5f6368);
    }
    .notify-field__loading,
    .notify-field__empty {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
      color: var(--mat-sys-on-surface-variant, #5f6368);
      font-size: 0.85rem;
    }
    .notify-field__toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.15rem 0.35rem;
    }
    .notify-field__meta {
      margin-left: auto;
      font-size: 0.8rem;
      color: var(--mat-sys-on-surface-variant, #5f6368);
    }
    .notify-field__list {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 14rem;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }
    .notify-field__name {
      font-weight: 500;
    }
    .notify-field__badge {
      display: inline-block;
      margin-left: 0.35rem;
      padding: 0.05rem 0.35rem;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 650;
      background: color-mix(in srgb, var(--mat-sys-primary, #1d65a0) 12%, transparent);
      color: var(--mat-sys-primary, #1d65a0);
    }
    .notify-field__email {
      display: block;
      font-size: 0.78rem;
      color: var(--mat-sys-on-surface-variant, #5f6368);
    }
  `,
})
export class NotifyRecipientsFieldComponent implements OnInit {
  private readonly closingsApi = inject(ClosingsApiService);

  readonly shopId = input.required<string>();
  readonly excludeUserId = input<string | null>(null);
  readonly enabledLabel = input('Enviar aviso');
  readonly hint = input('Aviso en la app y por mail a las personas que marques.');
  readonly enabled = model(false);
  readonly selectedIds = model<string[]>([]);

  readonly loading = signal(false);
  readonly people = signal<ShopNotifyRecipient[]>([]);

  readonly visiblePeople = computed(() => {
    const exclude = this.excludeUserId();
    return this.people().filter((p) => p.id !== exclude);
  });

  ngOnInit(): void {
    const shopId = this.shopId();
    if (!shopId) return;
    this.loading.set(true);
    this.closingsApi.shopNotificationRecipients(shopId).subscribe({
      next: (rows) => {
        this.people.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  toggleEnabled(on: boolean): void {
    this.enabled.set(on);
    if (on) this.selectAdmins();
    else this.selectedIds.set([]);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggle(id: string): void {
    const cur = this.selectedIds();
    this.selectedIds.set(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  }

  selectAdmins(): void {
    this.selectedIds.set(
      this.visiblePeople()
        .filter((p) => p.isAdmin)
        .map((p) => p.id),
    );
  }

  clearAll(): void {
    this.selectedIds.set([]);
  }
}
