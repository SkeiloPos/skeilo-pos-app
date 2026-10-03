// Tipos del lado **staff** del flujo de mesas (tags `orders` + `table-sessions`).
//
// El contrato del comensal (carrito, sesión, pedidos propios) vive en
// `diner.interface.ts`: son rutas públicas con un modelo de auth distinto y no
// deben mezclarse con estas.
//
// Ver `pos-backend/docs/flujo-qr.md`.

// ── Orders (`/orders`) ─────────────────────────────────────────────────────

export type OrderChannel = 'POS' | 'QR_MENU' | 'WHATSAPP' | 'API';

/** Cómo se atiende el pedido (spec 055). */
export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

/**
 * Ciclo de vida del **pedido** (facturación), independiente del de cocina.
 *
 * `recibida` es el pedido que el comensal ya envió pero que el personal aún no
 * ha aceptado: **no ha descontado inventario**. El stock se compromete al
 * confirmar (`recibida` → `abierta`).
 */
export type DiningOrderStatus =
  | 'recibida'
  | 'abierta'
  | 'bloqueada'
  | 'pagada'
  | 'cancelada';

/**
 * Estado de preparación por ítem (`KitchenStatus`), que mueve la terminal de
 * mesas. El backend admite el salto directo `pendiente → listo`.
 */
export type KitchenStatus = 'pendiente' | 'en_preparacion' | 'listo' | 'anulado';

/**
 * Una opción elegida junto con cuántas unidades de ella (spec 065,
 * `OptionSelectionIn`). `quantity` es opcional, default 1.
 */
export interface OrderOptionSelectionPayload {
  option_id: string;
  quantity?: number;
}

/**
 * One line of a `POST /orders` (or `.../tables/{id}/items`) request
 * (`OrderItemIn`). Exactly one of `product_variant_id` / `combo_id` must be
 * set; a combo doesn't accept `options`.
 */
export interface OrderItemPayload {
  product_variant_id?: string;
  combo_id?: string;
  quantity?: number;
  options?: OrderOptionSelectionPayload[];
  notes?: string | null;
}

/** Body for `POST /orders` (`OrderCreate`). */
export interface OrderCreatePayload {
  channel?: OrderChannel;
  order_type?: OrderType;
  dining_session_id?: string | null;
  dining_table_id?: string | null;
  customer_name?: string | null;
  /** Solo aplican con `order_type: 'DELIVERY'` (spec 056). */
  delivery_address?: string | null;
  delivery_phone?: string | null;
  delivery_fee?: number | null;
  notes?: string | null;
  items: OrderItemPayload[];
  /**
   * Solo válido con `channel: 'POS'` (feature 028). El pedido se
   * crea **sin** descontar inventario ni ser visible en cocina — eso solo pasa
   * al llamar `POST /orders/{id}/checkout-and-send`. Así una orden de mostrador
   * que el cajero está armando no golpea cocina antes de estar pagada.
   */
  hold_for_payment?: boolean;
}

/** Selected option on an order item (`OrderItemOptionResponse`). */
export interface DiningOrderItemOption {
  id: string;
  option_id: string;
  quantity: number;
  /**
   * spec 089 (A-94): la opción es un adicional cobrado y consumido una sola vez por línea
   * (no por unidad de producto). Ausente = por unidad (líneas anteriores y de la terminal POS).
   */
  per_line?: boolean;
  /**
   * Nombre de la opción y de su grupo, resueltos por el backend en lectura
   * (spec 087, FR-015/A-89). Respaldo cuando la opción ya no está en el menú
   * vigente; opcionales porque un pedido recién creado puede traerlos en `null`.
   */
  name?: string | null;
  group_name?: string | null;
}

