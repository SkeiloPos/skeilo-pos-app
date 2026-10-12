import {
  discountInfo,
  effectivePrice,
  getPromoDisplay,
  hasPromotion,
  inTimeWindow,
  isPromoActiveNow,
  minPromoPriceForProduct,
  packagePrice,
} from './promotion-pricing.util';
import { Promotion } from '../interfaces/promotion.interface';
import {
  MenuProduct,
  MenuVariant,
  MenuVariantPromotion,
} from '../../products/interfaces/product.interface';

/**
 * spec 063 — el util se redujo a vigencia local + insignia + elección de precio.
 * `bestProductDiscount` / `discountedUnitPrice` / `findOverlaps` se fueron
 * (A-58/A-59/A-60): el descuento y el bloqueo de solape los resuelve el backend.
 *
 * `isPromoActiveNow`/`getPromoDisplay` operan sobre la **promoción**
 * (vigencia + estado) sin cambio tras la partición `Promoción`/`Regla`
 * (revisión 2026-09-01) — esos campos no se movieron a la regla.
 */
function promo(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: 'p1',
    name: 'promo',
    description: null,
    status: 'active',
    starts_at: null,
    ends_at: null,
    days_of_week: null,
    start_time: null,
    end_time: null,
    closed_by_refactor_at: null,
    rules: [
      {
        id: 'r1', type: 'percent', value: '10', min_qty: 1,
        condition_text: '10% en estas 3 variantes', variants: [],
      },
    ],
    ...overrides,
  };
}

describe('inTimeWindow', () => {
  it('ventana que cruza medianoche', () => {
    expect(inTimeWindow('23:00', '22:00', '02:00')).toBe(true);
    expect(inTimeWindow('01:00', '22:00', '02:00')).toBe(true);
    expect(inTimeWindow('15:00', '22:00', '02:00')).toBe(false);
  });
  it('sin ventana, siempre dentro', () => {
    expect(inTimeWindow('03:00', null, null)).toBe(true);
  });
});

describe('isPromoActiveNow', () => {
  const now = new Date('2026-08-05T13:00:00'); // miércoles

  it('solo estado active', () => {
    expect(isPromoActiveNow(promo({ status: 'draft' }), now)).toBe(false);
    expect(isPromoActiveNow(promo({ status: 'active' }), now)).toBe(true);
  });

  it('respeta días de la semana', () => {
    expect(isPromoActiveNow(promo({ days_of_week: '2' }), now)).toBe(true); // miércoles = 2
    expect(isPromoActiveNow(promo({ days_of_week: '0' }), now)).toBe(false);
  });
});

describe('getPromoDisplay', () => {
  const now = new Date('2026-08-05T13:00:00');

  it('draft / finished / live', () => {
    expect(getPromoDisplay(promo({ status: 'draft' }), now)).toBe('draft');
    expect(getPromoDisplay(promo({ status: 'finished' }), now)).toBe('finished');
    expect(getPromoDisplay(promo({ status: 'active' }), now)).toBe('live');
  });

  it('fuera de ventana horaria', () => {
    expect(getPromoDisplay(promo({ start_time: '20:00', end_time: '22:00' }), now)).toBe(
      'out_of_window',
    );
  });
});

describe('effectivePrice / discountInfo', () => {
  it('elige el precio con descuento si vino', () => {
    expect(effectivePrice(10000, 9000)).toBe(9000);
    expect(effectivePrice(10000, null)).toBe(10000);
  });

  it('discountInfo deriva el porcentaje', () => {
    expect(discountInfo(10000, 9000)?.percent).toBe(10);
    expect(discountInfo(10000, null)).toBeNull();
    expect(discountInfo(10000, 10000)).toBeNull();
  });
});

describe('hasPromotion (spec 115: extraído de public-menu.component.ts, sin cambio de criterio)', () => {
  function product(variants: Partial<MenuVariant>[]): MenuProduct {
    return {
      id: 'p1',
      name: 'Producto',
      description: null,
      image_url: null,
      option_groups: [],
      available: true,
      variants: variants.map((v, i) => ({
        id: `v${i}`, name: `Variante ${i}`, price: 1000, option_groups: [], available: true,
        ...v,
      })),
    };
  }

  it('true si al menos una variante tiene promotion poblado', () => {
    expect(hasPromotion(product([{ promotion: null }, { promotion: {} as MenuVariantPromotion }]))).toBe(true);
  });

  it('false si ninguna variante tiene promotion', () => {
    expect(hasPromotion(product([{ promotion: null }, {}]))).toBe(false);
  });

  it('false para un producto sin variantes', () => {
    expect(hasPromotion(product([]))).toBe(false);
  });
});

