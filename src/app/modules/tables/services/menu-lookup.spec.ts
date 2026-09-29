import { buildMenuLookup, formatQuantifiedLabel } from './menu-lookup';
import { MenuCategory } from '../../products/interfaces/product.interface';

function makeCategories(): MenuCategory[] {
  return [
    {
      id: 'c1',
      name: 'Helados',
      products: [
        {
          id: 'p1',
          name: 'Banana Split',
          description: null,
          image_url: null,
          available: true,
          variants: [
            { id: 'v1', name: 'Única', price: 15000, option_groups: [], available: true },
          ],
          option_groups: [
            {
              id: 'g1',
              name: 'Toppings',
              min_select: 0,
              max_select: 1,
              consume: false,
              selection_mode: 'cantidad',
              max_quantity_per_option: null,
              max_total_quantity: null,
              options: [
                { id: 'o1', name: 'Bobombún', extra_price: 1000, available: true },
              ],
            },
          ],
        },
      ],
    },
  ];
}

describe('buildMenuLookup — optionLabelWithQuantity', () => {
  // spec 087 (FR-012): reemplaza el formato "Nx Nombre" que se omitía en
  // x1 (research.md Decisión 9) -- el multiplicador "Nombre xN" ahora
  // siempre va, incluso x1.
  it('quantity=1 muestra "Nombre x1" (el multiplicador ya nunca se omite)', () => {
    const lk = buildMenuLookup(makeCategories());
    expect(lk.optionLabelWithQuantity('o1', 1)).toBe('Bobombún x1');
  });

  it('quantity>1 pospone " xN"', () => {
    const lk = buildMenuLookup(makeCategories());
    expect(lk.optionLabelWithQuantity('o1', 2)).toBe('Bobombún x2');
  });
});

describe('formatQuantifiedLabel', () => {
  it('siempre incluye el multiplicador, incluso x1 (spec 087, FR-012)', () => {
    expect(formatQuantifiedLabel('Bobombún', 1)).toBe('Bobombún x1');
    expect(formatQuantifiedLabel('Bobombún', 3)).toBe('Bobombún x3');
  });
});
