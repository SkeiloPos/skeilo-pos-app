import { formatProductCount } from './checkout-product-count';

/**
 * spec 092 (FR-003, FR-006, research.md D11) — la composición de la cadena del
 * conteo vive aquí y en ningún otro lado.
 *
 * FR-006 prohíbe que el comensal vea dos conteos distintos del mismo pedido en
 * la misma pantalla: el bloque de total del paso 3 y el `<summary>` del resumen
 * tienen que decir el mismo número y la misma palabra. Que los dos salgan de
 * esta función es lo que lo hace cierto por construcción, no por coincidencia.
 */
describe('formatProductCount', () => {
  it('usa el singular con una sola unidad', () => {
    expect(formatProductCount(1)).toBe('1 producto');
  });

  it('usa el plural con varias unidades', () => {
    expect(formatProductCount(5)).toBe('5 productos');
  });

  it('usa el plural en cero', () => {
    // El guard del checkout devuelve al comensal al menú con el carrito vacío,
    // así que este caso no se ve en pantalla; se fija igual para que la función
    // sea total y no dependa de esa garantía de aguas arriba.
    expect(formatProductCount(0)).toBe('0 productos');
  });

  it('no reformatea el número: un conteo grande se pinta tal cual', () => {
    // El conteo son unidades de producto, no plata: no lleva separador de miles
    // ni pasa por `MoneyPipe`.
    expect(formatProductCount(1234)).toBe('1234 productos');
  });

  it('solo el 1 es singular — el 2 ya es plural', () => {
    expect(formatProductCount(2)).toBe('2 productos');
  });
});
