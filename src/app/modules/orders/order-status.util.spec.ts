import { displayOrderStatus, orderDisplayCode, orderLocationLabel, orderTypeLabel } from './order-status.util';

/**
 * Panel de Control → Órdenes reportó "Abierta" para un pedido QR ya cobrado
 * (badge y pestaña "Pagadas" usaban `status` crudo, que nunca llega a
 * `'pagada'` en los caminos QR/mostrador — spec 029, research.md D2). Mismo
 * criterio que `PosTerminalStore.deriveTableStatus` en la Terminal de Mesas.
 */
describe('displayOrderStatus', () => {
  it('un pedido abierta con Sale ya registrada (paid) se ve como pagada', () => {
    expect(displayOrderStatus({ status: 'abierta', paid: true })).toBe('pagada');
  });

  it('sin paid, se muestra el status real', () => {
    expect(displayOrderStatus({ status: 'abierta', paid: false })).toBe('abierta');
    expect(displayOrderStatus({ status: 'abierta' })).toBe('abierta');
  });

  it('una orden cancelada se muestra cancelada aunque paid fuera true', () => {
    expect(displayOrderStatus({ status: 'cancelada', paid: true })).toBe('cancelada');
  });

  it('el camino legado bloqueada→pagada (pay_order) sigue viéndose pagada', () => {
    expect(displayOrderStatus({ status: 'pagada', paid: true })).toBe('pagada');
  });
});

/** spec 079, FR-017/FR-018 (data-model.md §5): la etiqueta de tipo de orden que
 *  la pantalla "Órdenes" pinta por fila. */
describe('orderTypeLabel', () => {
  it('mapea los 3 tipos concretos', () => {
    expect(orderTypeLabel('DINE_IN')).toBe('En mesa');
    expect(orderTypeLabel('TAKEAWAY')).toBe('Para llevar');
    expect(orderTypeLabel('DELIVERY')).toBe('Domicilio');
  });

  it('una orden sin tipo (null / undefined / vacío) se muestra "Sin especificar"', () => {
    expect(orderTypeLabel(null)).toBe('Sin especificar');
    expect(orderTypeLabel(undefined)).toBe('Sin especificar');
    expect(orderTypeLabel('')).toBe('Sin especificar');
  });
});

/** spec 120, research.md §3 / data-model.md "Código corto de orden": el sistema no
 *  tiene un número de orden universal (`table_order_number` solo existe para mesas),
 *  así que el código visible se deriva del propio `id` — igual para los 3 tipos. */
describe('orderDisplayCode', () => {
  it('toma los últimos 6 caracteres hexadecimales del id, en mayúsculas y con #', () => {
    expect(orderDisplayCode({ id: '11111111-2222-3333-4444-555555abcdef' })).toBe('#ABCDEF');
  });

  it('ignora los guiones del UUID al tomar los últimos caracteres', () => {
    expect(orderDisplayCode({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0012' })).toBe('#EE0012');
  });
});

/** spec 120, data-model.md "Ubicación mostrada": mismo criterio que ya usa hoy
 *  `orders-page.component.ts` (`tableLabel()`), extendido para ser consistente
 *  entre la tarjeta de la lista y el detalle. */
describe('orderLocationLabel', () => {
  it('con mesa conocida, muestra la etiqueta de la mesa', () => {
    expect(
      orderLocationLabel({ dining_table_id: 't1', order_type: 'DINE_IN' }, 'Mesa 3 · Terraza'),
    ).toBe('Mesa 3 · Terraza');
  });

  it('sin mesa y no es domicilio, muestra "Mostrador"', () => {
    expect(orderLocationLabel({ dining_table_id: null, order_type: 'TAKEAWAY' }, null)).toBe('Mostrador');
    expect(orderLocationLabel({ dining_table_id: null, order_type: null }, null)).toBe('Mostrador');
  });

  it('sin mesa y es domicilio, no hay ubicación que mostrar (el bloque de domicilio ocupa su lugar)', () => {
    expect(orderLocationLabel({ dining_table_id: null, order_type: 'DELIVERY' }, null)).toBe('');
  });
});
