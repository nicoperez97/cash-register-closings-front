import { describe, expect, it } from 'vitest';
import { ticketPerCover } from './ticket-per-cover';

describe('ticketPerCover', () => {
  it('divide el total por comensales y redondea a centavos', () => {
    expect(ticketPerCover(27000, 4)).toBe(6750);
    expect(ticketPerCover(10000, 3)).toBe(3333.33);
    expect(ticketPerCover('12500', '2')).toBe(6250);
  });

  it('sin comensales o sin monto no hay promedio', () => {
    expect(ticketPerCover(10000, 0)).toBeNull();
    expect(ticketPerCover(10000, null)).toBeNull();
    expect(ticketPerCover(0, 4)).toBeNull();
    expect(ticketPerCover(null, 4)).toBeNull();
  });
});
