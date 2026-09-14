import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import {
  DeliveryZoneGeo,
  GeocodeHit,
  LatLng,
  findZoneAtPoint,
  geocodeAddress,
  reverseGeocode,
  zoneColor,
  zonesMapCenter,
} from './delivery-geo.util';
import { orderingMoney } from './ordering-ui.util';

export type DeliveryMapSelection = {
  point: LatLng;
  zone: DeliveryZoneGeo | null;
  street: string;
  number: string;
  label: string;
};

@Component({
  selector: 'app-delivery-map-picker',
  imports: [FormsModule],
  template: `
    <div class="dmp" [style.--accent]="accent()" [style.--on-accent]="onAccent()">
      <header class="dmp__top">
        <button type="button" class="dmp__back" (click)="closed.emit()" aria-label="Cerrar mapa">‹</button>
        <label class="dmp__search">
          <input
            type="search"
            [(ngModel)]="query"
            (ngModelChange)="onQuery($event)"
            placeholder="Buscar dirección…"
            autocomplete="street-address"
          />
        </label>
        <button
          type="button"
          class="dmp__locate"
          (click)="requestCurrentLocation(true)"
          [disabled]="locating()"
          aria-label="Usar mi ubicación"
          title="Usar mi ubicación"
        >
          {{ locating() ? '…' : '◎' }}
        </button>
      </header>

      @if (locationHint(); as hint) {
        <p class="dmp__hint" role="status">{{ hint }}</p>
      }

      @if (hits().length) {
        <ul class="dmp__hits">
          @for (h of hits(); track h.label) {
            <li>
              <button type="button" (click)="pickHit(h)">{{ h.label }}</button>
            </li>
          }
        </ul>
      }

      <div class="dmp__map-wrap">
        <div #mapHost class="dmp__map" role="application" aria-label="Mapa de entrega"></div>
        <div class="dmp__pin" aria-hidden="true">📍</div>
      </div>

      <footer class="dmp__foot">
        @if (activeZone(); as z) {
          <div class="dmp__badge">
            {{ z.name }} · Envío: {{ feeLabel(z.fee) }}
          </div>
        } @else if (zonesWithPolygon()) {
          <div class="dmp__badge dmp__badge--warn">Fuera de zona de entrega</div>
        }
        <button
          type="button"
          class="dmp__confirm"
          [disabled]="busy() || locating() || (zonesWithPolygon() && !activeZone())"
          (click)="confirm()"
        >
          @if (locating()) {
            Ubicando…
          } @else if (busy()) {
            Confirmando…
          } @else {
            Seleccionar esta ubicación
          }
        </button>
      </footer>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .dmp {
        display: grid;
        gap: 0.55rem;
        padding: 0.65rem;
        border-radius: 16px;
        border: 1px solid color-mix(in srgb, var(--accent, #2e7d32) 22%, #d5dcd2);
        background: #fff;
        color: #122018;
        font-family: Figtree, system-ui, sans-serif;
        box-shadow: 0 8px 22px rgba(28, 40, 30, 0.06);
      }
      .dmp__top {
        position: relative;
        z-index: 2;
        display: flex;
        gap: 0.4rem;
        align-items: center;
      }
      .dmp__back,
      .dmp__locate {
        width: 2.4rem;
        height: 2.4rem;
        border: 1px solid #d7e0d9;
        border-radius: 12px;
        background: #fff;
        font-size: 1.25rem;
        cursor: pointer;
        color: var(--accent, #2e7d32);
        font-weight: 800;
        flex-shrink: 0;
      }
      .dmp__locate:disabled {
        opacity: 0.55;
        cursor: wait;
      }
      .dmp__search {
        flex: 1;
        min-width: 0;
      }
      .dmp__search input {
        width: 100%;
        box-sizing: border-box;
        height: 2.4rem;
        border: 1px solid #d7e0d9;
        border-radius: 999px;
        padding: 0 0.9rem;
        font: inherit;
        background: #fff;
      }
      .dmp__hint {
        margin: 0;
        padding: 0.45rem 0.7rem;
        border-radius: 10px;
        background: color-mix(in srgb, var(--accent, #2e7d32) 10%, #fff);
        border: 1px solid color-mix(in srgb, var(--accent, #2e7d32) 22%, #d7e0d9);
        font-size: 0.8rem;
        font-weight: 650;
        color: #1a221c;
      }
      .dmp__hits {
        position: relative;
        z-index: 3;
        margin: 0;
        padding: 0.3rem;
        list-style: none;
        background: #fff;
        border: 1px solid #d7e0d9;
        border-radius: 12px;
        max-height: 10rem;
        overflow: auto;
      }
      .dmp__hits button {
        width: 100%;
        border: 0;
        background: transparent;
        text-align: left;
        padding: 0.55rem 0.65rem;
        font: inherit;
        font-size: 0.86rem;
        border-radius: 8px;
        cursor: pointer;
        color: #1a221c;
      }
      .dmp__hits button:hover {
        background: #f3f6f4;
      }
      .dmp__map-wrap {
        position: relative;
        height: min(52dvh, 22rem);
        min-height: 14rem;
        border-radius: 14px;
        overflow: hidden;
        border: 1px solid #d7e0d9;
        background: #e8ece8;
      }
      .dmp__map {
        position: absolute;
        inset: 0;
        z-index: 1;
      }
      .dmp__pin {
        position: absolute;
        left: 50%;
        top: 50%;
        z-index: 3;
        transform: translate(-50%, -100%);
        font-size: 1.85rem;
        pointer-events: none;
        filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.35));
      }
      .dmp__foot {
        display: grid;
        gap: 0.45rem;
      }
      .dmp__badge {
        justify-self: center;
        padding: 0.4rem 0.8rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--accent, #2e7d32) 92%, #000);
        color: var(--on-accent, #fff);
        font-size: 0.8rem;
        font-weight: 750;
      }
      .dmp__badge--warn {
        background: #5c3b16;
        color: #fff;
      }
      .dmp__confirm {
        border: 0;
        border-radius: 14px;
        min-height: 2.85rem;
        padding: 0.75rem 1rem;
        background: var(--accent, #2e7d32);
        color: var(--on-accent, #ffffff);
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }
      .dmp__confirm:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        color: var(--on-accent, #ffffff);
      }
    `,
  ],
})
export class DeliveryMapPickerComponent implements AfterViewInit, OnDestroy {
  private readonly mapHost = viewChild.required<ElementRef<HTMLDivElement>>('mapHost');

