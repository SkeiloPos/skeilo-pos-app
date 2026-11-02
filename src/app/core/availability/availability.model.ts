/**
 * Formas de datos del motor de disponibilidad en tiempo real (spec 148).
 * Espejo de `contracts/availability-event.md` y `contracts/availability-snapshot-api.md`.
 */

export type AvailabilityKind = 'product' | 'variant' | 'option';

/**
 * Estado absoluto de un elemento tras un cambio. Nunca es un delta: aplicar el
 * mismo cambio dos veces es inocuo (research.md D9).
 */
export interface AvailabilityChange {
  readonly kind: AvailabilityKind;
  readonly id: string;
  /** Solo para `kind: 'variant'`: evita al cliente buscar el producto padre. */
  readonly product_id?: string;
  /** Solo para `kind: 'product'`: marca manual (`not Product.available`). */
  readonly sold_out?: boolean;
  /** Pedible por stock. Presente en los tres `kind`. */
  readonly available: boolean;
}

export interface AvailabilityProductState {
  readonly id: string;
  readonly sold_out: boolean;
  readonly available: boolean;
}

export interface AvailabilityVariantState {
  readonly id: string;
  readonly product_id: string;
  readonly available: boolean;
}

export interface AvailabilityOptionState {
  readonly id: string;
  readonly available: boolean;
}

/** `GET /menu/availability` y `GET /menu/qr-token/{token}/availability`. */
export interface AvailabilitySnapshot {
  readonly as_of: number | null;
  readonly products: readonly AvailabilityProductState[];
  readonly variants: readonly AvailabilityVariantState[];
  readonly options: readonly AvailabilityOptionState[];
}

/** Un elemento agotado dentro de un 409 unificado (`contracts/sold-out-conflict.md`). */
export interface SoldOutItem {
  readonly id: string;
  readonly tipo: 'producto' | 'presentacion' | 'opcion';
  readonly nombre: string;
  readonly producto_id: string;
  readonly motivo: 'manual' | 'inventario' | 'cantidad';
}

/** `detail` del 409 unificado por agotado. */
export interface SoldOutConflict {
  readonly error: string;
  readonly productos_agotados: readonly string[];
  readonly agotados: readonly SoldOutItem[];
}
