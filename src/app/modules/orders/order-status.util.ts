import {
  DiningOrder,
  DiningOrderStatus,
  KitchenStatus,
} from '../tables/interfaces/dining.interface';

/**
 * Fuente única de los estados del flujo de mesas y de cómo se pintan.
 *
 * Son **dos ejes independientes**: el pedido avanza por facturación
 * (`DiningOrderStatus`) y cada ítem avanza por preparación (`KitchenStatus`).
 * La UI necesita los dos para decidir qué se puede hacer.
 */

// ── Pedido (facturación) ───────────────────────────────────────────────────

const ORDER_STATUS: Record<DiningOrderStatus, { label: string; classes: string }> = {
  // Enviado por el comensal, pendiente de que el personal lo acepte.
  // No ha descontado inventario.
  recibida: { label: 'Por confirmar', classes: 'bg-violet-100 text-violet-700' },
  abierta: { label: 'Abierta', classes: 'bg-amber-100 text-amber-700' },
  bloqueada: { label: 'Bloqueada', classes: 'bg-orange-100 text-orange-700' },
  pagada: { label: 'Pagada', classes: 'bg-green-100 text-green-700' },
  cancelada: { label: 'Cancelada', classes: 'bg-gray-100 text-gray-500' },
};

export function orderStatusLabel(status: DiningOrderStatus): string {
  return ORDER_STATUS[status]?.label ?? status;
}

export function orderStatusClass(status: DiningOrderStatus): string {
  return ORDER_STATUS[status]?.classes ?? 'bg-gray-100 text-gray-500';
}

/**
 * Estado a mostrar: si ya existe una `Sale` (`paid`), se ve como "Pagada"
 * incluso para pedidos históricos (creados antes de spec 035) cuyo `status`
 * crudo se haya quedado en `'abierta'`/`'bloqueada'` — spec 029, research.md
 * D2. Desde spec 035 (A-52) los caminos QR/mostrador vigentes sí dejan
 * `status = 'pagada'` en cuanto se cobran, así que ambas señales ya
 * coinciden para pedidos nuevos; esta función sigue prefiriendo `paid` por
 * si acaso divergen. Una orden cancelada se muestra cancelada aunque `paid`
 * fuera `true`.
 */
export function displayOrderStatus(
  order: Pick<DiningOrder, 'status' | 'paid'>,
): DiningOrderStatus {
  if (order.status === 'cancelada') return 'cancelada';
  return order.paid ? 'pagada' : order.status;
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

/** Estados en los que el pedido ya no admite cambios. */
export const TERMINAL_ORDER_STATUSES: readonly DiningOrderStatus[] = ['pagada', 'cancelada'];

export function isTerminalOrder(status: DiningOrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}

// ── Preparación (por ítem) ─────────────────────────────────────────────────

const KITCHEN_STATUS: Record<KitchenStatus, { label: string; classes: string }> = {
  pendiente: { label: 'Pendiente', classes: 'bg-amber-100 text-amber-700' },
  en_preparacion: { label: 'En preparación', classes: 'bg-blue-100 text-blue-700' },
  listo: { label: 'Listo', classes: 'bg-green-100 text-green-700' },
  anulado: { label: 'Anulado', classes: 'bg-gray-100 text-gray-400' },
};

export function kitchenStatusLabel(status: KitchenStatus): string {
  return KITCHEN_STATUS[status]?.label ?? status;
}

export function kitchenStatusClass(status: KitchenStatus): string {
  return KITCHEN_STATUS[status]?.classes ?? 'bg-gray-100 text-gray-500';
}

/** Estados que impiden bloquear/cobrar: la comida aún está en curso. */
export const KITCHEN_NOT_READY: readonly KitchenStatus[] = ['pendiente', 'en_preparacion'];

// ── Reglas que la UI necesita ──────────────────────────────────────────────

/** Un pedido `recibida` espera que el personal lo acepte para entrar a cocina. */
export function esperaConfirmacion(order: Pick<DiningOrder, 'status'>): boolean {
  return order.status === 'recibida';
}

/**
 * ¿Puede el **comensal** cancelar este pedido?
 *
 * Solo si nada se ha empezado a preparar: en `recibida` (nunca tocó inventario)
 * o en `abierta` con todos sus ítems aún `pendiente`. En cuanto cocina arranca,
 * el insumo ya se consumió y la cancelación es pérdida — decisión del personal,
 * no del cliente.
 *
 * Es la misma regla que aplica el backend; la UI la replica para ocultar el
 * botón en vez de dejar que el usuario choque con un `409`.
 */
export function puedeCancelarComensal(order: Pick<DiningOrder, 'status' | 'items'>): boolean {
  if (order.status === 'recibida') return true;
  if (order.status !== 'abierta') return false;
  const items = order.items ?? [];
  return items.every((it) => it.estado_cocina === 'pendiente' || it.estado_cocina === 'anulado');
}

/**
 * ¿Le queda a esta orden algún ítem sin terminar de preparar? (spec 035,
 * A-52 de `registro-de-anomalias.md`). Desde esa spec, `checkout_and_send`/
 * `approve_payment_attempt`/`confirm_cash_payment_attempt` dejan la orden en
 * `'pagada'` en cuanto se cobra — antes de eso, `status` bastaba para saber
 * si una mesa seguía ocupada; ahora una orden `'pagada'` todavía puede tener
 * comida en preparación (se cobra antes de enviar a cocina, spec 028), así
 * que quien necesite saber si la mesa "todavía tiene algo pendiente" debe
 * mirar esto, no solo `status !== 'pagada'`.
 */
export function hasPendingKitchenWork(order: Pick<DiningOrder, 'items'>): boolean {
  return (order.items ?? []).some((it) => KITCHEN_NOT_READY.includes(it.estado_cocina));
}