/** One line of an order response (`OrderItemResponse`). Amounts are strings. */
export interface DiningOrderItem {
  id: string;
  product_variant_id: string;
  /**
   * Combo (selección explícita) que originó esta línea. Varias líneas del
   * mismo pedido comparten `combo_id`: son los componentes reales de un
   * mismo combo, cada uno con su propio `product_variant_id` y receta.
   */
  combo_id?: string | null;
  /**
   * Comensal al que se le cobra esta línea. La asignación es **por ítem**, no
   * por pedido: por eso la cuenta dividida es exacta aunque un pedido mezcle
   * personas. `null` = lo añadió el mesero.
   */
  participant_id?: string | null;
  quantity: number;
  unit_price: string;
  /**
   * spec 089 (A-94): adicionales cobrados UNA vez por línea (`unit_price` ya no los incluye en
   * las líneas nuevas del Menú QR). Ausente/`"0"` en toda línea anterior y en las de la terminal
   * POS: su `unit_price` sigue incluyendo los extras por unidad.
   */
  addons_total?: string;
  /** Total de la línea sin descuento: `unit_price × quantity + addons_total`. Ausente en respuestas de un backend anterior. */
  line_total?: string;
  /**
   * Precio/subtotal ya con el mejor descuento vigente aplicado al confirmar,
   * o `null`/ausente si ninguna promoción aplicó a esta línea (o es un
   * combo, que ahorra aparte), o si el pedido es anterior a esta spec.
   */
  discounted_unit_price?: string | null;
  discounted_line_total?: string | null;
  /** Estado de preparación de este ítem. */
  estado_cocina: KitchenStatus;
  /**
   * Versión del evento de tiempo real que emitió esta escritura. Solo lo
   * rellena `PATCH /orders/items/{id}/kitchen`, para que una pantalla que
   * parchee el ítem en local pueda descartar un evento en vuelo que lo
   * revertiría.
   */
  rt_v?: number | null;
  void_de?: string | null;
  notes?: string | null;
  options?: DiningOrderItemOption[];
}

/**
 * spec 089 (A-94): total de lista de una línea de pedido, sin descuento.
 *
 * `line_total` viene del backend; con un backend anterior (sin ese campo) se cae a
 * `unit_price × quantity + addons_total`, que para toda línea histórica (sin `addons_total`) es el
 * `unit_price × quantity` de siempre. **No** usar `unit_price × quantity` suelto: en las líneas
 * nuevas del Menú QR subcobraría los adicionales.
 */
export function lineTotalGross(
  item: Pick<DiningOrderItem, 'unit_price' | 'quantity' | 'addons_total' | 'line_total'>,
): number {
  if (item.line_total != null) return Number(item.line_total);
  return Number(item.unit_price) * item.quantity + Number(item.addons_total ?? 0);
}

/**
 * spec 089: total de la línea tal como se cobra — el `discounted_line_total` que el backend
 * congeló al confirmar (ya incluye los adicionales: una promoción no los descuenta) o, sin
 * descuento, el total de lista de `lineTotalGross`.
 */
export function lineTotal(
  item: Pick<
    DiningOrderItem,
    'unit_price' | 'quantity' | 'addons_total' | 'line_total' | 'discounted_line_total'
  >,
): number {
  return item.discounted_line_total != null
    ? Number(item.discounted_line_total)
    : lineTotalGross(item);
}

/** Body for `PATCH /orders/items/{id}/kitchen` (`KitchenTransitionIn`). */
export interface KitchenTransitionPayload {
  estado_cocina: KitchenStatus;
}

// ── Cobro / cierre (Fase 7) ────────────────────────────────────────────────

/** Una línea de pago (`PaymentIn`). */
export interface PaymentLine {
  payment_method_id: string;
  amount: number;
  reference?: string | null;
}

/** Body for `POST /orders/{id}/pay` (`PayIn`). */
export interface PayInPayload {
  cash_shift_id: string;
  discount: number;
  tax: number;
  tip: number;
  payments: PaymentLine[];
}

/** Body for `POST /orders/{id}/block` (`BlockIn`). */
export interface BlockPayload {
  version: number;
}

/** Body for `POST /orders/items/{id}/void` (`VoidItemIn`). */
export interface VoidItemPayload {
  motivo: string;
}

