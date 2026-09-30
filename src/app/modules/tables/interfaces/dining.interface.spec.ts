import { DiningOrder, DiningOrderItem, getSidebarMode, lineTotal, lineTotalGross } from './dining.interface';

/**
 * Reporte del usuario: un pedido de mostrador (canal `counter`) ya cobrado
 * seguía mostrando el panel editable completo —dividir cuenta, selector de
 * método de pago, "Rechazar pedido"— en vez de la vista de solo lectura que
 * un pedido QR ya pagado sí usa. `getSidebarMode` solo miraba el canal, sin
 * mirar `paid` (spec 029, research.md D2: `status` nunca llega a `'pagada'`
 * en los caminos QR ni mostrador).
 */
describe('getSidebarMode', () => {
  function order(overrides: Partial<DiningOrder>): DiningOrder {
    return {
      id: 'o1',
      channel: 'POS',
      status: 'abierta',
      created_at: '2026-08-21T18:27:00',
      ...overrides,
    } as DiningOrder;
  }

  it('un pedido de mostrador ya pagado va a "resumen" (solo lectura)', () => {
    expect(getSidebarMode(order({ channel: 'POS', paid: true }))).toBe('resumen');
  });

  it('un pedido de mostrador sin pagar sigue en "terminal-pos" (editable)', () => {
    expect(getSidebarMode(order({ channel: 'POS', paid: false }))).toBe('terminal-pos');
  });

  it('un pedido QR sin pagar sigue en "resumen" (comportamiento existente)', () => {
    expect(getSidebarMode(order({ channel: 'QR_MENU', paid: false }))).toBe('resumen');
  });

  it('sin pedido seleccionado, cae en "terminal-pos"', () => {
    expect(getSidebarMode(null)).toBe('terminal-pos');
    expect(getSidebarMode(undefined)).toBe('terminal-pos');
  });
});

/**
 * spec 089 (A-94): el total de una línea de pedido incluye los adicionales cobrados una vez por
 * línea; ninguna lectura debe volver a `unit_price × quantity` suelto.
 */
describe('lineTotal / lineTotalGross (spec 089)', () => {
  function item(overrides: Partial<DiningOrderItem>): DiningOrderItem {
    return {
      id: 'i1',
      product_variant_id: 'v1',
      quantity: 2,
      unit_price: '15000',
      estado_cocina: 'pendiente',
      ...overrides,
    } as DiningOrderItem;
  }

  it('línea nueva del Menú QR: 2 × 15.000 + adicional de 3.000 = 33.000', () => {
    const it = item({ addons_total: '3000', line_total: '33000' });
    expect(lineTotalGross(it)).toBe(33000);
    expect(lineTotal(it)).toBe(33000);
  });

  it('con promoción, usa el discounted_line_total (que ya incluye los adicionales)', () => {
    const it = item({ addons_total: '3000', line_total: '33000', discounted_line_total: '27000.00' });
    expect(lineTotal(it)).toBe(27000);
    expect(lineTotalGross(it)).toBe(33000);
  });

  it('línea histórica sin los campos nuevos: unit_price × quantity, igual que siempre', () => {
    const it = item({ unit_price: '18000' });
    expect(lineTotalGross(it)).toBe(36000);
    expect(lineTotal(it)).toBe(36000);
  });

  it('sin line_total (backend anterior) pero con addons_total: los suma una sola vez', () => {
    expect(lineTotalGross(item({ addons_total: '3000' }))).toBe(33000);
  });
});
