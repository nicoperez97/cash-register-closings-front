import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ShopContextService } from '../../core/shop/shop-context.service';
import { DialogTitleService } from '../../shared/services/dialog-title.service';
import { ReservationRow, ReservationsApiService } from './reservations-api.service';
import { ReservationsInboxService } from './reservations-inbox.service';
import { isActiveReservationStatus } from './reservation-status';
import {
  ReservationEditDialogComponent,
  ReservationEditDialogData,
} from './reservation-edit-dialog';
import { copyTextNow, emailFromNotes, igConfirmMessage } from './reservation-messaging.util';

@Component({
  selector: 'app-reservation-floor-list',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  template: `
    <div class="floor-stats">
      <div class="floor-stat">
        <strong>{{ reservationGuests() }}</strong>
        <span>comensales</span>
      </div>
      <div class="floor-stat">
        <strong>{{ reservationInside() }}</strong>
        <span>adentro</span>
      </div>
      <div class="floor-stat">
        <strong>{{ reservationOutside() }}</strong>
        <span>afuera</span>
      </div>
    </div>

    <ul class="floor-list">
      @for (r of activeReservations(); track r.id) {
        <li
          class="floor-card"
          [attr.id]="'reservation-' + r.id"
          [class.floor-card--out]="r.area === 'OUTSIDE'"
          [class.floor-card--seated]="r.status === 'SEATED'"
          [class.floor-card--new]="highlightedId() === r.id"
        >
          <div class="floor-card__main">
            <strong>
              @if (r.number) {
                <span class="floor-num">#{{ r.number }}</span>
              }
              {{ r.guestName || 'Reserva' }}
              @if (r.tableNumber) {
                <span class="floor-badge">Mesa {{ r.tableNumber }}</span>
              }
              @if (r.status === 'SEATED') {
                <span class="floor-badge">Marcada</span>
              }
            </strong>
            <span>
              {{ r.partySize }} pers.
              · {{ r.area === 'OUTSIDE' ? 'Afuera' : 'Adentro' }}
              @if (r.reservationTime) {
                · {{ r.reservationTime }}
              }
            </span>
            @if (r.notes?.trim()) {
              <span class="floor-card__note">{{ r.notes }}</span>
            }
            @if (guestEmailOf(r); as mail) {
              <span class="floor-card__note">{{ mail }}</span>
            }
          </div>
          @if (canManage()) {
            <div class="floor-card__actions">
              <button
                type="button"
                class="req-copy"
                matTooltip="Copiar mensaje de confirmación"
                (click)="copyReservationMessage(r)"
              >
                <mat-icon>content_copy</mat-icon>
                Copiar
              </button>
              @if (instagramFromNotes(r.notes); as ig) {
                <button
                  type="button"
                  class="req-ig"
                  matTooltip="Abrir perfil de Instagram"
                  (click)="openReservationInstagram(r)"
                >
                  <mat-icon>photo_camera</mat-icon>
                  IG
                </button>
              }
              @if (r.status === 'CONFIRMED') {
                <button mat-stroked-button type="button" (click)="markReservation(r, true)">
                  Marcar
                </button>
              }
              @if (r.status === 'SEATED') {
                <button mat-stroked-button type="button" (click)="markReservation(r, false)">
                  Desmarcar
                </button>
              }
              <button
                mat-icon-button
                type="button"
                matTooltip="Editar reserva"
                aria-label="Editar reserva"
                (click)="editReservation(r)"
              >
                <mat-icon>edit</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                aria-label="Eliminar"
                (click)="deleteReservation(r)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          }
        </li>
      } @empty {
        <li class="floor-empty">Sin reservas para este día</li>
      }
    </ul>
  `,
  styleUrl: './reservation-floor-list.scss',
})
export class ReservationFloorListComponent {
  private readonly api = inject(ReservationsApiService);
  private readonly inbox = inject(ReservationsInboxService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly dialogTitle = inject(DialogTitleService);
  private readonly shops = inject(ShopContextService);

  readonly reservations = input<ReservationRow[]>([]);
  readonly canManage = input(false);
  readonly highlightedId = input<string | null>(null);

  readonly changed = output<void>();

  readonly activeReservations = computed(() =>
    this.reservations().filter((r) => isActiveReservationStatus(r.status)),
  );

  readonly reservationGuests = computed(() =>
    this.activeReservations().reduce((s, r) => s + Number(r.partySize || 0), 0),
  );

  readonly reservationInside = computed(() =>
    this.activeReservations()
      .filter((r) => r.area !== 'OUTSIDE')
      .reduce((s, r) => s + Number(r.partySize || 0), 0),
  );

  readonly reservationOutside = computed(() =>
    this.activeReservations()
      .filter((r) => r.area === 'OUTSIDE')
      .reduce((s, r) => s + Number(r.partySize || 0), 0),
  );

  guestEmailOf(r: ReservationRow): string | null {
    return r.guestEmail?.trim() || emailFromNotes(r.notes);
  }

  instagramFromNotes(notes?: string | null): { handle: string; url: string; dmUrl: string } | null {
    const m = String(notes ?? '').match(/(?:^|[\s·])@([A-Za-z0-9._]{1,30})\b/);
    const handle = m?.[1]?.replace(/\.+$/, '');
    if (!handle) return null;
    return {
      handle,
      url: `https://www.instagram.com/${handle}/`,
      dmUrl: `https://www.instagram.com/${handle}/`,
    };
  }

  copyReservationMessage(r: ReservationRow): void {
    const copied = copyTextNow(this.reservationConfirmText(r));
    this.snack.open(
      copied ? 'Mensaje copiado' : 'No se pudo copiar. Intentá de nuevo',
      'OK',
      { duration: 2500 },
    );
  }

  openReservationInstagram(r: ReservationRow): void {
    const ig = this.instagramFromNotes(r.notes);
    if (!ig) return;
    copyTextNow(this.reservationConfirmText(r));
    window.open(ig.dmUrl, '_blank', 'noopener');
  }

  markReservation(row: ReservationRow, marked: boolean): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage()) return;
    const status = marked ? 'SEATED' : 'CONFIRMED';
    this.api.updateReservation(shopId, row.id, { status }).subscribe({
      next: () => {
        this.inbox.refresh();
        this.changed.emit();
        this.snack.open(
          marked
            ? `${row.guestName || 'Reserva'} marcada`
            : `${row.guestName || 'Reserva'} desmarcada`,
          'OK',
          { duration: 2000 },
        );
      },
      error: () => this.snack.open('No se pudo actualizar', 'OK', { duration: 3000 }),
    });
  }

  deleteReservation(row: ReservationRow): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage()) return;
    this.api.removeReservation(shopId, row.id).subscribe({
      next: () => {
        this.inbox.refresh();
        this.changed.emit();
        this.snack.open('Reserva eliminada', 'OK', { duration: 2000 });
      },
      error: () => this.snack.open('No se pudo eliminar', 'OK', { duration: 3000 }),
    });
  }

  editReservation(row: ReservationRow): void {
    const shopId = this.shops.selectedShopId();
    if (!shopId || !this.canManage()) return;
    this.dialogTitle
      .track(
        this.dialog.open(ReservationEditDialogComponent, {
          width: '520px',
          maxWidth: '96vw',
          panelClass: 'guy-dialog',
          data: { shopId, reservation: row } satisfies ReservationEditDialogData,
        }),
        'Editar reserva',
      )
      .afterClosed()
      .subscribe((ok) => {
        if (ok) this.changed.emit();
      });
  }

  private reservationConfirmText(r: ReservationRow): string {
    const iso = r.businessDate?.slice(0, 10) ?? '';
    const [y, m, d] = iso.split('-');
    const label = d && m ? `${d}/${m}${y ? `/${y}` : ''}` : iso;
    const when = r.reservationTime ? `${label} · ${r.reservationTime}` : label;
    const shop = this.shops.selectedShop()?.name ?? 'el local';
    return igConfirmMessage(
      {
        guestName: r.guestName || 'Reserva',
        partySize: r.partySize,
        when,
        area: r.area === 'OUTSIDE' ? 'Afuera' : 'Adentro',
        accepted: true,
      },
      shop,
    );
  }
}
