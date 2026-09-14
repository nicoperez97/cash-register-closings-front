export type LatLng = { lat: number; lng: number };

export type DeliveryZoneGeo = {
  id: string;
  name: string;
  fee: number;
  note?: string | null;
  polygon?: LatLng[] | null;
  color?: string | null;
};

const ZONE_FALLBACK_COLORS = ['#e91e63', '#ff9800', '#00897b', '#5c6bc0', '#8d6e63', '#7cb342'];

/** Ray casting: punto dentro del polígono. */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + 0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Zona más chica que contiene el punto (si hay solapamiento). */
export function findZoneAtPoint(point: LatLng, zones: DeliveryZoneGeo[]): DeliveryZoneGeo | null {
  const hits = zones.filter((z) => z.polygon && z.polygon.length >= 3 && pointInPolygon(point, z.polygon));
  if (!hits.length) return null;
  hits.sort((a, b) => polygonArea(a.polygon!) - polygonArea(b.polygon!));
  return hits[0];
}

export function polygonArea(polygon: LatLng[]): number {
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    area += polygon[j].lng * polygon[i].lat - polygon[i].lng * polygon[j].lat;
  }
  return Math.abs(area / 2);
}

export function polygonCentroid(polygon: LatLng[]): LatLng | null {
  if (!polygon.length) return null;
  let lat = 0;
  let lng = 0;
  for (const p of polygon) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / polygon.length, lng: lng / polygon.length };
}

export function zonesMapCenter(zones: DeliveryZoneGeo[]): LatLng {
  for (const z of zones) {
    const c = z.polygon?.length ? polygonCentroid(z.polygon) : null;
    if (c) return c;
  }
  return { lat: -34.9011, lng: -56.1645 };
}

export function zoneColor(zone: DeliveryZoneGeo, index: number): string {
  const raw = String(zone.color ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
  return ZONE_FALLBACK_COLORS[index % ZONE_FALLBACK_COLORS.length];
}

export type GeocodeHit = {
  lat: number;
  lng: number;
  label: string;
  street?: string;
  houseNumber?: string;
};

/** Nominatim (OSM). Uso razonable: debounce + User-Agent de la app. */
export async function geocodeAddress(
  query: string,
  near?: LatLng,
): Promise<GeocodeHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '6');
  url.searchParams.set('q', q);
  if (near) {
    url.searchParams.set('viewbox', `${near.lng - 0.12},${near.lat + 0.12},${near.lng + 0.12},${near.lat - 0.12}`);
    url.searchParams.set('bounded', '0');
  }
  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'es',
    },
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    address?: { road?: string; house_number?: string; pedestrian?: string };
  }>;
  return (rows ?? []).map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lon),
    label: r.display_name,
    street: r.address?.road || r.address?.pedestrian || undefined,
    houseNumber: r.address?.house_number || undefined,
  }));
}

export async function reverseGeocode(point: LatLng): Promise<GeocodeHit | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('lat', String(point.lat));
  url.searchParams.set('lon', String(point.lng));
  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'es',
    },
  });
  if (!res.ok) return null;
  const r = (await res.json()) as {
    display_name?: string;
    address?: { road?: string; house_number?: string; pedestrian?: string };
  };
  if (!r?.display_name) return null;
  return {
    lat: point.lat,
    lng: point.lng,
    label: r.display_name,
    street: r.address?.road || r.address?.pedestrian || undefined,
    houseNumber: r.address?.house_number || undefined,
  };
}

export function composeDeliveryAddress(parts: {
  street: string;
  number: string;
  betweenStreets?: string;
  details?: string;
}): string {
  const street = parts.street.trim();
  const number = parts.number.trim();
  const head = [street, number].filter(Boolean).join(' ').trim();
  const lines = [head];
  const between = parts.betweenStreets?.trim();
  const details = parts.details?.trim();
  if (between) lines.push(`Entre: ${between}`);
  if (details) lines.push(`Detalles: ${details}`);
  return lines.filter(Boolean).join('\n').slice(0, 300);
}
