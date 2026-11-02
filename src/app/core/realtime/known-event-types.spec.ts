import { RealtimeEventType } from './realtime-event.model';
import { KNOWN_EVENT_TYPES } from './sse-client';

/**
 * Test guardia (research.md D13, hallazgo H8): `EventSource` solo entrega los
 * eventos con nombre que se registraron con `addEventListener`
 * (`KNOWN_EVENT_TYPES`). Si alguien agrega un tipo a la unión `RealtimeEvent`
 * sin sumarlo a esa lista, el frame llega al navegador y se descarta en
 * silencio -- nunca dispara ningún callback.
 *
 * `KNOWN_TYPES_MAP` es exhaustivo por construcción: si falta una clave para
 * algún `RealtimeEventType`, el archivo NO COMPILA (TS2741/TS2322), así que
 * el olvido rompe la suite antes de llegar a producción.
 *
 * `menu.updated` (spec 128) se registró en T105 (spec 148, con confirmación
 * del usuario): activa por primera vez en producción el refresco en vivo de
 * categorías de la 128, que antes se descartaba en silencio (hallazgo H8).
 */
const KNOWN_TYPES_MAP: Record<RealtimeEventType, true> = {
  'order.created': true,
  'order.confirmed': true,
  'order.delivered': true,
  'order.item_kitchen_changed': true,
  'order.item_addon_added': true,
  'order.item_voided': true,
  'order.cancelled': true,
  'session.bill_changed': true,
  'payment.completed': true,
  'session.closed': true,
  'table.status_changed': true,
  'notification.created': true,
  'menu.updated': true,
  'availability.changed': true,
};

describe('KNOWN_EVENT_TYPES guard', () => {
  it('registra en sse-client.ts todo tipo de la unión RealtimeEvent', () => {
    const registered = new Set<string>(KNOWN_EVENT_TYPES);
    const allTypes = Object.keys(KNOWN_TYPES_MAP) as RealtimeEventType[];

    for (const type of allTypes) {
      expect(registered.has(type)).toBe(true);
    }
  });

  it('no incluye en KNOWN_EVENT_TYPES ningún tipo fuera de la unión de negocio', () => {
    const allTypes = new Set(Object.keys(KNOWN_TYPES_MAP));
    for (const type of KNOWN_EVENT_TYPES) {
      expect(allTypes.has(type)).toBe(true);
    }
  });
});
