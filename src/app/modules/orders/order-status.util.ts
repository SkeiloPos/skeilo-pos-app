import {
  DiningOrder,
  DiningOrderStatus,
  KitchenStatus,
  OrderPaymentStatus,
} from '../tables/interfaces/dining.interface';

/**
 * Catálogo estático de valores conocidos del flujo de mesas (spec 146,
 * FR-008/FR-009/FR-010): se usa **solo** para detectar y loguear un valor no
 * reconocido, nunca para traducir o sustituir el valor mostrado. Toda
 * pantalla muestra siempre el `status`/`estado_cocina` crudo recibido de la
 * API — ningún helper de este módulo produce una etiqueta distinta.
 *
 * Son **dos ejes independientes**: el pedido avanza por facturación
 * (`DiningOrderStatus`) y cada ítem avanza por preparación (`KitchenStatus`).
 */

// ── Pedido (facturación) ───────────────────────────────────────────────────

export const KNOWN_ORDER_STATUSES: readonly DiningOrderStatus[] = [
  'pendiente',
  'entregada',
  'cancelada',
];

/**
 * Valor crudo de `status`, tal cual llega de la API (FR-008). Si no está en
 * `KNOWN_ORDER_STATUSES`, se muestra igual (crudo) y se loguea un error en
 * consola (FR-009) — nunca se sustituye por un estado "por defecto".
 */
export function orderStatusLabel(status: string): string {
  if (!KNOWN_ORDER_STATUSES.includes(status as DiningOrderStatus)) {
    console.error(`[order-status] status de orden no reconocido: ${status}`);
  }
  return status;
}

// `uppercase` es puramente visual (CSS `text-transform`): el texto del nodo
// DOM sigue siendo el valor crudo en minúsculas que devuelve
// `orderStatusLabel` (FR-008/FR-009) -- no se sustituye ni se traduce nada,
// solo se presenta en mayúsculas a pedido del usuario.
const ORDER_STATUS_CLASSES: Record<DiningOrderStatus, string> = {
  pendiente: 'bg-violet-100 text-violet-700 uppercase',
  entregada: 'bg-green-100 text-green-700 uppercase',
  cancelada: 'bg-gray-100 text-gray-500 uppercase',
};

export function orderStatusClass(status: string): string {
  return ORDER_STATUS_CLASSES[status as DiningOrderStatus] ?? 'bg-gray-100 text-gray-500 uppercase';
}

// ── Estado de pago (independiente de status, spec 146 FR-002) ─────────────
//
// A diferencia de `status`/`estado_cocina` (FR-008/FR-009: siempre crudo, sin
// traducir), `payment_status` no es uno de los dos ejes que esa regla cubre
// -- el contrato de la API lo documenta como `UNPAID|PAID|PARTIAL` en inglés,
// pero ningún FR exige mostrarlo tal cual. A pedido del usuario, se traduce a
// una etiqueta corta en español, en mayúsculas.

export const KNOWN_PAYMENT_STATUSES: readonly OrderPaymentStatus[] = ['UNPAID', 'PAID'];

const PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  UNPAID: 'NO PAGADO',
  PAID: 'PAGADO',
};

/**
 * Etiqueta en español del `payment_status`. Un valor no reconocido se
 * muestra crudo (igual criterio que `orderStatusLabel`) y se loguea un error
 * en consola.
 */
export function paymentStatusLabel(paymentStatus: string): string {
  const known = PAYMENT_STATUS_LABELS[paymentStatus as OrderPaymentStatus];
  if (known === undefined) {
    console.error(`[order-status] payment_status no reconocido: ${paymentStatus}`);
    return paymentStatus;
  }
  return known;
}

const PAYMENT_STATUS_CLASSES: Record<OrderPaymentStatus, string> = {
  UNPAID: 'bg-amber-100 text-amber-700',
  PAID: 'bg-green-100 text-green-700',
};

export function paymentStatusClass(paymentStatus: string): string {
  return PAYMENT_STATUS_CLASSES[paymentStatus as OrderPaymentStatus] ?? 'bg-gray-100 text-gray-500';
}

// ── Tipo de orden (cómo se atiende) ───────────────────────────────────────

/**
 * Cómo se atiende el pedido (spec 055, `order_type`). Análogo a `ORDER_STATUS`.
 * Una orden histórica sin clasificar (`order_type` NULL) se muestra como
 * "Sin especificar" y queda fuera al filtrar por un tipo concreto (spec 079,
 * FR-017/FR-018, data-model.md §5) — nunca se rellena.
 */
const ORDER_TYPE: Record<'DINE_IN' | 'TAKEAWAY' | 'DELIVERY', { label: string; classes: string }> = {
  DINE_IN: { label: 'En mesa', classes: 'bg-sky-100 text-sky-700' },
  TAKEAWAY: { label: 'Para llevar', classes: 'bg-teal-100 text-teal-700' },
  DELIVERY: { label: 'Domicilio', classes: 'bg-fuchsia-100 text-fuchsia-700' },
};

