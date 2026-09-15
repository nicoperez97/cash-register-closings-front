import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import {
  DeliveryZoneGeo,
  GeocodeHit,
  LatLng,
  geocodeAddress,
  parsePolygonText,
  polygonCentroid,
  polygonToText,
  zoneColor,
  zonesMapCenter,
} from './delivery-geo.util';

@Component({
  selector: 'app-delivery-zone-map-editor',
  imports: [FormsModule],
  template: `
    <div class="dze" [style.--accent]="accent()" [style.--zone]="color()">
      <header class="dze__bar">
        <label class="dze__search">
          <input
            type="search"
            [(ngModel)]="query"
            (ngModelChange)="onQuery($event)"
            placeholder="Buscar para centrar el mapa…"
            autocomplete="street-address"
          />
        </label>
        <button
          type="button"
          class="dze__icon"
          (click)="requestCurrentLocation()"
          [disabled]="locating()"
          title="Mi ubicación"
          aria-label="Usar mi ubicación"
        >
          {{ locating() ? '…' : '◎' }}
        </button>
      </header>

      @if (hits().length) {
        <ul class="dze__hits">
          @for (h of hits(); track h.label) {
            <li>
              <button type="button" (click)="pickHit(h)">{{ h.label }}</button>
            </li>
          }
        </ul>
      }

      <p class="dze__hint">
        Tocá el mapa para sumar vértices (mín. 3). Tocá un punto para quitarlo.
      </p>

      <div class="dze__map-wrap">
        <div #mapHost class="dze__map" role="application" aria-label="Dibujar zona de delivery"></div>
      </div>

      <div class="dze__actions">
        <span class="dze__count">{{ points().length }} punto{{ points().length === 1 ? '' : 's' }}</span>
        <button type="button" class="dze__btn" (click)="undo()" [disabled]="!points().length">
          Deshacer
        </button>
        <button type="button" class="dze__btn" (click)="clear()" [disabled]="!points().length">
          Borrar
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .dze {
        display: grid;
        gap: 0.45rem;
        padding: 0.65rem;
        border-radius: 14px;
        border: 1px solid color-mix(in srgb, var(--zone, #e91e63) 28%, #d7e0d9);
        background: #fbfcfb;
      }
      .dze__bar {
        display: flex;
        gap: 0.4rem;
        align-items: center;
      }
      .dze__search {
        flex: 1;
        min-width: 0;
      }
      .dze__search input {
        width: 100%;
        box-sizing: border-box;
        height: 2.25rem;
        border: 1px solid #d7e0d9;
        border-radius: 999px;
        padding: 0 0.85rem;
        font: inherit;
        background: #fff;
      }
      .dze__icon {
        width: 2.25rem;
        height: 2.25rem;
        border: 1px solid #d7e0d9;
        border-radius: 12px;
        background: #fff;
        font-size: 1.1rem;
        cursor: pointer;
        color: var(--accent, #2e7d32);
        font-weight: 800;
        flex-shrink: 0;
      }
      .dze__icon:disabled {
        opacity: 0.55;
        cursor: wait;
      }
      .dze__hits {
        margin: 0;
        padding: 0.25rem;
        list-style: none;
        background: #fff;
        border: 1px solid #d7e0d9;
        border-radius: 10px;
        max-height: 8rem;
        overflow: auto;
      }
      .dze__hits button {
        width: 100%;
        border: 0;
        background: transparent;
        text-align: left;
        padding: 0.45rem 0.55rem;
        font: inherit;
        font-size: 0.84rem;
        border-radius: 8px;
        cursor: pointer;
      }
      .dze__hits button:hover {
        background: #f3f6f4;
      }
      .dze__hint {
        margin: 0;
        font-size: 0.8rem;
        color: #5f6f76;
      }
      .dze__map-wrap {
        position: relative;
        height: min(42dvh, 18rem);
        min-height: 12rem;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid #d7e0d9;
        background: #e8ece8;
      }
      .dze__map {
        position: absolute;
        inset: 0;
      }
      .dze__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        align-items: center;
      }
      .dze__count {
        margin-right: auto;
        font-size: 0.82rem;
        font-weight: 650;
        color: #3a4a42;
      }
      .dze__btn {
        border: 1px solid #d7e0d9;
        border-radius: 999px;
        background: #fff;
        padding: 0.35rem 0.85rem;
        font: inherit;
        font-size: 0.82rem;
        font-weight: 650;
        cursor: pointer;
        color: #1a221c;
      }
      .dze__btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
    `,
  ],
})
export class DeliveryZoneMapEditorComponent implements AfterViewInit, OnDestroy {
  private readonly mapHost = viewChild.required<ElementRef<HTMLDivElement>>('mapHost');

  readonly polygonText = model('');
  readonly color = input('#e91e63');
  readonly otherZones = input<DeliveryZoneGeo[]>([]);
  readonly accent = input('#2e7d32');

  readonly points = signal<LatLng[]>([]);
  readonly hits = signal<GeocodeHit[]>([]);
  readonly locating = signal(false);
  query = '';

  private map: L.Map | null = null;
  private draftLayer: L.LayerGroup | null = null;
  private otherLayer: L.LayerGroup | null = null;
  private searchTimer: number | null = null;
  private syncingFromModel = false;
  private skipNextModelEffect = false;
  private mapReady = false;

