import { formatMoney } from '../../shared/money';

/** Espejo de `contracts/notifications-api.md`. */
export interface NotificationItem {
  readonly id: string;
  readonly event_type: string;
  readonly related_entity_type: string;
  readonly related_entity_id: string;
  readonly payload: Record<string, unknown>;
  readonly created_at: string;
  readonly attended_at: string | null;
  readonly attended_by_user_id: string | null;
  /** Texto para la campanita. El backend solo lo manda en el evento SSE
   * (contracts/realtime-events.md); para lo cargado por REST se deriva de
   * `payload` con `summarize()`. */
  readonly summary?: string;
}

export interface NotificationListResponse {
  readonly items: NotificationItem[];
  readonly total: number | null;
  readonly page: number | null;
  readonly size: number | null;
}

/** Mismo criterio que `app/core/notifications/channels/in_app.py::_summary()`
 * — el backend ya lo manda para lo que llega en vivo por SSE; esto solo
 * cubre lo cargado por REST (histórico, recuperación tras reconexión). */
export function summarize(item: NotificationItem): string {
  if (item.summary) return item.summary;
  const p = item.payload ?? {};
  if (item.event_type === 'order.created') {
    const partes: string[] = [];
    if (p['table_number'] != null) partes.push(`Mesa ${p['table_number']}`);
    if (p['items_count'] != null) partes.push(`${p['items_count']} ítem(s)`);
    if (p['total'] != null) partes.push(`$${p['total']}`);
    return partes.length ? partes.join(' · ') : 'Pedido nuevo';
  }
  if (item.event_type === 'payment.completed') {
    return p['total'] != null
      ? `Pago recibido · ${formatMoney(Number(p['total']))}`
      : 'Pago recibido';
  }
  return item.event_type;
}
