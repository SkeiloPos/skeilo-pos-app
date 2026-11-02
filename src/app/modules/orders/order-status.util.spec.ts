import { afterEach, vi } from 'vitest';
import {
  kitchenStatusLabel,
  orderDisplayCode,
  orderLocationLabel,
  orderStatusLabel,
  orderTypeLabel,
  paymentStatusLabel,
  puedeCancelarComensal,
} from './order-status.util';

/**
 * spec 146 (FR-008/FR-009/FR-010, A-150), spec 147 (colapso de 5 a 3 estados
 * de pedido / 4 a 3 de ítem / 3 a 2 de pago): se eliminó `displayOrderStatus()`
 * (que sustituía `order.status` por `'pagada'` basándose en `order.paid`).
 * `orderStatusLabel`/`kitchenStatusLabel` ahora solo devuelven el valor crudo
 * recibido, y loguean un error en consola si no está en la lista estática de
 * valores conocidos — nunca lo sustituyen por un estado "por defecto".
 */
afterEach(() => {
  vi.restoreAllMocks();
});

describe('orderStatusLabel', () => {
  it('devuelve el status crudo tal cual, sin traducir', () => {
    expect(orderStatusLabel('pendiente')).toBe('pendiente');
    expect(orderStatusLabel('entregada')).toBe('entregada');
    expect(orderStatusLabel('cancelada')).toBe('cancelada');
  });

  it('un valor no reconocido se muestra crudo y loguea un error en consola', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(orderStatusLabel('en_revision')).toBe('en_revision');
    expect(spy).toHaveBeenCalled();
  });

  it('un valor conocido no loguea ningún error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    orderStatusLabel('pendiente');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('kitchenStatusLabel', () => {
  it('devuelve el estado_cocina crudo tal cual, sin traducir', () => {
    expect(kitchenStatusLabel('pendiente')).toBe('pendiente');
    expect(kitchenStatusLabel('entregado')).toBe('entregado');
  });

  it('un valor no reconocido se muestra crudo y loguea un error en consola', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(kitchenStatusLabel('horneando')).toBe('horneando');
    expect(spy).toHaveBeenCalled();
  });
});

/**
 * `payment_status` no es uno de los dos ejes que FR-008/FR-009 protege (esos
 * son `status` y `estado_cocina`) -- a pedido del usuario, se traduce a una
 * etiqueta corta en español, en mayúsculas.
 */
describe('paymentStatusLabel', () => {
  it('traduce los 2 valores conocidos (spec 147: PARTIAL ya no existe)', () => {
    expect(paymentStatusLabel('UNPAID')).toBe('NO PAGADO');
    expect(paymentStatusLabel('PAID')).toBe('PAGADO');
  });

  it('un valor no reconocido se muestra crudo y loguea un error en consola', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(paymentStatusLabel('REFUNDED')).toBe('REFUNDED');
    expect(spy).toHaveBeenCalled();
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

// `pedidoAceptadoSinCobrar` se retira (spec 147, FR-002/research.md R4):
// `kitchen.accept_order_for_kitchen`/`POST /orders/{id}/start-preparation` y
// el paso intermedio "aceptado para cocina sin cobrar" que describía ya no
// existen -- la única acción de entrega es `POST /orders/{id}/deliver`, que
// mueve pedido e ítems juntos, de una vez.

/**
 * ¿Puede el comensal cancelar? Misma regla que aplica el backend
 * (`cart/service.py::cancel_my_order`, reescrita spec 147): solo si el
 * pedido sigue `'pendiente'` y ningún ítem salió de `'pendiente'` todavía
 * (nada se entregó ni se canceló). Con solo 3 estados de pedido y 3 de ítem
 * ya no hay un paso intermedio "aceptado para cocina sin cobrar" que
 * distinguir -- en cuanto algo avanza, es porque ya se entregó.
 */
describe('puedeCancelarComensal', () => {
  it('pendiente sin ítems en curso: se puede cancelar', () => {
    expect(
      puedeCancelarComensal({ status: 'pendiente', items: [{ estado_cocina: 'pendiente' } as any] }),
    ).toBe(true);
  });

  it('pendiente pero con un ítem ya entregado (FR-002a): NO se puede cancelar', () => {
    expect(
      puedeCancelarComensal({
        status: 'pendiente',
        items: [{ estado_cocina: 'entregado' } as any],
      }),
    ).toBe(false);
  });

  it('entregada: no se puede cancelar sin importar los ítems', () => {
    expect(
      puedeCancelarComensal({ status: 'entregada', items: [{ estado_cocina: 'pendiente' } as any] }),
    ).toBe(false);
  });

  it('cancelada: no se puede cancelar de nuevo', () => {
    expect(
      puedeCancelarComensal({ status: 'cancelada', items: [{ estado_cocina: 'cancelado' } as any] }),
    ).toBe(false);
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