  readonly zones = input.required<DeliveryZoneGeo[]>();
  readonly accent = input('#2e7d32');
  readonly onAccent = input('#ffffff');
  readonly initial = input<LatLng | null>(null);

  readonly selected = output<DeliveryMapSelection>();
  readonly closed = output<void>();

  readonly hits = signal<GeocodeHit[]>([]);
  readonly activeZone = signal<DeliveryZoneGeo | null>(null);
  readonly busy = signal(false);
  readonly locating = signal(false);
  readonly locationHint = signal<string | null>(null);
  query = '';

  private map: L.Map | null = null;
  private polygonsLayer: L.LayerGroup | null = null;
  private searchTimer: number | null = null;
  private moveTimer: number | null = null;
  private hintTimer: number | null = null;

  readonly zonesWithPolygon = computed(() =>
    this.zones().some((z) => (z.polygon?.length ?? 0) >= 3),
  );

  ngAfterViewInit(): void {
    const center = this.initial() ?? zonesMapCenter(this.zones());
    this.map = L.map(this.mapHost().nativeElement, {
      zoomControl: true,
      attributionControl: true,
    }).setView([center.lat, center.lng], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(this.map);

    this.polygonsLayer = L.layerGroup().addTo(this.map);
    this.drawZones();

    this.map.on('moveend', () => this.onMapMoved());
    window.setTimeout(() => {
      this.map?.invalidateSize();
      this.onMapMoved();
      if (!this.initial()) {
        this.requestCurrentLocation(false);
      }
    }, 120);
    window.setTimeout(() => this.map?.invalidateSize(), 400);
  }

  ngOnDestroy(): void {
    if (this.searchTimer) window.clearTimeout(this.searchTimer);
    if (this.moveTimer) window.clearTimeout(this.moveTimer);
    if (this.hintTimer) window.clearTimeout(this.hintTimer);
    this.map?.remove();
    this.map = null;
  }

  feeLabel(fee: number): string {
    return fee > 0 ? orderingMoney(fee) : 'Sin cargo';
  }

  requestCurrentLocation(fromUser: boolean): void {
    if (!this.map || this.locating()) return;
    if (!navigator.geolocation) {
      this.showHint('Tu navegador no permite compartir la ubicación.');
      return;
    }
    this.locating.set(true);
    this.showHint('Pedimos tu ubicación para centrar el mapa…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.locating.set(false);
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.map?.setView([point.lat, point.lng], Math.max(this.map.getZoom(), 16));
        this.refreshZone(point);
        this.showHint('Mapa centrado en tu ubicación. Movelo si hace falta.');
      },
      (err) => {
        this.locating.set(false);
        if (err.code === err.PERMISSION_DENIED) {
          this.showHint(
            fromUser
              ? 'No dimos permiso de ubicación. Activalo en el navegador o buscá la dirección.'
              : 'Si querés, tocá ◎ para usar tu ubicación actual.',
          );
        } else {
          this.showHint('No pudimos obtener tu ubicación. Buscá la dirección o mové el mapa.');
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30_000 },
    );
  }

  private showHint(msg: string): void {
    this.locationHint.set(msg);
    if (this.hintTimer) window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.locationHint.set(null), 4500);
  }