export function orderTypeLabel(orderType: string | null | undefined): string {
  if (!orderType) return 'Sin especificar';
  return ORDER_TYPE[orderType as keyof typeof ORDER_TYPE]?.label ?? orderType;
}

export function orderTypeClass(orderType: string | null | undefined): string {
  if (!orderType) return 'bg-gray-100 text-gray-500';
  return ORDER_TYPE[orderType as keyof typeof ORDER_TYPE]?.classes ?? 'bg-gray-100 text-gray-500';
}

/**
 * Código corto de presentación para una orden (spec 120, research.md §3 /
 * data-model.md "Código corto de orden"). El sistema no tiene un número de
 * orden universal: `table_order_number` (spec 087) solo existe para pedidos
 * en mesa, así que este código se deriva del propio `id` (UUID), igual para
 * los 3 tipos de orden. Debe coincidir con el criterio de búsqueda `q` del
 * backend (contracts/orders-list-api.md): buscar el código mostrado debe
 * encontrar la orden.
 */
export function orderDisplayCode(order: Pick<DiningOrder, 'id'>): string {
  return '#' + order.id.replaceAll('-', '').slice(-6).toUpperCase();
}

/**
 * Ubicación a mostrar para una orden (spec 120, data-model.md "Ubicación
 * mostrada"), consistente entre la tarjeta de la lista y el detalle: la mesa
 * cuando existe, `"Mostrador"` para pedidos sin mesa que no son domicilio, y
 * cadena vacía para domicilio (donde el bloque de datos de domicilio ocupa su
 * lugar — FR-013). `tableLabel` ya resuelto por quien llama (p. ej.
 * `TableService`), igual que hoy hace `orders-page.component.ts`.
 */
export function orderLocationLabel(
  order: Pick<DiningOrder, 'dining_table_id' | 'order_type'>,
  tableLabel: string | null,
): string {
  if (order.dining_table_id && tableLabel) return tableLabel;
  if (order.order_type === 'DELIVERY') return '';
  return 'Mostrador';
}

/**
 * Único status realmente terminal (spec 147: ya no existe `'pagada'`, el
 * pago es independiente de `status`). Un pedido "cerrado" (`'entregada'`+
 * `'PAID'`) no es terminal por `status` solo — ver `payment_status` por
 * separado (FR-012).
 */
export const TERMINAL_ORDER_STATUSES: readonly DiningOrderStatus[] = ['cancelada'];

export function isTerminalOrder(status: DiningOrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

// ── Preparación (por ítem) ─────────────────────────────────────────────────

export const KNOWN_KITCHEN_STATUSES: readonly KitchenStatus[] = [
  'pendiente',
  'entregado',
  'cancelado',
];

/** Valor crudo de `estado_cocina`; loguea si no está en `KNOWN_KITCHEN_STATUSES` (FR-009). */
export function kitchenStatusLabel(status: string): string {
  if (!KNOWN_KITCHEN_STATUSES.includes(status as KitchenStatus)) {
    console.error(`[order-status] estado_cocina no reconocido: ${status}`);
  }
  return status;
}

const KITCHEN_STATUS_CLASSES: Record<KitchenStatus, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  entregado: 'bg-green-100 text-green-700',
  cancelado: 'bg-gray-100 text-gray-400',
};

export function kitchenStatusClass(status: string): string {
  return KITCHEN_STATUS_CLASSES[status as KitchenStatus] ?? 'bg-gray-100 text-gray-500';
}

// ── Reglas que la UI necesita (spec 147) ───────────────────────────────────
//
// Con solo 3 estados de ítem, "no terminado" es simplemente `'pendiente'` --
// ya no hace falta un conjunto `KITCHEN_NOT_READY` ni distinguir un paso
// intermedio "aceptado para cocina sin cobrar" (`pedidoAceptadoSinCobrar`,
// retirado junto con `POST /orders/{id}/start-preparation`): la única acción
// es "Entregar" (`POST /orders/{id}/deliver`), de una vez, para todo el
// pedido.

/** ¿Le queda a esta orden algún ítem sin entregar? */
export function hasPendingKitchenWork(order: Pick<DiningOrder, 'items'>): boolean {
  return (order.items ?? []).some((it) => it.estado_cocina === 'pendiente');
}

/**
 * ¿Puede el **comensal** cancelar este pedido?
 *
 * Mismo criterio que aplica el backend (`cart/service.py`, guard de
 * auto-cancelación del comensal): solo si el pedido sigue `'pendiente'` y
 * ningún ítem salió de `'pendiente'` todavía (nada se entregó ni se
 * canceló). En cuanto algo avanza, el insumo ya se consumió (o está a punto
 * de) y la cancelación es pérdida: decisión del personal, no del cliente.
 * La UI replica la regla para ocultar el botón en vez de dejar que el
 * usuario choque con un `409`.
 */
export function puedeCancelarComensal(order: Pick<DiningOrder, 'status' | 'items'>): boolean {
  if (order.status !== 'pendiente') return false;
  const items = order.items ?? [];
  return !items.some((it) => it.estado_cocina !== 'pendiente' && it.estado_cocina !== 'cancelado');
}
