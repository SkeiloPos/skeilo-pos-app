import { afterEach, vi } from 'vitest';
import {
  canDeliverOrder,
  canSendToKitchen,
  kitchenStatusLabel,
  orderDisplayCode,
  orderLocationLabel,
  orderStatusLabel,
  orderTypeLabel,
  paymentStatusLabel,
  puedeCancelarComensal,
  qrPaymentInstructionMessage,
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

/**
 * Spec 151/153 (T015): ¿puede entregarse este pedido? Con `cocinaAccess`
 * activo, solo `kitchen_status==='LISTO'` habilita "Entregar" -- nunca antes,
 * y nunca junto a una acción de cobro activa (FR-003/FR-004 de spec 153: un
 * pedido de mesa recién pagado automáticamente SIN_PREPARAR no es
 * entregable hasta que cocina lo marque LISTO).
 */
describe('canDeliverOrder', () => {
  it('con cocinaAccess activo y kitchen_status LISTO, permite entregar', () => {
    expect(
      canDeliverOrder(
        { status: 'confirmado', dining_table_id: 't1', items: [], kitchen_status: 'LISTO' },
        true,
      ),
    ).toBe(true);
  });

  it('con cocinaAccess activo y kitchen_status distinto de LISTO, no permite entregar', () => {
    expect(
      canDeliverOrder(
        { status: 'confirmado', dining_table_id: 't1', items: [], kitchen_status: 'SIN_PREPARAR' },
        true,
      ),
    ).toBe(false);
    expect(
      canDeliverOrder(
        { status: 'confirmado', dining_table_id: 't1', items: [], kitchen_status: 'EN_PROGRESO' },
        true,
      ),
    ).toBe(false);
  });

  /**
   * Spec 153, FR-001/FR-002: con `cocinaAccess` activo, un pedido de mesa
   * recién cobrado queda `kitchen_status==='SIN_PREPARAR'` (enviado a
   * cocina en el mismo paso del cobro) -- en ese instante no hay ninguna
   * acción de cobro pendiente (ya se cobró) y tampoco "Entregar" está
   * habilitado (no es `LISTO` todavía): cobro activo y entrega nunca
   * coexisten.
   */
  it('con cocinaAccess activo, un pedido recién enviado a cocina (SIN_PREPARAR) no es entregable aunque ya esté pagado', () => {
    expect(
      canDeliverOrder(
        {
          status: 'confirmado',
          dining_table_id: 't1',
          items: [],
          kitchen_status: 'SIN_PREPARAR',
        },
        true,
      ),
    ).toBe(false);
  });

  it('con cocinaAccess activo y kitchen_status null (nunca se envió a cocina), no permite entregar', () => {
    expect(
      canDeliverOrder(
        { status: 'confirmado', dining_table_id: 't1', items: [], kitchen_status: null },
        true,
      ),
    ).toBe(false);
  });

  // Spec 157 (A-160, hallazgo post-implementación): antes, sin mesa nunca se
  // podía entregar sin importar cocinaAccess, porque `checkout_and_send`
  // siempre despachaba TAKEAWAY/DELIVERY directo a 'entregada' al cobrar.
  // Ahora que, con el módulo activo, también siguen su propio ciclo de
  // cocina, el mismo criterio de `kitchen_status === 'LISTO'` aplica sin
  // mesa.
  it('sin mesa (dining_table_id null) y cocinaAccess activo, permite entregar si kitchen_status es LISTO', () => {
    expect(
      canDeliverOrder(
        { status: 'confirmado', dining_table_id: null, items: [], kitchen_status: 'LISTO' },
        true,
      ),
    ).toBe(true);
  });

  it('sin mesa (dining_table_id null) y cocinaAccess activo, no permite entregar si kitchen_status no es LISTO', () => {
    expect(
      canDeliverOrder(
        { status: 'confirmado', dining_table_id: null, items: [], kitchen_status: 'SIN_PREPARAR' },
        true,
      ),
    ).toBe(false);
  });

  it('sin mesa (dining_table_id null) y sin cocinaAccess, nunca permite entregar (sin paso de entrega propio, FR-007)', () => {
    expect(
      canDeliverOrder(
        { status: 'confirmado', dining_table_id: null, items: [], kitchen_status: 'LISTO' },
        false,
      ),
    ).toBe(false);
  });

  it('ya entregada, no permite entregar de nuevo', () => {
    expect(
      canDeliverOrder(
        { status: 'entregada', dining_table_id: 't1', items: [], kitchen_status: 'LISTO' },
        true,
      ),
    ).toBe(false);
  });

  it('sin cocinaAccess (no-regresión, FR-006), gobierna estado_cocina por producto', () => {
    expect(
      canDeliverOrder(
        {
          status: 'confirmado',
          dining_table_id: 't1',
          items: [{ estado_cocina: 'pendiente' } as any],
          kitchen_status: null,
        },
        false,
      ),
    ).toBe(true);
    expect(
      canDeliverOrder(
        {
          status: 'confirmado',
          dining_table_id: 't1',
          items: [{ estado_cocina: 'entregado' } as any],
          kitchen_status: null,
        },
        false,
      ),
    ).toBe(false);
  });
});

/** Spec 150: ¿puede enviarse este pedido a la cola de cocina? */
describe('canSendToKitchen', () => {
  it('pagado, sin kitchen_status y con cocinaAccess, sí se puede enviar', () => {
    expect(
      canSendToKitchen({ status: 'confirmado', payment_status: 'PAID', kitchen_status: null }, true),
    ).toBe(true);
  });

  it('sin cocinaAccess, no se puede enviar aunque esté pagado y sin kitchen_status', () => {
    expect(
      canSendToKitchen({ status: 'confirmado', payment_status: 'PAID', kitchen_status: null }, false),
    ).toBe(false);
  });

  it('ya enviado a cocina (kitchen_status no nulo), no se puede reenviar', () => {
    expect(
      canSendToKitchen(
        { status: 'confirmado', payment_status: 'PAID', kitchen_status: 'SIN_PREPARAR' },
        true,
      ),
    ).toBe(false);
  });

  it('sin pagar, no se puede enviar', () => {
    expect(
      canSendToKitchen({ status: 'confirmado', payment_status: 'UNPAID', kitchen_status: null }, true),
    ).toBe(false);
  });

  // Spec 157 (research.md Decisión 1/5, A-160): TAKEAWAY/DELIVERY depende de
  // la modalidad de cobro del plan, no siempre exige PAID como mesa.
  it('mesa (dining_table_id no nulo) sin pagar sigue sin poder enviarse, aunque la modalidad sea PAY_AFTER_RECEIVING', () => {
    expect(
      canSendToKitchen(
        {
          status: 'confirmado', payment_status: 'UNPAID', kitchen_status: null,
          dining_table_id: 't1', qr_payment_instruction_mode: 'PAY_AFTER_RECEIVING',
        },
        true,
      ),
    ).toBe(false);
  });

  it('TAKEAWAY/DELIVERY (sin mesa) sin pagar, con PAY_AFTER_RECEIVING, sí se puede enviar', () => {
    expect(
      canSendToKitchen(
        {
          status: 'confirmado', payment_status: 'UNPAID', kitchen_status: null,
          dining_table_id: null, qr_payment_instruction_mode: 'PAY_AFTER_RECEIVING',
        },
        true,
      ),
    ).toBe(true);
  });

  it('TAKEAWAY/DELIVERY (sin mesa) sin pagar, con PAY_BEFORE_RECEIVING, no se puede enviar (botón oculto, FR-002/FR-004)', () => {
    expect(
      canSendToKitchen(
        {
          status: 'confirmado', payment_status: 'UNPAID', kitchen_status: null,
          dining_table_id: null, qr_payment_instruction_mode: 'PAY_BEFORE_RECEIVING',
        },
        true,
      ),
    ).toBe(false);
  });

  it('TAKEAWAY/DELIVERY (sin mesa) ya pagado, con PAY_BEFORE_RECEIVING, sí se puede enviar (FR-004, sin cambios)', () => {
    expect(
      canSendToKitchen(
        {
          status: 'confirmado', payment_status: 'PAID', kitchen_status: null,
          dining_table_id: null, qr_payment_instruction_mode: 'PAY_BEFORE_RECEIVING',
        },
        true,
      ),
    ).toBe(true);
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

/** spec 154, data-model.md "Combinación modalidad + método de pago → mensaje
 *  exacto" (FR-007/FR-008): las seis combinaciones + el caso sin instrucción. */
describe('qrPaymentInstructionMessage', () => {
  const efectivo = { is_cash: true, cash_amount: null };
  const transferencia = { is_cash: false, cash_amount: null };
  const mixto = { is_cash: false, cash_amount: 5000 };

  it('PAY_AFTER_RECEIVING + efectivo', () => {
    expect(qrPaymentInstructionMessage('PAY_AFTER_RECEIVING', efectivo)).toBe(
      'Te llevaremos tu pedido a la mesa. Paga al recibirlo.',
    );
  });

  it('PAY_AFTER_RECEIVING + transferencia', () => {
    expect(qrPaymentInstructionMessage('PAY_AFTER_RECEIVING', transferencia)).toBe(
      'Muestra el comprobante de tu banco al cajero cuando recibas tu pedido.',
    );
  });

  it('PAY_AFTER_RECEIVING + mixto', () => {
    expect(qrPaymentInstructionMessage('PAY_AFTER_RECEIVING', mixto)).toBe(
      'Al recibir tu pedido, muestra el comprobante de la transferencia al cajero. El efectivo lo pagas al recibirlo.',
    );
  });

  it('PAY_BEFORE_RECEIVING + efectivo', () => {
    expect(qrPaymentInstructionMessage('PAY_BEFORE_RECEIVING', efectivo)).toBe(
      'Dirígete a la caja para realizar el pago. ¡Llevaremos tu pedido hasta tu mesa!',
    );
  });

  it('PAY_BEFORE_RECEIVING + transferencia', () => {
    expect(qrPaymentInstructionMessage('PAY_BEFORE_RECEIVING', transferencia)).toBe(
      'Acércate a la caja y muestra el comprobante de tu transferencia para validar el pago. ¡Llevaremos tu pedido hasta tu mesa!',
    );
  });

  it('PAY_BEFORE_RECEIVING + mixto', () => {
    expect(qrPaymentInstructionMessage('PAY_BEFORE_RECEIVING', mixto)).toBe(
      'Acércate a la caja, presenta el comprobante de tu transferencia por Nequi y realiza el pago restante en efectivo. ¡Llevaremos tu pedido hasta tu mesa!',
    );
  });

  it('mode null/no reconocido o sin intento de pago, devuelve null', () => {
    expect(qrPaymentInstructionMessage(null, efectivo)).toBeNull();
    expect(qrPaymentInstructionMessage(undefined, efectivo)).toBeNull();
    expect(qrPaymentInstructionMessage('OTRO', efectivo)).toBeNull();
    expect(qrPaymentInstructionMessage('PAY_AFTER_RECEIVING', null)).toBeNull();
    expect(qrPaymentInstructionMessage('PAY_AFTER_RECEIVING', undefined)).toBeNull();
  });
});