  onQuery(value: string): void {
    this.query = value;
    if (this.searchTimer) window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(async () => {
      const near = this.currentCenter();
      try {
        this.hits.set(await geocodeAddress(value, near ?? undefined));
      } catch {
        this.hits.set([]);
      }
    }, 380);
  }

  pickHit(hit: GeocodeHit): void {
    this.hits.set([]);
    this.query = hit.label;
    this.map?.setView([hit.lat, hit.lng], Math.max(this.map.getZoom(), 16));
    this.refreshZone({ lat: hit.lat, lng: hit.lng });
  }

  async confirm(): Promise<void> {
    const point = this.currentCenter();
    if (!point || this.busy()) return;
    if (this.zonesWithPolygon() && !this.activeZone()) return;
    this.busy.set(true);
    try {
      const rev = await reverseGeocode(point);
      this.selected.emit({
        point,
        zone: this.activeZone(),
        street: rev?.street || this.query.trim() || rev?.label || '',
        number: rev?.houseNumber || '',
        label: rev?.label || this.query.trim() || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
      });
    } catch {
      this.selected.emit({
        point,
        zone: this.activeZone(),
        street: this.query.trim(),
        number: '',
        label: this.query.trim() || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
      });
    } finally {
      this.busy.set(false);
    }
  }

  private drawZones(): void {
    if (!this.polygonsLayer) return;
    this.polygonsLayer.clearLayers();
    this.zones().forEach((z, i) => {
      const poly = z.polygon;
      if (!poly || poly.length < 3) return;
      const color = zoneColor(z, i);
      const layer = L.polygon(
        poly.map((p) => [p.lat, p.lng] as [number, number]),
        {
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.22,
        },
      );
      layer.bindTooltip(`${z.name} · ${this.feeLabel(z.fee)}`, {
        sticky: true,
        direction: 'center',
        className: 'dmp-tip',
      });
      layer.addTo(this.polygonsLayer!);
    });
  }

  private onMapMoved(): void {
    if (this.moveTimer) window.clearTimeout(this.moveTimer);
    this.moveTimer = window.setTimeout(() => {
      const c = this.currentCenter();
      if (c) this.refreshZone(c);
    }, 120);
  }

  private refreshZone(point: LatLng): void {
    this.activeZone.set(findZoneAtPoint(point, this.zones()));
  }

  private currentCenter(): LatLng | null {
    const c = this.map?.getCenter();
    if (!c) return null;
    return { lat: c.lat, lng: c.lng };
  }
}