// ── Pagos (spec 024) ────────────────────────────────────────────────────────

export type PaymentAttemptStatus = 'pendiente' | 'confirmado' | 'rechazado';

/**
 * Resumen del intento de pago vigente de la orden (`current_payment_attempt`
 * en `OrderResponse`). **No** trae `rejection_reason` — eso solo lo expone el
 * historial completo (`PaymentAttemptResponse`, `GET
 * /orders/{id}/payment-attempts`), que es la vista de cajero/back-office.
 */
export interface CurrentPaymentAttemptSummary {
  id: string;
  status: PaymentAttemptStatus;
  payment_method_name: string;
  is_cash: boolean;
  receipt_file_url: string | null;
}

/** Vista de cajero de un intento de pago (`PaymentAttemptResponse`). */
export interface PaymentAttempt {
  id: string;
  order_id: string;
  payment_method_id: string;
  payment_method_name: string;
  is_cash: boolean;
  status: PaymentAttemptStatus;
  amount_received: string | null;
  change_amount: string | null;
  receipt_file_url: string | null;
  rejection_reason: string | null;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  created_at: string;
}

/** Body de `POST /orders/payment-attempts/{id}/reject` (`PaymentAttemptRejectIn`). */
export interface PaymentAttemptRejectPayload {
  reason: string;
}

/** Body de `POST /orders/payment-attempts/{id}/confirm-cash` (`PaymentAttemptConfirmCashIn`). */
export interface PaymentAttemptConfirmCashPayload {
  amount_received: number;
}

/**
 * Una entrada del snapshot de promociones aplicadas (`AppliedPromotionOut`).
 *
 * spec 094 (FR-011): es **una entrada por regla**, no por promoción — el motor
 * guarda una por cada regla que descontó, con su monto agregado. Por eso el
 * servidor agrupa por `promotion_id` antes de elegir la etiqueta de la fila de
 * descuento (research.md D6) y manda el resultado ya resuelto en
 * `OrderBilling.discount_label`. `rule_id` existe en el JSONB y el backend no
 * lo publica.
 */
export interface AppliedPromotion {
  promotion_id?: string | null;
  name?: string | null;
  /** Importe como `string`, igual que el resto de los montos de este archivo. */
  amount: string;
}

/**
 * Desglose económico del pedido, ya resuelto por el servidor (spec 094,
 * FR-024b, `OrderBillingSummary`).
 *
 * La pantalla **pinta lo que recibe**: no elige entre factura y pedido, no suma
 * y no resta (RN-001). `state` dice cuál de los tres casos de facturación es y
 * `source` de dónde salieron los importes (`'factura'` solo con
 * `state === 'factura_propia'`, donde FR-024 manda leer de la venta para que el
 * total sea idéntico al del módulo de Ventas por construcción).
 */
export interface OrderBilling {
  state: 'sin_factura' | 'factura_propia' | 'factura_agrupada';
  source: 'pedido' | 'factura';
  subtotal: string;
  discount: string;
  /** `null`/ausente ⇒ la fila de descuento usa la etiqueta "Descuento" (FR-009). */
  discount_label?: string | null;
  delivery_fee: string;
  total: string;
  promotions?: AppliedPromotion[];
  /** Condición de FR-018, resuelta en el servidor: hay ≥ 1 ítem no anulado y sus
   *  `line_total` suman `0`. Dispara el aviso de falta de detalle de precios. */
  sin_detalle_de_precios: boolean;
}

