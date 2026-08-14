export type SalonArea = 'INSIDE' | 'OUTSIDE';

export interface SalonTable {
  id: string;
  shopId: string;
  area: SalonArea;
  label: string;
  seats: number;
  sortOrder: number;
}

export interface SalonAreaRule {
  id: string;
  shopId: string;
  area: SalonArea;
  partySize: number;
  maxCount: number;
}

export interface SalonFloor {
  tables: SalonTable[];
  rules: SalonAreaRule[];
}

export interface SalonRuleSlot {
  partySize: number;
  maxCount: number;
}
