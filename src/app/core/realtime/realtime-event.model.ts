/**
 * Catálogo de eventos de tiempo real. Espejo de `app/core/events.py`.
 *
 * Los eventos son **delgados**: llevan ids y lo que cambió, no el objeto
 * completo. El cliente decide si le basta el evento o necesita re-consultar por
 * REST; Postgres sigue siendo la fuente de verdad y esto es una notificación.
 */

/** Versión monótona del evento, derivada del id del stream en el servidor. */
export interface RealtimeBase {
  readonly v: number;
  readonly at: string;
}

export interface OrderCreatedEvent extends RealtimeBase {
  readonly type: 'order.created';
  readonly order_id: string;
  readonly table_session_id: string | null;
  readonly dining_table_id: string | null;
  readonly table_number: number | null;
  readonly customer_name: string | null;
  readonly items_count: number;
  readonly total: string;
}

export interface OrderConfirmedEvent extends RealtimeBase {
  readonly type: 'order.confirmed';
  readonly order_id: string;
  readonly table_session_id: string | null;
  readonly status: string;
}

export interface ItemKitchenChangedEvent extends RealtimeBase {
  readonly type: 'order.item_kitchen_changed';
  readonly order_id: string;
  readonly table_session_id: string | null;
  readonly item_id: string;
  readonly estado_cocina: string;
}

/** spec 123: se agregó una adición a una línea ya persistida -- distinto de
 *  `ItemKitchenChangedEvent`: no cambia `estado_cocina`. */
export interface ItemAddonAddedEvent extends RealtimeBase {
  readonly type: 'order.item_addon_added';
  readonly order_id: string;
  readonly table_session_id: string | null;
  readonly item_id: string;
  readonly option_name: string | null;
  readonly quantity: number;
}

export interface ItemVoidedEvent extends RealtimeBase {
  readonly type: 'order.item_voided';
  readonly order_id: string;
  readonly table_session_id: string | null;
  readonly item_id: string;
  readonly motivo: string | null;
  readonly replacement_item_id: string | null;
}

export interface OrderCancelledEvent extends RealtimeBase {
  readonly type: 'order.cancelled';
  readonly order_id: string;
  readonly table_session_id: string | null;
  readonly motivo: string | null;
}

/**
 * La cuenta de la mesa dejó de estar al día.
 *
 * **Sin `total` a propósito**: el cliente no debe recargar la cuenta al
 * recibirlo, solo marcarla obsoleta. Ver `PosTerminalStore.billStale`.
 */
export interface BillChangedEvent extends RealtimeBase {
  readonly type: 'session.bill_changed';
  readonly table_session_id: string;
}

export interface PaymentCompletedEvent extends RealtimeBase {
  readonly type: 'payment.completed';
  readonly sale_id: string;
  readonly table_session_id: string | null;
  readonly total: string;
  readonly customer_name: string | null;
  readonly billing_mode: string;
  readonly invoice: { prefix: string; number: number } | null;
}

export interface SessionClosedEvent extends RealtimeBase {
  readonly type: 'session.closed';
  readonly table_session_id: string;
  readonly dining_table_id: string | null;
  /** paid | swept | released */
  readonly reason: string;
}

export interface TableStatusChangedEvent extends RealtimeBase {
  readonly type: 'table.status_changed';
  readonly dining_table_id: string;
  readonly table_number: number | null;
  readonly status: string;
}

/**
 * Spec 077: el centro de notificaciones se suscribe **solo** a este tipo
 * genérico, no a `order.created`/`payment.completed` directamente — esos
 * siguen siendo consumidos como hoy por quien ya los usa (p. ej.
 * `pos-terminal.store.ts`). `summary` ya viene formateado para el toast/campanita
 * (contracts/realtime-events.md).
 */
export interface NotificationCreatedEvent extends RealtimeBase {
  readonly type: 'notification.created';
  readonly notification_id: string;
  readonly event_type: string;
  readonly related_entity_type: string;
  readonly related_entity_id: string;
  readonly summary: string;
}

export type RealtimeEvent =
  | OrderCreatedEvent
  | OrderConfirmedEvent
  | ItemKitchenChangedEvent
  | ItemAddonAddedEvent
  | ItemVoidedEvent
  | OrderCancelledEvent
  | BillChangedEvent
  | PaymentCompletedEvent
  | SessionClosedEvent
  | TableStatusChangedEvent
  | NotificationCreatedEvent;

export type RealtimeEventType = RealtimeEvent['type'];

/**
 * Eventos de control, fuera del catálogo de negocio.
 *
 * - `resync`: hay un hueco (o al cliente se le llenó la cola). Hay que recargar
 *   por REST; no se puede reconstruir el estado con eventos.
 * - `reconnected`: el stream volvió tras una caída. Los consumidores recargan.
 */
export type RealtimeControlType = 'resync' | 'reconnected';

export type RealtimeStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';
