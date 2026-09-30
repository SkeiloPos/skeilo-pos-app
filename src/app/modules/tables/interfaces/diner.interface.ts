// Contrato público del comensal (rutas `/cart` y `/menu/qr-token`).
//
// El comensal es anónimo: no hay login. Su identidad viaja firmada en el
// `session_token` que devuelve `POST /cart/sessions` y que se envía en la
// cabecera `x-session-token`. `display_name` es solo texto que el comensal
// escribe — NO identifica a nadie y no es único dentro de la mesa.
//
// Ver `pos-backend/docs/flujo-qr.md`.

/** Mesa resuelta desde el QR firmado (`SessionTableInfo`). */
export interface DinerTable {
  id: string;
  number: number;
  name: string | null;
}

/** Body de `POST /cart/sessions` (`SessionOpenIn`). */
export interface SessionOpenPayload {
  /** Token **firmado** de la mesa (JWT), no el UUID de `dining_tables.qr_token`. */
  qr_token: string;
  display_name: string;
}

/** Respuesta de `POST /cart/sessions` (`SessionOpenResponse`). */
export interface SessionOpenResponse {
  participant_id: string;
  table_session_id: string;
  display_name: string;
  /**
   * Nombre ya desambiguado que ven cocina y staff ("Ana (2)" si ya había una
   * Ana en la mesa). **Es el que se muestra en la UI**, no `display_name`.
   */
  display_label: string | null;
  expires_at: string | null;
  table: DinerTable;
  cart_id: string;
  /** Se envía en `x-session-token` en toda operación del comensal. */
  session_token: string;
}

// ── Carrito borrador (vive en el backend) ──────────────────────────────────

/**
 * Una opción elegida junto con cuántas unidades de ella (spec 065,
 * `OptionSelectionIn`). `quantity` es opcional, default 1 -- el mismo
 * significado que "incluir este id" tenía antes de esa spec.
 */
export interface OptionSelectionPayload {
  option_id: string;
  quantity?: number;
}

/** Body de `POST /cart/items` (`CartItemIn`). */
export interface CartItemPayload {
  product_variant_id: string;
  quantity?: number;
  options?: OptionSelectionPayload[];
  notes?: string | null;
}

/** Body de `PATCH /cart/items/{id}` (`CartItemUpdate`). */
export interface CartItemUpdatePayload {
  quantity?: number;
  options?: OptionSelectionPayload[];
  notes?: string | null;
}

/** Opción elegida en una línea del carrito (`CartItemOptionResponse`). */
export interface CartItemOption {
  id: string;
  option_id: string;
  quantity: number;
  /** spec 089 (A-94): adicional cobrado y consumido una vez por línea. */
  per_line?: boolean;
}

/** Una línea del carrito (`CartItemResponse`). Los importes llegan como string. */
export interface CartItemResponse {
  id: string;
  product_variant_id: string;
  quantity: number;
  /** Precio de UNA unidad de producto; desde la spec 089 no incluye los adicionales de las líneas nuevas. */
  unit_price: string;
  /** spec 089 (A-94): adicionales cobrados una vez por línea (`"0"` en líneas históricas). */
  addons_total?: string;
  /** `unit_price × quantity + addons_total`. */
  line_total: string;
  /**
   * Precio/subtotal ya con el mejor descuento vigente aplicado, o `null`/ausente
   * si ninguna promoción aplica a esta línea (o es un combo, que ahorra aparte).
   */
  discounted_unit_price?: string | null;
  discounted_line_total?: string | null;
  notes: string | null;
  options: CartItemOption[];
}

/** Carrito completo (`CartResponse`). Toda mutación devuelve este objeto entero. */
export interface CartResponse {
  id: string;
  participant_id: string;
  display_name: string;
  /**
   * Nombre desambiguado del comensal ("Ana (2)"). **Es el que se muestra en la
   * UI**, y llega aquí porque el `session_token` no lleva el nombre: al recargar
   * el menú, `GET /cart` es lo que permite repintar el saludo.
   */
  display_label: string | null;
  status: string;
  total: string;
  /** Suma de las líneas ya con su descuento aplicado, o `null`/ausente si ninguna. */
  discounted_total?: string | null;
  items: CartItemResponse[];
}

// ── Pedidos del comensal ───────────────────────────────────────────────────

// `POST /cart/submit`, `GET /cart/orders` y `POST /cart/orders/{id}/cancel`
// devuelven el mismo `OrderResponse` que el lado staff, así que se reutiliza
// `DiningOrder` en vez de mantener un tipo paralelo que se desincronizaría.

/** Body de `POST /cart/orders/{id}/cancel` (`MyOrderCancelIn`). */
export interface MyOrderCancelPayload {
  motivo: string;
}

// ── Pagos del comensal (spec 024) ──────────────────────────────────────────

/**
 * Metadata de formato de una clave de `payment_info` (`PaymentMethodFieldDefinition`,
 * spec 032/034) — le dice al frontend si `codigo_qr` es una imagen o
 * `numero_celular` es texto, en vez de adivinarlo (contracts/cart-payment-methods.md).
 */
export interface PaymentMethodField {
  key: string;
  label?: string;
  required?: boolean;
  format: 'text' | 'numeric' | 'image';
  length?: number | null;
}

/** Método de pago activo del tenant, tal como lo ve el comensal (`DinerPaymentMethod`). */
export interface DinerPaymentMethod {
  id: string;
  name: string;
  type: string;
  is_cash: boolean;
  payment_info: Record<string, string> | null;
  /** Spec 034 (US3): cómo renderizar cada clave de `payment_info` — `format: 'image'` → `<img>`. */
  fields: PaymentMethodField[];
}

/** Body de `POST /cart/orders/{id}/payment-attempts` (`PaymentAttemptCreateIn`). */
export interface PaymentAttemptCreatePayload {
  payment_method_id: string;
}

/** Intento de pago tal como lo ve el comensal — **nunca** trae el motivo de
 *  un rechazo (`DinerPaymentAttempt`). */
export interface DinerPaymentAttempt {
  id: string;
  order_id: string;
  payment_method_id: string;
  status: 'pendiente' | 'confirmado' | 'rechazado';
  receipt_file_url: string | null;
  created_at: string;
}

/** Body de `POST /cart/payment-attempts/{id}/receipt/presign` (`ReceiptPresignIn`). */
export interface ReceiptPresignPayload {
  content_type: string;
}

/** Response del presign (`ReceiptPresignOut`). */
export interface ReceiptPresignResponse {
  upload_url: string;
  key: string;
  public_url: string;
  expires_in: number;
}

/** Body de `POST /cart/payment-attempts/{id}/receipt` (`ReceiptAttachIn`). */
export interface ReceiptAttachPayload {
  file_url: string;
}

// ── Revisión y pago antes de enviar (spec 025) ─────────────────────────────

/**
 * Body de `POST /cart/submit` (`SubmitCartIn`). El pedido nace junto con su
 * primer intento de pago: `receipt_file_url` es obligatorio salvo que el
 * método sea efectivo (`is_cash`).
 */
export interface SubmitCartPayload {
  payment_method_id: string;
  receipt_file_url?: string | null;
}

// ── Errores tipados que la UI debe distinguir ──────────────────────────────

/**
 * `detail` del `409` de `POST /cart/items`: el chequeo preventivo de stock.
 *
 * Ojo: en `POST /orders/{id}/confirm` (staff) el mismo problema llega como
 * **cadena**, no como objeto. No son intercambiables.
 */
export interface StockConflictDetail {
  error: string;
  insumo: string;
  disponible: string;
  requerido: string;
  contexto: string;
}
