import { describe, expect, it } from 'vitest';
import {
  commissionCategoryHint,
  groupCommissionCategories,
  indexCommissionCategories,
} from './commission-categories';

describe('rubros de comisión (Ventas y Ventas POS)', () => {
  const index = indexCommissionCategories(['Comida', 'Bebidas', 'Café'], ['COMIDA', 'Postres', 'cafe']);

  it('agrupa por origen sin importar tildes ni mayúsculas', () => {
    const groups = groupCommissionCategories(index);
    expect(groups.map((g) => [g.label, g.items])).toEqual([
      ['En Ventas y Ventas POS', ['Café', 'Comida']],
      ['Solo Ventas (Carta)', ['Bebidas']],
      ['Solo Ventas POS', ['Postres']],
    ]);
  });

  it('filtra por lo escrito', () => {
    const groups = groupCommissionCategories(index, 'pos');
    expect(groups.map((g) => g.items)).toEqual([['Postres']]);
  });

  it('explica de dónde suma el rubro elegido', () => {
    expect(commissionCategoryHint(index, 'comida')).toContain('Ventas POS');
    expect(commissionCategoryHint(index, 'Bebidas')).toContain('Solo suma Ventas');
    expect(commissionCategoryHint(index, 'Postres')).toContain('Solo suma Ventas POS');
    expect(commissionCategoryHint(index, 'Pizza')).toContain('no va a sumar');
  });
});
