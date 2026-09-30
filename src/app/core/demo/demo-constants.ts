/**
 * Constantes y “enums” de la demo offline.
 * Todo el catálogo de estados/tipos vive en el front; no depende de la API.
 */

export const DEMO_STORAGE_KEYS = {
  token: 'crc_token',
  user: 'crc_user',
  tour: 'crc_demo_tour',
} as const;

/** Token local de sesión demo (no es un JWT real). */
export const DEMO_LOCAL_TOKEN = 'crc-demo-local-token';

export const DemoPaymentStatus = {
  PENDING_VALIDATION: 'PENDING_VALIDATION',
  VALIDATED: 'VALIDATED',
  REJECTED: 'REJECTED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;
export type DemoPaymentStatus =
  (typeof DemoPaymentStatus)[keyof typeof DemoPaymentStatus];

export const DemoPaymentMethod = {
  CASH: 'cash',
  TRANSFER: 'transfer',
  CARD: 'card',
  OTHER: 'other',
} as const;
export type DemoPaymentMethod =
  (typeof DemoPaymentMethod)[keyof typeof DemoPaymentMethod];

export const DemoPaymentPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;
export type DemoPaymentPriority =
  (typeof DemoPaymentPriority)[keyof typeof DemoPaymentPriority];

export const DemoConceptKind = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  TRANSFER: 'TRANSFER',
} as const;
export type DemoConceptKind = (typeof DemoConceptKind)[keyof typeof DemoConceptKind];

export const DemoAccountType = {
  SYSTEM: 'SYSTEM',
  CHANNEL: 'CHANNEL',
  PARTNER: 'PARTNER',
  SUPPLIER: 'SUPPLIER',
  SERVICE: 'SERVICE',
  DIVIDENDS: 'DIVIDENDS',
} as const;
export type DemoAccountType = (typeof DemoAccountType)[keyof typeof DemoAccountType];

export const DemoShortageLevel = {
  NONE: 'NONE',
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
} as const;
export type DemoShortageLevel =
  (typeof DemoShortageLevel)[keyof typeof DemoShortageLevel];

export const DemoShortageLevelLabel: Record<DemoShortageLevel, string> = {
  NONE: 'Nada',
  LOW: 'Poco',
  NORMAL: 'Normal',
  HIGH: 'Mucho',
};

export const DemoClosingStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  LOCKED: 'LOCKED',
} as const;
export type DemoClosingStatus =
  (typeof DemoClosingStatus)[keyof typeof DemoClosingStatus];

export const DemoReservationStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  SEATED: 'SEATED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type DemoReservationStatus =
  (typeof DemoReservationStatus)[keyof typeof DemoReservationStatus];

export const DemoReservationArea = {
  INSIDE: 'INSIDE',
  OUTSIDE: 'OUTSIDE',
} as const;
export type DemoReservationArea =
  (typeof DemoReservationArea)[keyof typeof DemoReservationArea];

export const DemoWaitingStatus = {
  WAITING: 'WAITING',
  SEATED: 'SEATED',
  CANCELLED: 'CANCELLED',
} as const;
export type DemoWaitingStatus =
  (typeof DemoWaitingStatus)[keyof typeof DemoWaitingStatus];

export const DemoOrderChannel = {
  TAKEAWAY: 'TAKEAWAY',
  DELIVERY: 'DELIVERY',
  DINE_IN: 'DINE_IN',
} as const;
export type DemoOrderChannel =
  (typeof DemoOrderChannel)[keyof typeof DemoOrderChannel];

export const DemoOrderStatus = {
  PENDING: 'PENDING',
  PREPARING: 'PREPARING',
  READY: 'READY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  OPEN: 'OPEN',
} as const;
export type DemoOrderStatus = (typeof DemoOrderStatus)[keyof typeof DemoOrderStatus];

export const DemoTipStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;
export type DemoTipStatus = (typeof DemoTipStatus)[keyof typeof DemoTipStatus];

export const DemoSettlementStatus = {
  PENDING: 'PENDING',
  SETTLED: 'SETTLED',
  CANCELLED: 'CANCELLED',
} as const;
export type DemoSettlementStatus =
  (typeof DemoSettlementStatus)[keyof typeof DemoSettlementStatus];

export const DemoAttendanceDayStatus = {
  PRESENT: 'present',
  ABSENT: 'absent',
  HOLIDAY: 'holiday',
} as const;
export type DemoAttendanceDayStatus =
  (typeof DemoAttendanceDayStatus)[keyof typeof DemoAttendanceDayStatus];

export const DemoStockKind = {
  FOOD: 'food',
  BEVERAGE: 'beverage',
} as const;
export type DemoStockKind = (typeof DemoStockKind)[keyof typeof DemoStockKind];

export const DemoShopMode = {
  AL_PASO: 'AL_PASO',
  RESTAURANTE: 'RESTAURANTE',
} as const;
export type DemoShopMode = (typeof DemoShopMode)[keyof typeof DemoShopMode];

export const DemoServiceRulePhase = {
  PRE: 'PRE',
  DURING: 'DURING',
  POST: 'POST',
} as const;
export type DemoServiceRulePhase =
  (typeof DemoServiceRulePhase)[keyof typeof DemoServiceRulePhase];

export const DemoMovementSource = {
  CLOSING: 'closing',
  PAYMENT: 'manual',
  MANUAL: 'manual',
} as const;

/** Rutas relativas (sin query) que la demo debe poder resolver sin red. */
export const DEMO_REQUIRED_GET_PATHS = [
  '/auth/me',
  '/auth/demo',
  '/shops',
  '/users',
  '/sales-systems',
  '/notifications/unseen-count',
  '/push/vapid-public-key',
] as const;

export function demoShopRel(shopId: string, rest: string): string {
  return `/shops/${shopId}/${rest}`.replace(/\/+$/, '');
}
