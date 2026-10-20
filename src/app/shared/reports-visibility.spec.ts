import { describe, expect, it } from 'vitest';
import {
  REPORT_VISIBILITY_UI,
  defaultReportVisibility,
  normalizeReportsVisibility,
  reportCanSeeAmount,
  reportCanSeeQty,
} from './reports-visibility';

describe('reports-visibility (front)', () => {
  it('los cuatro módulos de reporte tienen su config', () => {
    expect(Object.keys(REPORT_VISIBILITY_UI).sort()).toEqual(
      ['reports', 'reportsConcepts', 'reportsSales', 'reportsStats'].sort(),
    );
  });

  it('sin config guardada todo queda visible', () => {
    const v = normalizeReportsVisibility(null);
    expect(Object.values(v.stats).every(Boolean)).toBe(true);
    expect(v.sales.amountMode).toBe('both');
  });

  it('respeta flags guardados y descarta los desconocidos', () => {
    const v = normalizeReportsVisibility({ concepts: { charts: false, otro: false } });
    expect(v.concepts['charts']).toBe(false);
    expect(v.concepts['kpis']).toBe(true);
    expect('otro' in v.concepts).toBe(false);
  });

  it('datos numéricos solo en Ventas', () => {
    expect(defaultReportVisibility('closings').amountMode).toBeUndefined();
    const sales = normalizeReportsVisibility({ sales: { amountMode: 'qty' } }).sales;
    expect(reportCanSeeAmount(sales)).toBe(false);
    expect(reportCanSeeQty(sales)).toBe(true);
  });
});