  constructor() {
    effect(() => {
      const text = this.polygonText();
      if (this.skipNextModelEffect) {
        this.skipNextModelEffect = false;
        return;
      }
      const next = parsePolygonText(text) ?? [];
      const cur = this.points();
      if (samePoints(cur, next)) return;
      this.syncingFromModel = true;
      this.points.set(next);
      if (this.mapReady) {
        this.redrawDraft();
        if (next.length >= 3 && this.map) {
          const bounds = L.latLngBounds(next.map((p) => [p.lat, p.lng] as [number, number]));
          this.map.fitBounds(bounds.pad(0.2));
        }
      }
      this.syncingFromModel = false;
    });

    effect(() => {
      this.otherZones();
      this.color();
      if (this.mapReady) {
        this.redrawOther();
        this.redrawDraft();
      }
    });
  }

  ngAfterViewInit(): void {
    const existing = parsePolygonText(this.polygonText());
    const center =
      (existing?.length ? polygonCentroid(existing) : null) ??
      zonesMapCenter(this.otherZones());
    this.map = L.map(this.mapHost().nativeElement, {
      zoomControl: true,
      attributionControl: true,
      doubleClickZoom: false,
    }).setView([center.lat, center.lng], existing && existing.length >= 3 ? 14 : 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(this.map);

    this.otherLayer = L.layerGroup().addTo(this.map);
    this.draftLayer = L.layerGroup().addTo(this.map);
    this.mapReady = true;
    this.redrawOther();

    if (existing?.length) {
      this.points.set(existing);
      this.redrawDraft();
      if (existing.length >= 3) {
        const bounds = L.latLngBounds(existing.map((p) => [p.lat, p.lng] as [number, number]));
        this.map.fitBounds(bounds.pad(0.2));
      }
    }

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.addPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    window.setTimeout(() => this.map?.invalidateSize(), 120);
    window.setTimeout(() => this.map?.invalidateSize(), 400);
  }

  ngOnDestroy(): void {
    if (this.searchTimer) window.clearTimeout(this.searchTimer);
    this.mapReady = false;
    this.map?.remove();
    this.map = null;
  }

  onQuery(value: string): void {
    this.query = value;
    if (this.searchTimer) window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(async () => {
      const near = this.map?.getCenter();
      try {
        this.hits.set(
          await geocodeAddress(
            value,
            near ? { lat: near.lat, lng: near.lng } : undefined,
          ),
        );
      } catch {
        this.hits.set([]);
      }
    }, 380);
  }

  pickHit(hit: GeocodeHit): void {
    this.hits.set([]);
    this.query = hit.label;
    this.map?.setView([hit.lat, hit.lng], Math.max(this.map.getZoom(), 15));
  }

  requestCurrentLocation(): void {
    if (!this.map || this.locating()) return;
    if (!navigator.geolocation) return;
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.locating.set(false);
        this.map?.setView(
          [pos.coords.latitude, pos.coords.longitude],
          Math.max(this.map.getZoom(), 15),
        );
      },
      () => this.locating.set(false),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30_000 },
    );
  }

  undo(): void {
    const next = this.points().slice(0, -1);
    this.points.set(next);
    this.redrawDraft();
    this.emitText();
  }

  clear(): void {
    this.points.set([]);
    this.redrawDraft();
    this.emitText();
  }

  private addPoint(point: LatLng): void {
    this.points.set([...this.points(), point]);
    this.redrawDraft();
    this.emitText();
  }

  private emitText(): void {
    if (this.syncingFromModel) return;
    this.skipNextModelEffect = true;
    this.polygonText.set(polygonToText(this.points()));
  }

  private redrawDraft(): void {
    if (!this.draftLayer) return;
    this.draftLayer.clearLayers();
    const pts = this.points();
    const color = this.color();

    if (pts.length >= 2) {
      L.polyline(
        pts.map((p) => [p.lat, p.lng] as [number, number]),
        { color, weight: 2, dashArray: pts.length < 3 ? '6 6' : undefined },
      ).addTo(this.draftLayer);
    }
    if (pts.length >= 3) {
      L.polygon(
        pts.map((p) => [p.lat, p.lng] as [number, number]),
        { color, weight: 2, fillColor: color, fillOpacity: 0.28 },
      ).addTo(this.draftLayer);
    }

    pts.forEach((p, index) => {
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 7,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      });
      marker.addTo(this.draftLayer!);
      marker.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        this.removePointAt(index);
      });
    });
  }

  private removePointAt(index: number): void {
    const pts = this.points().filter((_, i) => i !== index);
    this.points.set(pts);
    this.redrawDraft();
    this.emitText();
  }

  private redrawOther(): void {
    if (!this.otherLayer) return;
    this.otherLayer.clearLayers();
    this.otherZones().forEach((z, i) => {
      const poly = z.polygon;
      if (!poly || poly.length < 3) return;
      const c = zoneColor(z, i);
      L.polygon(
        poly.map((p) => [p.lat, p.lng] as [number, number]),
        {
          color: c,
          weight: 1,
          fillColor: c,
          fillOpacity: 0.1,
          interactive: false,
        },
      ).addTo(this.otherLayer!);
    });
  }
}

function samePoints(a: LatLng[], b: LatLng[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].lat - b[i].lat) > 1e-8 || Math.abs(a[i].lng - b[i].lng) > 1e-8) {
      return false;
    }
  }
  return true;
}
