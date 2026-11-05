/**
 * Espejo de `KitchenBoardResponse`/`KitchenCardOut` (spec 151,
 * contracts/kitchen-board.md, contracts/move-kitchen-status.md).
 */

export type KitchenStatus = 'SIN_PREPARAR' | 'EN_PROGRESO' | 'LISTO';

export type KitchenOrigin = 'mesa' | 'caja' | 'domicilio';

export interface KitchenCardAddon {
  readonly name: string | null;
  readonly quantity: number;
}

export interface KitchenCardItem {
  readonly product_name: string;
  readonly quantity: number;
  readonly addons: KitchenCardAddon[];
  readonly notes: string | null;
}

export interface KitchenCard {
  readonly order_id: string;
  readonly table_order_number: number | null;
  readonly kitchen_status: KitchenStatus;
  readonly version: number;
  readonly sent_to_kitchen_at: string;
  readonly origin: KitchenOrigin;
  readonly table_number: number | null;
  readonly customer_name: string | null;
  readonly delivery_address: string | null;
  readonly notes: string | null;
  readonly items: KitchenCardItem[];
}

export interface KitchenBoardResponse {
  readonly sin_preparar: KitchenCard[];
  readonly en_progreso: KitchenCard[];
  readonly listo: KitchenCard[];
}

/** Códigos 409 de `POST /orders/{order_id}/kitchen-status`
 *  (contracts/move-kitchen-status.md §Errores). */
export type KitchenStatusConflictCode =
  | 'NOT_IN_KITCHEN'
  | 'KITCHEN_STATUS_CONFLICT'
  | 'PAYMENT_NOT_PAID'
  | 'ORDER_NOT_ACTIVE';