/** Response of `POST /orders` and `GET /orders` (`OrderResponse`). */
export interface DiningOrder {
  id: string;
  channel: string;
  order_type?: string | null;
  status: DiningOrderStatus;
  version?: number;
  /** Sesión de mesa a la que pertenece (agrupa los pedidos de todos los comensales). */
  table_session_id?: string | null;
  /** Comensal que lo envió; `null` si lo creó el staff. */
  participant_id?: string | null;
  dining_table_id?: string | null;
  customer_name?: string | null;
  /** Solo presentes cuando `order_type === 'DELIVERY'` (spec 056). */
  delivery_address?: string | null;
  delivery_phone?: string | null;
  delivery_fee?: number | null;
  notes?: string | null;
  /** spec 087 (FR-006): número de pedido de mesa, estable dentro del turno de
   *  caja en que se creó. `null` para TAKEAWAY/DELIVERY y para pedidos
   *  anteriores a esta spec. */
  table_order_number?: number | null;
  created_at: string;
  items?: DiningOrderItem[];
  /** `null` si nunca se inició ningún intento de pago (spec 024). */
  current_payment_attempt?: CurrentPaymentAttemptSummary | null;
  /**
   * Computado (spec 029): `true` si ya existe una `Sale` para este pedido —
   * la señal real de "ya está pagado", distinta de `status` (que nunca llega
   * a `'pagada'` en los caminos QR/mostrador vigentes, ver `deriveTableStatus`).
   */
  paid?: boolean;
  /**
   * spec 094 (FR-011): descuento agregado congelado en el pedido. Campo crudo,
   * publicado para otros consumidores — el Detalle de Orden **no lo consume**
   * (research.md D16).
   */
  discount?: string;
  /** spec 094 (FR-011): campo crudo, igual que `discount`. La pantalla no lo lee. */
  applied_promotions?: AppliedPromotion[];
  /**
   * spec 094 (FR-024b): desglose ya resuelto por el servidor. **Solo lo rellena
   * `GET /orders/{id}`**; en el listado llega `null` a propósito (D3).
   *
   * Los tres campos de arriba son **opcionales** para que un frontend nuevo
   * contra un backend anterior compile y funcione: ausente o `null` significa
   * "no pintar el resumen", **nunca** cero (D15). La pantalla lee `billing` y
   * nada más — es su única fuente, para no crear dos fuentes de verdad (D16).
   */
  billing?: OrderBilling | null;
}

// ── Terminal híbrida por origen (feature 028) ──────────────────────────────

/**
 * Qué panel muestra la barra lateral de cobro: `'resumen'` (solo lectura, para
 * pedidos `QR_MENU` — el comensal ya pagó a distancia y el cajero solo valida el
 * comprobante) o `'terminal-pos'` (editable, para pedidos creados/pagados en
 * el mostrador por el cajero, o una mesa libre donde todavía no hay pedido).
 */
export type SidebarMode = 'resumen' | 'terminal-pos';

/**
 * Decide el modo de la barra lateral a partir del pedido activo de la mesa.
 *
 * `null`/`undefined` (mesa libre, sin pedido seleccionado todavía) cae en
 * `'terminal-pos'`: es justo donde se arma un pedido manual nuevo. Un pedido
 * YA PAGADO (`paid`, spec 029) va siempre a `'resumen'` —solo lectura—, sea
 * cual sea su canal: `status` nunca llega a `'pagada'` en los caminos QR ni
 * mostrador (research.md D2), así que sin este chequeo un pedido de
 * mostrador cobrado se quedaba editable para siempre (dividir cuenta,
 * selector de método de pago, "Rechazar pedido" sobre algo ya cobrado).
 */
export function getSidebarMode(order: DiningOrder | null | undefined): SidebarMode {
  if (order?.paid) return 'resumen';
  return order?.channel === 'QR_MENU' ? 'resumen' : 'terminal-pos';
}

/** Body de `POST /orders/{id}/checkout-and-send` (feature 028). Paga un pedido
 *  de mostrador, emite su venta/factura y lo envía a cocina en una sola
 *  llamada atómica. */
export interface CheckoutAndSendPayload {
  /** Backstop de doble clic: el backend rechaza con `409` si ya no coincide. */
  version: number;
  cash_shift_id: string;
  payments: PaymentLine[];
  discount?: number;
  tax?: number;
  tip?: number;
  /** A nombre de quién se factura; por defecto "Consumidor Final". */
  billing_customer_name?: string;
}

