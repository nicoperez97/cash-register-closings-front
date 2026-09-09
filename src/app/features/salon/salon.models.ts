export type SalonArea = 'INSIDE' | 'OUTSIDE';

export interface SalonSector {
  id: string;
  shopId: string;
  name: string;
  sortOrder: number;
}

export interface SalonTable {
  id: string;
  shopId: string;
  sectorId: string | null;
  area: SalonArea;
  label: string;
  seats: number;
  sortOrder: number;
  /** true = comanda/Mesas; false = inventario Diagrama. */
  forWaiter?: boolean;
  /** Posición en mapa de comanda (0–100 %). */
  mapX?: number | null;
  mapY?: number | null;
}

export interface SalonAreaRule {
  id: string;
  shopId: string;
  area: SalonArea;
  partySize: number;
  maxCount: number;
}

export interface SalonMapObject {
  id: string;
  shopId: string;
  sectorId: string;
  kind: string;
  name: string;
  mapX: number;
  mapY: number;
  sortOrder: number;
}

export interface SalonFloor {
  sectors: SalonSector[];
  tables: SalonTable[];
  rules: SalonAreaRule[];
  mapObjects?: SalonMapObject[];
}

export interface SalonRuleSlot {
  partySize: number;
  maxCount: number;
}