describe('packagePrice (spec 081/115: cálculo por bloques de min_qty, compartido entre el modal y el carrito)', () => {
  function promoInfo(overrides: Partial<MenuVariantPromotion> = {}): MenuVariantPromotion {
    return {
      condition_text: '2 x $15.000', short_condition: '2 x $15.000', unit_equivalent: 7500,
      unit_equivalent_approx: false, unit_equivalent_text: '$7.500 c/u',
      display_text: '2 x $15.000', type: 'package_price', min_qty: 2, value: 15000,
      ...overrides,
    };
  }

  it('cantidad exacta de un paquete: cobra el value exacto de la regla', () => {
    expect(packagePrice(8000, promoInfo(), 2)).toBe(15000);
  });

  it('dos paquetes completos: multiplica el value por la cantidad de bloques', () => {
    expect(packagePrice(8000, promoInfo(), 4)).toBe(30000);
  });

  it('remanente que no completa un paquete: lo cobra a precio normal', () => {
    // 1 paquete (15.000) + 1 unidad normal (8.000)
    expect(packagePrice(8000, promoInfo(), 3)).toBe(23000);
  });

  it('type "percent": usa min_qty * unit_equivalent en vez de value', () => {
    const promo = promoInfo({ type: 'percent', value: 10, unit_equivalent: 7200 });
    expect(packagePrice(8000, promo, 2)).toBe(14400);
  });

  it('cantidad menor al mínimo: todo a precio normal (0 bloques completos)', () => {
    expect(packagePrice(8000, promoInfo(), 1)).toBe(8000);
  });
});

describe('minPromoPriceForProduct (spec 084, bug 1, FR-012/013)', () => {
  function promoInfo(overrides: Partial<MenuVariantPromotion> = {}): MenuVariantPromotion {
    return {
      condition_text: '2 x $15.000',
      short_condition: '2 x $15.000',
      unit_equivalent: 7500,
      unit_equivalent_approx: false,
      unit_equivalent_text: '$7.500 c/u',
      display_text: '2 x $15.000 · $7.500 c/u',
      type: 'package_price',
      min_qty: 2,
      value: 15000,
      ...overrides,
    };
  }

  function variant(overrides: Partial<MenuVariant> = {}): MenuVariant {
    return {
      id: 'v1', name: 'Única', price: 8000, option_groups: [], available: true,
      ...overrides,
    };
  }

  it('null cuando ninguna variante tiene promoción (FR-015, sin cambio)', () => {
    expect(minPromoPriceForProduct([variant(), variant({ id: 'v2' })])).toBeNull();
  });

  it('una sola variante cubierta: su condición corta (sin el "c/u"), sin "Desde" (isMinimum=false)', () => {
    const result = minPromoPriceForProduct([
      variant({ promotion: promoInfo() }),
      variant({ id: 'v2' }), // sin promoción -- no cuenta para "varias cubiertas"
    ]);
    expect(result).toEqual({ displayText: '2 x $15.000', isMinimum: false });
  });

  it('varias variantes cubiertas: elige el unit_equivalent más bajo y marca isMinimum', () => {
    const result = minPromoPriceForProduct([
      variant({
        id: 'v1',
        promotion: promoInfo({ unit_equivalent: 7500, short_condition: '2 x $15.000' }),
      }),
      variant({
        id: 'v2',
        promotion: promoInfo({ unit_equivalent: 6000, short_condition: '2 x $12.000' }),
      }),
    ]);
    // spec 084 (A-82): la tarjeta muestra solo la condición, sin el equivalente por unidad.
    expect(result).toEqual({ displayText: '2 x $12.000', isMinimum: true });
  });

  it('caso ya cubierto por spec 066 FR-015 (min_qty=1): también se puede resolver aquí, sin cambio de comportamiento aguas arriba', () => {
    // No es el camino que usa la tarjeta en ese caso (productDiscount() lo cubre
    // primero, FR-014) -- pero el helper en sí no falla ni distingue min_qty.
    const result = minPromoPriceForProduct([
      variant({ promotion: promoInfo({ type: 'percent', min_qty: 1, unit_equivalent: 7200 }) }),
    ]);
    expect(result?.isMinimum).toBe(false);
  });
});