/**
 * `CheckoutPreviewResponse` (spec 073, FR-001/FR-004) — desglose autoritativo
 * del cobro de un pedido, calculado por el backend con el mismo motor que emite
 * la venta. **Nunca se recalcula en el navegador** (spec 063, FR-023). Lo
 * devuelven `GET /orders/{id}/checkout-preview` (pedido ya creado) y
 * `POST /orders/draft-preview` (borrador sin guardar). Los decimales llegan como
 * string, igual que en `SessionBill`/`Sale`.
 */
export interface CheckoutPreview {
  subtotal: string;
  /** Descuento automático por promoción, siempre ≥ 0. */
  discount: string;
  /** Valor del domicilio (0 si no es domicilio). El frontend pinta la fila solo si > 0. */
  delivery_fee: string;
  /** `max(0, subtotal − descuento + domicilio)`. */
  total: string;
  /** Instante contra el que se evaluó la vigencia temporal de las promociones. */
  promotion_evaluated_at: string;
}

/** Body de `POST /orders/draft-preview` (spec 073, FR-013). */
export interface DraftPreviewPayload {
  items: OrderItemPayload[];
  /** Solo en borradores de tipo domicilio (FR-003). */
  delivery_fee?: number | null;
}

// ── Sesión de mesa (`/table-sessions`) ─────────────────────────────────────

export type BillingMode = 'unified' | 'split';

/** Un comensal de la mesa (`ParticipantResponse`). */
export interface SessionParticipant {
  id: string;
  display_name: string;
  /** Nombre desambiguado ("Ana (2)"). **Es el que se muestra**, no `display_name`. */
  display_label: string | null;
  status: string;
  joined_at: string;
  expires_at?: string | null;
  closed_at?: string | null;
}

/** Sesión de mesa (`TableSessionResponse`). Una activa por mesa como máximo. */
export interface TableSession {
  id: string;
  dining_table_id: string;
  status: string;
  opened_at: string;
  closed_at?: string | null;
  closed_by_user_name?: string | null;
  billing_mode?: BillingMode | null;
  participants: SessionParticipant[];
}

/** Una línea del desglose de la cuenta (`SessionBillLine`). */
/** Ítem consumido, para el detalle de la cuenta (spec 026, FR-006). */
export interface SessionBillItem {
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
}

export interface SessionBillLine {
  /** `null` = ítems añadidos por el mesero, sin comensal asignado. */
  participant_id: string | null;
  display_label: string | null;
  subtotal: string;
  /** spec 026, FR-006: detalle de ítems y descuento ya aplicado. */
  items: SessionBillItem[];
  discount: string;
}

/** Cuenta de la sesión (`SessionBillResponse`). */
export interface SessionBill {
  table_session_id: string;
  dining_table_id: string;
  total: string;
  order_ids: string[];
  split: SessionBillLine[];
}

/** Pago de un comensal concreto en modo `split` (`SplitPaymentIn`). */
export interface SplitPayment {
  participant_id: string | null;
  payments: PaymentLine[];
  discount?: number;
  tax?: number;
  tip?: number;
}

/** Body de `POST /table-sessions/{id}/close` (`CloseSessionIn`). */
export interface CloseSessionPayload {
  cash_shift_id: string;
  billing_mode: BillingMode;
  /** Solo en `unified`. */
  payments?: PaymentLine[];
  discount?: number;
  tax?: number;
  tip?: number;
  /**
   * Solo en `unified`: a nombre de quién va la factura. Si se omite, el backend
   * usa los comensales de la sesión y, si no hay, la mesa.
   */
  customer_name?: string;
  /** Solo en `split`: uno por **cada** comensal con consumo. */
  splits?: SplitPayment[];
}

/** Respuesta del cierre (`CloseSessionResponse`). */
export interface CloseSessionResponse {
  table_session: TableSession;
  /** Una venta en `unified`, una por comensal en `split`. */
  sale_ids: string[];
}
